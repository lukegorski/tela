/**
 * Admin overview — landing page for /[lang]/admin.
 *
 * Shows:
 *   - Aggregate counts across the foundation tables (users, items, outfits,
 *     chat messages, AI generations)
 *   - AI spend totals (today / last 7 days / all-time)
 *
 * The data here is intentionally cheap — single-row aggregates, parallel
 * queries. Drilldown views live in /admin/users, /admin/costs, etc.
 */
import { getDashboardStats, formatCents } from '@/lib/admin-stats';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const stats = await getDashboardStats();

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-xs uppercase tracking-widest text-stone-400 mb-4">Totals</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Stat label="Users" value={stats.totals.users} />
          <Stat label="Closet items" value={stats.totals.closetItems} />
          <Stat label="Outfits" value={stats.totals.outfits} />
          <Stat label="Chat messages" value={stats.totals.chatMessages} />
          <Stat label="AI generations" value={stats.totals.generations} />
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-widest text-stone-400 mb-4">AI spend</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SpendCard label="Today" cents={stats.spend.today.cents} count={stats.spend.today.generations} />
          <SpendCard
            label="Last 7 days"
            cents={stats.spend.last7Days.cents}
            count={stats.spend.last7Days.generations}
          />
          <SpendCard
            label="All time"
            cents={stats.spend.allTime.cents}
            count={stats.spend.allTime.generations}
          />
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-stone-200 px-4 py-5">
      <p className="text-xs text-stone-400 uppercase tracking-widest">{label}</p>
      <p className="mt-2 text-2xl font-mono tracking-tight text-stone-900">{value.toLocaleString()}</p>
    </div>
  );
}

function SpendCard({
  label,
  cents,
  count,
}: {
  label: string;
  cents: number;
  count: number;
}) {
  return (
    <div className="border border-stone-200 px-4 py-5">
      <p className="text-xs text-stone-400 uppercase tracking-widest">{label}</p>
      <p className="mt-2 text-2xl font-mono tracking-tight text-stone-900">{formatCents(cents)}</p>
      <p className="mt-1 text-xs text-stone-500">{count.toLocaleString()} generations</p>
    </div>
  );
}
