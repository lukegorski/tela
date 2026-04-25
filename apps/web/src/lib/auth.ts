/**
 * Server-side auth helpers for protected routes.
 *
 * Use requireAuth() at the top of any RSC page that needs an authenticated
 * user. On miss, redirects to the locale-aware landing page (which doubles
 * as the login surface — there is no separate /sign-in route, matching the
 * legacy app's pattern).
 */
import { redirect } from 'next/navigation';
import { getCurrentAuthUser } from './supabase/server';

/**
 * Where to send unauthenticated users. Optional `lang` lets callers send
 * the user back into their locale; missing lang falls back to /en/.
 */
export function landingHref(lang?: string): string {
  return `/${lang ?? 'en'}`;
}

export async function requireAuth(lang?: string) {
  const user = await getCurrentAuthUser();
  if (!user) {
    redirect(landingHref(lang));
  }
  return user;
}
