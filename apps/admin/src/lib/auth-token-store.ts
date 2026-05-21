/**
 * Module-scoped cache for the current Supabase access token.
 *
 * Why this exists:
 *   tRPC's `headers` callback runs on every request. Previously it called
 *   `supabase.auth.getSession()` synchronously per request to grab the
 *   token — but supabase-js's session read can hang under cross-origin /
 *   Web-Locks contention (see the 10s warning + the supabase/client.ts
 *   noopLock comment). When that hung, every tRPC call timed out and the
 *   page fell back to a no-auth request that 401'd.
 *
 *   The fix is "subscribe once, read sync": useAuth subscribes to
 *   onAuthStateChange and writes the current access token here. tRPC's
 *   headers() and the chat-stream POST read from here synchronously
 *   (with a short bounded wait on the very first request, see
 *   waitForToken below). No more per-request getSession() calls.
 *
 * Singleton with module scope. There is one Supabase browser client per
 * app (verified — see lib/supabase/client.ts) emitting auth events into
 * one useAuth instance writing into this one store.
 */

let currentToken: string | null = null;

/**
 * Resolves once setCurrentToken has been called for the first time — i.e.
 * once useAuth's onAuthStateChange listener has produced its initial
 * INITIAL_SESSION event. Subsequent setCurrentToken calls are
 * synchronous updates; the ready promise stays resolved.
 */
let isReady = false;
let resolveReady: (() => void) | undefined;
const ready = new Promise<void>((r) => {
  resolveReady = r;
});

/**
 * Write the current access token. Called by useAuth on every auth event
 * (INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED).
 *
 * Also called synchronously by useAuth.signOut() BEFORE awaiting
 * supabase.auth.signOut(), so any in-flight tRPC request that hasn't yet
 * read the token immediately sees null instead of the about-to-be-revoked
 * old token. (The actual revoke happens server-side at signOut; this just
 * prevents us from sending the old token through after the user clicked
 * "sign out".)
 */
export function setCurrentToken(token: string | null) {
  currentToken = token;
  if (!isReady) {
    isReady = true;
    resolveReady?.();
  }
}

/** Read-only access to the current token. Sync, no allocation. */
export function getCurrentToken(): string | null {
  return currentToken;
}

/**
 * Whether the store has been written to at least once. Useful for testing
 * and for diagnostics — most consumers should use waitForToken() instead.
 */
export function isAuthReady(): boolean {
  return isReady;
}

/**
 * Wait for the auth listener to have fired its first event, then return
 * whatever token is in the store (which may be null if the user is signed
 * out). Bounded by `timeoutMs` so we degrade gracefully instead of
 * recreating the 10s-hang bug class: if the listener never fires within
 * the budget, we resolve to whatever's in the store (likely null) and let
 * tRPC send the request without an Authorization header. The API will
 * 401, the caller observes the error, and the user's next interaction
 * naturally retries against a now-populated store.
 *
 * 1500ms is the chosen budget. supabase-js's onAuthStateChange typically
 * fires within 50-200ms of subscription (the INITIAL_SESSION event), so
 * 1500ms gives generous headroom for cold page loads without approaching
 * the 10s window the legacy defensive timeout used.
 */
export async function waitForToken(timeoutMs = 1500): Promise<string | null> {
  if (isReady) return currentToken;
  await Promise.race([
    ready,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
  return currentToken;
}
