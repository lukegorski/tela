/**
 * Server-side cost aggregations for the admin dashboard.
 * Mirrors admin.getCosts; reads directly from Postgres for the /admin
 * RSC pages.
 */
import 'server-only';
import postgres from 'postgres';

let _sql: ReturnType<typeof postgres> | null = null;
function getSql() {
  if (_sql) return _sql;
  _sql = postgres(process.env.DATABASE_URL!, {
    max: 3,
    idle_timeout: 10,
    connect_timeout: 10,
  });
  return _sql;
}

export interface CostsReport {
  windowDays: number;
  totalsInWindow: { cents: number; generations: number };
  daily: { date: string; cents: number; generations: number }[];
  byOperation: { key: string; cents: number; generations: number }[];
  byModel: { key: string; cents: number; generations: number }[];
  byUser: { key: string; cents: number; generations: number }[];
  topExpensive: {
    id: string;
    userId: string;
    userEmail: string | null;
    operation: string;
    model: string;
    costCents: number;
    latencyMs: number;
    createdAt: string;
  }[];
}

export async function getCostsReport(days = 30): Promise<CostsReport> {
  const sql = getSql();
  const clamped = Math.min(Math.max(days, 1), 90);
  // Postgres requires the interval literal to be a string; we sanitize by
  // clamping above and only using the integer in a parameterized fragment.

  const [[totals], dailyRows, byOpRows, byModelRows, byUserRows, topExpRows] =
    await Promise.all([
      sql<{ cents: number; count: number }[]>`
        SELECT
          COALESCE(SUM(cost_cents), 0)::float AS cents,
          count(*)::int AS count
        FROM generations
        WHERE created_at >= now() - (${clamped}::int || ' days')::interval
      `,
      sql<{ date: string; cents: number; count: number }[]>`
        SELECT
          to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date,
          COALESCE(SUM(cost_cents), 0)::float AS cents,
          count(*)::int AS count
        FROM generations
        WHERE created_at >= now() - (${clamped}::int || ' days')::interval
        GROUP BY date_trunc('day', created_at)
        ORDER BY date_trunc('day', created_at) ASC
      `,
      sql<{ key: string; cents: number; count: number }[]>`
        SELECT
          operation AS key,
          COALESCE(SUM(cost_cents), 0)::float AS cents,
          count(*)::int AS count
        FROM generations
        WHERE created_at >= now() - (${clamped}::int || ' days')::interval
        GROUP BY operation
        ORDER BY cents DESC
      `,
      sql<{ key: string; cents: number; count: number }[]>`
        SELECT
          model AS key,
          COALESCE(SUM(cost_cents), 0)::float AS cents,
          count(*)::int AS count
        FROM generations
        WHERE created_at >= now() - (${clamped}::int || ' days')::interval
        GROUP BY model
        ORDER BY cents DESC
      `,
      sql<{ key: string; cents: number; count: number }[]>`
        SELECT
          COALESCE(u.email, g.user_id::text) AS key,
          COALESCE(SUM(g.cost_cents), 0)::float AS cents,
          count(*)::int AS count
        FROM generations g
        LEFT JOIN users u ON u.id = g.user_id
        WHERE g.created_at >= now() - (${clamped}::int || ' days')::interval
        GROUP BY u.email, g.user_id
        ORDER BY cents DESC
        LIMIT 50
      `,
      sql<
        {
          id: string;
          user_id: string;
          user_email: string | null;
          operation: string;
          model: string;
          cost_cents: number;
          latency_ms: number;
          created_at: Date;
        }[]
      >`
        SELECT
          g.id,
          g.user_id,
          u.email AS user_email,
          g.operation,
          g.model,
          g.cost_cents,
          g.latency_ms,
          g.created_at
        FROM generations g
        LEFT JOIN users u ON u.id = g.user_id
        WHERE g.created_at >= now() - (${clamped}::int || ' days')::interval
        ORDER BY g.cost_cents DESC
        LIMIT 20
      `,
    ]);

  return {
    windowDays: clamped,
    totalsInWindow: { cents: totals.cents, generations: totals.count },
    daily: dailyRows.map((r) => ({ date: r.date, cents: r.cents, generations: r.count })),
    byOperation: byOpRows.map((r) => ({ key: r.key, cents: r.cents, generations: r.count })),
    byModel: byModelRows.map((r) => ({ key: r.key, cents: r.cents, generations: r.count })),
    byUser: byUserRows.map((r) => ({ key: r.key, cents: r.cents, generations: r.count })),
    topExpensive: topExpRows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      userEmail: r.user_email,
      operation: r.operation,
      model: r.model,
      costCents: r.cost_cents,
      latencyMs: r.latency_ms,
      createdAt: r.created_at.toISOString(),
    })),
  };
}
