import Link from 'next/link';
import { listAdminUsers } from '@/lib/admin-users';
import { formatCents } from '@/lib/admin-stats';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  await requireAdmin();

  const base = `/admin/users`;

  const users = await listAdminUsers();

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-medium tracking-tight">Users</h2>
        <p className="text-sm text-stone-500">
          {users.length} total. Click into a user to see their wardrobe, outfits, chats, and AI
          history.
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border border-stone-200">
          <thead className="bg-stone-50 text-stone-500 uppercase tracking-widest">
            <tr>
              <Th>User</Th>
              <Th align="right">Items</Th>
              <Th align="right">Outfits</Th>
              <Th align="right">Chats</Th>
              <Th align="right">Generations</Th>
              <Th align="right">Spend</Th>
              <Th align="right">Joined</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-stone-200 hover:bg-stone-50">
                <Td>
                  <Link href={`${base}/${u.id}`} className="block hover:text-stone-900">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-stone-900">
                        {u.displayName ?? u.email ?? u.phone ?? u.id.slice(0, 8) + '…'}
                      </span>
                      {u.isAdmin && (
                        <span className="px-1.5 py-0.5 bg-stone-700 text-stone-50 text-[10px] uppercase tracking-widest">
                          admin
                        </span>
                      )}
                      {!u.onboardingComplete && (
                        <span className="px-1.5 py-0.5 border border-stone-300 text-stone-500 text-[10px] uppercase tracking-widest">
                          onboarding
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-400">{u.email ?? u.phone ?? '—'}</p>
                  </Link>
                </Td>
                <Td align="right" className="font-mono">{u.itemCount}</Td>
                <Td align="right" className="font-mono">{u.outfitCount}</Td>
                <Td align="right" className="font-mono">{u.chatMessageCount}</Td>
                <Td align="right" className="font-mono">{u.generationCount}</Td>
                <Td align="right" className="font-mono">{formatCents(u.spendCents)}</Td>
                <Td align="right" className="font-mono text-stone-400">
                  {new Date(u.createdAt).toLocaleDateString()}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
