/**
 * Root layout for the (main) route group. Multi-root: defines its own
 * <html><body> because Next 16 supports per-route-group root layouts via
 * parallel routes.
 *
 * Pixel-perfect port of legacy src/app/(main)/[lang]/layout.tsx with the
 * data layer swapped to our stack:
 *   - Inter font on --font-inter (consumed by globals.css)
 *   - Inline theme bootstrap script (avoids dark-mode FOUC)
 *   - Provider stack: TRPCProvider > DictionaryProvider > ThemeProvider
 *     > AuthProvider > PageTransitionProvider
 *   - Navbar (desktop) + MobileNav (mobile bottom tab bar)
 *
 * No requireAuth() at this layer — landing page handles signed-out users;
 * other pages call requireAuth() themselves. Mirrors legacy's
 * <ProtectedRoute> per-page pattern.
 *
 * Zero firebase imports. AuthProvider is Supabase-backed; TRPCProvider
 * gives ported components access to tRPC mutations against our
 * capability layer.
 */
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { isLocale, locales } from '@/lib/i18n';
import { getDictionary } from '@/dictionaries';
import { DictionaryProvider } from '@/components/DictionaryProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AuthProvider } from '@/components/AuthProvider';
import PageTransitionProvider, {
  PageTransitionWrapper,
} from '@/components/PageTransitionProvider';
import Navbar from '@/components/Navbar';
import MobileNav from '@/components/MobileNav';
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
                  <Navbar />
                  <main className="flex-1 pb-16 sm:pb-0 overflow-x-hidden">
                    <PageTransitionWrapper>{children}</PageTransitionWrapper>
                  </main>
                  <MobileNav />
                </PageTransitionProvider>
              </AuthProvider>
            </ThemeProvider>
          </DictionaryProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
