/**
 * Supabase browser client. Used in client components for auth + Realtime.
 * Reads cookies via document.cookie via @supabase/ssr.
 */
import { createBrowserClient } from '@supabase/ssr';

export function getSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
