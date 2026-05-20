# Phase 11 — Cutover runbook

**Audience**: Luke, on cutover day.
**Pre-reads (do NOT skip)**: [phase-11-multi-user-migration.md](./phase-11-multi-user-migration.md) M11, [PORT.md](../PORT.md) pitfalls #14 + #15.

This document is a step-by-step recipe to flip `telastyle.app` DNS off
legacy Vercel and onto the new Railway-hosted `tela-web` service, with
the migrated user data intact. Every step has a check, an expected
result, and a rollback for if it fails. Read the whole thing once
before starting.

The cutover is gated on Phase B verification passing first. If you got
here without the Phase B per-user checklist complete (Luke canary,
Marina, Isaac, Romano, plus B1 fresh-signup including lazy-init
generate), stop and finish that first.

## Non-negotiables (read every cutover day, even if you think you remember)

- **Cutover window**: LATAM 02:00–04:00 local (Marina in BR, Isaac in MX). This is the lowest-impact window for the active user set.
- **Subdomain `admin.telastyle.app` is OFF-LIMITS for this cutover.** It stays on Vercel for the Phase 14 admin workstream. Touching its DNS records is a hard error.
- **No simultaneous changes.** DNS cut is the only production-touching action during the window. Defer any other deploy, env var change, or Supabase config edit to either before or after.
- **Rollback budget**: 60 minutes. If you don't have green smoke 60 min after the DNS records propagate, revert (see C1.10). The TTL is set to 60s in C1.1 precisely so revert is fast.

## Endpoint reference

| Name | URL | Purpose |
|---|---|---|
| Legacy app (Vercel) | `https://telastyle.app` (apex), `https://telastyle.app/api/...` | What users hit today. Replaced by cutover. |
| Admin (Vercel) | `https://admin.telastyle.app` | **DO NOT TOUCH** during cutover. Phase 14 work. |
| Railway api | `https://tela-development.up.railway.app` | The new backend, already serving. |
| Railway web | `https://tela-web-development.up.railway.app` | The new frontend, target of the DNS cut. |
| Status page | `https://status.railway.com` | Check before AND during cutover. |

---

## C1.1  T-24h: DNS TTL prep

**Pre-condition**: cutover decision is final. You have access to the DNS provider for `telastyle.app` (Namesilo or wherever — see `~/.claude/projects/.../reference_infrastructure.md`).

**Steps**:

1. Capture current TTL:
   ```bash
   dig telastyle.app +noall +answer
   ```
   Record the TTL value somewhere (you'll restore to it in C1.8).
2. In the DNS provider dashboard, lower the apex A (and AAAA if present) record TTL to **60 seconds**. **Do NOT change the IP values yet.** This is TTL-prep only.
3. Confirm `admin.telastyle.app` records are not in the same edit batch — touching them by accident is the most common foot-gun.
4. After saving, wait the original TTL window (often 3600s = 1h) for the new lower TTL to propagate worldwide. Re-check with `dig` from a couple of different resolvers (`dig @8.8.8.8 telastyle.app`, `dig @1.1.1.1 telastyle.app`).

**Expected**: `dig` reports TTL ≈ 60s, IP unchanged. No subdomain records altered.

**If something looks wrong**: revert the TTL change immediately. No data impact — the IP is unchanged, users still hit legacy.

---

## C1.2  (SKIPPED) Service-worker kill switch

Confirmed during Phase 0 that **no service worker is registered in either the legacy or the new app** (grep clean in `apps/web/src` and legacy `/Users/lukegorski/ale/src`). No cached SW to kill. Skip this step.

If you ever do introduce a SW in either app, restore this step before the next cutover.

---

## C1.3  T-1h: Final smoke

This is the gate. **If any of the below fails, abort the cutover for tonight and reschedule.**

### C1.3.1  Baseline snapshot (if not already done earlier)

If you haven't already run a baseline (e.g., 24h before to give time to investigate any anomalies), do it now:

```bash
~/bin/doppler run --project tela --config dev -- \
  pnpm --filter @tela/capabilities exec tsx \
  scripts/cutover-preflight.ts --out ~/Desktop/cutover-baseline.json
```

Save this file somewhere safe (`~/Desktop/`, not the repo) — you'll diff against it in C1.3.2.

### C1.3.2  Drift check

```bash
~/bin/doppler run --project tela --config dev -- \
  pnpm --filter @tela/capabilities exec tsx \
  scripts/cutover-preflight.ts --diff ~/Desktop/cutover-baseline.json
```

**Expected**: exit code 0, "PASS — preflight clean", zero drift.

**If any drift in user counts**: someone added/deleted data in the gap. Investigate which user, which table. If it's the affected user themself (legitimate add via legacy app), update the baseline + re-run. If it's unexplained, abort.

**If signed URLs FAIL**: storage path drift or Supabase storage outage. Don't proceed — users would see broken images post-cutover.

### C1.3.3  Vercel access log snapshot (post-mortem baseline)

Open the Vercel dashboard for the legacy `telastyle.app` project → Logs. Check the last 24h of access logs:
- Note the request rate (RPS) so you can compare to post-cutover Railway traffic.
- Look for any unusual error rate or path patterns.
- Screenshot the log view for the post-mortem.

This is not a gate; it's a baseline for the monitoring window (C1.7).

### C1.3.4  OAuth redirect URL verification (NEW)

The OAuth flow has been bitten by Supabase's Site URL silently winning over our app's `redirectTo` when the URL doesn't match the allowlist exactly. With the fix in commit `49a90c3` we pass bare `redirectTo` (no `?next=` query), but Supabase's Site URL is still set to `http://localhost:3000`. Any drift here is silent and only surfaces as "users land at localhost after sign-in." Verify explicitly.

**Steps**:

1. In a fresh incognito window, go to `https://tela-web-development.up.railway.app`.
2. Open DevTools → Network tab → enable "Preserve log".
3. Click "Continue with Google" — pick a Google account you have access to.
4. After auth completes, the URL bar should show `https://tela-web-development.up.railway.app/en/outfits` (or `/en/chat` if no style profile).
5. In the Network tab, find the Supabase OAuth callback request. The `redirect_to` query param in the callback URL should be `https://tela-web-development.up.railway.app/auth/callback` (bare — no `?next=` query, no trailing slash).
6. **If you land on `http://localhost:3000`**: the OAuth fix has regressed OR the Supabase allowlist has been edited. Abort cutover. Inspect [useAuth.ts:238](../apps/web/src/hooks/useAuth.ts:238) and Supabase Authentication → URL Configuration → Redirect URLs.
7. Sign out via the menu.

After the cutover, the equivalent check is at `https://telastyle.app` instead of the Railway URL. C1.6.2 below covers it.

### C1.3.5  Railway health, manually

Belt + suspenders on top of the preflight script:

```bash
curl -fsS -I https://tela-web-development.up.railway.app/api/health
curl -fsS -I https://tela-development.up.railway.app/health
curl -fsS -I https://tela-web-development.up.railway.app/
```

All three should return 200 / 200 / 307. If any has `x-railway-fallback: true` header → Railway edge issue (recall the 2026-05-19 incident). Don't cut while Railway's edge is degraded.

Also check `https://status.railway.com` for any active incidents. If they declare "Investigating" → wait.

---

## C1.4  T-0: DNS cut

This is the only step that actually moves users to the new stack. Everything before was prep; everything after is monitoring + rollback-readiness.

**Pre-condition**: C1.3 passed in full. Confirmed within the LATAM 02:00–04:00 window.

### C1.4.1  Get Railway's IP / CNAME target for `tela-web`

In the Railway dashboard:
- Project `tela` → environment `development` → service `tela-web` → Settings → Networking.
- Under "Custom Domains", click "+ Custom Domain" and type `telastyle.app`. Railway will display either a CNAME target (`tela-web-development.up.railway.app`) or an A record IP.
- For apex domains, Railway usually requires an A record (CNAME at apex is not universally supported). The dashboard tells you the exact IP.
- Write down the IP(s). You'll plug them into the DNS provider in the next step.

### C1.4.2  Update apex DNS records

In the DNS provider for `telastyle.app`:
1. Edit the apex `A` record:
   - Old value: the legacy Vercel IP (record before changing).
   - New value: the Railway IP from C1.4.1.
   - TTL: 60s (unchanged from C1.1).
2. Repeat for `AAAA` if Railway provides an IPv6 target.
3. **DO NOT touch `admin.telastyle.app`** records. They stay on Vercel.
4. Save.

### C1.4.3  Verify propagation

From your terminal:
```bash
dig telastyle.app +short
dig @8.8.8.8 telastyle.app +short
dig @1.1.1.1 telastyle.app +short
```

Cycle these every 30 seconds. Within 1–2 minutes (because TTL is 60s), all three should return the new Railway IP.

Once they agree:
```bash
curl -fsS -I https://telastyle.app/api/health
```

**Expected**: 200, served by the new stack (`x-nextjs-prerender` or similar Next-specific headers visible).

**If 200 from old stack**: DNS cache is still warm somewhere. Wait another minute. If after 5 minutes the old stack still answers from any resolver, dig into the DNS provider's status.

**If 4xx/5xx**: Railway's custom domain may not be ready yet. In the Railway dashboard, check the custom domain status — it may say "Issuing certificate" for the first 1–2 minutes. Wait. If it stays red after 5 minutes, revert (C1.10).

### C1.4.4  Pre-stage kill switch (set up NOW, in case C1.5 fails)

While DNS is propagating, log into the legacy provider (Vercel) and prepare a redirect rule from `telastyle.app/*` → a maintenance page (e.g., `https://status.telastyle.app` or a static "Be right back" hosted somewhere). Save it as a draft; don't activate. If C1.5/C1.6 reveals catastrophic failure and DNS revert is taking too long, flip this on as a stopgap.

---

## C1.5  T+15min: Cookie/cache reality check

Different from C1.4.3's server-side check. This is what users actually experience.

**Steps**:

1. **Fresh incognito** at `https://telastyle.app`. Expected: new app renders, landing page with Google sign-in button.
2. **Same browser that had legacy in the last 24h**: open `https://telastyle.app`. May hit a cached HTML pointing at legacy assets — hard-refresh (Cmd+Shift+R). After hard-refresh, new app should load.
3. **Sign in as Luke (already-existing user, OAuth)**: should land on `/en/outfits` with all 19+ migrated outfits visible. No `localhost:3000` redirect.
4. **Generate one outfit**: should succeed (Luke already has a style_profile from before).

**If any of these fail**: assess severity. Hard-refresh issues will self-heal in <1h as caches expire. Sign-in failure is a P0 — start rollback.

---

## C1.6  T+1h: Sign-off + re-engagement email

### C1.6.1  Final preflight against the new domain

```bash
~/bin/doppler run --project tela --config dev -- \
  pnpm --filter @tela/capabilities exec tsx \
  scripts/cutover-preflight.ts
```

(No `--diff` this time — counts should match the pre-cutover state. If you want strict drift detection, pass `--diff cutover-baseline.json` again. Any new outfits Luke generated in C1.5 will count as drift in that case — acceptable, just note it.)

### C1.6.2  OAuth redirect URL verification on the live domain (mirror of C1.3.4)

In a fresh incognito at `https://telastyle.app`:
1. Click "Continue with Google".
2. Verify post-auth URL is `https://telastyle.app/en/outfits` (or `/en/chat`).
3. **Crucially: NOT `localhost:3000` and NOT `tela-web-development.up.railway.app`.**

If post-OAuth lands at the Railway URL instead of `telastyle.app`: the Supabase Redirect URLs allowlist has the Railway URL but not telastyle (or `useAuth.ts` is somehow using the wrong origin). Both are recoverable without rolling back DNS — fix the allowlist or push a code change.

If post-OAuth lands at `localhost:3000`: same Supabase Site URL fallback class of bug we hit during Phase B. Either telastyle isn't in the allowlist OR there's a regressed query string in `redirectTo`. Inspect immediately.

### C1.6.3  Re-engagement email

Per M12 in the migration spec. Luke (the human, not me) sends this from the marketing mailbox. Keep the language as drafted — do not mention "migration" or "rebuild" (breaks the invisibility bar). Send only to the 4 active users (Marina, Isaac, Romano, Luke himself for testing — or skip self).

Confirm sender domain matches what these users have received from us before (deliverability — a brand-new sender domain has higher spam risk).

---

## C1.7  T+1h to T+48h: Monitoring window

For the first 48 hours, treat any new signal as a potential cutover issue until ruled out.

**Watch**:

| Surface | What | How |
|---|---|---|
| Railway logs (web) | Error rate vs baseline | `railway logs --service tela-web` (in `/Users/lukegorski/tela`). Filter for `level:error`. |
| Railway logs (api) | OOM patterns (regression of d4c6551), 4xx/5xx | `railway logs --service tela` |
| Supabase auth logs | Sign-in success rate, especially the 4 migrated users | Supabase dashboard → Authentication → Logs |
| **(observability gap)** Client-side errors | Sentry NOT wired into web (Phase 0 finding). User-reported only. | Check email/Slack for user reports. |
| Signed URL 4xx/5xx | Storage path drift | Railway api logs for `createSignedUrl` errors |
| Healthcheck flaps | Railway dashboard | Service detail page; alert on yellow/red |

**Specific people to check on Day +1** (LATAM time, after their local morning):
- Marina (biggest data, highest risk) — check her wardrobe loads in <5s; check no signed-URL failures.
- Isaac (most try-ons of any user) — try-on images render.

**If a regression appears**:
- DB/data regression: check `migration_failures` table for new rows.
- Auth regression: check Supabase auth logs for the user. Likely a session/cookie issue, often self-resolves on sign-out + sign-in.
- Performance regression: pitfall #15 is fixed but watch for it. `useQuery` should be deduping; if 3x simultaneous calls per page-load appear in logs, it regressed.

---

## C1.8  T+24h: Restore DNS TTL

Once you're confident the cutover is stable (Day +1, no fires), bump the TTL back up:

1. DNS provider → apex A (and AAAA) record TTL → restore to the value you captured in C1.1.
2. Save.

This trades fast-revert capability for less DNS traffic. Acceptable trade-off once stable.

---

## C1.9  T+7d: Legacy teardown

After a week of stable operation:

### Keep alive (do NOT touch)

- **`admin.telastyle.app` (Vercel)** — Phase 14 admin workstream uses it. Hands off until that's complete.
- **Firebase Storage** (legacy bucket) — chat messages have `attachments` with `image-legacy://` URLs that resolve to Firebase Storage. Keep alive until those messages are migrated (out of Phase 11 scope) or deleted.
- **Firebase Auth + Firestore (read-only)** — same reason: chat history might still reference legacy IDs.

### Can teardown (in order)

1. **Pause the legacy Vercel project for `telastyle.app` apex.** Pause, don't delete — keep the option to spin it back up for 7 more days as rollback insurance.
2. After another 7 days (T+14d total), delete the legacy Vercel project.
3. **Audit dependencies on `apps/web` of any legacy Firebase URLs.** The `no-residue` check confirmed clean; one final check before the legacy Firebase project goes away. Re-run `pnpm verify` and `bash scripts/check-no-residue.sh`.

---

## C1.10  Rollback plan

### When to roll back

- Within 60 minutes of DNS cut, if smoke checks (C1.5) fail badly.
- After that window, prefer fix-forward — most issues are recoverable with a code push or config tweak that's faster than a DNS revert + propagation.

### How to roll back DNS

1. DNS provider → apex A (and AAAA) record → revert IP to the legacy Vercel value (you recorded it in C1.1).
2. Save. TTL is still 60s (per C1.1, not yet restored in C1.8 since you're under 24h), so propagation is fast.
3. `dig telastyle.app +short` cycles every 30s until it agrees on the old IP.
4. `curl -fsS -I https://telastyle.app/api/health` — confirm legacy stack is answering (likely 404 since legacy may not have `/api/health`; try `/` for 200 instead).

### What happens to data created during the failed cutover window?

Any outfits, chat messages, etc. created in the new app between DNS cut and DNS revert **stay in the new app's database** (the same Supabase project). They're not migrated back to legacy. The user may lose visibility of them when DNS reverts — they live in Supabase but the legacy app reads from Firestore.

For the 1-hour window, this likely affects 0–3 records across all users. Acceptable loss for a rollback scenario.

### Last-resort kill switch

If DNS revert is propagating slowly and users are actively hitting errors, activate the maintenance redirect you staged in C1.4.4. This routes `telastyle.app/*` to a "Be right back" page until the DNS revert lands.

---

## Post-cutover follow-ups (track separately)

These are not part of the cutover itself but should be tracked as their own tickets:

- **Wildcard `?**` entries in Supabase Redirect URLs.** Right now `useAuth.ts` and `generate-magic-link.ts` pass bare `redirectTo` so that deep-link return (`?next=...`) doesn't break the allowlist match. Adding `?**` wildcards lets us restore deep-link UX.
- **`SERVICE_ACCOUNT_SECRET` real value.** Currently the literal string `openssl rand -hex 32` — placeholder bug, blocks service-account auth (MCP, workers, admin scripts). Doesn't impact user flows.
- **Sentry in `apps/web`.** Client-side observability gap — we're monitoring blind for browser-side issues post-cutover.
- **Promote to `tela/prd` Doppler config + separate Supabase project.** Pre-launch we accepted shared dev/prod infra. Real prod hygiene is its own workstream.
- **Three dead-code `postgres()` clients in `apps/web/src/lib/` (profile.ts, chat.ts, users.ts)**. No callers found; pgbouncer-naive (no `prepare: false`). Either wire them up or delete.
- **Delete or update the migration script's UX message at [migrate-user-from-legacy.ts:566](../packages/capabilities/scripts/migrate-user-from-legacy.ts:566)** that promises "style profile will regenerate on first generate" — that's now actually true thanks to the lazy-init, but the wording could be clearer.

---

## Appendix A: revised Phase B verification checklist

Phase B11 had a B1 (fresh signup) step that the original plan kept brief. Two things make it more important now than it was when planned:

1. The lazy-init code path added in commit `25779f5` is **untested in production**. The backfill ensured the 4 migrated users have profiles, so they skip the lazy-init branch entirely. The only way to exercise lazy-init in prod before cutover is via a fresh signup.
2. The migration script's "regenerates on first generate" promise is now actually true (lazy-init makes it so), but it's never been validated end-to-end on the new stack.

### B1 (revised) — Fresh signup, including lazy-init

Use a Google account that has NEVER signed into Tela (legacy or new). Email Luke doesn't normally use is fine.

```
☐ Sign in via Google at https://tela-web-development.up.railway.app
   (or https://telastyle.app post-cutover)
☐ Land in onboarding (NOT outfits — new user, no style profile yet)
☐ Complete onboarding (the minimal style quiz)
☐ Add ≥3 wardrobe items via the upload flow
   - Watch the enhancement pipeline complete for each
   - All ≥3 items must show in the wardrobe view
☐ Open /en/outfits → click "+" → pick "Everyday" → Generate
   - First generation: expect ~30s wait. This is the lazy-init firing
     profile.closetRead inline (commit 25779f5). Watch Railway api logs
     for "capability completed name:profile.closetRead" entry.
   - Outfit appears in the grid with item images + rationale.
☐ Generate ONE more outfit
   - This one should be instant (<5s). The lazy-init branch was skipped
     because the style_profile now exists from the first attempt.
☐ Confirm Railway api logs show:
     - 1× profile.closetRead invocation (the lazy-init)
     - 2× context.assemble invocations (one per Generate click)
     - 2× outfit.generate invocations (one per Generate click)
☐ Cleanup: delete the test user via:
     ~/bin/doppler run --project tela --config dev -- \
       pnpm --filter @tela/capabilities exec tsx \
       packages/capabilities/scripts/delete-user-completely.ts \
       --email <test-email>
```

If the first generation succeeds and the second is fast, the lazy-init code path is **proven in production**. Cutover is safe to proceed.

If the first generation **fails** with "No style profile exists for this user. Run profile.closetRead first": the lazy-init didn't fire. Possible causes:
- `outfit.generate` was NOT redeployed since commit `25779f5` (check Railway api deploy time).
- A regression in the lazy-init branch.

Either way, do NOT cut over.
