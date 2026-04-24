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
