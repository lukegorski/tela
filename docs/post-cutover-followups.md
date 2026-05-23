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

- **OAuth app verification (post-cutover)** — `[DONE 2026-05-22]`.
  ~~Phase A saved the Branding fields (app name "Tela", logo, home/privacy/ToS URLs pointing at `https://telastyle.app/*`) but Google's "Verify branding" submission failed pre-cutover with two specific issues: (a) `telastyle.app` is not registered as owned by Luke in Google Search Console; (b) the home page at `https://telastyle.app/` does not include a link to the privacy policy URL — because telastyle.app is still served by the legacy Vercel app, which doesn't have the policy pages or the legal-consent line on the landing page that the new Railway service does.~~

  Re-submitted on 2026-05-22 after Phase 11 cutover resolved both blockers (telastyle.app now served by Railway with the full landing page including the legal-consent line + privacy/ToS pages reachable). Google approved within hours — basic-scopes auto-review path, no manual brand review needed. Consent screen now shows "Tela" + logo + verified status. Removes the "Google hasn't verified this app" warning that was a real abandonment vector for re-engaged users on first sign-in.

  *Origin*: Phase A execution surfaced two blockers pre-cutover; deferred until cutover resolved both (Search Console domain verification + privacy URL reachability via new Railway-served landing page).

## AI Quality

- **Role uniqueness in outfit generation** — `[DONE 2026-05-21]`.
  ~~Outfit generation can produce role-duplicates (e.g., two tops in one outfit). Fix is two-part: (a) schema-level constraint preventing duplicate roles in `outfit_items`, (b) prompt update to discourage duplicates upstream. Affects every active user; one of the most common visible quality issues.~~
  Shipped as a three-layer defense. (a) Insertion-side dedup in `outfit/generate.ts` drops AI-emitted role-duplicates pre-insert, telemetered via new `outfit.role_duplicate_dropped` event. (b) Partial unique index `outfit_items_outfit_role_unique ON (outfit_id, role) WHERE role <> 'accessory'` shipped in migration `0016_outfit_items_role_unique` — `accessory` exempt because necklaces/rings/scarves legitimately repeat. (c) New `outfit.generate` prompt version `4178166d` adds an explicit Hard rule: "AT MOST ONE item per role…the only repeatable role is accessory"; markdown source `packages/prompts/templates/outfit.generate.md` updated in lockstep so future syncs preserve the change.
  Pre-flight DB audit found zero existing duplicate-role outfit_items, so no cleanup workstream was needed. Verification script `scripts/verify-role-uniqueness.ts` ran 20 generations against Luke's wardrobe: 23 new outfits, ZERO duplicate non-accessory roles, ZERO `role_duplicate_dropped` events (prompt change is biting at the LLM level — dedup is belt-and-suspenders only). Total cost 35.25¢, avg 3.20¢/generation. Constraint-fires-correctly proven via direct psql insert test (rejected the duplicate-`top` insert; allowed the duplicate-`accessory` insert).
  Commits: `b60e62d` (insertion dedup + outfit.role_duplicate_dropped event type — swept into the parallel 14c session's "feat(ai): Anthropic provider" commit by a `git commit -a` race; the outfit/events changes are functionally identical to what they would have been as a standalone commit), `947bece` (migration 0016 + schema partial unique index), `b64b499` (prompt template + one-shot promote script), `e8a5a5c` (verify-role-uniqueness harness).
  *Origin*: Phase 11 deployment session summary (data quality issues in migrated user accounts).

- **Dress + (top|bottom) mutual exclusion** — audit complete, no follow-up needed (2026-05-21).
  Pre-flight P2 audit of the role-uniqueness session checked for outfits that contain a `dress` AND a `top` or `bottom`. Result: ZERO across 37 outfits in dev DB. The existing prompt phrasing "(top OR dress) AND (bottom OR dress) AND shoes" appears to be enough — the AI consistently treats dress as a top+bottom substitute rather than additive. Re-audit if visible regressions surface.

- **Upgrade `outfit.generate` to OpenAI structured outputs** — P2.
  Today `outfit.generate` calls the AI gateway with `responseFormat: 'json'` — that's OpenAI's `json_object` mode (free-form JSON, schema enforced after the fact via zod). OpenAI also supports `response_format: { type: 'json_schema', schema: {...} }`, which constrains the model's sampling to the schema at generation time. Upgrading would let us express role-uniqueness (and item-id-from-set-X constraints, count constraints, etc.) structurally in one place, replacing the current three-layer prompt+dedup+constraint defense with one upstream guardrail. Refactor scope: `packages/ai/src/providers/openai.ts` would need a new `responseFormat: 'json_schema'` branch, and each capability that opts in (`outfit.generate`, `item.analyze`, potentially others) supplies a JSON Schema alongside its zod schema. Worth doing once we have ≥2 capabilities that would benefit; YAGNI for a single user right now.
  *Origin*: surfaced during the role-uniqueness session 2026-05-21 — was considered as a fix path, deferred because the three-layer defense is sufficient and the structured-outputs refactor is broader than this bug warranted.

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

- **Sentry in `apps/web`** — ✅ DONE (2026-05-21).
  `@sentry/nextjs@10.53.1` wired into apps/web. Three init files in `src/`: `instrumentation-client.ts` (Turbopack-friendly replacement for the deprecated `sentry.client.config.ts`), `instrumentation.ts` (server/edge runtime branching), `sentry.server.config.ts`, `sentry.edge.config.ts`. PII scrubbing (`src/lib/sentry-scrub.ts`) strips Supabase signed-URL tokens + tRPC bodies for chat/profile/wardrobe paths per `/privacy` lines 161-170. `global-error.tsx` reports root-level render crashes. User context attached inside `useAuth.ts` onAuthStateChange — `id` only, no email. `next.config.ts` wrapped with `withSentryConfig`. `apps/api/src/sentry.ts` gained matching `tracePropagationTargets` so chat-stream errors show as one distributed trace across web + api.
  Build-time env vars required by Railway web service: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`. Without `SENTRY_AUTH_TOKEN` at build, source maps don't upload and stack traces stay minified — see Doppler/Railway hand-off below.
  *Origin*: Phase 11 deployment session summary + cutover runbook.

- **Sentry on `apps/admin`** — ✅ DONE (2026-05-22).
  Mirror of the apps/web wiring (commits `03f84ad` + `456c99b`) shipped onto apps/admin. `@sentry/nextjs@10.53.1` pinned (matching web — no SDK drift across surfaces). Four init files mirror web verbatim with admin-specific DSN env (`NEXT_PUBLIC_SENTRY_DSN_ADMIN`): `instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`. `global-error.tsx` shipped verbatim. PII scrubbing (`src/lib/sentry-scrub.ts`) is admin-flavored — two paths instead of web's five: `/api/trpc/capability.execute` (catch-all admin tRPC) + `/admin/chat/stream` (admin SSE endpoint where cofounder queries may include user emails). Doppler env convention is suffixed (`NEXT_PUBLIC_SENTRY_DSN_ADMIN`, `SENTRY_PROJECT_ADMIN`) so the existing `tela/dev` config can sync to all Railway services without value collisions; auth token + org remain shared (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`). `apps/api/src/sentry.ts` appended admin URLs to `tracePropagationTargets` so admin→api distributed traces work; web's existing entries untouched. User context attaches `id` only inside admin's `useAuth.ts` — mirror of web pattern, no email per `/privacy` lines 161-170.
  Verified post-deploy on `tela-admin-development.up.railway.app`: TELA-ADMIN-1 (client setTimeout error), TELA-ADMIN-2 + TELA-ADMIN-3 (server-side render + DB-error from malformed UUID route, both correlated under one trace ID) all captured. User context = `id` only. Server-side `release` tag populated with merge SHA. Same-trace correlation working (`TELA-ADMIN-2` and `TELA-ADMIN-3` linked via Trace Preview).
  Commits: `df8d51d` (admin instrumentation + scrub + global-error + useAuth setUser + next.config wrap), `887bdb5` (apps/api tracePropagationTargets append).
  Two issues surfaced during validation, deferred as separate followups below: (a) source maps + client-side release tag NOT working under Turbopack — see "Source map upload + client release tag under Turbopack" entry; (b) `/admin/chat/stream` PII scrub validation can't run yet because the AdminAiChat UI surface lives on `feat/14c-ui` (not merged to main) — see "Admin PII scrub validation post-14c-ui merge" entry.
  *Origin*: post-Sentry-in-web follow-up.

- **Source map upload + client release tag under Turbopack** — P2. Affects both `apps/admin` AND likely `apps/web`.
  Discovered during admin Sentry validation 2026-05-22. Sentry events show **minified stack traces** for both client browser chunks (`app:///_next/static/chunks/Oh3cir7712.22.js:7:4744 in n`) and server SSR chunks (`app:///_next/server/chunks/ssr/[root-of-the-server]_..._O2u-koe-...js:45:2280 in X`). All four build-time env vars (`NEXT_PUBLIC_SENTRY_DSN_ADMIN`, `SENTRY_PROJECT_ADMIN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`) confirmed present on Railway at build time, ruling out the original PF2 suspicion. The Sentry events carry `turbopack: True` — Next 16's default bundler — and the `@sentry/nextjs` v10.x webpack-plugin-style source-map upload path doesn't fire under Turbopack with the current `withSentryConfig` options shape. Same likely true for `apps/web` (also Next 16 + Turbopack) — confirm by inspecting a recent `tela-web` event's stack trace; if also minified, fix benefits both surfaces in one pass.
  Related symptom from the same root: client-side events (TELA-ADMIN-1, captured via `window.onerror` on a browser setTimeout throw) had **no `release` tag**, while server-side events (TELA-ADMIN-3, captured via `captureRequestError` in the Node runtime) DID have `release: 687bdb585147`. `RAILWAY_GIT_COMMIT_SHA` is being injected at build, but the value isn't reaching the client bundle under Turbopack — probably the same plugin-doesn't-run-under-Turbopack issue.
  Fix paths to investigate: (a) add `productionBrowserSourceMaps: true` to `next.config.ts` (forces browser source-map emission, may be the missing piece under Turbopack); (b) check `@sentry/nextjs` v10 Turbopack-specific config — `unstable_sentryWebpackPluginOptions` or `turbopack: {}` options block; (c) verify Sentry CLI source map upload runs as a build step. Estimate: 1-2 hours of investigation + a single-commit fix once root cause identified.
  *Origin*: surfaced during apps/admin Sentry DoD verification 2026-05-22.

- **AdminAiChat tool errors + SSE errors silently swallowed before Sentry** — P1 (most-urgent observability gap; the original "cofounder uses AdminAiChat, Luke gets a stack trace" motivation is only half-met without this fix).
  Surfaced 2026-05-22 after `feat/14c-ui` merged and the live PII-scrub validation became runnable. Two parallel tests against the deployed AdminAiChat both produced **zero new Sentry events** despite errors visibly occurring:
  (a) **Tool exception** — sent a message that triggered `admin.listUsers` (which is currently broken on main, see separate Admin Tooling entry below). The tool threw a Postgres "Failed query" error. The AI handled it gracefully (called fallback `admin.getDashboardStats`, replied in natural language asking for the user ID directly), the SSE stream completed normally — and apps/api's Sentry got nothing. Root cause: `streamChatTurn` in apps/api catches tool exceptions and converts them to "tool error" results consumed by the LLM, but never calls `Sentry.captureException` on the original throw. Tool errors are visible to the AI (good UX) but invisible to Luke (bad triage).
  (b) **Forced SSE abort** — sent a PII-bearing message, then hit ⌘+R hard mid-stream. The expected `AbortError` / network-error never surfaced as a Sentry event on the admin (client) side. Likely causes: (i) the AdminAiChat SSE consumer catches and swallows AbortError as "expected user cancellation," (ii) the page unloads before the SDK can flush the envelope, or (iii) both. Either way: no event lands.
  Implication: the SDK is fully wired and works for any "normal" unhandled error in admin (proven by TELA-ADMIN-1/2/3), but **the most-instrumented-around code path in the admin codebase — the chat surface — needs explicit capture calls to participate in Sentry visibility.**
  **Fix shape**:
  - **apps/api `streamChatTurn`**: in each tool-error catch block, call `Sentry.captureException(err, { tags: { tool: toolName, conversation_id, is_admin_chat: true }, level: 'error' })` before converting to tool-error result. Naturally limits to admin chat via the `is_admin_chat` tag.
  - **apps/admin AdminAiChat SSE consumer**: in the fetch/stream catch block, skip user-initiated cancellation (`err.name === 'AbortError'` with a flag confirming user-initiated) but capture everything else with `Sentry.captureException(err); await Sentry.flush(2000)`. The `flush(2000)` is important — without it, hard-refresh races send-vs-unload and the envelope never gets POSTed.
  - **Side benefit**: once captured, this is where the PII-scrub gets a real live test target (the chat-stream URL with PII body becomes a breadcrumb in the captured event). Closes the deferred scrub-validation followup at the same time.
  **Scope estimate**: 1-2 hours including investigation of exact catch sites + a smoke test post-deploy. Replaces the original P3 "Custom AdminAiChat Sentry instrumentation" placeholder from the apps/admin prompt's NO SCOPE CREEP section, upgraded to P1 because today's tests proved the gap is not aesthetic ("deeper context for streaming-specific bugs") but fundamental ("the chat surface is invisible to Sentry today").
  *Origin*: apps/admin Sentry DoD validation 2026-05-22 — surfaced when the originally-deferred PII-scrub test (bound to 14c-ui merge) ran and revealed the broader capture-layering gap.

- **Admin `/admin/chat/stream` PII scrub live validation** — superseded by the entry above; not closeable independently.
  The admin sentry-scrub (`apps/admin/src/lib/sentry-scrub.ts`) is shipped and identical-in-shape to apps/web's verified version. The 2-path admin variant covers `/api/trpc/capability.execute` + `/admin/chat/stream`. Live validation requires a real Sentry event from a chat-stream call carrying PII in the body — but as the entry above documents, no such event lands in Sentry today because both server-side and client-side error paths swallow exceptions silently. **Once the P1 capture-gap fix above ships**, the natural test runs end-to-end: send PII message → tool errors or stream aborts → Sentry event lands → confirm HTTP Request body shows `[SCRUBBED]` (NOT the email). Until then, trust by parity with apps/web's verified impl (which is structurally identical modulo the 2-vs-5 path list).
  *Origin*: surfaced during apps/admin Sentry DoD verification 2026-05-22 — originally tracked as a P3 bound to `feat/14c-ui` merge; merge happened, validation ran, and surfaced the broader capture-gap dependency.

- **Sentry IP-derived geography vs privacy-policy commitment** — P3.
  Sentry events show `User.Geography: Tlalpan, Mexico (MX)` derived server-side from the request IP. This is Sentry default behavior — the SDK doesn't send geo, Sentry's ingest pipeline computes it from the request's IP. The privacy policy at `/privacy` lines 161-170 commits to `user_id` being the only identifier retained in Sentry. Coarse IP-derived geography is technically PII (city-level location). Two reasonable resolutions: (a) set `sendDefaultPii: false` explicitly + add `beforeSend` step that strips `event.user.geo` + `event.user.ip_address` — buys full alignment with the existing policy text; (b) update the privacy policy to acknowledge that IP-derived coarse geography is captured by Sentry server-side (more accurate description of behavior, no code change). Decision should be made deliberately, not silently — current state is a minor mismatch between policy text and behavior. ~30 minutes either way.
  *Origin*: surfaced during apps/admin Sentry DoD verification 2026-05-22.

- **`apps/api` `beforeSend` PII scrubbing** — P2.
  apps/api Sentry has no PII scrubbing today. The `/admin/*` + capability error paths capture `Authorization` headers + signed URLs that should be scrubbed for consistency with apps/web. Mirror `apps/web/src/lib/sentry-scrub.ts` shape inside an api-side equivalent. ~1 hour.
  *Origin*: post-Sentry-in-web follow-up — flagged while wiring apps/web.

- **Sentry session replay** — P3.
  Paid feature, deferred until users return and real bug-triage value justifies cost. Note: `@sentry/nextjs` v10 makes Replay opt-in (not in default integrations), so adding it later is a single-line change in `instrumentation-client.ts`.
  *Origin*: post-Sentry-in-web follow-up.

- **Sentry tunnel route** — P2.
  Bypass ad blockers (uBlock Origin et al. block Sentry by default). Real concern for public audience; deferred until launch traffic exists. Configure `tunnelRoute` in `next.config.ts` `withSentryConfig` options. ~1 hour.
  *Origin*: post-Sentry-in-web follow-up.

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

## Admin Tooling

Items surfaced during Phase 14b parity work and the chat-dashboard redesign. Phase 14c (AdminAiChat + DNS cut) is a tracked workstream, not a follow-up — see [`phase-14-admin-parity.md`](./phase-14-admin-parity.md).

- **`admin.listUsers` correlated-subquery SQL bug — AdminAiChat user-lookup tool non-functional** — `[DONE 2026-05-22]`.
  ~~The SQL constructed by the `admin.listUsers` capability emits `WHERE ci.user_id = "id"` (and similar in 4 other correlated subqueries: outfits, chat_messages with `is_admin_chat = false`, generations count, generations cost sum). Postgres interprets the double-quoted `"id"` as a column identifier (PG's standard double-quote convention), tries to resolve it within the subquery's local scope, fails, and throws "Failed query." The intended construct was `WHERE ci.user_id = users.id` — a correlated reference to the outer `users` row, qualified with the table alias.~~
  ~~Symptom (observed in the chat panel 2026-05-22): cofounder asks "find the user with email luke@lukegorski.com" → AI invokes `admin.listUsers` → tool returns Failed query error → AI gracefully falls back to `admin.getDashboardStats` (success but doesn't have user-lookup data) → AI replies asking the user to provide the user ID directly.~~
  Fix landed in commit `f729b5e` (`fix(admin): correlated subquery column refs in admin.listUsers`). Diagnosis was confirmed empirically by capturing `query.toSQL()` output — Drizzle's `${users.id}` interpolation inside a `sql` template that lives **inside a SELECT projection** emits the bare column name (`"id"`), not the qualified `"users"."id"`. Postgres can't disambiguate it from the subquery's local scope and throws `column reference "id" is ambiguous` (not the more generic "Failed query" — the original Sentry-less observation conflated Drizzle's wrapping error with the underlying PG error). **Fix shape**: option (a) from the original spec (Drizzle column-ref helper) turned out to be the broken pattern itself; only option (b) (`sql.raw('users.id')`) works. The fix hoists a single `outerUserId = drizzleSql.raw('users.id')` constant and substitutes it into all 5 subqueries. Verified locally + against deployed `tela-api` via tRPC service-account call: 29 users returned, Luke's counts populated correctly (18 items / 25 outfits / 31 non-admin chat messages / 65 generations / $1.24 spend).
  **Sister bugs spotted during diagnosis** (see new entries below for `admin.listPrompts` and `admin.getChatOverview`): the same Drizzle quirk silently affects other admin capabilities — `listPrompts` returns `versionCount: 0` for every prompt (subquery's `"id"` resolves to `pv.id` locally, comparing two different UUIDs in the same row → never matches) and `getChatOverview` has similar shape risk in its per-conversation cost subquery. Tracked separately so future cleanup can apply the same `sql.raw(...)` pattern.
  *Origin*: cofounder workflow test 2026-05-22 during the apps/admin Sentry DoD validation session.

- **`admin.listPrompts` silent wrong-count from same Drizzle quirk** — `[DONE 2026-05-22]`.
  ~~`packages/capabilities/src/admin/listPrompts.ts:50-51` uses the same `${prompts.id}` interpolation inside a SELECT-projection `sql` template that broke `admin.listUsers`. Empirically verified during the `listUsers` fix session: the emitted SQL is `WHERE pv.prompt_id = "id"` and `"id"` resolves to the *subquery's local* `pv.id` (because `prompt_versions` has its own `id` column), so the comparison becomes `pv.prompt_id = pv.id` — two unrelated UUIDs in the same row, never equal. Result: every prompt's `versionCount` returns 0 (verified across all 6 prompts in dev DB) and `latestUpdatedAt` returns null.~~
  Fix landed in two commits. (a) `19703bf` — applied the same `outerPromptId = drizzleSql.raw('prompts.id')` const-hoist pattern as `f729b5e` to both `versionCount` and `latestUpdatedAt` subqueries. SQL now emits `WHERE pv.prompt_id = prompts.id` (qualified). (b) `85376a8` — secondary fix: with the Drizzle bug resolved, the `MAX(pv.created_at)` aggregate started returning real timestamps, but postgres-js returns them as ISO strings (not Date objects) because Drizzle's type-coercion doesn't apply to hand-rolled `sql<Date | null>` template return types. The pre-existing `r.latestUpdatedAt.toISOString()` call therefore threw `TypeError`, hidden until 19703bf because the broken subquery always returned null and the ternary took the null branch. Wrapped with `new Date(r.latestUpdatedAt as string | Date).toISOString()` — same shape `apps/admin/src/lib/admin-prompts.ts:63` already used.
  Verified locally + against deployed `tela-api` via tRPC service-account call: all 6 prompts return real version counts (3-7 each) and proper ISO timestamps. The `/admin/prompts` page was never affected by either bug — it uses a separate Path A lib helper (`apps/admin/src/lib/admin-prompts.ts`) with correctly-aliased raw SQL. The capability is consumed only via `chatTool: true` exposure to AdminAiChat, so the fix restores the chat-tool path for listing prompt version metadata.
  *Origin*: discovered during diagnosis of the `admin.listUsers` P1 fix session 2026-05-22 (commit `f729b5e`).

- **`admin.getChatOverview` correlated subquery shape risk** — `[DONE 2026-05-22]` *(Drizzle hypothesis falsified; separate Date-string bug fixed)*.
  ~~`packages/capabilities/src/admin/getChatOverview.ts:96, 103, 113` use the same Drizzle interpolation pattern (`${users.id}`, `${chatConversations.id}`) inside SELECT-projection `sql` templates. Line 113's subquery has both `chat_messages m` and `generations g` aliased in scope — `"id"` would be **ambiguous** there (same shape as the original `admin.listUsers` failure)... Lines 96/103's subquery is `FROM generations` only — `"id"` would resolve to `generations.id` locally (silent wrong-count, like `listPrompts`), meaning per-user chat costs are always 0.~~
  **Empirical finding contradicts the hypothesis.** `.toSQL()` capture during the `admin.listPrompts` fix session showed all 3 sites emit *qualified* outer-row refs (e.g. `WHERE user_id = "users"."id"`, `WHERE m.conversation_id = "chat_conversations"."id"`). Drizzle's qualification behavior is outer-FROM-shape-dependent: single-table outer (`from(prompts)`, `from(users)`) emits the bare `"id"` that breaks; multi-table outer (`from(chatConversations).innerJoin(users, ...)` in this file) auto-qualifies because Drizzle has to disambiguate. Local capability calls returned real values (Luke at `chatCostCents: 4.82`, one of two conversations at `chatCostCents: 0.12`). **No Drizzle fix needed.** Brittle to future query-shape changes (if the `innerJoin(users)` is ever removed, the bug would surface), but per the no-preemptive-wrapping rule we leave it.
  **A different bug was found instead**: same string-vs-Date class as 85376a8. `MAX(${chatConversations.lastMessageAt})` aggregate at line 97 returns the timestamp as an ISO string, but the `.map()` callback at line 138 called `r.lastActiveAt.toISOString()` directly, throwing `TypeError` on every successful aggregate. (The other two date conversions in the file — `createdAt`, `lastMessageAt` — use direct Drizzle column refs which DO get type-coerced to Date, so they were already correct.) Fixed in `c63ed5d` with the same `new Date(... as string | Date).toISOString()` wrap. Verified deployed: full payload populated (stats `$4.82` total, perUser Luke at `$4.82` + ISO `lastActiveAt`, 2 recent conversations with real per-conversation costs).
  *Origin*: discovered during diagnosis of the `admin.listUsers` P1 fix session 2026-05-22 (commit `f729b5e`).

- **Chat overview correlated-subquery scaling** — P3.
  `admin-chat-overview.ts` computes per-user chat cost and per-conversation cost via correlated subqueries (one aggregation per output row). Cheap at current scale (2 conversations) but the cost-per-conversation subquery runs once per row in the recent-conversations feed (capped at 20) and the per-user chat-cost subquery runs once per user-with-chats. When conversation volume reaches the low hundreds, rewrite as a single left-join + group-by on `chat_messages` → `generations` so the planner does one pass. Same shape applies to `admin-user-conversations.ts`.
  *Origin*: noted during Phase 14b chat-dashboard redesign self-critique.

- **Full-text search across chat messages** — P2.
  Once chat volume grows past ~50 conversations, the "recent 20" feed isn't enough — admin will want "find all conversations mentioning returns" or "users complaining about try-on quality." Add a Postgres `tsvector` index on `chat_messages.content`, a `messages.search?q=...` capability, and a search box on `/admin/chat`. Skipped in 14b chat redesign as YAGNI at current scale.
  *Origin*: noted during Phase 14b chat-dashboard redesign self-critique.

- **Chat quality signals** — P2.
  Real admin value when the user base grows: tool-call failure rate per user, conversations with N+ assistant turns and no user reply (frustrated drop-off signal), per-user spend trajectory (week-over-week chat cost change), hallucination flags (assistant message with no tool call mentioning items not in the user's wardrobe). Each is a focused aggregation on top of `chat_messages` + `chat_messages.tool_calls`. Most are cheap to add once there's enough signal to act on (>10 active chat users).
  *Origin*: noted during Phase 14b chat-dashboard redesign self-critique.

## UI Polish

- **Visual polish pass on `apps/admin` (Phase 14a Option B)** — P2.
  The `fd4b451` page JSX shipped as-is per Option B (ship-then-polish). The pages are denser than legacy admin (extra columns: chats / generations / spend, absolute dates, no avatars, all E2E test users visible). Keep the extra columns (genuinely useful for admin triage — legacy's minimal shape was a Firestore-query constraint, not a UX choice), but polish: add avatar circles (letter or `supabase avatar_url`), tighten typography + spacing, switch absolute dates to relative (`11d ago`), add a toggle to hide E2E test rows (`@tela.test` email suffix). Applies to all 5 existing pages (users, costs, examples, prompts, rules). ~0.5-1 day of UI work.
  *Origin*: Phase 14a ship (Luke's first Railway smoke test of the new admin) — added in commit `cbd104c`.

- **AdminAiChat polish + UX gaps (Phase 14c)** — P2.
  The 14c chat UI shipped functional but minimal. Known gaps from the local smoke pass: (a) streaming-turn assistant message has no per-turn cost/model badge until the conversation is re-fetched (the `done` SSE event doesn't include `model`; transcript hydrates on next mount); (b) iOS Safari SSE drops mid-stream on tab backgrounding surface a generic "Connection lost — try again" rather than auto-reconnecting; (c) sidebar bump after `done` is fire-and-forget — silently stale if the refresh fails; (d) no markdown rendering in assistant bubbles (plain `whitespace-pre-wrap`) — legacy had a lightweight `**bold**` / `*italic*` / bullet renderer; (e) tool-call cards show ✓/✗ + JSON args verbatim (legacy mapped tool names to human-readable phrases like "Querying users"). Bundle with the broader Phase 14a polish pass when that lands.
  *Origin*: Phase 14c session-2 (this UI session) — shipped as the local smoke "good enough, polish later" call.

- **Parallel-worktree dev-server cwd pitfall** — P3.
  `.claude/launch.json` runs `pnpm --filter @tela/admin exec next dev` from the parent shell's cwd. When a session runs from a worktree (e.g. `/Users/lukegorski/tela-wt-XYZ`) and the preview tool spawns the dev server, pnpm's `--filter` resolves `@tela/admin` to the *main repo's* `apps/admin`, not the worktree's. Symptom: edits in the worktree never appear in the served app; HMR + restart don't help; only obvious from `lsof -p $PID | grep cwd`. The launch.json schema (per the preview tool's signature) doesn't support a `cwd` field, so the in-repo fix would be to switch the runtimeExecutable to `bash scripts/dev-admin.sh` (which CDs to its own parent before exec) or to add `-C <abs-path>` to the pnpm args. Workaround for now: run `bash scripts/dev-admin.sh` manually in any worktree session and skip the preview tool's `preview_start`.
  *Origin*: Phase 14c session-2 — burned ~20min before the dev server was confirmed running from the main repo, not the worktree, via `lsof -p PID | grep cwd`.

---

## When to consult this file

- **Before each cutover-style milestone**: scan the list for items that would muddy monitoring or block the milestone (e.g., getSession caching for monitoring clarity, Sentry-in-web for any user-facing launch).
- **When planning a sprint or quiet week**: pick 2-3 P1s with related context (e.g., all the AI quality items in one focused pass).
- **After surfacing a new item**: add it here with severity + origin. Don't rely on session summaries to preserve it — those scroll out of context.
