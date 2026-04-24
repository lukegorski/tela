/**
 * Server-side user lookups. Used by RSC pages to make routing decisions
 * (onboarding state, etc.) without going through the tRPC layer.
 *
 * Reads our Postgres `users` row keyed by Supabase auth.users.id.
 */
import 'server-only';
import postgres from 'postgres';

let _sql: ReturnType<typeof postgres> | null = null;
function getSql() {
  if (_sql) return _sql;
  _sql = postgres(process.env.DATABASE_URL!, {
    max: 3,
    idle_timeout: 10,
    connect_timeout: 10,
  });
  return _sql;
}

export interface UserPreferences {
  styleKeywords: string[];
  favoriteColors: string[];
  avoidColors: string[];
  formality: string;
  lifestyle: string;
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

export interface AppUser {
  id: string;
  email: string | null;
  phone: string | null;
  authUserId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  locale: string;
  onboardingComplete: boolean;
  hasLocation: boolean;
  preferences: UserPreferences | null;
  bodyInfo: UserBodyInfo | null;
  location: UserLocation | null;
}

/**
 * Look up the canonical app user row by Supabase auth user id.
 * Returns null if no row exists yet (first-call bootstrapping happens on
 * the API side via auth.whoami).
 */
export async function getAppUserByAuthId(authUserId: string): Promise<AppUser | null> {
  const sql = getSql();
  const rows = await sql<
    {
      id: string;
      email: string | null;
      phone: string | null;
      auth_user_id: string | null;
      display_name: string | null;
      avatar_url: string | null;
      locale: string;
      onboarding_complete: boolean;
      preferences: UserPreferences | null;
      body_info: UserBodyInfo | null;
      location: UserLocation | null;
    }[]
  >`
    SELECT id, email, phone, auth_user_id, display_name, avatar_url, locale,
           onboarding_complete, preferences, body_info, location
    FROM users
    WHERE auth_user_id = ${authUserId}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    email: r.email,
    phone: r.phone,
    authUserId: r.auth_user_id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    locale: r.locale,
    onboardingComplete: r.onboarding_complete,
    hasLocation: r.location !== null,
    preferences: r.preferences,
    bodyInfo: r.body_info,
    location: r.location,
  };
}
