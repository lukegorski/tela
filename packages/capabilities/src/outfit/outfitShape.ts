import { z } from 'zod';
import { and, eq, desc, inArray } from 'drizzle-orm';
import {
  getDb,
  outfits,
  outfitItems,
  closetItems,
  itemPhotos,
  contexts,
  tryOnJobs,
  type TryOnStatus,
  type TryOnStep,
} from '@tela/db';
import {
  getSupabaseAdmin,
  ITEM_PHOTOS_BUCKET,
  TRY_ON_BUCKET,
} from '../storage/supabase.js';

const SIGNED_URL_TTL_SECONDS = 600;

/**
 * The shape of a single piece inside a rich outfit. Mirrors enough of
 * `RichItem` (wardrobe/itemShape.ts) for the UI to render an item-grid
 * fallback, color filter chips, and the pieces sheet without a second
 * round-trip.
 */
export const richOutfitItemSchema = z.object({
  closetItemId: z.string().uuid(),
  role: z.string(),
  category: z.string(),
  subcategory: z.string().nullable(),
  primaryColor: z.string(),
  secondaryColor: z.string().nullable(),
  backgroundColor: z.string().nullable(),
  imageUrl: z.string().nullable(),
  originalImageUrl: z.string().nullable(),
});

/**
 * Latest try-on job for an outfit. Null when no job has ever been started.
 * `status` follows the four-state machine: pending → running → complete |
 * failed.
 */
export const richOutfitTryOnSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(['pending', 'running', 'complete', 'failed']),
  resultUrl: z.string().nullable(),
  costCents: z.number(),
  error: z.string().nullable(),
  asyncStep: z.enum(['bottoms', 'top', 'outerwear', 'dress']).nullable(),
  model: z.string().nullable(),
});

/**
 * The rich shape returned by `outfit.list`, `outfit.get`, `outfit.save`,
 * `outfit.setFeedback`. One adapter, used everywhere — D.6 lesson #12.
 *
 * Flat (no nested `analysis.X`), ISO-string timestamps, signed image URLs,
 * try-on state collapsed into a single nullable nested object.
 */
export const richOutfitSchema = z.object({
  id: z.string().uuid(),
  generationId: z.string().uuid(),
  contextId: z.string().uuid(),
  rationale: z.string(),
  name: z.string().nullable(),
  wardrobeAssessment: z.string().nullable(),
  pairingKey: z.string(),
  occasion: z.string(),
  season: z.string(),
  saved: z.boolean(),
  savedAt: z.string().nullable(),
  feedback: z.enum(['up', 'down']).nullable(),
  wornAt: z.string().nullable(),
  createdAt: z.string(),
  items: z.array(richOutfitItemSchema),
  tryOn: richOutfitTryOnSchema.nullable(),
});

export type RichOutfitItem = z.infer<typeof richOutfitItemSchema>;
export type RichOutfitTryOn = z.infer<typeof richOutfitTryOnSchema>;
export type RichOutfit = z.infer<typeof richOutfitSchema>;

interface OutfitRow {
  id: string;
  generationId: string;
  contextId: string;
  rationale: string;
  name: string | null;
  wardrobeAssessment: string | null;
  pairingKey: string;
  saved: boolean;
  savedAt: Date | null;
  feedback: string | null;
  wornAt: Date | null;
  createdAt: Date;
  occasion: string;
  season: string;
}

interface ItemRow {
  outfitId: string;
  closetItemId: string;
  role: string;
  category: string;
  subcategory: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  closetItemBackgroundColor: string | null;
  photoBackgroundColor: string | null;
  originalStoragePath: string;
  enhancedStoragePath: string | null;
}

interface TryOnRow {
  id: string;
  outfitId: string;
  status: TryOnStatus;
  modelImageUrl: string;
  asyncStep: TryOnStep | null;
  resultStoragePath: string | null;
  costCents: number;
  error: string | null;
  createdAt: Date;
}

/**
 * Fetch one or many outfits joined with their items, photos, context, and
 * latest try-on job — all signed URLs minted in one pass.
 *
 * Ordered newest-first. Pass `outfitId` for a single fetch, `savedOnly` for
 * lookbook, or neither for the full list.
 */
export async function fetchRichOutfits(opts: {
  userId: string;
  outfitId?: string;
  savedOnly?: boolean;
  orderBy?: 'createdAt' | 'savedAt' | 'wornAt';
  limit?: number;
  offset?: number;
}): Promise<RichOutfit[]> {
  const db = getDb();

  // ─── Outfits + context (single join) ───
  const conditions = [eq(outfits.userId, opts.userId)];
  if (opts.outfitId) conditions.push(eq(outfits.id, opts.outfitId));
  if (opts.savedOnly) conditions.push(eq(outfits.saved, true));

  const outfitQuery = db
    .select({
      id: outfits.id,
      generationId: outfits.generationId,
      contextId: outfits.contextId,
      rationale: outfits.rationale,
      name: outfits.name,
      wardrobeAssessment: outfits.wardrobeAssessment,
      pairingKey: outfits.pairingKey,
      saved: outfits.saved,
      savedAt: outfits.savedAt,
      feedback: outfits.feedback,
      wornAt: outfits.wornAt,
      createdAt: outfits.createdAt,
      occasion: contexts.occasion,
      season: contexts.season,
    })
    .from(outfits)
    .innerJoin(contexts, eq(contexts.id, outfits.contextId))
    .where(and(...conditions))
    .orderBy(desc(outfits[opts.orderBy ?? 'createdAt']));

  const outfitRows = (
    opts.limit !== undefined
      ? await outfitQuery.limit(opts.limit).offset(opts.offset ?? 0)
      : await outfitQuery
  ) as OutfitRow[];

  if (outfitRows.length === 0) return [];

  const outfitIds = outfitRows.map((o) => o.id);

  // ─── Items (one query for all outfits) ───
  const itemRows = (await db
    .select({
      outfitId: outfitItems.outfitId,
      closetItemId: outfitItems.closetItemId,
      role: outfitItems.role,
      category: closetItems.category,
      subcategory: closetItems.subcategory,
      primaryColor: closetItems.primaryColor,
      secondaryColor: closetItems.secondaryColor,
      closetItemBackgroundColor: closetItems.backgroundColor,
      photoBackgroundColor: itemPhotos.backgroundColor,
      originalStoragePath: itemPhotos.storagePath,
      enhancedStoragePath: itemPhotos.enhancedStoragePath,
    })
    .from(outfitItems)
    .innerJoin(closetItems, eq(closetItems.id, outfitItems.closetItemId))
    .innerJoin(itemPhotos, eq(itemPhotos.id, closetItems.photoId))
    .where(inArray(outfitItems.outfitId, outfitIds))) as ItemRow[];

  // ─── Latest try-on per outfit ───
  // We grab all rows for these outfits then keep the newest per outfit in JS;
  // simpler than DISTINCT ON for our small N.
  const allTryOnRows = (await db
    .select({
      id: tryOnJobs.id,
      outfitId: tryOnJobs.outfitId,
      status: tryOnJobs.status,
      modelImageUrl: tryOnJobs.modelImageUrl,
      asyncStep: tryOnJobs.asyncStep,
      resultStoragePath: tryOnJobs.resultStoragePath,
      costCents: tryOnJobs.costCents,
      error: tryOnJobs.error,
      createdAt: tryOnJobs.createdAt,
    })
    .from(tryOnJobs)
    .where(inArray(tryOnJobs.outfitId, outfitIds))
    .orderBy(desc(tryOnJobs.createdAt))) as TryOnRow[];

  const latestTryOnByOutfit = new Map<string, TryOnRow>();
  for (const row of allTryOnRows) {
    if (!latestTryOnByOutfit.has(row.outfitId)) {
      latestTryOnByOutfit.set(row.outfitId, row);
    }
  }

  // ─── Sign URLs (parallel — one Supabase admin client) ───
  const supabase = getSupabaseAdmin();

  const signedItemUrls = await Promise.all(
    itemRows.map(async (row) => {
      const displayPath = row.enhancedStoragePath ?? row.originalStoragePath;
      const [displaySigned, originalSigned] = await Promise.all([
        supabase.storage
          .from(ITEM_PHOTOS_BUCKET)
          .createSignedUrl(displayPath, SIGNED_URL_TTL_SECONDS),
        row.enhancedStoragePath
          ? supabase.storage
              .from(ITEM_PHOTOS_BUCKET)
              .createSignedUrl(row.originalStoragePath, SIGNED_URL_TTL_SECONDS)
          : Promise.resolve({ data: { signedUrl: null }, error: null } as const),
      ]);
      return {
        outfitId: row.outfitId,
        item: {
          closetItemId: row.closetItemId,
          role: row.role,
          category: row.category,
          subcategory: row.subcategory,
          primaryColor: row.primaryColor,
          secondaryColor: row.secondaryColor,
          backgroundColor: row.closetItemBackgroundColor ?? row.photoBackgroundColor,
          imageUrl: displaySigned.data?.signedUrl ?? null,
          originalImageUrl:
            originalSigned.data?.signedUrl ?? displaySigned.data?.signedUrl ?? null,
        } satisfies RichOutfitItem,
      };
    }),
  );

  const itemsByOutfit = new Map<string, RichOutfitItem[]>();
  for (const { outfitId, item } of signedItemUrls) {
    const list = itemsByOutfit.get(outfitId);
    if (list) list.push(item);
    else itemsByOutfit.set(outfitId, [item]);
  }

  const signedTryOns = new Map<string, RichOutfitTryOn>();
  await Promise.all(
    Array.from(latestTryOnByOutfit.entries()).map(async ([outfitId, row]) => {
      let resultUrl: string | null = null;
      if (row.status === 'complete' && row.resultStoragePath) {
        const { data } = await supabase.storage
          .from(TRY_ON_BUCKET)
          .createSignedUrl(row.resultStoragePath, SIGNED_URL_TTL_SECONDS);
        resultUrl = data?.signedUrl ?? null;
      }
      signedTryOns.set(outfitId, {
        jobId: row.id,
        status: row.status,
        resultUrl,
        costCents: row.costCents,
        error: row.error,
        asyncStep: row.asyncStep,
        model: row.modelImageUrl,
      });
    }),
  );

  // ─── Assemble ───
  return outfitRows.map((row) => ({
    id: row.id,
    generationId: row.generationId,
    contextId: row.contextId,
    rationale: row.rationale,
    name: row.name,
    wardrobeAssessment: row.wardrobeAssessment,
    pairingKey: row.pairingKey,
    occasion: row.occasion,
    season: row.season,
    saved: row.saved,
    savedAt: row.savedAt?.toISOString() ?? null,
    feedback: (row.feedback === 'up' || row.feedback === 'down' ? row.feedback : null) as
      | 'up'
      | 'down'
      | null,
    wornAt: row.wornAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    items: itemsByOutfit.get(row.id) ?? [],
    tryOn: signedTryOns.get(row.id) ?? null,
  }));
}
