'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TelaLogo } from './TelaLogo';

// Visual port of legacy AdminShell.tsx:45-204. Replaces Firebase-era plumbing
// with our Supabase auth context and drops the AI panel toggle (14c will wire
// the ClaudeIcon back in once the AdminAiChat surface lands).
const NAV_ITEMS = [
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/activity', label: 'Activity' },
  { href: '/admin/chat', label: 'Chat' },
  { href: '/admin/costs', label: 'Costs' },
  { href: '/admin/stylist', label: 'Stylist' },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    setMenuClosing(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMenu();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuClosing(true);
    setTimeout(() => {
      setMenuOpen(false);
      setMenuClosing(false);
    }, 450);
  }

  return (
    <>
      <nav className="border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
        <div className="px-4 flex items-center h-14">
          <div className="flex-1">
            <Link href="/admin/users">
              <TelaLogo className="h-6 w-auto text-black dark:text-white" />
            </Link>
          </div>

          <div className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map(({ href, label }) => {
              const isActive = pathname === href || pathname.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-1.5 text-sm font-semibold tracking-widest uppercase transition-colors ${
                    isActive
                      ? 'text-stone-700 dark:text-stone-300'
                      : 'text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          <div className="flex-1 flex justify-end items-center gap-1">
            {/* AI toggle deferred to 14c — no dead UI in 14a. */}
            <button
              onClick={() => setMenuOpen(true)}
              className="sm:hidden p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label="Open menu"
            >
              <svg
                className="w-5 h-5 text-neutral-900 dark:text-neutral-100"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-[60]">
          <div
            className={`absolute inset-0 bg-black/40 transition-opacity duration-[450ms] ${
              menuClosing ? 'opacity-0' : 'opacity-100 animate-[fadeIn_450ms_ease-out]'
            }`}
            onClick={closeMenu}
          />

          <div
            className={`absolute inset-y-0 right-0 w-[300px] bg-white dark:bg-neutral-900 overflow-y-auto transition-transform duration-[450ms] ease-out ${
              menuClosing ? 'translate-x-full' : 'animate-[slideRight_450ms_ease-out]'
            }`}
          >
            <div className="sticky top-0 z-10 flex justify-end p-3 bg-white dark:bg-neutral-900">
              <button
                onClick={closeMenu}
                className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <svg
                  className="w-5 h-5 text-neutral-500 dark:text-neutral-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="px-4 pb-8">
              {NAV_ITEMS.map(({ href, label }) => {
                const isActive = pathname === href || pathname.startsWith(href + '/');
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center justify-between px-4 py-4 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                      isActive
                        ? 'text-stone-700 dark:text-stone-300'
                        : 'text-stone-500 dark:text-stone-400'
                    }`}
                  >
                    <span className="text-sm font-semibold tracking-widest uppercase">
                      {label}
                    </span>
                  </Link>
                );
              })}
              {/* /admin/ai mobile link deferred to 14c. */}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
