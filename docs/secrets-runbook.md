# Secrets Runbook

Last updated: 2026-04-23 (Phase 5)

## Where secrets live

| Layer | What | Who has access |
|---|---|---|
| **Doppler** (`tela` project, `dev` config) | Source of truth for all secrets | Luke (owner) |
| **Railway** (development env) | Auto-synced from Doppler via the Doppler-Railway integration | Luke |
| **Supabase** dashboard | Auth provider configs (Google client secret, etc.) | Luke |
| **GCP Console** | OAuth client secret (single source for Google sign-in) | Luke |
| **OpenAI dashboard** | API key (only place to revoke/rotate) | Luke |
| **GitHub Actions secrets** | None yet (CI doesn't need any) | — |

## Active secrets in Doppler

| Name | Type | Used by |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | API (capabilities, migrations) |
| `SUPABASE_URL` | Public | API, MCP, scripts |
| `SUPABASE_PUBLISHABLE_KEY` | Public | Future frontend client |
| `SUPABASE_SECRET_KEY` | Private (admin) | API auth middleware, capabilities, scripts |
| `OPENAI_API_KEY` | Private | AI gateway |
| `SENTRY_DSN` | Public-ish | Error tracking |
| `SERVICE_ACCOUNT_SECRET` | Private | Validates `service_<source>:<userId>:<secret>` tokens for MCP/workers/scripts |
| `OPENWEATHERMAP_API_KEY` | Optional | Weather in `context.assemble` |
| `NODE_ENV`, `LOG_LEVEL`, `PORT` | Config | Runtime config |

## Rotation procedures

### `OPENAI_API_KEY` leaked

1. https://platform.openai.com/api-keys → revoke the leaked key
2. Generate a new key, name it `tela-foundation-rotated-YYYY-MM-DD`
3. Update in Doppler dev config
4. Doppler auto-syncs to Railway → triggers a redeploy
5. Verify: `curl https://tela-development.up.railway.app/health` should still work; check Sentry for any 401s in the next 5 minutes

### `SUPABASE_SECRET_KEY` leaked

1. Supabase dashboard → Settings → API Keys → revoke and regenerate the secret key
2. Update in Doppler dev config
3. Doppler syncs to Railway
4. Verify by running `doppler run -- node apps/api/scripts/e2e-test.mjs <image>` — full flow should still work

### `SERVICE_ACCOUNT_SECRET` leaked

1. Generate a new one: `openssl rand -hex 32`
2. Update in Doppler dev config
3. Doppler syncs to Railway
4. **Any local MCP servers / scripts using the old token will stop working** — re-issue tokens to whoever needs them

### `DATABASE_URL` leaked (password compromised)

1. Supabase dashboard → Settings → Database → reset database password
2. Get the new pooler connection string from the "Connect" panel
3. Update `DATABASE_URL` in Doppler dev config (note: the password is the only changing part)
4. Doppler syncs to Railway → redeploy
5. Verify with health check + e2e test

### Google OAuth secrets leaked

1. GCP Console → OAuth client → Reset client secret (note: this immediately invalidates all in-flight OAuth flows)
2. Copy the new client secret
3. Update in Supabase dashboard → Authentication → Providers → Google → Client Secret
4. Save. Existing signed-in user sessions remain valid; new sign-ins use the new secret.

### Doppler workspace token leaked (CI use)

We don't have a CI Doppler token configured yet. If we add one (for running migrations from CI, etc.), the rotation path is:

1. Doppler dashboard → Tokens → revoke the leaked token
2. Generate new token
3. Update GitHub repo secret
4. Re-run any failed CI workflows

## "Luke's laptop is stolen" runbook

Worst-case scenario. Execute in this order:

1. **Doppler:** Rotate the access token from another machine. Settings → Personal Access Tokens → revoke all sessions.
2. **GitHub:** Revoke any active sessions; reset password.
3. **Railway:** Same.
4. **Supabase:** Reset DB password (forces all DB connections to re-auth). Rotate API keys.
5. **OpenAI:** Revoke any keys created on the laptop; create new one.
6. **GCP:** Reset the Google OAuth client secret (invalidates Google sign-in until updated in Supabase).
7. **GitHub repo:** Audit recent commits for any accidentally-committed secrets.
8. **Update Doppler** with all new secrets so Railway redeploys with fresh credentials.
9. **Disable the laptop** in iCloud Find My + remote-wipe if possible.

Most of these can be done in parallel. Worst-case downtime: ~15 minutes for telastyle.app's new stack.

## Single point of failure

**Cofounder Doppler access deferred** (2026-04-23). Until that's set up, only Luke can rotate secrets or fix infrastructure issues. Revisit before launch or before any meaningful user growth.

## Things that should never be committed to git

- `.env`, `.env.local`, `.env.production` files (gitignored, but be careful with `.env.example`)
- Files matching `*-credentials.json`
- Doppler service tokens
- The `SERVICE_ACCOUNT_SECRET` in any test fixture or example
- Real OpenAI keys in test fixtures (use the mock provider via `MockProvider` from `@tela/ai`)

## Future hardening (not done yet)

- Sentry DSN per environment (currently same DSN for dev and future prod)
- Per-environment Supabase projects (currently dev shares with what will become prod — staging needs its own project before launch)
- Automated secrets rotation on a schedule (90-day rotation for DB password and OpenAI key)
- Doppler audit log monitoring (alert on unusual access patterns)
