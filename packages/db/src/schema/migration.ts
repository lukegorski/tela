/**
 * Migration bookkeeping tables. Used by the legacy-import pipeline
 * (`@tela/capabilities/migration`) to make re-runs idempotent and
 * to keep an auditable trail of failures.
 *
 * - `migrationLog` is the success-only ID map: ONE row per legacy
 *   entity ever; UNIQUE(user_id, legacy_entity_type, legacy_id)
 *   makes a re-run a fast lookup, not an accidental duplicate.
 * - `migrationFailures` is append-only debug history: multiple rows
 *   per legacy_id allowed across retries, so "tried 3 times, all
 *   failed with HEIC" is visible.
 *
 * Phase 11 (multi-user, admin-driven) keeps both tables — schema is
 * deliberately user-scoped + entity-type-generic.
 */
import { pgTable, uuid, varchar, text, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const migrationLog = pgTable(
  'migration_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** e.g. 'wardrobe_item' | 'outfit' | 'item_photo' | 'context' | 'generation' */
    legacyEntityType: varchar('legacy_entity_type', { length: 50 }).notNull(),
    /** Firestore doc ID, OR a synthetic key like 'synthetic:context:Work:fall' */
    legacyId: varchar('legacy_id', { length: 255 }).notNull(),
    /** Mirrors legacyEntityType in our naming, kept separate so the source/target schemas can drift. */
    newEntityType: varchar('new_entity_type', { length: 50 }).notNull(),
    newId: uuid('new_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('migration_log_user_id_idx').on(table.userId),
    unique('migration_log_user_entity_legacy_uniq').on(
      table.userId,
      table.legacyEntityType,
      table.legacyId,
    ),
  ],
);

export const migrationFailures = pgTable(
  'migration_failures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    legacyEntityType: varchar('legacy_entity_type', { length: 50 }).notNull(),
    legacyId: varchar('legacy_id', { length: 255 }).notNull(),
    reason: text('reason').notNull(),
    attemptAt: timestamp('attempt_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('migration_failures_user_id_idx').on(table.userId)],
);
