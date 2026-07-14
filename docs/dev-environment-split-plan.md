# Dev-environment split — Phase 0 report + execution plan

Date: 2026-07-14 · Session: dev-environment-split (worktree `sad-payne-aec62d`, branch `claude/elastic-cori-07314c`)
Source prompt: `docs/session-prompts/dev-environment-split.md` · Status: **Phase 0 complete — STOPPED at gate, awaiting Luke's go**

Production Supabase (`cyupcwfvtbfkupbdcoql`) was touched **read-only** (SELECT probes + `pg_dump --schema-only`). Zero mutations to prod, Doppler, or Railway so far. The only repo change is `manual_003_rls_hardening.sql` (drift reconciliation, committed locally, not pushed).

---

## 1. Inventory (all verified today unless noted)

### Doppler (project `tela`)
| Config | Real keys | State |
|---|---|---|
| `dev` | 27 (+3 auto `DOPPLER_*`) | **Live production config.** Last fetch today 08:09Z (Railway sync). |
| `prd` | 3 | `NEXT_PUBLIC_SENTRY_DSN_ADMIN`, `RESEND_API_KEY`, `SENTRY_PROJECT_ADMIN` — all three **hash-identical to dev's values** (verified via sha256 compare, values never displayed). No conflicts to resolve; the Phase 2 copy just fills in the other 24. |
| `stg` | 3 (same trio, also identical) | Never fetched since 2026-05-19. Disposition TBD (Phase 4). |
| `dev_personal` | 27 (full copy) | Stale since 2026-05-22. Disposition TBD (Phase 4) — recommend deletion (stale full secret copy = pure risk surface). |

`dev` key names (27): ANTHROPIC_API_KEY, DATABASE_URL, FASHN_API_KEY, FIREBASE_ADMIN_{CLIENT_EMAIL,PRIVATE_KEY,PROJECT_ID}, LOG_LEVEL, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, NEXT_PUBLIC_SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN_ADMIN, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_SUPABASE_URL, NODE_ENV, OPENAI_API_KEY, RESEND_API_KEY, SENTRY_AUTH_TOKEN, SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT, SENTRY_PROJECT_ADMIN, SENTRY_TRACES_SAMPLE_RATE, SERVICE_ACCOUNT_SECRET, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, SUPABASE_URL.

Notable values (public-by-design, inspected): `NEXT_PUBLIC_API_URL=https://tela-development.up.railway.app` (the live api — local web sessions hit prod api today), `NODE_ENV=production`, `LOG_LEVEL=debug`.

### Railway (project `tela` / cfb90c24, environment `development`)
| Service | Env-var source | Notes |
|---|---|---|
| `tela` (api) | **Doppler sync — the only synced service.** Carries all 27 dev keys incl. the `DOPPLER_CONFIG/ENVIRONMENT/PROJECT` marker vars (sync signature). | Also runs the pg-boss worker **in-process** (`apps/api/src/worker.ts` — co-located by design; `apps/workers` exists but is not deployed). |
| `tela-web` | 10 direct vars (NEXT_PUBLIC_*, NODE_ENV, SENTRY_AUTH_TOKEN/ORG/PROJECT) | **No Doppler consumption.** Holds prod values; untouched by every phase. |
| `tela-admin` | 11 direct vars (incl. DATABASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY — set 2026-07-07) | **No Doppler consumption.** Same: untouched. |

⇒ **The Phase 2 "Railway swap" is a single change: the api service's Doppler sync source `dev` → `prd`.** Evidence: marker vars present only on `tela`; web/admin var sets are the known direct-set lists; Doppler shows one enabled Railway integration ("Tela Doppler"). Caveat: the Doppler API returns an empty sync list to my CLI token (scope quirk), so the sync's exact source/target should be eyeballed in the dashboard — gate question **G1**.

### CI / other consumers of `dev`
- `ci.yml`: env-free builds (placeholder `NEXT_PUBLIC_SUPABASE_*`) — unaffected. ✓ verified.
- `prompt-eval.yml`: `DOPPLER_TOKEN_DEV` repo secret = Doppler **service token scoped to `tela/dev`** → after Phase 3 it hits the new dev DB. Standup therefore includes `prompts:sync` + `seed-eval-user.mjs` so evals stay green. Post-split the token's name is honest for the first time.
- Local: `scripts/dev-web.sh`, `dev-builder.sh` (api :3004 + web :3001), `v0-verify.sh`, MCP, seed scripts — all `doppler run --config dev`. No `.env*` files exist anywhere.

### Supabase production (ref `cyupcwfvtbfkupbdcoql`, PG **17.6**, `aws-1-us-east-1` pooler)
- 24 public tables, RLS enabled on all; 20/20 journaled migrations applied (`drizzle.__drizzle_migrations`); no views/sequences/table-triggers; only core `gen_random_uuid()` (no extension deps in app schema).
- Buckets: `item-photos` (private, 10 MB, mime jpeg/png/webp/heic), `models` (public, 5 MB, jpeg/png/webp), `try-on-results` (private, 10 MB, no mime list). **Zero storage policies** — all storage access is service-key. Objects: item-photos 335 (~65 MB), models 2, try-on-results 28 (~17 MB).
- pgboss v10 schema (self-creating). Realtime publication = the 4 manual_001 tables; **web has no realtime subscriber code today** (dormant).
- Data: 29 app users / 13 auth users; 106 closet_items; 115 item_photos; 23 outfits; prompts 7 (67 versions); stylist_rules 43; annotated_examples 73; rate_limits 4 defaults. Closets: Marina 59 items, **Luke 18 items / 26 photos**, Isabel 10, others ≤ 8.
- Auth control-plane (providers, redirect allowlist, SMTP, account-linking toggle) is dashboard-only → gate question **G2** (read-off; prod stays untouched regardless).

## 2. Drift report

Method: `pg_dump --schema-only` prod (session pooler) vs a scratch PG 17.10 cluster built from `db:migrate` (20) + `manual_001` + `manual_002`, same pg_dump/flags both sides. Artifacts in session scratchpad (`prod-schema-{structural,acl}.sql`, `*-drift.diff`, `probe-output.txt`). Prod ACL-dump fingerprint (before): sha256 `181e689b357a…3298`.

**Structural drift — exactly one item (two symptoms):**
1. Hand-applied `public.rls_auto_enable()` + global event trigger `ensure_rls` (`ddl_command_end`, tags CREATE TABLE / CREATE TABLE AS / SELECT INTO) — force-enables RLS on every new public table. In no migration file; origin undocumented.
2. Its effect: RLS enabled on the three post-manual_001 tables (`migration_failures`, `migration_log`, `outfit_drafts`).
Nothing else — no unaccounted tables/columns/indexes/functions.

**ACL drift — one hand-applied lockdown pass:** DML (`SELECT/INSERT/UPDATE/DELETE`) revoked from `anon`/`authenticated`/`service_role` on all 24 tables, plus matching `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` changes (tables keep `REFERENCES,TRIGGER,TRUNCATE,MAINTAIN`; sequences keep `UPDATE`). Works because all app SQL runs as `postgres` via `DATABASE_URL`, and `getSupabaseAdmin` uses the Storage API, not PostgREST tables. The single authed PostgREST read (builder gate) is exactly manual_002's column grant — verified live.

**Reconciliation (done):** `packages/db/drizzle/manual_003_rls_hardening.sql` captures both items. **Validated on the scratch cluster**: after applying it, the full ACL dump matches prod modulo (a) pg_dump's random `\restrict` tokens, (b) Supabase platform baseline that a real project has out of the box (schema USAGE grants, `supabase_admin` default-ACLs, per-table leftovers that materialize exactly when Supabase's default GRANT ALL meets manual_003's revoke). Standup order: `db:migrate` → manual_001 → manual_002 → manual_003. The standup script will re-run the audit queries against dev and assert the expected grant matrix (self-checking, in case Supabase changed new-project defaults since April).

**Observations, explicitly out of scope (prod read-only):**
- Client roles (incl. `anon`) retain `TRUNCATE/TRIGGER/REFERENCES` — PostgREST exposes none of these, but revoking them is a sensible future prod-hardening followup.
- Realtime prep (publication + policies) is dormant; authenticated lacks SELECT privilege on the published tables, so subscriptions would deliver nothing if ever wired up. Future-work note, not a bug today.

## 3. Execution plan

### Phase 1 — Luke: create the dev Supabase project
- Org: same as prod. Name: **`tela-dev`** (suggestion). Region: **us-east-1** (prod parity). Postgres 17. Free tier fine.
- Nothing else — no schema, no settings. (Alternatively hand me a scoped management token and I prepare the API call; dashboard is simpler.)

### Phase 2 — Relabel: populate `prd`, swap the api sync
**Freeze window:** from step 2 until Phase 2 verification is recorded — no pushes to `main`, no other build sessions, no Doppler edits outside this plan. A push mid-swap redeploys all three services at the worst moment. Freeze lifts once the api runs green from `prd` and the followups entry records it.

1. **Copy dev → prd** (config-to-config inside Doppler; values never touch chat/disk):
   ```bash
   doppler secrets download --project tela --config dev --no-file --format json \
     | jq 'del(.DOPPLER_CONFIG, .DOPPLER_ENVIRONMENT, .DOPPLER_PROJECT)' \
     | doppler secrets upload --project tela --config prd /dev/stdin
   ```
   Verify: `--only-names` on `prd` shows all 27 + hash spot-check of 3 sensitive keys (verdict-only script from Phase 0). If `/dev/stdin` upload misbehaves, fallback is the dashboard's copy flow — we validate the pipe mechanics with Luke watching before running against `prd`.
2. **Swap sync source (Luke, Doppler dashboard):** tela → Integrations → "Tela Doppler" → the sync feeding Railway service `tela`: recreate it sourcing **`prd`** (same Railway project/env/service), delete the `dev` sync. Values are byte-identical, so the swap is a pure relabel; expect at most one api redeploy when the new sync first pushes.
3. **Verify api (each must pass):**
   - `curl https://tela-development.up.railway.app/health`
   - `railway variables --service tela --json | jq -r .DOPPLER_CONFIG` → `prd` (marker var, non-secret)
   - Trace probe: `curl -H 'x-tela-trace-probe: 1' https://tela-development.up.railway.app/health` → sampling verdict + envelope counters
   - **Authed action:** service-token canary `POST /trpc/wardrobe.getItem` (read-only "Item not found" → Sentry event with release/environment tags; catches URL/key mismatch through the full auth+DB path)
   - One real page load: telastyle.app and admin (web/admin don't consume Doppler, but this proves user-visible end-to-end)
4. web/admin: **no action** (verified non-consumers; their direct vars keep prod values).
5. Record Phase 2 completion in `docs/post-cutover-followups.md` immediately (safe stopping point), then lift freeze.

**Rollback:** any check fails → recreate the sync from `dev` (byte-identical values = zero-risk revert); Railway serves the previous deployment through failed builds/healthchecks. Do not start Phase 3 in a degraded state.

### Phase 3 — Repoint `dev` + stand up the dev project
1. **Repoint 6 secret keys in `dev`** to the new project — Luke sets them via the Doppler dashboard editor (masked input; values never in chat/shell history): `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` (session-pooler URI). Sources: dev project dashboard → Settings → API / Connect.
   Plus 2 non-secret config fixes (I run, Luke approves): `NEXT_PUBLIC_API_URL=http://localhost:3004`, `NODE_ENV=development` (**G3**). Everything else (OpenAI, Anthropic, Fashn, Sentry, Resend, Firebase, SERVICE_ACCOUNT_SECRET, Maps) stays shared by design.
2. **Standup** (`scripts/dev-standup.sh`, to be written — the reusable environment artifact, with the assert-not-prod guard baked in from day one): `db:migrate` → manual_001 → manual_002 → manual_003 → create buckets (new `create-buckets.mjs` mirroring prod settings; `models` via existing setup script incl. man/woman.jpg upload) → `prompts:sync` → `seed-stylist-content.mjs` (source guide in `ale` verified present) → `seed-rate-limits.mjs` → `seed-eval-user.mjs` → grant-matrix + RLS self-audit. pgboss self-creates on first worker boot.
3. **Auth (Luke, dev project dashboard only):** email/password ON, magic link ON, redirect allowlist `http://localhost:3001/**` + `http://localhost:3004/**`, default SMTP (rate-limited — fine; prefer password sign-in for test users), **Google provider untouched/off — documented as prod-only**.
4. **Seed data:** recommend **mini-clone of Luke's closet** (18 items / 26 photos ≈ 10 MB): `clone-closet.mjs` copies his `users/closets/closet_items/item_photos` rows + storage objects prod→dev (prod strictly read-only), remaps to a fresh `luke@tela.test` auth user, preserves enhancement/cutout states (immediately realistic builder data). Plus 1 clean `test@tela.test` for the sign-up flow. Alternative (slower, less realistic): organic uploads only. Est. well under the 1 h cap.
5. **Full smoke against dev:** sign-up → upload → enhance + cutout (worker on dev DB) → builder (flag test user) → save outfit → outfits grid, via `dev-builder.sh`. Verify zero prod connections (guard + project-ref echo).

**Rollback:** post-swap, nothing in production consumes `dev` — worst case is local breakage; fix forward. (Never "roll back" by re-pointing dev at prod.)

### Phase 4 — Guards, docs, disposition
1. Assert-not-prod guard: shared helper (`scripts/lib/assert-not-prod.sh` + node equivalent) — fail fast when `SUPABASE_URL`/`DATABASE_URL` contains `cyupcwfvtbfkupbdcoql`; wired into dev-standup, seed/backfill scripts, and `dev-*.sh`.
2. Rewrite `docs/secrets-runbook.md` (stale since 04-23): which-config-where rule — **Railway ⇄ `prd`; local/worktrees/CI ⇄ `dev`**; rotation procedures updated to name the affected config(s); Vercel-legacy note.
3. `dev_personal` + `stg` disposition (**G4**): recommend deleting `dev_personal`; `stg` either delete or keep as empty placeholder.
4. CI: confirm green (env-free build; prompt-eval next run hits dev and passes on seeded prompts/eval user).
5. Followups entry → `[DONE]` with evidence; note standup script location for future envs.

### Definition of done (from the session doc)
- [ ] Prod untouched: ACL-dump hash matches `181e689b…` after everything; live site + admin normal on `prd`-sourced Railway.
- [ ] api green on `prd` (web/admin verified unaffected non-consumers); user-visible smoke each.
- [ ] Full local loop against dev project, zero prod connections.
- [ ] Drift report written (§2); every item journaled (manual_003) or documented.
- [ ] Guards + runbook + followups + `dev_personal`/`stg` disposition recorded.

## 4. Open questions for Luke (gate)
- **G1** — 30-sec dashboard check: Doppler → tela → Integrations → "Tela Doppler": confirm exactly one sync, source `dev`, target Railway service `tela` (env development). (API hides sync details from my token; everything else says yes.)
- **G2** — Prod Supabase dashboard read-off (or approve a read-only Chrome pass): auth providers enabled, redirect allowlist entries, custom SMTP yes/no, account-linking ON (runbook says it must stay ON — we touch nothing).
- **G3** — OK to set `NODE_ENV=development` in `dev` post-swap? (Correct for a real dev env; changes local trace-sampling default 0.1→1.0 and enables error `stack` in tRPC responses — both desirable for dev.)
- **G4** — `dev_personal`: delete? `stg`: delete or keep-empty? (Phase 4, can decide later.)
- **G5** — Phase 1: create `tela-dev` (us-east-1, PG 17) yourself, or hand me a scoped access token?
- **G6** (minor) — Is admin.telastyle.app already cut over to Railway, or still legacy Vercel? (Either way untouched; just fixes a runbook line.)
