'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { localePath } from '@/lib/i18n';
import { useDictionary } from '@/lib/i18n/DictionaryProvider';
import { PlusIcon, HangerIcon, ChatBubbleIcon, PersonIcon } from './icons';

/**
 * Bottom tab bar shown on mobile screens. Mirrors the production app's
 * MobileNav (4 tabs: wardrobe, outfits, chat, settings). Admin users get a
 * 5th tab to /admin.
 */
export function MobileNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const { lang, dict } = useDictionary();
  const pathname = usePathname();

  const tabs = [
    { href: localePath(lang, '/wardrobe'), label: dict.nav?.pieces ?? 'Pieces', icon: PlusIcon },
    { href: localePath(lang, '/outfits'), label: dict.nav?.myOutfits ?? 'Outfits', icon: HangerIcon },
    { href: localePath(lang, '/chat'), label: dict.nav?.chat ?? 'Tela', icon: ChatBubbleIcon },
    { href: localePath(lang, '/settings'), label: 'Me', icon: PersonIcon },
    ...(isAdmin
      ? [
          {
            href: localePath(lang, '/admin'),
            label: 'Admin',
            icon: PersonIcon, // TODO: dedicated icon when we have one
          },
        ]
      : []),
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 sm:hidden z-50">
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-label={tab.label}
              className={`flex items-center justify-center min-w-[64px] min-h-[48px] transition-colors ${
                isActive ? 'text-stone-700' : 'text-stone-400'
              }`}
            >
              <Icon className="w-7 h-7" />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
