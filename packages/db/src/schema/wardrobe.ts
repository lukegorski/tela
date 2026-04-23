import {
  pgTable,
  uuid,
  varchar,
  integer,
  real,
  timestamp,
  text,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const closets = pgTable('closets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  itemCount: integer('item_count').notNull().default(0),
  lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itemPhotos = pgTable('item_photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  storagePath: varchar('storage_path', { length: 1024 }).notNull(),
  width: integer('width'),
  height: integer('height'),
  capturedAt: timestamp('captured_at', { withTimezone: true }),
  /**
   * Enhancement pipeline state for the original-uploaded photo.
   * 'pending'    — queued, not yet picked up by worker
   * 'processing' — worker is running gpt-image-1.5
   * 'complete'   — enhanced photo exists at <storagePath>.enhanced.jpg
   *                and background_color/enhanced_storage_path are populated below
   * 'failed'     — gave up after retries; original is still usable as fallback
   * 'skipped'    — not eligible for enhancement (e.g., this row IS the enhanced version)
   * NULL         — legacy / not applicable
   */
  enhancementStatus: varchar('enhancement_status', { length: 20 }),
  enhancementError: varchar('enhancement_error', { length: 500 }),
  enhancementAttempts: integer('enhancement_attempts').notNull().default(0),
  enhancedStoragePath: varchar('enhanced_storage_path', { length: 1024 }),
  /** Detected background color from the enhanced image, e.g. "#f5f5f5" — for UI cards */
  backgroundColor: varchar('background_color', { length: 7 }),
  enhancedAt: timestamp('enhanced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const closetItems = pgTable(
  'closet_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    closetId: uuid('closet_id')
      .notNull()
      .references(() => closets.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    photoId: uuid('photo_id')
      .notNull()
      .references(() => itemPhotos.id),
    enhancedPhotoId: uuid('enhanced_photo_id').references(() => itemPhotos.id),
    backgroundColor: varchar('background_color', { length: 7 }),
    analysisLocale: varchar('analysis_locale', { length: 10 }).notNull().default('en'),

    // Classification
    category: varchar('category', { length: 100 }).notNull(),
    subcategory: varchar('subcategory', { length: 100 }),
    primaryColor: varchar('primary_color', { length: 50 }).notNull(),
    secondaryColor: varchar('secondary_color', { length: 50 }),
    pattern: varchar('pattern', { length: 50 }),
    style: varchar('style', { length: 100 }),
    fit: varchar('fit', { length: 50 }),
    length: varchar('length', { length: 50 }),
    sleeveLength: varchar('sleeve_length', { length: 50 }),
    description: text('description'),

    // Scoring
    formalityScore: real('formality_score').notNull().default(0.5),
    materialWeight: varchar('material_weight', { length: 10 }).notNull().default('medium'),
    seasonCompatibility: jsonb('season_compatibility').$type<string[]>().notNull().default([]),

    // Usage tracking
    wearCount: integer('wear_count').notNull().default(0),
    lastWornAt: timestamp('last_worn_at', { withTimezone: true }),

    // Vector embedding for similarity search (stored as JSONB until pgvector extension is enabled)
    embedding: jsonb('embedding').$type<number[]>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('closet_items_user_id_idx').on(table.userId),
    index('closet_items_closet_id_idx').on(table.closetId),
    index('closet_items_category_idx').on(table.category),
  ],
);
