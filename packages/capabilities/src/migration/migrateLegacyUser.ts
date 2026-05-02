/**
 * One-shot migration: copy a legacy Firebase Tela user's profile, wardrobe
 * items, and outfits into the new Supabase backend under their existing
 * new-app account.
 *
 * Read the full spec at `docs/migration-luke-one-shot.md` (decisions M1-M12).
 *
 * High-level flow:
 *   1. Resolve identity (legacy uid + new user_id) — caller's job, passed in.
 *   2. Profile: non-destructive merge (only fill empty fields on new side).
 *   3. Wardrobe: per-item Drizzle txn; HEIC pre-flight + image transfer +
 *      item_photos + closet_items + migration_log.
 *   4. Outfits: per-outfit Drizzle txn; resolve items via migration_log,
 *      partial-items rule, synthetic context + generation, recompute
 *      pairing_key, outfits + outfit_items + migration_log.
 *   5. Verification: row counts + spot-check signed URLs.
 *
 * All idempotent: every INSERT checks `migration_log` first (UNIQUE on
 * user_id + entity_type + legacy_id). Failures land in `migration_failures`
 * (append-only).
 */
import { createHash } from 'node:crypto';
import { eq, and, sql } from 'drizzle-orm';
import {
  getDb,
  users,
  closets,
  closetItems,
  itemPhotos,
  contexts,
  generations,
  outfits,
  outfitItems,
  wardrobeGaps,
  migrationLog,
  migrationFailures,
} from '@tela/db';
import {
  getSupabaseAdmin,
  ITEM_PHOTOS_BUCKET,
} from '../storage/supabase.js';
import { getLegacyDb, getLegacyBucket } from './firebase.js';
import type {
  LegacyOutfit,
  LegacyUserProfile,
  LegacyWardrobeItem,
} from './legacyShapes.js';
import type { MigrateOptions, MigrateResult } from './types.js';

// ─── Constants ───

const VALID_SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;
type ValidSeason = (typeof VALID_SEASONS)[number];

const VALID_OUTFIT_ROLES = [
  'top',
  'bottom',
  'dress',
  'shoes',
  'outerwear',
  'accessory',
] as const;
type OutfitRole = (typeof VALID_OUTFIT_ROLES)[number];

const SYNTHETIC_PROMPT_VERSION_ID = '00000000-0000-0000-0000-000000000000';

const IMAGE_TRANSFER_CONCURRENCY = 10;
const IMAGE_TRANSFER_RETRIES = 2;
const IMAGE_TRANSFER_BACKOFF_MS = [500, 1500];

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

  // ─── 1. Profile ───
  if (only === 'all' || only === 'profile') {
    result.profile = await migrateProfile({ legacyUid, newUserId, dryRun });
  }

  // ─── 2. Wardrobe ───
  // We gate wardrobe on `includeImages` because writing closet_items rows
  // pointing at non-existent storage paths would render broken UI in the
  // new app. D.13a defers wardrobe to D.13b together with image bytes.
  if ((only === 'all' || only === 'wardrobe') && includeImages) {
    const wardrobeStats = await migrateWardrobe({ legacyUid, newUserId, dryRun });
    result.wardrobe = wardrobeStats;
  }

  // ─── 3. Outfits ───
  // Outfits depend on items already being migrated (via migration_log
  // lookups). D.13b enables this together with images.
  if ((only === 'all' || only === 'outfits') && includeOutfits) {
    const outfitStats = await migrateOutfits({ legacyUid, newUserId, dryRun });
    result.outfits = outfitStats;
  }

  // ─── 4. Verification ───
  if (!dryRun && includeImages) {
    await verifyMigration({ newUserId });
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

  // Legacy side — Firebase Auth lookup by email
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

  // New side — Supabase users table lookup by email. Case-insensitive
  // because users.email is varchar (case-sensitive) but Supabase Auth
  // normalizes to lowercase on signup; defending against any seeded /
  // imported rows whose casing didn't get normalized.
  const db = getDb();
  const matches = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(sql`lower(${users.email}) = ${lower}`)
    .limit(1);
  const newUser = matches[0];
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

// ─── 1. Profile ───

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

  // Scalar fields — see migration plan "User profile" mapping table.
  if (legacy.onboardingComplete === true && current.onboardingComplete === false) {
    patch.onboardingComplete = true;
    fieldsUpdated.push('onboardingComplete');
  }
  if (isNonEmpty(legacy.locale) && isEmpty(current.locale)) {
    patch.locale = legacy.locale;
    fieldsUpdated.push('locale');
  }

  // Preferences (jsonb) — merge as a whole object only if new side empty.
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

  // Wardrobe gaps — per-string rows, not jsonb. Insert only if user has none yet.
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

// ─── 2. Wardrobe ───

async function migrateWardrobe(args: {
  legacyUid: string;
  newUserId: string;
  dryRun: boolean;
}): Promise<MigrateResult['wardrobe']> {
  const { legacyUid, newUserId, dryRun } = args;
  const stats: MigrateResult['wardrobe'] = {
    migrated: 0,
    skipped: [],
    imagesTransferred: 0,
    imagesFailed: [],
  };

  log(`wardrobe: reading legacy items for ${legacyUid}`);
  const legacyDb = getLegacyDb();
  const itemsSnap = await legacyDb
    .collection('users')
    .doc(legacyUid)
    .collection('wardrobeItems')
    .get();

  const items: LegacyWardrobeItem[] = itemsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<LegacyWardrobeItem, 'id'>),
  }));
  log(`wardrobe: ${items.length} legacy items found`);

  if (items.length === 0) return stats;

  // Pre-resolve / create the user's closet ONCE so per-item txns don't race.
  let closetId: string | null = null;
  if (!dryRun) {
    closetId = await ensureCloset(newUserId);
  }

  // Bounded-concurrency: chunked Promise.all of size IMAGE_TRANSFER_CONCURRENCY.
  let processed = 0;
  for (const batch of chunk(items, IMAGE_TRANSFER_CONCURRENCY)) {
    await Promise.all(
      batch.map(async (item) => {
        const idx = ++processed;
        try {
          const outcome = await migrateOneItem({
            item,
            legacyUid,
            newUserId,
            closetId: closetId ?? '',
            dryRun,
            idx,
            total: items.length,
          });
          if (outcome.skipped) {
            stats.skipped.push({ legacyId: item.id, reason: outcome.reason ?? 'unknown' });
            if (outcome.imageFailed) {
              stats.imagesFailed.push({ legacyId: item.id, reason: outcome.reason ?? 'unknown' });
            }
            return;
          }
          if (outcome.alreadyMigrated) {
            // Counted as migrated for verification's sake (it IS in migration_log).
            stats.migrated += 1;
            return;
          }
          stats.migrated += 1;
          stats.imagesTransferred += outcome.imagesTransferred ?? 0;
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          warn(`wardrobe item ${idx}/${items.length} ${item.id} — failed: ${reason}`);
          stats.skipped.push({ legacyId: item.id, reason });
          if (!dryRun) {
            await recordFailure({
              userId: newUserId,
              legacyEntityType: 'wardrobe_item',
              legacyId: item.id,
              reason,
            });
          }
        }
      }),
    );
  }

  // Reconcile closets.item_count after the bulk insert. addItem +
  // removeItem mutate it incrementally; bypassing them here means the
  // denormalized count would otherwise drift to 0 + N-deletions. No
  // user-facing code reads this value today (admin pages re-derive via
  // SELECT count(*)), but removeItem reads it to decrement, so leaving
  // it stale would surface as a "ghost item" if the user later removes
  // an imported item.
  if (!dryRun && closetId) {
    const db = getDb();
    await db
      .update(closets)
      .set({
        itemCount: sql`(SELECT count(*)::int FROM ${closetItems} WHERE ${closetItems.closetId} = ${closets.id})`,
        lastUpdatedAt: new Date(),
      })
      .where(eq(closets.id, closetId));
  }

  return stats;
}

interface MigrateItemOutcome {
  skipped: boolean;
  alreadyMigrated?: boolean;
  reason?: string;
  imagesTransferred?: number;
  imageFailed?: boolean;
}

async function migrateOneItem(args: {
  item: LegacyWardrobeItem;
  legacyUid: string;
  newUserId: string;
  closetId: string;
  dryRun: boolean;
  idx: number;
  total: number;
}): Promise<MigrateItemOutcome> {
  const { item, legacyUid, newUserId, closetId, dryRun, idx, total } = args;
  log(`wardrobe item ${idx}/${total}: ${item.id} — start`);

  // Idempotency: skip if already in migration_log.
  const db = getDb();
  if (!dryRun) {
    const existing = await db.query.migrationLog.findFirst({
      where: and(
        eq(migrationLog.userId, newUserId),
        eq(migrationLog.legacyEntityType, 'wardrobe_item'),
        eq(migrationLog.legacyId, item.id),
      ),
    });
    if (existing) {
      log(`wardrobe item ${idx}/${total}: ${item.id} — already migrated, skipping`);
      return { skipped: false, alreadyMigrated: true };
    }
  }

  // Resolve original + enhanced legacy paths per the legacy enhancement convention:
  //   - completed: imagePath = enhanced; originalImagePath = original
  //   - else:      imagePath = original; originalImagePath = undefined
  const legacyOriginalPath = item.originalImagePath ?? item.imagePath ?? null;
  const legacyEnhancedPath =
    item.enhancementStatus === 'completed' && item.originalImagePath
      ? item.imagePath ?? null
      : null;

  if (!legacyOriginalPath) {
    return {
      skipped: true,
      reason: 'no original image path on legacy item',
    };
  }

  // HEIC pre-flight on the ORIGINAL — that's what we'll feed our pipeline.
  const heicCheck = await checkHeic(legacyOriginalPath);
  if (heicCheck.isHeic) {
    log(`wardrobe item ${idx}/${total}: ${item.id} — HEIC original, skipping`);
    if (!dryRun) {
      await recordFailure({
        userId: newUserId,
        legacyEntityType: 'wardrobe_item',
        legacyId: item.id,
        reason: 'HEIC unsupported',
      });
    }
    return { skipped: true, reason: 'HEIC unsupported', imageFailed: true };
  }
  if (heicCheck.missing) {
    return { skipped: true, reason: `original missing in legacy storage: ${legacyOriginalPath}` };
  }

  if (dryRun) {
    log(`wardrobe item ${idx}/${total}: ${item.id} — dry-run preview only`);
    return { skipped: false };
  }

  // Allocate a deterministic-ish destination UUID? No — we'll let Postgres do
  // the gen_random_uuid(). The path then includes the photo id which we get
  // from the INSERT...RETURNING.
  //
  // To avoid a chicken-and-egg with storage_path (which we need at INSERT
  // time but want to include the new photo's UUID in), we pre-mint a UUID
  // for the photo path and pass it as the row id. Mirrors how Supabase
  // bucket paths typically reference the row id.
  const newOriginalPhotoId = randomUuid();
  const newOriginalPath = `${newUserId}/${newOriginalPhotoId}.jpg`;

  let newEnhancedPath: string | null = null;
  let newEnhancedPhotoId: string | null = null;
  if (legacyEnhancedPath) {
    newEnhancedPhotoId = randomUuid();
    newEnhancedPath = `${newUserId}/${newEnhancedPhotoId}.jpg`;
  }

  // Image transfer (with retries). Done outside the txn so we don't hold a
  // long-lived txn while uploading megabytes.
  let imagesTransferred = 0;
  try {
    await transferImage(legacyOriginalPath, newOriginalPath);
    imagesTransferred += 1;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await recordFailure({
      userId: newUserId,
      legacyEntityType: 'wardrobe_item',
      legacyId: item.id,
      reason: `original image transfer failed: ${reason}`,
    });
    return { skipped: true, reason, imageFailed: true };
  }

  if (legacyEnhancedPath && newEnhancedPath) {
    try {
      await transferImage(legacyEnhancedPath, newEnhancedPath);
      imagesTransferred += 1;
    } catch (err) {
      // Enhanced failed but original succeeded — degrade gracefully:
      // treat the item as a 'pending' enhancement and let the worker retry.
      const reason = err instanceof Error ? err.message : String(err);
      warn(`wardrobe item ${idx}/${total}: ${item.id} — enhanced transfer failed (${reason}); proceeding with original only`);
      newEnhancedPath = null;
      newEnhancedPhotoId = null;
      await recordFailure({
        userId: newUserId,
        legacyEntityType: 'wardrobe_item',
        legacyId: item.id,
        reason: `enhanced image transfer failed: ${reason} (item migrated as pending)`,
      });
    }
  }

  // Map the legacy enhancement state to ours (M5).
  const enhancementStatus = mapEnhancementStatus(item, !!newEnhancedPath);

  const backgroundColor = item.bgColor ?? item.bgColors?.tl ?? null;
  const createdAt = toDate(item.createdAt);

  // Per-item Drizzle txn for: item_photos (original) + closet_items + migration_log.
  // (Enhanced item_photos rows aren't created in our schema for the
  // enhanced version — the original-photo row carries
  // enhanced_storage_path / enhanced_at / enhancement_status. So a
  // single item_photos row per closet_item, matching how
  // confirmPhotoUpload + the enhancement worker do it.)
  await db.transaction(async (tx) => {
    const [photoRow] = await tx
      .insert(itemPhotos)
      .values({
        id: newOriginalPhotoId,
        userId: newUserId,
        storagePath: newOriginalPath,
        enhancementStatus,
        enhancedStoragePath: newEnhancedPath,
        enhancedAt: enhancementStatus === 'completed' ? createdAt : null,
        backgroundColor,
        createdAt,
      })
      .returning({ id: itemPhotos.id });

    const analysis = item.analysis ?? ({} as LegacyWardrobeItem['analysis']);
    const seasonCompatibility = sanitizeSeasonArray(analysis.season ?? []);
    const formalityScore =
      typeof analysis.formality === 'number' && Number.isFinite(analysis.formality)
        ? clamp01(analysis.formality)
        : 0.5;

    const [itemRow] = await tx
      .insert(closetItems)
      .values({
        closetId,
        userId: newUserId,
        photoId: photoRow.id,
        backgroundColor,
        analysisLocale: item.analysisLocale ?? 'en',
        category: analysis.category ?? 'top',
        subcategory: analysis.subcategory ?? null,
        primaryColor: analysis.primaryColor ?? 'unknown',
        secondaryColor: analysis.secondaryColor ?? null,
        pattern: analysis.pattern ?? null,
        style: analysis.style ?? null,
        fit: analysis.fit ?? null,
        length: analysis.length ?? null,
        sleeveLength: analysis.sleeveLength ?? null,
        description: analysis.description ?? null,
        material: analysis.material ?? null,
        formalityScore,
        materialWeight: 'medium',
        seasonCompatibility,
        createdAt,
        updatedAt: createdAt,
      })
      .returning({ id: closetItems.id });

    // Record both rows in migration_log so re-runs are idempotent.
    await tx.insert(migrationLog).values([
      {
        userId: newUserId,
        legacyEntityType: 'item_photo',
        legacyId: `${item.id}:photo`,
        newEntityType: 'item_photo',
        newId: photoRow.id,
      },
      {
        userId: newUserId,
        legacyEntityType: 'wardrobe_item',
        legacyId: item.id,
        newEntityType: 'closet_item',
        newId: itemRow.id,
      },
    ]);
  });

  log(`wardrobe item ${idx}/${total}: ${item.id} — done (${imagesTransferred} image${imagesTransferred === 1 ? '' : 's'})`);
  return { skipped: false, imagesTransferred };
}

function mapEnhancementStatus(
  item: LegacyWardrobeItem,
  enhancedAvailable: boolean,
): 'completed' | 'failed' | 'pending' {
  if (item.enhancementStatus === 'completed' && enhancedAvailable) return 'completed';
  if (item.enhancementStatus === 'failed') return 'failed';
  // 'enhancing' (long-stuck) and missing both reset to 'pending' so the
  // worker picks them up.
  return 'pending';
}

// ─── 3. Outfits ───

async function migrateOutfits(args: {
  legacyUid: string;
  newUserId: string;
  dryRun: boolean;
}): Promise<MigrateResult['outfits']> {
  const { legacyUid, newUserId, dryRun } = args;
  const stats: MigrateResult['outfits'] = {
    migrated: 0,
    skipped: [],
    syntheticContextsCreated: 0,
    syntheticGenerationsCreated: 0,
  };

  log(`outfits: reading legacy outfits for ${legacyUid}`);
  const legacyDb = getLegacyDb();
  const outfitsSnap = await legacyDb
    .collection('users')
    .doc(legacyUid)
    .collection('outfits')
    .get();

  const legacyOutfits: LegacyOutfit[] = outfitsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<LegacyOutfit, 'id'>),
  }));
  log(`outfits: ${legacyOutfits.length} legacy outfits found`);

  if (legacyOutfits.length === 0) return stats;

  // Cache for synthetic context UUIDs within this run, keyed on
  // 'occasion::season'. Values come from migration_log when present, else
  // are inserted on first use.
  const contextCache = new Map<string, string>();
  let syntheticGenerationId: string | null = null;

  let processed = 0;
  for (const outfit of legacyOutfits) {
    processed += 1;
    try {
      const outcome = await migrateOneOutfit({
        outfit,
        legacyUid,
        newUserId,
        contextCache,
        getOrCreateGeneration: async () => {
          if (syntheticGenerationId) return { id: syntheticGenerationId, created: false };
          const r = await getOrCreateSyntheticGeneration({ legacyUid, newUserId, dryRun });
          syntheticGenerationId = r.id;
          if (r.created) stats.syntheticGenerationsCreated += 1;
          return r;
        },
        recordContextCreated: () => {
          stats.syntheticContextsCreated += 1;
        },
        dryRun,
        idx: processed,
        total: legacyOutfits.length,
      });
      if (outcome.skipped) {
        stats.skipped.push({ legacyId: outfit.id, reason: outcome.reason ?? 'unknown' });
        continue;
      }
      stats.migrated += 1;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      warn(`outfit ${processed}/${legacyOutfits.length} ${outfit.id} — failed: ${reason}`);
      stats.skipped.push({ legacyId: outfit.id, reason });
      if (!dryRun) {
        await recordFailure({
          userId: newUserId,
          legacyEntityType: 'outfit',
          legacyId: outfit.id,
          reason,
        });
      }
    }
  }
  return stats;
}

interface OutfitOutcome {
  skipped: boolean;
  reason?: string;
}

async function migrateOneOutfit(args: {
  outfit: LegacyOutfit;
  legacyUid: string;
  newUserId: string;
  contextCache: Map<string, string>;
  getOrCreateGeneration: () => Promise<{ id: string; created: boolean }>;
  recordContextCreated: () => void;
  dryRun: boolean;
  idx: number;
  total: number;
}): Promise<OutfitOutcome> {
  const { outfit, newUserId, contextCache, getOrCreateGeneration, recordContextCreated, dryRun, idx, total } = args;
  log(`outfit ${idx}/${total}: ${outfit.id} — start`);

  const db = getDb();
  if (!dryRun) {
    const existing = await db.query.migrationLog.findFirst({
      where: and(
        eq(migrationLog.userId, newUserId),
        eq(migrationLog.legacyEntityType, 'outfit'),
        eq(migrationLog.legacyId, outfit.id),
      ),
    });
    if (existing) {
      log(`outfit ${idx}/${total}: ${outfit.id} — already migrated, skipping`);
      return { skipped: false };
    }
  }

  // Resolve item IDs via migration_log.
  const legacyItemIds = outfit.items ?? [];
  if (legacyItemIds.length === 0) {
    return { skipped: true, reason: 'outfit has no items' };
  }

  const validItems: Array<{ legacyId: string; newId: string; category: string }> = [];
  for (const legacyItemId of legacyItemIds) {
    const logRow = await db.query.migrationLog.findFirst({
      where: and(
        eq(migrationLog.userId, newUserId),
        eq(migrationLog.legacyEntityType, 'wardrobe_item'),
        eq(migrationLog.legacyId, legacyItemId),
      ),
    });
    if (!logRow) continue;
    const itemRow = await db.query.closetItems.findFirst({
      where: eq(closetItems.id, logRow.newId),
      columns: { id: true, category: true },
    });
    if (!itemRow) continue;
    validItems.push({ legacyId: legacyItemId, newId: itemRow.id, category: itemRow.category });
  }

  log(`outfit ${idx}/${total}: ${outfit.id} — items resolved (${validItems.length}/${legacyItemIds.length})`);

  // Structural validation: must have (top|dress) AND (bottom|dress).
  const cats = new Set(validItems.map((v) => v.category));
  const hasTop = cats.has('top') || cats.has('dress');
  const hasBottom = cats.has('bottom') || cats.has('dress');
  if (!hasTop || !hasBottom) {
    const reason = `partial-items: only ${validItems.length}/${legacyItemIds.length} migrated, structural validation failed`;
    if (!dryRun) {
      await recordFailure({
        userId: newUserId,
        legacyEntityType: 'outfit',
        legacyId: outfit.id,
        reason,
      });
    }
    return { skipped: true, reason };
  }

  // Resolve synthetic context (per (occasion, season) tuple).
  const occasion = outfit.occasion ?? 'Everyday';
  const season = pickValidSeason(outfit.season);
  const contextKey = `${occasion}::${season}`;
  let contextId = contextCache.get(contextKey);

  if (dryRun) {
    log(`outfit ${idx}/${total}: ${outfit.id} — dry-run preview only`);
    return { skipped: false };
  }

  if (!contextId) {
    const ctxResolution = await getOrCreateSyntheticContext({
      newUserId,
      occasion,
      season,
    });
    contextId = ctxResolution.id;
    contextCache.set(contextKey, contextId);
    if (ctxResolution.created) recordContextCreated();
  }

  const generation = await getOrCreateGeneration();

  // Recompute pairing key from the new (sorted) UUIDs — legacy keys won't match.
  const sortedNewIds = validItems.map((v) => v.newId).sort();
  const pairingKey = createHash('sha256')
    .update(sortedNewIds.join('|'))
    .digest('hex')
    .slice(0, 32);

  const createdAt = toDate(outfit.createdAt);
  const savedAt = outfit.savedAt ? toDate(outfit.savedAt) : null;
  const validFeedback = outfit.feedback === 'up' || outfit.feedback === 'down' ? outfit.feedback : null;
  const captureContextId = contextId;
  const captureGenerationId = generation.id;

  await db.transaction(async (tx) => {
    const [outfitRow] = await tx
      .insert(outfits)
      .values({
        userId: newUserId,
        generationId: captureGenerationId,
        contextId: captureContextId,
        rationale: outfit.reasoning ?? '',
        name: outfit.name ?? null,
        wardrobeAssessment: outfit.wardrobeAssessment ?? null,
        pairingKey,
        saved: outfit.saved ?? false,
        savedAt,
        feedback: validFeedback,
        wornAt: null,
        createdAt,
      })
      .returning({ id: outfits.id });

    const outfitItemRows = validItems
      .map((v) => ({
        outfitId: outfitRow.id,
        closetItemId: v.newId,
        role: deriveRole(v.category),
      }))
      .filter((r): r is { outfitId: string; closetItemId: string; role: OutfitRole } => r.role !== null);

    if (outfitItemRows.length > 0) {
      await tx.insert(outfitItems).values(outfitItemRows);
    }

    await tx.insert(migrationLog).values({
      userId: newUserId,
      legacyEntityType: 'outfit',
      legacyId: outfit.id,
      newEntityType: 'outfit',
      newId: outfitRow.id,
    });
  });

  log(`outfit ${idx}/${total}: ${outfit.id} — done`);
  return { skipped: false };
}

async function getOrCreateSyntheticContext(args: {
  newUserId: string;
  occasion: string;
  season: ValidSeason;
}): Promise<{ id: string; created: boolean }> {
  const { newUserId, occasion, season } = args;
  const legacyKey = `synthetic:context:${occasion}:${season}`;
  const db = getDb();

  const existing = await db.query.migrationLog.findFirst({
    where: and(
      eq(migrationLog.userId, newUserId),
      eq(migrationLog.legacyEntityType, 'context'),
      eq(migrationLog.legacyId, legacyKey),
    ),
  });
  if (existing) return { id: existing.newId, created: false };

  const result = await db.transaction(async (tx) => {
    const [ctxRow] = await tx
      .insert(contexts)
      .values({
        userId: newUserId,
        occasion,
        season,
        timeOfDay: 'morning',
        weather: null,
        calendarContext: 'imported_from_legacy',
      })
      .returning({ id: contexts.id });
    await tx.insert(migrationLog).values({
      userId: newUserId,
      legacyEntityType: 'context',
      legacyId: legacyKey,
      newEntityType: 'context',
      newId: ctxRow.id,
    });
    return ctxRow.id;
  });
  return { id: result, created: true };
}

async function getOrCreateSyntheticGeneration(args: {
  legacyUid: string;
  newUserId: string;
  dryRun: boolean;
}): Promise<{ id: string; created: boolean }> {
  const { legacyUid, newUserId, dryRun } = args;
  const legacyKey = `synthetic:generation:${legacyUid}`;
  const db = getDb();

  const existing = await db.query.migrationLog.findFirst({
    where: and(
      eq(migrationLog.userId, newUserId),
      eq(migrationLog.legacyEntityType, 'generation'),
      eq(migrationLog.legacyId, legacyKey),
    ),
  });
  if (existing) return { id: existing.newId, created: false };

  if (dryRun) {
    return { id: '00000000-0000-0000-0000-000000000000', created: true };
  }

  const result = await db.transaction(async (tx) => {
    const [genRow] = await tx
      .insert(generations)
      .values({
        userId: newUserId,
        operation: 'legacy_import',
        promptName: 'legacy_import',
        promptVersionId: SYNTHETIC_PROMPT_VERSION_ID,
        model: 'legacy',
        inputSnapshot: {
          migrated_at: new Date().toISOString(),
          legacy_uid: legacyUid,
        },
        rawOutput: '',
        parsedOutput: null,
        latencyMs: 0,
        costCents: 0,
      })
      .returning({ id: generations.id });
    await tx.insert(migrationLog).values({
      userId: newUserId,
      legacyEntityType: 'generation',
      legacyId: legacyKey,
      newEntityType: 'generation',
      newId: genRow.id,
    });
    return genRow.id;
  });
  return { id: result, created: true };
}

// ─── 4. Verification ───

async function verifyMigration(args: { newUserId: string }): Promise<void> {
  const { newUserId } = args;
  log('verification: starting');

  const db = getDb();
  const supabase = getSupabaseAdmin();

  // Counts via migration_log entity types.
  const allLogs = await db
    .select({
      entityType: migrationLog.legacyEntityType,
      newId: migrationLog.newId,
    })
    .from(migrationLog)
    .where(eq(migrationLog.userId, newUserId));
  const counts = new Map<string, number>();
  for (const r of allLogs) {
    counts.set(r.entityType, (counts.get(r.entityType) ?? 0) + 1);
  }
  log(
    `verification counts — items=${counts.get('wardrobe_item') ?? 0} ` +
      `photos=${counts.get('item_photo') ?? 0} ` +
      `outfits=${counts.get('outfit') ?? 0} ` +
      `contexts=${counts.get('context') ?? 0} ` +
      `generations=${counts.get('generation') ?? 0}`,
  );

  // Spot-check 5 random photos via signed URL HEAD request.
  const photoLogs = allLogs.filter((r) => r.entityType === 'item_photo');
  const sample = sampleRandom(photoLogs, 5);
  if (sample.length === 0) {
    log('verification: no photos to spot-check');
  } else {
    let ok = 0;
    let bad = 0;
    for (const photoLog of sample) {
      const photo = await db.query.itemPhotos.findFirst({
        where: eq(itemPhotos.id, photoLog.newId),
        columns: { storagePath: true, enhancedStoragePath: true },
      });
      if (!photo) {
        warn(`verification: item_photo row ${photoLog.newId} missing`);
        bad += 1;
        continue;
      }
      const path = photo.enhancedStoragePath ?? photo.storagePath;
      const { data, error } = await supabase.storage
        .from(ITEM_PHOTOS_BUCKET)
        .createSignedUrl(path, 60);
      if (error || !data?.signedUrl) {
        warn(`verification: failed to mint signed URL for ${path}: ${error?.message}`);
        bad += 1;
        continue;
      }
      try {
        const res = await fetch(data.signedUrl, { method: 'HEAD' });
        if (res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')) {
          ok += 1;
        } else {
          warn(`verification: signed URL HEAD returned ${res.status} for ${path}`);
          bad += 1;
        }
      } catch (err) {
        warn(`verification: signed URL fetch failed for ${path}: ${err}`);
        bad += 1;
      }
    }
    log(`verification spot-check: ${ok}/${sample.length} signed URLs returned image/* (${bad} failures)`);
  }

  // Spot-check 1 random outfit (joined items + signed URLs).
  const outfitLogs = allLogs.filter((r) => r.entityType === 'outfit');
  const outfitSample = sampleRandom(outfitLogs, 1);
  for (const o of outfitSample) {
    const items = await db
      .select({ id: outfitItems.id })
      .from(outfitItems)
      .where(eq(outfitItems.outfitId, o.newId));
    log(`verification outfit ${o.newId}: ${items.length} items joined`);
  }
}

// ─── Image transfer ───

async function transferImage(legacyPath: string, newPath: string): Promise<void> {
  const bucket = getLegacyBucket();
  const supabase = getSupabaseAdmin();

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= IMAGE_TRANSFER_RETRIES; attempt++) {
    try {
      const [buffer] = await bucket.file(legacyPath).download();
      const { error } = await supabase.storage
        .from(ITEM_PHOTOS_BUCKET)
        .upload(newPath, buffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });
      if (error) throw new Error(`upload: ${error.message}`);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < IMAGE_TRANSFER_RETRIES) {
        const delay = IMAGE_TRANSFER_BACKOFF_MS[attempt] ?? 1500;
        await sleep(delay);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function checkHeic(legacyPath: string): Promise<{ isHeic: boolean; missing: boolean }> {
  const bucket = getLegacyBucket();
  try {
    const [metadata] = await bucket.file(legacyPath).getMetadata();
    const ct = String(metadata.contentType ?? '').toLowerCase();
    return { isHeic: ct === 'image/heic' || ct === 'image/heif', missing: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/no such object|not found/i.test(msg)) {
      return { isHeic: false, missing: true };
    }
    throw err;
  }
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

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function pickValidSeason(seasonArr: string[] | undefined): ValidSeason {
  const cand = seasonArr?.[0]?.toLowerCase() ?? '';
  if ((VALID_SEASONS as readonly string[]).includes(cand)) return cand as ValidSeason;
  return 'fall';
}

function sanitizeSeasonArray(arr: string[]): string[] {
  return arr
    .map((s) => s.toLowerCase())
    .filter((s): s is ValidSeason => (VALID_SEASONS as readonly string[]).includes(s));
}

function deriveRole(category: string): OutfitRole | null {
  const c = category.toLowerCase();
  if ((VALID_OUTFIT_ROLES as readonly string[]).includes(c)) return c as OutfitRole;
  return null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sampleRandom<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return [...arr];
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomUuid(): string {
  // Node 18+ provides global crypto.randomUUID
  return globalThis.crypto.randomUUID();
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date();
}

async function ensureCloset(newUserId: string): Promise<string> {
  const db = getDb();
  const existing = await db.query.closets.findFirst({
    where: eq(closets.userId, newUserId),
    columns: { id: true },
  });
  if (existing) return existing.id;
  const [created] = await db
    .insert(closets)
    .values({ userId: newUserId })
    .returning({ id: closets.id });
  return created.id;
}

async function recordFailure(args: {
  userId: string;
  legacyEntityType: string;
  legacyId: string;
  reason: string;
}): Promise<void> {
  const db = getDb();
  await db.insert(migrationFailures).values({
    userId: args.userId,
    legacyEntityType: args.legacyEntityType,
    legacyId: args.legacyId,
    reason: args.reason,
  });
}
