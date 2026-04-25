import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isLocale } from '@/lib/i18n';
import { getCurrentAuthUser } from '@/lib/supabase/server';
import { getAppUserByAuthId } from '@/lib/users';
import { getItemForUser } from '@/lib/wardrobe-item';
import { RemoveItemButton } from '@/components/wardrobe/RemoveItemButton';

export const dynamic = 'force-dynamic';

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ lang: string; itemId: string }>;
}) {
  const { lang, itemId } = await params;
  const safeLang = isLocale(lang) ? lang : 'en';

  const authUser = await getCurrentAuthUser();
  if (!authUser) redirect(`/${safeLang}`);

  const appUser = await getAppUserByAuthId(authUser.id);
  if (!appUser) redirect(`/${safeLang}`);

  const item = await getItemForUser(appUser.id, itemId);
  if (!item) notFound();

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <Link
        href={`/${safeLang}/wardrobe`}
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
        Back to wardrobe
      </Link>

      <div className="grid sm:grid-cols-[1fr_1fr] gap-8">
        <div
          className="aspect-square overflow-hidden"
          style={{ background: item.backgroundColor ?? '#f5f5f4' }}
        >
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.description ?? item.category}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-stone-400 text-sm">
              {item.enhancementStatus === 'failed'
                ? 'Image unavailable'
                : 'Enhancing…'}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-widest text-stone-400">
              {item.category}
              {item.subcategory ? ` · ${item.subcategory}` : ''}
            </p>
            <h1 className="text-xl font-medium text-stone-900 mt-1">
              {item.description ?? `${item.primaryColor} ${item.subcategory ?? item.category}`}
            </h1>
          </div>

          <DataRow label="Primary color" value={item.primaryColor} />
          {item.secondaryColor && (
            <DataRow label="Secondary color" value={item.secondaryColor} />
          )}
          {item.pattern && <DataRow label="Pattern" value={item.pattern} />}
          {item.style && <DataRow label="Style" value={item.style} />}
          {item.fit && <DataRow label="Fit" value={item.fit} />}
          <DataRow label="Formality" value={`${(item.formalityScore * 100).toFixed(0)} / 100`} />
          <DataRow label="Material weight" value={item.materialWeight} />
          {item.seasonCompatibility.length > 0 && (
            <DataRow label="Seasons" value={item.seasonCompatibility.join(', ')} />
          )}
          <DataRow label="Worn" value={`${item.wearCount}×`} />

          <div className="pt-4">
            <RemoveItemButton itemId={item.id} lang={safeLang} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-xs uppercase tracking-widest text-stone-400 w-32">{label}</span>
      <span className="text-sm text-stone-700">{value}</span>
    </div>
  );
}
