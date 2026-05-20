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

/**
 * No-op replacement for supabase-js's default `navigator.locks`-based
 * auth-state lock.
 *
 * Why: supabase-js serializes access to its auth state via a Web Lock keyed
 * by `sb-<projectref>-auth-token`. With our singleton browser client AND
 * multiple concurrent consumers (useAuth on mount, TRPCProvider's per-fetch
 * headers function, hooks that read the session), strict-mode double-effects
 * + concurrent renders cause one lock acquirer to be `steal`-ed by another.
 * The dispossessed promise rejects with `NavigatorLockAcquireTimeoutError`,
 * which in dev surfaces as a Next.js runtime-error overlay and in prod
 * silently leaves the page in a signed-out state.
 *
 * The lock exists to serialize cross-tab token refreshes when multiple
 * supabase-js instances share localStorage/cookies. We have ONE client,
 * so the lock does no useful work — disabling it removes the contention.
 *
 * Edge case: two tabs open at once both triggering a token refresh could
 * overwrite each other's auth cookie. Refresh tokens are idempotent
 * during their validity window, so the loser still ends up with a valid
 * session and any actually-stale token gets re-refreshed on next call.
 */
async function noopLock<T>(_name: string, _acquireTimeout: number, fn: () => Promise<T>): Promise<T> {
  return fn();
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (_client) return _client;
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        lock: noopLock,
      },
    },
  );
  return _client;
}
