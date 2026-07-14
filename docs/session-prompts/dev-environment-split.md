# Session prompt — Real dev environment (split dev from production)

## Context

Today `tela/dev` (Doppler) IS production: Railway syncs from it, and every local run, e2e test, and worktree session executes against the live Supabase project — the database and storage that founders and migrated users (Marina's closet) depend on. Builder v0 was e2e-verified against live data because there was no alternative. This session ends that: **production keeps the existing Supabase project untouched; DEV gets a NEW, separate Supabase project**, and the Doppler configs get relabeled to match reality.

Tracked as the P1 "Real dev environment" entry in `docs/post-cutover-followups.md` (promoted 2026-07-14 as the prerequisite for builder v1). Mark it `[DONE]` when this ships.

## ⚠️ The two rules that prevent catastrophe

1. **The NEW Supabase project is for DEV.** Production stays on the existing project (`cyupcwfvtbfkupbdcoql`). There is NO production data migration in this session. The production Supabase project is READ-ONLY throughout (inventory/dump only) — you never change its settings, schema, data, or auth config.
2. **Sequencing is load-bearing: Railway moves OFF the `dev` config (onto `prd`) BEFORE any `dev` config value is repointed.** If `dev`'s `SUPABASE_URL`/`DATABASE_URL` were repointed first, Railway's next sync would aim production at an empty database. Phase 2 completes and verifies before Phase 3 begins. No exceptions, no parallelization across this boundary.

## Verified starting facts (2026-07-14 — re-verify cheaply, don't re-derive)

- Doppler project `tela` configs: `dev` (actively synced — last fetch today; this is what Railway consumes), `dev_personal` (stale since May), `stg` (stale since May), `prd` (exists; SERVICE_ACCOUNT_SECRET entry says stg/prd were "intentionally left without the secret set").
- Schema: 22 journaled drizzle migrations in `packages/db/drizzle/` PLUS two out-of-journal files applied by hand to prod: `manual_001_enable_rls.sql`, `manual_002_grant_users_self_read.sql`. Assume more hand-applied drift may exist (pgboss schema is self-creating; storage buckets/policies are NOT in migrations at all).
- Storage buckets known from code: `models` (setup script exists: `packages/capabilities/scripts/setup-models-bucket.mjs`), `try-on-results`, item-photos bucket (see `ITEM_PHOTOS_BUCKET` in `packages/capabilities/src/storage/supabase.ts`). Inventory prod for any others + their policies.
- Prompts are runtime-critical DB rows — `pnpm --filter @tela/prompts prompts:sync` seeds them. Stylist rules + annotated examples were seeded at foundation time — find that script/path; if none survives, export the rows from prod (read-only) as the seed.
- CI: builds are env-free since `6b0e26b`; the prompt-eval workflow uses a `DOPPLER_TOKEN_DEV` repo secret — after this split that token correctly means "dev" for the first time. Verify, don't assume.

## Phase 0 — Read-only inventory + drift audit → plan → STOP

1. Doppler: confirm `prd` exists and is effectively empty; enumerate `dev`'s key NAMES (names only — **never echo values**). Determine exactly how Railway consumes Doppler (integration sync per service? which config?) — from the Railway dashboard docs/runbook (`docs/secrets-runbook.md`) or ask Luke to read it off the dashboard.
2. Supabase prod inventory (read-only): buckets + storage policies, auth providers enabled, redirect-URL allowlist, any Edge/webhook config.
3. **Schema drift audit**: `pg_dump --schema-only` production (read-only, via Doppler env), versus a scratch reconstruction (local Postgres or the new dev project once it exists): `db:migrate` + the two `manual_*.sql`. Diff → a written drift report; anything unaccounted for becomes either a new journaled migration or a documented manual step in the standup script.
4. Deliver the full execution plan to Luke: what `prd` will contain (key names only), the Railway swap steps per service, the dev-project standup list, the seed strategy (below), and rollback notes for each phase. **STOP for his go.**

## Phase 1 — Luke's hands: new Supabase project

Luke creates the new **dev** Supabase project (free tier is fine) — or explicitly hands you a scoped access token to create it. Region: same as prod for parity. Nothing else proceeds until the project exists.

## Phase 2 — Relabel production: populate `prd`, swap Railway

1. Populate Doppler `prd` with the CURRENT production values (config-to-config copy inside Doppler — propose the exact `doppler` commands; run them only with Luke's approval; never print values). `prd` must be byte-identical to today's `dev` at swap time so the swap is a pure relabel: **zero behavior change**.
2. **Freeze window**: before starting the swap, confirm with Luke that no other build sessions are active and that no pushes to main happen until Phase 3 completes (a mid-swap push redeploys all services at the worst possible moment). State when the freeze lifts.
3. Luke applies (or approves per service) the Railway change: each service's Doppler sync source `dev` → `prd`. One service at a time, verify after each: health endpoint, one real page load, **one authenticated action** (sign-in or an authed tRPC read — this is what catches an anon-key/URL mismatch in the relabel), Sentry release tag still flowing.
3. Only when all three services run green from `prd`: Phase 2 is done. Record it in the followups entry immediately (if the session dies here, the system is safe — just relabeled).

## Phase 3 — Repoint `dev` + stand up the dev project

1. Repoint `dev` config: `SUPABASE_URL`, anon/secret keys, `DATABASE_URL` → the new dev project (Luke-approved `doppler secrets set`; never echoed). All other keys (OpenAI, Fashn, Sentry DSNs) stay shared for now — cost/telemetry separation is out of scope (Sentry `environment` tag already distinguishes).
2. Stand up dev: `db:migrate` + `manual_*.sql` + drift-report reconciliation; create buckets + policies (script them — this is the reusable artifact; models bucket via the existing script); `prompts:sync`; stylist_rules + annotated_examples seed; pgboss self-creates on first worker boot.
3. Auth for dev: **email/password + magic link ONLY.** Do NOT touch the Google OAuth client (its verified-branding config stays production-only); dev's allowlist gets localhost entries. Document "Google sign-in is prod-only" as a known dev limitation. Note: the dev project uses Supabase's DEFAULT SMTP (rate-limited to a handful of emails/hour) — fine for dev, do NOT copy prod SMTP credentials; prefer password sign-in for test users to avoid the limit entirely.
4. Seed data: create 1–2 `@tela.test` users, then the cheapest path to a realistic closet — propose either a mini clone script (Luke's own items: rows + storage objects copied prod→dev, read-only on prod) or seeding via the real upload flow. Cap at ~1 hour; if it wants more, STOP and ask.
5. Full local smoke against dev: sign-up → upload → enhance + cutout job → builder (flag a test user in) → save outfit → outfits grid. The worker path counts (pg-boss on the dev DB).

## Phase 4 — Guards, docs, disposition

1. **Assert-not-prod guard**: dev-only scripts (verification harnesses, seed scripts, `scripts/dev-*.sh` paths that mutate) fail fast if `SUPABASE_URL` contains the prod project ref. Cheap, permanent.
2. Update `docs/secrets-runbook.md` + add the **which-config-where rule**: Railway ⇄ `prd`; local/worktrees/CI ⇄ `dev`; `dev_personal` + `stg` — propose deletion or a documented purpose (Luke decides; stale since May).
3. Verify CI still green (env-free builds; prompt-eval token semantics now honest).
4. Followups entry → `[DONE]` with evidence; note the standup script location for future environments (stg someday).

## Final verification checklist (Definition of done)

- [ ] Prod Supabase untouched: `pg_dump --schema-only` hash identical before/after; live site + admin serving normally from `prd`-sourced Railway.
- [ ] All three Railway services green on `prd`; one user-visible smoke each.
- [ ] Local stack runs the full loop (upload → enhance → builder → save) against the NEW dev project with zero prod connections (verify via the guard + `SUPABASE_URL` echo of the project ref only).
- [ ] Drift report written; every drift item journaled or documented.
- [ ] Guards in place; runbook updated; followups entry closed; `dev_personal`/`stg` disposition recorded.

## Operating constraints (non-negotiable)

- Every infra mutation (Supabase project creation, Doppler `prd` writes, `dev` repoint, Railway sync-source changes) is Luke-applied or Luke-approved per step. You prepare exact commands/clicks; he says go.
- Production Supabase: read-only, always. Legacy `/Users/lukegorski/ale`: read-only, always.
- Never echo secret VALUES anywhere (chat, logs, files) — key names only. Never `doppler secrets get` on sensitive values for display.
- Push only with Luke's explicit approval; local commits fine. Pushing main deploys LIVE.
- Never `git add .` / `git add -A`; never `--no-verify`. Atomic stage+commit+verify chains.
- If ANY Phase 2 verification fails, STOP and roll back the single service's sync source; do not proceed to Phase 3 in a degraded state.
