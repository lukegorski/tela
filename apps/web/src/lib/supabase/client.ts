/**
 * Supabase browser client. Used in client components for auth + Realtime.
 * Reads cookies via document.cookie via @supabase/ssr.
 *
 * Singleton: instantiating multiple GoTrueClients in the same browser
 * context produces a runtime warning AND races on the auth session.
 * In particular, useAuth + TRPCProvider's per-fetch headers function
 * + any consumer that called this factory on each render were each
 * getting a fresh client, which manifested as ProtectedRoute hanging
 * forever on a loading spinner because getSession() never resolved
 * consistently. One client, one auth state, one session.
 */
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (_client) return _client;
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  return _client;
}
