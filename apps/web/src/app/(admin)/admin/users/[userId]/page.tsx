import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminUserDetail } from '@/lib/admin-users';
import { formatCents } from '@/lib/admin-stats';

export const dynamic = 'force-dynamic';

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const detail = await getAdminUserDetail(userId);
  if (!detail) notFound();

  const { user, styleProfile, totals, recentItems, recentOutfits, recentConversations, recentGenerations } = detail;

  return (
    <div className="space-y-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium tracking-tight">
            {user.displayName ?? user.email ?? user.phone ?? user.id.slice(0, 8) + '…'}
            {user.isAdmin && (
              <span className="ml-3 px-1.5 py-0.5 bg-stone-700 text-stone-50 text-[10px] uppercase tracking-widest">
                admin
              </span>
            )}
          </h2>
          <p className="text-sm text-stone-500">
            {user.email ?? user.phone ?? '—'} · {user.locale} · joined{' '}
            {new Date(user.createdAt).toLocaleDateString()}
          </p>
          <p className="text-xs text-stone-400 font-mono">{user.id}</p>
        </div>
        <Link
          href={`/admin/users`}
          className="text-sm text-stone-500 hover:text-stone-900"
        >
          Back
        </Link>
      </header>

      <section>
        <h3 className="text-xs uppercase tracking-widest text-stone-400 mb-3">Totals</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat label="Items" value={totals.items.toString()} />
          <Stat label="Outfits" value={totals.outfits.toString()} />
          <Stat label="Conversations" value={totals.conversations.toString()} />
          <Stat label="Generations" value={totals.generations.toString()} />
          <Stat label="Spend" value={formatCents(totals.spendCents)} />
        </div>
      </section>

      {styleProfile && (
        <section>
          <h3 className="text-xs uppercase tracking-widest text-stone-400 mb-3">
            Style profile
            <span className="ml-2 text-stone-300 normal-case">
              · updated {new Date(styleProfile.updatedAt).toLocaleDateString()}
            </span>
          </h3>
          <details>
            <summary className="text-sm text-stone-700 cursor-pointer hover:text-stone-900">
              Read closet read
            </summary>
            <pre className="mt-3 px-3 py-2 bg-stone-50 text-xs text-stone-700 leading-relaxed whitespace-pre-wrap">
              {styleProfile.profileText}
            </pre>
          </details>
        </section>
      )}

      <Section title={`Recent items · ${totals.items} total`}>
        {recentItems.length === 0 ? (
          <Empty>No items yet.</Empty>
        ) : (
          <ul className="space-y-1">
            {recentItems.map((i) => (
              <li key={i.id} className="text-xs text-stone-700">
                <span className="font-mono text-stone-400">
                  {new Date(i.createdAt).toLocaleDateString()}
                </span>{' '}
                · <span className="text-stone-900">{i.primaryColor} {i.subcategory ?? i.category}</span>
                {i.description && <span className="text-stone-500"> — {i.description}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Recent outfits · ${totals.outfits} total`}>
        {recentOutfits.length === 0 ? (
          <Empty>No outfits yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {recentOutfits.map((o) => (
              <li key={o.id} className="text-xs">
                <p className="font-mono text-stone-400">
                  {new Date(o.createdAt).toLocaleDateString()}
                  {o.saved && (
                    <span className="ml-2 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] uppercase tracking-widest">
                      saved
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-stone-700 line-clamp-2">{o.rationale}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Recent conversations · ${totals.conversations} total`}>
        {recentConversations.length === 0 ? (
          <Empty>No chats yet.</Empty>
        ) : (
          <ul className="space-y-1">
            {recentConversations.map((c) => (
              <li key={c.id} className="text-xs text-stone-700">
                <span className="font-mono text-stone-400">
                  {new Date(c.createdAt).toLocaleDateString()}
                </span>{' '}
                · {c.title ?? '(untitled)'}{' '}
                <span className="text-stone-400">({c.messageCount} messages)</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Recent generations · ${totals.generations} total`}>
        {recentGenerations.length === 0 ? (
          <Empty>No AI calls yet.</Empty>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-stone-400 uppercase tracking-widest text-left">
              <tr>
                <th className="py-1 font-normal">When</th>
                <th className="py-1 font-normal">Operation</th>
                <th className="py-1 font-normal">Model</th>
                <th className="py-1 font-normal text-right">Cost</th>
                <th className="py-1 font-normal text-right">Latency</th>
              </tr>
            </thead>
            <tbody>
              {recentGenerations.map((g) => (
                <tr key={g.id} className="border-t border-stone-100">
                  <td className="py-1 font-mono text-stone-500">
                    {new Date(g.createdAt).toLocaleString()}
                  </td>
                  <td className="py-1 font-mono">{g.operation}</td>
                  <td className="py-1 font-mono">{g.model}</td>
                  <td className="py-1 font-mono text-right">{formatCents(g.costCents)}</td>
                  <td className="py-1 font-mono text-right">{Math.round(g.latencyMs)}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-stone-200 px-4 py-4">
      <p className="text-xs text-stone-400 uppercase tracking-widest">{label}</p>
      <p className="mt-1 text-lg font-mono tracking-tight text-stone-900">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs uppercase tracking-widest text-stone-400 mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-stone-400 italic">{children}</p>;
}
