/**
 * Server-side admin gate. Use at the top of any RSC under /admin to
 * enforce that the request comes from a user with `users.is_admin = true`.
 *
 * Behavior:
 *   - Not signed in → redirect to landing (login lives there)
 *   - Signed in but not admin → 404 (don't leak the existence of /admin to
 *     non-admins; matches GitHub / Notion patterns for hidden internal routes)
 *
 * This is a defense-in-depth check on top of the capability-layer admin gate
 * (capabilities marked `requiresAdmin: true` reject non-admin RequestContexts
 * server-side regardless of the route).
 */
import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { getCurrentAuthUser } from './supabase/server';
import { getAppUserByAuthId, type AppUser } from './users';
import { landingHref } from './auth';

export async function requireAdmin(): Promise<AppUser> {
  const authUser = await getCurrentAuthUser();
  if (!authUser) redirect(landingHref());

  const appUser = await getAppUserByAuthId(authUser.id);
  if (!appUser) redirect(landingHref());

  if (!appUser.isAdmin) {
    notFound();
  }

  return appUser;
}
