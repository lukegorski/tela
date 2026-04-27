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
            // Time out after 1500ms and send the request without an auth
            // header — the server will return 401, the client can surface
            // the error, and we don't deadlock the UI.
            const supabase = getSupabaseBrowserClient();
            try {
              const session = await Promise.race([
                supabase.auth.getSession().then(({ data }) => data.session),
                new Promise<null>((resolve) =>
                  setTimeout(() => {
                    // eslint-disable-next-line no-console
                    console.warn(
                      '[trpc] supabase.auth.getSession() did not resolve within 3s — sending request without auth token',
                    );
                    resolve(null);
                  }, 3000),
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
