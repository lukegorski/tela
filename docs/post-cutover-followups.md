# Post-cutover follow-ups

Items that surfaced before, during, or shortly after the Phase 11 cutover but were out of scope for the cutover itself. This is the canonical tracking list — add new items here as they surface; don't bury them in session summaries.

*See also: [`phase-11-cutover-runbook.md`](./phase-11-cutover-runbook.md) for the cutover steps themselves; [`phase-14-admin-parity.md`](./phase-14-admin-parity.md) for the admin workstream that surfaced the latest UI-polish entry.*

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

- **OAuth popup R&D** — P2 (consider promoting to P1 once Phase B `getSession` caching lands).
  Current flow is full-page redirect. Popup would feel snappier and avoid the auth context flush. Two paths to investigate: (a) Supabase + COOP-compliant popup wrapper, (b) Google One Tap via `supabase.auth.signInWithIdToken`. Earlier popup attempt was reverted (commit `55bcb8c`) — re-attempt with lessons learned.

  **Dependency on "Session caching in `Provider.tsx`" (Performance & Reliability section below):** the root cause that killed the original popup attempt was `supabase.auth.getSession()` hanging under COOP constraints in the popup window, which broke every tRPC call because each one called `getSession()` to attach the JWT. The Phase B fix caches the session via `onAuthStateChange` and stops calling `getSession()` per-request, so that hang class no longer matters. Re-attempting popup R&D **after** Phase B is significantly lower risk. Sequence: Phase B → popup R&D viable → choose path (a) or (b) → ship snappier sign-in.

  Slight silver lining of the current redirect flow: the OAuth consent screen is fully prominent (vs. partially obscured inside a 500×600 popup), which made the Phase A branding work matter more — and the payoff is more visible.

  *Origin*: Phase 11 deployment session summary; dependency note added during Phase A.

- **Google Cloud OAuth branding** — `[DONE 2026-05-21]`.
  ~~Consent screen currently shows the raw Supabase project URL (`cyupcwfvtbfkupbdcoql.supabase.co`) as the app name. Update Google Cloud Console → OAuth consent screen to "Tela", upload logo, set authorized domains, fill out support email + privacy policy URL. Required before any public-facing launch.~~
  Shipped as Phase A. Console Branding fields populated (App name = "Tela", icon-only square logo uploaded, home + privacy + ToS URLs pointing at `https://telastyle.app/*`, authorized domains include `telastyle.app`, developer + support email set). Repo-side deliverables: (a) 5 standalone policy pages under `/(legal)/` route group (privacy, terms, cookies, biometric-policy, dmca) rendered with the Tela design system, (b) PNG logo assets under `apps/web/public/brand/`, (c) proxy.ts exemption so `/privacy` etc. don't get locale-redirected, (d) landing-page legal-consent line linking to `/terms` + `/privacy` so Google's home-page link check passes post-cutover.
  Commits: `3a056a2` (5 policy pages), `f69df26` (OAuth logo assets + render script), `fa2b7a9` (locale-redirect exemption for legal routes), `baa50a2` (landing-page legal-consent line), `a5101ab` (added the "OAuth app verification (post-cutover)" followup entry below).
  **Note:** branding deliverable is complete; *verification clearance* is a separate workstream tracked under "OAuth app verification (post-cutover)" because Google's "Verify branding" submission needs the URLs to resolve, which requires Phase 11 DNS cutover.
  *Origin*: Phase 11 deployment session summary.

- **OAuth app verification (post-cutover)** — P2 (dependent on Phase 11 cutover completion).
  Phase A saved the Branding fields (app name "Tela", logo, home/privacy/ToS URLs pointing at `https://telastyle.app/*`) but Google's "Verify branding" submission failed pre-cutover with two specific issues: (a) `telastyle.app` is not registered as owned by Luke in Google Search Console; (b) the home page at `https://telastyle.app/` does not include a link to the privacy policy URL — because telastyle.app is still served by the legacy Vercel app, which doesn't have the policy pages or the legal-consent line on the landing page that the new Railway service does.

  Both blockers resolve at/after Phase 11 cutover. Action sequence once cutover completes:
  1. Add `telastyle.app` as a property in [Google Search Console](https://search.google.com/search-console) (DNS TXT, HTML file, or HTML meta-tag verification — pick whichever is easiest with the DNS provider).
  2. Re-open Google Cloud Console → Google Auth Platform → Branding → Verify branding.
  3. Wait for Google's review (basic-scopes apps are typically reviewed within hours to ~1 day; brand verification can take longer if Google chooses to manually review).
  4. Until verification clears, the consent screen continues to show the OAuth client's auto-computed identifier (`cyupcwfvtbfkupbdcoql.supabase.co`) instead of "Tela" + logo. Existing users who have previously consented are not re-prompted, so the visible impact is on NEW signups only.

  *Origin*: Phase A execution surfaced both blockers when Luke clicked "Verify branding" pre-cutover; deferred because Google verifies against `telastyle.app/` which is still legacy until DNS cuts over.

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

- **Session caching in `Provider.tsx` (getSession timeouts)** — `[DONE 2026-05-21]`.
  ~~`supabase.auth.getSession() did not resolve within 10s` warning fires repeatedly in console. Defensive timeout falls back to no-auth → api 401s. App still works because of cached data + 30s staleTime, but degrades and muddies post-cutover monitoring (real 401s look like timeout 401s in logs). Fix: cache the session via `onAuthStateChange` instead of calling `getSession()` on every tRPC request. Non-trivial but real.~~
  Shipped as Phase B. Introduced `apps/{web,admin}/src/lib/auth-token-store.ts` — a module-scoped token cache written by useAuth's `onAuthStateChange` listener (covers INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED). tRPC's `headers()` and the chat-stream POST now read the token synchronously from the store via `waitForToken()` — a 1500ms bounded race that gracefully degrades to "no token, request 401s" rather than recreating the original 10s hang class. `signOut()` clears the store synchronously *before* awaiting `supabase.auth.signOut()` and calls `queryClient.cancelQueries()` so no in-flight authenticated work lingers post-sign-out.
  Verified: zero `did not resolve within 10s` warnings observed in browser console across post-deploy smoke tests on both `tela-web-development.up.railway.app` (sign in, navigate wardrobe/outfits/chat, sign out, cross-tab) and `tela-admin-development.up.railway.app` (sign in, view costs dashboard).
  Commits: `2445c40` (web — auth-token-store, useAuth, trpc/Provider, useChat), `e2182ec` (admin — verbatim mirror; the three touched files remain byte-identical between apps).
  *Origin*: Phase 11 deployment session summary.

## Observability

- **Sentry in `apps/web`** — P1.
  Client-side observability gap. `apps/api` has Sentry server-side; `apps/web` does not. We're monitoring blind for browser-side issues post-cutover — if a user reports "page is broken" we have no client-side stack traces. Wire `@sentry/nextjs` into apps/web; add `SENTRY_DSN` to web's env-var allowlist on Railway.
  *Origin*: Phase 11 deployment session summary + cutover runbook.

- **Next `<Image>` warnings + Supabase signed-URL 400s in browser console** — P2.
  Two related but distinct issues fire on any signed-in page that renders wardrobe / outfit / try-on images. They pollute the browser console (obscuring real errors during triage) and degrade image performance:

  1. **Signed-URL 400s.** Requests to `/_next/image?url=https%3A%2F%2Fcyupcwfvtbfkupbdcoql.supabase.co/storage/v1/object/sign/...` return 400 from Next's image optimizer. Likely cause: either the Supabase storage domain isn't whitelisted in `apps/web/next.config.ts`'s `images.remotePatterns`, or the optimizer mishandles the signed-URL query string. Functionally silent — `<Image>` falls back to the source URL so images do render — but we lose Next's resize/format/cache optimization on every wardrobe item. Performance cost scales with image count and viewport size.
  2. **`<Image>` prop misuse warnings.** Multiple instances of `fill` + `sizes="100vw"` mismatch (image not rendered at full viewport width), `fill` inside parents with invalid `position: static`, and an LCP-image without `loading="eager"`. Not user-visible but trips Next's dev overlay and adds noise to console during real-error triage.

  Fix path: (a) add Supabase storage host to `next.config.ts` `images.remotePatterns` and verify the optimizer can fetch signed URLs (may need a custom loader or to fall back to unoptimized for signed URLs); (b) audit `<Image fill>` call sites — set parent `position: relative`, set `sizes` to match the rendered breakpoint, and add `loading="eager"` (or `priority`) on the landing/wardrobe LCP image.
  *Origin*: surfaced repeatedly during Phase A + Phase B browser smoke tests on `tela-web-development.up.railway.app` (every wardrobe/outfit/chat page load reproduces it).

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
