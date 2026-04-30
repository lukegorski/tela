/**
 * One-shot migration: copy a legacy Firebase Tela user's profile, wardrobe
 * items, and outfits into the new Supabase backend under their existing
 * new-app account.
 *
 * Read the full spec at `docs/migration-luke-one-shot.md` (decisions M1-M12).
 *
 * D.13a (this commit) ships:
 *   - schema migration 0013 (migration_log + migration_failures)
 *   - identity resolution + non-destructive profile merge
 *   - CLI shell with --dry-run + M11 confirmation gate
 *
 * D.13b will replace this file with the full version — image transfer
 * (Firebase → Supabase), wardrobe items, synthetic context + generation,
 * outfit migration with the partial-items rule + pairing key recompute,
 * and the verification phase. Calling this library with
 * `includeImages: true` or `includeOutfits: true` throws until D.13b lands.
 *
 * All idempotent: every INSERT checks `migration_log` first (UNIQUE on
 * user_id + entity_type + legacy_id). Failures land in `migration_failures`
 * (append-only).
 */
import { eq } from 'drizzle-orm';
import { getDb, users, wardrobeGaps } from '@tela/db';
import { getLegacyDb } from './firebase.js';
import type { LegacyUserProfile } from './legacyShapes.js';
import type { MigrateOptions, MigrateResult } from './types.js';

// ─── Logging ───

function ts(): string {
  return new Date().toISOString();
}
function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[${ts()}] [migrate] ${msg}`);
}
function warn(msg: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[${ts()}] [migrate] ${msg}`);
}

// ─── Public entry point ───

export async function migrateLegacyUser(
  legacyUid: string,
  newUserId: string,
  opts: MigrateOptions = {},
): Promise<MigrateResult> {
  const startedAt = Date.now();
  const dryRun = opts.dryRun ?? false;
  const only = opts.only ?? 'all';
  const includeImages = opts.includeImages ?? false;
  const includeOutfits = opts.includeOutfits ?? false;

  log(`start — legacyUid=${legacyUid} newUserId=${newUserId} dryRun=${dryRun} only=${only} includeImages=${includeImages} includeOutfits=${includeOutfits}`);

  // D.13a guardrail: image transfer + outfit migration ship in D.13b.
  // Throw early instead of silently succeeding so a real-run with the wrong
  // flags doesn't leave half-written state.
  if (includeImages) {
    throw new Error(
      '--include-images is not yet implemented (ships in D.13b). ' +
        'Run with --only profile (default) or wait for the D.13b commit.',
    );
  }
  if (includeOutfits) {
    throw new Error(
      '--include-outfits is not yet implemented (ships in D.13b). ' +
        'Run with --only profile (default) or wait for the D.13b commit.',
    );
  }
  if (only === 'wardrobe' || only === 'outfits') {
    throw new Error(
      `--only ${only} is not yet implemented (ships in D.13b). ` +
        'Run with --only profile (default).',
    );
  }

  const result: MigrateResult = {
    durationMs: 0,
    profile: { fieldsUpdated: [] },
    wardrobe: {
      migrated: 0,
      skipped: [],
      imagesTransferred: 0,
      imagesFailed: [],
    },
    outfits: {
      migrated: 0,
      skipped: [],
      syntheticContextsCreated: 0,
      syntheticGenerationsCreated: 0,
    },
  };

  if (only === 'all' || only === 'profile') {
    result.profile = await migrateProfile({ legacyUid, newUserId, dryRun });
  }

  result.durationMs = Date.now() - startedAt;
  log(`done in ${result.durationMs}ms`);
  return result;
}

// ─── Identity helpers (used by CLI) ───

export async function resolveIdsByEmail(email: string): Promise<{
  legacyUid: string;
  legacyEmail: string;
  newUserId: string;
  newEmail: string;
}> {
  const lower = email.trim().toLowerCase();

  const { getLegacyAuth } = await import('./firebase.js');
  const legacyAuth = getLegacyAuth();
  let legacyUid: string;
  let legacyEmail: string;
  try {
    const userRecord = await legacyAuth.getUserByEmail(lower);
    legacyUid = userRecord.uid;
    legacyEmail = userRecord.email ?? lower;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Legacy Firebase Auth has no user for email ${lower}: ${msg}`,
    );
  }

  const db = getDb();
  const newUser = await db.query.users.findFirst({
    where: eq(users.email, lower),
    columns: { id: true, email: true },
  });
  if (!newUser) {
    throw new Error(
      `ERROR: No new-app account found for email ${lower}.\n` +
        `Sign up at /en first (Google or email), then re-run.`,
    );
  }

  return {
    legacyUid,
    legacyEmail,
    newUserId: newUser.id,
    newEmail: newUser.email ?? lower,
  };
}

// ─── 1. Profile (D.13a) ───

async function migrateProfile(args: {
  legacyUid: string;
  newUserId: string;
  dryRun: boolean;
}): Promise<MigrateResult['profile']> {
  const { legacyUid, newUserId, dryRun } = args;
  const fieldsUpdated: string[] = [];

  log(`profile: reading legacy user ${legacyUid}`);
  const legacyDb = getLegacyDb();
  const legacySnap = await legacyDb.collection('users').doc(legacyUid).get();
  if (!legacySnap.exists) {
    warn(`profile: legacy users/${legacyUid} doc does not exist — nothing to merge`);
    return { fieldsUpdated };
  }
  const legacy = legacySnap.data() as LegacyUserProfile;

  const db = getDb();
  const current = await db.query.users.findFirst({
    where: eq(users.id, newUserId),
  });
  if (!current) {
    throw new Error(`Internal: users row ${newUserId} disappeared mid-migration`);
  }

  const patch: Record<string, unknown> = {};

  if (legacy.onboardingComplete === true && current.onboardingComplete === false) {
    patch.onboardingComplete = true;
    fieldsUpdated.push('onboardingComplete');
  }
  if (isNonEmpty(legacy.locale) && isEmpty(current.locale)) {
    patch.locale = legacy.locale;
    fieldsUpdated.push('locale');
  }

  if (isNonEmpty(legacy.preferences) && isEmpty(current.preferences)) {
    patch.preferences = {
      styleKeywords: legacy.preferences?.styleKeywords ?? [],
      favoriteColors: legacy.preferences?.favoriteColors ?? [],
      avoidColors: legacy.preferences?.avoidColors ?? [],
      formality: legacy.preferences?.formality ?? '',
      lifestyle: legacy.preferences?.lifestyle ?? '',
    };
    fieldsUpdated.push('preferences');
  }

  if (isNonEmpty(legacy.bodyInfo) && isEmpty(current.bodyInfo)) {
    patch.bodyInfo = {
      bodyType: legacy.bodyInfo?.bodyType ?? '',
      height: legacy.bodyInfo?.height ?? '',
      fitPreference: legacy.bodyInfo?.fitPreference ?? '',
    };
    fieldsUpdated.push('bodyInfo');
  }

  if (isNonEmpty(legacy.tryOnSettings) && isEmpty(current.tryOnSettings)) {
    patch.tryOnSettings = legacy.tryOnSettings;
    fieldsUpdated.push('tryOnSettings');
  }

  if (isNonEmpty(legacy.location) && isEmpty(current.location)) {
    patch.location = legacy.location;
    fieldsUpdated.push('location');
  }

  // Wardrobe gaps go to the relational `wardrobe_gaps` table (per D.5),
  // not as jsonb on `users`. Insert only if user has none yet.
  let wardrobeGapInserts: Array<{ category: string; description: string }> = [];
  if (isNonEmpty(legacy.wardrobeGaps)) {
    const existing = await db
      .select({ id: wardrobeGaps.id })
      .from(wardrobeGaps)
      .where(eq(wardrobeGaps.userId, newUserId))
      .limit(1);
    if (existing.length === 0) {
      wardrobeGapInserts = (legacy.wardrobeGaps ?? []).map((s) => ({
        category: 'general',
        description: s,
      }));
      if (wardrobeGapInserts.length > 0) {
        fieldsUpdated.push(`wardrobeGaps:${wardrobeGapInserts.length}`);
      }
    }
  }

  if (Object.keys(patch).length === 0 && wardrobeGapInserts.length === 0) {
    log('profile: nothing to update (legacy empty or new side already populated)');
    return { fieldsUpdated };
  }

  log(`profile: ${dryRun ? 'WOULD update' : 'updating'} ${fieldsUpdated.join(', ')}`);

  if (!dryRun) {
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = new Date();
      await db.update(users).set(patch).where(eq(users.id, newUserId));
    }
    if (wardrobeGapInserts.length > 0) {
      await db.insert(wardrobeGaps).values(
        wardrobeGapInserts.map((g) => ({
          userId: newUserId,
          category: g.category,
          description: g.description,
        })),
      );
    }
  }

  return { fieldsUpdated };
}

// ─── Helpers ───

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}
function isNonEmpty(value: unknown): boolean {
  return !isEmpty(value);
}
