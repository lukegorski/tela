/**
 * /[lang] root — routes to onboarding if user hasn't completed it,
 * otherwise to /[lang]/wardrobe.
 */
import { redirect } from 'next/navigation';
import { isLocale } from '@/lib/i18n';
import { getCurrentAuthUser } from '@/lib/supabase/server';
import { getAppUserByAuthId } from '@/lib/users';

export default async function LangIndex({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const safeLang = isLocale(lang) ? lang : 'en';

  const authUser = await getCurrentAuthUser();
  if (!authUser) redirect('/sign-in'); // layout's requireAuth would also catch this

  const user = await getAppUserByAuthId(authUser.id);

  if (!user || !user.onboardingComplete) {
    redirect(`/${safeLang}/onboarding`);
  }

  redirect(`/${safeLang}/wardrobe`);
}
