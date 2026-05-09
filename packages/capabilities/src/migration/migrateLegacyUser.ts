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
  tryOnJobs,
  type TryOnStatus,
  type TryOnStep,
  chatConversations,
  chatMessages,
  type ChatAttachment,
  type ChatToolCall,
} from '@tela/db';
import {
  getSupabaseAdmin,
  ITEM_PHOTOS_BUCKET,
  TRY_ON_BUCKET,
  resolveModelImageUrl,
} from '../storage/supabase.js';
import { getLegacyDb, getLegacyBucket } from './firebase.js';
import type {
  LegacyChatAttachment,
  LegacyChatMessage,
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
  const includeChat = opts.includeChat ?? false;

  log(`start — legacyUid=${legacyUid} newUserId=${newUserId} dryRun=${dryRun} only=${only} includeImages=${includeImages} includeOutfits=${includeOutfits} includeChat=${includeChat}`);

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
    tryOns: {
      migrated: 0,
      skipped: [],
      imagesFailed: [],
    },
    chat: {
      conversationCreated: false,
      messagesMigrated: 0,
      messagesSkipped: [],
      legacyAttachmentsPreserved: 0,
      wardrobeAttachmentsResolved: 0,
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

  // ─── 3. Outfits + try-ons ───
  // Outfits depend on items already being migrated (via migration_log
  // lookups). D.13b enables this together with images. Try-on migration
  // (Phase 11 D3 / M4) runs as part of this phase since try_on_jobs FK
  // references the migrated outfit.
  if ((only === 'all' || only === 'outfits') && includeOutfits) {
    const stats = await migrateOutfits({ legacyUid, newUserId, dryRun });
    result.outfits = stats.outfits;
    result.tryOns = stats.tryOns;
  }

  // ─── 4. Chat (Phase 11 D4 / M5) ───
  // Chat depends on the user existing but is otherwise independent of
  // wardrobe / outfits / images. Wardrobe-item attachments are resolved
  // through migration_log when present; image attachments are preserved
  // as image-legacy URLs. Independent flag (includeChat) since the
  // 'only' enum is constrained to profile|wardrobe|outfits|all and
  // gating chat on `all` would force-couple it with images + outfits.
  if (only === 'all' && includeChat) {
    const stats = await migrateChat({ legacyUid, newUserId, dryRun });
    result.chat = stats;
  }

  // ─── 5. Verification ───
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
}): Promise<{ outfits: MigrateResult['outfits']; tryOns: MigrateResult['tryOns'] }> {
  const { legacyUid, newUserId, dryRun } = args;
  const stats: MigrateResult['outfits'] = {
    migrated: 0,
    skipped: [],
    syntheticContextsCreated: 0,
    syntheticGenerationsCreated: 0,
  };
  const tryOnStats: MigrateResult['tryOns'] = {
    migrated: 0,
    skipped: [],
    imagesFailed: [],
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

  if (legacyOutfits.length === 0) return { outfits: stats, tryOns: tryOnStats };

  // Try-on migration target bucket — provision once before any per-outfit
  // try-on transfer attempts. Skipped in dry-run.
  if (!dryRun && legacyOutfits.some((o) => o.tryOnStatus === 'completed')) {
    await ensureTryOnBucket();
  }

  // Dry-run preview map: legacyItemId → category. In real-run, items have
  // already been INSERTed into migration_log by the wardrobe phase, so the
  // outfit lookup resolves them via DB. In dry-run, nothing is written, so
  // we read legacy wardrobe items here and use that as the source of truth
  // for structural validation. Without this, every outfit would falsely
  // report "0/N items resolved → structural validation failed."
  let legacyItemCategories: Map<string, string> | null = null;
  if (dryRun) {
    log(`outfits: dry-run — pre-fetching legacy wardrobe items to simulate item resolution`);
    const itemsSnap = await legacyDb
      .collection('users')
      .doc(legacyUid)
      .collection('wardrobeItems')
      .get();
    legacyItemCategories = new Map();
    for (const doc of itemsSnap.docs) {
      const data = doc.data() as { analysis?: { category?: string } };
      const cat = data.analysis?.category;
      if (cat) legacyItemCategories.set(doc.id, cat);
    }
  }

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
        legacyItemCategories,
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
      if (outcome.tryOn) {
        if (outcome.tryOn.migrated) {
          tryOnStats.migrated += 1;
        } else if (outcome.tryOn.skipped) {
          tryOnStats.skipped.push({
            legacyOutfitId: outfit.id,
            reason: outcome.tryOn.reason ?? 'unknown',
          });
          if (outcome.tryOn.imageFailed) {
            tryOnStats.imagesFailed.push({
              legacyOutfitId: outfit.id,
              reason: outcome.tryOn.reason ?? 'unknown',
            });
          }
        }
      }
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
  return { outfits: stats, tryOns: tryOnStats };
}

interface OutfitOutcome {
  skipped: boolean;
  reason?: string;
  /**
   * Try-on result for this outfit, if outfit migration succeeded and we
   * attempted try-on migration. Undefined if the outfit was skipped or
   * had no tryOnStatus to consider.
   */
  tryOn?: TryOnOutcome;
}

interface TryOnOutcome {
  /** True if we wrote a try_on_jobs row (or would have, in dry-run). */
  migrated: boolean;
  /** True if we deliberately did not migrate (e.g., not completed). */
  skipped: boolean;
  /** Reason for skipping or failing. */
  reason?: string;
  /** True if the image transfer step failed specifically. */
  imageFailed?: boolean;
}

async function migrateOneOutfit(args: {
  outfit: LegacyOutfit;
  legacyUid: string;
  newUserId: string;
  contextCache: Map<string, string>;
  /**
   * Dry-run only: legacy item-id → category, used to simulate what
   * migrateWardrobe WOULD have inserted into migration_log. In real-run
   * we read migration_log directly (it's been populated by now).
   */
  legacyItemCategories: Map<string, string> | null;
  getOrCreateGeneration: () => Promise<{ id: string; created: boolean }>;
  recordContextCreated: () => void;
  dryRun: boolean;
  idx: number;
  total: number;
}): Promise<OutfitOutcome> {
  const {
    outfit,
    legacyUid,
    newUserId,
    contextCache,
    legacyItemCategories,
    getOrCreateGeneration,
    recordContextCreated,
    dryRun,
    idx,
    total,
  } = args;
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

  // Resolve items.
  // - Real-run: items are in migration_log (wardrobe phase already wrote them).
  //             Look up newId + category via the log → closet_items join.
  // - Dry-run:  migration_log is empty. Use the pre-fetched legacy-category map
  //             so structural validation reflects what real-run WOULD do.
  const legacyItemIds = outfit.items ?? [];
  if (legacyItemIds.length === 0) {
    return { skipped: true, reason: 'outfit has no items' };
  }

  const validItems: Array<{ legacyId: string; newId: string; category: string }> = [];
  if (dryRun && legacyItemCategories) {
    for (const legacyItemId of legacyItemIds) {
      const cat = legacyItemCategories.get(legacyItemId);
      if (!cat) continue;
      validItems.push({ legacyId: legacyItemId, newId: 'dry-run', category: cat });
    }
  } else {
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

  let newOutfitId: string | null = null;
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
    newOutfitId = outfitRow.id;
  });

  log(`outfit ${idx}/${total}: ${outfit.id} — done`);

  // Try-on migration (M4) — runs AFTER outfit txn commits since the
  // try_on_jobs.outfit_id FK references the just-inserted outfit row.
  // newOutfitId is null only if the txn callback exited without setting
  // it, which can't happen above — but TS doesn't know that.
  if (!newOutfitId) {
    return { skipped: false };
  }
  const tryOn = await migrateOneTryOn({
    outfit,
    newOutfitId,
    legacyUid,
    newUserId,
    dryRun,
    idx,
    total,
  });
  return { skipped: false, tryOn };
}

const VALID_TRY_ON_MODELS = new Set(['self', 'model-woman', 'model-man']);
const VALID_TRY_ON_STEPS: ReadonlyArray<TryOnStep> = ['bottoms', 'top', 'outerwear', 'dress'];

/**
 * Migrate one outfit's completed try-on to a try_on_jobs row + image
 * mirror in the try-on-results bucket. Per M4:
 *
 *   tryOnStatus='completed' → migrate (status='complete')
 *   tryOnStatus='pending' | 'generating' | 'failed' | undefined → skip
 *
 * Image transfer failures are RECOVERABLE — the outfit row stays in
 * place; only the try-on attachment is missing. The user can re-trigger
 * try-on from the new app's outfit detail screen, which produces a fresh
 * try_on_jobs row through the existing tryon.generate capability.
 */
async function migrateOneTryOn(args: {
  outfit: LegacyOutfit;
  newOutfitId: string;
  legacyUid: string;
  newUserId: string;
  dryRun: boolean;
  idx: number;
  total: number;
}): Promise<TryOnOutcome> {
  const { outfit, newOutfitId, legacyUid, newUserId, dryRun, idx, total } = args;

  if (outfit.tryOnStatus !== 'completed') {
    return {
      migrated: false,
      skipped: true,
      reason: `tryOnStatus=${outfit.tryOnStatus ?? 'never tried'}`,
    };
  }

  if (dryRun) {
    log(`try-on ${idx}/${total}: ${outfit.id} — dry-run preview only`);
    return { migrated: true, skipped: false };
  }

  // Idempotency: skip if already migrated.
  const db = getDb();
  const existing = await db.query.migrationLog.findFirst({
    where: and(
      eq(migrationLog.userId, newUserId),
      eq(migrationLog.legacyEntityType, 'try_on_job'),
      eq(migrationLog.legacyId, `${outfit.id}:tryon`),
    ),
  });
  if (existing) {
    log(`try-on ${idx}/${total}: ${outfit.id} — already migrated, skipping`);
    return { migrated: true, skipped: false };
  }

  const newJobId = randomUuid();
  const legacyPath = `users/${legacyUid}/outfits/${outfit.id}/try-on.jpg`;
  const newPath = `${newUserId}/${newOutfitId}/${newJobId}.jpg`;

  log(`try-on ${idx}/${total}: ${outfit.id} — transferring image`);
  try {
    await transferImage(legacyPath, newPath, TRY_ON_BUCKET);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    warn(`try-on ${idx}/${total}: ${outfit.id} — image transfer failed: ${reason}`);
    await recordFailure({
      userId: newUserId,
      legacyEntityType: 'try_on_job',
      legacyId: `${outfit.id}:tryon`,
      reason: `image transfer failed: ${reason}`,
    });
    return {
      migrated: false,
      skipped: true,
      reason: `image transfer: ${reason}`,
      imageFailed: true,
    };
  }

  // Resolve model image URL. Coerce legacy.model into our enum (legacy
  // stores it as a free-form string). Default to 'model-woman' per M4.
  const legacyModel = outfit.model ?? 'model-woman';
  const modelKey = (VALID_TRY_ON_MODELS.has(legacyModel) ? legacyModel : 'model-woman') as
    | 'self'
    | 'model-woman'
    | 'model-man';
  const modelImageUrl = resolveModelImageUrl(modelKey);

  // Validate async step (legacy stores as untyped string).
  const asyncStep =
    outfit.tryOnAsyncStep && (VALID_TRY_ON_STEPS as readonly string[]).includes(outfit.tryOnAsyncStep)
      ? (outfit.tryOnAsyncStep as TryOnStep)
      : null;

  const startedAt = outfit.tryOnStartedAt ? toDate(outfit.tryOnStartedAt) : new Date();

  await db.transaction(async (tx) => {
    await tx.insert(tryOnJobs).values({
      id: newJobId,
      userId: newUserId,
      outfitId: newOutfitId,
      status: 'complete' satisfies TryOnStatus,
      modelImageUrl,
      asyncJobId: outfit.tryOnAsyncJobId ?? null,
      asyncStep,
      resultStoragePath: newPath,
      costCents: 0,
      createdAt: startedAt,
      updatedAt: startedAt,
      completedAt: startedAt,
    });
    await tx.insert(migrationLog).values({
      userId: newUserId,
      legacyEntityType: 'try_on_job',
      legacyId: `${outfit.id}:tryon`,
      newEntityType: 'try_on_job',
      newId: newJobId,
    });
  });

  log(`try-on ${idx}/${total}: ${outfit.id} — done`);
  return { migrated: true, skipped: false };
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

// ─── 4. Chat (Phase 11 D4 / M5) ───

/**
 * Migrate one user's legacy chat: ONE chat_conversations row per user
 * + N chat_messages mapped 1:1 from the legacy Firestore collection
 * `users/{uid}/chatMessages` (chronological order).
 *
 * Image attachments are preserved as `image-legacy` URLs pointing at
 * the legacy Firebase Storage. Wardrobe-item attachments resolve via
 * migration_log when the underlying item also migrated; otherwise they
 * fall back to image-legacy with the legacy URL (graceful degrade).
 *
 * Idempotent: per-message lookup against migration_log; conversation
 * keyed on `synthetic:chat:{legacyUid}`. Re-runs add only the messages
 * that weren't migrated yet (none, in the cutover case).
 */
async function migrateChat(args: {
  legacyUid: string;
  newUserId: string;
  dryRun: boolean;
}): Promise<MigrateResult['chat']> {
  const { legacyUid, newUserId, dryRun } = args;
  const stats: MigrateResult['chat'] = {
    conversationCreated: false,
    messagesMigrated: 0,
    messagesSkipped: [],
    legacyAttachmentsPreserved: 0,
    wardrobeAttachmentsResolved: 0,
  };

  log(`chat: reading legacy messages for ${legacyUid}`);
  const legacyDb = getLegacyDb();
  const messagesSnap = await legacyDb
    .collection('users')
    .doc(legacyUid)
    .collection('chatMessages')
    .orderBy('createdAt', 'asc')
    .get();

  const messages: LegacyChatMessage[] = messagesSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<LegacyChatMessage, 'id'>),
  }));
  log(`chat: ${messages.length} legacy messages found`);

  if (messages.length === 0) return stats;

  // Get-or-create the conversation. Idempotency key: synthetic:chat:{legacyUid}.
  const db = getDb();
  const conversationLegacyKey = `synthetic:chat:${legacyUid}`;
  let conversationId: string;

  if (dryRun) {
    conversationId = '00000000-0000-0000-0000-000000000000';
    stats.conversationCreated = true; // would create
  } else {
    const existingConvo = await db.query.migrationLog.findFirst({
      where: and(
        eq(migrationLog.userId, newUserId),
        eq(migrationLog.legacyEntityType, 'chat_conversation'),
        eq(migrationLog.legacyId, conversationLegacyKey),
      ),
    });
    if (existingConvo) {
      conversationId = existingConvo.newId;
      log(`chat: reusing existing conversation ${conversationId}`);
    } else {
      const result = await db.transaction(async (tx) => {
        const [convoRow] = await tx
          .insert(chatConversations)
          .values({
            userId: newUserId,
            title: '(imported from legacy)',
            messageCount: 0,
            lastMessageAt: null,
          })
          .returning({ id: chatConversations.id });
        await tx.insert(migrationLog).values({
          userId: newUserId,
          legacyEntityType: 'chat_conversation',
          legacyId: conversationLegacyKey,
          newEntityType: 'chat_conversation',
          newId: convoRow.id,
        });
        return convoRow.id;
      });
      conversationId = result;
      stats.conversationCreated = true;
      log(`chat: created conversation ${conversationId}`);
    }
  }

  // Per-message migration. Sequential (low volume per user, no point
  // parallelising). Skip already-migrated rows via migration_log.
  let processed = 0;
  for (const msg of messages) {
    processed += 1;

    if (msg.role !== 'user' && msg.role !== 'assistant') {
      stats.messagesSkipped.push({ legacyId: msg.id, reason: `unsupported role: ${msg.role}` });
      continue;
    }

    if (!dryRun) {
      const existingMsg = await db.query.migrationLog.findFirst({
        where: and(
          eq(migrationLog.userId, newUserId),
          eq(migrationLog.legacyEntityType, 'chat_message'),
          eq(migrationLog.legacyId, msg.id),
        ),
      });
      if (existingMsg) {
        log(`chat msg ${processed}/${messages.length}: ${msg.id} — already migrated, skipping`);
        continue;
      }
    }

    // Resolve attachments.
    const resolved = await resolveChatAttachments({
      attachments: msg.attachments ?? [],
      newUserId,
      dryRun,
    });
    stats.legacyAttachmentsPreserved += resolved.legacyCount;
    stats.wardrobeAttachmentsResolved += resolved.wardrobeCount;

    // Map tool calls (legacy → new shape).
    const toolCalls = mapLegacyToolCalls(msg.toolCalls);

    if (dryRun) continue;

    const createdAt = toDate(msg.createdAt);

    await db.transaction(async (tx) => {
      const [msgRow] = await tx
        .insert(chatMessages)
        .values({
          conversationId,
          role: msg.role,
          content: msg.content,
          toolCalls,
          attachments: resolved.attachments.length > 0 ? resolved.attachments : null,
          createdAt,
        })
        .returning({ id: chatMessages.id });
      await tx.insert(migrationLog).values({
        userId: newUserId,
        legacyEntityType: 'chat_message',
        legacyId: msg.id,
        newEntityType: 'chat_message',
        newId: msgRow.id,
      });
    });
    stats.messagesMigrated += 1;
    log(`chat msg ${processed}/${messages.length}: ${msg.id} — migrated`);
  }

  // Reconcile denormalized counters on chat_conversations after the bulk
  // insert (the streamChatTurn capability mutates these incrementally;
  // we bypass it for migration so the values would otherwise be 0).
  if (!dryRun) {
    await db
      .update(chatConversations)
      .set({
        messageCount: sql`(SELECT count(*)::int FROM ${chatMessages} WHERE ${chatMessages.conversationId} = ${chatConversations.id})`,
        lastMessageAt: sql`(SELECT max(${chatMessages.createdAt}) FROM ${chatMessages} WHERE ${chatMessages.conversationId} = ${chatConversations.id})`,
        updatedAt: new Date(),
      })
      .where(eq(chatConversations.id, conversationId));
  }

  return stats;
}

/**
 * Map legacy chat attachments to the new schema:
 *   - 'image' with itemId: try to resolve to wardrobe_item (new flow);
 *     fall back to image-legacy with the legacy URL.
 *   - 'image' without itemId: image-legacy.
 *   - 'wardrobe_item': try to resolve itemId via migration_log; fall
 *     back to image-legacy with the URL on miss.
 *
 * legacyCount + wardrobeCount stats let the CLI summary explain how
 * many attachments are still pinned to legacy Firebase Storage.
 */
async function resolveChatAttachments(args: {
  attachments: LegacyChatAttachment[];
  newUserId: string;
  dryRun: boolean;
}): Promise<{ attachments: ChatAttachment[]; legacyCount: number; wardrobeCount: number }> {
  const { attachments, newUserId, dryRun } = args;
  const out: ChatAttachment[] = [];
  let legacyCount = 0;
  let wardrobeCount = 0;
  if (attachments.length === 0) {
    return { attachments: out, legacyCount, wardrobeCount };
  }
  const db = getDb();
  const sourceBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  for (const att of attachments) {
    let resolvedItemId: string | null = null;
    const candidateLegacyItemId = att.type === 'wardrobe_item' ? att.itemId : att.itemId;
    if (candidateLegacyItemId && !dryRun) {
      const logRow = await db.query.migrationLog.findFirst({
        where: and(
          eq(migrationLog.userId, newUserId),
          eq(migrationLog.legacyEntityType, 'wardrobe_item'),
          eq(migrationLog.legacyId, candidateLegacyItemId),
        ),
      });
      if (logRow) resolvedItemId = logRow.newId;
    }

    if (resolvedItemId) {
      out.push({ type: 'wardrobe_item', itemId: resolvedItemId });
      wardrobeCount += 1;
    } else {
      out.push({
        type: 'image-legacy',
        url: att.url,
        ...(sourceBucket ? { sourceBucket } : {}),
      });
      legacyCount += 1;
    }
  }
  return { attachments: out, legacyCount, wardrobeCount };
}

/**
 * Map legacy ChatToolCall[] → new ChatToolCall[]. Field renames:
 *   - arguments → args
 *   - id is dropped (new schema doesn't track it; tool calls are
 *     anonymous within a turn)
 *   - ok / error synthesized: legacy didn't track success state, but
 *     the presence of `result` implies the call succeeded.
 *
 * Returns null when there are no tool calls — chat_messages.tool_calls
 * is nullable jsonb.
 */
function mapLegacyToolCalls(
  legacyCalls: LegacyChatMessage['toolCalls'],
): ChatToolCall[] | null {
  if (!legacyCalls || legacyCalls.length === 0) return null;
  return legacyCalls.map((c) => ({
    name: c.name,
    args: c.arguments,
    ok: c.result !== undefined,
    error: null,
    result: c.result,
  }));
}

// ─── 5. Verification ───

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

async function transferImage(
  legacyPath: string,
  newPath: string,
  bucket: string = ITEM_PHOTOS_BUCKET,
): Promise<void> {
  const legacy = getLegacyBucket();
  const supabase = getSupabaseAdmin();

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= IMAGE_TRANSFER_RETRIES; attempt++) {
    try {
      const [buffer] = await legacy.file(legacyPath).download();
      const { error } = await supabase.storage
        .from(bucket)
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

/**
 * Ensure the try-on results bucket exists. Idempotent — checks via
 * listBuckets first and only creates if missing. Skipped in dry-run.
 *
 * Mirrors setup-models-bucket.mjs but for the private try-on bucket
 * used by the existing tryon/process.ts (so when migration completes
 * the bucket is already there for ongoing real-time try-on jobs too).
 */
async function ensureTryOnBucket(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) throw new Error(`listBuckets failed: ${listErr.message}`);
  if (buckets?.some((b) => b.name === TRY_ON_BUCKET)) {
    log(`try-on bucket "${TRY_ON_BUCKET}" already exists`);
    return;
  }
  log(`creating try-on bucket "${TRY_ON_BUCKET}" (private, 5MB limit)`);
  const { error: createErr } = await supabase.storage.createBucket(TRY_ON_BUCKET, {
    public: false,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });
  if (createErr) throw new Error(`createBucket failed: ${createErr.message}`);
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
