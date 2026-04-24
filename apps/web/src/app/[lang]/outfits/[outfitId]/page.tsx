import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isLocale } from '@/lib/i18n';
import { getCurrentAuthUser } from '@/lib/supabase/server';
import { getAppUserByAuthId } from '@/lib/users';
import { getOutfitForUser } from '@/lib/outfit-detail';
import { SaveOutfitButton } from '@/components/outfits/SaveOutfitButton';
import { DeleteOutfitButton } from '@/components/outfits/DeleteOutfitButton';
import { TryOnButton } from '@/components/outfits/TryOnButton';

export const dynamic = 'force-dynamic';

export default async function OutfitDetailPage({
  params,
}: {
  params: Promise<{ lang: string; outfitId: string }>;
}) {
  const { lang, outfitId } = await params;
  const safeLang = isLocale(lang) ? lang : 'en';

  const authUser = await getCurrentAuthUser();
  if (!authUser) redirect('/sign-in');

  const appUser = await getAppUserByAuthId(authUser.id);
  if (!appUser) redirect('/sign-in');

  const outfit = await getOutfitForUser(appUser.id, outfitId);
  if (!outfit) notFound();

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <Link
        href={`/${safeLang}/outfits`}
        className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-900 transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to outfits
      </Link>

      {outfit.contextOccasion && outfit.contextOccasion !== 'everyday' && (
        <p className="text-xs uppercase tracking-widest text-stone-400">
          For {outfit.contextOccasion.replace('_', ' ')}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {outfit.items.map((item) => (
          <Link
            key={item.closetItemId}
            href={`/${safeLang}/wardrobe/${item.closetItemId}`}
            className="block group"
          >
            <div
              className="aspect-square overflow-hidden"
              style={{ background: item.backgroundColor ?? '#f5f5f4' }}
            >
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt={item.role}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-stone-400 text-xs">
                  {item.role}
                </div>
              )}
            </div>
            <p className="mt-1 text-xs uppercase tracking-wider text-stone-400">
              {item.role}
            </p>
          </Link>
        ))}
      </div>

      <div className="border-t border-stone-200 pt-5 space-y-2">
        <p className="text-xs uppercase tracking-widest text-stone-400">Why this works</p>
        <p className="text-sm text-stone-700 leading-relaxed">{outfit.rationale}</p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <SaveOutfitButton outfitId={outfit.id} initiallySaved={outfit.saved} />
        <DeleteOutfitButton outfitId={outfit.id} lang={safeLang} />
      </div>

      <TryOnButton outfitId={outfit.id} initial={outfit.tryOn} />
    </div>
  );
}
