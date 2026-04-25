/**
 * Root layout for the (admin) route group. Multi-root layout: defines its
 * own <html><body> because Next 16 supports per-route-group root layouts
 * via parallel routes.
 *
 * Admin lives outside the [lang] segment (URL is /admin/*, no locale
 * prefix). Mirrors the legacy app's `(admin)/admin/layout.tsx` placement.
 *
 * Auth: requireAdmin() at the top — non-admin users get a 404 (the route
 * is intentionally invisible). Service-account contexts are admin by
 * default (per the capability registry's admin gate), but service
 * accounts shouldn't ever hit a browser-rendered admin page.
 *
 * Providers:
 *   - TRPCProvider — admin pages use trpc.capability.execute mutations
 *     (rule/example/prompt CRUD)
 *   - ThemeProvider — follows the same light/dark preference as main app
 *   - AuthProvider — for completeness; not strictly required since admin
 *     pages already gate via requireAdmin server-side, but it lets the
 *     admin chrome show the current user's email + sign-out
 *
 * No DictionaryProvider — admin UI is English-only by intent.
 */
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AuthProvider } from '@/components/AuthProvider';
import { TRPCProvider } from '@/trpc/Provider';
import '../../globals.css';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'tela admin',
  robots: { index: false, follow: false }, // never index admin
};

export const dynamic = 'force-dynamic';

const NAV_ITEMS = [
  { href: '', label: 'Overview' },
  { href: '/rules', label: 'Stylist rules' },
  { href: '/examples', label: 'Annotated examples' },
  { href: '/prompts', label: 'Prompts' },
  { href: '/costs', label: 'Costs' },
  { href: '/users', label: 'Users' },
] as const;

export default async function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 404 for non-admins — happens before any child renders. The route is
  // intentionally invisible to non-admins; we don't surface "forbidden".
  await requireAdmin();

  // Inline theme bootstrap script to match (main) layout (avoids dark-mode
  // flash). Admin uses the same light/dark preference key.
  const themeBootstrap = `(function(){try{var t=localStorage.getItem("theme-preference");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`;

  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full font-sans bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <TRPCProvider>
          <ThemeProvider>
            <AuthProvider>
              <div className="max-w-6xl mx-auto px-6 py-8">
                <header className="border-b border-stone-200 dark:border-neutral-700 pb-4 mb-8">
                  <p className="text-xs uppercase tracking-widest text-stone-400">tela admin</p>
                  <h1 className="text-2xl font-medium tracking-tight mt-1">Internal tooling</h1>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-8">
                  <nav className="space-y-1 text-sm">
                    {NAV_ITEMS.map((item) => (
                      <Link
                        key={item.href}
                        href={`/admin${item.href}`}
                        className="block px-3 py-2 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-neutral-800 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </nav>

                  <main>{children}</main>
                </div>
              </div>
            </AuthProvider>
          </ThemeProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
