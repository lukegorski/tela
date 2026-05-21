'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { trpc } from './client';
import { waitForToken } from '@/lib/auth-token-store';

/**
 * Wraps the app with the tRPC + React Query providers.
 *
 * Each request gets the current Supabase access token attached as a Bearer
 * token. This is what the API's auth middleware validates.
 */
export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Single fetch attempt per query. With retries, a failing query
            // (e.g., 401 during token refresh) holds `isPending=true` through
            // the whole exponential-backoff sequence (~7s), so the spinner
            // lingers and remounting the page re-runs the storm. With
            // `retry: false` the error commits immediately, `isPending`
            // flips false, and subsequent navigations render the cached
            // state without the spinner flash. tRPC mutations don't retry
            // by default, so this scope is queries only.
            retry: false,
            // Don't auto-refetch a previously errored query when the
            // component remounts (e.g., nav back to the same page). Combined
            // with `retry: false` and a 30s staleTime, this keeps empty/
            // errored pages instant on revisit. The user can still force a
            // refetch via an explicit invalidate (uploadItem, deleteItem,
            // etc. already do this on success).
            retryOnMount: false,
          },
        },
      }),
  );

  const [client] = useState(() =>
    trpc.createClient({
      links: [
        // loggerLink intentionally omitted: in dev it logs every mutation
        // result (including transient 401s during auth-token refresh) via
        // console.error, which trips Next.js's dev error overlay even when
        // the call later succeeds. Network tab + React Query devtools cover
        // the same diagnostic surface without the false-positive overlays.
        httpBatchLink({
          url: `${process.env.NEXT_PUBLIC_API_URL}/trpc`,
          transformer: superjson,
          async headers() {
            // Phase B refactor: read the access token from the module-scoped
            // auth-token-store instead of calling supabase.auth.getSession()
            // per request. The store is written by useAuth's
            // onAuthStateChange listener (INITIAL_SESSION, SIGNED_IN,
            // SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED). waitForToken's
            // 1500ms timeout matters only for the very first request after
            // page load — once the listener has fired, reads are sync and
            // free. Gracefully degrades to "no token, request 401s" if the
            // listener never fires (vs. the legacy 10s hang).
            const token = await waitForToken();
            return token ? { Authorization: `Bearer ${token}` } : {};
          },
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
