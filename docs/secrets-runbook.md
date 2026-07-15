# Secrets Runbook

Last updated: 2026-07-15 (dev-environment split — see `docs/dev-environment-split-plan.md`)

## The which-config-where rule (read this first)

| Doppler config (`tela` project) | Consumed by | Supabase project |
|---|---|---|
| **`prd`** | **Railway api sync** (service `tela`, env `development`) — this is PRODUCTION | `cyupcwfvtbfkupbdcoql` (prod) |
| **`dev`** | Local runs, worktrees, dev scripts, **CI** (`DOPPLER_TOKEN_DEV`) | `ikppbznovilsycsitrry` (`tela-dev`) |
| `dev_personal`, `stg` | Nothing — kept as **empty placeholders** (Luke, 2026-07-15; couldn't be deleted in the dashboard) | — |

Rules of thumb:
- `doppler run --config dev` is safe by construction — it cannot reach production.
- Ad-hoc **production** reads: `doppler run --config prd` — read-only discipline; no writes outside a runbook'd procedure.
- **Doppler dashboard trap**: when saving edits to `dev`, the confirm dialog offers to also apply changes to the *Staging/Production root configs*. **Never check those boxes** — that would aim production at the dev database on the next sync.
- Rotating a **shared** key (OpenAI, Anthropic, Fashn, Resend, Sentry, Maps, Firebase, `SERVICE_ACCOUNT_SECRET`): update **both** `prd` (redeploys the api) and `dev`. Rotating a **per-project** value (Supabase URL/keys, `DATABASE_URL`): the two environments are independent — prod values only ever go in `prd`.

## Where secrets live

| Layer | What | Notes |
|---|---|---|
| **Doppler** (`tela` project) | Source of truth for all runtime secrets | Configs per the table above |
| **Railway** | api service = synced from Doppler `prd` (sync "Tela Doppler", redeploy-on-sync ON). `tela-web` / `tela-admin` have **direct-set** vars (no Doppler) holding prod values — update via `railway variables --service <svc> --set` (each `--set` triggers a redeploy) | Worker runs **in-process in the api** (`apps/api/src/worker.ts`) — no separate service |
| **Supabase dashboards** | Auth provider config per project (Google client secret lives only in the **prod** project) | Dev project: email/password + magic link only |
| **GCP Console** | Google OAuth client secret (prod sign-in only) | |
| **OpenAI / Anthropic / Fashn / Resend dashboards** | API key revoke/rotate | Shared across envs |
| **GitHub Actions secrets** | `DOPPLER_TOKEN_DEV` — Doppler service token scoped to `tela/dev` (dev DB; honest name since the split) | |

## Environments

### Production (`cyupcwfvtbfkupbdcoql`)
- Railway project `tela` (cfb90c24), env `development` (legacy name — it serves live telastyle.app), services `tela` (api + worker), `tela-web`, `tela-admin`.
- `DATABASE_URL` uses the shared pooler `aws-1-us-east-1.pooler.supabase.com:6543` (transaction mode).
- Auth: Google OAuth (verified branding) + email; **"Allow account linking" must stay ON** (see below).

### Dev (`tela-dev`, `ikppbznovilsycsitrry`)
- Created 2026-07-15; us-east-1, PG 17 (prod parity), micro instance, same Supabase org.
- `DATABASE_URL` uses the shared pooler **`aws-0-us-east-1`** (note: different tenant cluster than prod's `aws-1`). Do **not** use the "Dedicated Pooler" string the dev project's Connect panel promotes — that host is IPv6-first and breaks IPv4-only clients (GitHub Actions).
- Auth: email/password + magic link only. **Google sign-in is prod-only** (the OAuth client's verified branding config is never duplicated into dev). Redirect allowlist: `http://localhost:3001/**`. Uses Supabase's built-in SMTP (rate-limited to a handful of emails/hour) — prefer password sign-in for test users; never copy prod SMTP creds here.
- Test user: `luke@tela.test` (password in Luke's notes) with a cloned copy of Luke's prod closet (row ids preserved).
- Stand up / repair / audit: `bash scripts/dev-standup.sh` — idempotent chain of migrations → `manual_001..003` → buckets → seeds → 14-point audit. Reusable for a future stg.
- Re-clone closet data: `packages/capabilities/scripts/clone-closet-to-dev.mjs` (prod side is forced read-only).

## Active secrets (27 keys, both `prd` and `dev`)

Per-project (differ between configs): `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `NEXT_PUBLIC_API_URL` (prd: Railway api URL; dev: `http://localhost:3004`), `NODE_ENV` (prd: `production`; dev: `development`).

Shared (same value in both, one rotation updates both): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `FASHN_API_KEY`, `RESEND_API_KEY`, `SERVICE_ACCOUNT_SECRET`, `SENTRY_AUTH_TOKEN`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN_ADMIN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_PROJECT_ADMIN`, `SENTRY_TRACES_SAMPLE_RATE`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `LOG_LEVEL`, and the legacy `FIREBASE_ADMIN_*` / `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` set. (Sentry `environment` tag separates envs in telemetry; DSN/cost separation is a future-hardening item.)

## Rotation procedures

### Shared API key leaked (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `FASHN_API_KEY`, `RESEND_API_KEY`)
1. Provider dashboard → revoke + regenerate.
2. Update in Doppler **`prd`** (sync redeploys the api, ~2.5 min) **and `dev`**.
3. Verify: `curl https://tela-development.up.railway.app/health`, then one real capability call (or watch Sentry for 401s).

### `SUPABASE_SECRET_KEY` / `SUPABASE_PUBLISHABLE_KEY` leaked
1. The affected **project's** dashboard → Settings → API Keys → rotate.
2. Prod keys → update `prd` (+ `tela-admin`'s direct `SUPABASE_SECRET_KEY` via `railway variables --service tela-admin --set`, and `tela-web`/`tela-admin` `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` if the publishable key rotated). Dev keys → update `dev` only.

### `DATABASE_URL` password compromised
1. Affected project → Settings → Database → reset password.
2. Prod → update `prd` (and `tela-admin`'s direct `DATABASE_URL`). Dev → update `dev`. Keep the **shared pooler** host form (`aws-1…` prod / `aws-0…` dev, port 6543).
3. Verify with health check (prod) or `scripts/dev-standup.sh` audit step (dev).

### `SERVICE_ACCOUNT_SECRET` leaked
1. `openssl rand -hex 32`; update `prd` + `dev`. Local MCP/scripts with old tokens stop working — reissue.

### Google OAuth secret leaked (prod-only)
Unchanged: GCP Console → reset client secret → paste into **prod** Supabase dashboard → Auth → Google. Dev has no Google provider.

### Doppler service token (`DOPPLER_TOKEN_DEV`) leaked
Doppler → Tokens → revoke; generate a new token **scoped to `tela/dev`**; update the GitHub repo secret; re-run failed workflows. (Blast radius post-split: dev DB + shared AI keys — rotate those too if exposure is suspected.)

## "Luke's laptop is stolen"

As before (Doppler sessions, GitHub, Railway, OpenAI/Anthropic, GCP), plus: reset **both** Supabase projects' DB passwords + API keys (prod first), update `prd`/`dev` accordingly. `dev_personal`/`stg` hold no values (emptied 2026-07-15) — nothing to rotate there.

## Guards

- `scripts/lib/assert-not-prod.sh` — fails fast if `SUPABASE_URL`/`DATABASE_URL` contains the prod ref. Wired into: `dev-standup.sh`, `setup-app-buckets.mjs`, `apply-manual.mjs`, `clone-closet-to-dev.mjs` (target side), `v0-verify.sh`.
- Deliberately **not** guarded (they are prod-ops tools — run them with `--config prd` on purpose, never casually): `backfill-*.ts`, `reenhance-flats.ts`, `delete-user-completely.ts`, `set-user-feature.ts`, seed scripts when reseeding prod content (`seed-stylist-content.mjs`, `prompts:sync`).

## CI

- Builds are env-free except the `NEXT_PUBLIC_SUPABASE_*` **placeholders** required at build time (the web app prerenders a Supabase client — `/en/builder` since v0). Both `ci.yml` and `prompt-eval.yml` set them (prompt-eval fixed 2026-07-15 after builder v0 exposed the gap).
- `prompt-eval.yml` runs real evals against the **dev** DB via `DOPPLER_TOKEN_DEV`; the standup seeds everything it needs (prompts, eval user).

## Supabase auth linking (prod, unchanged)

**"Allow account linking" stays ON** in the prod project — the Phase 11 migration depends on it; toggling it off silently breaks Google-OAuth ↔ pre-created-user matching. Validation harness: `packages/capabilities/scripts/validate-auth-linking.ts`. (Dev has no Google provider, so this doesn't apply there.)

## Things that should never be committed to git

- `.env*` files, `*-credentials.json`, Doppler service tokens, `SERVICE_ACCOUNT_SECRET` in fixtures, real AI keys in tests (use `MockProvider` from `@tela/ai`).

## Future hardening (not done yet)

- Per-environment Sentry DSNs + AI keys (cost/telemetry separation) — `environment` tag is the only separator today.
- Cofounder Doppler access (single-operator risk, deferred 2026-04-23).
- Scheduled rotation (90-day) for DB passwords + AI keys.
- A real `stg` someday: `scripts/dev-standup.sh stg` after populating an `stg` config.
