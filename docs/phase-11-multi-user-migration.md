# Phase 11 — Multi-user migration (the cutover-blocking workstream)

This doc plans the migration of all real legacy users onto the new app
BEFORE the production cutover. Goal: when DNS moves and users sign in,
they find their wardrobe + outfits + try-on results + chat history
exactly as they left them. **They should not be able to tell the
platform was migrated.**

Builds on `docs/migration-luke-one-shot.md` (Phase 11 PREVIEW — the
one-shot we ran for Luke's account). Extends scope to multi-user +
adds try-on + chat history that Phase 11 preview deferred.

---

## User inventory (verified from admin.telastyle.app screenshot)

All 9 users are REAL (not test accounts).

| User | Items | Outfits | Migration risk |
|---|---|---|---|
| Marina Guimarães (marinasramos…@gmail.com) | 59 | 1 | HIGH — biggest dataset, 3× anything we've tested |
| Luke Conrad (luke@lukegorski.com) | 17 | 16 | ✅ already migrated (Phase 11 preview) — re-run safe per migration_log idempotency |
| Isaac Amor Trujillo Villegas (isaac.trujillo.villegas@gmail.com) | 10 | 12 | MEDIUM — first real wardrobe + many outfits combo |
| Romano Licea (licearomano@gmail.com) | 8 | 0 | LOW — wardrobe-only |
| Naguib Kuri (kurinaguib@gmail.com) | 1 | 0 | TRIVIAL |
| Bárbara Cunha (cunhababu@gmail.com) | 0 | 0 | EMPTY — profile only |
| Paulina Herrera (paulina@phcrea.com) | 0 | 0 | EMPTY |
| Eduardo Romero (eduardo.romero@payjoy.com) | 0 | 0 | EMPTY |
| Daniel A. (dadissi@gmail.com) | 0 | 0 | EMPTY |

**Totals**: 95 items + 29 outfits + N try-on results (unknown until
inventory) + N chat conversations (unknown until inventory).

---

## What "they shouldn't know we migrated" requires

Three additions to the Phase 11 preview scope (which only covered
wardrobe + outfits + profile):

1. **Try-on results** — if Marina or Isaac try-on'd an outfit, they
   expect to see that result on the outfit card. Without migration,
   the card shows "Try on" CTA → noticeable.
2. **Chat conversations + messages** — if any user used the AI chat,
   the history must persist. Empty chat → noticeable.
3. **Auth identity linking** — pre-create Supabase Auth users for all
   9 emails so when they sign in via Google OAuth, Supabase links the
   Google identity to the existing user (where their migrated data
   lives) rather than creating a new orphaned user.

Plus several smaller invisibility touches:
- `onboarding_complete = true` for ALL migrated users (skip the D.5 quiz)
- `try_on_settings` defaulted (skip the model picker)
- Outfit `pairing_key` recomputation (already in scope per preview)

---

## Locked architectural decisions

### M1 — Auth identity strategy: pre-create Supabase users via Admin API

For each of the 9 legacy emails, before migration runs:

```typescript
await supabase.auth.admin.createUser({
  email: legacyUser.email,
  email_confirm: true,        // marks email as verified
  user_metadata: {
    migrated_from_legacy: true,
    legacy_uid: legacyUser.uid,
  },
});
```

Then a corresponding row in our app `users` table (the trigger that
auto-creates app users from auth users SHOULD fire — verify; if not,
manually insert). Migration writes data keyed to that app user's UUID.

When the user signs in via Google OAuth post-cutover:
- Supabase OAuth flow receives Google credential with verified email
- Looks up users by email → finds existing pre-created user
- Links Google identity to that user (assuming "Allow account linking" is ON — see M2)
- User lands in their populated account

**This is the core mechanism that makes invisibility possible.** Without
it, OAuth sign-in creates a new orphaned user with empty data.

### M2 — Auth linking validation is the make-or-break gate (Day 1)

Before doing ANY migration work, validate that pre-create + Google
OAuth correctly LINK (don't create-new). Procedure:

1. Verify Supabase project setting in Dashboard:
   Authentication → Settings → "Allow account linking" must be ON.
   If OFF, switch it ON. (Document in `docs/secrets-runbook.md`.)
2. Pre-create a throwaway test user via Admin API:
   `email: test-migration-${uuid}@throwaway.example`,
   `email_confirm: true`. Use a real Google email address you control
   that's NOT already a Supabase user.
3. Note the new auth user's UUID (`auth.users.id`).
4. Open the new app in incognito browser, click "Sign in with Google",
   sign in with the test Google account.
5. After OAuth callback, query `auth.users` and `auth.identities` for
   the email:
   - `auth.users` should have ONE row with the same UUID as step 3
   - `auth.identities` should have a Google identity linked to that UUID
6. Query our app `users` table — should have ONE row, not two.

If results match → M1 is viable. Proceed.

If a NEW auth user was created (different UUID from step 3) →
linking is OFF or our app has issues. Investigate. Possible fixes:
- Flip "Allow account linking" setting if not already
- Pre-create an `auth.identities` row for Google before OAuth flow
  (uncharted territory — consult Supabase support/docs)
- Worst case: change strategy entirely (e.g., on-demand migration
  triggered by user's first sign-in)

**No migration code ships until this test passes.** Estimate: 2-3 hrs
for setup + test + investigation.

### M3 — Pre-create users get `onboarding_complete = true` + default `try_on_settings`

When pre-creating app users:

```typescript
await db.insert(users).values({
  authId: <pre-created Supabase auth UUID>,
  email: legacyUser.email,
  displayName: legacyUser.displayName,
  locale: legacyUser.locale ?? 'en',
  onboardingComplete: true,        // SKIP D.5 quiz on first sign-in
  tryOnSettings: legacyUser.tryOnSettings ?? {
    model: 'model-woman',
    background: 'neutral',
    selfPhotoURL: null,
  },
  // location, preferences, bodyInfo, isAdmin: from legacy or defaults
});
```

Migration script's existing profile-merge logic handles the rest of
the field mapping. The forced `onboarding_complete = true` is the
critical part for invisibility — without it, returning users land in
the 4-step quiz.

### M4 — Try-on migration scope (NEW vs Phase 11 preview)

Legacy `Outfit` type has `tryOnImageURL`, `tryOnStatus`, `model`,
`tryOnAsyncJobId`, `tryOnAsyncStep`. Migration creates `try_on_jobs`
rows for COMPLETED try-ons only:

| Legacy state | Migration behavior |
|---|---|
| `tryOnStatus === 'completed'` | Transfer image, INSERT try_on_jobs row, status='complete' |
| `tryOnStatus === 'pending' \| 'generating'` | SKIP (in-flight; user can re-trigger) |
| `tryOnStatus === 'failed'` | SKIP (no result to show; user can re-trigger) |
| `tryOnStatus === undefined / null` | SKIP (never tried) |

Image transfer pattern:
- Download from `users/{legacyUid}/outfits/{outfitId}/try-on.jpg`
- Upload to Supabase Storage `try-on-results` bucket at `{newUserId}/{newOutfitId}/{newJobId}.jpg`
- INSERT `try_on_jobs` with `result_storage_path` set to new path

Field mapping (legacy → new):

| Legacy | New `try_on_jobs.X` |
|---|---|
| `tryOnStatus: 'completed'` | `status: 'complete'` |
| `tryOnImageURL` | (download + reupload; no direct map) |
| `tryOnStartedAt` | `created_at` |
| (synthesized = `tryOnStartedAt`) | `completed_at` |
| `model` (or default `model-woman.jpg`) | `model_image_url` |
| `tryOnAsyncJobId` | `async_job_id` |
| `tryOnAsyncStep` | `async_step` |
| `cost_cents` | 0 (legacy didn't track per-call) |

`outfit_id` FK references the migrated outfit (from `migration_log`).

`migration_log` records per try-on:
`{ legacy_id: legacyOutfitId + ':tryon', new_entity_type: 'try_on_job' }`.

Skip outfits whose try-on transfer fails (degrade — outfit still
exists, just no try-on image; user clicks "Try on" to regenerate).

### M5 — Chat migration scope (NEW vs Phase 11 preview)

Legacy chat at Firestore collection `users/{uid}/chatMessages` (flat,
single conversation per user). Each message has:
- `id`, `role: 'user' | 'assistant'`, `content`, `createdAt`
- `attachments?: [{ type: 'image' | 'wardrobe_item', url, imagePath?, itemId? }]`
- `richCards?: [{ type: 'outfit' | 'wardrobe_item' | 'confirmation', data }]`

Map to new schema:
- ONE `chat_conversations` row per user (legacy = single chat per user
  → one new conversation). `title = '(imported from legacy)'`,
  `is_admin_chat = false`.
- N `chat_messages` rows, one per legacy message, ordered by createdAt.
- `tool_calls` JSONB: derived from legacy `richCards` + tool names if
  present in message metadata. If unrecoverable, leave null.

`migration_log` records:
`{ legacy_id: 'synthetic:chat:' + legacyUid, new_entity_type: 'chat_conversation' }`.
Per-message log: `{ legacy_id: legacyMsgId, new_entity_type: 'chat_message' }`.

#### Chat attachment URL handling — LOCKED option (b)

Legacy attachments are `[{ type: 'image', url: '<firebase URL>' }]`.
Our new schema expects `[{ type: 'image', photoId }]` (per D.9 plan).

**LOCKED: extend new schema to accept a third attachment shape that
preserves legacy URLs**:

```typescript
type ChatAttachment =
  | { type: 'image'; photoId: string }                       // new flow
  | { type: 'wardrobe_item'; itemId: string }                // new flow
  | { type: 'image-legacy'; url: string; sourceBucket?: string }; // migration only
```

Migration writes `image-legacy` shape with the legacy Firebase URL.
The chat UI renders the URL as-is (it's just a `<img src>`). Works
as long as legacy Firebase Storage stays alive.

**Dependency**: legacy Firebase Storage MUST stay alive for the
foreseeable future. Plan a separate follow-up workstream to convert
legacy URLs → Supabase storage paths before tearing down legacy
infrastructure. Document in this plan as known dependency.

`wardrobe_item` attachments are easier — map `legacy itemId` to
`new closet_items.id` via `migration_log`.

### M6 — Multi-user CLI extension

Extend `packages/capabilities/scripts/migrate-user-from-legacy.ts`:

```bash
# Existing single-user mode:
--legacy-email luke@example.com --dry-run

# New multi-user modes:
--all                       # enumerate all legacy users, run migration for each
--all --dry-run             # dry-run all
--all --skip user1@x,user2@y  # exclude specific users
--all --only user1@x,user2@y  # restrict to specific users
--list                      # print user inventory (no migration)
```

Per-user migration runs in its own try/catch. Errors logged to
`migration_failures` per user. Other users continue.

Idempotency via `migration_log`'s `(user_id, legacy_entity_type,
legacy_id)` UNIQUE constraint already covers re-runs (Luke's data is
already in `migration_log` from the preview run; re-running with
`--all` for him is a no-op).

### M7 — Run order: smallest first, Marina last

Real-run order:
1. **Pre-create all 9 users** (run a separate `--pre-create-users`
   step first, in a single transaction). This is the auth scaffold.
2. **Empty users** (Bárbara, Paulina, Eduardo, Daniel) — only profile
   merge, no images. Tests the auth pre-create + migration mechanics
   with zero data risk.
3. **Naguib** (1 item) — minimal real-data test.
4. **Romano** (8 items, 0 outfits) — wardrobe-only.
5. **Isaac** (10 items, 12 outfits) — first real wardrobe + outfits +
   probable try-ons + maybe chat.
6. **Luke** (already migrated; re-run is no-op via migration_log) —
   triggers re-migration of try-on + chat (which were OUT OF SCOPE in
   Phase 11 preview, so they aren't in `migration_log` yet — they DO
   migrate this round).
7. **Marina** (59 items, 1 outfit) — biggest, riskiest. Last after
   smaller cases validate.

Sequential, not parallel. ~1-5 min per user dominated by image
transfer.

### M8 — Per-user verification: Supabase magic link impersonation

For each of the 5 active users, after migration:

```typescript
const { data } = await supabase.auth.admin.generateLink({
  type: 'magiclink',
  email: user.email,
});
// data.properties.action_link is a one-use URL
// Open it in incognito → signed in as that user
```

Verification checklist per user (~10 min each):
- [ ] Wardrobe item count matches legacy admin's count
- [ ] Outfit count matches legacy
- [ ] Open 2-3 random outfits — item images render, no broken `<img>`
- [ ] Open 2-3 random outfits with try-on history — try-on image renders
- [ ] Open chat — messages visible, attachment thumbs render (or
      gracefully degrade if URL expired)
- [ ] Generate ONE new outfit — pipeline works against migrated wardrobe
      (catches FK / synthetic generation issues)
- [ ] Open lookbook — saved outfits visible
- [ ] Open settings → location, preferences populated

Empty users: just verify they can sign in + see empty state (no errors).

### M9 — Programmatic SQL verification (catches what UI clicks miss)

After all migrations complete, run:

```sql
-- Per-user count comparison (run for each migrated user_id)
SELECT
  u.email,
  (SELECT COUNT(*) FROM closet_items WHERE user_id = u.id) AS items_new,
  (SELECT COUNT(*) FROM outfits WHERE user_id = u.id) AS outfits_new,
  (SELECT COUNT(*) FROM try_on_jobs WHERE user_id = u.id) AS tryons_new,
  (SELECT COUNT(*) FROM chat_messages cm 
    JOIN chat_conversations cc ON cm.conversation_id = cc.id 
   WHERE cc.user_id = u.id) AS chat_msgs_new
FROM users u
WHERE u.email IN ('marinasramos@...', 'isaac.trujillo.villegas@...', ...);
```

Compare each row against the legacy admin's USERS view counts.
Discrepancies trigger investigation BEFORE cutover.

Spot-check signed URLs:

```bash
# For 5 random closet_items per user, mint signed URL and HEAD it
# (extend the verification phase script)
for path in $random_paths; do
  url=$(supabase.storage.signed_url($path))
  curl -I -s -o /dev/null -w "%{http_code}\n" $url
done
# Expect all 200s
```

### M10 — Race condition mitigation

Migration runs over hours. Legacy app at telastyle.app keeps serving
during the window. Risk: user adds data to legacy after migration
captures their wardrobe → that data is "lost" at cutover.

For 9 inactive users: near-zero risk. **No maintenance window**.

Day-of mitigation:
- Check Vercel access logs for legacy app within the last 7 days —
  confirm nobody has been using it
- Run migration during a low-traffic window (US night, but inactive
  users don't have a "high-traffic window" anyway)
- Cut DNS within 24 hours of migration completion to minimize the
  drift window

If high activity is detected, fall back to maintenance mode (point
legacy at a static "we're upgrading" page) — adds operational
complexity but eliminates risk.

### M11 — Cutover sequence (the actual flip)

1. **Day-of pre-flight**: re-run `--all --dry-run` to detect any
   data changes since last dry-run. If counts shifted, investigate
   (someone added data to legacy in the gap).
2. **Run real `--all` migration**. Verify per-user.
3. **Magic-link verification** for the 5 active users.
4. **Programmatic SQL counts** match legacy admin counts.
5. **Smoke**: take a deep breath. Cut DNS at telastyle.app → new app.
6. **Within 1 hour of DNS propagation**: send re-engagement email
   to 5 active users (email copy from M12).
7. **Monitor**: watch new-app errors + Supabase auth logs for the
   next 24-48 hours. Be available for "I can't find my data" tickets.
8. **Day +7**: tear down legacy app on Vercel (telastyle.app subdomain).
   admin.telastyle.app stays alive for Phase 14 work.

### M12 — Re-engagement email (marketing, not engineering)

Engineering ships the migration. Marketing ships the email. Worth
flagging that the email phrasing CAN'T draw attention to migration
or it breaks the invisibility bar.

Recommended phrasing template (adjust):

> Subject: Your wardrobe is ready
>
> Hey [name],
>
> We've been working on Tela behind the scenes — your wardrobe
> and outfits are ready to pick up where you left off.
>
> [optional: try [new feature like AI chat]]
>
> Open Tela: [link]
>
> — The Tela team

Avoids "we migrated", "we rebuilt", "platform upgrade" etc.

---

## Out of scope

- Multi-user batch admin UI (9 users; CLI is fine)
- Scheduled / repeating migration jobs (one-shot per user)
- Generation cost history (admin-side data)
- Activity logs (admin-side)
- StyleDNA blob (replaced by closet read in our app — let
  `profile.closetRead` regenerate naturally)
- Realtime / cross-tab sync (deferred app-wide)
- Phase 14 admin parity (runs post-cutover per Luke's direction —
  cofounder uses Supabase dashboard SQL during the gap)

---

## Scope estimate (honest)

| Day | Work |
|---|---|
| 1 | Auth linking validation (M2 — make-or-break test). If fails, regroup. |
| 2 | Multi-user CLI extension (M6) + pre-create users helper (M1, M3) |
| 3 | Try-on migration extension (M4) + tests against Luke's account |
| 4 | Chat migration extension (M5) — including attachment URL format decision |
| 5 | Dry-run audit for all 9 users + fix surprises |
| 6 | Real migrations (empty users → Naguib → Romano → Isaac → Luke re-run → Marina) + per-user verification |
| 7 | Programmatic SQL verification + buffer for fixes + draft re-engagement email |
| 8 | Cutover day: pre-flight, real migration final run, verify, DNS cut, monitor |

**~8 working days. ~2 weeks calendar with buffer for surprises.**

---

## Out of scope dependency: legacy Firebase Storage

Per M5 (chat attachments stay as legacy URLs), legacy Firebase Storage
must stay alive AT LEAST until a follow-up workstream converts those
URLs to Supabase paths. Document as known dependency:

> The legacy Firebase project + Storage bucket must NOT be torn down
> until a chat-attachment-URL-conversion workstream ships. Estimated
> follow-up scope: ~1-2 days of script work to enumerate all
> `chat_messages.attachments` with `image-legacy` shape, transfer the
> Firebase URL → Supabase Storage, and rewrite the attachment to
> `{ type: 'image', photoId }` shape.

This is a deferred cleanup, NOT a Phase 11 blocker.

---

## Hardened session-start prompt

Copy this into a fresh Claude Code session at `/Users/lukegorski/tela`:

```
You are extending the migration library for multi-user, try-on, and
chat coverage. Then running migration for all 9 legacy users and
preparing for production cutover. Phase 11 multi-user migration.

WORKING DIR: /Users/lukegorski/tela
LEGACY DIR: /Users/lukegorski/ale (READ-ONLY)
LEGACY ADMIN: https://admin.telastyle.app (visual reference for user
counts + data inventory)

FULL SPEC: docs/phase-11-multi-user-migration.md (read cover to cover)
PRIOR ART: docs/migration-luke-one-shot.md (Phase 11 preview that we
already ran for Luke's account)

══════════════════════════════════════════════════════════
CRITICAL CONTEXT (Luke locked all decisions):
══════════════════════════════════════════════════════════

GOAL: Users sign in to new app post-cutover and find their wardrobe
+ outfits + try-on history + chat history exactly as left. They must
NOT be able to tell the platform was migrated.

INVENTORY (9 real users — none are test accounts):
  Marina   (59 items, 1 outfit)        HIGH risk — biggest dataset
  Luke     (17 items, 16 outfits)      already migrated (preview)
  Isaac    (10 items, 12 outfits)      MEDIUM risk
  Romano   (8 items, 0 outfits)
  Naguib   (1 item)
  Bárbara, Paulina, Eduardo, Daniel    EMPTY (profile-only)

ALL 9 must be migrated. The 4 empty ones get profile-only migration
(still needed for auth pre-create + future re-engagement).

══════════════════════════════════════════════════════════
12 LOCKED DECISIONS (M1-M12) — see plan doc for full detail:
══════════════════════════════════════════════════════════

(M1) Pre-create Supabase Auth users via Admin API for all 9 emails
     BEFORE migration runs. Migration writes data keyed to those
     pre-created user_ids. When users sign in via Google OAuth,
     Supabase links Google identity to existing user (NOT create new).
(M2) **Day 1 = auth linking validation gate**. Pre-create test user,
     OAuth in via Google, verify same user_id used (no duplicate
     created). If validation fails, STOP and regroup. No migration
     code ships until this passes.
(M3) Pre-created users get onboarding_complete = true + default
     try_on_settings. Skip D.5 quiz + model picker on first sign-in.
(M4) Try-on migration: only COMPLETED legacy try-ons migrate. In-flight
     and failed get skipped (user re-triggers). Image transfer
     Firebase Storage → Supabase Storage try-on-results bucket.
(M5) Chat migration: ONE chat_conversations per user, all legacy
     messages mapped 1:1. Chat attachment URLs LOCKED to option (b):
     extend ChatAttachment type with `image-legacy` shape that
     preserves legacy Firebase URL. Legacy Firebase Storage MUST stay
     alive (deferred cleanup workstream).
(M6) Multi-user CLI: extend migrate-user-from-legacy.ts with --all,
     --skip, --only, --list, --pre-create-users flags.
(M7) Run order: empty users → Naguib → Romano → Isaac → Luke
     (re-run is no-op for wardrobe + outfits; will migrate try-on +
     chat which weren't in preview scope) → Marina LAST.
(M8) Per-user verification via Supabase Admin magic link
     impersonation. ~10 min per active user.
(M9) Programmatic SQL count verification (compare legacy counts vs
     new app counts) catches what UI clicks miss.
(M10) Race condition: trust low activity for 9 inactive users.
      No maintenance window. Day-of, check legacy access logs.
(M11) Cutover sequence: dry-run → real migration → verify → DNS cut
      → email → monitor 24-48 hrs → day+7 tear down legacy app
      (NOT admin.telastyle.app).
(M12) Re-engagement email is marketing copy (separate workstream).
      Engineering ships the migration; Luke writes the email.
      CRITICAL: don't draw attention to migration in email phrasing.

══════════════════════════════════════════════════════════
WHAT THIS SHIPS (in order):
══════════════════════════════════════════════════════════

D1: Auth linking validation report (PASS or fail). If fail, halt.
D2-3: Migration library extensions (try-on + chat + multi-user CLI)
D4: Dry-run audit for all 9 users (per-user report)
D5: Real migrations (in M7 order) + per-user verification (M8)
D6: Programmatic SQL verification (M9) + buffer + draft email
D7-8: Cutover day (M11)

══════════════════════════════════════════════════════════
STEP 1 — orient (read in order):
══════════════════════════════════════════════════════════

  1. PORT.md (rules + execution discipline)
  2. docs/phase-11-multi-user-migration.md (THE SPEC)
  3. docs/migration-luke-one-shot.md (Phase 11 preview — what shipped
     and how)
  4. packages/capabilities/src/migration/migrateLegacyUser.ts
     (existing library you're extending)
  5. packages/capabilities/scripts/migrate-user-from-legacy.ts
     (existing CLI you're extending)
  6. packages/db/src/schema/stubs.ts (chat tables, try_on_jobs schema)
  7. packages/db/src/schema/users.ts (users table for pre-create)
  8. /Users/lukegorski/ale/src/lib/types.ts (legacy data shapes —
     Outfit type for try-on fields, ChatAttachment for chat)
  9. /Users/lukegorski/ale/src/hooks/useChat.ts (legacy chat data
     storage pattern — Firestore collection users/{uid}/chatMessages)

  Then: git -C /Users/lukegorski/tela log --oneline -10

══════════════════════════════════════════════════════════
STEP 2 — restate before writing code:
══════════════════════════════════════════════════════════

  - All 12 M-decisions in your own words
  - Why M2 (auth linking validation) is the critical gate
  - Why we extend ChatAttachment instead of converting URLs at
    migration time (M5)
  - Why pre-create users with onboarding_complete = true (M3)
  - The user run order (M7) and why empty + small users go first
  - The cutover sequence (M11)

══════════════════════════════════════════════════════════
STEP 3 — execution rules:
══════════════════════════════════════════════════════════

  - Legacy /Users/lukegorski/ale is READ-ONLY. Firebase admin SDK
    only reads. Never write.
  - Doppler required for any Supabase access.
  - DAY 1 IS BLOCKING: do NOT proceed past M2 auth linking
    validation if it fails. Surface the failure to Luke and regroup.
  - Per-user migration runs in its own try/catch. One user's failure
    doesn't block others.
  - Use existing migration_log + migration_failures tables. Idempotent
    via UNIQUE constraint.
  - Pre-create user via Supabase Admin: createUser({ email,
    email_confirm: true, user_metadata: { migrated_from_legacy: true,
    legacy_uid }}). Then INSERT app users row with onboardingComplete
    = true + default tryOnSettings.
  - Try-on image transfer: bounded concurrency (10), 2 retries.
    Skip if download fails (don't fail the whole user).
  - Chat attachment migration: write `image-legacy` shape with the
    raw Firebase URL. Don't try to download/re-upload in Phase 11
    (deferred workstream).
  - Pitfall #11/#12/#13 don't apply (no React in script).
  - Pitfall #14 (pgbouncer + parallel txns + prepared statements)
    DOES apply. The fix is in packages/db/src/client.ts; verify
    you're using the shared client and not creating new postgres()
    connections in the migration code.
  - Run migrations from a single doppler-loaded process so the
    pgbouncer fix takes effect.
  - Before commit: pnpm verify.
  - Multiple commits OK (one per phase: D1 validation report, D2-3
    extensions, D4 audit script, D5 verification harness). ASK
    before each push.
  - After each push: WAIT for Luke to review + run himself. Luke
    runs the actual migrations + cutover, NOT the agent.

══════════════════════════════════════════════════════════
STEP 4 — pre-commit verification:
══════════════════════════════════════════════════════════

  pnpm verify (full chain). DO NOT run real migrations as part of
  verification — Luke runs them himself with --dry-run first.

══════════════════════════════════════════════════════════
STEP 5 — communicate before pushing + before user runs:
══════════════════════════════════════════════════════════

  Per Luke's memory rule: every push needs explicit approval.
  Plus: any actual migration RUN (real, not dry-run) requires Luke
  to execute manually. The agent does not run real migrations against
  user data.

══════════════════════════════════════════════════════════
SCOPE ESTIMATE:
══════════════════════════════════════════════════════════

  ~8 working days, ~2 weeks calendar with buffer:
    D1: Auth linking validation
    D2: Multi-user CLI + pre-create helpers
    D3: Try-on migration extension
    D4: Chat migration extension + ChatAttachment type extension
    D5: Dry-run all 9 users + fix
    D6: Real migrations + per-user verification
    D7: SQL verification + buffer + email draft
    D8: Cutover day (DNS cut + monitor)

Now: read all files in STEP 1 (the plan doc is the spec). Restate
per STEP 2. Then START WITH M2 AUTH LINKING VALIDATION as Day 1
work. Surface results to Luke before writing any migration extensions.
```
