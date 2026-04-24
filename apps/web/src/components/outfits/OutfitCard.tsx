import Link from 'next/link';
import type { OutfitSummary } from '@/lib/outfits';

export function OutfitCard({ outfit, lang }: { outfit: OutfitSummary; lang: string }) {
  return (
    <Link
      href={`/${lang}/outfits/${outfit.id}`}
      className="block border border-stone-200 hover:border-stone-400 transition-colors p-4 space-y-3"
    >
      <div className="grid grid-cols-3 gap-2">
        {outfit.thumbs.slice(0, 6).map((thumb, i) => (
          <div key={i} className="aspect-square bg-stone-100 overflow-hidden">
            {thumb.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb.imageUrl}
                alt={thumb.role}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-stone-400 text-[10px]">
                {thumb.role}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-sm text-stone-700 line-clamp-3">{outfit.rationale}</p>
      {outfit.saved && (
        <p className="text-xs uppercase tracking-widest text-stone-400">Saved</p>
      )}
    </Link>
  );
}
