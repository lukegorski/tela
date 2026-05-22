import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminUserDetail, type AdminUserDetail } from '@/lib/admin-users';
import { getUserWardrobe } from '@/lib/admin-user-wardrobe';
import { getUserOutfits } from '@/lib/admin-user-outfits';
import { getUserChats } from '@/lib/admin-user-chats';
import {
  getUserCostsReport,
  type CostBreakdown,
  type ExpensiveGeneration,
} from '@/lib/admin-user-costs-report';
import type { RichItem } from '@/lib/admin-user-wardrobe';
import type { RichOutfit } from '@/lib/admin-user-outfits';
import type { AdminChatMessage } from '@/lib/admin-user-chats';
import { formatCents } from '@/lib/admin-stats';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const TABS = ['overview', 'wardrobe', 'outfits', 'chats', 'costs'] as const;
type Tab = (typeof TABS)[number];

function parseTab(raw: string | undefined): Tab {
  return TABS.includes(raw as Tab) ? (raw as Tab) : 'overview';
}

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdmin();

  const { userId } = await params;
  const { tab: rawTab } = await searchParams;
  const activeTab = parseTab(rawTab);

  const detail = await getAdminUserDetail(userId);
  if (!detail) notFound();

  return (
    <div className="space-y-8">
      <Header detail={detail} />
      <Tabs userId={userId} activeTab={activeTab} totals={detail.totals} />
      <TabContent userId={userId} activeTab={activeTab} detail={detail} />
    </div>
  );
}

function Header({ detail }: { detail: AdminUserDetail }) {
  const { user } = detail;
  return (
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
      <Link href={`/admin/users`} className="text-sm text-stone-500 hover:text-stone-900">
        Back
      </Link>
    </header>
  );
}

function Tabs({
  userId,
  activeTab,
  totals,
}: {
  userId: string;
  activeTab: Tab;
  totals: AdminUserDetail['totals'];
}) {
  const labels: Record<Tab, string> = {
    overview: 'Overview',
    wardrobe: `Wardrobe (${totals.items})`,
    outfits: `Outfits (${totals.outfits})`,
    chats: `Chats (${totals.conversations})`,
    costs: 'Costs',
  };
  return (
    <div className="flex gap-1 border-b border-stone-200 overflow-x-auto">
      {TABS.map((tab) => {
        const isActive = tab === activeTab;
        const href = tab === 'overview' ? `/admin/users/${userId}` : `/admin/users/${userId}?tab=${tab}`;
        return (
          <Link
            key={tab}
            href={href}
            className={`px-3 py-2 text-xs font-semibold tracking-widest uppercase whitespace-nowrap border-b-2 -mb-px transition-colors ${
              isActive
                ? 'border-stone-700 text-stone-700'
                : 'border-transparent text-stone-400 hover:text-stone-700'
            }`}
          >
            {labels[tab]}
          </Link>
        );
      })}
    </div>
  );
}

async function TabContent({
  userId,
  activeTab,
  detail,
}: {
  userId: string;
  activeTab: Tab;
  detail: AdminUserDetail;
}) {
  if (activeTab === 'overview') return <OverviewTab detail={detail} />;
  if (activeTab === 'wardrobe') {
    const items = await getUserWardrobe(userId);
    return <WardrobeTab items={items} />;
  }
  if (activeTab === 'outfits') {
    const outfits = await getUserOutfits(userId);
    return <OutfitsTab outfits={outfits} />;
  }
  if (activeTab === 'chats') {
    const { messages, total } = await getUserChats(userId);
    return <ChatsTab messages={messages} total={total} />;
  }
  if (activeTab === 'costs') {
    const report = await getUserCostsReport(userId);
    return <CostsTab report={report} />;
  }
  return null;
}

function OverviewTab({ detail }: { detail: AdminUserDetail }) {
  const { totals, styleProfile, recentItems, recentOutfits, recentConversations, recentGenerations } =
    detail;
  return (
    <div className="space-y-10">
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

function WardrobeTab({ items }: { items: RichItem[] }) {
  if (items.length === 0) return <Empty>No wardrobe items yet.</Empty>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-px bg-stone-200">
      {items.map((item) => (
        <div key={item.id} className="bg-white">
          <div
            className="aspect-[3/4] relative"
            style={{ backgroundColor: item.backgroundColor ?? undefined }}
          >
            {item.imageUrl && (
              <Image
                src={item.imageUrl}
                alt={item.description ?? item.category}
                fill
                className="object-contain"
                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                unoptimized
              />
            )}
          </div>
          <div className="px-3 py-2">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="px-2 py-0.5 bg-stone-100 text-stone-600 text-[10px] uppercase tracking-widest">
                {item.category}
              </span>
              <span className="text-xs text-stone-500">{item.primaryColor}</span>
            </div>
            <p className="text-xs text-stone-400 font-mono">
              {new Date(item.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function OutfitsTab({ outfits }: { outfits: RichOutfit[] }) {
  if (outfits.length === 0) return <Empty>No outfits yet.</Empty>;
  return (
    <ul className="divide-y divide-stone-200 border-t border-b border-stone-200">
      {outfits.map((outfit) => (
        <li key={outfit.id} className="py-4">
          <div className="flex gap-3">
            <div className="flex gap-0.5 flex-shrink-0">
              {outfit.items.slice(0, 4).map((i) => (
                <div
                  key={i.closetItemId}
                  className="w-14 h-14 relative overflow-hidden bg-stone-50"
                  style={{ backgroundColor: i.backgroundColor ?? undefined }}
                >
                  {i.imageUrl && (
                    <Image src={i.imageUrl} alt="" fill className="object-cover" sizes="56px" unoptimized />
                  )}
                </div>
              ))}
            </div>

            {outfit.tryOn?.resultUrl && (
              <div className="w-14 h-20 relative overflow-hidden bg-stone-50 flex-shrink-0">
                <Image
                  src={outfit.tryOn.resultUrl}
                  alt="Try-on"
                  fill
                  className="object-cover"
                  sizes="56px"
                  unoptimized
                />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium truncate">{outfit.name ?? 'Untitled'}</span>
                {outfit.occasion && (
                  <span className="px-2 py-0.5 bg-stone-100 text-stone-600 text-[10px] uppercase tracking-widest">
                    {outfit.occasion}
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 line-clamp-2">{outfit.rationale}</p>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-stone-400">
                {outfit.feedback === 'up' && <span>thumbs up</span>}
                {outfit.feedback === 'down' && <span>thumbs down</span>}
                {outfit.saved && <span>saved</span>}
                {outfit.tryOn?.status === 'complete' && <span>try-on</span>}
                <span className="font-mono">{new Date(outfit.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ChatsTab({ messages, total }: { messages: AdminChatMessage[]; total: number }) {
  if (messages.length === 0) return <Empty>No chat messages yet.</Empty>;
  return (
    <div className="space-y-3 max-w-2xl">
      <p className="text-xs text-stone-400">
        {messages.length} of {total} messages, oldest first.
      </p>
      {messages.map((msg) => {
        const isUser = msg.role === 'user';
        return (
          <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[80%] flex flex-col gap-1.5">
              {msg.content && (
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    isUser
                      ? 'bg-stone-800 text-white'
                      : 'bg-stone-100 text-stone-800'
                  }`}
                >
                  {msg.content}
                </div>
              )}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <p className="text-[11px] text-stone-400">
                  Tools: {msg.toolCalls.map((tc) => tc.name).join(', ')}
                </p>
              )}
              <p
                className={`text-[11px] text-stone-400 font-mono ${
                  isUser ? 'text-right' : 'text-left'
                }`}
              >
                {new Date(msg.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CostsTab({
  report,
}: {
  report: {
    totalCostCents: number;
    totalCount: number;
    byOperation: CostBreakdown[];
    byModel: CostBreakdown[];
    topExpensive: ExpensiveGeneration[];
  };
}) {
  if (report.totalCount === 0) return <Empty>No AI calls yet.</Empty>;
  return (
    <div className="space-y-10">
      <section>
        <div className="border border-stone-200 px-6 py-6">
          <p className="text-xs uppercase tracking-widest text-stone-400 mb-1">Total spend</p>
          <p className="text-3xl font-mono">{formatCents(report.totalCostCents)}</p>
          <p className="text-xs text-stone-400 mt-1 font-mono">
            {report.totalCount} generations
          </p>
        </div>
      </section>

      {report.byOperation.length > 0 && (
        <Section title="By operation">
          <BreakdownTable rows={report.byOperation} />
        </Section>
      )}

      {report.byModel.length > 0 && (
        <Section title="By model">
          <BreakdownTable rows={report.byModel} />
        </Section>
      )}

      {report.topExpensive.length > 0 && (
        <Section title="Top 20 most expensive generations">
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
              {report.topExpensive.map((g) => (
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
        </Section>
      )}
    </div>
  );
}

function BreakdownTable({ rows }: { rows: CostBreakdown[] }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-stone-400 uppercase tracking-widest text-left">
        <tr>
          <th className="py-1 font-normal">Key</th>
          <th className="py-1 font-normal text-right">Calls</th>
          <th className="py-1 font-normal text-right">Cost</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-stone-100">
            <td className="py-1 font-mono">{r.key}</td>
            <td className="py-1 font-mono text-right">{r.count}</td>
            <td className="py-1 font-mono text-right">{formatCents(r.cents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
