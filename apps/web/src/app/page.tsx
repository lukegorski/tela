import { getCurrentAuthUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const user = await getCurrentAuthUser();

  if (!user) {
    redirect('/sign-in');
  }

  // Phase 8.3 will route based on onboarding state. For now: bounce to wardrobe.
  redirect('/wardrobe');
}
