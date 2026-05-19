/**
 * Phase 11 D2 — pre-create helpers.
 *
 * Codifies what D1 (M2) manually validated: for each legacy user, ensure:
 *   1. A Supabase auth.users row exists for their email (created via the
 *      Admin API with email_confirm=true so verified-email matching works
 *      when they OAuth-sign-in).
 *   2. A matching app `users` row exists, with auth_user_id linked,
 *      onboarding_complete=true, and try_on_settings populated (M3 — so
 *      they don't land in the D.5 quiz or model picker on first sign-in).
 *
 * Healing semantics (idempotent):
 *   - auth.users missing → create via admin API
 *   - app users missing → INSERT
 *   - auth_user_id missing on app users → patch
 *   - onboarding_complete=false → set to true
 *   - try_on_settings null → set to default
 *
 * Also enumerates legacy users for the multi-user CLI's --all / --list /
 * --pre-create-users modes.
 */
import { eq, sql } from 'drizzle-orm';
import {
  getDb,
  users,
  DEFAULT_TRY_ON_SETTINGS,
} from '@tela/db';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { getLegacyAuth, getLegacyDb } from './firebase.js';
import type { LegacyUserProfile } from './legacyShapes.js';

export interface LegacyUserRecord {
  legacyUid: string;
  email: string;
  /** Display name from Firebase Auth (may differ from Firestore profile.displayName). */
  displayName: string | null;
  /** Photo URL from Firebase Auth (Google avatar). */
  photoUrl: string | null;
}

export interface PreCreateResult {
  legacyUid: string;
  email: string;
  authUserId: string;
  newUserId: string;
  /** What the pre-create did, in the order it did it. In dry-run mode, the actions that WOULD have been performed. */
  actions: PreCreateAction[];
  /** True if any writes (create/insert/patch) were skipped because dryRun=true. */
  dryRun: boolean;
}

export type PreCreateAction =
  | 'created_auth_user'
  | 'reused_auth_user'
  | 'inserted_app_user'
  | 'patched_auth_user_id'
  | 'set_onboarding_complete'
  | 'set_try_on_settings';

export interface PreCreateOptions {
  /** If true, no writes — just inspect current state and report what would happen. */
  dryRun?: boolean;
}

/**
 * Enumerate all legacy users via Firebase Auth's paginated listing.
 * Filters out users without an email (auth-only by phone, etc. — none in
 * our 9-user inventory but defending against the shape).
 */
export async function enumerateLegacyUsers(): Promise<LegacyUserRecord[]> {
  const auth = getLegacyAuth();
  const out: LegacyUserRecord[] = [];
  let pageToken: string | undefined = undefined;
  for (;;) {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      if (!u.email) continue;
      out.push({
        legacyUid: u.uid,
        email: u.email.toLowerCase(),
        displayName: u.displayName ?? null,
        photoUrl: u.photoURL ?? null,
      });
    }
    if (!page.pageToken) break;
    pageToken = page.pageToken;
  }
  return out;
}

/**
 * Read a legacy user's Firestore profile doc. Returns null if missing
 * (auth user with no Firestore profile — possible for users who signed
 * up but never finished any profile flow).
 */
async function readLegacyProfile(legacyUid: string): Promise<LegacyUserProfile | null> {
  const db = getLegacyDb();
  const snap = await db.collection('users').doc(legacyUid).get();
  if (!snap.exists) return null;
  return snap.data() as LegacyUserProfile;
}

/**
 * Pre-create / heal one user's auth + app rows so first sign-in lands on
 * their migrated data instead of creating a fresh orphan account.
 *
 * Idempotent: every step checks current state and only writes what's
 * missing or wrong. Re-running on a fully-prepared user is a no-op
 * (returns actions=[]).
 *
 * Pass `{ dryRun: true }` to preview the actions that WOULD be taken
 * without performing any writes. Returned UUIDs in dry-run mode for
 * not-yet-existing rows are zero-UUIDs (placeholder).
 */
export async function preCreateUser(
  legacyEmail: string,
  opts: PreCreateOptions = {},
): Promise<PreCreateResult> {
  const dryRun = opts.dryRun ?? false;
  const email = legacyEmail.trim().toLowerCase();

  // ─── Resolve legacy uid + display fields ───
  const legacyAuth = getLegacyAuth();
  let legacyAuthUser;
  try {
    legacyAuthUser = await legacyAuth.getUserByEmail(email);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Legacy Firebase Auth has no user for email ${email}: ${msg}`);
  }
  const legacyUid = legacyAuthUser.uid;
  const legacyDisplayName = legacyAuthUser.displayName ?? null;
  // Defensive clamp: users.avatar_url is varchar(1024). Some Google profile
  // photo URLs (long signed-token variants — see Isaac's account) blow past
  // that. Null it out rather than failing the insert; the avatar will fall
  // back to default UI and the user can update it later. Sentinel length
  // matches the schema constraint exactly.
  const rawPhotoUrl = legacyAuthUser.photoURL ?? null;
  const legacyPhotoUrl = rawPhotoUrl && rawPhotoUrl.length <= 1024 ? rawPhotoUrl : null;

  // Read profile doc for additional fields (locale, body info, etc. — though
  // only locale is relevant at pre-create time; the full profile merge
  // happens later in migrateProfile during the actual migration phase).
  const legacyProfile = await readLegacyProfile(legacyUid);
  const legacyLocale = legacyProfile?.locale ?? null;

  const actions: PreCreateAction[] = [];
  const PLACEHOLDER_UUID = '00000000-0000-0000-0000-000000000000';

  // ─── Auth side ───
  const supabase = getSupabaseAdmin();
  let authUserId: string;
  const existingAuth = await findAuthUserByEmail(email);
  if (existingAuth) {
    authUserId = existingAuth.id;
    actions.push('reused_auth_user');
  } else if (dryRun) {
    authUserId = PLACEHOLDER_UUID;
    actions.push('created_auth_user');
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        migrated_from_legacy: true,
        legacy_uid: legacyUid,
      },
    });
    if (error || !data.user) {
      throw new Error(`auth.admin.createUser failed for ${email}: ${error?.message ?? 'no user returned'}`);
    }
    authUserId = data.user.id;
    actions.push('created_auth_user');
  }

  // ─── App side ───
  const db = getDb();
  const existingApp = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${email}`,
  });

  let newUserId: string;
  if (!existingApp) {
    actions.push('inserted_app_user');
    if (dryRun) {
      newUserId = PLACEHOLDER_UUID;
    } else {
      const [created] = await db
        .insert(users)
        .values({
          authUserId,
          email,
          displayName: legacyDisplayName,
          avatarUrl: legacyPhotoUrl,
          locale: legacyLocale ?? 'en',
          onboardingComplete: true,
          tryOnSettings: DEFAULT_TRY_ON_SETTINGS,
        })
        .returning({ id: users.id });
      newUserId = created.id;
    }
  } else {
    newUserId = existingApp.id;
    // Heal individual fields if drifted from M1+M3 expectations.
    const patch: Record<string, unknown> = {};
    if (existingApp.authUserId == null) {
      patch.authUserId = authUserId;
      actions.push('patched_auth_user_id');
    } else if (existingApp.authUserId !== authUserId) {
      // Conflict: app user is linked to a DIFFERENT auth user than the one
      // we just resolved/created. This means a prior sign-in or test left
      // an inconsistent state. Don't silently overwrite — surface to caller.
      throw new Error(
        `App user ${existingApp.id} for ${email} is linked to auth_user_id=${existingApp.authUserId}, ` +
          `but we resolved/created authUserId=${authUserId}. Inconsistent state — investigate before re-running.`,
      );
    }
    if (!existingApp.onboardingComplete) {
      patch.onboardingComplete = true;
      actions.push('set_onboarding_complete');
    }
    if (existingApp.tryOnSettings == null) {
      patch.tryOnSettings = DEFAULT_TRY_ON_SETTINGS;
      actions.push('set_try_on_settings');
    }
    if (Object.keys(patch).length > 0 && !dryRun) {
      patch.updatedAt = new Date();
      await db.update(users).set(patch).where(eq(users.id, newUserId));
    }
  }

  return {
    legacyUid,
    email,
    authUserId,
    newUserId,
    actions,
    dryRun,
  };
}

/**
 * Filter a list of legacy users by inclusion / exclusion. Both lists
 * accept comma-separated emails (case-insensitive).
 */
export function applyEmailFilters(
  records: LegacyUserRecord[],
  opts: { skip?: string[]; only?: string[] },
): LegacyUserRecord[] {
  const skip = new Set((opts.skip ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean));
  const only = new Set((opts.only ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean));
  return records.filter((r) => {
    if (skip.has(r.email)) return false;
    if (only.size > 0 && !only.has(r.email)) return false;
    return true;
  });
}

// ─── Helpers ───

interface AuthUserMatch {
  id: string;
  email: string | null;
}

async function findAuthUserByEmail(email: string): Promise<AuthUserMatch | null> {
  const supabase = getSupabaseAdmin();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`auth.admin.listUsers failed: ${error.message}`);
    const users = data?.users ?? [];
    for (const u of users) {
      if ((u.email ?? '').toLowerCase() === email) {
        return { id: u.id, email: u.email ?? null };
      }
    }
    if (users.length < perPage) break;
    page += 1;
    if (page > 50) break; // safety stop — 10k users
  }
  return null;
}
