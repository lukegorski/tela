import {
  pgTable,
  uuid,
  varchar,
  text,
  real,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { closetItems } from './wardrobe.js';

export const contexts = pgTable('contexts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  weather: jsonb('weather'),
  timeOfDay: varchar('time_of_day', { length: 20 }).notNull(),
  season: varchar('season', { length: 10 }).notNull(),
  occasion: varchar('occasion', { length: 50 }).notNull(),
  calendarContext: text('calendar_context'),
  assembledAt: timestamp('assembled_at', { withTimezone: true }).notNull().defaultNow(),
});

export const generations = pgTable(
  'generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    operation: varchar('operation', { length: 255 }).notNull(),
    promptName: varchar('prompt_name', { length: 255 }).notNull(),
    promptVersionId: uuid('prompt_version_id').notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    inputSnapshot: jsonb('input_snapshot').notNull(),
    rawOutput: text('raw_output').notNull(),
    parsedOutput: jsonb('parsed_output'),
    latencyMs: real('latency_ms').notNull(),
    costCents: real('cost_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('generations_user_id_idx').on(table.userId),
    index('generations_operation_idx').on(table.operation),
  ],
);

export const outfits = pgTable(
  'outfits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * Null for source='manual' outfits (builder v0) — manual outfits have no
     * AI generation or context. The NOT NULL constraints were relaxed in
     * migration 0018 (flagged at the v0 migration review as the one
     * non-purely-additive change). All 'ai' rows keep both populated.
     */
    generationId: uuid('generation_id').references(() => generations.id),
    contextId: uuid('context_id').references(() => contexts.id),
    rationale: text('rationale'),
    name: varchar('name', { length: 120 }),
    wardrobeAssessment: text('wardrobe_assessment'),
    /**
     * 'ai' (outfit.generate) or 'manual' (builder v0's outfit.createManual).
     * Default backfills all pre-builder rows as 'ai' (spec §5).
     */
    source: varchar('source', { length: 10 }).notNull().default('ai'),
    /**
     * Builder card snapshot (client-exported composition collage) in the
     * try-on-results bucket. Null for AI outfits, whose cards render from
     * their item grid. Spec §5 verification 2026-07-08: no outfit-level
     * image mechanism exists today — this column is it.
     */
    cardStoragePath: varchar('card_storage_path', { length: 1024 }),
    pairingKey: varchar('pairing_key', { length: 255 }).notNull(),
    embedding: jsonb('embedding').$type<number[]>(),
    saved: boolean('saved').notNull().default(false),
    savedAt: timestamp('saved_at', { withTimezone: true }),
    feedback: varchar('feedback', { length: 10 }),
    wornAt: timestamp('worn_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('outfits_user_id_idx').on(table.userId),
    index('outfits_pairing_key_idx').on(table.pairingKey),
  ],
);

/**
 * Single active builder draft per user (spec §3, decision #6): whatever the
 * user last assembled restores verbatim on any device. slots holds the
 * composition (slot→closetItemId + dress state); restore skips deleted
 * itemIds gracefully. Concurrent devices: last-write-wins, no merge.
 */
export const outfitDrafts = pgTable('outfit_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  slots: jsonb('slots').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const outfitItems = pgTable(
  'outfit_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    outfitId: uuid('outfit_id')
      .notNull()
      .references(() => outfits.id, { onDelete: 'cascade' }),
    closetItemId: uuid('closet_item_id')
      .notNull()
      .references(() => closetItems.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).notNull(),
  },
  (table) => [
    // At-most-one item per role per outfit, except 'accessory' which is
    // legitimately repeatable (multiple necklaces, rings, scarves). Belt-
    // and-suspenders alongside the application-layer dedup in
    // outfit/generate.ts — the dedup catches AI dupes pre-insert; this
    // constraint stops any code path that bypasses it.
    uniqueIndex('outfit_items_outfit_role_unique')
      .on(table.outfitId, table.role)
      .where(sql`role <> 'accessory'`),
  ],
);
