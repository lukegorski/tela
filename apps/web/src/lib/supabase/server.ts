/**
 * Supabase server client for use in Server Components, Server Actions,
 * and Route Handlers. Reads/writes auth cookies via Next's cookies() API.
 *
 * Use getSupabaseServerClient() in any RSC/server context. The session is
 * read from the request's cookies — it doesn't run in the user's browser
 * and never sees the raw access token in JS.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }>,
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // RSCs can't set cookies — silent fail is OK; the proxy handles it
          }
        },
      },
    },
  );
}

/**
 * Get the currently-authenticated Supabase Auth user, or null.
 * Returns the auth.users record (with id, email, etc.) — NOT our app users row.
 */
export async function getCurrentAuthUser() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
