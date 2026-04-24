/**
 * Admin route group. The layout enforces admin-only access via requireAdmin()
 * before rendering any child route. Non-admin users see a 404 (route is
 * intentionally invisible to them).
 *
 * This layout sits inside the [lang] auth-gated layout, so we already have
 * a signed-in user by the time we get here.
 */
import { isLocale } from '@/lib/i18n';
import { requireAdmin } from '@/lib/admin';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const NAV_ITEMS = [
  { href: '', label: 'Overview' },
  { href: '/rules', label: 'Stylist rules' },
  { href: '/examples', label: 'Annotated examples' },
  { href: '/prompts', label: 'Prompts' },
  { href: '/costs', label: 'Costs' },
  { href: '/users', label: 'Users' },
] as const;

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const safeLang = isLocale(lang) ? lang : 'en';

  // 404 if not admin — happens before any child renders.
  await requireAdmin();

  const base = `/${safeLang}/admin`;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <header className="border-b border-stone-200 pb-4 mb-8">
        <p className="text-xs uppercase tracking-widest text-stone-400">tela admin</p>
        <h1 className="text-2xl font-medium tracking-tight mt-1">Internal tooling</h1>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-8">
        <nav className="space-y-1 text-sm">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={`${base}${item.href}`}
              className="block px-3 py-2 text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main>{children}</main>
      </div>
    </div>
  );
}
