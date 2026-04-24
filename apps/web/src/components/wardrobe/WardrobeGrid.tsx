import Link from 'next/link';
import type { WardrobeItem } from '@/lib/wardrobe';

interface Props {
  items: WardrobeItem[];
  lang: string;
}

export function WardrobeGrid({ items, lang }: Props) {
  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-stone-500">
          Your wardrobe is empty. Add your first piece to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {items.map((item) => (
        <Link
          key={item.id}
          href={`/${lang}/wardrobe/${item.id}`}
          className="group block"
        >
          <div
            className="aspect-square overflow-hidden bg-stone-100 relative"
            style={{ background: item.backgroundColor ?? '#f5f5f4' }}
          >
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imageUrl}
                alt={item.description ?? item.category}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-stone-400 text-xs">
                {item.enhancementStatus === 'failed'
                  ? 'image unavailable'
                  : item.enhancementStatus === 'processing' || item.enhancementStatus === 'pending'
                  ? 'enhancing…'
                  : 'no image'}
              </div>
            )}
          </div>
          <div className="mt-2 space-y-0.5">
            <p className="text-xs uppercase tracking-wider text-stone-400">
              {item.category}
              {item.subcategory ? ` · ${item.subcategory}` : ''}
            </p>
            <p className="text-sm text-stone-700 truncate">{item.primaryColor}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
