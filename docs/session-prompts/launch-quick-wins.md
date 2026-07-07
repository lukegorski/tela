# Session prompt — Launch quick-wins bundle (images, Sentry tunnel, deep-link redirects)

## Context

Three small, independent, user-facing fixes bundled into one session. All three are open P2 entries in `docs/post-cutover-followups.md` (the canonical tracker — mark each `[DONE]` there as it ships). The app is LIVE: pushing main deploys to telastyle.app with no staging buffer. Beta testers arrive soon; each of these directly affects what they experience.

Work them in the order below (independent — a blocker on one must not stall the others; skip and report instead).

## Item 1: Next `<Image>` optimization + Supabase signed-URL 400s

Followups entry: "Next `<Image>` warnings + Supabase signed-URL 400s in browser console" (P2). Symptoms, reproducible on any signed-in page with wardrobe/outfit/try-on images:

1. `/_next/image?url=https%3A%2F%2F<project>.supabase.co/storage/v1/object/sign/...` returns **400** from the Next image optimizer. Images still render (fallback to source URL) but we lose resize/format/cache optimization on every wardrobe item — real performance cost on image-heavy pages.
2. `<Image>` prop-misuse warnings: `fill` + `sizes="100vw"` mismatches, `fill` inside `position: static` parents, LCP image without `priority`/`loading="eager"`.

Fix path (from the entry, verify against current code):
- Add the Supabase storage host to `apps/web/next.config.ts` `images.remotePatterns`; then verify the optimizer can actually fetch **signed** URLs (token in query string). If the optimizer strips/mangles the query or double-encodes, decide explicitly: custom loader vs `unoptimized` for signed URLs — document the choice in the followups entry.
- Audit every `<Image fill>` call site in `apps/web`: parent `position: relative`, honest `sizes` per breakpoint, `priority` on the LCP image (landing + wardrobe grid first cell are the likely LCPs).

**This is Next.js 16 + Turbopack — read `node_modules/next/dist/docs/` for the current `images` config and `<Image>` API before coding. Do not trust training data.**

Verification: browser smoke on the deployed preview — zero `/_next/image` 400s in the network tab on wardrobe + outfits + lookbook; zero `<Image>` warnings in console; confirm optimized variants are actually served (response content-type/size changes vs raw).

## Item 2: Sentry tunnel route

Followups entry: "Sentry tunnel route" (P2). Ad blockers (uBlock et al.) block requests to `*.sentry.io` by default — beta testers with blockers become invisible to error reporting exactly when we need signal most.

Fix: configure `tunnelRoute` in `withSentryConfig` options in `apps/web/next.config.ts` AND `apps/admin/next.config.ts` (keep the two apps symmetric — that's the house convention for Sentry wiring; see the paired history in the followups Observability section).

Caveats:
- Pick a non-obvious route (e.g. `/monitoring` is the documented default — fine) and confirm it doesn't collide with the `[lang]` locale routing or `proxy.ts` locale-redirect exemptions (the legal routes needed an exemption — the tunnel route will too if the proxy locale-redirects unknown paths).
- Verify on deploy: with a blocker-simulating test (block `*.sentry.io` in devtools request blocking), trigger a test error and confirm the event still lands in Sentry via the tunnel.

## Item 3: Supabase redirect-URL wildcards + deep-link return

Followups entry: "Wildcard `?**` entries in Supabase Redirect URLs" (P2). Today `useAuth.ts` and `generate-magic-link.ts` pass bare `redirectTo` (no `?next=...`) so the allowlist match doesn't break — meaning sign-in always dumps the user on the home page instead of returning them to the page they were on.

Two halves:
1. **Supabase dashboard config (NOT yours to apply)**: the Auth → URL Configuration allowlist needs `?**` wildcard entries. Draft the EXACT list of entries needed (derive from the current allowlist + every `redirectTo` call site), present it to Luke, and **wait for him to apply it or explicitly approve you doing it**. Supabase auth config is live infrastructure — the never-touch-infra-without-approval rule applies.
2. **Code side (yours)**: once the allowlist is confirmed updated, restore `?next=<path>` passing in `useAuth.ts` + `generate-magic-link.ts` and the post-auth redirect handling, so deep links survive the sign-in round-trip.

Verification: signed-out visit to a deep link (e.g. `/en/outfits/<id>`) → sign in → land back on that exact page. Test both Google OAuth and magic-link paths.

## Operating constraints (non-negotiable)

- Push only with Luke's explicit approval; show changes for review first. Local commits fine.
- Pushing main deploys to LIVE telastyle.app (Railway; no staging).
- Never touch Supabase dashboard config, Railway config, or DNS yourself without Luke's explicit approval (Item 3 half 1 is draft-and-wait).
- Doppler-injected env only (`doppler run --project tela --config dev -- <cmd>`); never `doppler secrets get` sensitive values; never echo service keys.
- Never `git add .` / `git add -A`; never `--no-verify`. Atomic stage+commit+verify chains.
- Next.js 16 + Turbopack: read `node_modules/next/dist/docs/` before any Next-specific work.
- Each item is its own commit (or small commit series); do not bundle across items.

## Definition of done

- [ ] Item 1: zero image-optimizer 400s + zero `<Image>` warnings on wardrobe/outfits/lookbook (deployed, browser-verified); optimizer actually optimizing (not silently `unoptimized` everywhere — if signed URLs force a fallback, that's an explicit documented decision).
- [ ] Item 2: tunnel route live on web + admin; blocked-transport test proves events land via tunnel.
- [ ] Item 3: allowlist draft delivered to Luke; after his approval, deep-link return works on OAuth + magic-link paths.
- [ ] All three followups entries marked `[DONE]` (or updated with explicit partial status + reason).
- [ ] Session ends with a short report: what shipped, what was decided, any surprises filed as new followups entries.
