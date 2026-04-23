import { z } from 'zod';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import { getSupabaseAdmin, ITEM_PHOTOS_BUCKET } from '../storage/supabase.js';

const input = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
});

const output = z.object({
  uploadUrl: z.string().url(),
  storagePath: z.string(),
  token: z.string(),
  expiresInSeconds: z.number(),
});

/**
 * Generate a signed URL the client can use to upload a photo directly to Supabase Storage.
 * The client uploads, then calls wardrobe.confirmPhotoUpload to register the photo in the DB.
 */
export const requestPhotoUpload = registerCapability({
  name: 'wardrobe.requestPhotoUpload',
  description:
    'Generate a signed upload URL so the client can upload a wardrobe item photo directly to Supabase Storage. After uploading, the client must call wardrobe.confirmPhotoUpload to register the photo.',
  input,
  output,

  async execute({ filename, mimeType }) {
    const { userId } = getRequestContext();
    // Suppress unused warnings — mimeType reserved for future bucket-side validation
    void mimeType;
    const supabase = getSupabaseAdmin();

    // Sanitize filename — keep extension, replace path-unsafe chars
    const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
    const safeName = `${crypto.randomUUID()}.${ext}`;
    const storagePath = `${userId}/${safeName}`;

    const { data, error } = await supabase.storage
      .from(ITEM_PHOTOS_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error) {
      throw new Error(`Failed to create signed upload URL: ${error.message}`);
    }

    return {
      uploadUrl: data.signedUrl,
      storagePath: data.path,
      token: data.token,
      // Supabase signed upload URLs are valid for 2 hours by default
      expiresInSeconds: 7200,
    };
  },
});
