import { z } from 'zod';
import { eq, or } from 'drizzle-orm';
import { getDb, itemPhotos, closetItems } from '@tela/db';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import { getSupabaseAdmin, ITEM_PHOTOS_BUCKET } from '../storage/supabase.js';
import { cutoutImage } from './cutoutImage.js';

const input = z.object({
  photoId: z.string().uuid(),
});

const output = z.object({
  photoId: z.string().uuid(),
  cutoutStoragePath: z.string().nullable(),
  /** Why no cutout was produced ('already_done' | 'not_enhanced' | 'folded_presentation'); null on success */
  skippedReason: z.string().nullable(),
});

/**
 * Decide whether a photo is eligible for cutout generation. Pure — unit-tested.
 * Folded garments compose as laundry, not outfits (spec §2a #12), so they
 * never get cutouts until retaken.
 */
export function cutoutEligibility(photo: {
  cutoutStoragePath: string | null;
  enhancedStoragePath: string | null;
  presentation: string | null;
}): { eligible: boolean; skippedReason: string | null } {
  if (photo.cutoutStoragePath) return { eligible: false, skippedReason: 'already_done' };
  if (!photo.enhancedStoragePath) return { eligible: false, skippedReason: 'not_enhanced' };
  if (photo.presentation === 'folded') return { eligible: false, skippedReason: 'folded_presentation' };
  return { eligible: true, skippedReason: null };
}

/**
 * Generate the transparent cutout for a photo's ENHANCED image (spec §4).
 * Deterministic and ~free (local model). Idempotent: re-running a photo
 * that already has a cutout is a no-op. Fail-open at the CALLER: the
 * enhancement flow enqueues this and never lets a cutout failure affect
 * enhancement itself.
 */
export const cutoutPhoto = registerCapability({
  name: 'enhancement.cutout',
  description:
    "Generate a transparent WebP cutout of a wardrobe photo's enhanced image via local background removal (no AI spend). Skips folded-presentation items and photos without an enhanced image. Idempotent.",
  input,
  output,

  async execute({ photoId }) {
    const { userId, source } = getRequestContext();
    const db = getDb();

    const photo = await db.query.itemPhotos.findFirst({
      where: (p, { and: a, eq: e }) => a(e(p.id, photoId), e(p.userId, userId)),
    });
    if (!photo) throw new Error('Photo not found or does not belong to user');

    // presentation lives on the closet item owning this photo (original OR enhanced slot)
    const item = await db.query.closetItems.findFirst({
      where: or(eq(closetItems.photoId, photoId), eq(closetItems.enhancedPhotoId, photoId)),
      columns: { presentation: true },
    });

    const verdict = cutoutEligibility({
      cutoutStoragePath: photo.cutoutStoragePath,
      enhancedStoragePath: photo.enhancedStoragePath,
      presentation: item?.presentation ?? null,
    });
    if (!verdict.eligible) {
      return { photoId, cutoutStoragePath: photo.cutoutStoragePath, skippedReason: verdict.skippedReason };
    }

    try {
      const supabase = getSupabaseAdmin();
      const { data: signed, error: signErr } = await supabase.storage
        .from(ITEM_PHOTOS_BUCKET)
        .createSignedUrl(photo.enhancedStoragePath!, 600);
      if (signErr || !signed) throw new Error(`Failed to sign enhanced URL: ${signErr?.message}`);

      const res = await fetch(signed.signedUrl);
      if (!res.ok) throw new Error(`Failed to download enhanced photo: ${res.status}`);
      const enhanced = Buffer.from(await res.arrayBuffer());

      const t0 = Date.now();
      const cutout = await cutoutImage(enhanced);
      const durationMs = Date.now() - t0;

      const cutoutPath = `${photo.storagePath}.cutout.webp`;
      const { error: uploadErr } = await supabase.storage
        .from(ITEM_PHOTOS_BUCKET)
        .upload(cutoutPath, cutout.webp, { contentType: 'image/webp', upsert: true });
      if (uploadErr) throw new Error(`Failed to upload cutout: ${uploadErr.message}`);

      await db
        .update(itemPhotos)
        .set({ cutoutStoragePath: cutoutPath })
        .where(eq(itemPhotos.id, photoId));

      await logEvent({
        userId,
        type: 'enhancement.cutout_completed',
        source,
        payload: {
          photoId,
          cutoutPath,
          durationMs,
          transparentShare: +cutout.transparentShare.toFixed(4),
        },
      });

      return { photoId, cutoutStoragePath: cutoutPath, skippedReason: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logEvent({
        userId,
        type: 'enhancement.cutout_failed',
        source,
        payload: { photoId, error: message.slice(0, 500) },
      });
      throw err;
    }
  },
});
