# Visual Port — handoff document

This document is the **in-repo source of truth** for the visual port of
the legacy Tela app (`/Users/lukegorski/ale`) onto this new monorepo
(`/Users/lukegorski/tela`).

**If you're a new Claude session resuming this work**, read this entire
document before writing any code. Then read
[`docs/visual-port-plan.md`](docs/visual-port-plan.md) for per-screen
blueprints. After reading both, restate the rules + your resumption
point to Luke before touching anything.

---

## Why we're doing this port

The new architecture exists to fix things that were structurally wrong
in the legacy app:

1. **Firestore → Postgres** — relational integrity, real queries, cheaper
   at scale.
2. **Ad-hoc Next.js API routes → capability layer** — composable, type-safe
   end-to-end, exposable via tRPC + MCP, testable in isolation.
3. **Inline OpenAI calls scattered through API routes → AI gateway** —
   every call has provenance (which prompt version, which model, what
   cost, what input snapshot); enables eval harness + cost dashboard.
4. **Hardcoded prompts + knowledge → DB-backed `prompts` table +
   `stylist_rules` + `annotated_examples`** — cofounder iterates without
   engineering.
5. **Style DNA from onboarding quiz → closet read from actual wardrobe
   contents** — more accurate, reflects what the user actually owns.
6. **12 hardcoded chat tools → capability-as-tool auto-discovery** —
   every new capability is automatically a chat tool.
7. **Firebase-backed admin → proper admin tooling** (rules editor, prompt
   versioning, cost dashboard, user introspection). The whole point of
   building the capability layer was to enable this.

What this means for the port:

- **User-facing UI** (everything a normal user sees) → pixel-perfect
  port from the legacy app. The legacy code is the spec.
- **Backend / data layer** → new (Supabase + capabilities). Already
  built.
- **AI layer** → new (gateway, prompt versioning, eval). Already built.
- **Admin tooling** → new (we are explicitly REPLACING the legacy
  admin). Already built — keep mine, don't port legacy admin.
- **Conceptual model differences** (Style DNA → closet read) → the new
  model wins underneath unchanged UI.

---

## The golden no-residue rule

When the port is done, `/Users/lukegorski/ale` must be **completely
deletable** with **zero residue** in this repo. To make that real:

| Forbidden in `apps/web/` | Required instead |
|---|---|
| `import * from 'firebase/*'` (any firebase package) | Supabase + tRPC clients directly |
| `apps/web/src/app/api/wardrobe/*`, `/outfits/*`, `/chat`, `/translate`, `/auth/welcome-email`, `/admin/*` route handlers | tRPC capability calls |
| Firestore-shaped responses (nested `wardrobeItem.analysis.category`) | Our flat shapes (`closetItem.category`) |
| Firestore `Timestamp` types in component props | `Date` or ISO `string` |
| Firebase shim layer that mimics `getFirebaseAuth().currentUser.uid` | `useAuthContext().user.id` directly |
| Legacy `/sign-in` route | Landing page IS the login (no separate route) |
| `wardrobeItem.imageURL` containing a Firebase Storage download token | Supabase Storage signed URLs |

The only `/api/*`-shaped routes allowed in the new app are
**architecturally new** ones:

- `/auth/callback/route.ts` — required by Supabase OAuth
- `/auth/sign-out/route.ts` — sign-out POST handler
- `/chat/stream` — SSE endpoint for streaming chat (we built this; the
  legacy NDJSON is gone)
- `/trpc/*` — the tRPC router

Anything else is residue.

### Edge cases of the no-residue rule

The rule is firm but a few things look like residue and aren't:

- **Reshape inside a single hook is acceptable.** If `useWardrobe`
  reshapes our flat Postgres data to a slightly different
  caller-facing shape (e.g., grouping `enhancementStatus` +
  `enhancementStartedAt` together), that's normal layering. The hook
  is the boundary.
- **What's NOT acceptable** is the same shape adapter spread across
  multiple hooks/components/routes — that's residue. One adapter at
  one well-defined boundary is fine; ten adapters everywhere is not.
- **`Date` everywhere** instead of `Timestamp` — even where it means
  editing 12 component access sites. Timestamp is a Firestore
  concept; Date is the language primitive.
- **When you genuinely don't know** which side a borderline call falls
  on, **stop and ask Luke** rather than picking quietly.

---

## Required local setup

### Doppler (mandatory)

The repo has zero `.env` files committed. All env vars live in Doppler
under project `tela`, config `dev`. **Every command that needs env
vars must be prefixed with Doppler:**

```bash
~/bin/doppler run --project tela --config dev -- pnpm dev
~/bin/doppler run --project tela --config dev -- pnpm --filter @tela/db db:migrate
~/bin/doppler run --project tela --config dev -- node ...
```

Doppler binary lives at `~/bin/doppler`. If it's not authenticated,
run `~/bin/doppler login -y` and follow the browser prompt.

To copy a key from the legacy `.env.local` to Doppler:

```bash
KEY_NAME="EXAMPLE_KEY"
VALUE=$(grep "^${KEY_NAME}=" /Users/lukegorski/ale/.env.local | cut -d= -f2- | tr -d '"' | tr -d "'")
~/bin/doppler secrets set "${KEY_NAME}=${VALUE}" --project tela --config dev --silent
```

### pnpm workspace + Turbo

```bash
pnpm install                 # workspace install
pnpm --filter @tela/<pkg> ... # scoped commands
pnpm verify                  # see "Pre-commit verification" below
```

### Cross-package build chain

Schema and types flow downward. When you change one, **rebuild the
chain** before downstream typechecks see the new types:

```
@tela/db  →  @tela/capabilities  →  @tela/api / @tela/web
```

Concrete commands when you change `@tela/db` schema:

```bash
pnpm --filter @tela/db build           # refreshes db/dist
pnpm --filter @tela/capabilities build # refreshes capabilities/dist
pnpm --filter @tela/api typecheck      # now sees fresh types
pnpm --filter @tela/web typecheck      # same
```

When you only change a capability or web file, just typecheck that
package — no rebuild needed.

If a typecheck fails with "Cannot find module" or "no exported member"
on a `@tela/*` import you know exists, **the build chain is stale** —
rebuild the upstream package(s).

### Migrations

```bash
~/bin/doppler run --project tela --config dev -- pnpm --filter @tela/db db:generate   # generate SQL from schema diff
~/bin/doppler run --project tela --config dev -- pnpm --filter @tela/db db:migrate    # apply pending migrations
```

Migrations are idempotent and run against the **shared dev DB** (same
Supabase project as Railway uses). Don't `drizzle-kit push` to prod;
always `generate` + `migrate`.

---

## Pre-commit verification

Before every commit, run:

```bash
pnpm verify
```

This runs (in order):

1. The cross-package build chain (`@tela/db` → `@tela/capabilities`).
2. `pnpm --filter @tela/web typecheck`.
3. `pnpm --filter @tela/api typecheck`.
4. `scripts/check-no-residue.sh` — greps for forbidden patterns:
   - any `firebase/*` imports under `apps/web/src/`
   - legacy `/api/*` mirroring routes under `apps/web/src/app/api/`
   - `Timestamp` type imports in `apps/web/src/`

If `pnpm verify` is red, **don't commit**. Fix the failures first.

The script is at [`scripts/check-no-residue.sh`](scripts/check-no-residue.sh)
— run standalone to see what's failing.

---

## Push approval pattern

Per Luke's standing memory rule (`feedback_always_push.md`):

- **Never push without explicit approval.**
- Workflow: finish a coherent phase → commit locally → ask "Push?" →
  Luke says yes/no.
- If Luke is silent, **don't push**. Don't interpret silence as
  approval.
- Multiple commits can be batched in one push; one phase ≠ one commit
  required, but pushing should always be conscious.

---

## Testing pattern

After each push, Luke tests on Railway in his browser. The contract:

- After a push, **wait for Luke's verdict** before starting the next
  phase (he'll either say "looks good, keep going" or report bugs).
- If you start the next phase before Luke tests, you risk compounding
  bugs across screens that are then harder to triage.
- Auto mode is on, so you can keep planning + writing exploratory code
  during the wait — but don't push the next phase until Luke confirms.

---

## Per-screen porting recipe

For each screen still on its MVP version:

### 1. Read the legacy file completely

Don't skim. The legacy code is the visual spec. Note every:

- Tailwind class
- Animation
- Conditional render
- State machine
- Sub-component

### 2. Identify dependencies

List every component, hook, lib helper, and Firebase touchpoint the
legacy file imports. Each one needs a port (or a stub if a feature is
deferred).

### 3. Identify data-shape gaps

Cross-reference what the legacy code reads (e.g.,
`item.analysis.category`, `item.bgColors.tl`) vs. what our schema
exposes (e.g., `closet_items.category`,
`closet_items.background_color`). Flag any field that legacy needs but
our schema doesn't have. **Bring the gap to Luke before deciding** —
schema additions, deferred features, and reshape decisions are
architecturally meaningful.

### 4. Decide on data-fetch capability

If the legacy hook does a Firestore query that returns a richer shape
than our existing capability returns, you have three options:

- **Extend the existing capability** (simplest; broad impact if other
  callers exist; e.g., the chat tool catalog sees more fields).
- **Add a new capability** (e.g., `wardrobe.listForGrid`) that returns
  the rich shape needed for one screen. Keep the existing one for
  chat tools where lighter is better.
- **Use direct Postgres in a server-side `lib/*` helper** if the
  screen is already an RSC and never needs to refetch client-side.

For client-side screens that need to refetch after mutations
(wardrobe upload, etc.), tRPC capability is the right answer.

### 5. Port the file

- Copy the JSX **byte-for-byte** from the legacy file. Same Tailwind
  classes, same conditionals, same SVG paths, same animations. (The
  word "literal" is misleading — the JSX is byte-for-byte; the
  imports + accessors get surgical edits.)
- Replace data-layer imports:
  - `import { ... } from "firebase/firestore"` → remove
  - `import { getDb, getFirebaseAuth } from "@/lib/firebase"` → remove
  - Replace with `import { trpc } from "@/trpc/client"` for client
    components, or our `lib/*` server helpers for RSC.
- Replace data-layer calls:
  - `getFirebaseAuth().currentUser` → `useAuthContext().user`
  - `user.uid` → `user.id`
  - `user.photoURL` → `user.avatarUrl`
  - `user.getIdToken()` → not usually needed; tRPC client attaches
    the token. If you genuinely need a token (e.g., for a manual
    fetch), `await supabase.auth.getSession()`.
  - `doc(getDb(), ...)` + `updateDoc/setDoc/deleteDoc` →
    `trpc.capability.execute.useMutation()` with `{ name: 'X', input:
    {...} }`.
  - `onSnapshot(...)` → polling, or Supabase Realtime, or
    refetch-on-event. Polling is acceptable as a starting point.
  - `firebase/storage` upload → `wardrobe.requestPhotoUpload` →
    direct Supabase Storage signed URL upload →
    `wardrobe.confirmPhotoUpload` flow.
  - `Timestamp.toDate()` → `new Date(item.createdAt)` (assuming the
    capability returns ISO strings).
- Edit data accessors where data shape differs:
  - `item.analysis.category` → `item.category` (we use flat shape;
    edit the access pattern).

### 6. Replace MVP version

- Delete the corresponding `apps/web/src/components/<feature>/*` MVP
  components.
- Replace `apps/web/src/app/(main)/[lang]/<screen>/page.tsx` with the
  ported version.
- Run `pnpm verify` to catch any breakage.

### 7. Commit with descriptive message

The commit message should:

- Reference which legacy file was ported.
- Call out every data-layer swap (so future engineers see what
  changed).
- Note any deferred features (e.g., "translations field empty until
  `translation.translateLocale` capability lands").

### 8. Push only with explicit approval

See "Push approval pattern" above.

---

## Status table

| Surface | Status | Files |
|---|---|---|
| `globals.css` | ✅ Ported | `apps/web/src/app/globals.css` |
| Public assets (login carousel, model images, spinners, logos) | ✅ Ported | `apps/web/public/*` |
| `useAuth` hook (Supabase-backed, same external shape as Firebase) | ✅ Ported | `apps/web/src/hooks/useAuth.ts` |
| `AuthProvider` | ✅ Ported | `apps/web/src/components/AuthProvider.tsx` |
| `DictionaryProvider` (with `translating` flag — translation hook stubbed) | ✅ Ported | `apps/web/src/components/DictionaryProvider.tsx` |
| `ThemeProvider` | ✅ Ported | `apps/web/src/components/ThemeProvider.tsx` |
| `PageTransitionProvider` | ✅ Ported | `apps/web/src/components/PageTransitionProvider.tsx` |
| `ProtectedRoute` | ✅ Ported | `apps/web/src/components/ProtectedRoute.tsx` |
| `ColorSwatch`, `LoadingSpinner`, `BottomSheet` | ✅ Ported | `apps/web/src/components/{ColorSwatch,LoadingSpinner,BottomSheet}.tsx` |
| `WeatherIcon` (extracted) | ✅ Ported | `apps/web/src/components/WeatherIcon.tsx` |
| `weather.ts` (uses public Open-Meteo APIs) | ✅ Ported | `apps/web/src/lib/weather.ts` |
| `colors.ts` | ✅ Ported | `apps/web/src/lib/colors.ts` |
| `i18n.ts` (`t` helper, `LANGUAGE_NAMES`, `LANGUAGE_ENGLISH_NAMES`) | ✅ Ported | `apps/web/src/lib/i18n.ts` |
| `useScrollPersistence` | ✅ Ported (D.6 prep) | `apps/web/src/hooks/useScrollPersistence.ts` |
| Landing page (carousel + mobile/desktop split) | ✅ Ported | `apps/web/src/app/(main)/[lang]/page.tsx` |
| Onboarding page + `OnboardingForm` (4-step incl. wardrobe gaps) | ✅ Ported | `apps/web/src/app/(main)/[lang]/onboarding/page.tsx`, `apps/web/src/components/OnboardingForm.tsx` |
| Navbar (desktop) | ✅ Ported | `apps/web/src/components/Navbar.tsx` |
| MobileNav (mobile bottom tabs) | ✅ Ported | `apps/web/src/components/MobileNav.tsx` |
| Settings panel (`SettingsMenu`, Theme/Language/Location/TryOn content) | ✅ Ported | `apps/web/src/components/{SettingsMenu,ThemeSettingsContent,LanguageSettingsContent,LocationSettingsContent,TryOnSettingsContent}.tsx`, `apps/web/src/components/LanguageSwitcher.tsx` |
| 4 settings sub-pages | ✅ Ported | `apps/web/src/app/(main)/[lang]/settings/{,location,language,try-on,theme}/page.tsx` |
| Wardrobe page + `WardrobeItemCard` + `ItemDetailContent` + `ColorFilterChips` + `useWardrobe` hook | ✅ Ported (D.6) | `apps/web/src/app/(main)/[lang]/wardrobe/page.tsx`, `apps/web/src/components/{WardrobeItemCard,ItemDetailContent,ColorFilterChips}.tsx`, `apps/web/src/hooks/useWardrobe.ts` |
| Wardrobe item detail (inline via `BottomSheet`, no separate route) | ✅ Done (D.6 deleted my MVP `[itemId]/page.tsx`) | — |
| Outfits page + `OutfitCard` + `OutfitHero` + `OutfitPiecesSheet` + `OutfitGridCell` + `useOutfits` | ✅ Ported (D.7a + D.7b) | `apps/web/src/app/(main)/[lang]/outfits/page.tsx`, `apps/web/src/components/Outfit*.tsx`, `apps/web/src/hooks/useOutfits.ts` |
| Outfit detail page (standalone `/outfits/[id]`) | ✅ Ported (D.7b) | `apps/web/src/app/(main)/[lang]/outfits/[id]/page.tsx` |
| Lookbook page (saved outfits) | ✅ Ported (D.8) | `apps/web/src/app/(main)/[lang]/lookbook/page.tsx` |
| **Chat page + `ChatComposer` + `ChatMessage` + `ChatItemGrid` + `ChatOutfitGrid` + `ChatWardrobePicker` + `useChat`** | ❌ MVP — needs port (D.9). Switch from legacy NDJSON to our SSE endpoint. | Legacy: `src/app/(main)/[lang]/chat/page.tsx`, `src/components/Chat*.tsx`, `src/hooks/useChat.ts` |
| **Dashboard page** | ❌ Doesn't exist yet (D.10) | Legacy: `src/app/(main)/[lang]/dashboard/page.tsx` |

To verify the table is current, run `git log --oneline | head -30`
and cross-reference against the most recent visual-port commit
messages.

---

## Reference commits (good examples to mirror)

When porting a new screen, look at how these were done:

- **`73dfb0e` — Phase 8.5.1 (admin foundation)**: clean addition of new
  capabilities + schema migration + admin route group. Good example
  of the no-residue capability pattern.
- **`98ee9cd` — Phase 9.1 (chat tool dispatch)**: adding multi-turn +
  tool support to the AI gateway, then wiring chat capabilities
  through it. Good example of extending the AI layer cleanly.
- **`688b37f` — Phase 9.2 (SSE streaming)**: shows the pattern for a
  new server endpoint that's NOT a `/api/*` mirror — it's an
  architecturally new SSE endpoint.
- **`963d62c` — Phase D.3 (landing page port)**: byte-for-byte JSX
  copy of legacy landing with `useAuthContext` swap +
  `profile.styleDna` → `profile.hasStyleProfile` mapping. Good
  example of pixel-perfect port with conceptual replacement
  underneath.
- **`c647048` — Phase D.4 (chrome ports)**: ~10 components ported in
  one commit. Each one is a byte-for-byte JSX copy with
  `user.photoURL` → `user.avatarUrl` and Firestore writes → tRPC
  mutations. Good example of the per-component swap pattern.
- **`a4482de` — Phase D.5 (onboarding)**: shows the OnboardingForm
  port + the `user.completeOnboarding` capability swap, plus the
  decision to write `wardrobeGaps` to the relational
  `wardrobe_gaps` table instead of as a JSONB blob.
- **`3ad1472` — Phase D.6 (wardrobe)**: largest port to date. Schema
  migration (added `material text` to `closet_items`), three
  capabilities extended for a single rich item shape (flat analysis
  fields, ISO timestamps, joined enhancement state, pre-signed URLs)
  with the join + URL-signing centralized in
  `wardrobe/itemShape.ts` (one-place reshape, not residue).
  `wardrobe.removeItem` wrapped in a Drizzle transaction with
  cascade-deletion of orphaned outfits + per-cascaded-outfit
  `outfit.deleted` events tagged `{ reason: 'wardrobe_item_removed',
  triggeringItemId }`. Legacy MVP `[itemId]/page.tsx` deleted —
  detail renders inline via `BottomSheet` like legacy.
- **`3450c08` — auth.whoami stability fix**: not a port; a bug found
  during D.6 testing. `useAuth` re-ran its effect every render
  because `useMutation().execute` returns a fresh wrapper each
  render. Caused infinite `auth.whoami` re-fetches → browser
  `ERR_INSUFFICIENT_RESOURCES`. Fix: hold `execute` in a ref, drop
  `fetchProfile` deps to `[]`. See pitfall #11.
- **`c5d05e9` + `5feaff1` + `bf623e8` — Phase D.7a + D.7b + auth-race
  fix**: D.7a is the largest backend slice — schema migration
  (`feedback`, `saved_at`, `name`, `wardrobe_assessment` columns),
  rich `outfitShape.ts` (joins outfits → outfit_items → closet_items
  → item_photos + try_on_jobs latest + contexts; signs URLs in one
  pass), `tryon.generate` refactored to enqueue via pg-boss and
  return jobId immediately (was sync-blocking 30–90s; legacy UI
  required async), 5 latent bugs fixed. D.7b ports the 877-line
  outfits page + 4 components + `useOutfits` hook with try-on
  polling, optimistic mutations, and `triggeredTryOnsRef` guard
  against double-tap. `bf623e8` follow-up unblocks rendering on a
  Supabase auth race surfaced by D.7b's hooks.
- **`583a89e` — Phase D.8 (lookbook)**: small surface, real
  plumbing. `outfit.list` gained explicit `orderBy: 'createdAt' |
  'savedAt' | 'wornAt'` arg (default `'createdAt'`); `useOutfits`
  gained `savedOnly` opt with primitive destructure at the top of
  the hook (pitfall #11 in a different shape — see #13);
  `toggleSave` lifts legacy lookbook L168–179 (filter out of local
  list when `savedOnly && !saved`). New 314-line page reuses every
  D.7b component unmodified. Zero i18n + zero schema changes — the
  `dict.lookbook` namespace and the `/lookbook` nav wiring were
  already in place from earlier ports.
- **`e269316` + `5865f74` + `3f21ace` + `0acc4a2` — Phase 11 preview
  (Luke one-shot migration)**: schema migration 0013 added
  `migration_log` (success-only, ID map, UNIQUE constraint) +
  `migration_failures` (append-only debug log). Library at
  `packages/capabilities/src/migration/migrateLegacyUser.ts` does
  Firebase → Supabase data + image transfer in per-entity Drizzle
  txns with bounded concurrency, HEIC pre-flight, retry. Synthetic
  contexts/generations with deterministic legacy_id keys
  (`'synthetic:context:${occasion}:${season}'`,
  `'synthetic:generation:${legacyUid}'`) so re-runs are idempotent.
  Outfit migration uses the partial-items rule (keep outfit if
  surviving items satisfy `top|dress + bottom|dress`). 19/19
  wardrobe items + 16/16 outfits migrated for Luke's account.
  CLI shell at `packages/capabilities/scripts/migrate-user-from-legacy.ts`
  is throwaway; library is reusable for the eventual Phase 11
  multi-user flow. See `docs/migration-luke-one-shot.md` for the full
  spec.
- **`189ff81` — pgbouncer fix (system-wide)**: critical infra fix
  surfaced during the migration run. Supabase's transaction-mode
  pooler doesn't support prepared statements across rebound
  connections; the migration's parallel txns silently rolled back.
  Fix detects the pooler URL and passes `prepare: false` to
  postgres-js. Affects the entire shared `db` client — any future
  parallel-write workload (chat batch, admin bulk, etc.)
  automatically benefits. See pitfall #14 for the symptom checklist.

---

## Migrating env vars from the legacy app

Whenever a port introduces a new capability that needs an API key the
new app doesn't have yet (e.g., `RESEND_API_KEY` for the welcome
email capability), check the legacy `.env.local` for the key and
migrate it to Doppler. Procedure:

```bash
# 1. Confirm the key exists in legacy (don't print the value):
grep -c "^KEY_NAME=" /Users/lukegorski/ale/.env.local

# 2. Copy to Doppler without exposing the value to chat:
VALUE=$(grep "^KEY_NAME=" /Users/lukegorski/ale/.env.local | cut -d= -f2- | tr -d '"' | tr -d "'")
~/bin/doppler secrets set "KEY_NAME=${VALUE}" --project tela --config dev --silent

# 3. Verify (shows masked value):
~/bin/doppler secrets get KEY_NAME --project tela --config dev
```

Keys already migrated this session:

- `FASHN_API_KEY` (try-on)
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (location settings autocomplete)

Keys still in legacy that may be needed when porting chat / welcome
email:

- `RESEND_API_KEY` — for `auth.welcomeEmail` capability (deferred)
- Google Translate creds (via `FIREBASE_ADMIN_*`) — only if we wire
  `translation.translateLocale` via Google Translate. We can use
  OpenAI for translation instead and skip these.

---

## Schema gaps — resolved in D.6 (kept for reference)

| Legacy field | Decision | Result |
|---|---|---|
| `material: string` (free text — "cotton", "wool", etc.) | **Added** `material text` column to `closet_items` | Migration `0010_kind_khan.sql`. `item.analyze` prompt + output schema now includes `material`. |
| `bgColors: {tl, tr, bl, br}` (4-corner gradient backgrounds) | **Single hex for all 4 corners.** Background gradient uses `background_color` for all positions. Visually nearly identical; not worth a 4-column schema change. | UI implemented in `WardrobeItemCard` reusing single hex. |
| `analysis.translations` per-locale | **Deferred.** Components fall back to English when missing. | `translation.translateLocale` capability still TBD. |

For D.7 (outfits), more gaps in `docs/visual-port-plan.md`. Surface
them to Luke before starting D.7.

---

## Common pitfalls

1. **Adding firebase as a dependency to make a literal copy compile.**
   Don't. The whole point is no firebase package. Surgically edit
   imports + access patterns instead.

2. **Reimplementing legacy `/api/*` routes in the new app to avoid
   touching component fetch calls.** Don't. tRPC mutations replace
   `fetch('/api/...')` cleanly. Component changes are minor.

3. **Returning Firestore-shaped (nested) data from new capabilities to
   avoid touching component access patterns.** Don't (across the
   codebase). One reshape inside one hook is OK; spread across
   multiple is residue.

4. **Forgetting `'use client'`.** Most ported components have hooks
   (`useState`, `useEffect`, `useAuthContext`) so they need
   `'use client'`. RSCs only for server-rendered shells.

5. **Forgetting to delete the MVP version.** When you port a screen,
   delete the corresponding `apps/web/src/components/<feature>/*` MVP
   directory and any helper libs (`apps/web/src/lib/<feature>*.ts`
   server helpers that are now redundant).

6. **Skipping `pnpm verify`** before committing. Catches `user.uid`
   → `user.id` rename misses, import path issues, and the no-residue
   grep checks.

7. **Touching code in `/Users/lukegorski/ale/`.** Don't. That repo is
   the visual reference, read-only.

8. **Stale build artifacts after schema changes.** When a `@tela/web`
   typecheck says "no exported member" on a `@tela/db` or
   `@tela/capabilities` import, rebuild the upstream package(s) — see
   "Cross-package build chain" above.

9. **Trying `pnpm dev` without Doppler.** Won't work. Always prefix
   with `~/bin/doppler run --project tela --config dev --`.

10. **Pushing without asking.** Standing rule from Luke's memory.
    Don't.

11. **Unstable callbacks from `useMutation()` in effect deps.** This
    bit us in D.6. tRPC's `useMutation()` returns a new `execute`
    wrapper on every render even though the underlying `mutateAsync`
    is stable. Putting `execute` in a `useEffect` dep array (or in a
    `useCallback`'s dep array that ends up in a `useEffect`) makes
    the effect re-run every render. In auth-context-style hooks that
    call a mutation in the effect (`auth.whoami`, etc.), this
    produces an infinite loop that floods the network queue and
    eventually trips `ERR_INSUFFICIENT_RESOURCES`. Pattern: hold the
    mutation's `execute` in a `useRef` and keep the effect's deps
    list either empty or restricted to truly stable values. See
    `apps/web/src/hooks/useAuth.ts` (commit `3450c08`) for the
    pattern.

12. **Spreading data reshape across multiple capabilities or hooks.**
    D.6 needed a "rich item shape" (flat analysis fields + ISO
    timestamps + joined enhancement state + pre-signed URLs) for
    three capabilities (`listItems`, `getItem`, soon `addItem`
    response). The right move was to centralize the join + URL
    signing in `wardrobe/itemShape.ts` and have all three call into
    it. The wrong move would have been duplicating the logic across
    each capability — that's the spread-across-files reshape that
    PORT.md flags as residue. When you spot the same shape adapter
    appearing in 2+ files, extract it.

13. **Options-object hook args without primitive destructure.**
    Variant of #11. When a hook accepts `(opts?: { foo?: bool })`,
    `opts` is a fresh object every render — its identity changes
    even when `foo` doesn't. If the hook references `opts` (or
    `opts.foo`) inside a `useEffect` / `useCallback` dep array, the
    effect re-fires every render → re-fetches, re-subscribes,
    infinite loops. D.8's `useOutfits({ savedOnly })` hit this.
    Fix: destructure to a primitive at the top of the hook
    BEFORE any dep array touches it:
    ```ts
    function useOutfits(opts?: { savedOnly?: boolean }) {
      const { savedOnly = false } = opts ?? {};   // primitive — stable identity
      // ...all useEffects + useCallbacks reference savedOnly, NOT opts
    }
    ```
    Same shape as pitfall #11 (unstable reference in dep array);
    different surface (callback wrapper vs object identity).

14. **pgbouncer transaction-mode pooler + prepared statements +
    parallel transactions = silent rollback.** The migration script
    found this the hard way (commit `189ff81`). Supabase's
    transaction-mode pooler (port `6543`, hostname pattern
    `*.pooler.supabase.com`) rebinds each query to a different
    backend connection, so prepared statements set up on one
    connection aren't visible on the next. Under parallel-transaction
    load (e.g., the migration's bounded-concurrency wardrobe-item
    txns) this manifests as **silent transaction rollbacks** — the
    `db.transaction(async (tx) => ...)` callback returns successfully,
    but the rows never persist. **No exception, no log line, no
    pre-fix retry.** Migration reported "9/19 done" but only some
    rows actually landed; the synthetic generation insert silently
    rolled back too, taking the dependent outfit inserts down with FK
    violations downstream.

    **Fix is in `packages/db/src/client.ts`**: detect the pooler URL
    pattern and pass `prepare: false` to `postgres-js`. Affects the
    entire shared client, so any future workload — chat batch
    operations, admin bulk imports, parallel-write capabilities —
    automatically benefits.

    **Trap to avoid going forward**: any new code that does parallel
    Drizzle transactions through the shared client is now safe.
    But if a future capability bypasses the shared client and creates
    its own `postgres()` connection, that one needs `prepare: false`
    too when `DATABASE_URL` points at the pooler. The detection
    helper in `client.ts` is the canonical place — reuse it.

    Symptom checklist if this re-emerges:
    - `db.transaction()` callback returns success
    - No errors logged anywhere
    - Subsequent queries can't find the rows that "succeeded"
    - Sequential single-statement queries through the same URL work fine
    - Only parallel-txn workloads fail
    - DATABASE_URL contains `:6543` or `pooler.supabase.com`

---

## Hardened session-start prompt

Copy this verbatim to start a new session at `/Users/lukegorski/tela`:

```
You are picking up the Tela visual port. WORKING DIR: /Users/lukegorski/tela

Critical: I cannot rely on auto-memory loading correctly because this
project's memory is namespaced under "ale" not "tela". Treat the
following as your loaded context.

STEP 1 — orient. Don't skip any of these:
  Read /Users/lukegorski/tela/PORT.md (cover to cover)
  Read /Users/lukegorski/tela/docs/visual-port-plan.md (cover to cover)
  Run: git -C /Users/lukegorski/tela log --oneline -20
  Run: git -C /Users/lukegorski/tela log --oneline origin/main..HEAD

STEP 2 — confirm before code. Restate to me in your own words:
  (a) the no-residue rule + its edge cases
  (b) the per-screen porting recipe
  (c) which phase you're resuming at, based on the status table + git log

STEP 3 — execution rules (verbatim from PORT.md):
  - Legacy app at /Users/lukegorski/ale is READ-ONLY. Visual ground
    truth only. Never edit it.
  - Doppler is required for any local run:
    `~/bin/doppler run --project tela --config dev -- ...`
  - Cross-package build chain: schema changes in @tela/db require
    `pnpm --filter @tela/db build` then
    `pnpm --filter @tela/capabilities build` before web typechecks
    see fresh types.
  - Before EVERY commit: run `pnpm verify` (typechecks + the no-
    residue grep). If red, fix before committing.
  - One coherent phase = commit locally → ASK ME before pushing.
    Never push silently. The user's standing rule is "push only with
    explicit approval."
  - After each push: WAIT for me to test on Railway and report back
    before starting the next phase. Don't compound work across
    untested phases.
  - Edge case in no-residue rule: a single reshape inside a single
    hook is acceptable (the hook is the boundary); the same adapter
    spread across multiple hooks/components/routes is residue.
  - When you hit a decision I haven't covered (data shape gap, schema
    extension, reshape vs flatten), STOP AND ASK. Don't pick
    silently.

STEP 4 — pre-commit verification:
  Run `pnpm verify` from the repo root. It runs:
    1. `pnpm --filter @tela/db build`
    2. `pnpm --filter @tela/capabilities build`
    3. `pnpm --filter @tela/api typecheck`
    4. `pnpm --filter @tela/web typecheck`
    5. `scripts/check-no-residue.sh`
  If any step fails, fix it and rerun before committing.

STEP 5 — communicate before pushing:
  Per Luke's memory rule: every push needs explicit approval. The
  pattern is: commit locally → ask "Push?" → he says y/n. If silent,
  do not push.

Now: read PORT.md and docs/visual-port-plan.md, restate the rules,
and tell me where you're resuming based on the status table + the
most recent commits.
```
