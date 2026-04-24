import { z } from 'zod';
import { sql as drizzleSql } from 'drizzle-orm';
import { getDb, generations, users } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({
  /** Number of days to roll back for the time-series. Capped at 90. */
  days: z.number().int().min(1).max(90).default(30),
});

const dailyPoint = z.object({
  date: z.string(), // YYYY-MM-DD
  cents: z.number(),
  generations: z.number().int(),
});

const breakdown = z.object({
  key: z.string(),
  cents: z.number(),
  generations: z.number().int(),
});

const recentGeneration = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  userEmail: z.string().nullable(),
  operation: z.string(),
  model: z.string(),
  costCents: z.number(),
  latencyMs: z.number(),
  createdAt: z.string(),
});

const output = z.object({
  windowDays: z.number().int(),
  totalsInWindow: z.object({
    cents: z.number(),
    generations: z.number().int(),
  }),
  daily: z.array(dailyPoint),
  byOperation: z.array(breakdown),
  byModel: z.array(breakdown),
  byUser: z.array(breakdown),
  topExpensive: z.array(recentGeneration),
});

/**
 * Aggregate AI spend across the last N days. Returns:
 *   - totals over the window
 *   - daily time-series (one row per calendar day)
 *   - breakdowns by operation, model, user (cents desc)
 *   - 20 most expensive single generations in the window
 *
 * All queries run in parallel against the generations table.
 *
 * Admin only.
 */
export const getCosts = registerCapability({
  name: 'admin.getCosts',
  description:
    'AI cost dashboard data for the last N days (default 30, max 90): totals, daily series, breakdowns by operation/model/user, and the 20 most expensive recent generations. Admin only.',
  input,
  output,
  requiresAdmin: true,

  async execute({ days }) {
    const db = getDb();
    const intervalSql = drizzleSql.raw(`'${days} days'`);

    const windowFilter = drizzleSql`${generations.createdAt} >= now() - interval ${intervalSql}`;

    const [
      [totals],
      dailyRows,
      byOp,
      byModel,
      byUserRows,
      topExp,
    ] = await Promise.all([
      db
        .select({
          cents: drizzleSql<number>`coalesce(sum(${generations.costCents}), 0)::float`,
          count: drizzleSql<number>`count(*)::int`,
        })
        .from(generations)
        .where(windowFilter),

      db
        .select({
          date: drizzleSql<string>`to_char(date_trunc('day', ${generations.createdAt}), 'YYYY-MM-DD')`,
          cents: drizzleSql<number>`coalesce(sum(${generations.costCents}), 0)::float`,
          count: drizzleSql<number>`count(*)::int`,
        })
        .from(generations)
        .where(windowFilter)
        .groupBy(drizzleSql`date_trunc('day', ${generations.createdAt})`)
        .orderBy(drizzleSql`date_trunc('day', ${generations.createdAt}) ASC`),

      db
        .select({
          key: generations.operation,
          cents: drizzleSql<number>`coalesce(sum(${generations.costCents}), 0)::float`,
          count: drizzleSql<number>`count(*)::int`,
        })
        .from(generations)
        .where(windowFilter)
        .groupBy(generations.operation)
        .orderBy(drizzleSql`coalesce(sum(${generations.costCents}), 0) DESC`),

      db
        .select({
          key: generations.model,
          cents: drizzleSql<number>`coalesce(sum(${generations.costCents}), 0)::float`,
          count: drizzleSql<number>`count(*)::int`,
        })
        .from(generations)
        .where(windowFilter)
        .groupBy(generations.model)
        .orderBy(drizzleSql`coalesce(sum(${generations.costCents}), 0) DESC`),

      db
        .select({
          userId: generations.userId,
          email: users.email,
          cents: drizzleSql<number>`coalesce(sum(${generations.costCents}), 0)::float`,
          count: drizzleSql<number>`count(*)::int`,
        })
        .from(generations)
        .leftJoin(users, drizzleSql`${users.id} = ${generations.userId}`)
        .where(windowFilter)
        .groupBy(generations.userId, users.email)
        .orderBy(drizzleSql`coalesce(sum(${generations.costCents}), 0) DESC`)
        .limit(50),

      db
        .select({
          id: generations.id,
          userId: generations.userId,
          userEmail: users.email,
          operation: generations.operation,
          model: generations.model,
          costCents: generations.costCents,
          latencyMs: generations.latencyMs,
          createdAt: generations.createdAt,
        })
        .from(generations)
        .leftJoin(users, drizzleSql`${users.id} = ${generations.userId}`)
        .where(windowFilter)
        .orderBy(drizzleSql`${generations.costCents} DESC`)
        .limit(20),
    ]);

    return {
      windowDays: days,
      totalsInWindow: { cents: totals.cents, generations: totals.count },
      daily: dailyRows.map((d) => ({ date: d.date, cents: d.cents, generations: d.count })),
      byOperation: byOp.map((r) => ({ key: r.key, cents: r.cents, generations: r.count })),
      byModel: byModel.map((r) => ({ key: r.key, cents: r.cents, generations: r.count })),
      byUser: byUserRows.map((r) => ({
        key: r.email ?? r.userId,
        cents: r.cents,
        generations: r.count,
      })),
      topExpensive: topExp.map((g) => ({
        id: g.id,
        userId: g.userId,
        userEmail: g.userEmail,
        operation: g.operation,
        model: g.model,
        costCents: g.costCents,
        latencyMs: g.latencyMs,
        createdAt: g.createdAt.toISOString(),
      })),
    };
  },
});
