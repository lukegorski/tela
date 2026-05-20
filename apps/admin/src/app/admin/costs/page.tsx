/**
 * Admin cost dashboard. Reads aggregations from Postgres for the last N days
 * (default 30, max 90 — query ?days=90).
 *
 * Layout:
 *   - Top: window total + daily sparkline (text-based, no chart lib)
 *   - Three breakdown columns: by operation, by model, by user
 *   - Bottom: 20 most expensive single generations in the window
 */
import { getCostsReport } from '@/lib/admin-costs';
import { formatCents } from '@/lib/admin-stats';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ days?: string }>;
}

export default async function AdminCostsPage({ searchParams }: Props) {
  const sp = await searchParams;

  const days = sp.days ? Math.min(Math.max(parseInt(sp.days, 10) || 30, 1), 90) : 30;
  const report = await getCostsReport(days);

  return (
    <div className="space-y-10">
      <header className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-medium tracking-tight">AI cost</h2>
          <p className="text-sm text-stone-500">
            Last {report.windowDays} days · {formatCents(report.totalsInWindow.cents)} across{' '}
            {report.totalsInWindow.generations.toLocaleString()} generations
          </p>
        </div>
        <nav className="flex gap-2 text-xs">
          {[7, 30, 90].map((d) => (
            <a
              key={d}
              href={`?days=${d}`}
              className={`px-3 py-1 border transition-colors ${
                report.windowDays === d
                  ? 'border-stone-700 text-stone-900'
                  : 'border-stone-200 text-stone-500 hover:border-stone-400'
              }`}
            >
              {d}d
            </a>
          ))}
        </nav>
      </header>

      <DailyTable daily={report.daily} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <BreakdownTable title="By operation" rows={report.byOperation} />
        <BreakdownTable title="By model" rows={report.byModel} />
        <BreakdownTable title="By user" rows={report.byUser} />
      </div>

      <section>
        <h3 className="text-xs uppercase tracking-widest text-stone-400 mb-3">
          Top 20 most expensive generations
        </h3>
        {report.topExpensive.length === 0 ? (
          <p className="text-sm text-stone-500">Nothing to show in this window.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border border-stone-200">
              <thead className="bg-stone-50 text-stone-500 uppercase tracking-widest">
                <tr>
                  <Th>When</Th>
                  <Th>Operation</Th>
                  <Th>Model</Th>
                  <Th>User</Th>
                  <Th align="right">Cost</Th>
                  <Th align="right">Latency</Th>
                </tr>
              </thead>
              <tbody>
                {report.topExpensive.map((g) => (
                  <tr key={g.id} className="border-t border-stone-200">
                    <Td>{new Date(g.createdAt).toLocaleString()}</Td>
                    <Td className="font-mono">{g.operation}</Td>
                    <Td className="font-mono">{g.model}</Td>
                    <Td>{g.userEmail ?? g.userId.slice(0, 8) + '…'}</Td>
                    <Td align="right" className="font-mono">{formatCents(g.costCents)}</Td>
                    <Td align="right" className="font-mono">{Math.round(g.latencyMs)}ms</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function DailyTable({ daily }: { daily: { date: string; cents: number; generations: number }[] }) {
  if (daily.length === 0) {
    return <p className="text-sm text-stone-500">No generations yet.</p>;
  }
  const max = Math.max(...daily.map((d) => d.cents), 1);
  return (
    <section>
      <h3 className="text-xs uppercase tracking-widest text-stone-400 mb-3">Daily spend</h3>
      <div className="space-y-1">
        {daily.map((d) => (
          <div key={d.date} className="flex items-center gap-3 text-xs">
            <span className="w-24 font-mono text-stone-500">{d.date}</span>
            <div className="flex-1 h-3 bg-stone-100 relative">
              <div
                className="absolute inset-y-0 left-0 bg-stone-700"
                style={{ width: `${(d.cents / max) * 100}%` }}
              />
            </div>
            <span className="w-20 font-mono text-stone-700 text-right">{formatCents(d.cents)}</span>
            <span className="w-16 text-stone-400 text-right">{d.generations}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; cents: number; generations: number }[];
}) {
  const total = rows.reduce((sum, r) => sum + r.cents, 0);
  return (
    <section>
      <h3 className="text-xs uppercase tracking-widest text-stone-400 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-stone-400">—</p>
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, 10).map((r) => {
            const pct = total > 0 ? (r.cents / total) * 100 : 0;
            return (
              <li key={r.key}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate font-mono text-stone-700">{r.key}</span>
                  <span className="font-mono text-stone-700 whitespace-nowrap">
                    {formatCents(r.cents)}
                  </span>
                </div>
                <div className="mt-1 h-1 bg-stone-100 relative">
                  <div
                    className="absolute inset-y-0 left-0 bg-stone-400"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-0.5 text-[10px] text-stone-400">{r.generations} generations</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
