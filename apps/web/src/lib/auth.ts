/**
 * Server-side auth helpers for protected routes.
 *
 * Use requireAuth() at the top of any RSC page that needs an authenticated user.
 * Returns the auth.users record. Throws redirect to /sign-in if unauthenticated.
 */
import { redirect } from 'next/navigation';
import { getCurrentAuthUser } from './supabase/server';

export async function requireAuth() {
  const user = await getCurrentAuthUser();
  if (!user) {
    redirect('/sign-in');
  }
  return user;
}
