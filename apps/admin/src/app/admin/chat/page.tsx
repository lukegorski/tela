import Link from 'next/link';
import {
  getChatOverview,
  type PerUserChatRow,
  type RecentConversation,
} from '@/lib/admin-chat-overview';
import { formatCents } from '@/lib/admin-stats';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export default async function AdminChatPage() {
  await requireAdmin();

  const { stats, perUser, recentConversations } = await getChatOverview({ recentLimit: 20 });

  return (
    <div className="space-y-10">
      <header>
        <h2 className="text-lg font-medium tracking-tight">Chat conversations</h2>
        <p className="text-sm text-stone-500">
          Per-user breakdown and the most recent conversations across all users. Chat cost is
          isolated to <code className="font-mono text-stone-400">chat.*</code> operations —
          tool-triggered downstream calls (outfit generation, item analysis, …) show under their
          own operation in the user&apos;s cost report.
        </p>
      </header>

      <section>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Conversations" value={stats.totalConversations.toString()} />
          <Stat label="Messages" value={stats.totalMessages.toString()} />
          <Stat label="Last 7 days" value={`${stats.last7dMessages} msgs`} />
          <Stat label="Chat cost (all time)" value={formatCents(stats.totalChatCostCents)} />
        </div>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-widest text-stone-400 mb-3">
          Per user · sorted by chat cost
        </h3>
        {perUser.length === 0 ? (
          <Empty>No chat activity yet.</Empty>
        ) : (
          <PerUserTable rows={perUser} />
        )}
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-widest text-stone-400 mb-3">
          Recent conversations
          <span className="ml-2 text-stone-300 normal-case">
            · {recentConversations.length} shown
          </span>
        </h3>
        {recentConversations.length === 0 ? (
          <Empty>No conversations yet.</Empty>
        ) : (
          <RecentConversationsList rows={recentConversations} />
        )}
      </section>
    </div>
  );
}

function PerUserTable({ rows }: { rows: PerUserChatRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs border border-stone-200">
        <thead className="bg-stone-50 text-stone-500 uppercase tracking-widest">
          <tr>
            <Th>User</Th>
            <Th align="right">Conversations</Th>
            <Th align="right">Messages</Th>
            <Th align="right">Chat cost</Th>
            <Th align="right">Last active</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.userId} className="border-t border-stone-200 hover:bg-stone-50">
              <Td>
                <Link href={`/admin/users/${u.userId}?tab=chats`} className="block hover:text-stone-900">
                  <span className="text-sm text-stone-900">
                    {u.displayName ?? u.email ?? u.userId.slice(0, 8) + '…'}
                  </span>
                  <p className="text-xs text-stone-400">{u.email ?? '—'}</p>
                </Link>
              </Td>
              <Td align="right" className="font-mono">{u.conversationCount}</Td>
              <Td align="right" className="font-mono">{u.messageCount}</Td>
              <Td align="right" className="font-mono">{formatCents(u.chatCostCents)}</Td>
              <Td align="right" className="font-mono text-stone-400">
                {u.lastActiveAt ? timeAgo(u.lastActiveAt) : '—'}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentConversationsList({ rows }: { rows: RecentConversation[] }) {
  return (
    <ul className="divide-y divide-stone-100 border-t border-b border-stone-200">
      {rows.map((c) => (
        <li key={c.id}>
          <Link href={`/admin/chats/${c.id}`} className="block px-3 py-3 hover:bg-stone-50">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-stone-900 truncate">{c.title ?? '(untitled)'}</p>
                <p className="text-xs text-stone-400 truncate">
                  {c.displayName ?? c.email ?? c.userId.slice(0, 8) + '…'}
                  {c.email && c.displayName ? ` · ${c.email}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-stone-400 font-mono flex-shrink-0">
                <span>{c.messageCount} msgs</span>
                <span>{formatCents(c.chatCostCents)}</span>
                <span>{c.lastMessageAt ? timeAgo(c.lastMessageAt) : '—'}</span>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-stone-200 px-4 py-4">
      <p className="text-xs text-stone-400 uppercase tracking-widest">{label}</p>
      <p className="mt-1 text-lg font-mono tracking-tight text-stone-900">{value}</p>
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return <th className={`px-3 py-2 text-${align}`}>{children}</th>;
}

function Td({
  children,
  align = 'left',
  className,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return <td className={`px-3 py-2 text-${align} ${className ?? ''}`}>{children}</td>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-stone-400 italic">{children}</p>;
}
