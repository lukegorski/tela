# Post-cutover follow-ups

Items that surfaced before, during, or shortly after the Phase 11 cutover but were out of scope for the cutover itself. This is the canonical tracking list — add new items here as they surface; don't bury them in session summaries.

Each item has a severity, a short description, and the origin (where it was surfaced) for context.

**Severity legend**:
- **P1** — degrades user experience in a noticeable way; fix in next 2-4 weeks
- **P2** — tech debt or polish; fix when the surrounding code is touched anyway
- **P3** — long-term hygiene; no urgency

Marked `[DONE]` items are kept for historical context until the next housekeeping pass.

---

## Auth & Onboarding

- **Wildcard `?**` entries in Supabase Redirect URLs** — P2.
  Right now `useAuth.ts` and `generate-magic-link.ts` pass bare `redirectTo` so that deep-link return (`?next=...`) doesn't break the allowlist match. Adding `?**` wildcards in Supabase Auth → URL Configuration lets us restore deep-link UX (sign-in returns user to the page they were on, not the home page).
  *Origin*: phase-11 cutover runbook.

- **OAuth popup R&D** — P2.
  Current flow is full-page redirect. Popup would feel snappier and avoid the auth context flush. Two paths to investigate: (a) Supabase + COOP-compliant popup wrapper, (b) Google One Tap via `supabase.auth.signInWithIdToken`. Earlier popup attempt was reverted (commit `55bcb8c`) — re-attempt with lessons learned.
  *Origin*: Phase 11 deployment session summary.

- **Google Cloud OAuth branding** — P1.
  Consent screen currently shows the raw Supabase project URL (`cyupcwfvtbfkupbdcoql.supabase.co`) as the app name. Update Google Cloud Console → OAuth consent screen to "Tela", upload logo, set authorized domains, fill out support email + privacy policy URL. Required before any public-facing launch.
  *Origin*: Phase 11 deployment session summary.

## AI Quality

- **Role uniqueness in outfit generation** — P1.
  Outfit generation can produce role-duplicates (e.g., two tops in one outfit). Fix is two-part: (a) schema-level constraint preventing duplicate roles in `outfit_items`, (b) prompt update to discourage duplicates upstream. Affects every active user; one of the most common visible quality issues.
  *Origin*: Phase 11 deployment session summary (data quality issues in migrated user accounts).

- **Try-on model selection** — P1.
  Some try-on results come back with a male model, others female, regardless of the wardrobe owner's gender. Root cause unknown — could be Fashn API defaults, our `model_image_url` selection logic, or the migrated `tryOnSettings`. Investigate + fix the inconsistency.
  *Origin*: Phase 11 deployment session summary.

- **Try-on quality + failure handling** — P1.
  Belt-area artifacts on try-on images (Fashn AI quality, not our code), occasional outright failures, no auto-retry on Fashn errors. Improve: add retry-with-backoff on transient Fashn errors, surface clearer failure UX, evaluate whether to swap Fashn for a higher-quality provider.
  *Origin*: Phase 11 deployment session summary.

## Performance & Reliability

- **Session caching in `Provider.tsx` (getSession timeouts)** — P1.
  `supabase.auth.getSession() did not resolve within 10s` warning fires repeatedly in console. Defensive timeout falls back to no-auth → api 401s. App still works because of cached data + 30s staleTime, but degrades and muddies post-cutover monitoring (real 401s look like timeout 401s in logs). Fix: cache the session via `onAuthStateChange` instead of calling `getSession()` on every tRPC request. Non-trivial but real.
  *Origin*: Phase 11 deployment session summary.

## Observability

- **Sentry in `apps/web`** — P1.
  Client-side observability gap. `apps/api` has Sentry server-side; `apps/web` does not. We're monitoring blind for browser-side issues post-cutover — if a user reports "page is broken" we have no client-side stack traces. Wire `@sentry/nextjs` into apps/web; add `SENTRY_DSN` to web's env-var allowlist on Railway.
  *Origin*: Phase 11 deployment session summary + cutover runbook.

## Infrastructure

- **Promote to `tela/prd` Doppler config + separate Supabase project** — P2.
  Pre-launch we accepted shared dev/prod infrastructure (Doppler `tela/dev` for everything, single Supabase project for all data). Real prod hygiene: separate Doppler config, separate Supabase project, blast-radius isolation. Re-evaluate at 100-user or revenue milestone — not urgent at current scale.
  *Origin*: Phase 11 deployment session summary + cutover runbook.

- **`SERVICE_ACCOUNT_SECRET` real value** — `[DONE for dev/dev_personal]` `[deferred: stg/prd]`.
  ~~Currently the literal string `openssl rand -hex 32` — placeholder bug, blocks service-account auth.~~ Rotated to a real 32-byte hex value in Doppler `tela/dev` and `tela/dev_personal` on 2026-05-19. `tela/stg` and `tela/prd` configs intentionally left without the secret set — to be configured when those environments are stood up (the failing endpoint will signal what's missing then).
  *Origin*: Phase 11 deployment pre-flight inventory.

## Tech Debt

- **Three dead-code `postgres()` clients in `apps/web/src/lib/`** — P2.
  `profile.ts`, `chat.ts`, `users.ts` each instantiate their own `postgres()` client with no callers found. They're pgbouncer-naive (no `prepare: false` per pitfall #14) so if anyone wires them up later they'll quietly regress under load. Either wire them up properly via `@tela/db`'s `getDb()` (which has the pgbouncer fix) or delete the files.
  *Origin*: Phase 11 deployment session summary + cutover runbook.

- **Migration script UX message** — P3.
  `packages/capabilities/scripts/migrate-user-from-legacy.ts:566` promises "style profile will regenerate on first generate." That's actually true now thanks to the lazy-init in commit `25779f5`, but the wording predates the fix and could be clearer. Update to reflect the verified behavior.
  *Origin*: phase-11 cutover runbook.

## UI Polish

- **Visual polish pass on `apps/admin` (Phase 14a Option B)** — P2.
  The `fd4b451` page JSX shipped as-is per Option B (ship-then-polish). The pages are denser than legacy admin (extra columns: chats / generations / spend, absolute dates, no avatars, all E2E test users visible). Keep the extra columns (genuinely useful for admin triage — legacy's minimal shape was a Firestore-query constraint, not a UX choice), but polish: add avatar circles (letter or `supabase avatar_url`), tighten typography + spacing, switch absolute dates to relative (`11d ago`), add a toggle to hide E2E test rows (`@tela.test` email suffix). Applies to all 5 existing pages (users, costs, examples, prompts, rules). ~0.5-1 day of UI work.
  *Origin*: Phase 14a ship (Luke's first Railway smoke test of the new admin) — added in commit `cbd104c`.

---

## When to consult this file

- **Before each cutover-style milestone**: scan the list for items that would muddy monitoring or block the milestone (e.g., getSession caching for monitoring clarity, Sentry-in-web for any user-facing launch).
- **When planning a sprint or quiet week**: pick 2-3 P1s with related context (e.g., all the AI quality items in one focused pass).
- **After surfacing a new item**: add it here with severity + origin. Don't rely on session summaries to preserve it — those scroll out of context.
