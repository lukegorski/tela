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
} from 'drizzle-orm/pg-core';
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
    generationId: uuid('generation_id')
      .notNull()
      .references(() => generations.id),
    contextId: uuid('context_id')
      .notNull()
      .references(() => contexts.id),
    rationale: text('rationale').notNull(),
    pairingKey: varchar('pairing_key', { length: 255 }).notNull(),
    embedding: jsonb('embedding').$type<number[]>(),
    saved: boolean('saved').notNull().default(false),
    wornAt: timestamp('worn_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('outfits_user_id_idx').on(table.userId),
    index('outfits_pairing_key_idx').on(table.pairingKey),
  ],
);

export const outfitItems = pgTable('outfit_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  outfitId: uuid('outfit_id')
    .notNull()
    .references(() => outfits.id, { onDelete: 'cascade' }),
  closetItemId: uuid('closet_item_id')
    .notNull()
    .references(() => closetItems.id),
  role: varchar('role', { length: 20 }).notNull(),
});
