# AI-Native Readiness Audit — Reproducibility Log

Date started: 2026-05-19
Auditor: Claude (Opus 4.7, 1M context)
Repo audited: `/Users/lukegorski/tela` (the rebuild; NOT `/Users/lukegorski/ale` legacy)
Worktree CWD: `/Users/lukegorski/ale/.claude/worktrees/tender-swanson-5bfbdc`

Each row is one inspection step. The audit doc cites file paths; this log shows the order findings were gathered.

## Phase 0 — Repo discovery

- listed `/Users/lukegorski/tela/` root → confirms pnpm-workspace, turbo.json, apps/, packages/, docs/, tools/, scripts/
- listed `apps/` → `api`, `mcp`, `web`, `workers`
- listed `packages/` → `ai`, `capabilities`, `config`, `db`, `events`, `prompts`, `queue`, `testing`, `types`
- listed `tools/` → `prompt-admin`, `scripts`
- listed `docs/` → `migration-luke-one-shot.md`, `phase-11-multi-user-migration.md`, `phase-14-admin-parity.md`, `realtime-todo.md`, `schema-gaps.md`, `secrets-runbook.md`, `visual-port-plan.md`
- read `package.json` (root), `turbo.json`, `pnpm-workspace.yaml`
- read each sub-`package.json` for all 4 apps and 9 packages (no `tools/*/package.json` exists)
- `git log --oneline -50` → most recent: OAuth/Railway/web deploy, Phase 11 migration, Phase 14 prep (deleted `(admin)` route group `d32941d`)
- read `PORT.md` (first 200 lines) — visual port plan, no-residue rule
- read `docs/phase-14-admin-parity.md` (first 200 lines) — `apps/admin` does not exist yet; admin capabilities are in git history at `fd4b451`
- read `docs/schema-gaps.md` — Firestore→Postgres field-gap audit
- confirmed no root `README.md`

## Section 1 — Event coverage

- listed `packages/events/src/` → `types.ts`, `logEvent.ts`, `index.ts`
- read `packages/events/src/types.ts` — ~40 declared event types across 11 domains
- read `packages/events/src/logEvent.ts` — single insert into `events` table, append-only
- read `packages/db/src/schema/events.ts` — table schema with 4 indexes
- grep `logEvent\s*(` across `packages/` and `apps/` → 34 callsites in capabilities
- grep `type:\s*'<domain>\.<event>'` → mapped declared→emitted matrix
- read `outfit/saveOutfit.ts` (emit outfit.saved/unsaved)
- read `outfit/setFeedback.ts` (emit feedback.positive/negative/cleared)
- grep for `auth.signed_*` → only in `events/types.ts`, no emits
- grep for `outfit.regenerated|outfit.worn` → only declared, no emits
- read `packages/ai/src/gateway.ts` → AI provenance goes to dedicated `generations` table, not events
- read `apps/web/src/app/auth/callback/route.ts` → no event emission
- read `packages/capabilities/src/user/completeOnboarding.ts` → emits `profile.updated` w/ payload reason
- searched all 14 generated migrations for ALTER on events table → none (schema stable since 0000)

## Section 2 — Schema readiness

- read all 9 schema files: `users.ts`, `wardrobe.ts`, `outfits.ts`, `events.ts`, `prompts.ts`, `knowledge.ts`, `profiles.ts`, `stubs.ts`, `index.ts`
- read `manual_001_enable_rls.sql` (RLS policies + `public.app_user_id()` function)
- grep `traffic_source|trafficSource|utm_|referrer|referral_source|auth_method|authMethod` across `packages/`, `apps/`, `*.sql` → no matches
- grep `CREATE VIEW|CREATE MATERIALIZED VIEW|CREATE FUNCTION` across all `*.sql` migrations → only `public.app_user_id()`
- confirmed users.auth_user_id FKs to Supabase Auth schema (cross-schema); no provider/method denorm on public.users

## Section 3 — MCP server inventory

- read `apps/mcp/src/index.ts` (stdio MCP server, 6 read-only tools)
- read `packages/capabilities/src/registry.ts` (capability registry, admin gate, observability hooks)
- read `packages/capabilities/src/index.ts` (capability domain imports)
- grep `registerCapability\(` across `packages/capabilities/src/` → 45 callsites
- grep `name:\s*'<domain>\.<action>'` → 45 capability names, 15 admin
- grep `tela-mcp|@tela/mcp|MCP|claude_desktop` across repo → only in apps/mcp + docs (no programmatic consumers)
- read `apps/api/src/auth.ts:1-200` (service-account token format: `service_<source>:<userId>:<secret>`)
- read `apps/api/src/trpc/router.ts:1-100` (auto-builds tRPC procedures from capability registry)

## Section 4 — Auth and authorization

- read `apps/api/src/auth.ts:1-200` (user-token vs. service-token paths)
- read `packages/capabilities/src/context/requestContext.ts` (RequestContext, AsyncLocalStorage)
- read `apps/api/src/trpc/context.ts` (per-request context creation)
- re-read `packages/db/drizzle/manual_001_enable_rls.sql` for policy semantics
- confirmed: single `SERVICE_ACCOUNT_SECRET`, sources={mcp,worker,admin,test}, service-account => isAdmin=true
- confirmed: no `service_tokens` or per-caller token records anywhere

## Section 5 — Admin app surface

- listed `apps/` → only api, mcp, web, workers (no apps/admin)
- listed `tools/prompt-admin`, `tools/scripts` → both empty
- listed `apps/web/src/app/` directory tree → no /admin routes
- git log --all --oneline | grep admin → 6 admin-related commits, deletion at d32941d
- `git show d32941d` → confirmed deletion of 22 files (13 pages, 3 components, 6 libs)
- `git show fd4b451` → predecessor commit (Phase 11 preview); admin pages preserved at this SHA
- listed `packages/capabilities/src/admin/` → 17 files (15 capabilities + index + helpers)
- grep `is_admin|isAdmin` in `apps/web/src/` → useAuth.ts, lib/admin.ts, lib/users.ts (auth checks, no admin UI)
- read `docs/phase-14-admin-parity.md:200-400` (Phase 14 decisions LOCKED, ~1-2 weeks estimate)

## Section 6 — Closed-loop infrastructure

### 6a Attribution
- grep utm_/referrer/campaign_id/feature_flag/abTest/variant_id/posthog/growthbook/launchdarkly/amplitude/mixpanel/gtm/google.analytics across packages/, apps/, docs/ → only matches in audit docs themselves
- grep document.referrer in apps/web/src → no matches
### 6b Decision ledger
- grep audit_log|decision_log|change_log|experiment in packages/+apps/ → only false-positive in next.config (experimental block)
- re-confirmed `prompts.ts` + `profiles.ts` (`style_profile_versions`) are the only versioned ledgers
### 6c Feedback storage
- traced outfit.feedback → outfits.generation_id → generations.prompt_version_id linkage chain (intact)
### 6d Outcome latency
- enumerated each core flow and assessed shortest measurable cycle
- selected "outfit.generated → outfit.saved/feedback" as the cleanest existing closed loop
### 6e Instrumentation depth
- read `apps/api/src/otel.ts` (STUB — TODO body, no SDK installed)
- read `apps/api/src/sentry.ts` (`Sentry.init` with tracesSampleRate, conditional on DSN)
- read `apps/api/src/index.ts:1-90` (capability hook wires errors to Sentry with userId/capability/source/requestId tags)
- grep Sentry.* across apps/api, apps/workers, packages/ → tags & captureException calls only (no spans)
- confirmed: no `@opentelemetry/*` packages in any package.json
- read `apps/api/src/admin/costs.ts:1-60` — built-in HTML+JSON cost dashboard reading `generations` table

## Section 7 — Growth and campaign tooling

- grep resend/sendgrid/postmark/mailgun/nodemailer/smtp/loops.so across all .ts/.json/.md → only matches in audit docs + one Resend mention in `docs/visual-port-plan.md:1078` (planned, not built)
- grep trackEvent/track/analytics in apps/web/src → only Tailwind `tracking-widest` font classes (false positive)
- read `docs/secrets-runbook.md:18-29` → no RESEND_API_KEY in active secrets list
- read `apps/web/src/app/(main)/[lang]/page.tsx:1-50` → landing page (411 lines), no UTM/referrer capture
- verified `users` schema has no traffic_source / utm_* / referral_source / signup_source columns

## Section 8 — Blind spots

- enumerated files/areas not opened (observability.ts, chatStream.ts, full worker job catalog, type defs, etc.)
- enumerated low-confidence claims with their evidence basis
- enumerated decisions deferred to product owner
- enumerated questions only Luke/cofounder can answer

## Section 9 — Synthesis

- enumerated 12 reusable assets with file paths
- ranked 11 gaps by downstream-blocking criticality
- decomposed build sequence into Stages A–D with per-item effort estimates
- bottom line synthesized from Sections 1-7 findings
