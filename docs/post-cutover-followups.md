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

- **Sentry on `apps/admin`** — P1.
  Same wiring + same PII scrubbing for `apps/admin`. Depends on Phase 14c complete (to avoid layout.tsx conflict). Should be the immediate-next session after 14c. Mirror of the apps/web session — estimate ~2 hours.
  *Origin*: post-Sentry-in-web follow-up.

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
