/**
 * Root layout for apps/admin. Server component — wraps the entire app in
 * the provider tree (tRPC + theme + auth) and the AdminShell chrome.
 *
 * The OAuth callback route at /auth/callback is a route handler (route.ts),
 * which means Next.js doesn't apply this layout to it — the auth handshake
 * runs without AdminShell. Every other route is wrapped, and AdminShell's
 * AdminGate decides whether to render AdminLogin / a "no access" screen /
 * or the requested page chrome.
 *
 * The 404 surface from notFound() inside /admin/layout.tsx (server-side
 * requireAdmin → notFound() for signed-in non-admins) ALSO renders inside
 * this root layout, which means a non-admin sees AdminGate's no-access
 * screen instead of the raw 404 page. Defense in depth.
 *
 * No DictionaryProvider — admin is English-only per Phase 14 P2.
 */
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/components/AuthProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { TRPCProvider } from '@/trpc/Provider';
import { AdminShell } from '@/components/admin-chrome/AdminShell';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'tela admin',
  robots: { index: false, follow: false },
};

// Synchronous theme bootstrap — applies the .dark class before paint so the
// page never flashes light when the user prefers dark. Matches the (main)
// layout's pattern in apps/web; keyed off the same localStorage entry so
// admin and main app stay in sync.
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("theme-preference");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`;

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full font-sans bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <TRPCProvider>
          <ThemeProvider>
            <AuthProvider>
              <AdminShell>{children}</AdminShell>
            </AuthProvider>
          </ThemeProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
