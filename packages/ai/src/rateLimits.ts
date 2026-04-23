/**
 * Rate limit enforcement for AI gateway calls.
 *
 * Reads limits from the rate_limits table:
 *   1. Per-user, per-capability override (if exists)
 *   2. Per-user, all-capabilities override (if exists)
 *   3. Global, per-capability default (userId IS NULL, capability matches)
 *   4. Global, all-capabilities default (userId IS NULL AND capability_name IS NULL)
 *
 * Most-specific rule wins. Each enforced dimension is checked independently.
 *
 * Uses today's spend/call count from the `generations` table (already tracks
 * cost per call) to compute current usage against the daily caps.
 */
import { getDb, generations, rateLimits } from '@tela/db';
import { and, eq, gte, isNull, or, sql } from 'drizzle-orm';

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly dimension: 'daily_cost' | 'daily_calls' | 'per_call_cost',
    public readonly limit: number,
    public readonly current: number,
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

interface ResolvedLimits {
  dailyMaxCents: number | null;
  dailyMaxCalls: number | null;
  perCallMaxCents: number | null;
}

async function resolveLimits(userId: string, capabilityName: string): Promise<ResolvedLimits> {
  const db = getDb();
  // Pull all matching rows; combine in JS picking most-specific values.
  const rows = await db
    .select()
    .from(rateLimits)
    .where(
      or(
        and(eq(rateLimits.userId, userId), eq(rateLimits.capabilityName, capabilityName)),
        and(eq(rateLimits.userId, userId), isNull(rateLimits.capabilityName)),
        and(isNull(rateLimits.userId), eq(rateLimits.capabilityName, capabilityName)),
        and(isNull(rateLimits.userId), isNull(rateLimits.capabilityName)),
      ),
    );

  // Specificity score: per-user+per-cap > per-user > per-cap > global
  const score = (r: { userId: string | null; capabilityName: string | null }) =>
    (r.userId ? 2 : 0) + (r.capabilityName ? 1 : 0);
  const sorted = [...rows].sort((a, b) => score(b) - score(a));

  const merged: ResolvedLimits = {
    dailyMaxCents: null,
    dailyMaxCalls: null,
    perCallMaxCents: null,
  };

  // Most-specific row's non-null values win for each dimension
  for (const row of sorted) {
    if (merged.dailyMaxCents === null && row.dailyMaxCents !== null) {
      merged.dailyMaxCents = row.dailyMaxCents;
    }
    if (merged.dailyMaxCalls === null && row.dailyMaxCalls !== null) {
      merged.dailyMaxCalls = row.dailyMaxCalls;
    }
    if (merged.perCallMaxCents === null && row.perCallMaxCents !== null) {
      merged.perCallMaxCents = row.perCallMaxCents;
    }
  }

  return merged;
}

interface UsageToday {
  totalCostCents: number;
  callCount: number;
}

async function getUsageToday(userId: string, capabilityName: string): Promise<UsageToday> {
  const db = getDb();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      totalCostCents: sql<number>`COALESCE(SUM(${generations.costCents}), 0)`,
      callCount: sql<number>`COUNT(*)::int`,
    })
    .from(generations)
    .where(
      and(
        eq(generations.userId, userId),
        eq(generations.operation, capabilityName),
        gte(generations.createdAt, startOfDay),
      ),
    );

  const r = rows[0];
  return {
    totalCostCents: Number(r?.totalCostCents ?? 0),
    callCount: Number(r?.callCount ?? 0),
  };
}

/**
 * Check pre-call limits (per_call_max + daily_max_calls + daily_max_cents based on
 * current usage). Throws RateLimitError if any limit is exceeded.
 *
 * The per_call_max check is approximate at this point — we don't know the actual
 * cost until after the call. Real protection happens at config-time via maxTokens
 * on the AI request. Here we just verify the user has BUDGET for at least one
 * call assuming a small cost.
 */
export async function checkRateLimitsBeforeCall(
  userId: string,
  capabilityName: string,
): Promise<void> {
  const limits = await resolveLimits(userId, capabilityName);
  const usage = await getUsageToday(userId, capabilityName);

  if (limits.dailyMaxCalls !== null && usage.callCount >= limits.dailyMaxCalls) {
    throw new RateLimitError(
      `Daily call limit reached for ${capabilityName} (${usage.callCount}/${limits.dailyMaxCalls} calls today)`,
      'daily_calls',
      limits.dailyMaxCalls,
      usage.callCount,
    );
  }

  if (limits.dailyMaxCents !== null && usage.totalCostCents >= limits.dailyMaxCents) {
    throw new RateLimitError(
      `Daily spend limit reached for ${capabilityName} ($${(usage.totalCostCents / 100).toFixed(4)} of $${(limits.dailyMaxCents / 100).toFixed(2)} cap today)`,
      'daily_cost',
      limits.dailyMaxCents,
      usage.totalCostCents,
    );
  }
}

/**
 * Check post-call: did this single call exceed the per_call_max?
 * If so, the call already happened (and was charged) but we surface it as a
 * loud error so the user / dev knows to investigate the prompt or cap.
 */
export async function checkRateLimitsAfterCall(
  userId: string,
  capabilityName: string,
  thisCallCostCents: number,
): Promise<void> {
  const limits = await resolveLimits(userId, capabilityName);
  if (limits.perCallMaxCents !== null && thisCallCostCents > limits.perCallMaxCents) {
    throw new RateLimitError(
      `Single call cost ${thisCallCostCents.toFixed(4)}¢ exceeded per-call cap of ${limits.perCallMaxCents}¢ for ${capabilityName}`,
      'per_call_cost',
      limits.perCallMaxCents,
      thisCallCostCents,
    );
  }
}
