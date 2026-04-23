import { pgTable, uuid, varchar, real, integer, timestamp } from 'drizzle-orm/pg-core';

/**
 * Per-user, per-capability daily limits. NULL capability = applies to ALL capabilities.
 *
 * Limits are enforced in the AI gateway pre-call. When a limit is hit, the
 * capability returns a clean error (not a silent failure) and an event is logged.
 *
 * Defaults are seeded by packages/db/scripts/seed-rate-limits.mjs and can be
 * adjusted in-place by the cofounder admin (Phase 8.5).
 */
export const rateLimits = pgTable('rate_limits', {
  id: uuid('id').primaryKey().defaultRandom(),
  // NULL userId = the default limit for all users (use as fallback)
  userId: uuid('user_id'),
  // NULL capability = the limit applies across all capabilities for this user
  capabilityName: varchar('capability_name', { length: 100 }),
  // Daily budget in cents. NULL = no limit on this dimension.
  dailyMaxCents: real('daily_max_cents'),
  // Daily call count limit. NULL = no limit on this dimension.
  dailyMaxCalls: integer('daily_max_calls'),
  // Per-call cost ceiling — catches runaway prompts. NULL = no limit.
  perCallMaxCents: real('per_call_max_cents'),
  description: varchar('description', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
