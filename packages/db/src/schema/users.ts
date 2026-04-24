import { pgTable, uuid, varchar, timestamp, check, boolean, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Onboarding-derived preferences (from the style quiz).
 * Stored as JSONB for flexibility — the values are tagged strings from
 * predefined option lists (see apps/web/src/lib/onboarding-options.ts).
 */
export interface UserPreferences {
  styleKeywords: string[]; // e.g. ["Minimalist", "Classic"]
  favoriteColors: string[];
  avoidColors: string[];
  formality: string; // one of FORMALITY_OPTIONS
  lifestyle: string; // one of LIFESTYLE_OPTIONS
}

export interface UserBodyInfo {
  bodyType: string;
  height: string;
  fitPreference: string;
}

export interface UserLocation {
  city: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
  tempUnit: 'C' | 'F';
}

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Auth identity (one of email/phone is required, enforced by CHECK constraint below)
    email: varchar('email', { length: 255 }).unique(),
    phone: varchar('phone', { length: 32 }).unique(),
    // Link to Supabase Auth's auth.users table — null if user was created
    // pre-auth (only Luke + cofounder + e2e tests, all of whom will be re-linked
    // when they sign in for the first time)
    authUserId: uuid('auth_user_id').unique(),
    // Profile fields
    displayName: varchar('display_name', { length: 255 }),
    avatarUrl: varchar('avatar_url', { length: 1024 }),
    locale: varchar('locale', { length: 10 }).notNull().default('en'),

    // ─── Admin role (Phase 8.5) ───
    /**
     * True for Luke + cofounder + any operators. Gates the /admin route group
     * and any capability marked `requiresAdmin: true` in the capability registry.
     * Service-account tokens (MCP, workers, scripts) bypass this check by being
     * trusted at the auth layer.
     */
    isAdmin: boolean('is_admin').notNull().default(false),

    // ─── Onboarding state (Phase 8.4) ───
    onboardingComplete: boolean('onboarding_complete').notNull().default(false),
    /** Style quiz preferences. Null until onboarding finished. */
    preferences: jsonb('preferences').$type<UserPreferences>(),
    /** Body info for fit/proportion guidance. Null until onboarding finished. */
    bodyInfo: jsonb('body_info').$type<UserBodyInfo>(),
    /** Geo + timezone for weather-aware suggestions. Null until set. */
    location: jsonb('location').$type<UserLocation>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'users_email_or_phone_required',
      sql`${table.email} IS NOT NULL OR ${table.phone} IS NOT NULL`,
    ),
  ],
);
