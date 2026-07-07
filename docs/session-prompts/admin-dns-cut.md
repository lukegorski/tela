# Session prompt — Finish Phase 14: admin.telastyle.app DNS cut + full-page verification

## Context

The new admin (`apps/admin`) shipped across Phases 14a–14c and runs healthy at `https://tela-admin-development.up.railway.app` (verified `server: railway-hikari`, HTTP 200, 2026-07-07). But the Phase 14 plan's final step — cutting `admin.telastyle.app` DNS from the legacy Vercel admin to the Railway service — **never executed**. Verified 2026-07-07: `admin.telastyle.app` still returns `server: Vercel`, serving the legacy admin against Firebase data that stopped being written at the 2026-05-22 cutover. Luke sees a stale/dead admin at the real domain.

Plan of record: `docs/phase-14-admin-parity.md` — decision P4 = Option B (cut at full parity, end of 14c), DNS checklist near the "DNS cutover (end of 14b)" heading. Read that document's status/checklist sections FIRST.

## Non-negotiable infra rule

**You do not touch DNS, Cloudflare, Vercel, Railway domain config, or Supabase auth config yourself.** For every infra step: prepare the exact change (records, values, console clicks), present it to Luke, and either he applies it or he explicitly approves you doing that specific step. Cloudflare is the DNS authority post-Phase-11. The legacy Vercel projects are OFF-LIMITS except as read-only reference.

## Phase 0 — Parity + functionality audit (before any DNS talk)

Luke's words: the admin must be "up and running correctly." Prove it on the Railway URL first:

1. Read `docs/phase-14-admin-parity.md` end to end — build the page inventory (14a's 5 recovered pages + 14b's planned new pages + 14c AdminAiChat). Determine whether every planned 14b page actually shipped; anything missing is a finding for Luke, not silent scope.
2. Walk EVERY admin page on `https://tela-admin-development.up.railway.app` against live data: overview, users (list + detail), costs, prompts, rules, examples, chat overview + AdminAiChat, and any others in the inventory. For each: loads, data correct-looking, no console errors, core interactions work (e.g. prompt promote/rollback UI renders; rules CRUD opens).
3. Known open polish entries (followups: "Visual polish pass on apps/admin (14a Option B)" + "AdminAiChat polish + UX gaps") are NOT in scope unless Luke says so — but FILE any *functional* breakage you find as followups entries and fix P1-level breaks in this session.
4. Deliver a short parity report to Luke: page-by-page pass/fail + what 14b left unbuilt (if anything). **STOP for his go before Phase 1.**

## Phase 1 — Pre-cut preparation (draft everything, apply nothing)

1. **Railway**: the admin service needs the custom domain `admin.telastyle.app` added (Railway will show the CNAME target / cert provisioning flow). Draft the exact steps.
2. **Cloudflare**: draft the DNS change — `admin.telastyle.app` CNAME → the Railway-provided target. Note current record (screenshot/dig) for rollback.
3. **Supabase auth allowlist**: the new admin's sign-in on the new host needs `https://admin.telastyle.app/**` (and any callback paths) in Auth → URL Configuration. Derive the exact entries from apps/admin's auth code (`useAuth.ts` mirror + any magic-link flows). Draft the additions.
4. **Config sweep**: grep apps/admin + packages for hardcoded host references that must know the new domain — Sentry `tracePropagationTargets` (apps/api lists admin URLs — does it include the custom domain?), CORS/allowed-origins on the api, any `NEXT_PUBLIC_*_URL` in Doppler. Draft required changes; Doppler/env changes need Luke's approval like everything else.
5. Present the full pre-cut package to Luke in one message: Railway step, Cloudflare record, Supabase entries, config diffs, rollback plan (revert CNAME; TTL notes). **Wait for his approval / his hands on each infra piece.**

## Phase 2 — The cut + verification

After Luke applies/approves the infra steps:

1. Confirm cert issued + `admin.telastyle.app` returns `server: railway-hikari` (allow for propagation; poll, don't guess).
2. Re-walk the Phase 0 page checklist ON THE NEW DOMAIN — especially the full auth round-trip (Google OAuth + any magic-link) on the new host, and one AdminAiChat conversation end-to-end.
3. Verify Sentry: trigger a trivial admin error on the new domain, confirm the event lands with correct release + distributed trace to the api.
4. Post-cut hygiene (drafts for Luke, his call): retire/pause the legacy Vercel admin project (keep briefly for rollback), remove stale Supabase allowlist entries for the old Vercel admin URLs if any exist.

## Bookkeeping

- Mark the Phase 14 tracker's DNS-cut section done with date + evidence.
- Close/update the new followups entry "admin.telastyle.app still on legacy Vercel" (P1) added 2026-07-07.
- File any surprises as followups entries — don't bury them in the session summary.

## Operating constraints

- Push only with Luke's explicit approval; show changes for review first. Local commits fine. Pushing main deploys to LIVE telastyle.app.
- Doppler-injected env only; never `doppler secrets get` sensitive values; never echo service keys.
- Never `git add .` / `git add -A`; never `--no-verify`. Atomic stage+commit+verify chains.
- Next.js 16 + Turbopack: read `node_modules/next/dist/docs/` before Next-specific work.

## Definition of done

- [ ] Phase 0 parity report delivered; Luke's go received.
- [ ] Pre-cut package (Railway/Cloudflare/Supabase/config + rollback) approved.
- [ ] `admin.telastyle.app` serves the Railway admin; full page walk + auth round-trip + Sentry check pass on the new domain.
- [ ] Legacy Vercel admin retirement decision recorded.
- [ ] Phase 14 tracker + followups updated.
