/**
 * Root layout for the (legal) route group.
 *
 * The (legal) group sits at the URL root (telastyle.app/privacy,
 * telastyle.app/terms, etc. — no /[lang] prefix) so legal documents have
 * stable, search-engine-friendly URLs that are easy for regulators and
 * OAuth consent screens (Google) to validate.
 *
 * Next 16 supports per-route-group root layouts via parallel routes, so
 * this layout defines its own <html><body> independent of the (main) group.
 *
 * Differences from (main)/[lang]/layout.tsx:
 *   - No locale segment — pages are English-only at launch; translated
 *     versions live at /es/* and /pt-BR/* in a separate sibling route
 *     group once professional translations land (post-Phase-A).
 *   - No Navbar / MobileNav — these pages are accessible signed-out and
 *     don't carry the app chrome.
 *   - No AuthProvider / DictionaryProvider / TRPCProvider — pure static.
 *   - Inline theme bootstrap is kept so dark-mode preference persists
 *     across navigation between the app and a policy page.
 */
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import '../globals.css';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://telastyle.app'),
  robots: { index: true, follow: true },
};

export default function LegalRootLayout({ children }: { children: React.ReactNode }) {
  // Mirrors (main) layout's theme bootstrap so policy pages don't flash
  // white when the user has dark mode active.
  const themeBootstrap = `(function(){try{var t=localStorage.getItem("theme-preference");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`;

  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <header className="border-b border-neutral-200 dark:border-neutral-800">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <Link
              href="/"
              className="text-sm font-semibold tracking-widest uppercase text-neutral-900 dark:text-neutral-100"
              aria-label="tela home"
            >
              tela
            </Link>
            <Link
              href="/"
              className="text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
            >
              ← Back to app
            </Link>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-neutral-200 dark:border-neutral-800 mt-16">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
            <Link href="/privacy" className="hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors">
              Terms
            </Link>
            <Link href="/cookies" className="hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors">
              Cookies
            </Link>
            <Link
              href="/biometric-policy"
              className="hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
            >
              Biometric
            </Link>
            <Link href="/dmca" className="hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors">
              DMCA
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
