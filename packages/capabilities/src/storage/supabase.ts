import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

/**
 * Get a Supabase client using the service role key.
 * The service role key bypasses Row Level Security — use only on the server.
 * Never expose this client to browser code.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY environment variables are required');
  }

  _client = createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _client;
}

export const ITEM_PHOTOS_BUCKET = 'item-photos';
/** Bucket for try-on result images. Created on first use if missing. */
export const TRY_ON_BUCKET = 'try-on-results';
/**
 * Public bucket holding the built-in try-on model images (man.jpg, woman.jpg).
 * Public so Fashn can fetch directly without signed URLs.
 *
 * Provisioned by `packages/capabilities/scripts/setup-models-bucket.mjs`.
 */
export const MODELS_BUCKET = 'models';

/**
 * Resolve a public URL for an object in the `models` bucket. Returns
 * `${SUPABASE_URL}/storage/v1/object/public/models/${file}` — Supabase's
 * stable public-bucket URL format.
 */
export function getPublicModelUrl(file: 'man.jpg' | 'woman.jpg'): string {
  const url = process.env.SUPABASE_URL;
  if (!url) {
    throw new Error('SUPABASE_URL required to resolve model URL');
  }
  return `${url.replace(/\/$/, '')}/storage/v1/object/public/${MODELS_BUCKET}/${file}`;
}

/**
 * Map a user's tryOnSettings.model choice to the Fashn-fetchable model URL.
 * 'self' isn't supported yet (UI shows it disabled "coming soon"); we
 * silently fall back to the woman model so the pipeline doesn't break.
 */
export function resolveModelImageUrl(
  model: 'self' | 'model-woman' | 'model-man' | undefined | null,
): string {
  if (model === 'model-man') return getPublicModelUrl('man.jpg');
  return getPublicModelUrl('woman.jpg');
}
