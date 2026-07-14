import { z } from 'zod';
import { eq, desc, and } from 'drizzle-orm';
import { getDb, closetItems, itemPhotos } from '@tela/db';
import { getSupabaseAdmin, ITEM_PHOTOS_BUCKET } from '../storage/supabase.js';
import { getOrSignUrl } from '../storage/signedUrlCache.js';

// 1h, not 10min: these URLs sit in browser caches (React Query gcTime,
// stale-while-revalidate renders, bfcache) well past the response that
// carried them. Next's image optimizer refetches the URL upstream on
// every uncached variant request and relays Supabase's InvalidJWT 400
// when the token has expired — the "signed-URL 400s" console noise.
// The TTL must comfortably outlive the client cache horizon, not just
// the immediate render. Keep in sync with outfitShape.ts.
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * The rich shape returned by `wardrobe.listItems` and `wardrobe.getItem`.
 *
 * Flat (no `analysis.X` nesting), ISO-string timestamps, single
 * `backgroundColor` hex (no 4-corner gradient), and pre-signed image URLs.
 *
 * This shape is what every wardrobe-facing UI surface consumes — keeping it
 * consistent across both capabilities means there's one boundary where the
 * Postgres row is reshaped, not many.
 */
export const richItemSchema = z.object({
  id: z.string().uuid(),
  closetId: z.string().uuid(),
  photoId: z.string().uuid(),
  enhancedPhotoId: z.string().uuid().nullable(),

  category: z.string(),
  subcategory: z.string().nullable(),
  primaryColor: z.string(),
  secondaryColor: z.string().nullable(),
  pattern: z.string().nullable(),
  style: z.string().nullable(),
  fit: z.string().nullable(),
  length: z.string().nullable(),
  sleeveLength: z.string().nullable(),
  description: z.string().nullable(),
  formalityScore: z.number(),
  materialWeight: z.string(),
  material: z.string().nullable(),
  seasonCompatibility: z.array(z.string()),
  analysisLocale: z.string(),

  wearCount: z.number(),
  lastWornAt: z.string().nullable(),
  createdAt: z.string(),

  enhancementStatus: z.string().nullable(),
  enhancementStartedAt: z.string().nullable(),
  enhancedAt: z.string().nullable(),
  backgroundColor: z.string().nullable(),

  imageUrl: z.string().nullable(),
  originalImageUrl: z.string().nullable(),
});

export type RichItem = z.infer<typeof richItemSchema>;

interface JoinedRow {
  id: string;
  closetId: string;
  photoId: string;
  enhancedPhotoId: string | null;
  category: string;
  subcategory: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  pattern: string | null;
  style: string | null;
  fit: string | null;
  length: string | null;
  sleeveLength: string | null;
  description: string | null;
  formalityScore: number;
  materialWeight: string;
  material: string | null;
  seasonCompatibility: string[];
  analysisLocale: string;
  wearCount: number;
  lastWornAt: Date | null;
  itemCreatedAt: Date;
  closetItemBackgroundColor: string | null;
  originalStoragePath: string;
  enhancementStatus: string | null;
  enhancedStoragePath: string | null;
  photoBackgroundColor: string | null;
  enhancedAt: Date | null;
  photoCreatedAt: Date;
}

/**
 * Fetch closet items joined to their original `item_photos` row, optionally
 * filtered to a single item or a category, and resolve signed image URLs.
 *
 * The original-photo row carries the enhancement state (status, enhanced
 * path, detected background color); we read both the original and the
 * enhanced path so the UI can show whichever is ready.
 */
export async function fetchRichItems(opts: {
  userId: string;
  itemId?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<RichItem[]> {
  const db = getDb();

  const conditions = [eq(closetItems.userId, opts.userId)];
  if (opts.itemId) conditions.push(eq(closetItems.id, opts.itemId));
  if (opts.category) conditions.push(eq(closetItems.category, opts.category));

  const baseQuery = db
    .select({
      id: closetItems.id,
      closetId: closetItems.closetId,
      photoId: closetItems.photoId,
      enhancedPhotoId: closetItems.enhancedPhotoId,
      category: closetItems.category,
      subcategory: closetItems.subcategory,
      primaryColor: closetItems.primaryColor,
      secondaryColor: closetItems.secondaryColor,
      pattern: closetItems.pattern,
      style: closetItems.style,
      fit: closetItems.fit,
      length: closetItems.length,
      sleeveLength: closetItems.sleeveLength,
      description: closetItems.description,
      formalityScore: closetItems.formalityScore,
      materialWeight: closetItems.materialWeight,
      material: closetItems.material,
      seasonCompatibility: closetItems.seasonCompatibility,
      analysisLocale: closetItems.analysisLocale,
      wearCount: closetItems.wearCount,
      lastWornAt: closetItems.lastWornAt,
      itemCreatedAt: closetItems.createdAt,
      closetItemBackgroundColor: closetItems.backgroundColor,
      originalStoragePath: itemPhotos.storagePath,
      enhancementStatus: itemPhotos.enhancementStatus,
      enhancedStoragePath: itemPhotos.enhancedStoragePath,
      photoBackgroundColor: itemPhotos.backgroundColor,
      enhancedAt: itemPhotos.enhancedAt,
      photoCreatedAt: itemPhotos.createdAt,
    })
    .from(closetItems)
    .innerJoin(itemPhotos, eq(itemPhotos.id, closetItems.photoId))
    .where(and(...conditions))
    .orderBy(desc(closetItems.createdAt));

  const rows = (
    opts.limit !== undefined
      ? await baseQuery.limit(opts.limit).offset(opts.offset ?? 0)
      : await baseQuery
  ) as JoinedRow[];

  if (rows.length === 0) return [];

  const supabase = getSupabaseAdmin();
  return Promise.all(
    rows.map(async (row): Promise<RichItem> => {
      const displayPath = row.enhancedStoragePath ?? row.originalStoragePath;

      const [displayUrl, originalUrl] = await Promise.all([
        getOrSignUrl(supabase, ITEM_PHOTOS_BUCKET, displayPath, SIGNED_URL_TTL_SECONDS),
        row.enhancedStoragePath
          ? getOrSignUrl(supabase, ITEM_PHOTOS_BUCKET, row.originalStoragePath, SIGNED_URL_TTL_SECONDS)
          : Promise.resolve(null),
      ]);

      const enhancementStartedAt =
        row.enhancementStatus === 'pending' || row.enhancementStatus === 'processing'
          ? row.photoCreatedAt.toISOString()
          : null;

      return {
        id: row.id,
        closetId: row.closetId,
        photoId: row.photoId,
        enhancedPhotoId: row.enhancedPhotoId,
        category: row.category,
        subcategory: row.subcategory,
        primaryColor: row.primaryColor,
        secondaryColor: row.secondaryColor,
        pattern: row.pattern,
        style: row.style,
        fit: row.fit,
        length: row.length,
        sleeveLength: row.sleeveLength,
        description: row.description,
        formalityScore: row.formalityScore,
        materialWeight: row.materialWeight,
        material: row.material,
        seasonCompatibility: row.seasonCompatibility,
        analysisLocale: row.analysisLocale,
        wearCount: row.wearCount,
        lastWornAt: row.lastWornAt?.toISOString() ?? null,
        createdAt: row.itemCreatedAt.toISOString(),
        enhancementStatus: row.enhancementStatus,
        enhancementStartedAt,
        enhancedAt: row.enhancedAt?.toISOString() ?? null,
        backgroundColor: row.closetItemBackgroundColor ?? row.photoBackgroundColor,
        imageUrl: displayUrl,
        originalImageUrl: originalUrl ?? displayUrl,
      };
    }),
  );
}
