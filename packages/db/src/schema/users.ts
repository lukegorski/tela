import { pgTable, uuid, varchar, text, timestamp, check, boolean, jsonb } from 'drizzle-orm/pg-core';
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
  /** Optional — Open-Meteo geocoding returns it; the legacy app stores it
   * conditionally. Allowing absent keeps the shape interoperable with
   * both paths. */
  country?: string;
  lat: number;
  lon: number;
  timezone: string;
  tempUnit: 'C' | 'F';
}

/**
 * Try-on configuration the user has chosen. Mirrors the legacy
 * `TryOnSettings` shape so ported settings UI maps 1:1 onto our backend.
 *
 * - background: aesthetic backdrop the model is rendered against
 * - model: 'self' uses the user's uploaded photo; the model-* options are
 *   the built-in models (see /public/models/)
 * - selfPhotoURL: storage URL for the user's uploaded model photo when
 *   model === 'self'. Null when not uploaded.
 */
export interface UserTryOnSettings {
  background: 'neutral' | 'chic-interior' | 'nighttime';
  model: 'self' | 'model-woman' | 'model-man';
  selfPhotoURL: string | null;
}

export const DEFAULT_TRY_ON_SETTINGS: UserTryOnSettings = {
  background: 'neutral',
  model: 'model-woman',
  selfPhotoURL: null,
};

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
    avatarUrl: text('avatar_url'),
    locale: varchar('locale', { length: 10 }).notNull().default('en'),

    // ─── Admin role (Phase 8.5) ───
    /**
     * True for Luke + cofounder + any operators. Gates the /admin route group
     * and any capability marked `requiresAdmin: true` in the capability registry.
     * Service-account tokens (MCP, workers, scripts) bypass this check by being
     * trusted at the auth layer.
     */
    isAdmin: boolean('is_admin').notNull().default(false),

    // ─── Feature flags (builder v0, spec §5) ───
    /**
     * Per-user feature flags, e.g. { "builder": true }. NEVER read directly
     * by gates — every gate goes through deriveEntitlements() (the
     * entitlements choke point), so future billing swaps the derivation,
     * not the gates. Flipped via scripts in beta; admin UI arrives in v1.
     */
    features: jsonb('features').$type<Record<string, unknown>>().notNull().default({}),

    // ─── Onboarding state (Phase 8.4) ───
    onboardingComplete: boolean('onboarding_complete').notNull().default(false),
    /** Style quiz preferences. Null until onboarding finished. */
    preferences: jsonb('preferences').$type<UserPreferences>(),
    /** Body info for fit/proportion guidance. Null until onboarding finished. */
    bodyInfo: jsonb('body_info').$type<UserBodyInfo>(),
    /** Geo + timezone for weather-aware suggestions. Null until set. */
    location: jsonb('location').$type<UserLocation>(),

    // ─── Try-on settings (Phase visual-port) ───
    /**
     * Try-on rendering preferences (background style, model choice).
     * Null until the user touches the try-on settings UI; the app reads
     * with a DEFAULT_TRY_ON_SETTINGS fallback.
     */
    tryOnSettings: jsonb('try_on_settings').$type<UserTryOnSettings>(),

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
