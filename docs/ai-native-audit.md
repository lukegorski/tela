# Tela — AI-Native Readiness Audit (v2)

**Date:** 2026-05-19
**Auditor:** Claude (Opus 4.7, 1M context)
**Repo audited:** `/Users/lukegorski/tela` (the rebuild)
**Frame:** Diana Hu's two halves — (a) **queryability** (structured artifacts agents can read) and (b) **closed-loop systems** (agents see outcomes and feed them back).

Status vocabulary used throughout:
- **EXISTS / SOLID** — built and fit for purpose
- **EXISTS / FRAGILE** — built but with named concerns
- **PARTIAL** — ~X% built
- **MISSING** — confirmed absence after searching
- **UNKNOWN** — couldn't determine
- **UNVERIFIED** — claim made without evidence (avoided here; downgraded to UNKNOWN where it would apply)

Confidence in parentheses: `(high)`, `(medium)`, `(low)`.

---

## Section 0 — Repo Map

### Monorepo shape

pnpm@9.15.4 + Turbo 2.5 monorepo. Node ≥20. No root `README.md`.

Workspace globs (`pnpm-workspace.yaml`):
```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "tools/*"
```

Verify root scripts (`package.json:8-22`): `dev`, `build`, `typecheck`, `test`, `db:generate`, `db:migrate`, `db:push`, `prompts:sync`, and a custom `verify` chain that builds `@tela/db` → `@tela/capabilities` → typechecks `@tela/api` + `@tela/web` → runs `scripts/check-no-residue.sh`.

### Apps (4)

| App | Purpose | Key deps |
|---|---|---|
| `@tela/api` (`apps/api`) | Hono + tRPC server; exposes capability layer over HTTP | `hono`, `@hono/trpc-server`, `@trpc/server`, `pg-boss`, `@sentry/node`, `@supabase/supabase-js`, `postgres`, `pino`, `superjson`, `zod` |
| `@tela/mcp` (`apps/mcp`) | MCP server binary (`tela-mcp`); wraps capabilities for MCP clients | `@modelcontextprotocol/sdk` ^1.20.0, `@tela/capabilities`, `@tela/db`, `@tela/events` |
| `@tela/web` (`apps/web`) | Next.js 16.2.1 + React 19.2.4 (App Router); user-facing | `@supabase/ssr`, `@tanstack/react-query`, `@trpc/react-query`, `@googlemaps/js-api-loader`, Tailwind v4 |
| `@tela/workers` (`apps/workers`) | pg-boss worker process; runs queued jobs | `pg-boss`, `@sentry/node`, `pino`, `@tela/ai`, `@tela/capabilities`, `@tela/events`, `@tela/queue` |

### Packages (9)

| Package | Purpose | Notes |
|---|---|---|
| `@tela/ai` | OpenAI integration — the "AI gateway" | depends on `openai` ^4.85, `drizzle-orm`, `@tela/db`, `@tela/config`, `@tela/types` |
| `@tela/capabilities` | The capability layer (exposed via tRPC + MCP) | depends on supabase-js, sharp, drizzle, `@tela/ai`, `@tela/events`, `@tela/prompts`, `@tela/queue`. Devs include `firebase-admin` ^12.7 (migration tool) |
| `@tela/config` | Zod-validated config | thin |
| `@tela/db` | Drizzle ORM + migrations | `drizzle-orm` ^0.44, `postgres` ^3.4, `drizzle-kit` ^0.31 |
| `@tela/events` | Event bus | depends on `@tela/db` and `@tela/types` only |
| `@tela/prompts` | DB-backed prompts via gray-matter | `gray-matter`, `prompts:sync` script |
| `@tela/queue` | pg-boss wrapper | thin |
| `@tela/testing` | Eval harness w/ `tela-eval` CLI | `vitest`, `gray-matter`, `yaml` |
| `@tela/types` | Shared TS types | zero deps |

### Tools (2)

- `tools/prompt-admin` — directory (purpose TBD)
- `tools/scripts` — directory (purpose TBD)

Neither has a `package.json` — they are not workspace members in the pnpm sense.

### Activity (last ~30 days, last 50 commits)

Recent commits (`git log --oneline -50`):
- **Active workstream A — Phase 11 multi-user migration** from legacy Firestore. Heavy work on `migration` package, `auth linking`, `preCreateUser`, `try-on migration`, `chat history migration`.
- **Active workstream B — Visual port to Phase D.9** (chat backend, chat page, outfit.generate, lookbook).
- **Deploy plumbing** — Railway nixpacks config split (`nixpacks.web.toml`, `railway.web.json`), `/api/health`, OAuth callback fixes.
- **Phase 14 admin parity** — currently in planning; commit `d32941d` deleted `apps/web/src/app/(admin)/`. No `apps/admin` directory exists yet.

### Architectural intent (from `PORT.md` lines 14-49)

The new architecture exists to fix structural problems in the legacy app:
1. Firestore → Postgres
2. Ad-hoc Next.js API routes → **capability layer**
3. Inline OpenAI calls → **AI gateway** with prompt versioning, eval harness
4. Hardcoded prompts → DB-backed `prompts` table + `stylist_rules` + `annotated_examples`
5. Style DNA quiz → closet read from actual wardrobe
6. 12 hardcoded chat tools → **capability-as-tool auto-discovery**
7. Firebase-backed admin → proper admin tooling (rules editor, prompt versioning, cost dashboard)

This is *the* AI-native frame. The audit is essentially "how far along is each of these seven?"

### Stack verification vs. expected

Expected vs. observed:
- pnpm/Turborepo monorepo — **CONFIRMED** (`pnpm@9.15.4`, `turbo` ^2.5.0)
- Supabase/Postgres — **CONFIRMED** (`@supabase/supabase-js` in `api`, `web`, `capabilities`)
- Railway — **CONFIRMED** (`railway.json`, `railway.web.json`, `nixpacks.toml`)
- Hono — **CONFIRMED** (`@hono/node-server`, `hono` ^4.7 in api)
- tRPC — **CONFIRMED** (`@trpc/server` ^11.3, `@hono/trpc-server` ^0.3 in api)
- Custom AI gateway — likely `@tela/ai` (see Section 3 for verification)
- pg-boss — **CONFIRMED** (`pg-boss` ^11.1 in api, workers, queue)
- Doppler — **CONFIRMED** by `PORT.md:104-122` (env management; no `.env` files committed)
- Sentry — **CONFIRMED** (`@sentry/node` ^9.27 in api + workers)
- OpenTelemetry — **NOT FOUND in package.json deps**. Possibly via Sentry's OTel-compat layer or not yet wired. Verify in Section 6e.
- MCP-first capability layer — `@tela/mcp` exists; `@tela/capabilities` declared. See Section 3.

**No surprises beyond expected stack.** The expected `firebase-admin` dependency appears in `@tela/capabilities` devDependencies only (`packages/capabilities/package.json:30`), used by the migration tooling — not a runtime dependency on the new app.

### Architecture docs in repo

- `PORT.md` (root, 34KB) — visual port handoff document, includes no-residue rule
- `docs/migration-luke-one-shot.md` — Luke's pre-cutover migration plan
- `docs/phase-11-multi-user-migration.md` — Phase 11 spec
- `docs/phase-14-admin-parity.md` — Phase 14 admin plan (`apps/admin` not yet built)
- `docs/realtime-todo.md` — realtime backlog
- `docs/schema-gaps.md` — Firestore→Postgres field-gap audit
- `docs/secrets-runbook.md` — Doppler/secrets ops
- `docs/visual-port-plan.md` — per-screen visual port blueprints

No ADRs, no `architecture.md`. The mental model lives in `PORT.md` and the phase docs.

---

## Section 1 — Event coverage

**Status: EXISTS / SOLID for the core surface; PARTIAL ~70% across the declared taxonomy.** (high)

### Infrastructure

A real event system exists. Single durable store:

- Schema: `packages/db/src/schema/events.ts:4-23` — `events(id, user_id FK→users CASCADE, timestamp, type varchar(100), source varchar(20), context_snapshot jsonb, payload jsonb)` with 4 indexes: `user_id`, `timestamp`, `type`, composite `(user_id, type)`.
- Created in initial migration: `packages/db/drizzle/0000_even_multiple_man.sql` (`CREATE TABLE "events"`).
- Single write entry point: `packages/db/src/events/logEvent.ts:18-33` — append-only, never mutated.
- Typed taxonomy enforced at compile time: `packages/events/src/types.ts:6-80` defines a discriminated union of ~40 event types across 11 domains (wardrobe, profile, outfit, context, feedback, AI, chat, enhancement, tryon, auth).

### Declared vs. emitted (verified by `grep "type:\s*'<domain>\..*'"` across packages/apps)

| Domain | Declared | Emitted | Status |
|---|---|---|---|
| `wardrobe.*` | 7 | 5 (added, removed, viewed, closet_viewed, photo_uploaded) | PARTIAL — missing `item_updated`, `item_worn` |
| `profile.*` | 5 | 5 (closet_read_started, closet_read_completed, updated, viewed, dimensions_derived) | SOLID |
| `outfit.*` | 8 | 6 (generated, viewed, saved, unsaved, deleted, [worn_* missing]) | PARTIAL — missing `regenerated`, `worn_confirmed`, `worn_inferred` |
| `context.*` | 2 | 1 (occasion_updated) | PARTIAL — `context.assembled` declared, no emit |
| `feedback.*` | 4 | 3 (positive, negative, cleared via `setFeedback.ts:38-43`) | PARTIAL — `implicit_signal` declared, no emit |
| `ai.*` | 2 | **0** | MISSING — see "AI gateway uses a different store" below |
| `chat.*` | 5 | 4 (conversation_started, message_sent, message_received, tool_invoked) | PARTIAL — `conversation_summarized` declared, no emit |
| `enhancement.*` | 4 | 4 (started, completed, retry, failed) | SOLID |
| `tryon.*` | 4 | 3 (started, completed, failed) | PARTIAL — `step_completed` declared, no emit |
| `auth.*` | 2 | **0** | MISSING — see "Auth blind spot" below |

Net: **31 of ~40 event types fire**. Eight are dead declarations; one event (`feedback.*`) is fully wired despite "feedback domain (deferred)" comment in types.ts.

### Two important nuances

**AI gateway uses a different store, not events.** Every AI call writes to a dedicated `generations` table (FK to user, FK to prompt_version, with `input_snapshot jsonb`, `raw_output`, `parsed_output jsonb`, `latency_ms`, `cost_cents`) — see `packages/ai/src/gateway.ts:127-146` (single-turn), `gateway.ts:239-262` (multi-turn), `gateway.ts:348-362` (streaming), `gateway.ts:449-463` (image). The "non-negotiable provenance" comment at `gateway.ts:125` describes it well. So the `ai.generation_completed` / `ai.generation_failed` event types in the taxonomy are redundant with the existing `generations` table — likely planned but never wired because the table covers the use case. **Recommendation noted in Section 9b**: either remove from taxonomy or wire as a denormalization for cross-domain queries.

**Auth blind spot.** `apps/web/src/app/auth/callback/route.ts` exchanges OAuth code for session and redirects — no `logEvent({ type: 'auth.signed_in' })`. No `auth.signed_up` is emitted anywhere either. Signup-vs-signin distinction is only observable by `users.createdAt` vs. session existence after the fact. **This is the most consequential event gap** because it's the funnel start.

### Core user actions — coverage table

The audit prompt asks: for each meaningful user-facing action, is structured emission durable? I identified the following from `packages/capabilities/src/`:

| Action | Emits | Captured? | Evidence |
|---|---|---|---|
| Signup | (nothing) | **NO** — only `users.createdAt` | `apps/web/src/app/auth/callback/route.ts:24-31` |
| Sign-in (returning) | (nothing) | **NO** | same |
| Onboarding complete | `profile.updated` w/ payload `{reason: 'onboarding_complete'}` | YES (via payload) | `packages/capabilities/src/user/completeOnboarding.ts:100-105` |
| Language / locale chosen | (nothing seen yet) | UNKNOWN — verify in Section 2 | — |
| Add wardrobe item | `wardrobe.item_added` | YES | `addItem.ts:103` |
| Photo upload confirmed | `wardrobe.photo_uploaded` | YES | `confirmPhotoUpload.ts:72` |
| Remove wardrobe item | `wardrobe.item_removed` | YES | `removeItem.ts:87` |
| Outfit generated | `outfit.generated` | YES | `outfit/generate.ts:228` |
| Outfit viewed | `outfit.viewed` | YES | `outfit/getOutfit.ts:28` |
| Outfit saved/unsaved | `outfit.saved` / `outfit.unsaved` | YES | `saveOutfit.ts:36` |
| Outfit feedback (👍/👎) | `feedback.positive` / `feedback.negative` / `feedback.cleared` | YES | `setFeedback.ts:38-50` |
| Outfit deleted | `outfit.deleted` | YES | `deleteOutfit.ts:62` |
| Try-on requested | `tryon.started` → `tryon.completed`/`failed` | YES | `tryon/process.ts:92-262` |
| Enhancement | `enhancement.started/completed/retry/failed` | YES | `enhancement/process.ts:81-215` |
| Chat conversation start | `chat.conversation_started` | YES | `streamChatTurn.ts:201`, `sendMessage.ts:97` |
| Chat message sent | `chat.message_sent` | YES | `streamChatTurn.ts:242` |
| Chat tool invoked | `chat.tool_invoked` | YES | `streamChatTurn.ts:378` |
| Chat message received | `chat.message_received` | YES | `streamChatTurn.ts:474` |
| Profile viewed | `profile.viewed` | YES | `profile/get.ts:61` |
| Closet read (re-derivation) | `profile.closet_read_started/completed`, `profile.dimensions_derived` | YES | `closetRead.ts:92,211,223` |
| Outfit worn / abandonment / session return | (nothing) | **NO** — declared but unwired | `events/types.ts:32-34` |
| Abandonment (close before save) | (nothing) | **NO** | — |

### Schema stability of the events table

Searched all 14 generated migrations: only `0000_even_multiple_man.sql` touches the `events` table (creation). No subsequent ALTER on the events schema. **Schema has been stable** since the initial migration. (high)

### Honest summary

The product behavior of an authenticated, onboarded user doing the core loop — generating outfits, saving, dismissing via feedback, trying on, chatting — is **highly legible to an agent**. Roughly 19 of ~22 identified user actions emit structured events, all to one table with stable schema and four indexes that support the common query shapes (per-user, per-type, per-time).

The two gaps that matter:
1. **Funnel-edge events** (signup, sign-in, abandonment, returning-session) are not emitted. An agent cannot answer "who signed up today?" without falling back to `users.createdAt`.
2. **Implicit / observational signals** (`outfit.worn_inferred`, `feedback.implicit_signal`, `chat.conversation_summarized`) are declared but never wired — they are the substrate for "agent infers from behavior," and right now they are absent.

---

## Section 2 — Schema readiness for agent queries

**Status: EXISTS / FRAGILE for funnel/attribution queries; SOLID for product-state queries.** (high)

### Schema inventory (20 tables across 9 schema files)

From `packages/db/src/schema/index.ts:1-27`:

| Table | Source | Notes |
|---|---|---|
| `users` | `users.ts:57-108` | id, email, phone, auth_user_id (FK → Supabase Auth), display_name, avatar_url, locale, is_admin, onboarding_complete, preferences/body_info/location/try_on_settings (jsonb), created_at, updated_at. CHECK: email or phone required. |
| `closets` | `wardrobe.ts:14-23` | 1:1 with users (unique user_id), item_count, last_updated_at |
| `item_photos` | `wardrobe.ts:25-52` | photo + enhancement pipeline state |
| `closet_items` | `wardrobe.ts:54-105` | full item taxonomy: category, subcategory, primary_color, pattern, style, fit, length, sleeve_length, formality_score, material_weight, season_compatibility (jsonb[]), wear_count, last_worn_at, embedding (jsonb). 3 indexes (user_id, closet_id, category). |
| `style_profiles` | `profiles.ts:5-15` | versioned style DNA derived from closet read |
| `style_profile_versions` | `profiles.ts:17-29` | each closet-read produces a version with `reason` + `triggered_by` |
| `contexts` | `outfits.ts:15-26` | weather, time_of_day, season, occasion, calendar_context |
| `generations` | `outfits.ts:28-50` | AI provenance — operation, prompt_name, prompt_version_id, model, input_snapshot, raw_output, parsed_output, latency_ms, cost_cents. Indexes on user_id + operation. |
| `outfits` | `outfits.ts:52-80` | FK to generations + contexts, rationale, name, pairing_key, embedding, saved, saved_at, feedback (varchar 10), worn_at. Indexes on user_id, pairing_key. |
| `outfit_items` | `outfits.ts:82-91` | join: outfit_id ↔ closet_item_id, role |
| `events` | `events.ts:4-23` | structured event log (see Section 1) |
| `prompts` / `prompt_versions` | `prompts.ts` | versioned prompt store w/ template + variables + changelog |
| `annotated_examples` | `knowledge.ts:13-22` | curated outfit examples with reasoning + context + tags |
| `stylist_rules` | `knowledge.ts:24-33` | active rules by category, priority, version |
| `wardrobe_gaps` | `knowledge.ts:35-45` | user-stated gaps; resolved_at tracked |
| `chat_conversations` | `stubs.ts:12-29` | title, message_count, last_message_at |
| `chat_messages` | `stubs.ts:73-98` | role, content, tool_calls (jsonb[]), attachments (jsonb), generation_id |
| `try_on_jobs` | `stubs.ts:118-170` | full Fashn pipeline state machine |
| `translations` | `stubs.ts:173-179` | placeholder |
| `rate_limits` | `rateLimits.ts` | per-user daily counters |
| `migration_log`, `migration_failures` | `migration.ts` | Phase 11 migration ops |

### Views, materialized views, RPC functions

Grepped all 14 generated migrations and `manual_001_enable_rls.sql`:
- **Views: NONE.** No `CREATE VIEW` or `CREATE MATERIALIZED VIEW` statements.
- **RPC functions: 1** — `public.app_user_id()` at `manual_001_enable_rls.sql:31-39`, exists to resolve Supabase Auth's `auth.uid()` to `public.users.id`. Used by RLS policies only — not a "business question answerer."
- **No RPC layer exists for agent queries.** Agents need to either run raw SQL or call capabilities (Section 3).

### Representative-query feasibility

#### Q1: Signups in last 7 days, by language and traffic source

| Dimension | Status |
|---|---|
| Signup count | ✓ `SELECT count(*) FROM users WHERE created_at > now() - interval '7 days'` |
| **By language** | ✓ `users.locale varchar(10) NOT NULL DEFAULT 'en'` at `users.ts:71` |
| **By traffic source** | ✗ **NOT POSSIBLE WITHOUT SCHEMA CHANGES** — searched all schema files: no `traffic_source`, `referrer`, `referral_source`, or `utm_*` columns. (high) |

Verdict: **PARTIAL — language YES, traffic source needs schema column** plus capture at signup time (currently no place to write it).

#### Q2: Activation rate (signup → first outfit generated) by language, by week

| Step | Status |
|---|---|
| Signup time | ✓ `users.created_at` |
| First outfit time | ✓ `MIN(outfits.created_at) WHERE outfits.user_id = users.id` |
| Language | ✓ `users.locale` |
| Week bucket | ✓ `date_trunc('week', users.created_at)` |

Verdict: **SUPPORTED — REQUIRES JOINS BUT POSSIBLE** with a single LEFT JOIN to outfits + GROUP BY locale + week. No schema change needed. The events table also has `outfit.generated` if a richer signal is wanted.

#### Q3: Outfit saves vs. dismisses in last 30 days, by category

| Step | Status |
|---|---|
| Saves in last 30 days | ✓ `outfits` where `saved=true AND saved_at > now() - interval '30 days'`, or `events` where `type IN ('outfit.saved', 'outfit.unsaved')` |
| "Dismisses" | ⚠ **DEFINITIONALLY AMBIGUOUS** — choices are: `feedback='down'` (`outfit.setFeedback`), explicit `outfit.deleted`, or implicit non-save. Each is a different cohort. The schema permits all three; the audit can't resolve which is "the" dismiss without a product decision. |
| By category | ⚠ **REQUIRES JOIN + AGGREGATION CHOICE** — outfits don't have a `category` column. Must `JOIN outfits → outfit_items → closet_items` and pick an aggregation (dominant item by role, primary item by `outfit_items.role`, etc.). |

Verdict: **REQUIRES JOINS BUT POSSIBLE** once "dismiss" is defined and an outfit-category rollup is chosen. No schema changes strictly required.

#### Q4: Return rate of users who completed onboarding vs. those who didn't

| Step | Status |
|---|---|
| Onboarding complete | ✓ `users.onboarding_complete` boolean (`users.ts:83`) |
| "Return" — define as activity > 24h after signup | ⚠ No `sessions` table. Closest proxy: distinct day buckets in `events` per user, or any `outfits.created_at` > `users.created_at + 1 day`. |

Verdict: **REQUIRES JOINS BUT POSSIBLE** via events-as-session-proxy. The proxy is imperfect (no exact session boundary, no abandonment distinction), but workable for cohort comparison. **Schema improvement opportunity**: a `user_sessions` table or `auth.signed_in` event would make this clean.

#### Q5: Conversion rate by auth method

| Step | Status |
|---|---|
| Conversion (signup → first outfit, or signup → onboarding complete) | ✓ via Q2 / Q4 |
| **Auth method** | ✗ **NOT POSSIBLE WITHOUT SCHEMA CHANGES OR CROSS-SCHEMA JOIN** — `users.auth_user_id` (`users.ts:67`) FKs to Supabase Auth's `auth.users`, where `raw_app_meta_data.provider` lives. Reading that cross-schema requires either a join over to `auth.users` (which RLS allows but Supabase considers private) or a copy of `provider` onto `public.users` at signup. |

Verdict: **NOT POSSIBLE WITHOUT SCHEMA CHANGES.** Recommend `public.users.auth_provider varchar(32)` column populated at first sign-in (`google` / `magic_link` / `apple` / etc.), or a SECURITY DEFINER view exposing `auth.users.raw_app_meta_data->>'provider'`.

### Summary of dimensions agents would need that are not captured

| Missing dimension | Where it would naturally live | Why it matters |
|---|---|---|
| Traffic source / referrer | `users` row + signup capture | Funnel attribution (Q1) |
| UTM tags | `users` row | Campaign attribution (Section 6a) |
| Auth provider | `users` row (denormed from `auth.users`) | Auth-method conversion (Q5) |
| Session boundaries | new `user_sessions` table OR `auth.signed_in` events | Return-rate, retention (Q4) |
| Feature flag / variant ID per outfit | `generations` row (currently has none) | A/B test attribution (Section 6a) |
| Abandonment signals | `events` with `chat.abandoned`, `outfit.skipped_implicit` | Negative-signal queryability |

### Schema head-starts that are already useful

- `events` table with 4 indexes — covers the queryability foundation
- `generations` table — every AI call is queryable by `operation`, `prompt_name`, `prompt_version_id`, `model`, `cost_cents`, `latency_ms`
- `style_profile_versions` — every closet-read derivation has `reason` + `triggered_by` (a *decision-like* artifact, though not a generalized decision ledger — see Section 6b)
- `prompts` + `prompt_versions` — first-class prompt versioning is in place; an agent can query "what did we ship when?" against this
- `wardrobe_gaps` — first-class "user-stated need" table, queryable by `category`, `resolved_at`
- `users.is_admin` — admin gate column already exists, no need to retrofit

### Honest summary

The schema is **strong for queries about what users have done in-product** and **weak for queries about how users got here, why a given variant was shown, and which auth method they chose**. The product-state half (queryability of generated outfits, prompts, AI cost) is well above MVP-quality. The funnel/attribution half is essentially absent and is the schema work the AI-native push will hit first.

---

## Section 3 — MCP server inventory

**Status:** Product-facing MCP **EXISTS / FRAGILE**. Company-facing "Tela context" MCP **MISSING**. (high)

### Servers found

**One MCP server in the repo**, at `apps/mcp/src/index.ts`. No other directories matching `*-mcp` or `mcp-*` exist. (high)

| Property | Value | Evidence |
|---|---|---|
| Name | `tela` | `apps/mcp/src/index.ts:100` |
| Version | `0.1.0` | `apps/mcp/src/index.ts:101` |
| Transport | stdio (Claude Desktop integration) | `apps/mcp/src/index.ts:158` |
| SDK | `@modelcontextprotocol/sdk` ^1.20.0 | `apps/mcp/package.json:21` |
| Bin entry | `tela-mcp` | `apps/mcp/package.json:8-10` |
| Capability source | `getAllCapabilities()` filtered through `READ_ONLY_TOOLS` set | `apps/mcp/src/index.ts:35-46` |
| Authoring intent | "READ-ONLY subset … Mutations are intentionally excluded for now — runs locally on a developer's machine without any auth" | `apps/mcp/src/index.ts:5-7` |

### Tools exposed (6)

From `apps/mcp/src/index.ts:35-42`:
```ts
const READ_ONLY_TOOLS = new Set([
  'wardrobe.getItem',
  'wardrobe.listItems',
  'profile.get',
  'outfit.get',
  'outfit.list',
  'capability.list',
]);
```

The set transforms capability names via `.replace(/\./g, '_')` when sending to MCP (`index.ts:55`) — so tools surface as `wardrobe_getItem` etc.

### Consumers

- Intended: Claude Desktop config at `apps/mcp/src/index.ts:9-17`. The doc comment shows a `claude_desktop_config.json` snippet.
- Found in repo: no `claude_desktop_config.json` is committed; this is a per-developer config. (high)
- Other consumers (workers, internal scripts, other apps): grep across the repo for `tela-mcp` and `@tela/mcp` shows references only in package.json, the MCP source itself, and prose in `docs/`. **No code consumes the MCP server programmatically.** (high)

### Classification

- **Product-facing** (used to serve users / generate outfits): the 6 exposed tools all read a single user's wardrobe / profile / outfits. So this MCP server is product-facing in *content*, but its caller is the developer (via Claude Desktop), not the runtime product. It is a **developer-experience MCP**, not a customer-facing MCP. Calls to outfit generation, chat, or any mutation are *not* available through it.
- **Company-facing** (used by internal agents to read business state): **MISSING.** No MCP exposure of admin capabilities (cost dashboard, user list, prompt versions, rules).

### Capability registry — what could be exposed but isn't

Counted via `grep "registerCapability\(" packages/capabilities/src/`: **45 registered capabilities** across 11 domains (verified by enumerating each name; numbers in parens = capability count):

- `wardrobe` (6): addItem, removeItem, getItem, listItems, requestPhotoUpload, confirmPhotoUpload
- `outfit` (6): generate, get, list, delete, save, setFeedback
- `enhancement` (3): process, retry, getStatus
- `tryon` (3): generate, process, getStatus
- `chat` (3): sendMessage, getConversation, listConversations (+ `streamChatTurn` SSE helper)
- `profile` (2): get, closetRead
- `user` (4): completeOnboarding, updateLocation, updateTryOnSettings, getWardrobeGaps
- `item` (1): analyze
- `context` (1): assemble
- `auth` (1): whoami
- **`admin` (15)**: listUsers, getUserDetail, getCosts, getDashboardStats, listRules / createRule / updateRule / deleteRule, listExamples / createExample / updateExample / deleteExample, listPrompts / getPromptHistory / createPromptVersion / rollbackPrompt

The MCP server exposes **6/45 capabilities** = ~13% coverage. The 15 admin capabilities — exactly the surface a company-facing MCP would proxy — are not exposed via MCP. They *are* available via tRPC (`apps/api/src/trpc/router.ts:70-85` auto-builds a domain router from every registered capability) and would require a service-account token to call (Section 4).

### "Does an internal Tela context MCP server exist?"

**No** (high). Evidence:
- Only one MCP server in the repo, exposing a curated 6-tool product-facing slice with a "no auth, mutations excluded" model.
- Searched for `mcp/*`, `*mcp*` patterns in `apps/`, `tools/`, `scripts/` — no other MCP entry points.
- Searched docs for "admin MCP", "context MCP", "company MCP", "internal MCP" — none.

What close-to-it exists:
- `admin.getDashboardStats` capability → likely the closest analog to "give me business state in one call." Located at `packages/capabilities/src/admin/getDashboardStats.ts`. Not yet wrapped in MCP.
- `admin.listUsers`, `admin.getUserDetail`, `admin.getCosts` capabilities are also business-state readers.
- The capability registry's `requiresAdmin` flag + the service-account auth path already provide the **gate** an internal MCP would need.

The architectural pattern to add a company-facing MCP server is straightforward given what's in the repo: add `apps/admin-mcp` (or extend `apps/mcp` with an admin token mode), import the same capability registry, and pre-filter by `cap.requiresAdmin || cap.name.startsWith('admin.')`. Estimate noted in Section 9c.

### Status

- Product-facing MCP server: **EXISTS / FRAGILE** (high). Reasons: (a) intentionally read-only with mutations excluded — limits what an agent can do; (b) the embedded `zodToJsonSchema` converter at `index.ts:63-94` is hand-rolled and doesn't cover every Zod shape (the comment at line 62 says so explicitly) — fine for current 6 tools, likely to break as tools are added; (c) no auth (relies on local-only deployment).
- Company-facing "Tela context" MCP server: **MISSING** (high).

---

## Section 4 — Auth and authorization for internal agents

**Status: EXISTS / FRAGILE for internal-agent use.** (high)

### RLS on Supabase tables

RLS is **enabled** on every user-scoped table — `users`, `closets`, `closet_items`, `item_photos`, `style_profiles`, `style_profile_versions`, `contexts`, `generations`, `outfits`, `outfit_items` (joined to parent), `events`, `wardrobe_gaps`, `chat_conversations`, `chat_messages` (joined to parent), `try_on_jobs`, `translations`. Evidence: `packages/db/drizzle/manual_001_enable_rls.sql:43-119`.

**Scoping:** every policy is `FOR SELECT USING (user_id = public.app_user_id())`. The `app_user_id()` helper at `manual_001_enable_rls.sql:31-39` resolves Supabase Auth's `auth.uid()` JWT claim to the canonical `public.users.id` via the `auth_user_id` column. Function is `STABLE SECURITY DEFINER`.

**Write policies: none.** The migration comments at lines 17-18, 146-151 are explicit:
> "We do NOT add INSERT/UPDATE/DELETE policies here. All writes go through server-side capabilities, which use the service role key and bypass RLS."

**Globally-shared tables** (`prompts`, `prompt_versions`, `stylist_rules`, `annotated_examples`) have permissive `FOR SELECT TO authenticated USING (true)` — any signed-in user can read.

**Admin-only tables** (`rate_limits`) have RLS enabled with **no policy** — service role only.

### Service-account / privileged caller path

A first-class service-account token path exists. Evidence: `apps/api/src/auth.ts:127-179`.

- **Token format**: `service_<source>:<userId>:<secret>`
- **Allowed sources**: `mcp`, `worker`, `admin`, `test` (`auth.ts:161`)
- **Secret**: a single shared `SERVICE_ACCOUNT_SECRET` env var (`auth.ts:140`)
- **Returns a `RequestContext`** with `isServiceAccount: true` and `isAdmin: true` (`auth.ts:169-178`). Comment at lines 173-178: *"Service-account contexts are trusted at the auth layer … they bypass the admin gate."*

What this means in practice:
- A caller with the secret can construct a token specifying any `userId` and run any capability as that user with admin privileges.
- Writes go via the capability layer (which uses `SUPABASE_SECRET_KEY` server-side, bypassing RLS).
- Reads through capabilities are not constrained by RLS either, because the API server uses the service role for DB access.

### Admin app auth

`apps/admin` does not exist yet (Section 5). Admin auth is currently implemented in two places:

1. **At the capability layer** — `requiresAdmin: true` flag in the registry. Gate is enforced at `packages/capabilities/src/registry.ts:61-66`:
   ```ts
   if (requiresAdmin) {
     const ctx = tryGetRequestContext();
     if (ctx && !ctx.isAdmin) throw new AdminRequiredError(...);
   }
   ```
2. **At the auth layer** — `users.is_admin boolean NOT NULL DEFAULT false` on every user record (`users.ts:80`). Set true for Luke + cofounder + operators. Service accounts are *implicitly* admin (`auth.ts:177`).

The legacy admin's `NEXT_PUBLIC_ADMIN_UID` env-var coupling is gone; the new model is multi-admin and DB-driven. (See `docs/phase-14-admin-parity.md:78-81` for the rationale.)

### Could an internal agent service cleanly be granted read access?

**Yes, with the current setup**, but with named concerns:

1. **It works without impersonation in spirit** — an internal agent can mint a `service_admin:<adminUserId>:<secret>` token and call admin capabilities that don't filter by `request.userId` (e.g., `admin.listUsers`, `admin.getCosts`, `admin.getDashboardStats`). The userId in the token is essentially a logger identity for that path, not a data scoper. (high)
2. **But it requires picking a userId** — there's no first-class "principal: agent" type. The token format hardcodes a `<userId>` segment, and `RequestContext.userId` is non-optional (`requestContext.ts:20`). For event logging via `logEvent({ userId, ... })`, the agent would either pick a synthetic system-user, or log against the admin user it impersonates. **Today there is no system-user concept.** (high)
3. **One shared secret across all service callers.** `SERVICE_ACCOUNT_SECRET` is a single string — no per-caller key, no per-caller audit, no revocation granularity. Rotating it invalidates every MCP/worker/script at once. (high)
4. **No write scoping for service accounts.** A service-account context is treated as admin everywhere; there's no notion of "this caller can read but not write." The capability registry has no read/write classification — it has `requiresAdmin` and (separately) `chatTool`. (high)

### What would need to change to harden this

For a cleanly granted, agent-distinct, audit-friendly read access:

| Need | Current state | Change required |
|---|---|---|
| Distinct agent principal | Token format requires a userId | Either (a) introduce a system-user (synthetic UUID, `is_admin=true`, `display_name='Tela Internal Agent'`), or (b) make the userId optional and have RequestContext support `kind: 'user' \| 'agent'` |
| Per-caller token | Shared secret | Per-token records in a new `service_tokens` table with hash + label + `revoked_at` + `scopes` |
| Read-only scoping | None | A `scopes: ('read' \| 'write')[]` field on the token record; capability registry checks `cap.kind ∈ ctx.scopes` |
| Per-caller audit | Logs include `source: 'mcp' \| 'worker' \| 'admin' \| 'test'` but not which token | Token id in logs + events table extension |

### Status

- **RLS posture**: SOLID for client-side reads (selectively, per user). (high)
- **Service-account path**: EXISTS / FRAGILE — works for the current single-developer + a few workers, **not designed for a population of internal agents with distinct identities and revocable creds**. (high)
- **Admin gate**: SOLID architecturally (registry + DB flag + tRPC mapping). (high)

---

## Section 5 — Admin app surface

**Status: MISSING (high) — apps/admin does not exist. Backend ready, frontend deferred to Phase 14.**

### Existence

`ls apps/` returns only `api`, `mcp`, `web`, `workers`. **No `apps/admin`** directory. (high) `tools/prompt-admin` and `tools/scripts` are present but empty — no files in either. (high)

### Routes that exist today

`apps/web/src/app/`:
- `(main)/[lang]/{onboarding, wardrobe, chat, outfits, outfits/[id], lookbook, settings/{location, language, try-on, theme}}` — user-facing
- `auth/{callback, magic-callback, sign-out}` — auth flow
- `api/health` — health probe

**Zero `/admin` routes in `apps/web`.** Deletion verified: commit `d32941d` (2026-05-04) removed `apps/web/src/app/(admin)/admin/*` (13 pages), 3 admin form components, 6 admin lib helpers. Commit message at `git show d32941d` documents the intent: *"Admin functionality must NOT live at telastyle.app/admin. Per the Phase 14 plan, the new admin will live at admin.telastyle.app via a separate apps/admin Next service."*

So the production status today:
- `telastyle.app/admin` → **404** (recently)
- `admin.telastyle.app` → **legacy admin** (still served by separate legacy Vercel project — see `~/.claude/projects/.../memory/rule_never_touch_production_infra.md` and `docs/phase-14-admin-parity.md:6-10`)

### What's available right now to build admin on

| Asset | Status | Evidence |
|---|---|---|
| 15 admin capabilities | EXISTS / SOLID | `packages/capabilities/src/admin/` lists 17 files (15 capabilities + index + helpers) |
| Admin gate (`requiresAdmin`) | EXISTS / SOLID | `registry.ts:61-66` |
| `users.is_admin` column | EXISTS / SOLID | `users.ts:80`, migration 0007 |
| Web hook that returns `isAdmin` | EXISTS | `apps/web/src/hooks/useAuth.ts:78,140,154` (via `auth.whoami` capability) |
| Admin auth helper in web (residual) | EXISTS | `apps/web/src/lib/admin.ts:27` checks `appUser.isAdmin` |
| Recoverable admin pages | EXISTS in git history at `fd4b451` | 13 pages + 3 components + 6 lib helpers |
| Phase 14 plan | EXISTS / SOLID | `docs/phase-14-admin-parity.md` is 1048 lines with all 6 architectural decisions LOCKED |

### Auth gating today vs. legacy

- Legacy admin: `NEXT_PUBLIC_ADMIN_UID` env var hard-coded one admin.
- New model: `users.is_admin` boolean → capability registry `requiresAdmin` → tRPC FORBIDDEN. Multi-admin, DB-driven. (high)

### Could a chat / agent interface be added without architectural rework?

**Yes — minimal addition is straightforward**, with three viable options:

1. **Inside the (future) apps/admin app, as a route.** Phase 14 P1 decision was *locked at Option A* (port the legacy AdminAiChat surface as a dedicated `/admin/ai` page + slide-out panel) per `docs/phase-14-admin-parity.md:391-399`. Implementation re-uses the existing chat infrastructure: capability registry already auto-discovers tools; the only change is filter logic — when `whoami.isAdmin === true`, include `requiresAdmin` tools in the chat tool catalog.
2. **As an extension to apps/mcp.** Add an `--admin` flag that flips `READ_ONLY_TOOLS` to include admin capabilities. Trivially small change; runs in Claude Desktop.
3. **As a new `apps/admin-mcp`.** Same pattern as `apps/mcp` but pre-filtered to `admin.*` capabilities; uses service-account token with `source=admin`. ~half-day.

What would block making it useful for an agent today:
- No `apps/admin` yet (Phase 14 is the gating workstream — 3-4 days for 14a + 4-5 days for 14b per the plan estimate at `phase-14-admin-parity.md:382-388`).
- No web UI for an agent chat surface on the company side (paths 1 and 3 above require apps/admin or a CLI client).
- For a Slack/Discord agent surface: no integration exists; would need new wiring (Section 7).

### Status

- Admin app: **MISSING** (high). Pure absence — the directory doesn't exist; the routes don't exist; the deploy doesn't exist. (Frontend gap, not backend.)
- Admin chat/agent UI: **MISSING** (high), with a locked plan.
- Backend substrate for admin: **EXISTS / SOLID** — capabilities, gate, schema, plan all ready.

---

## Section 6 — Closed-loop infrastructure

**Overall status: PARTIAL ~30% — strong on AI-side provenance, missing on attribution and decision ledger.** (high)

This section gets each subsection the depth requested in the brief.

### 6a. Attribution

**Status: MISSING (high).**

Searched the entire repo for: `utm_*`, `referrer`, `referral_source`, `campaign_id`, `feature_flag`, `featureFlag`, `ab_test`, `abTest`, `variant_id`, `variantId`, `posthog`, `growthbook`, `launchdarkly`, `amplitude`, `mixpanel`, `gtm`, `google.?analytics`. **Only matches are in this audit document itself.** (high)

Specific findings:

| Capability | Status | Evidence |
|---|---|---|
| UTM parameter parsing on landing | MISSING | No `searchParams.get('utm_*')` callsites in `apps/web/src/app/`. (high) |
| UTM persistence to user record | MISSING | `users` schema has no `utm_*` columns. (high) |
| Referrer / referral source capture | MISSING | No `document.referrer` reads in `apps/web/src/`. No `referral_source` column on `users`. (high) |
| Feature flag system | MISSING | No library installed (verified via package.json checks); no flag table; no `getFeatureFlag()` callsites. (high) |
| A/B test infrastructure | MISSING | No experiment tables, no variant assignment logic. (high) |
| Campaign ID / variant ID on events | MISSING | `events.payload jsonb` is freeform so it *could* carry one, but no emitter populates it. (high) |
| Campaign tracking on generations | MISSING | `generations` schema (`outfits.ts:28-50`) tracks `prompt_version_id` — but no `campaign_id`, no `feature_flag_assignments`. (high) |

The closest thing to an "intervention identifier" today is `generations.prompt_version_id` — every AI output is tied to a specific versioned prompt. That ties **prompt-version interventions** (a real form of attribution) to downstream events. Nothing else.

### 6b. Decision ledger

**Status: PARTIAL ~15% — one narrow audit log; no general decision ledger. (high)**

Searched for: `audit_log`, `decision_log`, `change_log`, `experiment`. No tables match. (high)

What *does* exist that is decision-adjacent:

- `prompts` + `prompt_versions` (`prompts.ts`) — every prompt change creates a version row with `template`, `variables`, `changelog: text` (an explanatory field). Plus `prompts.latestVersionId` for "current". This is a **decision ledger for prompt changes**, scoped to that one domain. Quoted column: `changelog text` at `prompts.ts:19`.
- `style_profile_versions` (`profiles.ts:17-29`) — every closet-read derivation produces a new version with `reason varchar(500)` + `triggered_by varchar(255)`. This is a **decision ledger for style-profile changes**, scoped to that one domain.
- `stylist_rules` has a `version` column (`knowledge.ts:30`) but no separate version table — only the *current* rule body is preserved; prior versions can't be recovered from this schema alone. (high)
- `migration_log` + `migration_failures` (`migration.ts`) — Phase 11 migration ops; not a generalized ledger.
- `events` table can carry decision artifacts in `payload jsonb`, but no emitter currently writes "decision" payloads.

What is missing for a general decision ledger that AI agents could write to / read from:
- A `decisions` table (decision_id, made_by_kind ∈ {user, agent, automated}, made_by_id, decision_type, rationale, expected_outcome, linked_outcome_id, made_at)
- Or: extending the `events` taxonomy with `decision.*` types backed by a structured `payload` schema

The two narrow ledgers that exist are well-built; the generalized layer is **not** present.

### 6c. Feedback storage and linkability

**Status: EXISTS / SOLID for prompt-attributable feedback; PARTIAL for everything else. (high)**

Feedback signals captured:

| Signal | Storage | Link to intervention? |
|---|---|---|
| 👍/👎 on outfit | `outfits.feedback varchar(10)` + `feedback.positive`/`negative`/`cleared` events | ✓ YES — `outfit.generation_id → generations.prompt_version_id`. Strong chain. |
| Save | `outfits.saved boolean`, `saved_at timestamp`, `outfit.saved` event | ✓ YES — same chain via generation_id |
| Unsave | `outfit.unsaved` event (no separate column) | ✓ YES — same chain |
| Delete | `outfit.deleted` event (row destroyed) | ✓ YES — fires *before* row is deleted; payload contains outfitId |
| Tried on | `try_on_jobs` table + `tryon.*` events | ⚠ PARTIAL — `try_on_jobs.outfit_id` links to outfit; ultimately back to generation_id. But "tried on" is an effort signal, not a satisfaction signal. |
| Worn (declared, unwired) | `outfits.worn_at timestamp` | MISSING — declared in events taxonomy as `worn_confirmed`/`worn_inferred`, never emitted (Section 1). |
| Implicit abandonment | none | MISSING — no event fires when a user generates an outfit and closes the tab without saving/feedback. |
| Chat satisfaction | none directly | MISSING — `chat_messages` stores assistant outputs + tool calls; no thumbs / "this was helpful" signal exists. |

**The good news:** every outfit row has `generation_id` (`outfits.ts:59-61`), and every generation has `prompt_version_id` (`outfits.ts:37`). So `outfit.feedback`, `outfit.saved`, `outfit.deleted` are **trivially linkable** back to "which version of the prompt produced this." That's a closed-loop substrate already in place for the AI-side intervention class.

**The gap:** there's no foreign key on `outfits` (or anywhere) to a *non-AI intervention* like a UI change, a feature flag, or a campaign. To close those loops, you'd need a `outfits.intervention_context_id` column (or equivalent on events) that an intervention-assignment service writes when the outfit is generated.

### 6d. Outcome latency

**Per flow, with current instrumentation only.**

| Flow | Shortest measurable cycle | Why |
|---|---|---|
| Signup conversion (visit → signup) | **NEVER** | No referrer / UTM / source capture at landing; no event marks the visit. Even after schema additions, would require client-side analytics. |
| Auth: signin → engagement | Hours | No `auth.signed_in` event; closest proxy is `users.updated_at` or first event by that user — both are noisy. |
| Onboarding completion | Seconds-to-minutes (after onboarding submit) | `profile.updated` event with `payload.reason='onboarding_complete'`; plus `users.onboarding_complete` flag. (Section 1.) |
| **Outfit-generation acceptance** | **Seconds-to-minutes** | `outfit.generated` → `outfit.saved` / `feedback.positive` / `feedback.negative` events all exist, all timestamped, all linked back to `generation_id` → `prompt_version_id`. **This is the cleanest existing closed loop.** |
| Outfit "wear" cycle | Days, BUT NOT MEASURABLE | `outfits.worn_at` exists but no event populates it; capability never sets it. (high) |
| Try-on engagement | Minutes | `tryon.started` → `tryon.completed/failed` events; `try_on_jobs.outfit_id` links to outfit. |
| Chat helpfulness | Never directly | No satisfaction signal on chat messages. Indirect proxy: did the user save an outfit produced by an `outfit.generate` tool-call invocation in the same conversation? (Possible via `outfits.generation_id` ↔ `chat_messages.generation_id`, but no aggregator exists.) |
| Retention (return rate) | Days | Events table can act as session proxy (Section 2 Q4); no native sessions table. |

**Recommended first closed loop**: the prompt-version → outfit-feedback cycle. Everything needed is already in the schema and emitted. An admin agent can answer "did prompt version X improve thumbs-up rate over Y?" against `outfits`, `generations`, and the `feedback.*` events with no schema or event changes.

### 6e. Instrumentation depth (Sentry + OTel)

**Status: EXISTS / FRAGILE for outcome attribution. (high)**

#### Sentry

Wired up in two places:
- `apps/api/src/sentry.ts:8-23` — `Sentry.init({ dsn, environment, tracesSampleRate: prod=0.1 / dev=1.0 })`. Safe when `SENTRY_DSN` not set.
- `apps/api/src/index.ts:52-58` — capability error hook: every capability failure goes through Sentry with `scope.setUser({ id: userId })`, `scope.setTag('capability', capabilityName)`, `scope.setTag('source', source)`, `scope.setTag('requestId', requestId)`. Same pattern in `apps/api/src/worker.ts:45-89` (in-process worker) and `apps/workers/src/index.ts:39-47` (dedicated worker app).

The capability-execution observability layer (`packages/capabilities/src/observability.ts` — not read, but inferred from `setObservabilityHooks` callsites) exposes `onStart` / `onComplete` / `onError` hooks. Today **only the error hook calls Sentry**. The success hook just emits pino logs.

So Sentry is **business-context-aware** (every captured exception is tagged with user, capability, source, request ID) but **error-only** — there are no business-event spans or success-path traces.

#### OpenTelemetry

`apps/api/src/otel.ts:12-20`:
```ts
export function initOtel() {
  // TODO: Add OTel SDK initialization once export target is selected.
  // Will use @opentelemetry/sdk-node with:
  // - HttpInstrumentation for request tracing
  // - Custom spans for capability execution and AI gateway calls
  // - Export to selected backend (Highlight/Axiom/Honeycomb)
  logger.info('OpenTelemetry stub initialized (no export target configured)');
}
```

**STUB.** No SDK installed (no `@opentelemetry/*` in any `package.json`), no spans, no exporter. The startup log line at runtime is misleading — nothing is initialized. (high)

#### Could existing instrumentation be a substrate for outcome attribution?

**Yes — with extensions, not parallel infra.** The capability observability hook system at `setObservabilityHooks` is the natural place. Adding:
- success-path span emission with `outcome` field (`accepted`/`dismissed`/`error`)
- propagation of `generation_id`, `intervention_context_id` (once it exists)
- a non-Sentry exporter (OTel target, or a `capability_traces` table)

…would turn the current error-only instrumentation into a true outcome layer without rewriting anything. **Estimate noted in Section 9c.**

---

## Section 7 — Growth and campaign tooling

**Status: MISSING (high) — almost nothing exists.**

### Analytics

- **Server-side:** the `events` table + `logEvent` system is the only analytics. There is no PostHog, Mixpanel, Amplitude, GA, GTM, Heap, or comparable tool wired up. (high)
- **Client-side:** searched `apps/web/src/` for `track`, `analytics`, `posthog`, `mixpanel`, `amplitude` → no real matches (only Tailwind `tracking-widest` font utility classes, false positive). (high)
- **Note in port plan**: `docs/visual-port-plan.md:1078` references `event.log` capability as the replacement for legacy `/api/activity/log`, marked **deferred** — *"client-side activity logging is deferred"*. So today, only server-emitted events from inside capabilities are durable. Client-side actions that don't reach a capability call (e.g., "hovered the upsell modal") are not captured. (high)

### Email infrastructure

- **No transactional email library in the new app.** No `resend`, `@react-email`, `sendgrid`, `postmark`, `mailgun`, or `nodemailer` in any of the 13 `package.json` files. (high)
- **Doppler/secrets-runbook** (`docs/secrets-runbook.md:18-29`) does NOT list `RESEND_API_KEY` as an active secret. Only `DATABASE_URL`, `SUPABASE_*`, `OPENAI_API_KEY`, `SENTRY_DSN`, `SERVICE_ACCOUNT_SECRET`, `OPENWEATHERMAP_API_KEY`, runtime config. (high)
- **Planned but not built**: `docs/visual-port-plan.md` describes an `auth.welcomeEmail` capability replacing the legacy `/api/auth/welcome-email` route, gated on `RESEND_API_KEY` being copied over. Status today: not built. *"Without it, no welcome email on signup."*
- Marketing email / newsletter: nothing.

### Attribution at landing

- Landing page is the login surface: `apps/web/src/app/(main)/[lang]/page.tsx` (411 lines). Reviewed top 50 lines: 5-image hero carousel + 3 sign-in buttons (Google, WhatsApp [coming soon], Email).
- **No UTM parsing, no referrer capture, no analytics fire-on-mount.** No `searchParams.get('utm_*')`, no `document.referrer` reads. (high)
- **No persisted attribution on user records.** `users` schema has no `traffic_source`, `referral_source`, `utm_*`, `signup_source` columns. (high)

### Landing page infrastructure

- Landing page lives inside the same Next.js app as the rest of the product (`apps/web`). It is not a separately-deployed marketing site, not behind a CMS, and not coupled to a different repo. (high)
- One Next.js deploy on Railway (per `railway.web.json` and `nixpacks.web.toml`) serves both the marketing surface and the authed product surface, gated client-side by auth state.

### Campaign / copy management

- No campaign tool. No CMS. No copy-management system.
- Static dictionaries for i18n exist under `apps/web/src/dictionaries/*.json` (referenced in `phase-14-admin-parity.md:296`), checked into git. UI copy changes require a code commit + deploy.
- Prompt copy (LLM templates) — versioned in DB (`prompts` + `prompt_versions`), edited via the planned admin app. This is the *only* CMS-like surface in the system today.

### Status summary

| Capability | Status | Confidence |
|---|---|---|
| Server-side event analytics | EXISTS / SOLID (the events table) | high |
| Client-side analytics | MISSING | high |
| Transactional email | MISSING | high |
| Marketing email | MISSING | high |
| UTM/attribution capture | MISSING | high |
| Persisted attribution on users | MISSING | high |
| Standalone landing/marketing site | MISSING (coupled to main app) | high |
| CMS for marketing copy | MISSING | high |
| Prompt versioning (one CMS-like surface) | EXISTS / SOLID (no UI yet — Phase 14) | high |

This is the **least-built area in the whole repo**. The system is well-developed on the side of capturing what users do inside the product; it is essentially blank on the side of how they arrive, how we talk to them, and how we attribute their behavior to anything we did.

---

## Section 8 — Blind spots and limits of this audit

A senior engineer always names what they didn't see. This section is mandatory and intentionally generous; downgrading items here to "actually I'm sure" without re-verifying would be exactly the overconfidence the audit warns against.

### Files / areas not read but probably should be

| Area | Why skipped | Why it might matter |
|---|---|---|
| `packages/capabilities/src/observability.ts` | Inferred shape from callsites in `apps/api/src/index.ts:30-60`; never opened the file directly | Section 6e claims the hook system could be a substrate for outcome attribution. If the hook signature doesn't carry the right context, that claim is weaker. |
| `packages/queue/src/*` + `apps/workers/src/index.ts` job inventory | Only read one enhancement-job site | If there's a worker that already logs decision-like data, Section 6b is less bare than reported. |
| `packages/ai/src/providers/openai.ts` and `fashn.ts` provider implementations | Read `gateway.ts` (the layer that uses them); skipped the underlying provider code | The "every call has provenance" claim hinges on what the providers actually return; verified at the gateway layer only. |
| `apps/api/src/chatStream.ts` (SSE endpoint) | Saw the mount call, did not read | Streaming chat is part of how chat events are emitted; depth-of-emission claim in Section 1 is verified for `streamChatTurn.ts` only. |
| Full pg-boss config — retention, retry, dead-letter behavior | Saw it's installed and used | If failed jobs aren't retained, "agent sees outcomes" is more limited than the events table suggests. |
| `packages/db/src/schema/rateLimits.ts` and `migration.ts` schemas | Listed but not read | `migration_failures` could be a usable decision-ledger-adjacent table. |
| Type definitions in `packages/types/src/` | Never opened | EventSource, StyleDimensions, ChatToolCall etc. — content claims rely on import-site naming, not the type definitions themselves. |
| `apps/web/src/app/(main)/[lang]/page.tsx:50-411` (landing body) | Read first 50 lines only | An analytics fire-on-mount could exist deeper in the file. (Likelihood low given the rest of the search came up empty, but unverified.) |
| `docs/realtime-todo.md` | Listed but not opened | Realtime is the consumer side of events for the frontend; possible event-coverage implications missed. |
| `docs/migration-luke-one-shot.md` and `docs/phase-11-multi-user-migration.md` | Listed but not opened (only inferred shape from commit messages) | Might describe an event-emission gap during migration that affects historical data. |
| Live database introspection (RLS effective behavior, real event payloads, actual cost data) | Code-only audit | Static analysis confirms the *code says* X; doesn't confirm *the deployed system does* X. |
| Legacy admin codebase at `/Users/lukegorski/ale` | Out of scope (audit is of the rebuild) | Phase 14's "parity" claim is based on `docs/phase-14-admin-parity.md`'s inventory, not the legacy code itself. |
| Supabase Auth dashboard config | Cannot inspect via repo | OAuth providers enabled, RLS migration deployed status, "Allow account linking" setting (referenced at `docs/secrets-runbook.md:108-115`) — all visible only in the dashboard. |
| Doppler secret list at HEAD | Cannot inspect via repo | `secrets-runbook.md` documents the *intended* set; actual contents may diverge. |
| Railway deploy state | Cannot inspect via repo | Whether the new app is actually serving traffic and whether `admin.telastyle.app` DNS has moved. Per memory, telastyle.app is on the legacy Vercel project; new Tela is on Railway. Not directly verified during this audit. |

### Where evidence is thin and confidence is (low)

- **Section 9c effort estimates** below. Reading a codebase tells you what exists; it tells you less about how long *changes* take here. Estimates are calibrated to what the project's commit cadence implies. (low)
- **Section 6c's claim that the prompt-version → outfit-feedback loop is "the cleanest existing closed loop."** True given evidence, but I didn't run a query to confirm every `outfits` row has a non-null `generation_id` historically — schema says `notNull()` (`outfits.ts:60`), so a violation would be a constraint failure rather than a silent gap, which is reassuring but not proven. (medium)
- **Section 1's emission counts** (`5 of 7` for wardrobe.*, etc.) — verified by grep for `type: '<x>'`. Could miss a dynamic emission where the type is built from a variable. Did not see any such pattern in spot checks. (medium)

### Decisions deferred — couldn't make from inspection alone

- Whether a generalized `decisions` table or extending `events` is the right vehicle for the decision ledger in Section 6b. Either works; the codebase doesn't lean one way.
- Whether the company-facing MCP server should be a new `apps/admin-mcp` or a mode of the existing `apps/mcp`. Both are cheap; the decision is a code-organization preference.
- Whether `auth.signed_up` and `auth.signed_in` events should be emitted from the OAuth callback route or from the auth middleware (which is where the user record is auto-created — `apps/api/src/auth.ts:91-118`). Code says the natural place is the latter; product clarity might prefer the former.

### Questions a human (Luke or cofounder) would need to answer

1. **Is the legacy admin still the operational surface for daily ops, or has it already lost utility?** Phase 14 priority depends on this.
2. **Cofounder's primary admin use cases** — writing rules, viewing user data, sending one-off emails — drives whether the admin chat surface is more valuable than the page surface (Phase 14 P1 decision).
3. **What's the actual signup rate today?** If <10/day, attribution capture is less urgent than if 100s/day. The audit can't see this.
4. **Is there an OAuth provider configured beyond Google in the Supabase dashboard?** The OAuth callback handler is provider-agnostic; the dashboard determines what works.
5. **Where does `RESEND_API_KEY` actually live?** If it's already in legacy Doppler config, "shipping welcome emails" is hours of work; if it has to be procured fresh, longer.
6. **Is there an analytics / observability platform Luke has already chosen** (PostHog vs. Plausible vs. server-side only)? Section 6e's recommendation to wire OTel changes if the answer is "I want PostHog server-side instead."
7. **Is the staging/dev/prod Supabase split done?** `secrets-runbook.md:124-127` lists this as "Future hardening (not done yet)." Affects whether an admin agent reading "prod" data can be tested safely.
8. **For the legacy admin's activity feed** — does it persist activity that the new `events` table doesn't have? The Phase 14 doc's mapping table at `phase-14-admin-parity.md:200-214` suggests near-1:1 coverage, but flags `onboarding_completed` as needing a new event.

---

## Section 9 — Synthesis

### 9a. What exists and is reusable

Concrete assets the AI-native build can stand on. Not generic affirmations.

1. **`events` table + `logEvent` system** (`packages/events/src/`, `packages/db/src/schema/events.ts`). 31 of ~40 event types emit; schema stable since `0000_even_multiple_man.sql`; 4 indexes covering the common query shapes. This is *the* queryability foundation for in-product behavior.
2. **`generations` table + AI gateway provenance** (`packages/ai/src/gateway.ts`, `packages/db/src/schema/outfits.ts:28-50`). Every AI call writes `operation`, `prompt_name`, `prompt_version_id`, `model`, `input_snapshot`, `raw_output`, `parsed_output`, `latency_ms`, `cost_cents`. Indexed on `user_id`, `operation`. The AI-side closed loop is *already in place*.
3. **Capability registry with admin gate** (`packages/capabilities/src/registry.ts`). 45 registered capabilities, `requiresAdmin` flag, auto-discovery for tRPC + chat tools + MCP. The architectural slot for "add a new capability and it's instantly callable from agents" exists.
4. **Service-account auth path** (`apps/api/src/auth.ts:127-179`). Existing token format `service_<source>:<userId>:<secret>` is usable today by internal callers. Source enum already includes `mcp`, `worker`, `admin`, `test`.
5. **`users.is_admin` + RLS policies** (`packages/db/drizzle/manual_001_enable_rls.sql:43-145`). Admin gate is DB-backed and multi-admin. RLS is on for every user-scoped table; service role bypasses for server-side capability paths.
6. **`prompts` + `prompt_versions` table** (`packages/db/src/schema/prompts.ts`) with `template`, `variables`, `changelog`. A working prompt-versioning ledger for the AI domain.
7. **`style_profile_versions`** (`packages/db/src/schema/profiles.ts:17-29`) with `reason` + `triggered_by`. A working decision ledger for the style-profile domain — proof-of-concept for a generalized version.
8. **Built-in cost dashboard** (`apps/api/src/admin/costs.ts`). Service-account-gated HTML+JSON endpoint reading `generations`. Daily / per-operation / per-user breakdowns over the last 30 days.
9. **Sentry instrumentation with business tags** (`apps/api/src/index.ts:30-60`). Capability failures already carry `userId`, `capability`, `source`, `requestId`. Extending to success-path outcome attribution is a few-day add-on, not a rewrite.
10. **MCP server scaffolding** (`apps/mcp/src/index.ts`). The stdio + Claude Desktop integration shape is ready; adding capabilities to it is "add to a `Set<string>` + ensure the Zod shape is supported by the embedded converter."
11. **Phase 14 plan** (`docs/phase-14-admin-parity.md`, 1048 lines, **6 architectural decisions LOCKED**). Recoverable admin pages at `git rev fd4b451`. Effort estimate baked in.
12. **Doppler secret hygiene** (`docs/secrets-runbook.md`). No `.env` files committed; rotation procedures documented.

### 9b. What's missing or fragile, ranked by criticality

Ordered by what blocks the most downstream work. The first item must exist before anything else can be built well.

1. **No company-facing MCP server** (Section 3). An agent built today against the existing MCP server can only read one user's data, can't mutate, can't see business-state. *Specifically* what's missing: an `apps/admin-mcp` (or an `--admin` mode for `apps/mcp`) that proxies all 15 admin capabilities through a service-account token. Without this, every other "agent does X" item depends on raw SQL or hand-rolled tooling.
2. **No admin app frontend** (Section 5). `apps/admin` literally doesn't exist. The capabilities are there; the UI isn't. *Specifically* what's missing: scaffold `apps/admin` per Phase 14 plan; recover pages from `fd4b451`; deploy to Railway. Blocks every human-driven (and most agent-driven) interaction with admin capabilities.
3. **Funnel-edge events not emitted** (Section 1): `auth.signed_up`, `auth.signed_in`, plus declared-but-unwired `outfit.worn_*`, `chat.conversation_summarized`, `feedback.implicit_signal`. *Specifically* what's missing: `logEvent` calls in `apps/api/src/auth.ts:91-118` (auto-create branch fires `auth.signed_up`; existing-user branch fires `auth.signed_in`). Hours-to-days of work; massive unlock for funnel queries.
4. **No attribution capture** (Section 6a, Section 7). No UTM parsing on landing, no referrer capture, no `users.signup_source` column. *Specifically* what's missing: middleware that reads UTM params + `document.referrer` and persists to a new `users.attribution jsonb` column (or new columns); fire it from `apps/web/src/app/(main)/[lang]/page.tsx` mount. Blocks every "where did users come from" question (Q1, Q5).
5. **No decision ledger** (Section 6b). Two narrow ledgers exist; no generalized one. *Specifically* what's missing: either (a) a `decisions` table with `kind`, `made_by_kind`, `made_by_id`, `rationale`, `linked_outcome_id`, or (b) `decision.*` events with a structured payload schema. Blocks "this agent suggested X, here's whether it worked."
6. **No system-user / agent principal** (Section 4). Service-account tokens require a userId. *Specifically* what's missing: either a synthetic system-user row + token convention, or a `kind: 'user' | 'agent'` field on `RequestContext`. Blocks "the agent itself acted, not impersonating anyone."
7. **Per-token credentials** (Section 4). Shared `SERVICE_ACCOUNT_SECRET` is fragile for a multi-caller world. *Specifically* what's missing: `service_tokens` table with hashed secrets, labels, scopes, `revoked_at`; auth path checks against it. Blocks per-caller audit & rotation.
8. **No client-side analytics / event.log capability** (Section 7). Server-emitted events miss everything that doesn't reach a capability call. *Specifically* what's missing: an `event.log` capability (planned per `visual-port-plan.md:1077-1083`) + client wrapper. Blocks "did the user hover the upsell?" class of question.
9. **No transactional email** (Section 7). *Specifically* what's missing: install Resend (or alternative), add `RESEND_API_KEY` to Doppler, build the planned `auth.welcomeEmail` capability. Blocks every "agent emails a user" intervention.
10. **OTel is a stub** (Section 6e). *Specifically* what's missing: pick an exporter (Highlight / Axiom / Honeycomb / Sentry Performance), install SDK packages, add success-path spans to the capability observability hook. Blocks a full outcome-attribution substrate (Sentry-only doesn't cover the success path).
11. **Schema dimensions for funnel agents** (Section 2). `users.auth_provider`, `users.attribution jsonb` (or columns), session table. *Specifically* what's missing: a new migration adding the columns + write paths in auth middleware. Hours of work.

### 9c. Recommended build sequence

The brief asks for a sequence delivering (1) Tela context MCP, (2) event coverage closures, (3) attribution + decision ledger, (4) admin app interface, (5) first closed loop. I'll group these into an honest staging based on dependencies.

> Effort estimates: my honest read of the codebase. Confidence: (medium) — see Section 8.

**Stage A — Substrate (5-9 days, low risk, high unlock)**

| # | Item | Effort | Depends on | What it unlocks |
|---|---|---|---|---|
| A1 | Emit `auth.signed_up` + `auth.signed_in` from the auth middleware (`apps/api/src/auth.ts:91-118`). | 0.5 day | — | Activation rate, return rate, sign-in volume in events table. |
| A2 | Add `users.auth_provider varchar(32)` populated from `data.user.app_metadata.provider`; backfill from Supabase via one-time script. | 0.5 day | — | Q5 (conversion by auth method). |
| A3 | Build **Tela context MCP server**. Option A (cheapest): extend `apps/mcp` with an `--admin` flag that flips `READ_ONLY_TOOLS` to include all `admin.*` capabilities. Or Option B: create `apps/admin-mcp`. Auth: service-account token with `source=admin`. | 1-2 days | — | Single most important agent-readability unlock. Agent can answer "how many users today, by language" via a tool call. |
| A4 | Add `users.attribution jsonb` column + middleware in `apps/web/src/app/(main)/[lang]/page.tsx` that parses UTM + referrer on mount and persists via a new tRPC capability. | 1-2 days | — | Q1 (signups by traffic source); foundation for campaign attribution. |
| A5 | Wire `event.log` capability (per `visual-port-plan.md:1077-1083`) for client-side activity logging. | 0.5-1 day | — | Captures pre-auth visitor behavior. |
| A6 | Wire missing event emissions: `outfit.regenerated`, `outfit.worn_*` (when worn_at flips), `chat.conversation_summarized` (when chat is summarized), `feedback.implicit_signal` (when a generated outfit gets neither feedback nor save after N hours). | 1-2 days | — | Closes the declared-but-unwired gap. |

**Stage B — First closed loop (3-5 days)**

| # | Item | Effort | Depends on | What it unlocks |
|---|---|---|---|---|
| B1 | Add a `decision_log` table or generalize via `events` taxonomy (`decision.prompt_promoted`, `decision.rule_added`, etc.). Wire `admin.createPromptVersion` and `admin.createRule` to write to it. | 1-2 days | A6 | Decision ledger foundation. |
| B2 | Build a `closed_loop.promptVersionImpact` capability that joins `decision_log` (or `prompt_versions`) → `outfits.generation_id` → `feedback.*` events and returns "thumbs-up rate before/after promotion." | 1-2 days | B1, A1 | **First real closed loop**: prompt change → measurable outcome → queryable by agent. |
| B3 | Expose B2 capability through the company-facing MCP server (A3). | 0.5 day | A3, B2 | An admin agent can ask "did promoting prompt X work?" |

**Stage C — Admin app (1-2 weeks, per Phase 14 plan)**

| # | Item | Effort | Depends on | What it unlocks |
|---|---|---|---|---|
| C1 | Phase 14a: scaffold `apps/admin`, recover 5 existing pages from `fd4b451`, deploy to Railway URL. | 3-4 days | — (independent of A/B) | Daily human-driven admin ops; UI surface for chat. |
| C2 | Phase 14b: build the 5 missing admin capabilities (`getActivity`, per-user wardrobe/outfits/chats/costs), 3 missing pages, cut DNS. | 4-5 days | C1 | Full admin parity at `admin.telastyle.app`. |
| C3 | Add agent chat surface to `apps/admin`. Per Phase 14 P1=A: dedicated AdminAiChat + slide-out panel. Per P1=B (lower effort): reuse `/chat`. | 3-4 days (P1=A) or 0.5 day (P1=B) | C1, A3 | Human-or-agent ad-hoc Q&A against admin capabilities, with chat history. |

**Stage D — Closed-loop hardening (4-8 days, deferrable until A/B/C are reaping value)**

| # | Item | Effort | Depends on | What it unlocks |
|---|---|---|---|---|
| D1 | Per-token credentials: new `service_tokens` table + auth path. | 2-3 days | — | Revocation; per-caller audit. |
| D2 | System-user / agent principal: synthetic user + `RequestContext.kind`. | 1-2 days | D1 | Distinct agent identity for logging + audit. |
| D3 | OpenTelemetry: pick exporter (recommend Sentry Performance for vendor consolidation), wire success-path spans. | 1-2 days | — | Outcome attribution beyond errors. |
| D4 | Transactional email infrastructure: Resend + `auth.welcomeEmail`. | 0.5-1 day | — | "Agent sends user X an email about Y." |

### Recommended sequencing rationale

- Stage A is the cheapest set of unlocks and unblocks the most downstream work. Every later stage benefits from A1 (real auth events), A3 (Tela context MCP), A4 (attribution), and A6 (event coverage gaps closed).
- Stage B is *demonstrably* the first closed loop. It's specifically the prompt-version → outfit-feedback cycle because that's the loop where every link in the chain already exists in the schema (`outfits.generation_id` → `generations.prompt_version_id` → versioned prompt). No other candidate loop has all-links-present today.
- Stage C is **independent of A and B** in dependency terms — Phase 14 can run in parallel. But the AI-native value is concentrated in A and B; if both teams are one human + Claude, run A → B first, then C, unless cofounder daily workflow is broken by the admin gap (audit can't see this — Section 8 question #1).
- Stage D items are hardening, not feature work. Defer until A/B/C produce a clear "this would have been better if we had Z" signal.

### Total honest estimate

- **Stage A: 5-9 days** to substrate-complete (queryability foundation).
- **Stage B: 3-5 days** for first closed loop.
- **Stage C: ~2 weeks** for admin app per Phase 14 plan estimate (independent track).
- **Stage D: 4-8 days** for hardening (deferrable).

If A + B + C run as one workstream with one human: **3-4 weeks of focused work** to deliver "queryable by agents end-to-end, one closed loop demonstrably working, admin app live." Confidence on the time estimate: (medium) — the codebase quality suggests this is reasonable, but project-velocity is unknowable from a code review.

### 9d. The honest bottom line

Tela is **further along on the queryability half than the closed-loop half**, and **further along on the AI-side of both halves than the funnel/attribution side**.

Phrased plainly: an internal agent could be useful **today** for AI-cost-and-quality questions ("which prompt version produces the highest thumbs-up rate? what's my OpenAI spend by capability this week?") because the `generations` and `outfits` tables make that wiring trivial. An internal agent **cannot** be useful for funnel-and-growth questions ("where are our users coming from, which auth method converts best, did the campaign work?") because the data simply isn't being captured. Closing that side is a small schema change + a write at the right callsite — concretely, days of work, not weeks.

The architectural decisions made in this rebuild (capability layer, AI gateway with provenance, DB-backed prompts, structured events, RLS, service-account path, MCP scaffolding) are *exactly* the choices a project would make if they were planning to be AI-native a year out. The team is not at the starting line; they are well past it on the technical substrate. The remaining work is **filling specific gaps, not laying foundations**.

The honest call: "implement both halves as fast as possible" is **realistic** given current state, on the order of 3-4 weeks of focused work for the substrate + first closed loop + admin app. The gap is real but smaller than it would be in a comparable project at this stage. The single biggest leverage move is **Stage A3 — the company-facing MCP server** — because it converts every existing admin capability into agent-queryable surface in roughly a day.

