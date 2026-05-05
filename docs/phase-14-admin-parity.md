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

## 5 decisions Luke must lock before 14a starts

1. **P1**: AdminAiChat — port dedicated surface (Option A, ~3-4 days more) OR reuse /chat with admin gating (Option B, ~0.5 days)?
2. **P2**: `/admin/stylist` — redirect to /admin/rules (Option A, recommended) OR landing page (Option B) OR drop URL entirely (Option C)?
3. **P3**: AI panel slide-out — port (only viable if P1=A) OR drop (recommended)?
4. **P4**: DNS cutover timing — end of 14a (cofounder gets partial admin) OR end of 14b (recommended, defer cut to full parity)?
5. **P5**: Activity event mapping — confirm mapping table is correct; OK to add `auth.onboarding_completed` to event taxonomy if needed?

Once locked, I'll write session-start prompts for 14a and 14b.
