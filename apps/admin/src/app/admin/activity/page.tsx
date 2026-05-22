import Link from 'next/link';
import { getActivity, type ActivityEntry } from '@/lib/admin-activity';
import { formatActivityEvent } from '@/lib/formatActivityEvent';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  await requireAdmin();

  const { before } = await searchParams;
  const page = await getActivity({ limit: PAGE_SIZE, before });

  const nextHref = page.nextCursor ? `/admin/activity?before=${encodeURIComponent(page.nextCursor)}` : null;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-medium tracking-tight">Activity log</h2>
        <p className="text-sm text-stone-500">
          {before ? 'Continued feed' : 'Latest events across all users'}
          {page.entries.length > 0 && (
            <span className="text-stone-400">
              {' '}
              · {page.entries.length} events on this page
            </span>
          )}
        </p>
      </header>

      {page.entries.length === 0 ? (
        <p className="text-xs text-stone-400 italic">No activity yet.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {page.entries.map((entry) => (
            <ActivityRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}

      {nextHref && (
        <div className="pt-2">
          <Link
            href={nextHref}
            className="inline-block px-4 py-2 border border-stone-300 text-stone-700 text-xs uppercase tracking-widest font-semibold hover:bg-stone-50"
          >
            Load more
          </Link>
        </div>
      )}

      {before && (
        <div>
          <Link href="/admin/activity" className="text-xs text-stone-500 hover:text-stone-900">
            ← Back to latest
          </Link>
        </div>
      )}
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const actorName = entry.displayName ?? entry.email ?? entry.userId.slice(0, 8) + '…';
  const label = formatActivityEvent(entry.type, entry.payload);
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <Link
            href={`/admin/users/${entry.userId}`}
            className="font-medium text-stone-900 hover:underline"
          >
            {actorName}
          </Link>{' '}
          <span className="text-stone-500">{label}</span>
        </p>
        <p className="text-[11px] text-stone-400 font-mono">{entry.type}</p>
      </div>
      <span className="text-xs text-stone-400 font-mono flex-shrink-0">
        {new Date(entry.timestamp).toLocaleString()}
      </span>
    </li>
  );
}
