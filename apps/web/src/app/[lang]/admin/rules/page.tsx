/**
 * Stylist rules — list view. Cofounder + Luke see all rules grouped by
 * category, sorted by priority within each category.
 *
 * Each row links to /admin/rules/[id] for editing. A "New rule" button
 * leads to /admin/rules/new.
 */
import Link from 'next/link';
import { isLocale } from '@/lib/i18n';
import { listAllRules, groupByCategory } from '@/lib/admin-rules';

export const dynamic = 'force-dynamic';

export default async function AdminRulesPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const safeLang = isLocale(lang) ? lang : 'en';
  const base = `/${safeLang}/admin/rules`;

  const rules = await listAllRules();
  const groups = groupByCategory(rules);
  const categoryNames = Object.keys(groups).sort();

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium tracking-tight">Stylist rules</h2>
          <p className="text-sm text-stone-500">
            {rules.length} rule{rules.length === 1 ? '' : 's'} • {categoryNames.length} categor
            {categoryNames.length === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <Link
          href={`${base}/new`}
          className="px-4 py-2 bg-stone-700 text-stone-50 text-sm hover:bg-stone-600 transition-colors"
        >
          New rule
        </Link>
      </header>

      {rules.length === 0 ? (
        <div className="border border-dashed border-stone-300 px-6 py-12 text-center text-sm text-stone-500">
          No rules yet. Create the first one to start shaping outfit generation.
        </div>
      ) : (
        <div className="space-y-8">
          {categoryNames.map((category) => (
            <section key={category}>
              <h3 className="text-xs uppercase tracking-widest text-stone-400 mb-3">{category}</h3>
              <ul className="border border-stone-200 divide-y divide-stone-200">
                {groups[category].map((rule) => (
                  <li key={rule.id}>
                    <Link
                      href={`${base}/${rule.id}`}
                      className="flex items-start gap-4 px-4 py-3 hover:bg-stone-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-stone-900 line-clamp-2">{rule.rule}</p>
                        <p className="mt-1 text-xs text-stone-400 font-mono">
                          priority {rule.priority} • v{rule.version} • updated{' '}
                          {new Date(rule.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      {!rule.active && (
                        <span className="text-xs text-stone-400 uppercase tracking-widest">
                          inactive
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
