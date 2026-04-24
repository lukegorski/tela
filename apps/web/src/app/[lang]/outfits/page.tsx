import { redirect } from 'next/navigation';
import { isLocale } from '@/lib/i18n';
import { getCurrentAuthUser } from '@/lib/supabase/server';
import { getAppUserByAuthId } from '@/lib/users';
import { getOutfitsForUser } from '@/lib/outfits';
import { OutfitCard } from '@/components/outfits/OutfitCard';
import { GenerateOutfitsButton } from '@/components/outfits/GenerateOutfitsButton';

export const dynamic = 'force-dynamic';

export default async function OutfitsPage({
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

  const outfits = await getOutfitsForUser(appUser.id);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-medium tracking-tight">Outfits</h1>
        <p className="text-sm text-stone-500">
          {outfits.length} {outfits.length === 1 ? 'outfit' : 'outfits'} generated
        </p>
      </div>

      <GenerateOutfitsButton lang={safeLang} />

      {outfits.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-stone-500">
            No outfits yet. Click &quot;Generate outfits&quot; above.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {outfits.map((outfit) => (
            <OutfitCard key={outfit.id} outfit={outfit} lang={safeLang} />
          ))}
        </div>
      )}
    </div>
  );
}
