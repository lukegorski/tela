/**
 * Root page. The proxy will catch any locale-less request and redirect to
 * /[locale] before this renders. If we ever land here directly (e.g.
 * pre-proxy), bounce to /en/wardrobe as a fallback.
 */
import { redirect } from 'next/navigation';
import { getCurrentAuthUser } from '@/lib/supabase/server';

export default async function HomePage() {
  const user = await getCurrentAuthUser();
  if (!user) {
    redirect('/sign-in');
  }
  redirect('/en/wardrobe');
}
