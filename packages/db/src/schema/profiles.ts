import { pgTable, uuid, varchar, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import type { StyleDimensions, DimensionConfidence, StyleSignal } from '@tela/types';

export const styleProfiles = pgTable('style_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  profileText: text('profile_text').notNull(),
  dimensions: jsonb('dimensions').$type<StyleDimensions>().notNull(),
  confidence: jsonb('confidence').$type<DimensionConfidence>().notNull(),
  signals: jsonb('signals').$type<StyleSignal[]>().notNull().default([]),
  latestVersionId: uuid('latest_version_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const styleProfileVersions = pgTable('style_profile_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => styleProfiles.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  profileText: text('profile_text').notNull(),
  dimensions: jsonb('dimensions').$type<StyleDimensions>().notNull(),
  confidence: jsonb('confidence').$type<DimensionConfidence>().notNull(),
  signals: jsonb('signals').$type<StyleSignal[]>().notNull().default([]),
  reason: varchar('reason', { length: 500 }).notNull(),
  triggeredBy: varchar('triggered_by', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
