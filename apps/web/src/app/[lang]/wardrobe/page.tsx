/**
 * Wardrobe grid. Server-renders the user's items (with signed enhanced-photo
 * URLs already attached), and includes the client-side UploadButton.
 */
import { getCurrentAuthUser } from '@/lib/supabase/server';
import { getAppUserByAuthId } from '@/lib/users';
import { getWardrobeForUser } from '@/lib/wardrobe';
import { isLocale } from '@/lib/i18n';
import { redirect } from 'next/navigation';
import { WardrobeGrid } from '@/components/wardrobe/WardrobeGrid';
import { UploadButton } from '@/components/wardrobe/UploadButton';

// Disable static generation — we always need the live user's data
export const dynamic = 'force-dynamic';

export default async function WardrobePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const safeLang = isLocale(lang) ? lang : 'en';

  const authUser = await getCurrentAuthUser();
  if (!authUser) redirect('/sign-in');

  const appUser = await getAppUserByAuthId(authUser.id);
  if (!appUser || !appUser.onboardingComplete) {
    redirect(`/${safeLang}/onboarding`);
  }

  const items = await getWardrobeForUser(appUser.id);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Wardrobe</h1>
          <p className="text-sm text-stone-500 mt-1">
            {items.length} {items.length === 1 ? 'piece' : 'pieces'}
          </p>
        </div>
        <UploadButton lang={safeLang} />
      </div>

      <WardrobeGrid items={items} lang={safeLang} />
    </div>
  );
}
