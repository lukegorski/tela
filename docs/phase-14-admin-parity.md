# Phase 14 — Admin parity workstream

This doc plans the workstream to bring our new admin to feature parity
with the legacy admin at `admin.telastyle.app`, then cut DNS so the
new admin replaces it.

**Why now**: Step 1 (commit `d32941d`) deleted `apps/web/src/app/(admin)/`
because admin must NOT live at `telastyle.app/admin`. The new admin
needs its own home — `apps/admin` Next service deployed to Railway,
with `admin.telastyle.app` DNS cut to it once parity is achieved.

**Scope**: ~1-2 weeks of focused work split as 14a (relocate +
existing pages working) → 14b (build missing pages + DNS cut).

---

## Legacy admin inventory (verified by reading the code)

### Pages (7 routes)

| Route | Purpose | Lines |
|---|---|---|
| `/admin` | Redirects to `/admin/users` | 5 |
| `/admin/users` | User list (calls `/api/admin/users`) | 12 + 121-line shared `AdminUserList` component |
| `/admin/users/[uid]` | **User detail with 4 tabs**: Wardrobe / Outfits / Chat / Costs | 485 |
| `/admin/activity` | Paginated activity feed (calls `/api/admin/activity`) | 147 |
| `/admin/chat` | User list (deep-links to user detail's `?tab=chat`) | 13 (reuses AdminUserList) |
| `/admin/ai` | Full-page AdminAiChat | 7 (just renders the component) |
| `/admin/costs` | Global cost dashboard | 329 |
| `/admin/stylist` | **Single textarea** for one persona prompt + AI model dropdown | 137 |

### Chrome (`AdminShell.tsx`, 333 lines)

- **AdminNav**: top bar with Tela logo (left) → 5 nav links (center, desktop) →
  Claude icon AI panel toggle + hamburger menu (right). 5 NAV_ITEMS:
  USERS / ACTIVITY / CHAT / COSTS / STYLIST.
- **AdminAiPanel**: slide-out chat panel, desktop only, 420px wide,
  fixed-position right side, persists open/closed state in
  `localStorage["adminAiPanelOpen"]`. Renders `<AdminAiChat variant="panel" />`.
- **AdminGate**: auth wrapper. Uses `NEXT_PUBLIC_ADMIN_UID` env var to
  gate access (single hardcoded admin in legacy).
- **AdminLogin**: Google sign-in popup screen for unauthenticated users.

### API endpoints called

```
GET  /api/admin/users
GET  /api/admin/users/${uid}/wardrobe
GET  /api/admin/users/${uid}/outfits
GET  /api/admin/users/${uid}/chats
GET  /api/admin/users/${uid}/costs
GET  /api/admin/activity?limit=50&before=<iso>
POST /api/admin/ai/chat (presumed — backing the AdminAiChat)
```

---

## What we already have (Phase 8.5 admin, deleted in Step 1 but in git history at `fd4b451`)

### Capabilities (17 in `packages/capabilities/src/admin/`)

| Capability | Maps to legacy surface |
|---|---|
| `admin.listUsers` | `/api/admin/users` ✓ |
| `admin.getUserDetail` | partial coverage of `/api/admin/users/${uid}/*` (need to verify what tabs it includes) |
| `admin.getCosts` | `/api/admin/costs` (global, not per-user) |
| `admin.getDashboardStats` | (no legacy equivalent — our addition) |
| `admin.{listRules, createRule, updateRule, deleteRule}` | NEW — replaces single-textarea `/admin/stylist` with structured rules CRUD |
| `admin.{listExamples, createExample, updateExample, deleteExample}` | NEW — annotated examples CRUD |
| `admin.{listPrompts, getPromptHistory, createPromptVersion, rollbackPrompt}` | NEW — prompt versioning (draft/promote/rollback) |

### Pages (8 routes — all in git history at `fd4b451`)

`/admin` (overview) + `/admin/{users, users/[userId], costs, examples,
examples/new, examples/[exampleId], prompts, prompts/[name], rules,
rules/new, rules/[ruleId]}`.

Auth model: `users.is_admin` boolean column (migration 0007) +
capability registry `requiresAdmin` gate. **Better than legacy's
hardcoded `NEXT_PUBLIC_ADMIN_UID`** — multi-admin support, no
env-var coupling.

### Chrome (deleted in `d32941d`)

`apps/web/src/app/(admin)/admin/layout.tsx` (route group root layout,
30 lines) — basic shell. We never matched the legacy AdminNav visual
pattern (top nav + AI panel slide-out).

---

## Mapping — legacy → new (gap analysis)

| Legacy surface | New status | Phase 14 work |
|---|---|---|
| `/admin` (redirect) | ✅ exists in git history | 14a recover |
| `/admin/users` (list) | ✅ exists in git history (uses `admin.listUsers`) | 14a recover |
| `/admin/users/[uid]` (4 tabs) | ⚠️ partial — `admin.getUserDetail` exists but tab coverage unknown | 14a recover existing + 14b build missing tabs |
| `/admin/activity` | ❌ no page, no capability | 14b: capability + page |
| `/admin/chat` (deep-link to users) | ❌ no page | 14b: small wrapper page |
| `/admin/ai` (full-page) | ❌ no page, no `AdminAiChat` component | **DECISION P1 below** |
| `/admin/costs` (global) | ✅ exists in git history (uses `admin.getCosts`) | 14a recover |
| `/admin/stylist` (single textarea) | ✅ replaced by 3-surface (rules + examples + prompts) | **DECISION P2 below** |

### User-detail tabs (4 sub-surfaces inside `/admin/users/[uid]`)

| Tab | Legacy data source | New capability needed |
|---|---|---|
| Wardrobe | `/api/admin/users/${uid}/wardrobe` | `admin.getUserWardrobe(uid)` |
| Outfits | `/api/admin/users/${uid}/outfits` | `admin.getUserOutfits(uid)` |
| Chat | `/api/admin/users/${uid}/chats` | `admin.getUserChats(uid)` |
| Costs | `/api/admin/users/${uid}/costs` | `admin.getUserCosts(uid)` (NOT same as global `admin.getCosts`) |

**Verify** during 14a what `admin.getUserDetail` already returns —
if it covers any of these 4, build the missing ones in 14b.

### Chrome / AI panel

The legacy AdminNav + slide-out AdminAiPanel pattern is a real
visual+UX surface we never built. The screenshot you shared shows it
in action. **DECISION P3 below**.

---

## Architectural decisions to lock BEFORE coding

### P1 — AdminAiChat: port dedicated surface OR reuse `/chat` with admin gating?

**Option A: Port** (legacy parity)
- Build a new `<AdminAiChat />` component in `apps/admin`
- Slide-out panel pattern (420px desktop, mobile-only `/admin/ai` page)
- Custom Claude branding (icon, orange #d97757 accent)
- Tool dispatch via our existing capability layer (chat catalog already auto-discovers + filters by `requiresAdmin`)
- ~3-4 days work (the chat infra is reused; just a new UI surface)

**Option B: Reuse** (less work)
- Cofounder uses regular `/chat` at telastyle.app/en/chat
- Server-side: when `whoami.isAdmin === true`, the chat tool catalog includes `requiresAdmin` capabilities (currently it FILTERS them out — flip the logic for admin users)
- No `/admin/ai` page, no AdminAiPanel slide-out
- ~0.5 days work (1-line filter change in `toolCatalog.ts` + permission verification)

**Recommendation: Option B (reuse).** Architectural simplification:
single chat surface, capability layer already does the work. The
slide-out panel is a nice UX detail but not a hard requirement.
Cofounder bookmarks `/chat` instead of using a sidebar.

**Counter-argument**: legacy slide-out panel is convenient — admin
can chat WHILE on a stats page. With Option B, they have to navigate
to /chat, losing context. Worth ~3 days to preserve?

### P2 — Stylist surface: keep 3 separate routes OR add `/admin/stylist` landing?

We have `/admin/{rules, examples, prompts}` — three distinct surfaces.
Legacy has one `/admin/stylist`.

**Option A**: Add `/admin/stylist` → redirect to `/admin/rules`. Preserves
the URL but doesn't add a real surface.

**Option B**: Add `/admin/stylist` as a real landing/overview page that
links to the three sub-surfaces. ~0.5 days extra.

**Option C**: Drop the legacy URL entirely; nav goes directly to
`/admin/rules` (or a "Stylist" dropdown menu).

**Recommendation: Option A (redirect).** Cheapest, preserves URL,
nav points to "Stylist" → lands on rules. The 3 sub-surfaces are the
real work; a landing page is just a hop.

### P3 — AI panel slide-out: port or drop?

Tied to P1.

If P1 = Option A (port AdminAiChat): include the slide-out panel; ~1
extra day to wire the layout.

If P1 = Option B (reuse /chat): drop the panel entirely (no admin
chat surface to slide out).

**Recommendation: drop, contingent on P1=B.**

### P4 — DNS cutover timing for `admin.telastyle.app`

When does `admin.telastyle.app` DNS move from legacy Vercel to the
new Railway `apps/admin` service?

**Option A**: At the end of 14a (5 existing pages working, 3 missing
pages 404). Cofounder has functional but incomplete admin during 14b.

**Option B**: At the end of 14b (full parity). DNS doesn't move until
everything works. Legacy admin stays alive at admin.telastyle.app
through 14b.

**Recommendation: Option B (defer to end of 14b).** Don't cut to a
half-working admin. The dev workflow during 14a/14b uses the Railway
URL (e.g., `tela-admin-development.up.railway.app`).

### P5 — Activity events: legacy → new event taxonomy mapping

Legacy activity log has these action types (from `ACTION_LABELS` in
`/admin/activity/page.tsx`):

| Legacy action | Our event type (`@tela/events` taxonomy) |
|---|---|
| `item_uploaded` | `wardrobe.item_added` ✓ |
| `item_deleted` | `wardrobe.item_removed` ✓ |
| `outfit_generated` | `outfit.generated` ✓ |
| `outfit_saved` | `outfit.saved` ✓ |
| `outfit_unsaved` | `outfit.unsaved` (NEW from D.7 — confirm exists) |
| `outfit_feedback` | `feedback.positive` / `feedback.negative` / `feedback.cleared` ✓ |
| `outfit_deleted` | `outfit.deleted` ✓ |
| `outfit_tryon_requested` | `tryon.started` ✓ |
| `profile_created` | `auth.signed_up` ✓ |
| `onboarding_completed` | (no exact match; could use `profile.dimensions_derived` or add `auth.onboarding_completed`) |
| `chat_message_sent` | `chat.message_sent` ✓ |

The activity feed renders human-friendly labels per event type; the
mapping is mostly mechanical. Build a `formatActivityEvent` helper in
`apps/admin` that maps our event types to legacy-style labels.

**Decision**: confirm the mapping table is complete and event names
match. If `auth.onboarding_completed` doesn't exist, add it (small
event taxonomy extension, no schema change).

---

## D.14a — Relocate existing admin to `apps/admin`

### Scope

- Scaffold `apps/admin` Next service in monorepo (mirrors `apps/api`,
  `apps/mcp` pattern)
- Recover the 8 existing admin pages from git history (commit
  `fd4b451`)
- Build the AdminShell-style chrome:
  - Top nav with Tela logo + 5 nav links (USERS / ACTIVITY / CHAT /
    COSTS / STYLIST)
  - Hamburger menu on mobile (slide-in right panel, matches main app
    Navbar pattern)
  - Auth gate using `users.is_admin` (NOT `NEXT_PUBLIC_ADMIN_UID`)
  - **NO** AI panel slide-out (per P3=drop, contingent on P1=B)
- Wire Supabase auth (apps/admin uses same JWT model as apps/web)
- Wire tRPC client pointing at apps/api
- Visual parity pass against the screenshot for the 5 existing pages
  (users, costs, examples, prompts, rules)
- Add `/admin/stylist` redirect to `/admin/rules` (per P2=A)
- Configure Railway service for apps/admin (separate deploy)
- Smoke test on Railway URL (NOT cut DNS yet — per P4=B)

### Files to recover from git history

```bash
PRE_DELETE=fd4b451   # commit BEFORE Step 1 deletion
TARGET_DIR=apps/admin/src/app
SOURCE_DIR='apps/web/src/app/(admin)/admin'

# 8 page files
for path in \
  'page.tsx' \
  'layout.tsx' \
  'costs/page.tsx' \
  'examples/page.tsx' 'examples/new/page.tsx' 'examples/[exampleId]/page.tsx' \
  'prompts/page.tsx' 'prompts/[name]/page.tsx' \
  'rules/page.tsx' 'rules/new/page.tsx' 'rules/[ruleId]/page.tsx' \
  'users/page.tsx' 'users/[userId]/page.tsx'
do
  mkdir -p "$TARGET_DIR/$(dirname $path)"
  git show ${PRE_DELETE}:${SOURCE_DIR}/${path} > "$TARGET_DIR/$path"
done

# 3 admin form components
mkdir -p apps/admin/src/components
for f in ExampleForm.tsx PromptEditor.tsx RuleForm.tsx; do
  git show ${PRE_DELETE}:apps/web/src/components/admin/$f > "apps/admin/src/components/$f"
done

# 6 admin lib helpers
mkdir -p apps/admin/src/lib
for f in admin-costs admin-examples admin-prompts admin-rules admin-stats admin-users; do
  git show ${PRE_DELETE}:apps/web/src/lib/$f.ts > "apps/admin/src/lib/$f.ts"
done
```

After recovery, fix imports — anything pointing at `@/components/...`
or `@/lib/...` from the old apps/web context needs to resolve to
apps/admin's tsconfig path mapping.

### Reused from apps/web (duplicate, NOT shared)

For 14a velocity, duplicate these into apps/admin:
- `LoadingSpinner.tsx`
- `ColorSwatch.tsx`
- `useAuth` / `useAuthContext` / `AuthProvider` — but pointed at the
  same Supabase client + `whoami` capability; just gate on
  `whoami.isAdmin === true` for admin
- `localePath` / `isLocale` — wait, admin doesn't use locale prefixes
  (legacy was `/admin/...` not `/[lang]/admin/...`). Skip.
- `dictionaries/*.json` — admin is English-only in legacy. Skip i18n
  entirely; hardcode English labels in admin.

Tech debt: extract to `packages/ui` + `packages/i18n` post-Phase 14.
Flag in commit message.

### Railway / DNS hand-off

Manual ops work — Luke does this, not the script:

1. Create new Railway service "tela-admin-development" (or similar)
2. Connect to GitHub, build with
   `pnpm --filter @tela/admin build`
3. Doppler integration for env vars (same vars as apps/web —
   `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_*`, `NEXT_PUBLIC_API_URL`)
4. Smoke-test at `tela-admin-development.up.railway.app`
5. **Don't cut DNS yet** — `admin.telastyle.app` keeps pointing at
   legacy until end of 14b

---

## D.14b — Build missing pages + DNS cut

### New capabilities (5)

In `packages/capabilities/src/admin/`:

| Capability | Input | Output | Notes |
|---|---|---|---|
| `admin.getActivity` | `{ limit?: number, before?: string }` | `{ entries: ActivityEntry[], hasMore: boolean }` | Reads from `events` table; orders by `created_at DESC`; cursor pagination via `before` ISO string |
| `admin.getUserWardrobe` | `{ userId: string }` | `{ items: RichItem[] }` | Reuses `wardrobe/itemShape.ts:fetchRichItems` with `userId` arg |
| `admin.getUserOutfits` | `{ userId: string }` | `{ outfits: RichOutfit[] }` | Reuses `outfit/outfitShape.ts:fetchRichOutfits` with `userId` arg |
| `admin.getUserChats` | `{ userId: string, limit?, offset? }` | `{ messages: ChatMessage[], total: number }` | Reads from `chat_messages` joined to `chat_conversations.user_id`; ordered chronologically |
| `admin.getUserCosts` | `{ userId: string }` | `{ totalCostCents: number, byOperation: ..., entries: GenerationRow[] }` | Reads from `generations` table filtered to `user_id`; aggregates by `operation` |

All require `requiresAdmin: true`. All must verify the requesting
user has `is_admin = true` (handled by the registry gate, but
double-check). All read across user boundaries (admin reads any
user's data) — that IS the privilege.

### New pages (3)

| Page | Implementation |
|---|---|
| `/admin/activity` | Port the legacy 147-line page. Replace `fetch('/api/admin/activity')` with `trpc.capability.execute.useMutation({ name: 'admin.getActivity' })`. Map our event types to legacy labels per P5. Cursor pagination via `before`. |
| `/admin/chat` | Port the legacy 13-line page. Reuses the `AdminUserList` component built in 14a; just changes `hrefBuilder` to `/admin/users/${userId}?tab=chat`. |
| `/admin/users/[id]` (extend with 4 tabs) | Port the legacy 485-line page. Replace 4 `useFetch` hooks with 4 tRPC `.useMutation` calls to the new capabilities above. Tab routing via `?tab=` query param. |

### AdminAiChat decision (per P1)

**If P1=B (recommended)**:
- Skip building `/admin/ai` entirely
- Skip the slide-out AdminAiPanel
- Update `toolCatalog.ts` so `requiresAdmin` capabilities are INCLUDED for admin users (currently filtered out)
- Document for cofounder: "Use /chat at telastyle.app — admin tools available when you're signed in as admin"

**If P1=A**: build the AdminAiChat component + /admin/ai page +
slide-out panel. ~3-4 extra days.

### DNS cutover (end of 14b)

Manual ops work — Luke does this:

1. Verify all 8 admin pages render correctly on Railway URL
2. Update DNS: `admin.telastyle.app` CNAME → Railway admin service
3. Wait for DNS propagation (5 min - 24 hours)
4. Verify `admin.telastyle.app` serves the new admin
5. Keep legacy admin alive on Vercel for 1 week as fallback
6. After 1 week: tear down legacy admin

---

## Out of scope for Phase 14

- `packages/ui` extraction (duplicated chrome stays duplicated)
- `packages/i18n` extraction (admin is English-only)
- Multi-tenancy admin (we have 1 cofounder)
- Admin audit log (who modified which prompt) — flag for post-14
- Admin role granularity (read-only vs read-write admin) — flag for post-14
- Realtime updates (polling is fine for admin)
- Mobile-first admin (admin is primarily desktop; mobile gets the
  hamburger menu but no special UX)

---

## Scope estimate

| Sub-phase | Estimate | Deliverable |
|---|---|---|
| 14a | 3-4 days | apps/admin scaffolded, 5 existing pages recovered + visual parity, deployed to Railway URL (DNS NOT cut) |
| 14b | 4-5 days | 5 new admin capabilities + 3 new pages + DNS cut to admin.telastyle.app |
| **Total** | **1-2 weeks** | Full admin parity at admin.telastyle.app, legacy admin retired |

---

## 6 architectural decisions — ALL LOCKED

1. **P1 — Port AdminAiChat as dedicated surface** (Option A). Slide-out
   panel + `/admin/ai` page. ~4-5 days work.
2. **P2 — `/admin/stylist` redirects to `/admin/rules`** (Option A).
   Nav unchanged (5 tabs); existing 3-surface architecture
   (rules + examples + prompts) stays.
3. **P3 — Port AI panel slide-out** (Option A, contingent on P1=A
   confirmed). 420px right-side slide-out, persists state in
   `localStorage["adminAiPanelOpen"]`, desktop only. Mobile uses
   `/admin/ai` full-page.
4. **P4 — DNS cut at end of full parity = end of 14c** (per added
   sub-phase below).
5. **P5 — Port legacy activity event mapping verbatim**. Build
   `formatActivityEvent` helper that maps our event types to the
   same English labels legacy uses. Add `auth.onboarding_completed`
   to event taxonomy if missing. Verify `outfit.unsaved` exists.
6. **P6 — AdminAiChat persists; team-shared visibility.** Reuse
   `chat_conversations` + `chat_messages` with new
   `is_admin_chat: boolean` column. Any admin sees any admin chat
   (per "internal team can revisit"). Migration 0014 adds the column.

Plus three implementation choices locked from reading the legacy
backend (`/api/admin/ai/chat/route.ts`):

7. **Anthropic Claude for admin chat** (matches legacy + orange
   ClaudeIcon brand). User chat stays on OpenAI. Our @tela/ai
   gateway already supports both providers.
8. **`currentRoute` system prompt context.** Admin's current admin
   page (e.g., `/admin/users/abc`) is passed to the system prompt
   builder so the AI has page-aware context for tool calls.
9. **Reuse capability registry with admin filter inclusion**, not
   a separate admin tool list. Add `buildToolCatalog({ includeAdmin:
   true })` variant that includes `requiresAdmin` capabilities for
   admin chat. Regular `/chat` keeps the current filter (excludes
   admin tools). Admin chat sees all 17 admin capabilities
   automatically.

10. **Path A (RSC + DB-direct via @tela/db) — locked for 14a-14c.**
    apps/admin pages are RSC and read Postgres directly via lib
    helpers in `apps/admin/src/lib/admin-*.ts`. Helpers import
    `getSql` (raw postgres-js tagged template) or `getDb` (Drizzle)
    from `@tela/db` — never create a local `postgres()` client or
    module-local `_sql` state, since that would skip the pgbouncer
    `prepare: false` fix (PORT.md pitfall #14). Writes (form
    submits, mutations) still go through tRPC capabilities so the
    `requiresAdmin` gate / audit log / observability hooks fire.
    **Don't mix patterns in 14b/14c**: new admin pages stay RSC +
    DB-direct for reads. A hybrid where some pages fetch via
    `useQuery` and others via lib helpers is worse than either pure
    path. Env-var allowlist for apps/admin: `NEXT_PUBLIC_SUPABASE_URL`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL`,
    `DATABASE_URL`, `NODE_ENV=production`. **Excluded**:
    `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_ADMIN_*`,
    `SERVICE_ACCOUNT_SECRET`, `SENTRY_DSN`. If admin ever needs a
    Supabase admin-API operation, route it through an apps/api
    capability rather than pulling the service-role key into admin.

---

## D.14c — AdminAiChat surface + DNS cut

Added per critique: AdminAiChat is substantial enough (~4-5 days)
to be its own sub-phase. P4 re-interpreted: DNS cuts at the end of
full parity = end of 14c.

### Schema migration 0014

```sql
ALTER TABLE chat_conversations ADD COLUMN is_admin_chat BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX chat_conversations_is_admin_chat_idx ON chat_conversations(is_admin_chat) WHERE is_admin_chat = TRUE;
```

Partial index (`WHERE is_admin_chat = TRUE`) keeps the index small —
admin chats are rare relative to user chats. Queries for "list all
admin chats" use this index; user chat queries are unaffected.

### New capabilities (all `requiresAdmin: true`)

| Capability | Input | Output | Notes |
|---|---|---|---|
| `admin.streamChatTurn` | `{ conversationId?, message, currentRoute? }` | SSE generator (mirrors `streamChatTurn`) | Same shape as user `streamChatTurn` but: uses Anthropic provider, sets `is_admin_chat: true` on new conversations, passes `currentRoute` to system prompt, calls `buildToolCatalog({ includeAdmin: true })`. Likely a separate generator file `packages/capabilities/src/admin/streamAdminChat.ts` to avoid mixing concerns. |
| `admin.listAdminChats` | `{ limit?: number, offset?: number }` | `{ conversations: AdminChatSummary[], hasMore: boolean }` | Lists ALL `chat_conversations WHERE is_admin_chat = TRUE` regardless of `user_id`. Sorted `last_message_at DESC`. Each summary includes the admin user's email/displayName who started it. |
| `admin.getAdminChat` | `{ conversationId }` | `{ id, title, messages: ChatMessage[], startedBy: { email, displayName } }` | Like `chat.getConversation` but allows reading any admin chat (any admin can read any other admin's chat per P6). |

### `@tela/ai` extensions

- Add `provider: 'openai' | 'anthropic'` parameter to `callMultiStream`
  (or check `model` prefix). Anthropic provider already exists in
  `packages/ai/src/providers/anthropic.ts` (per memory: "Anthropic
  Claude Sonnet 4 for admin tooling").
- Verify `chatMultiStream` is implemented for the Anthropic provider.
  If not, add it (mirrors OpenAI implementation).

### `apps/api` SSE endpoint

Add `POST /admin/chat/stream` route that calls
`admin.streamChatTurn` (same SSE event format as `/chat/stream`:
`user-saved`, `thinking`, `tool-start`, `tool-end`, `text-delta`,
`done`, `error`). Gate on `requiresAdmin` (whoami.isAdmin === true).

### `apps/admin` surfaces

- **Slide-out panel** — port the `<AdminAiPanel>` component from
  legacy AdminShell (lines 208-237 of legacy `AdminShell.tsx`).
  420px desktop, fixed-position right side, persists open/closed in
  `localStorage["adminAiPanelOpen"]`. Defaults open on first visit.
- **Full-page `/admin/ai`** — render `<AdminAiChat variant="page" />`.
  Used on mobile (where slide-out doesn't fit) and as a permanent
  surface for the "AI" hamburger menu link.
- **`AdminAiChat` component** — port from legacy
  `src/components/AdminAiChat.tsx` (444 lines). Two variants
  (`panel` | `page`), conversation list sidebar, current conversation
  pane with streaming, message persistence via the new capabilities.
- **`ClaudeIcon` SVG** — port verbatim from legacy AdminShell
  (lines 25-30, the orange `#d97757` Anthropic-branded icon).

### Conversation list UI (sidebar)

Per P6 = team-shared, the AdminAiChat sidebar shows ALL admin
conversations (any admin's), sorted by recency. Each row shows:
- Conversation title (auto-derived from first user message)
- Started-by avatar + name (so cofounder knows who initiated)
- Last activity timestamp
- Click to open that conversation in main pane

This is a transparency feature: any admin can audit / continue any
other admin's session.

### DNS cut (end of 14c)

Manual ops work — Luke does this:
1. Verify all 11 admin pages render correctly on Railway URL
   (8 from 14a + 3 from 14b)
2. Verify AdminAiChat works (panel opens, messages stream, history
   persists, conversation list shows team chats)
3. Update DNS: `admin.telastyle.app` CNAME → Railway admin service
4. Wait for DNS propagation (5 min - 24 hours)
5. Verify `admin.telastyle.app` serves the new admin
6. Keep legacy admin alive on Vercel for 1 week as fallback
7. After 1 week: tear down legacy admin

---

## Updated scope estimate

| Sub-phase | Estimate | Deliverable |
|---|---|---|
| 14a | 3-4 days | apps/admin scaffolded, 8 existing pages recovered + visual parity, deployed to Railway URL (DNS NOT cut) |
| 14b | 3-4 days | 5 new admin capabilities + 3 new pages (activity, chat, user-detail extended with 4 tabs) + activity event mapping |
| 14c | 4-5 days | AdminAiChat (slide-out panel + /admin/ai page + persistence + Anthropic backend + admin tool catalog) + DNS cut |
| **Total** | **2-3 weeks** | Full admin parity at admin.telastyle.app, legacy admin retired |

---

## 14a — session-start prompt

Copy this into a fresh Claude Code session at `/Users/lukegorski/tela`:

```
You are scaffolding apps/admin and recovering existing admin pages
from git history. Phase 14a of the admin parity workstream.

WORKING DIR: /Users/lukegorski/tela
LEGACY DIR: /Users/lukegorski/ale (READ-ONLY — visual reference)
LEGACY ADMIN URL: https://admin.telastyle.app (still alive — visual reference)

FULL SPEC: docs/phase-14-admin-parity.md (read cover to cover)

══════════════════════════════════════════════════════════
WHAT 14a SHIPS:
══════════════════════════════════════════════════════════

- New apps/admin Next service in the monorepo (mirrors apps/api,
  apps/mcp, apps/web pattern)
- 8 existing admin pages recovered from git history (commit fd4b451)
- AdminShell-style chrome (top nav with 5 tabs USERS / ACTIVITY /
  CHAT / COSTS / STYLIST + hamburger menu mobile)
- Auth gate using Supabase JWT + users.is_admin (NOT legacy's
  NEXT_PUBLIC_ADMIN_UID)
- Visual parity pass against admin.telastyle.app for the 5 existing
  pages (users, costs, examples, prompts, rules)
- /admin/stylist redirects to /admin/rules
- Deployed to a new Railway service at tela-admin-development.up.railway.app
- DNS does NOT cut yet (admin.telastyle.app stays on legacy through 14c)

NOT in 14a (deferred to 14b/14c):
- 3 missing pages (activity, chat, user-detail with 4 tabs)
- 5 new admin capabilities
- AdminAiChat (slide-out panel + /admin/ai)
- Anthropic provider extension

══════════════════════════════════════════════════════════
LOCKED ARCHITECTURAL CONTEXT (don't revisit):
══════════════════════════════════════════════════════════

P2: /admin/stylist redirects to /admin/rules (1-line page).
P3: AI panel slide-out is part of 14c (NOT 14a — placeholder OK).
Auth: users.is_admin boolean (NOT legacy's NEXT_PUBLIC_ADMIN_UID).
Branding: keep "tela admin" + Tela logo top-left.
Nav: 5 tabs in this order: USERS / ACTIVITY / CHAT / COSTS / STYLIST.
Mobile: hamburger menu with slide-in right panel (matches main app
Navbar pattern).
i18n: admin is English-only. NO localePath, NO dictionaries imports.
Layout: route group NOT used; apps/admin is a dedicated app with its
own root layout.

══════════════════════════════════════════════════════════
SCAFFOLD CHECKLIST (apps/admin) — concrete from apps/web reads:
══════════════════════════════════════════════════════════

apps/admin/package.json                    ("@tela/admin", same Next/
                                            React/Tailwind versions
                                            as apps/web)
apps/admin/tsconfig.json                   (compilerOptions identical
                                            to apps/web; paths:
                                            { "@/*": ["./src/*"] })
apps/admin/next.config.ts                  Mirror apps/web's:
                                            - transpilePackages: ['@tela/api']
                                            - experimental.externalDir: true
                                            - images.remotePatterns for
                                              **.supabase.co (admin uses
                                              <Image> for user photos in
                                              user-detail tabs)
apps/admin/postcss.config.mjs              Tailwind 4 setup — VERBATIM
                                            from apps/web:
                                              { plugins: { '@tailwindcss/postcss': {} } }
apps/admin/src/app/globals.css             (copy from apps/web verbatim)
apps/admin/.eslintrc.json                  (copy from apps/web verbatim)
Add 'apps/admin' to root pnpm-workspace.yaml
Add 'apps/admin' pipeline targets to root turbo.json (build, typecheck, dev)
Add to root package.json scripts:
  "dev:admin": "turbo dev --filter=@tela/admin"
Update root verify script to include:
  pnpm --filter @tela/admin typecheck
Update scripts/check-no-residue.sh to scan apps/admin/src/ in addition
  to apps/web/src/ (find the WEB_SRC variable, change to scan an array
  or run twice)

apps/admin does NOT depend on @tela/db. Pure frontend calling apps/api
via tRPC + Supabase auth. Required env vars (mirrors apps/web):
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  - SUPABASE_URL (for SSR via @supabase/ssr)
  - NEXT_PUBLIC_API_URL (where apps/api is served — points at the
    same API URL as apps/web)

CORS confirmed permissive — apps/api uses `app.use('*', cors())` with
no origin restriction. No CORS work needed for apps/admin.

══════════════════════════════════════════════════════════
URL STRUCTURE (locked: keep `/admin/*` for backward compat):
══════════════════════════════════════════════════════════

After DNS cut, admin lives at admin.telastyle.app. Two URL choices:
  (a) Keep /admin/* paths → admin.telastyle.app/admin/users
       MATCHES legacy URL exactly. Bookmarks preserved.
  (b) Drop /admin/* paths → admin.telastyle.app/users
       Cleaner but breaks every legacy bookmark.

LOCKED: (a) keep /admin/* paths. The recovered pages are at
apps/web/src/app/(admin)/admin/*; recover them to apps/admin/src/app/admin/*
(the (admin) route group goes away because apps/admin is its own app;
the literal "admin" URL segment stays).

══════════════════════════════════════════════════════════
RECOVERY — full list (verified by reading admin pages + layout):
══════════════════════════════════════════════════════════

The v1 recovery script was incomplete. The recovered admin layout.tsx
imports things I missed first time:
  - @/lib/admin (requireAdmin) — server-side admin gate
  - @/components/ThemeProvider
  - @/components/AuthProvider
  - @/trpc/Provider (TRPCProvider)
And AuthProvider/Provider transitively need:
  - @/lib/supabase/client + server
  - @/lib/users
  - @/lib/auth (landingHref)
  - @/trpc/client
  - hooks/useAuth (if AuthProvider uses it)

Plus AdminUserList lived inside (admin)/admin/ as a SHARED component
(used by /admin/users AND /admin/chat in 14b). That was missing too.

PRE_DELETE=fd4b451   # commit BEFORE Step 1 deletion

TARGET=apps/admin/src
SOURCE_ADMIN='apps/web/src/app/(admin)/admin'
SOURCE_WEB='apps/web/src'

# ─── (1) Admin pages — 13 files ───
for path in \
  page.tsx \
  layout.tsx \
  AdminUserList.tsx \
  costs/page.tsx \
  examples/page.tsx examples/new/page.tsx 'examples/[exampleId]/page.tsx' \
  prompts/page.tsx 'prompts/[name]/page.tsx' \
  rules/page.tsx rules/new/page.tsx 'rules/[ruleId]/page.tsx' \
  users/page.tsx 'users/[userId]/page.tsx'
do
  mkdir -p "$TARGET/app/admin/$(dirname $path)"
  git show ${PRE_DELETE}:${SOURCE_ADMIN}/${path} > "$TARGET/app/admin/$path"
done

# ─── (2) Admin form components — 3 files ───
mkdir -p "$TARGET/components"
for f in ExampleForm.tsx PromptEditor.tsx RuleForm.tsx; do
  git show ${PRE_DELETE}:apps/web/src/components/admin/$f > "$TARGET/components/$f"
done

# ─── (3) Admin lib helpers — 6 files ───
mkdir -p "$TARGET/lib"
for f in admin-costs admin-examples admin-prompts admin-rules admin-stats admin-users; do
  git show ${PRE_DELETE}:apps/web/src/lib/$f.ts > "$TARGET/lib/$f.ts"
done

# ─── (4) Server-side admin gate ───
git show ${PRE_DELETE}:apps/web/src/lib/admin.ts > "$TARGET/lib/admin.ts"

# ─── (5) Shared providers + auth (DUPLICATE from current apps/web —
#         not from fd4b451, since apps/web has had updates since) ───
mkdir -p "$TARGET/components" "$TARGET/lib/supabase" "$TARGET/trpc" "$TARGET/hooks"
cp apps/web/src/components/{AuthProvider,ThemeProvider,LoadingSpinner}.tsx "$TARGET/components/"
cp apps/web/src/lib/supabase/{client,server}.ts "$TARGET/lib/supabase/"
cp apps/web/src/lib/{users,auth}.ts "$TARGET/lib/"
cp apps/web/src/trpc/{client,Provider}.tsx "$TARGET/trpc/" 2>/dev/null || \
  cp apps/web/src/trpc/{client.ts,Provider.tsx} "$TARGET/trpc/"
# Verify if useAuth.ts is referenced; if so, copy it too:
grep -l "useAuth" "$TARGET/components/AuthProvider.tsx" >/dev/null && \
  cp apps/web/src/hooks/useAuth.ts "$TARGET/hooks/"

# ─── (6) Stylist redirect (NEW — not in legacy or fd4b451 directly) ───
mkdir -p "$TARGET/app/admin/stylist"
cat > "$TARGET/app/admin/stylist/page.tsx" <<'EOF'
import { redirect } from 'next/navigation';
// Per Phase 14 P2: legacy /admin/stylist was a single textarea.
// We replaced it with /admin/{rules, examples, prompts}. Redirect
// preserves the legacy URL for bookmark compat.
export default function StylistPage() {
  redirect('/admin/rules');
}
EOF

══════════════════════════════════════════════════════════
POST-RECOVERY CHECK:
══════════════════════════════════════════════════════════

After running the recovery script:
1. Run `pnpm verify` — expect TS errors. Fix them by:
   - Confirming tsconfig path alias `@/* → ./src/*` resolves all imports
   - Some recovered admin pages may reference apps/web-only types or
     newer schema fields. Compare against current capability shapes if
     any errors mention undefined exports.
2. Run `grep -rn "from '@/lib/firebase'" apps/admin/src/` — must return
   ZERO. (None should — but defense in depth in case fd4b451 had any
   stragglers I missed.)
3. Run the no-residue script against apps/admin/src/ — expect ZERO
   firebase / Firestore references in the recovered code.

══════════════════════════════════════════════════════════
ADMINSHELL CHROME (port from legacy, keep is_admin auth):
══════════════════════════════════════════════════════════

Port the chrome layout from legacy AdminShell.tsx (333 lines).
The recovered fd4b451 layout.tsx is a placeholder — REPLACE it with
a proper AdminShell-style chrome that matches admin.telastyle.app.

Components to build in apps/admin/src/components/admin-chrome/:
- AdminShell.tsx (top-level wrapper: ThemeProvider > AuthProvider >
  TRPCProvider > AdminGate)
- AdminNav.tsx (top bar: Tela logo left, 5 nav links center desktop,
  Claude AI button + hamburger right)
- AdminGate.tsx (auth + isAdmin check using whoami)
- AdminLogin.tsx (Google sign-in via Supabase OAuth)
- TelaLogo.tsx (port the inline SVG from legacy AdminShell:35-43)

5 NAV_ITEMS in this exact order:
  { href: '/admin/users',    label: 'Users' }
  { href: '/admin/activity', label: 'Activity' }    (placeholder 404 in 14a; built in 14b)
  { href: '/admin/chat',     label: 'Chat' }        (placeholder 404 in 14a; built in 14b)
  { href: '/admin/costs',    label: 'Costs' }
  { href: '/admin/stylist',  label: 'Stylist' }     (redirects to /admin/rules)

Note: clicking Activity / Chat in 14a will land on /admin/activity
and /admin/chat which don't exist yet — Next 16 will 404. That's
expected; 14b builds them. Optionally add a placeholder page that
says "Coming soon" — your call.

AdminGate auth flow (replaces legacy's NEXT_PUBLIC_ADMIN_UID):
1. Read whoami via tRPC client-side on mount
2. If `loading` → show LoadingSpinner
3. If no user → show <AdminLogin /> (Google OAuth via Supabase)
4. If user but `whoami.isAdmin !== true` → show "This account does
   not have admin access. Sign out" + sign-out button
5. If user AND isAdmin → render <AdminNav> + <main>{children}</main>

The recovered layout.tsx ALREADY does requireAdmin() server-side
for RSC pages. AdminGate is the client-side equivalent for client
components. Both should be in place — defense in depth.

Sliding mobile menu: port from legacy AdminShell:142-202. Matches
apps/web's Navbar slide-in right panel (450ms ease-out, backdrop
click closes, ESC key closes, body scroll lock when open).

AI panel toggle button (Claude icon, top-right desktop):
- 14a: HIDDEN entirely (don't render the button until 14c). Avoids
  dead UI.
- 14c: wires it to toggle the AdminAiPanel slide-out.

ClaudeIcon SVG: port verbatim from legacy AdminShell.tsx:25-30 (one
of the SVG paths you'll lift wholesale). Save reading time by
copying the entire `<svg>` block; the `<path d="...">` is the orange
Claude logo path.

DO NOT port the AdminAiPanel slide-out yet (14c).

══════════════════════════════════════════════════════════
EXECUTION RULES:
══════════════════════════════════════════════════════════

- Legacy /Users/lukegorski/ale is READ-ONLY. Use admin.telastyle.app
  in browser as the visual reference (run side-by-side with your
  apps/admin localhost:3002).
- Doppler required for any local run.
- Two dev servers convention extends to three:
    localhost:3000 — legacy (visual reference)
    localhost:3001 — apps/web
    localhost:3002 — apps/admin (your work)
- Verify Luke's user has is_admin = TRUE in dev DB before testing
  (otherwise apps/admin shows "no access" everywhere).
- All admin pages are CSR (client components). Use 'use client'
  at the top of every page.tsx.
- Admin is English-only — NO i18n imports, NO localePath, NO
  dict.* references in any admin page or component.
- Recovered admin pages may have stale assumptions about capability
  shapes. Run pnpm verify after recovery + fix anything that breaks.
- Pitfall #11/#12/#13/#14 still apply — admin React code uses the
  same hooks as apps/web.
- Before commit: pnpm verify (includes new @tela/admin typecheck +
  no-residue scan extended to apps/admin/src/).
- Single commit (or split if natural break) → ASK before pushing.
- After push: WAIT for Luke to deploy apps/admin to Railway + smoke
  test at the Railway URL. DNS does NOT cut yet.

══════════════════════════════════════════════════════════
RAILWAY HAND-OFF (Luke does this manually after the push):
══════════════════════════════════════════════════════════

1. Create new Railway service "tela-admin-development"
2. Connect to GitHub, build with `pnpm --filter @tela/admin build`,
   start with `pnpm --filter @tela/admin start`
3. Doppler integration for env vars (NEXT_PUBLIC_SUPABASE_URL,
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_API_URL)
4. Smoke test at tela-admin-development.up.railway.app
5. Add the Railway hostname to apps/api's CORS allowlist (separate
   small commit if needed)

DO NOT cut admin.telastyle.app DNS — that happens at end of 14c.

Now: read PORT.md + docs/phase-14-admin-parity.md (full spec) + the
8 legacy admin pages for visual reference (paths in the spec). Then
start with the scaffold checklist.
```

---

## 14b — session-start prompt

Copy this into a fresh Claude Code session at `/Users/lukegorski/tela`
AFTER 14a is shipped + smoke-tested:

```
You are building 5 new admin capabilities + 3 new admin pages.
Phase 14b of the admin parity workstream.

WORKING DIR: /Users/lukegorski/tela
LEGACY DIR: /Users/lukegorski/ale (READ-ONLY)
LEGACY ADMIN URL: https://admin.telastyle.app (visual reference)

FULL SPEC: docs/phase-14-admin-parity.md (read cover to cover)

══════════════════════════════════════════════════════════
WHAT 14b SHIPS:
══════════════════════════════════════════════════════════

5 NEW ADMIN CAPABILITIES (all requiresAdmin: true):
  admin.getActivity({ limit?, before? }) → { entries[], hasMore }
  admin.getUserWardrobe({ userId }) → { items: RichItem[] }
  admin.getUserOutfits({ userId }) → { outfits: RichOutfit[] }
  admin.getUserChats({ userId, limit?, offset? }) → { messages, total }
  admin.getUserCosts({ userId }) → { totalCostCents, byOperation, entries }

3 NEW ADMIN PAGES:
  /admin/activity — port from legacy 147-line page
  /admin/chat — port from legacy 13-line page (just AdminUserList wrapper)
  /admin/users/[id] — port from legacy 485-line page (4 tabs)

P5 ACTIVITY EVENT MAPPING:
  Build formatActivityEvent helper that maps our event types to the
  same English labels legacy uses. See P5 mapping table in the spec.
  If outfit.unsaved or auth.onboarding_completed don't exist in our
  event taxonomy, add them (small extension to packages/events/src/types.ts).

NOT in 14b (deferred to 14c):
  AdminAiChat (slide-out panel + /admin/ai)
  Anthropic provider extension
  is_admin_chat schema migration
  DNS cut

══════════════════════════════════════════════════════════
EXECUTION RULES:
══════════════════════════════════════════════════════════

- PATH A CONTINUITY (locked in 14a, applies here): admin pages are
  RSC and read DB directly via lib helpers in apps/admin/src/lib/.
  New 14b lib helpers (e.g., admin-activity.ts, admin-user-detail.ts)
  import getSql / getDb from @tela/db — never create a local
  postgres() client. The 5 new admin.* capabilities below are for
  WRITES (and external/MCP/AdminAiChat consumers); admin pages
  themselves continue to read via lib helpers. Don't introduce
  tRPC useQuery for reads in admin pages — that creates a hybrid
  worse than either pure path. See "Path A locked" item #10 in the
  architectural decisions section.
- All 5 new capabilities go in packages/capabilities/src/admin/
  with requiresAdmin: true. Reuse fetchRichItems / fetchRichOutfits
  from wardrobe/itemShape.ts + outfit/outfitShape.ts (with userId
  param). The capability registry's requiresAdmin gate enforces
  authorization; defense-in-depth is fine.
- For admin.getActivity, query the events table directly (cursor
  pagination via `before` ISO string). Order desc by created_at.
- For admin.getUserChats, query chat_messages JOIN chat_conversations
  ON conversation_id WHERE user_id = $userId. Filter is_admin_chat = false
  (admin shouldn't see admin chats here — those go in 14c's admin
  chat list).
- For admin.getUserCosts, query generations table WHERE user_id = $userId,
  aggregate by operation, return total + breakdown + raw entries.
- /admin/users/[id] tabs:
    Wardrobe → admin.getUserWardrobe (renders item grid)
    Outfits → admin.getUserOutfits (renders outfit list with try-on
              status)
    Chat → admin.getUserChats (renders message bubbles + tool call
           summaries)
    Costs → admin.getUserCosts (renders summary card + breakdown
            table + usage log)
  Tab routing via ?tab= query param. Default 'wardrobe'.
- /admin/activity uses cursor pagination (`before=<iso>`). Load-more
  button at the bottom.
- /admin/chat is a 13-line wrapper around the AdminUserList from 14a;
  hrefBuilder = (userId) => `/admin/users/${userId}?tab=chat`.
- Pitfall #11/#12/#13/#14 still apply.
- Before commit: pnpm verify.
- Single commit (or split if natural break) → ASK before pushing.
- After push: WAIT for Luke to smoke-test on the Railway admin URL.

DNS does NOT cut yet.

Now: read PORT.md + the spec + the 3 legacy admin pages
(activity, chat, users/[uid]) + verify the event taxonomy gaps.
Then build capabilities first, pages second.
```

---

## 14c — session-start prompt

Copy this into a fresh Claude Code session at `/Users/lukegorski/tela`
AFTER 14b is shipped + smoke-tested:

```
You are building AdminAiChat (slide-out panel + /admin/ai page +
persistence + Anthropic backend + admin tool catalog) and cutting
DNS to admin.telastyle.app. Phase 14c of the admin parity workstream.

WORKING DIR: /Users/lukegorski/tela
LEGACY DIR: /Users/lukegorski/ale (READ-ONLY)
LEGACY ADMIN URL: https://admin.telastyle.app (visual reference)

FULL SPEC: docs/phase-14-admin-parity.md (read cover to cover)

══════════════════════════════════════════════════════════
WHAT 14c SHIPS:
══════════════════════════════════════════════════════════

SCHEMA MIGRATION 0014:
  ALTER TABLE chat_conversations ADD COLUMN is_admin_chat BOOLEAN NOT NULL DEFAULT FALSE;
  CREATE INDEX chat_conversations_is_admin_chat_idx ON chat_conversations(is_admin_chat) WHERE is_admin_chat = TRUE;

3 NEW ADMIN CAPABILITIES (all requiresAdmin: true):
  admin.streamChatTurn (generator) — like streamChatTurn but uses
    Anthropic, sets is_admin_chat=true, includes admin tools, passes
    currentRoute to system prompt
  admin.listAdminChats({ limit?, offset? }) — lists ALL admin chats
    (any admin sees any) sorted last_message_at desc; includes
    startedBy: { email, displayName }
  admin.getAdminChat({ conversationId }) — like chat.getConversation
    but reads any admin chat, includes startedBy

@TELA/AI EXTENSIONS:
  - Verify Anthropic provider's chatMultiStream is implemented.
    If not, add it (mirrors OpenAI implementation).
  - The provider selection is by model prefix (claude-* → Anthropic,
    gpt-* → OpenAI). Or add explicit provider param.

APPS/API SSE ENDPOINT:
  POST /admin/chat/stream → calls admin.streamChatTurn, gates on
  whoami.isAdmin === true. SSE event format mirrors /chat/stream.

APPS/ADMIN SURFACES:
  - <AdminAiPanel> slide-out (port from legacy AdminShell.tsx
    lines 208-237). 420px desktop right side, persists open/closed
    in localStorage["adminAiPanelOpen"], defaults open.
  - /admin/ai page renders <AdminAiChat variant="page" />.
  - <AdminAiChat> component (port from legacy AdminAiChat.tsx,
    444 lines). variant="panel" | "page". Conversation list sidebar
    (lists ALL admin chats per P6), main pane is current conversation
    with streaming.
  - ClaudeIcon SVG (orange #d97757) in AdminNav top-right toggles
    the panel. Port verbatim from legacy AdminShell lines 25-30.

CAPABILITY REGISTRY:
  Add `buildToolCatalog({ includeAdmin: true })` variant. Default
  filter (used by user /chat) excludes requiresAdmin. Admin variant
  includes them. Two callers (chat user vs admin) get different
  tool catalogs.

DNS CUT (last step):
  After all the above ships and smoke-tests pass, Luke cuts DNS:
  admin.telastyle.app CNAME → Railway admin service.

══════════════════════════════════════════════════════════
EXECUTION RULES:
══════════════════════════════════════════════════════════

- PATH A CONTINUITY (locked in 14a): admin pages continue to be
  RSC + DB-direct via lib helpers; only AdminAiChat surface itself
  is naturally CSR (it streams). Any new admin lib helpers import
  getSql / getDb from @tela/db. See architectural decisions item #10.
- Schema 0014: edit packages/db/src/schema/stubs.ts (chat tables
  live there) → db:generate → INSPECT SQL → db:migrate → rebuild.
- admin.streamChatTurn lives in packages/capabilities/src/admin/
  (separate file, not user chat dir). It's structurally similar to
  streamChatTurn but enough differs (Anthropic, admin tools,
  currentRoute, is_admin_chat flag) that copying + modifying is
  cleaner than parameterizing.
- Anthropic provider: use claude-sonnet-4 (matches legacy MODEL).
  Same multi-turn / tool dispatch / max depth 5.
- currentRoute: client passes the admin's current pathname
  (e.g., '/admin/users/abc') in the SSE request body. Server passes
  it to system prompt builder.
- is_admin_chat is set on conversation INSERT, never updated. New
  admin chats get true; new user chats get false (default).
- Conversation list (sidebar) shows team-shared admin chats. Each
  row shows: title (auto from first user message), startedBy avatar
  + name, last_message_at timeAgo. Click → load that conversation
  in main pane.
- Pitfall #11/#12/#13/#14 still apply.
- Before commit: pnpm verify (full chain — schema build, capabilities
  build, web typecheck, admin typecheck, no-residue scan).
- One coherent commit per phase (could split: 14c-schema +
  14c-frontend) → ASK before pushing.
- After push: WAIT for Luke to smoke-test on Railway URL. THEN
  manually cut DNS.

══════════════════════════════════════════════════════════
DNS CUT PROCEDURE (Luke does this manually after smoke):
══════════════════════════════════════════════════════════

1. Verify all admin pages render correctly on Railway URL
2. Verify AdminAiChat: panel opens, message streams, tool calls
   work, conversation persists, sidebar shows team chats
3. Update DNS: admin.telastyle.app CNAME → Railway admin service
   hostname
4. Wait for DNS propagation (5 min - 24 hours)
5. Verify admin.telastyle.app serves the new admin
6. Keep legacy admin alive on Vercel for 1 week as fallback
7. After 1 week: tear down legacy admin

POST-CUT FOLLOW-UP (separate small commits):
- Update PORT.md status table to mark Phase 14 complete
- Add reference commits 14a/14b/14c
- Update memory file with Phase 14 completion + the "admin lives at
  apps/admin separate service" architectural pattern
- Consider removing isAdmin from auth.whoami's apps/web consumers
  (apps/web doesn't need to know — only apps/admin does)

Now: read PORT.md + the spec + legacy AdminAiChat.tsx (444 lines)
+ legacy /api/admin/ai/chat/route.ts (354 lines, the persistence
+ tool dispatch reference). Then build the schema + capabilities
first, frontend second.
```
