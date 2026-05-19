'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { trpc } from './client';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

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
            // Defensive timeout: if supabase.auth.getSession() hangs (we've
            // seen this in dev — multi-client races, stale Web Locks, etc.),
            // we'd otherwise block every tRPC call indefinitely and freeze
            // every consumer hook (useOutfits.loading stuck on true, etc.).
            // 10s is generous enough that the @supabase/ssr browser client's
            // first cookie read can complete on cold page load (where 3s was
            // tripping the timeout, sending requests without auth headers,
            // and getting 401s back), but still bounded so a genuinely
            // hung session doesn't deadlock the UI forever.
            const supabase = getSupabaseBrowserClient();
            try {
              const session = await Promise.race([
                supabase.auth.getSession().then(({ data }) => data.session),
                new Promise<null>((resolve) =>
                  setTimeout(() => {
                    // eslint-disable-next-line no-console
                    console.warn(
                      '[trpc] supabase.auth.getSession() did not resolve within 10s — sending request without auth token',
                    );
                    resolve(null);
                  }, 10000),
                ),
              ]);
              const token = session?.access_token;
              return token ? { Authorization: `Bearer ${token}` } : {};
            } catch {
              return {};
            }
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
