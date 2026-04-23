/**
 * Read-only cost dashboard. Mounts at /admin/costs (HTML) and /admin/costs.json
 * (JSON). Requires a service-account-level Authorization token.
 *
 * Will be replaced/extended by the cofounder admin app in Phase 8.5.
 */
import type { Hono } from 'hono';
import postgres from 'postgres';
import { contextFromAuthHeader } from '../auth.js';

let _sql: ReturnType<typeof postgres> | null = null;
function getSql() {
  if (_sql) return _sql;
  // Small pool — dashboard is rarely hit and uses ≤4 parallel queries per request
  _sql = postgres(process.env.DATABASE_URL!, { max: 4, idle_timeout: 10, connect_timeout: 10 });
  return _sql;
}

interface DailyTotal {
  day: string;
  total_cents: number;
  call_count: number;
}

interface PerCapability {
  operation: string;
  total_cents: number;
  call_count: number;
}

interface PerUser {
  user_id: string;
  email: string | null;
  total_cents: number;
  call_count: number;
}

async function loadStats() {
  const sql = getSql();
  const [daily, byCapability, byUser, totals] = await Promise.all([
    sql<DailyTotal[]>`
      SELECT
        TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS day,
        COALESCE(SUM(cost_cents)::float, 0) AS total_cents,
        COUNT(*)::int AS call_count
      FROM generations
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY day DESC
    `,
    sql<PerCapability[]>`
      SELECT
        operation,
        COALESCE(SUM(cost_cents)::float, 0) AS total_cents,
        COUNT(*)::int AS call_count
      FROM generations
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY operation
      ORDER BY total_cents DESC
    `,
    sql<PerUser[]>`
      SELECT
        g.user_id,
        u.email,
        COALESCE(SUM(g.cost_cents)::float, 0) AS total_cents,
        COUNT(*)::int AS call_count
      FROM generations g
      LEFT JOIN users u ON u.id = g.user_id
      WHERE g.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY g.user_id, u.email
      ORDER BY total_cents DESC
      LIMIT 50
    `,
    sql<{ total_cents: number; call_count: number }[]>`
      SELECT
        COALESCE(SUM(cost_cents)::float, 0) AS total_cents,
        COUNT(*)::int AS call_count
      FROM generations
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `,
  ]);

  return { daily, byCapability, byUser, totals: totals[0] };
}

function fmtCents(cents: number) {
  if (cents < 100) return `${cents.toFixed(4)}¢`;
  return `$${(cents / 100).toFixed(2)}`;
}

function renderHtml(stats: Awaited<ReturnType<typeof loadStats>>) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Tela Cost Dashboard</title>
<style>
  body { font-family: ui-monospace, SFMono-Regular, monospace; max-width: 960px; margin: 2rem auto; padding: 0 1rem; color: #111; background: #fafafa; }
  h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
  .sub { color: #666; margin-bottom: 2rem; font-size: 0.875rem; }
  h2 { font-size: 1.05rem; margin-top: 2rem; padding-bottom: 0.25rem; border-bottom: 1px solid #ddd; }
  table { border-collapse: collapse; width: 100%; margin-top: 0.5rem; font-size: 0.875rem; }
  th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #f0f0f0; font-weight: 600; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .total { font-weight: 600; background: #f8f8f8; }
  .empty { color: #999; font-style: italic; padding: 1rem 0; }
</style>
</head>
<body>
<h1>Tela Cost Dashboard</h1>
<div class="sub">Last 30 days · Generated ${new Date().toISOString()}</div>

<h2>Total spend</h2>
<table>
  <tr><th>Total cost</th><th>Total calls</th></tr>
  <tr class="total"><td>${fmtCents(stats.totals.total_cents)}</td><td>${stats.totals.call_count}</td></tr>
</table>

<h2>By day</h2>
<table>
  <tr><th>Day</th><th class="num">Cost</th><th class="num">Calls</th></tr>
  ${
    stats.daily.length === 0
      ? '<tr><td colspan="3" class="empty">No activity yet</td></tr>'
      : stats.daily
          .map(
            (d) =>
              `<tr><td>${d.day}</td><td class="num">${fmtCents(d.total_cents)}</td><td class="num">${d.call_count}</td></tr>`,
          )
          .join('')
  }
</table>

<h2>By capability</h2>
<table>
  <tr><th>Operation</th><th class="num">Cost</th><th class="num">Calls</th><th class="num">Avg cost/call</th></tr>
  ${
    stats.byCapability.length === 0
      ? '<tr><td colspan="4" class="empty">No activity yet</td></tr>'
      : stats.byCapability
          .map((c) => {
            const avg = c.call_count > 0 ? c.total_cents / c.call_count : 0;
            return `<tr><td>${c.operation}</td><td class="num">${fmtCents(c.total_cents)}</td><td class="num">${c.call_count}</td><td class="num">${fmtCents(avg)}</td></tr>`;
          })
          .join('')
  }
</table>

<h2>By user (top 50)</h2>
<table>
  <tr><th>User</th><th>Email</th><th class="num">Cost</th><th class="num">Calls</th></tr>
  ${
    stats.byUser.length === 0
      ? '<tr><td colspan="4" class="empty">No activity yet</td></tr>'
      : stats.byUser
          .map(
            (u) =>
              `<tr><td>${u.user_id.slice(0, 8)}…</td><td>${u.email ?? '—'}</td><td class="num">${fmtCents(u.total_cents)}</td><td class="num">${u.call_count}</td></tr>`,
          )
          .join('')
  }
</table>

</body>
</html>`;
}

/**
 * Mount the cost dashboard routes onto the given Hono app.
 * Both routes require admin or service-account auth.
 */
export function mountCostDashboard(app: Hono) {
  const requireAdminOrService = async (c: { req: { header: (n: string) => string | undefined } }) => {
    const ctx = await contextFromAuthHeader(c.req.header('authorization'));
    if (!ctx.isServiceAccount && ctx.source !== 'admin') {
      throw new Error('Admin or service-account access required');
    }
    return ctx;
  };

  app.get('/admin/costs.json', async (c) => {
    try {
      await requireAdminOrService(c);
      const stats = await loadStats();
      return c.json(stats);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 401);
    }
  });

  app.get('/admin/costs', async (c) => {
    try {
      await requireAdminOrService(c);
      const stats = await loadStats();
      return c.html(renderHtml(stats));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.html(`<h1>Unauthorized</h1><pre>${message}</pre>`, 401);
    }
  });
}
