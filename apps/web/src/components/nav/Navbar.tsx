'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { localePath } from '@/lib/i18n';
import { useDictionary } from '@/lib/i18n/DictionaryProvider';

/**
 * Top navbar shown on desktop. Hidden on mobile (MobileNav takes over).
 * Simple horizontal nav: brand left, links + sign-out right.
 */
export function Navbar() {
  const { lang, dict } = useDictionary();
  const pathname = usePathname();

  const links = [
    { href: localePath(lang, '/wardrobe'), label: dict.nav?.pieces ?? 'Wardrobe' },
    { href: localePath(lang, '/outfits'), label: dict.nav?.myOutfits ?? 'Outfits' },
    { href: localePath(lang, '/chat'), label: dict.nav?.chat ?? 'Chat' },
  ];

  return (
    <header className="hidden sm:block sticky top-0 z-40 bg-white border-b border-stone-200">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link
          href={localePath(lang, '/wardrobe')}
          className="text-lg font-medium tracking-tight text-stone-900"
        >
          tela
        </Link>

        <nav className="flex items-center gap-6">
          {links.map((l) => {
            const isActive = pathname === l.href || pathname.startsWith(l.href + '/');
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`text-sm transition-colors ${
                  isActive ? 'text-stone-900 font-medium' : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          <Link
            href={localePath(lang, '/settings')}
            className={`text-sm transition-colors ${
              pathname.startsWith(localePath(lang, '/settings'))
                ? 'text-stone-900 font-medium'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            Settings
          </Link>
        </nav>
      </div>
    </header>
  );
}
