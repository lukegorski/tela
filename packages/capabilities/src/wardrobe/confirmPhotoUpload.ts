import { z } from 'zod';
import { getDb, itemPhotos } from '@tela/db';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import { getSupabaseAdmin, ITEM_PHOTOS_BUCKET } from '../storage/supabase.js';

const input = z.object({
  storagePath: z.string().min(1),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  capturedAt: z.string().datetime().nullable().default(null),
});

const output = z.object({
  photoId: z.string().uuid(),
  storagePath: z.string(),
});

/**
 * Confirm that a photo has been uploaded to Supabase Storage and register it in the database.
 * Verifies the file exists and the storage path belongs to the requesting user.
 */
export const confirmPhotoUpload = registerCapability({
  name: 'wardrobe.confirmPhotoUpload',
  description:
    'Confirm a photo upload completed. Verifies the file exists in storage and creates an item_photos row. Returns a photoId that can be used with wardrobe.addItem.',
  input,
  output,

  async execute({ storagePath, width, height, capturedAt }) {
    const { userId, source } = getRequestContext();

    // Verify the storage path belongs to this user (prevents path traversal / cross-user access)
    if (!storagePath.startsWith(`${userId}/`)) {
      throw new Error('Storage path does not belong to user');
    }

    // Verify the file actually exists in storage
    const supabase = getSupabaseAdmin();
    const folder = storagePath.split('/').slice(0, -1).join('/');
    const filename = storagePath.split('/').pop() ?? '';

    const { data: files, error: listError } = await supabase.storage
      .from(ITEM_PHOTOS_BUCKET)
      .list(folder, { limit: 100, search: filename });

    if (listError) {
      throw new Error(`Failed to verify file in storage: ${listError.message}`);
    }
    if (!files || files.length === 0) {
      throw new Error('File not found in storage — confirm the upload completed first');
    }

    // Create the item_photos row
    const db = getDb();
    const [photo] = await db
      .insert(itemPhotos)
      .values({
        userId,
        storagePath,
        width,
        height,
        capturedAt: capturedAt ? new Date(capturedAt) : null,
      })
      .returning({ id: itemPhotos.id, storagePath: itemPhotos.storagePath });

    await logEvent({
      userId,
      type: 'wardrobe.photo_uploaded',
      source,
      payload: { photoId: photo.id, storagePath: photo.storagePath },
    });

    return {
      photoId: photo.id,
      storagePath: photo.storagePath,
    };
  },
});
