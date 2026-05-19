'use client';

/**
 * Implicit-flow magic-link callback.
 *
 * Background: Supabase Auth's `auth.admin.generateLink({type: 'magiclink'})`
 * (used by Phase 11 migration verification + any other admin-side
 * impersonation tooling) returns links that put the access_token in the
 * URL fragment (`#access_token=...&refresh_token=...&...`). Fragments are
 * never sent to servers, so our cookie-based PKCE handler at
 * `/auth/callback` (which only looks for `?code=`) bails with
 * `?error=missing_code` and the session is never established.
 *
 * This page handles the fragment-based flow client-side:
 *   1. Parse `#access_token=...&refresh_token=...`
 *   2. Call `supabase.auth.setSession(...)` which writes the auth cookies
 *   3. Redirect to the `?next` query param target (default '/')
 *
 * Not used by normal user flows (OAuth + email signups go through the
 * PKCE `/auth/callback` route). Only reachable when an admin tool
 * (Phase 11 magic-link verification) explicitly targets it as redirectTo.
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

// useSearchParams() forces the consuming subtree to client-side render, so
// Next.js requires a Suspense boundary above it — otherwise the build-time
// prerender bails. Splitting the body keeps the page route render-ready
// without changing behavior.
function MagicCallbackInner() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'pending' | 'error'>('pending');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // React strict mode double-invokes effects in dev. setSession() acquires
  // the Supabase auth Web Lock; a second concurrent call steals it and
  // leaves the session in a half-saved state, producing
  // NavigatorLockAcquireTimeoutError + an anonymous session on the next
  // page. Guard with a ref so the effect body runs at most once.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      const hash = window.location.hash.slice(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const next = searchParams.get('next') ?? '/';

      if (!accessToken || !refreshToken) {
        const err =
          params.get('error_description') ?? params.get('error') ?? 'missing tokens in URL fragment';
        setStatus('error');
        setErrorMsg(err);
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        setStatus('error');
        setErrorMsg(error.message);
        return;
      }

      // Confirm the session is readable before navigating — catches the
      // failure mode where setSession resolves but a concurrent operation
      // wiped the cookies before we redirected.
      const { data: verified } = await supabase.auth.getSession();
      if (!verified.session) {
        setStatus('error');
        setErrorMsg('session did not persist after setSession()');
        return;
      }

      // Force a full reload (not router.replace) so the destination page's
      // server components read the freshly-written auth cookies via SSR.
      // router.replace keeps the SPA mounted and can race with the cookie
      // write under strict mode / concurrent renders.
      window.location.replace(next);
    })();
  }, [searchParams]);

  return (
    <div className="flex h-screen items-center justify-center">
      {status === 'pending' && <div className="text-sm text-gray-500">Signing you in…</div>}
      {status === 'error' && (
        <div className="text-sm text-red-600">
          Sign-in failed: {errorMsg}
        </div>
      )}
    </div>
  );
}

export default function MagicCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <div className="text-sm text-gray-500">Signing you in…</div>
        </div>
      }
    >
      <MagicCallbackInner />
    </Suspense>
  );
}
