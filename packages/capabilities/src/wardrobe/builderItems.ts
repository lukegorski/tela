import { z } from 'zod';
import { and, eq, inArray, or } from 'drizzle-orm';
import { getDb, closetItems, itemPhotos, outfitDrafts } from '@tela/db';
import { logEvent } from '@tela/events';
import { getQueue, JOB_NAMES } from '@tela/queue';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import { getSupabaseAdmin, ITEM_PHOTOS_BUCKET } from '../storage/supabase.js';

const BUILDER_CATEGORIES = ['top', 'bottom', 'outerwear', 'shoes', 'dress'] as const;
const SIGNED_URL_TTL_SECONDS = 3600;

const input = z.object({});

const trimSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  imgW: z.number(),
  imgH: z.number(),
});

const output = z.object({
  items: z.array(
    z.object({
      itemId: z.string().uuid(),
      role: z.enum(BUILDER_CATEGORIES),
      subcategory: z.string().nullable(),
      primaryColor: z.string(),
      fit: z.string().nullable(),
      presentation: z.string().nullable(),
      /** Signed URL of the transparent cutout; null while pending. */
      cutoutUrl: z.string().nullable(),
      /** Placement bbox for the recipe; null while cutout pending. */
      trim: trimSchema.nullable(),
      /** Signed URL of the enhanced JPEG — the degraded-but-usable fallback. */
      fallbackUrl: z.string().nullable(),
    }),
  ),
  /** The user's single active draft, verbatim; null if none. */
  draftSlots: z.record(z.string(), z.unknown()).nullable(),
  /** True when every eligible item has a cutout. */
  cutoutsReady: z.boolean(),
  /** Items hidden from the builder because their photo is folded (spec #12) — never removed from the closet. */
  excludedFolded: z.number().int().min(0),
});

/**
 * Everything the builder canvas needs in ONE call (spec §3):
 * eligible items (folded excluded per #12) with signed cutout/fallback
 * URLs + placement trims, the restored draft, and readiness. Also the
 * LAZY CUTOUT TRIGGER (spec §4): items missing cutouts get enqueued here,
 * fail-open — this call is the "first builder-open" moment.
 */
export const builderItems = registerCapability({
  name: 'wardrobe.builderItems',
  description:
    "List the caller's builder-eligible wardrobe items (folded photos excluded) with signed cutout + fallback image URLs and placement boxes, plus their saved builder draft. Enqueues cutout generation for items that still need one.",
  input,
  output,

  async execute() {
    const { userId, source } = getRequestContext();
    const db = getDb();

    const rows = await db
      .select({
        itemId: closetItems.id,
        category: closetItems.category,
        subcategory: closetItems.subcategory,
        primaryColor: closetItems.primaryColor,
        fit: closetItems.fit,
        presentation: closetItems.presentation,
        photoId: itemPhotos.id,
        enhancedStoragePath: itemPhotos.enhancedStoragePath,
        cutoutStoragePath: itemPhotos.cutoutStoragePath,
        cutoutTrim: itemPhotos.cutoutTrim,
        originalStoragePath: itemPhotos.storagePath,
      })
      .from(closetItems)
      .innerJoin(
        itemPhotos,
        or(eq(itemPhotos.id, closetItems.photoId), eq(itemPhotos.id, closetItems.enhancedPhotoId)),
      )
      .where(
        and(
          eq(closetItems.userId, userId),
          inArray(closetItems.category, [...BUILDER_CATEGORIES]),
        ),
      );

    // Folded items never enter the builder (spec #12). Dedupe items that
    // joined against both their original and enhanced photo rows,
    // preferring the row that carries the enhanced image.
    const byItem = new Map<string, (typeof rows)[number]>();
    const foldedItemIds = new Set<string>();
    for (const row of rows) {
      if (row.presentation === 'folded') {
        foldedItemIds.add(row.itemId);
        continue;
      }
      const existing = byItem.get(row.itemId);
      if (!existing || (!existing.enhancedStoragePath && row.enhancedStoragePath)) {
        byItem.set(row.itemId, row);
      }
    }
    const eligible = [...byItem.values()];

    // Batch-sign every path we're about to hand out.
    const paths: string[] = [];
    for (const row of eligible) {
      if (row.cutoutStoragePath) paths.push(row.cutoutStoragePath);
      if (row.enhancedStoragePath) paths.push(row.enhancedStoragePath);
    }
    const supabase = getSupabaseAdmin();
    const urlByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed, error } = await supabase.storage
        .from(ITEM_PHOTOS_BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      if (error) throw new Error(`Failed to sign builder image URLs: ${error.message}`);
      for (const s of signed ?? []) {
        if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl);
      }
    }

    // Lazy cutout trigger — fail-open, never blocks the builder.
    const missing = eligible.filter((r) => r.enhancedStoragePath && !r.cutoutStoragePath);
    if (missing.length > 0) {
      try {
        const queue = await getQueue();
        for (const row of missing) {
          await queue.send(JOB_NAMES.CUTOUT_PHOTO, { photoId: row.photoId, userId });
        }
      } catch {
        /* builder still works on fallbacks; the next open retries */
      }
    }

    const items = eligible.map((row) => ({
      itemId: row.itemId,
      role: row.category as (typeof BUILDER_CATEGORIES)[number],
      subcategory: row.subcategory,
      primaryColor: row.primaryColor,
      fit: row.fit,
      presentation: row.presentation,
      cutoutUrl: row.cutoutStoragePath ? (urlByPath.get(row.cutoutStoragePath) ?? null) : null,
      trim: row.cutoutTrim ?? null,
      fallbackUrl: row.enhancedStoragePath ? (urlByPath.get(row.enhancedStoragePath) ?? null) : null,
    }));

    const draft = await db.query.outfitDrafts.findFirst({
      where: eq(outfitDrafts.userId, userId),
    });

    const cutoutsReady = items.length > 0 && items.every((i) => i.cutoutUrl !== null);

    await logEvent({
      userId,
      type: 'outfit.builder_opened',
      source,
      payload: {
        restored_draft: !!draft,
        cutouts_ready: cutoutsReady,
        itemCount: items.length,
        pendingCutouts: missing.length,
        excludedFolded: foldedItemIds.size,
      },
    });

    return {
      items,
      draftSlots: (draft?.slots as Record<string, unknown> | undefined) ?? null,
      cutoutsReady,
      excludedFolded: foldedItemIds.size,
    };
  },
});
