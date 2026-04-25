/**
 * Root layout for the (main) route group — every public + signed-in user
 * surface lives under this. Defines <html><body> directly because Next 16
 * supports per-route-group root layouts via parallel routes.
 *
 * Mirrors the legacy `src/app/(main)/[lang]/layout.tsx` provider stack so
 * ported components find what they expect:
 *   - Inter font on --font-inter (consumed by globals.css)
 *   - Theme bootstrap script (avoids dark-mode flash)
 *   - DictionaryProvider, ThemeProvider, AuthProvider, PageTransitionProvider
 *   - Navbar / MobileNav are intentionally NOT rendered here yet — Phase D
 *     ports the legacy versions and wires them in. Until then pages render
 *     without chrome (the legacy chrome relies on settings panels we
 *     haven't ported yet).
 *
 * No requireAuth() at this layer — the landing page handles signed-out
 * users (shows login UI), and other pages call requireAuth() themselves.
 * The legacy app uses the same pattern (its <ProtectedRoute> wraps each
 * authed route individually).
 *
 * The new tRPC + Supabase stack lives alongside legacy-shaped providers:
 * TRPCProvider gives all consumers (including ported components) the
 * trpc client; AuthProvider's underlying useAuth() is Supabase-native.
 * Zero firebase imports.
 */
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { isLocale, locales } from '@/lib/i18n';
import { getDictionary } from '@/dictionaries';
import { DictionaryProvider } from '@/lib/i18n/DictionaryProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AuthProvider } from '@/components/AuthProvider';
import PageTransitionProvider, {
  PageTransitionWrapper,
} from '@/components/PageTransitionProvider';
import { TRPCProvider } from '@/trpc/Provider';
import '../../globals.css';

const inter = Inter({
  subsets: ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'],
  variable: '--font-inter',
});

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return {
    metadataBase: new URL('https://telastyle.app'),
    title: dict.meta?.title ?? 'tela',
    description: dict.meta?.description ?? 'Personal stylist that learns from your closet',
  };
}

export default async function MainRootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const dictionary = await getDictionary(lang);

  // Inline script: applies the persisted theme class before React hydrates,
  // avoiding the dark-mode FOUC. Mirrors legacy verbatim.
  const themeBootstrap = `(function(){try{var t=localStorage.getItem("theme-preference");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`;

  return (
    <html lang={lang} className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <TRPCProvider>
          <DictionaryProvider dictionary={dictionary} lang={lang}>
            <ThemeProvider>
              <AuthProvider>
                <PageTransitionProvider>
                  <main className="flex-1 pb-16 sm:pb-0 overflow-x-hidden">
                    <PageTransitionWrapper>{children}</PageTransitionWrapper>
                  </main>
                </PageTransitionProvider>
              </AuthProvider>
            </ThemeProvider>
          </DictionaryProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
