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

## Locked architectural decisions (M1–M12)

### M1 — `migration_log` + `migration_failures` tables (schema migration 0013)

Two tables. `migration_log` is success-only (also serves as ID map):

```sql
CREATE TABLE migration_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  legacy_entity_type varchar(50) NOT NULL,    -- 'wardrobe_item' | 'outfit' | 'item_photo' | 'context' | 'generation'
  legacy_id varchar(255) NOT NULL,             -- Firestore doc ID, OR synthetic key (see M2)
  new_entity_type varchar(50) NOT NULL,
  new_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, legacy_entity_type, legacy_id)
);
CREATE INDEX migration_log_user_id_idx ON migration_log(user_id);

CREATE TABLE migration_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  legacy_entity_type varchar(50) NOT NULL,
  legacy_id varchar(255) NOT NULL,
  reason text NOT NULL,
  attempt_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX migration_failures_user_id_idx ON migration_failures(user_id);
```

**Two-table model rationale:**
- `migration_log` = "this row was successfully migrated, here's the ID map" — ONE row per legacy entity, ever. UNIQUE constraint catches accidental re-inserts.
- `migration_failures` = "this row failed at attempt T with reason R" — APPEND-ONLY across retries, so you can see "tried 3 times, failed each time with HEIC error."
- Re-runs: "skip if exists in migration_log" handles idempotency. Failures get a new row in migration_failures each time.

**Don't forget**: export both tables from `packages/db/src/schema/index.ts` after creating `packages/db/src/schema/migration.ts`.

Rollback (any user):

```sql
DELETE FROM closet_items WHERE id IN (
  SELECT new_id FROM migration_log
  WHERE user_id = '...' AND legacy_entity_type = 'wardrobe_item'
);
-- repeat for item_photos, outfits, outfit_items (FK cascades may handle some)
DELETE FROM migration_log WHERE user_id = '...';
DELETE FROM migration_failures WHERE user_id = '...';
```

Phase 11 keeps both tables — schema is intentionally generic.

### M2 — Synthetic contexts + generations (with deterministic IDs)

Outfits have NOT NULL FKs to `contexts.id` and `generations.id`. Legacy
outfits have neither — they have inline `occasion` and `season[]`. Solution:
synthesize the missing rows.

**Synthetic context strategy**: ONE shared `contexts` row per distinct
`(occasion, season-first)` tuple across the user's outfits. Reused across
imported outfits.

**Synthetic generation strategy**: ONE shared `generations` row per user,
used as the `generation_id` FK for every imported outfit.

**Deterministic legacy_id convention** (so re-runs don't create duplicates):

| Synthetic row | `legacy_id` convention |
|---|---|
| Context | `synthetic:context:${occasion}:${season}` |
| Generation | `synthetic:generation:${legacyUid}` |

Re-runs see the row in `migration_log`, fetch the existing `new_id`, reuse
it. UNIQUE constraint enforces.

Synthetic generations row metadata:

```typescript
{
  user_id: newUserId,
  operation: 'legacy_import',
  prompt_name: 'legacy_import',
  prompt_version_id: '00000000-0000-0000-0000-000000000000', // synthetic
  model: 'legacy',
  input_snapshot: { migrated_at: <iso>, legacy_uid: <uid> },
  raw_output: '',
  parsed_output: null,
  latency_ms: 0,
  cost_cents: 0,
}
```

Synthetic context row metadata:

```typescript
{
  user_id: newUserId,
  occasion: <legacyOccasion>,
  season: <validated season per M4>,
  time_of_day: 'morning',          // arbitrary; outfits don't render this
  weather: null,
  calendar_context: 'imported_from_legacy',
}
```

The `calendar_context: 'imported_from_legacy'` marker lets analytics
filter imported data later.

### M3 — `bgColors` → `background_color` mapping

Legacy items have BOTH `bgColor: string` (single hex, added later) AND
`bgColors: { tl, tr, bl, br }` (4-corner gradient, original schema).
Mapping precedence:

1. `legacyItem.bgColor` if present (string, hex)
2. else `legacyItem.bgColors?.tl` (top-left corner)
3. else `null`

### M4 — `outfit.season` mapping with enum validation

Our `contexts.season` is `varchar(10) NOT NULL` and our enum is
`'spring' | 'summer' | 'fall' | 'winter'`. Legacy `Outfit.season` is
`string[]` and may contain values OUTSIDE our enum (`'all-season'`,
`'transitional'`, etc., from older outfits or AI mis-categorizations).

Logic:

```typescript
const VALID_SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;
const candidate = legacyOutfit.season?.[0]?.toLowerCase();
const season = (candidate && VALID_SEASONS.includes(candidate as any))
  ? candidate
  : 'fall';   // default
```

Visual delta vs. legacy multi-season tag is acceptable per the D.8
single-tag decision.

### M5 — Image enhancement: handle ALL FOUR legacy states

Legacy `enhancementStatus` has 4 possible states. Migration treats each
differently:

| Legacy state | Migration behavior | New `enhancement_status` |
|---|---|---|
| `'completed'` | Lift original + enhanced; both upload to new bucket | `'completed'` |
| `'failed'` | Lift original only; preserve user-visible error state | `'failed'` |
| `'enhancing'` (long-stuck) | Lift original only; let our worker re-attempt | `'pending'` |
| Field missing entirely (older items) | Lift original only; let our worker enhance | `'pending'` |

For `'pending'` cases, the migration script does NOT call our pg-boss
queue — let the existing background worker pick up `pending` rows on
its next sweep. Avoids creating coupling between migration script and
queue infrastructure.

### M6 — Don't auto-trigger `profile.closetRead`

Costs ~30¢, can fail mid-script, irrelevant to migration. The user gets
a fresh closet read naturally on their next outfit-generation flow.
Print a one-liner reminder at script end:

```
Your style profile will regenerate from your imported wardrobe the next
time you generate an outfit (e.g., open /en/outfits and tap +).
```

### M7 — Out of scope (defer to Phase 11)

- Chat conversations + messages
- Try-on results (`try_on_jobs`, try-on result images)
- Generation cost history (`generations` table beyond the synthetic row)
- Activity logs / events
- Style DNA blob (we have `profile.closetRead` — better path)
- Multi-user generalization

(`tryOnSettings` IS in scope — it's a profile field, not try-on history.)

### M8 — Library + CLI structure with explicit signature

```
packages/capabilities/src/migration/
  ├─ migrateLegacyUser.ts        — library: the work
  └─ index.ts                     — exports

packages/capabilities/scripts/
  └─ migrate-user-from-legacy.ts  — CLI wrapper; throwaway shell
```

Library function signature:

```typescript
export interface MigrateOptions {
  /** If true, no DB writes or image uploads — just print what would happen. */
  dryRun?: boolean;
  /** Restrict to a single section. Default 'all'. */
  only?: 'profile' | 'wardrobe' | 'outfits' | 'all';
}

export interface MigrateResult {
  durationMs: number;
  profile: {
    fieldsUpdated: string[];
  };
  wardrobe: {
    migrated: number;
    skipped: Array<{ legacyId: string; reason: string }>;
    imagesTransferred: number;
    imagesFailed: Array<{ legacyId: string; reason: string }>;
  };
  outfits: {
    migrated: number;
    skipped: Array<{ legacyId: string; reason: string }>;
    syntheticContextsCreated: number;
    syntheticGenerationsCreated: number;
  };
}

export async function migrateLegacyUser(
  legacyUid: string,
  newUserId: string,
  opts?: MigrateOptions,
): Promise<MigrateResult>;
```

The CLI wrapper builds `MigrateOptions` from CLI args, calls the library,
prints a human-readable summary from `MigrateResult`.

### M9 — ID resolution

CLI accepts both:
- `--legacy-email luke@lukegorski.com` (default — resolves both legacy uid via Firebase Auth + new user_id via Supabase users table)
- `--legacy-uid ABC --new-user-id UUID` (explicit override for cases where emails differ)

If the new-app account doesn't exist for the resolved email, fail with:

```
ERROR: No new-app account found for email luke@lukegorski.com.
Sign up at /en first (Google or email), then re-run.
```

Don't try to create the account — auth is its own thing.

### M10 — Run procedure (with required env vars)

```bash
# 1. Copy legacy creds + bucket name to Doppler dev (temporary).
#    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is needed too — script reads it.
LEGACY_ENV=/Users/lukegorski/ale/.env.local
for KEY in FIREBASE_ADMIN_PROJECT_ID FIREBASE_ADMIN_CLIENT_EMAIL \
           FIREBASE_ADMIN_PRIVATE_KEY NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET; do
  VALUE=$(grep "^${KEY}=" "$LEGACY_ENV" | cut -d= -f2-)
  ~/bin/doppler secrets set "${KEY}=${VALUE}" --project tela --config dev --silent
done

# 2. Dry-run first — prints what WOULD migrate, no DB writes, no image uploads.
~/bin/doppler run --project tela --config dev -- \
  pnpm --filter @tela/capabilities exec tsx \
  scripts/migrate-user-from-legacy.ts \
  --legacy-email luke@lukegorski.com --dry-run

# 3. Real run — interactive confirmation in real-run mode (M11).
~/bin/doppler run --project tela --config dev -- \
  pnpm --filter @tela/capabilities exec tsx \
  scripts/migrate-user-from-legacy.ts \
  --legacy-email luke@lukegorski.com

# 4. Remove legacy creds from Doppler.
~/bin/doppler secrets delete \
  FIREBASE_ADMIN_PROJECT_ID FIREBASE_ADMIN_CLIENT_EMAIL \
  FIREBASE_ADMIN_PRIVATE_KEY NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
  --project tela --config dev
```

Note: `tsx` may need to be added to `@tela/capabilities` devDependencies
if not already present. Verify with `pnpm --filter @tela/capabilities ls
tsx` before assuming.

### M11 — Real-run interactive confirmation

Before any DB write or image upload, in real-run mode (NOT dry-run):

```
Resolved IDs:
  Legacy uid:    abc123 (email: luke@lukegorski.com)
  New user_id:   89e7-... (email: luke@lukegorski.com)

About to migrate:
  - Profile: 5 fields to merge (locale, location, preferences, bodyInfo, 6 wardrobeGaps)
  - Wardrobe: 87 items (84 with enhanced version, 3 with HEIC content-type — will skip)
  - Outfits: 23 outfits (1 will skip: items not migrated)
  - Synthesize: 4 contexts, 1 generation

Proceed? [yN]: _
```

Defensive against migrating into the wrong account. Skip the prompt in
dry-run.

### M12 — Strongly recommended split: D.13a + D.13b

Two commits, two pushes, two Railway smoke cycles. Lower per-push risk.

| Commit | Scope | What it ships |
|---|---|---|
| D.13a | Schema + library + CLI shell, no image transfer | migration 0013 (both tables); `migrateLegacyUser` library handles profile + wardrobe metadata only (skips image transfer in this phase, marks photos as `enhancement_status='pending'`); CLI with `--dry-run`; verification skips image checks. Push, smoke-test, confirm dry-run output looks right. |
| D.13b | Image transfer + outfits + full verification | Image transfer logic (Firebase download → Supabase upload, bounded concurrency, HEIC detection); synthetic context/generation creation; outfit migration with partial-items rule (M14); pairing key recompute; full verification phase with spot-check signed URLs. Push, smoke-test, run for real. |

The image-transfer step is the highest-risk part (network, Firebase
egress, Supabase upload limits, HEIC edge cases). Isolating it means a
clean rollback path: if D.13b explodes, D.13a's profile + wardrobe-row
work stays good; only image-related state needs cleanup.

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

**Profile merge rule (non-destructive):** only overwrite a new-app field
if BOTH conditions hold:
1. Legacy has a value (not null/undefined/empty array/empty object)
2. New is null OR empty (`null`, `undefined`, `[]`, `{}`)

Empty arrays/objects on the new side count as "no value" for this purpose
(per critique #14). Avoids clobbering anything Luke set on the new app
deliberately.

### Wardrobe items

For each legacy `wardrobeItems` document, in a SINGLE Drizzle transaction:

1. **Pre-flight HEIC check**: read the storage object's `contentType`
   metadata via Firebase Admin Storage SDK
   (`bucket.file(legacyItem.imagePath).getMetadata()`). If
   `contentType` is `image/heic` or `image/heif`, append to
   `migration_failures` with reason `'HEIC unsupported'`, skip the item
   (don't insert into `migration_log`). HEIC isn't supported by our AI
   pipeline.
2. **Image transfer**:
   - Download `legacyItem.originalImagePath` (or `imagePath` if no
     separate original) from Firebase Storage:
     `const [buffer] = await bucket.file(path).download()`
   - Upload to Supabase Storage at the new original path
     (`${newUserId}/${uuid}.jpg`):
     `await supabase.storage.from('item-photos').upload(newPath, buffer, { contentType: 'image/jpeg', upsert: true })`
   - Same for the enhanced version (only if `enhancementStatus === 'completed'` per M5)
3. **INSERT `item_photos` row**:
   - `user_id`: new user ID
   - `storage_path`: new original path
   - `width`, `height`: from legacy if available, else null
   - `enhancement_status`: per M5 (one of `'completed' | 'failed' | 'pending'`)
   - `enhanced_storage_path`: new enhanced path (only if `'completed'`)
   - `enhanced_at`: `legacyItem.createdAt` if status is `'completed'`, else null
   - `background_color`: per M3
4. **INSERT `closet_items` row**:
   - `closet_id`: get-or-create user's closet row
   - `user_id`, `photo_id` (from step 3)
   - `category`, `subcategory`, `primary_color`, `secondary_color`,
     `pattern`, `style`, `fit`, `length`, `sleeve_length`, `description`:
     direct map from `legacyItem.analysis.*`
   - `formality_score`: legacy `analysis.formality` (number 0-1) ✓
   - `material_weight`: keep default `'medium'` (legacy has free-text
     `material`; mapping it to our 3-bucket enum is fuzzy — skip)
   - `material`: legacy `analysis.material` (free text) ✓ (D.6 column)
   - `season_compatibility`: legacy `analysis.season` (string[]) ✓
   - `analysis_locale`: legacy `analysisLocale` ✓ (default `'en'`)
   - `background_color`: per M3
5. **INSERT TWO `migration_log` rows** (one per entity):
   - Photo: `(legacy_id: legacyDocId + ':photo', new_entity_type: 'item_photo', new_id: photo.id)`
   - Item: `(legacy_id: legacyDocId, new_entity_type: 'closet_item', new_id: item.id)`

All of (3)–(5) in one Drizzle transaction. **Note**: inside
`db.transaction(async (tx) => { ... })`, use `tx` not `db` for all queries.

### Outfits

For each legacy `outfits` document, in a SINGLE Drizzle transaction:

1. **Resolve item IDs**: for each `legacyOutfit.items[i]`, look up
   `migration_log` for that legacy item. Build a `validItems` array of
   the items that successfully migrated.
2. **Validate structural integrity** (per critique #2 — keep partial outfits):
   - Get the categories of `validItems` (from their `closet_items.category`).
   - Outfit is valid if `(top|dress) ∈ categories AND (bottom|dress) ∈ categories`.
   - If invalid: append to `migration_failures` with reason
     `'partial-items: only ${validItems.length}/${legacyOutfit.items.length} migrated, structural validation failed'`,
     skip the outfit.
   - If valid: continue with `validItems` only (the failed-to-migrate
     items are silently dropped from the persisted outfit_items).
3. **Resolve or create the synthetic context** (per M2):
   - Compute key = `'synthetic:context:${legacyOutfit.occasion}:${validatedSeason}'`
   - Look up `migration_log`. If found, reuse `contextId`.
   - Else INSERT one `contexts` row + `migration_log` entry.
4. **Resolve or create the synthetic generation** (per M2):
   - Key = `'synthetic:generation:${legacyUid}'`
   - Look up `migration_log`. If found, reuse `generationId`.
   - Else INSERT one `generations` row + `migration_log` entry.
   - This row is created ONCE per user, on the first outfit migration.
5. **Recompute pairing_key**: legacy keys won't match new UUIDs.
   Replicate the recipe from `outfit/generate.ts`:
   ```typescript
   const itemIds = validItems.map(i => i.newId).sort();
   const pairingKey = createHash('sha256')
     .update(itemIds.join('|'))
     .digest('hex')
     .slice(0, 32);
   ```
6. **INSERT `outfits` row**:
   - `user_id`, `generation_id`, `context_id` (from steps 3-4)
   - `rationale`: legacy `reasoning`
   - `name`: legacy `name`
   - `wardrobe_assessment`: legacy `wardrobeAssessment`
   - `pairing_key`: from step 5
   - `saved`: legacy `saved`
   - `saved_at`: legacy `savedAt`
   - `feedback`: legacy `feedback`
   - `worn_at`: null (legacy didn't track this)
   - `created_at`: legacy `createdAt` (preserve original date)
7. **INSERT `outfit_items` rows**:
   - For each item in `validItems`: `(outfit_id, closet_item_id, role)`.
   - `role`: derive from item's category — `'top'`, `'bottom'`, `'dress'`,
     `'shoes'`, `'outerwear'`, `'accessory'`. Skip items whose category
     isn't in our role enum.
8. **INSERT `migration_log`** for the outfit.

---

## Image transfer — concurrency, retry, HEIC

**Concurrency**: bounded — 10 parallel transfers within a chunked batch.
No `p-limit` dependency needed; chunked Promise.all is sufficient:

```typescript
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
for (const batch of chunk(items, 10)) {
  await Promise.all(batch.map(migrate));
}
```

**Retry**: each image transfer has 2 retries with linear backoff (500ms,
1500ms). On final failure, append to `migration_failures` and skip the
item.

**HEIC detection**: read the storage object's `contentType` metadata via
`bucket.file(path).getMetadata()`. If `image/heic` or `image/heif`, skip
the item. Filename extension alone is unreliable — iPhone uploads
sometimes have `.jpg` extension but HEIC content.

**Cost note (informational)**: 200 items × 2 versions × ~2MB =
~800MB Firebase egress = ~$0.10. Negligible for Luke alone; would
matter for Phase 11 multi-user scale. No action needed for this script.

---

## Logging strategy

Long-running script needs progress output so it doesn't look hung. Use
`pino` (already in the repo for the API server) OR plain `console.log`
with timestamps. Per item:

```
[2026-04-27T10:23:14Z] [migrate] wardrobe item 23/87: abc123 — uploading...
[2026-04-27T10:23:18Z] [migrate] wardrobe item 23/87: abc123 — done (1.2s, original + enhanced)
```

Per outfit:

```
[2026-04-27T10:31:22Z] [migrate] outfit 7/23: xyz789 — items resolved (4/4)
[2026-04-27T10:31:23Z] [migrate] outfit 7/23: xyz789 — done (synthetic ctx reused)
```

Final summary printed regardless of success/failure (catch-block prints
the partial result).

---

## Verification phase

End of script, before exit (skipped in dry-run):

1. **Counts**:
   - Legacy wardrobe items count vs. `closet_items` rows added per
     `migration_log`
   - Legacy outfits count vs. `outfits` rows added
   - Skipped items + outfits with reasons (from `migration_failures`)
2. **Spot-check 5 random items**:
   - Mint a fresh signed URL for the photo's `storage_path` (and
     `enhanced_storage_path` if set)
   - HTTP GET the URL, expect 200 + `content-type: image/*`
3. **Spot-check 1 random outfit**:
   - SELECT outfit + outfit_items + closet_items + item_photos
   - Confirm joined item count > 0 and signed URLs work
4. **Print summary** to stdout (sample):
   ```
   ✓ Migrated 87 wardrobe items (84 with enhanced version, 3 HEIC skipped)
   ✓ Migrated 23 outfits (1 skipped: structural validation failed after 2/4 items missing)
   ✓ Created 4 synthetic contexts, 1 synthetic generation
   ✓ Profile fields merged: locale, location, preferences, bodyInfo, 6 wardrobeGaps
   ✓ All spot-check URLs return 200

   NEXT STEP: open /en/wardrobe in your browser to verify visually.
   Your closet read will regenerate on your next outfit generation.
   ```

---

## Failure modes + recovery

- **Network failure mid-image-transfer**: per-item txn rolls back;
  `migration_log` doesn't get the entry; re-run picks it up via
  "skip if exists in migration_log" logic. Re-runs are safe.
- **Partial outfit migration**: same — per-outfit txn means atomic.
  Re-run skips done, retries failed.
- **Schema drift after partial migration**: extremely unlikely (we just
  did the prep), but fix would be: `--rollback` mode wipes everything
  via `migration_log`, then fix schema, then re-run.
- **Firebase auth blip**: cached service-account token; should be robust.
- **Duplicate run**: `migration_log`'s UNIQUE constraint catches it;
  failures roll back the txn; subsequent rows continue.
- **HEIC items**: skipped (not failed) — appended to `migration_failures`
  with `reason: 'HEIC unsupported'`. User can manually re-upload via the
  new app's wardrobe upload after migration.

---

## What this script does NOT do

- Phase 11 features: multi-user batch, admin UI, scheduled runs,
  partial-data invitations
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
(D.10, etc.). Migration script lives in:
- packages/capabilities/src/migration/migrateLegacyUser.ts (library)
- packages/capabilities/scripts/migrate-user-from-legacy.ts (CLI)

══════════════════════════════════════════════════════════
THE FULL SPEC IS docs/migration-luke-one-shot.md
══════════════════════════════════════════════════════════

Read that file cover to cover. It has every decision (M1-M12),
field mapping, edge case, and error handling rule. The summary
below is just the entry point.

══════════════════════════════════════════════════════════
THE 12 LOCKED DECISIONS — one-line each:
══════════════════════════════════════════════════════════

(M1) Schema migration 0013 adds TWO tables: migration_log
     (success-only, ID map, UNIQUE constraint) + migration_failures
     (append-only debug log).
(M2) Synthesize one shared contexts row per (occasion, season)
     tuple + one shared generations row per user. Deterministic
     legacy_id keys: 'synthetic:context:${occasion}:${season}'
     and 'synthetic:generation:${legacyUid}'.
(M3) bgColor mapping: prefer legacyItem.bgColor; else
     legacyItem.bgColors.tl; else null.
(M4) outfit.season default: legacyOutfit.season[0] if it's in
     {spring,summer,fall,winter}; else 'fall'.
(M5) Image enhancement: handle 4 legacy states ('completed',
     'failed', 'enhancing', missing). See M5 table in plan.
(M6) profile.closetRead is NOT auto-triggered. User runs naturally.
(M7) Out of scope: chat, try-on, cost history, activity events,
     styleDna, multi-user.
(M8) Library + CLI split with explicit signature. See plan M8.
(M9) ID resolution: --legacy-email default (resolves both sides
     by email); --legacy-uid + --new-user-id override. Fail clearly
     if new account doesn't exist.
(M10) Run procedure: copy 4 env vars to Doppler dev (including
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) → dry-run → real run →
      remove. Verify tsx is installed.
(M11) Real-run interactive confirmation: print resolved IDs +
      preview counts, ask "Proceed? [yN]" before any writes.
      Skip prompt in dry-run.
(M12) Strongly recommended split: D.13a (schema + library + CLI
      shell, no image transfer) → D.13b (image transfer + outfits
      + verification). Two commits, two Railway smoke cycles.

══════════════════════════════════════════════════════════
STEP 1 — orient (in this order):
══════════════════════════════════════════════════════════

  1. PORT.md (rules + execution discipline)
  2. docs/migration-luke-one-shot.md (THE SPEC — cover to cover)
  3. /Users/lukegorski/ale/src/lib/types.ts (legacy data shapes)
  4. /Users/lukegorski/ale/src/lib/firebase-admin.ts (admin SDK
     init pattern — mirror in script)
  5. packages/capabilities/src/storage/supabase.ts (getSupabaseAdmin,
     ITEM_PHOTOS_BUCKET)
  6. packages/capabilities/src/wardrobe/itemShape.ts (the rich-shape
     reshape pattern; helps you understand which fields belong on
     closet_items vs item_photos)
  7. packages/capabilities/src/outfit/generate.ts (pairing-key
     recipe + outfit structural validation logic to mirror)
  8. packages/capabilities/scripts/setup-models-bucket.mjs
     (one-shot script precedent)
  9. packages/db/src/schema/{users,wardrobe,outfits,profiles}.ts
     (target schemas)
  10. packages/db/src/schema/index.ts (so you know to add
      migration.ts to the export list)

  Then: git -C /Users/lukegorski/tela log --oneline -10

══════════════════════════════════════════════════════════
STEP 2 — restate to me before writing code:
══════════════════════════════════════════════════════════

  - The 12 locked decisions in your own words
  - Why we need synthetic contexts AND synthetic generations
    (NOT NULL FKs on outfits)
  - The two-table model (migration_log success-only + migration_failures
    append-only) and what each is for
  - The 4 enhancement states and how each is mapped
  - The partial-outfit rule (keep if structurally valid)
  - The non-destructive profile merge rule
  - The 13a vs 13b split + what's in each

══════════════════════════════════════════════════════════
STEP 3 — execution rules:
══════════════════════════════════════════════════════════

  - Legacy /Users/lukegorski/ale is READ-ONLY. Firebase admin SDK
    only reads. Never write.
  - Doppler required for any Supabase access.
  - Schema migration 0013: edit packages/db/src/schema/migration.ts
    (NEW file) → export from schema/index.ts → db:generate →
    INSPECT generated SQL → db:migrate → rebuild chain. Both
    migration_log AND migration_failures tables go in this migration.
  - Per-entity Drizzle transactions: db.transaction(async (tx) =>
    { ... }) — use `tx` inside, NOT `db`.
  - Image transfer:
      Download: const [buffer] = await bucket.file(path).download()
      Upload: await supabase.storage.from('item-photos').upload(
        newPath, buffer, { contentType: 'image/jpeg', upsert: true })
      Bounded concurrency 10, 2 retries with linear backoff.
  - HEIC detection: bucket.file(path).getMetadata() → check
    contentType. Skip if image/heic|image/heif.
  - Idempotency: every INSERT checks migration_log first
    (legacy_id + user_id + entity_type). If found, skip + reuse new_id.
  - Profile merge is NON-DESTRUCTIVE: only overwrite if (a) legacy
    has value AND (b) new is null/undefined/[]/{}.
  - Outfit partial-items: keep if surviving items satisfy
    (top|dress) AND (bottom|dress); else skip + log to
    migration_failures.
  - Recompute pairing_key from new item IDs (legacy keys won't
    match new UUIDs). Use the recipe from outfit/generate.ts.
  - Bypass capability layer intentionally (no requestContext, no
    logEvent, no rate limits). Migration is bulk admin work; events
    + audits don't apply.
  - Progress logging per item / per outfit (timestamps; counter X/N).
  - Pitfall #11/#12/#13 don't apply (no React).
  - Before commit: pnpm verify (for the schema + library typecheck).
    Script itself uses tsx at runtime — its TS errors surface there.
  - One coherent commit per phase (13a, 13b) → ASK before pushing.
  - After push: WAIT for Luke to run the script. Luke runs it,
    not you.

══════════════════════════════════════════════════════════
STEP 4 — pre-commit verification:
══════════════════════════════════════════════════════════

  pnpm verify (full chain). DO NOT run the migration script as
  part of verification — Luke runs it himself with --dry-run first.

══════════════════════════════════════════════════════════
STEP 5 — communicate before pushing + before running:
══════════════════════════════════════════════════════════

  Per Luke's memory rule: every push needs explicit approval.
  Plus: this script touches user data + does network image transfer.
  Even after push, Luke runs --dry-run first, reviews output,
  then runs for real with the M11 interactive confirmation gate.

══════════════════════════════════════════════════════════
SCOPE ESTIMATE:
══════════════════════════════════════════════════════════

  Schema + library + CLI + verification: ~600-800 lines total.
  8-10 hours of focused work.
  TWO commits (D.13a + D.13b per M12).

Now: read all files in STEP 1 (the plan doc is the spec — read
it carefully), restate per STEP 2, then code. Surface any decision
NOT covered by M1-M12 to Luke BEFORE picking silently.
```
