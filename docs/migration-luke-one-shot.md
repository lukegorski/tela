# Migration — Luke one-shot (Phase 11 preview)

This doc plans the one-shot script that imports Luke's wardrobe + outfits
+ profile from the legacy Tela app (`/Users/lukegorski/ale`, Firebase) into
the new app (`/Users/lukegorski/tela`, Supabase) under his existing new-app
account.

**Scope deliberately narrow.** This is NOT Phase 11 proper. Phase 11 will
ship a multi-user, repeatable, admin-UI-driven migration (post-D.10 + E).
This doc is for the throwaway side quest that gets Luke real test data
NOW so D.10 testing isn't against placeholder data.

The migration logic IS structured as a reusable library function so
Phase 11 can call into it later — only the CLI shell is throwaway.

---

## Why now (vs. defer to Phase 11)

| | Do now | Defer |
|---|---|---|
| Real test data for D.10 + E | ✅ today | ❌ in weeks |
| Stress-tests rich-card heuristic, lookbook pagination, chat tool calls against real wardrobe sizes | ✅ | ❌ |
| Surfaces schema-shape bugs early | ✅ | ❌ |
| D.10 + E delayed | ~8–10 hrs | 0 |
| Reusable for other users | partially (library function) | yes (Phase 11 proper) |

The 8–10 hour cost is up front; the data-shape bugs found early would
otherwise compound through D.10 + E and only surface during Phase 11.

---

## Locked architectural decisions

(M1) **`migration_log` table** as schema migration 0013.

```sql
CREATE TABLE migration_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  legacy_entity_type varchar(50) NOT NULL,    -- 'wardrobe_item' | 'outfit' | 'item_photo' | 'context' | 'generation'
  legacy_id varchar(255) NOT NULL,             -- Firestore doc ID, or synthetic key for context/generation
  new_entity_type varchar(50) NOT NULL,
  new_id uuid NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'success', -- 'success' | 'failed'
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, legacy_entity_type, legacy_id)
);
CREATE INDEX migration_log_user_id_idx ON migration_log(user_id);
```

Triple purpose: ID-mapping, idempotency, rollback handle. The `UNIQUE`
constraint catches duplicate inserts on re-run. Phase 11 keeps this
table — schema is intentionally generic.

Rollback (any user, any entity type):

```sql
DELETE FROM closet_items WHERE id IN (
  SELECT new_id FROM migration_log
  WHERE user_id = '...' AND legacy_entity_type = 'wardrobe_item'
);
DELETE FROM migration_log WHERE user_id = '...';
```

(M2) **Synthetic contexts strategy** — option (b) from critique. ONE
shared `contexts` row per distinct `(occasion, season)` tuple across
ALL of the user's legacy outfits, reused across imported outfits.
Each row tagged `calendar_context: 'imported_from_legacy'` for filtering.

Plus ONE shared `generations` row per user, tagged
`operation: 'legacy_import'`, `model: 'legacy'`, `cost_cents: 0`,
`input_snapshot: { migrated_at, legacy_uid }`, used as the
`generation_id` FK for every imported outfit.

Both are recorded in `migration_log` so they get rolled back too.

(M3) **`bgColors` → `background_color` mapping**: prefer
`legacyItem.bgColor` (single hex, present on later items) if it exists;
otherwise use `legacyItem.bgColors.tl` (top-left of the 4-corner
gradient); otherwise null.

(M4) **outfit.season default**: take `legacyOutfit.season[0]` if
non-empty AND in our enum (`'spring' | 'summer' | 'fall' | 'winter'`);
otherwise default to `'fall'`. The synthetic context's season field
inherits this. (Visual delta vs. legacy multi-season tag is acceptable
per the D.8 single-tag decision.)

(M5) **Image enhancement**: lift the legacy enhanced version. Set
`enhancement_status: 'completed'`, write `enhanced_storage_path` to
the new path. DO NOT re-run our enhancement pipeline — saves $30 and
~100 minutes for a marginal quality difference the user won't notice.
If user asks for re-enhancement later, they can trigger via wardrobe.

(M6) **`profile.closetRead`** is NOT auto-triggered after import.
Costs ~30¢, can fail, irrelevant to migration's job. The user gets
a fresh closet read naturally on their next outfit-generation flow.
Print a one-liner reminder at script end.

(M7) **Out of scope** (defer to Phase 11 proper):
- Chat conversations + messages
- Try-on results (`try_on_jobs`, try-on result images)
- Generation cost history (`generations` table beyond the synthetic row)
- Activity logs / events
- Style DNA blob (we have `profile.closetRead` — better path)
- Multi-user generalization

(M8) **Library + CLI structure**:
- `packages/capabilities/src/migration/migrateLegacyUser.ts` — the
  reusable library function, called by both the one-shot script AND
  any future Phase 11 capability/admin UI. Takes `(legacyUid,
  newUserId, opts)`.
- `packages/capabilities/scripts/migrate-user-from-legacy.ts` — the
  one-shot CLI wrapper. Parses args, sets up Firebase admin, calls
  the library function, prints results.

(M9) **Email-based ID resolution** with explicit override fallback:
- Default: script accepts `--legacy-email luke@lukegorski.com`,
  resolves both legacy `uid` (Firebase Auth lookup) and new `user_id`
  (Supabase users table query) by email.
- Override: `--legacy-uid ABC123 --new-user-id UUID` for cases where
  emails differ.

(M10) **Run procedure** with safety modes:

```bash
# 1. Temporarily add legacy Firebase admin creds to Doppler dev
~/bin/doppler secrets set FIREBASE_ADMIN_PROJECT_ID="..." \
  FIREBASE_ADMIN_CLIENT_EMAIL="..." \
  FIREBASE_ADMIN_PRIVATE_KEY="..." \
  --project tela --config dev --silent

# 2. Dry-run first — prints what WOULD migrate, no writes
~/bin/doppler run --project tela --config dev -- \
  pnpm --filter @tela/capabilities exec tsx \
  scripts/migrate-user-from-legacy.ts \
  --legacy-email luke@lukegorski.com --dry-run

# 3. Real run
~/bin/doppler run --project tela --config dev -- \
  pnpm --filter @tela/capabilities exec tsx \
  scripts/migrate-user-from-legacy.ts \
  --legacy-email luke@lukegorski.com

# 4. After success, remove Firebase admin creds from Doppler
~/bin/doppler secrets delete FIREBASE_ADMIN_PROJECT_ID \
  FIREBASE_ADMIN_CLIENT_EMAIL FIREBASE_ADMIN_PRIVATE_KEY \
  --project tela --config dev
```

The temporary Doppler write is the cleanest path — `doppler run`
already wires env to the child process, so we don't need to
hand-craft `export $(grep ...)` shell incantations. Removed after
migration so legacy creds don't linger in dev.

---

## Mapping — legacy → new

### User profile

| Legacy field | New target | Notes |
|---|---|---|
| `email`, `displayName` | already on `users` row (auth-created) | skip |
| `onboardingComplete` | `users.onboarding_complete` | set true if legacy = true; otherwise leave existing |
| `locale` | `users.locale` | overwrite if legacy has one |
| `preferences.styleKeywords` | `users.preferences.styleKeywords` | direct map |
| `preferences.favoriteColors` | `users.preferences.favoriteColors` | direct map |
| `preferences.avoidColors` | `users.preferences.avoidColors` | direct map |
| `preferences.formality` | `users.preferences.formality` | direct map |
| `preferences.lifestyle` | `users.preferences.lifestyle` | direct map |
| `bodyInfo.{bodyType,height,fitPreference}` | `users.bodyInfo.*` | direct map |
| `wardrobeGaps: string[]` | rows in `wardrobe_gaps` table (per-string) | per D.5 — relational, not JSONB |
| `styleDna` | DROP | replaced by closet read |
| `tryOnSettings` | `users.try_on_settings` | direct map |
| `location` | `users.location` | direct map (omit `country` if missing) |

Profile merge is non-destructive: only overwrites a field if (a) legacy
has a value AND (b) new is null/empty. Avoids clobbering anything Luke
set on the new app.

### Wardrobe items

For each legacy `wardrobeItems` document:

1. INSERT `item_photos` row:
   - `user_id`: new user ID
   - `storage_path`: new path `${newUserId}/${uuid}.jpg` (the original)
   - `width`, `height`: from legacy if available, else null
   - `enhancement_status`: `'completed'` (we lift the enhanced version, M5)
   - `enhanced_storage_path`: new path for the enhanced version
   - `enhanced_at`: legacy `createdAt` (or null)
   - `background_color`: per M3
2. Image transfer (parallel within the per-item txn):
   - Download `originalImageURL` (or `imageURL` if no separate original) from Firebase Storage
   - Upload to Supabase Storage at the new original path
   - Download `imageURL` (the enhanced version) if `originalImageURL` exists and differs
   - Upload to the new enhanced path
3. INSERT `closet_items` row:
   - `closet_id`: get-or-create user's closet row
   - `user_id`, `photo_id` (from step 1)
   - `category`: legacy `analysis.category` ✓
   - `subcategory`: legacy `analysis.subcategory` ✓
   - `primary_color`, `secondary_color`: direct ✓
   - `pattern`, `style`, `fit`, `length`, `sleeve_length`: direct ✓
   - `description`: legacy `analysis.description` ✓
   - `formality_score`: legacy `analysis.formality` (number 0-1) ✓
   - `material_weight`: derive from legacy `analysis.material` if it
     contains "wool", "cotton", etc. — otherwise default `'medium'`.
     **Alt: ignore, keep existing default 'medium'.**
   - `material`: legacy `analysis.material` (free text) ✓ (D.6 column)
   - `season_compatibility`: legacy `analysis.season` (string[]) ✓
   - `analysis_locale`: legacy `analysisLocale` ✓
   - `background_color`: per M3
4. INSERT `migration_log`:
   - `(legacy_id: legacy doc ID, new_id: new closet_items.id,
     legacy_entity_type: 'wardrobe_item', new_entity_type: 'closet_item')`
5. INSERT `migration_log` for the photo:
   - `(legacy_id: legacy doc ID + ':photo', new_id: item_photos.id,
     legacy_entity_type: 'item_photo', new_entity_type: 'item_photo')`

All in one Drizzle transaction.

### Outfits

For each legacy `outfits` document:

1. Resolve item IDs: `legacyOutfit.items.map(legacyItemId =>
   migrationLog[legacyItemId].newId)`. Skip the outfit if ANY item
   didn't migrate (log skip reason; don't fail the script).
2. Resolve or create the synthetic context (per M2):
   - Compute key = `(legacyOutfit.occasion, season-first)`
   - If `contextsByKey.get(key)` exists, reuse
   - Else INSERT one `contexts` row + record in `migration_log`
3. INSERT outfit:
   - `user_id`, `generation_id` (shared synthetic, M2),
     `context_id` (per (occasion, season))
   - `rationale`: legacy `reasoning`
   - `name`: legacy `name`
   - `wardrobe_assessment`: legacy `wardrobeAssessment`
   - `pairing_key`: recompute from new item IDs (legacy keys won't match)
   - `saved`: legacy `saved`
   - `saved_at`: legacy `savedAt`
   - `feedback`: legacy `feedback` (`'up'` | `'down'` | null)
   - `worn_at`: null (legacy didn't track this)
   - `created_at`: legacy `createdAt` (preserve original date)
4. INSERT `outfit_items` rows:
   - For each item: `(outfit_id, closet_item_id (mapped), role)`.
   - Role: derive from item category — `'top'`, `'bottom'`, `'dress'`,
     `'shoes'`, `'outerwear'`, `'accessory'`. Skip items whose
     category isn't in our role enum.
5. INSERT `migration_log` for the outfit.

All in one Drizzle transaction.

---

## Verification phase

End of script, before exit:

1. **Counts**:
   - Legacy wardrobe items count vs. `closet_items` rows added (per `migration_log`)
   - Legacy outfits count vs. `outfits` rows added
   - Skipped outfits count (with reasons)
2. **Spot-check 5 random items**:
   - HTTP GET on a freshly-signed URL for the enhanced photo path
   - Expect HTTP 200, content-type image/*
3. **Spot-check 1 random outfit**:
   - SELECT the outfit + outfit_items + closet_items + item_photos
   - Confirm signed URLs work
4. **Print summary**:
   ```
   ✓ Migrated 87 wardrobe items (84 with enhanced version)
   ✓ Migrated 23 outfits (1 skipped: items not migrated)
   ✓ Created 4 synthetic contexts, 1 synthetic generation
   ✓ Profile fields merged: locale, location, preferences, bodyInfo, 6 wardrobeGaps
   ✓ All spot-check URLs return 200
   
   NEXT STEP: open /en/wardrobe in your browser to verify visually.
   Your closet read will regenerate on your next outfit generation.
   ```

---

## Failure modes + recovery

- **Network failure mid-image-transfer**: per-item txn rolls back; `migration_log` doesn't get the entry; re-run skips items already in `migration_log` and retries the failed one. Re-runs are safe.
- **Partial outfit migration**: same — per-outfit txn means atomic. Re-run skips done, retries failed.
- **Schema drift after partial migration**: extremely unlikely (we just did the prep), but fix would be: `--rollback` flag wipes everything via `migration_log`, then fix schema, then re-run.
- **OpenAI vision API blip during NOTHING**: migration doesn't call AI. Pure data transfer.
- **Firebase auth blip**: cached service-account token; should be robust.
- **Duplicate run**: `migration_log`'s UNIQUE constraint catches it; failures roll back the txn; subsequent rows continue.

---

## What this script does NOT do

- Phase 11 features: multi-user batch, admin UI, scheduled runs, partial-data invitations
- Chat history / try-on results / cost history (M7)
- Re-enhance images (M5)
- Trigger AI calls (M6)
- Migrate other users
- Touch the legacy Firebase data (read-only access; legacy app keeps running)

---

## Hardened session-start prompt for the migration script session

Copy this into a fresh Claude Code session at `/Users/lukegorski/tela`:

```
You are writing a one-shot migration script that imports Luke's
wardrobe + outfits + profile from the legacy Tela app (Firebase) to
the new app (Supabase) under his existing new-app account.

WORKING DIR: /Users/lukegorski/tela
LEGACY DIR: /Users/lukegorski/ale (READ-ONLY — never edit)

This is a side quest, NOT a port phase. Don't touch any D.X work
(D.9b/c, D.10, etc.). Migration script lives in:
- packages/capabilities/src/migration/migrateLegacyUser.ts (library)
- packages/capabilities/scripts/migrate-user-from-legacy.ts (CLI)

══════════════════════════════════════════════════════════
WHAT I ALREADY VERIFIED — don't re-discover:
══════════════════════════════════════════════════════════

LEGACY DATA SHAPES (from /Users/lukegorski/ale/src/lib/types.ts):
  WardrobeItem: id, imageURL (enhanced URL),
    imagePath (Firebase Storage path of enhanced),
    originalImageURL?, originalImagePath?,
    enhancementStatus, bgColor? (single hex),
    bgColors? ({tl,tr,bl,br}), analysis: {
      category (top|bottom|outerwear|dress|shoes|accessory),
      subcategory, primaryColor, secondaryColor (nullable),
      pattern, style, season (string[]), formality (number 0-1),
      material (free text), description, fit?, length?, sleeveLength?
    }, analysisLocale?, createdAt
  Outfit: id, items (string[] of legacy wardrobeItem doc IDs),
    pairingKey?, itemImages, reasoning, name?, occasion (string),
    season (string[]), saved, feedback ('up'|'down'|null),
    savedAt?, wardrobeAssessment?, createdAt
    (try-on fields, model, itemSnapshots, translations — all DROP)
  UserProfile: uid, email, onboardingComplete, locale?,
    preferences: { styleKeywords, favoriteColors, avoidColors,
      formality, lifestyle },
    bodyInfo: { bodyType, height, fitPreference },
    wardrobeGaps (string[]), styleDna (DROP), tryOnSettings,
    location: { city, country?, lat, lon, timezone, tempUnit }

LEGACY STORAGE BUCKET: aletela.firebasestorage.app
LEGACY PATHS:
  users/{uid}/wardrobe/{itemId}.jpg (enhanced)
  users/{uid}/wardrobe/{itemId}-original.jpg (varies; sometimes
    `originalImagePath` field)

LEGACY FIREBASE ADMIN CREDS exist in /Users/lukegorski/ale/.env.local:
  FIREBASE_ADMIN_PROJECT_ID
  FIREBASE_ADMIN_CLIENT_EMAIL
  FIREBASE_ADMIN_PRIVATE_KEY
Procedure: temporarily copy these to Doppler dev for the migration
run, delete after. Full procedure in M10 of
docs/migration-luke-one-shot.md.

NEW APP CAPABILITIES (already wired — DON'T touch):
  wardrobe.requestPhotoUpload, confirmPhotoUpload, addItem
  item.analyze, profile.closetRead
  outfit.generate (uses contextId + generationId FK)
  context.assemble (we won't use; we synthesize contexts directly)

NEW APP SCHEMA (already deployed):
  users, closets, closet_items, item_photos
  contexts (occasion, season, time_of_day, weather, calendar_context)
  generations (operation, prompt_name, ..., cost_cents, input_snapshot)
  outfits (FK contextId NOT NULL, FK generationId NOT NULL,
    rationale, name, wardrobeAssessment, pairingKey, saved,
    saved_at, feedback, worn_at)
  outfit_items (FK outfitId, FK closetItemId, role)
  wardrobe_gaps (relational — one row per gap)
  try_on_jobs (DROP from migration scope)

══════════════════════════════════════════════════════════
LUKE'S 10 LOCKED ARCHITECTURAL DECISIONS:
══════════════════════════════════════════════════════════

(M1) migration_log table as schema migration 0013. See spec in
     docs/migration-luke-one-shot.md. UNIQUE constraint on
     (user_id, legacy_entity_type, legacy_id).
(M2) Synthetic contexts: ONE shared row per distinct
     (occasion, season-first) tuple. Plus ONE shared generations
     row tagged operation='legacy_import'. Both recorded in
     migration_log for rollback.
(M3) bgColor mapping: prefer legacyItem.bgColor; else
     legacyItem.bgColors.tl; else null.
(M4) outfit.season default: legacyOutfit.season[0] if non-empty
     AND valid; else 'fall'.
(M5) Image enhancement: LIFT legacy enhanced version (don't
     re-enhance). Set enhancement_status='completed'.
(M6) profile.closetRead: NOT auto-triggered. User runs naturally.
(M7) Out of scope: chat, try-on, cost history, activity events,
     styleDna, multi-user.
(M8) Library + CLI split:
     packages/capabilities/src/migration/migrateLegacyUser.ts
       + packages/capabilities/scripts/migrate-user-from-legacy.ts
(M9) ID resolution: --legacy-email default, --legacy-uid +
     --new-user-id override.
(M10) Run procedure: temp Doppler creds → dry-run → real run →
      remove Doppler creds. See full procedure in plan doc.

══════════════════════════════════════════════════════════
STEP 1 — orient:
══════════════════════════════════════════════════════════

  Read PORT.md (especially pitfalls + execution rules).
  Read docs/migration-luke-one-shot.md cover to cover (the spec).
  Read /Users/lukegorski/ale/src/lib/types.ts (legacy data shapes).
  Read /Users/lukegorski/ale/src/lib/firebase-admin.ts (admin SDK
    init pattern — mirror in script).
  Read packages/capabilities/src/storage/supabase.ts
    (getSupabaseAdmin, ITEM_PHOTOS_BUCKET).
  Read packages/capabilities/scripts/setup-models-bucket.mjs
    (precedent for one-shot script pattern in this repo).
  Read packages/capabilities/src/wardrobe/{addItem,
    requestPhotoUpload, confirmPhotoUpload}.ts (don't call them
    directly; you write directly to DB + Storage, but the patterns
    show you the shapes).
  Read packages/db/src/schema/{users,wardrobe,outfits,profiles}.ts
    (target schemas).
  Run: git -C /Users/lukegorski/tela log --oneline -10

══════════════════════════════════════════════════════════
STEP 2 — restate to me before writing code:
══════════════════════════════════════════════════════════

  No new decisions — Luke locked all 10 architectural choices
  (M1-M10 above). Just restate:

  - The 10 locked decisions in your own words
  - The library + CLI structure
  - The order of migration: schema migration 0013 → profile merge
    → wardrobe items (with image transfer) → synthetic context +
    generation → outfits → verification
  - The dry-run vs real-run distinction
  - The Doppler creds add-then-remove procedure
  - Why we synthesize contexts (FK requirement on outfits)

══════════════════════════════════════════════════════════
STEP 3 — execution rules:
══════════════════════════════════════════════════════════

  - Legacy /Users/lukegorski/ale is READ-ONLY. Firebase admin SDK
    only reads. Never write.
  - Doppler required for any Supabase access.
  - Schema migration 0013: edit packages/db/src/schema/migration.ts
    (NEW file) → db:generate → INSPECT SQL → db:migrate → rebuild.
    The migration_log table is intentionally generic — Phase 11
    will keep it.
  - Per-entity Drizzle transactions (item_photos + closet_items
    in one txn; outfit + outfit_items in one txn).
  - Image transfer: bounded concurrency (10 parallel within an
    item batch), 2 retries per image, log failures to
    migration_log with status='failed'.
  - Idempotency: every INSERT checks migration_log first
    (legacy_id + user_id + entity_type). If found, skip.
  - Profile merge is NON-DESTRUCTIVE: only overwrite if (a)
    legacy has value AND (b) new is null/empty. Don't clobber
    user's new-app activity.
  - Skip outfits whose items didn't all migrate. Log skip reason.
    Don't fail the script.
  - Recompute pairing_key from new item IDs (legacy keys won't
    match new UUIDs).
  - All photos go to item-photos bucket (M5 — no chat-attachments
    needed since chat photos use the same bucket per D.9 D5).
  - HEIC: legacy doesn't appear to convert client-side. Verify
    every photo's mimeType is image/jpeg|png|webp; skip + log
    if HEIC.
  - Pitfall #11/#12/#13 don't apply to the script (no React),
    but Pitfall #11 (stable hooks) does NOT relate to a CLI script.
  - Before commit: pnpm verify (the migration_log schema is the
    only thing pnpm verify exercises; the script itself isn't
    typechecked by default — make sure the script TS compiles too
    via `pnpm --filter @tela/capabilities exec tsc --noEmit
    scripts/migrate-user-from-legacy.ts`).
  - One coherent commit when ready → ASK before pushing.
  - After push: WAIT for Luke to run the script (he runs it, not
    you — script touches dev DB + does image transfer; he wants
    eyes on it).

══════════════════════════════════════════════════════════
STEP 4 — pre-commit verification:
══════════════════════════════════════════════════════════

  pnpm verify (for the schema + library typecheck).
  Plus: tsc --noEmit on the script itself.
  DO NOT run the script as part of verification — it would
  actually migrate data. Luke runs it himself.

══════════════════════════════════════════════════════════
STEP 5 — communicate before pushing + before running:
══════════════════════════════════════════════════════════

  Per Luke's memory rule: every push needs explicit approval.
  ALSO: this script touches user data + does network image
  transfer. Even after push, Luke runs it himself with --dry-run
  first, reviews output, then runs for real.

══════════════════════════════════════════════════════════
SCOPE ESTIMATE:
══════════════════════════════════════════════════════════

  Schema migration 0013 + library + CLI script + verification:
  ~600-800 lines total. 8-10 hours of focused work.
  Single commit (or split: 13a = schema + library, 13b = CLI +
  verification — your call based on natural break).

Now: read all files in STEP 1, restate per STEP 2, then code.
Surface any decision NOT covered by M1-M10 to Luke BEFORE
picking silently.
```
