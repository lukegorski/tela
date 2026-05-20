/**
 * Server-side aggregate queries for the admin dashboard.
 *
 * Mirrors `admin.getDashboardStats` capability — kept in sync intentionally,
 * because the admin RSC pages render directly from Postgres rather than
 * round-tripping through tRPC + auth. Callers from MCP / external services
 * still use the capability.
 *
 * Only call from inside `/admin` routes (which are gated by requireAdmin()).
 */
import 'server-only';
import { getSql } from '@tela/db';

export interface DashboardStats {
  totals: {
    users: number;
    closetItems: number;
    outfits: number;
    chatMessages: number;
    generations: number;
  };
  spend: {
    today: { cents: number; generations: number };
    last7Days: { cents: number; generations: number };
    allTime: { cents: number; generations: number };
  };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const sql = getSql();

  const [
    [{ count: userCount }],
    [{ count: itemCount }],
    [{ count: outfitCount }],
    [{ count: messageCount }],
    [{ count: genCount }],
    [todaySpend],
    [weekSpend],
    [allTimeSpend],
  ] = await Promise.all([
    sql<{ count: number }[]>`SELECT count(*)::int AS count FROM users`,
    sql<{ count: number }[]>`SELECT count(*)::int AS count FROM closet_items`,
    sql<{ count: number }[]>`SELECT count(*)::int AS count FROM outfits`,
    sql<{ count: number }[]>`SELECT count(*)::int AS count FROM chat_messages`,
    sql<{ count: number }[]>`SELECT count(*)::int AS count FROM generations`,
    sql<{ cents: number; count: number }[]>`
      SELECT COALESCE(SUM(cost_cents), 0)::float AS cents, count(*)::int AS count
      FROM generations
      WHERE created_at >= now() - interval '1 day'
    `,
    sql<{ cents: number; count: number }[]>`
      SELECT COALESCE(SUM(cost_cents), 0)::float AS cents, count(*)::int AS count
      FROM generations
      WHERE created_at >= now() - interval '7 days'
    `,
    sql<{ cents: number; count: number }[]>`
      SELECT COALESCE(SUM(cost_cents), 0)::float AS cents, count(*)::int AS count
      FROM generations
    `,
  ]);

  return {
    totals: {
      users: userCount,
      closetItems: itemCount,
      outfits: outfitCount,
      chatMessages: messageCount,
      generations: genCount,
    },
    spend: {
      today: { cents: todaySpend.cents, generations: todaySpend.count },
      last7Days: { cents: weekSpend.cents, generations: weekSpend.count },
      allTime: { cents: allTimeSpend.cents, generations: allTimeSpend.count },
    },
  };
}

export function formatCents(cents: number): string {
  if (cents < 100) return `${cents.toFixed(1)}¢`;
  return `$${(cents / 100).toFixed(2)}`;
}
