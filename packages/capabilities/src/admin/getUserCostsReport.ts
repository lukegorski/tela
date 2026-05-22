import { z } from 'zod';
import { eq, desc, sql as drizzleSql } from 'drizzle-orm';
import { getDb, generations } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({
  userId: z.string().uuid(),
});

const breakdown = z.object({
  key: z.string(),
  cents: z.number(),
  count: z.number().int(),
});

const expensiveGeneration = z.object({
  id: z.string().uuid(),
  operation: z.string(),
  model: z.string(),
  costCents: z.number(),
  latencyMs: z.number(),
  createdAt: z.string(),
});

const output = z.object({
  totalCostCents: z.number(),
  totalCount: z.number().int(),
  byOperation: z.array(breakdown),
  byModel: z.array(breakdown),
  topExpensive: z.array(expensiveGeneration),
});

/**
 * Per-user AI spend breakdown — totals, breakdown by operation, breakdown
 * by model, and the 20 most expensive single generations. Admin only.
 */
export const getUserCostsReport = registerCapability({
  name: 'admin.getUserCostsReport',
  description:
    'AI cost report for a single user: total spend, breakdowns by operation + model, and the 20 most expensive generations. Admin only.',
  input,
  output,
  requiresAdmin: true,
  chatTool: true,

  async execute({ userId }) {
    const db = getDb();
    const userFilter = eq(generations.userId, userId);

    const [[totals], byOp, byModel, topExp] = await Promise.all([
      db
        .select({
          cents: drizzleSql<number>`coalesce(sum(${generations.costCents}), 0)::float`,
          count: drizzleSql<number>`count(*)::int`,
        })
        .from(generations)
        .where(userFilter),

      db
        .select({
          key: generations.operation,
          cents: drizzleSql<number>`coalesce(sum(${generations.costCents}), 0)::float`,
          count: drizzleSql<number>`count(*)::int`,
        })
        .from(generations)
        .where(userFilter)
        .groupBy(generations.operation)
        .orderBy(drizzleSql`coalesce(sum(${generations.costCents}), 0) DESC`),

      db
        .select({
          key: generations.model,
          cents: drizzleSql<number>`coalesce(sum(${generations.costCents}), 0)::float`,
          count: drizzleSql<number>`count(*)::int`,
        })
        .from(generations)
        .where(userFilter)
        .groupBy(generations.model)
        .orderBy(drizzleSql`coalesce(sum(${generations.costCents}), 0) DESC`),

      db
        .select({
          id: generations.id,
          operation: generations.operation,
          model: generations.model,
          costCents: generations.costCents,
          latencyMs: generations.latencyMs,
          createdAt: generations.createdAt,
        })
        .from(generations)
        .where(userFilter)
        .orderBy(desc(generations.costCents))
        .limit(20),
    ]);

    return {
      totalCostCents: totals.cents,
      totalCount: totals.count,
      byOperation: byOp.map((r) => ({ key: r.key, cents: r.cents, count: r.count })),
      byModel: byModel.map((r) => ({ key: r.key, cents: r.cents, count: r.count })),
      topExpensive: topExp.map((g) => ({
        id: g.id,
        operation: g.operation,
        model: g.model,
        costCents: g.costCents,
        latencyMs: g.latencyMs,
        createdAt: g.createdAt.toISOString(),
      })),
    };
  },
});
