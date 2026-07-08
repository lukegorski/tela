import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { getDb, itemPhotos } from '@tela/db';
import { image } from '@tela/ai';
import { getPrompt } from '@tela/prompts';
import { logEvent } from '@tela/events';
import { getQueue, JOB_NAMES } from '@tela/queue';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import { getSupabaseAdmin, ITEM_PHOTOS_BUCKET } from '../storage/supabase.js';
import { detectBgColor, detectCropping, pngToJpeg } from './imageAnalysis.js';

const input = z.object({
  photoId: z.string().uuid(),
});

const output = z.object({
  photoId: z.string().uuid(),
  enhancedStoragePath: z.string(),
  backgroundColor: z.string(),
  attempts: z.number().int(),
  totalCostCents: z.number(),
  retried: z.boolean(),
});

/**
 * Enhance a wardrobe photo into a clean studio product photo.
 *
 * Pipeline:
 *   1. Mark photo as 'processing'
 *   2. Download original from Supabase Storage
 *   3. Run gpt-image-1.5 edit with the product photo prompt
 *   4. Detect background color, check for cropping
 *   5. If cropped, retry once with a corrected prompt
 *   6. Convert PNG → JPEG (quality 85)
 *   7. Upload to <originalStoragePath>.enhanced.jpg
 *   8. Update item_photos with enhanced_storage_path + background_color + status='complete'
 *
 * On failure: status='failed', error logged, original remains usable as fallback.
 * Idempotent: skips early if already 'complete'.
 */
export const processEnhancement = registerCapability({
  name: 'enhancement.process',
  description:
    "Enhance an uploaded wardrobe photo into a clean studio product shot via gpt-image-1.5. Detects cropping and retries once. Updates item_photos with enhanced_storage_path + background_color. Idempotent.",
  input,
  output,

  async execute({ photoId }) {
    const { userId, source } = getRequestContext();
    const db = getDb();

    // Load photo + verify ownership
    const photo = await db.query.itemPhotos.findFirst({
      where: and(eq(itemPhotos.id, photoId), eq(itemPhotos.userId, userId)),
    });
    if (!photo) {
      throw new Error('Photo not found or does not belong to user');
    }
    if (photo.enhancementStatus === 'complete' && photo.enhancedStoragePath) {
      // Idempotent — already done
      return {
        photoId: photo.id,
        enhancedStoragePath: photo.enhancedStoragePath,
        backgroundColor: photo.backgroundColor ?? '#ffffff',
        attempts: photo.enhancementAttempts,
        totalCostCents: 0,
        retried: false,
      };
    }

    // Mark as processing + bump attempts
    await db
      .update(itemPhotos)
      .set({
        enhancementStatus: 'processing',
        enhancementAttempts: sql`${itemPhotos.enhancementAttempts} + 1`,
        enhancementError: null,
      })
      .where(eq(itemPhotos.id, photoId));

    await logEvent({
      userId,
      type: 'enhancement.started',
      source,
      payload: { photoId },
    });

    try {
      // Download original
      const supabase = getSupabaseAdmin();
      const { data: signed, error: signErr } = await supabase.storage
        .from(ITEM_PHOTOS_BUCKET)
        .createSignedUrl(photo.storagePath, 600);
      if (signErr || !signed) {
        throw new Error(`Failed to sign download URL: ${signErr?.message}`);
      }

      const imgRes = await fetch(signed.signedUrl);
      if (!imgRes.ok) {
        throw new Error(`Failed to download original photo: ${imgRes.status}`);
      }
      const originalBuffer = Buffer.from(await imgRes.arrayBuffer());
      const dataUrl = `data:image/jpeg;base64,${originalBuffer.toString('base64')}`;

      // Load prompt
      const prompt = await getPrompt('enhancement.product_photo');

      // First attempt
      const first = await image({
        operation: 'enhancement.process',
        userId,
        promptName: prompt.name,
        promptVersionId: prompt.versionId,
        prompt: prompt.template,
        sourceImageDataUrl: dataUrl,
      });

      let pngBuffer = first.pngBuffer;
      let totalCost = first.provenance.costCents;

      // Crop check
      let bg = await detectBgColor(pngBuffer);
      const cropCheck = await detectCropping(pngBuffer, bg.median);
      let retried = false;

      if (cropCheck.isCropped) {
        retried = true;
        const edges = cropCheck.croppedEdges.join(' and ');
        const retryPrompt =
          prompt.template +
          `\n\nIMPORTANT CORRECTION: The previous attempt cropped the garment at the ${edges}. Zoom out further and ensure the ENTIRE garment is fully visible with generous margins on all sides. No part of the garment should touch or extend beyond any edge of the image.`;

        const second = await image({
          operation: 'enhancement.process',
          userId,
          promptName: prompt.name,
          promptVersionId: prompt.versionId,
          prompt: retryPrompt,
          sourceImageDataUrl: dataUrl,
        });
        pngBuffer = second.pngBuffer;
        totalCost += second.provenance.costCents;
        bg = await detectBgColor(pngBuffer);
      }

      // PNG → JPEG
      const jpegBuffer = await pngToJpeg(pngBuffer);

      // Upload enhanced
      const enhancedPath = `${photo.storagePath}.enhanced.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from(ITEM_PHOTOS_BUCKET)
        .upload(enhancedPath, jpegBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });
      if (uploadErr) {
        throw new Error(`Failed to upload enhanced photo: ${uploadErr.message}`);
      }

      // Update photo row → complete
      await db
        .update(itemPhotos)
        .set({
          enhancementStatus: 'complete',
          enhancedStoragePath: enhancedPath,
          backgroundColor: bg.median,
          enhancedAt: new Date(),
          enhancementError: null,
        })
        .where(eq(itemPhotos.id, photoId));

      await logEvent({
        userId,
        type: 'enhancement.completed',
        source,
        payload: {
          photoId,
          enhancedPath,
          backgroundColor: bg.median,
          retried,
          totalCostCents: totalCost,
        },
      });

      if (retried) {
        await logEvent({
          userId,
          type: 'enhancement.retry',
          source,
          payload: { photoId, edgeRatios: cropCheck.edgeRatios },
        });
      }

      // Builder v0 (§8a whitelist item c): enqueue the transparent-cutout
      // step for the freshly-enhanced photo. FAIL-OPEN and additive — a
      // cutout enqueue failure must NEVER affect the enhancement result.
      try {
        const queue = await getQueue();
        await queue.send(JOB_NAMES.CUTOUT_PHOTO, { photoId, userId });
      } catch (cutoutErr) {
        await logEvent({
          userId,
          type: 'enhancement.cutout_failed',
          source,
          payload: {
            photoId,
            stage: 'enqueue',
            error: (cutoutErr instanceof Error ? cutoutErr.message : String(cutoutErr)).slice(0, 200),
          },
        }).catch(() => {
          /* even event logging must not break enhancement */
        });
      }

      return {
        photoId,
        enhancedStoragePath: enhancedPath,
        backgroundColor: bg.median,
        attempts: photo.enhancementAttempts + 1,
        totalCostCents: totalCost,
        retried,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(itemPhotos)
        .set({
          enhancementStatus: 'failed',
          enhancementError: message.slice(0, 500),
        })
        .where(eq(itemPhotos.id, photoId));

      await logEvent({
        userId,
        type: 'enhancement.failed',
        source,
        payload: { photoId, error: message },
      });

      throw err;
    }
  },
});
