import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getDb, itemPhotos } from '@tela/db';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import { getSupabaseAdmin, ITEM_PHOTOS_BUCKET } from '../storage/supabase.js';

const input = z.object({
  photoId: z.string().uuid(),
});

const output = z.object({
  photoId: z.string().uuid(),
  status: z.enum(['pending', 'processing', 'complete', 'failed']).nullable(),
  attempts: z.number().int(),
  error: z.string().nullable(),
  enhancedSignedUrl: z.string().url().nullable(),
  backgroundColor: z.string().nullable(),
});

/**
 * Get the enhancement status for a photo. Returns a short-lived signed URL
 * for the enhanced JPEG when status === 'complete'.
 */
export const getEnhancementStatus = registerCapability({
  name: 'enhancement.getStatus',
  description:
    "Get the enhancement pipeline status for a photo. When status is 'complete', returns a short-lived signed URL for the enhanced image.",
  input,
  output,

  async execute({ photoId }) {
    const { userId } = getRequestContext();
    const db = getDb();

    const photo = await db.query.itemPhotos.findFirst({
      where: and(eq(itemPhotos.id, photoId), eq(itemPhotos.userId, userId)),
    });
    if (!photo) {
      throw new Error('Photo not found or does not belong to user');
    }

    let enhancedSignedUrl: string | null = null;
    if (photo.enhancementStatus === 'complete' && photo.enhancedStoragePath) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.storage
        .from(ITEM_PHOTOS_BUCKET)
        .createSignedUrl(photo.enhancedStoragePath, 600);
      if (!error && data) enhancedSignedUrl = data.signedUrl;
    }

    return {
      photoId: photo.id,
      status: (photo.enhancementStatus as 'pending' | 'processing' | 'complete' | 'failed' | null),
      attempts: photo.enhancementAttempts,
      error: photo.enhancementError,
      enhancedSignedUrl,
      backgroundColor: photo.backgroundColor,
    };
  },
});
