/**
 * Server-side per-user AI spend breakdown.
 * Mirrors admin.getUserCostsReport capability — keep return shapes aligned.
 * If schema changes, BOTH sites need updating.
 */
import 'server-only';
import { getSql } from '@tela/db';

export interface CostBreakdown {
  key: string;
  cents: number;
  count: number;
}

export interface ExpensiveGeneration {
  id: string;
  operation: string;
  model: string;
  costCents: number;
  latencyMs: number;
  createdAt: string;
}

export interface UserCostsReport {
  totalCostCents: number;
  totalCount: number;
  byOperation: CostBreakdown[];
  byModel: CostBreakdown[];
  topExpensive: ExpensiveGeneration[];
}

export async function getUserCostsReport(userId: string): Promise<UserCostsReport> {
  const sql = getSql();

  const [[totals], byOpRows, byModelRows, topExpRows] = await Promise.all([
    sql<{ cents: number; count: number }[]>`
      SELECT
        COALESCE(SUM(cost_cents), 0)::float AS cents,
        count(*)::int AS count
      FROM generations
      WHERE user_id = ${userId}
    `,
    sql<{ key: string; cents: number; count: number }[]>`
      SELECT
        operation AS key,
        COALESCE(SUM(cost_cents), 0)::float AS cents,
        count(*)::int AS count
      FROM generations
      WHERE user_id = ${userId}
      GROUP BY operation
      ORDER BY cents DESC
    `,
    sql<{ key: string; cents: number; count: number }[]>`
      SELECT
        model AS key,
        COALESCE(SUM(cost_cents), 0)::float AS cents,
        count(*)::int AS count
      FROM generations
      WHERE user_id = ${userId}
      GROUP BY model
      ORDER BY cents DESC
    `,
    sql<
      {
        id: string;
        operation: string;
        model: string;
        cost_cents: number;
        latency_ms: number;
        created_at: Date;
      }[]
    >`
      SELECT id, operation, model, cost_cents, latency_ms, created_at
      FROM generations
      WHERE user_id = ${userId}
      ORDER BY cost_cents DESC
      LIMIT 20
    `,
  ]);

  return {
    totalCostCents: totals.cents,
    totalCount: totals.count,
    byOperation: byOpRows.map((r) => ({ key: r.key, cents: r.cents, count: r.count })),
    byModel: byModelRows.map((r) => ({ key: r.key, cents: r.cents, count: r.count })),
    topExpensive: topExpRows.map((r) => ({
      id: r.id,
      operation: r.operation,
      model: r.model,
      costCents: r.cost_cents,
      latencyMs: r.latency_ms,
      createdAt: new Date(r.created_at as string | Date).toISOString(),
    })),
  };
}
