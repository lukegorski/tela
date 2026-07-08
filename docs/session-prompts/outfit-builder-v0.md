# Session prompt — Outfit Builder v0: builder core (dark ship)

## Read first

1. `docs/outfit-builder-spec.md` (v3) top to bottom. §2 + §2a are LOCKED (Luke + cofounder, 2026-07-07) — do not relitigate in this session. Build directly from: §3 (interaction model + composition recipe table), §4 (cutout pipeline), §5 (data + capability changes), §7 (events), §8a (zero-disruption rollout).
2. `docs/outfit-builder-spike-report.md` — the evidence behind every locked recipe; §8 addendum explains WHY coherence is solved at the input layer (presentation gate + canonical pose), not by rendering tricks.
3. Branch `spike/outfit-builder` — **REFERENCE ONLY, never merge or cherry-pick** (it is a low-bar throwaway with untracked assets). Read: `spike/tools/recipe.mjs` (port the constants VERBATIM), `spike/tools/alpha-refine.mjs` (curve LO=70/HI=190), `spike/tools/cutout-imgly.mjs` (the `publicPath` gotcha — the lib resolves resources from cwd unless told otherwise), `apps/web/src/app/(spike)/[lang]/spike-builder/BuilderClient.tsx` (tap-to-lock + fluid-dress interaction reference).
4. Spike gotchas that WILL bite again: `manifest.ts` is a reserved Next metadata filename inside `app/` (Turbopack silently refuses to resolve it as a module — name generated modules something else); the proxy locale-redirects every path except image extensions (new pages live under `[lang]`; don't fetch non-image statics from `public/`).
5. Next.js 16 + Turbopack: read `node_modules/next/dist/docs/` before Next-specific work.

## Mission

Ship the manual builder core to main, **DARK**, behind the entitlements choke point — usable end-to-end by both founders on real phones: browse cutouts on the invisible mannequin → fluid dress + tap-to-lock → autosaved server-side draft → save as a manual outfit with a card snapshot in the grid. **No render button, no premium surfaces, no IA changes, no links from existing UI.** Increments merge to main through the normal review-then-push cadence (§8a trunk-based dark shipping; every push needs Luke's approval).

## Ship bar (this is NOT the spike)

Production quality: TypeScript strict; unit tests for pure logic (entitlements truth table, recipe placement math, draft restore tolerances); all strings through the 14 locale dictionaries (new keys only); events wired; fail-open where specced. **Shared-surface whitelist (§8a) — the ONLY existing files you may edit:** the 14 locale dictionaries (new keys), the enhancement flow's additive fail-open cutout hook, the prompts registry (new prompt VERSION, never in-place). Everything else: new files only. Any exception: STOP and ask Luke.

## Phase 0 — prerequisites (before any builder code)

1. **Role-mismatch audit** (post-cutover followups P3): run the audit query (read-only) on dev + prod, identify the `role='shoes'`-holding-outerwear root cause, fix it. STOP and ask Luke if the fix reaches beyond the obvious scope.
2. **`item.analyze` presentation classification:** extend the analysis prompt to emit `presentation: flat | folded | angled`; write to new `closet_items.presentation`. Count + report folded per founder closet (spike baseline: ~8/49 marina, 0/18 Luke).
3. **Enhancement prompt v2** (canonical per-category flat-lay pose: upright, front-facing; tops sleeves relaxed; pants legs straight; skirts front-spread; NEVER unfold a folded garment — the gate handles those) as a new prompt version. **Identity-fidelity check BEFORE the backfill:** re-enhance 5 founder items, produce a before/after sheet, STOP — Luke eyeballs it (the spike proved image-model drift is real; production tolerance ≠ unlimited tolerance).
4. **Founder re-enhance backfill** after the STOP clears: ~50 items ≈ $2.50, logged per call, hard cap $5.
5. Verify the full new-upload flow on one test item per founder: upload → analyze (presentation) → enhance (v2) → cutout (Phase 2 capability, once it exists).

## Phase 1 — migrations + entitlements (additive only)

- Migrations (all additive, §8a #3): `outfits.source` (`'ai' | 'manual'`, backfill `'ai'`); `outfit_drafts` (user_id unique, slots jsonb, updated_at); `item_photos.cutout_storage_path`; `closet_items.presentation`; `users.features` jsonb default `{}`; outfit card path — FIRST verify how AI-outfit card images are stored today and reuse that mechanism; only add a column if none exists.
- **`getEntitlements(user)` choke point** (spec §5): derives `{ builder, aiStyling, renderQuotaPerWeek }` from `features` (+ `isAdmin` where sensible; `plan` arrives in v1). Unit-tested truth table. Every gate — route, capability, UI — reads ONLY this.
- **Founder flag flip = ad-hoc doppler-run script** (sets `features.builder` for the two founder user ids). No admin UI in v0 — that's v1 scope.
- **STOP gate: Luke reviews the migration set before it's applied anywhere beyond dev.**

## Phase 2 — cutout pipeline

- `enhancement.cutout` capability: enhanced image → `@imgly/background-removal-node` (default isnet; set `publicPath` explicitly; vendor the model resources with the worker) → alpha curve (0 below 70, 255 above 190, linear ramp) → **WebP-with-alpha** → `item-photos` bucket at `<storagePath>.cutout.webp` → `item_photos.cutout_storage_path`. Deterministic, ~0.8s/item on M-series — measure on the actual worker and report.
- Triggers (§4): lazy on first builder-open (enqueue all eligible items missing cutouts); proactive founder backfill; additive **fail-open** hook at the end of the enhancement flow (whitelisted edit — a cutout failure must NEVER fail enhancement; prove it with a kill test).
- Eligibility: enhanced photo exists AND `presentation != 'folded'`.
- Builder fallback while cutouts are pending/missing: enhanced JPEG on white — degraded, never blocking.

## Phase 3 — builder UI (dark route)

- New route `(main)/[lang]/builder` (new files only; inherits the real app shell — unlike the spike, the builder wants the nav). Server-side gate: authenticated AND `entitlements.builder`, else redirect to the locale landing exactly like other protected pages (house pattern is redirect, not 404). No links from existing UI.
- Canvas: invisible mannequin — silhouette opacity as a single constant (final value is a v0 design-review item); recipe module ported verbatim from the spike and **shared by the canvas and the card renderer** (one source of truth); 4 slot zones; fluid dress (dresses at the tail of the top carousel + a small "dresses →" hint on the top zone; bottom-swipe exits, restores last top); tap-to-lock (Keep/Revert placement must NOT cover the shoes zone — spike defect); None states for outerwear/shoes; empty-category affordance ("Add tops →" into the upload flow); folded items excluded with a "retake to use in outfits" nudge surfacing in the wardrobe detail.
- Upload gate (soft): folded classification at upload shows the retake guidance inline but still accepts the photo (copy: cofounder voice, v0 design review).
- Draft persistence: `outfit.saveDraft` / `outfit.getDraft` (thin upsert/read); debounced ~1s autosave; mount restores verbatim; deleted itemIds skipped gracefully (empty slot + subtle note); concurrent devices last-write-wins, documented.
- Events (§7): `outfit.builder_opened` (restored_draft, cutouts_ready), `outfit.builder_session_ended` (flush on `visibilitychange` with beacon semantics; cross-check counts against server draft-save deltas and report which source is trustworthy), `wardrobe.add_prompted_from_builder` (slot).

## Phase 4 — save as manual outfit

- `outfit.createManual`: validate (top AND bottom) OR dress, ownership, role rules; insert outfit + outfit_items with `source='manual'`.
- Card snapshot: client exports the composed canvas → uploads as the outfit's card image (the §5-verified mechanism); manual outfits appear in grid + lookbook like AI outfits; event `outfit.manual_saved` (composition, had_shoes, dress_mode).
- Post-save draft semantics: implement the spec recommendation (keep composition, disable Save until it changes) unless Luke overrides at the design-review STOP.

## Phase 5 — founder dogfood + STOP

- Flip `features.builder` for Luke + cofounder (script). Dark deploys ride the normal push cadence.
- Real-phone verification by both founders: flipping feel + cutout quality at scale, fluid dress, tap-to-lock, draft restore across two devices, save → card in grid, first-open cutout latency.
- **STOP. Report dogfood findings + the design-review decisions (silhouette opacity, post-save semantics, Keep/Revert polish, gate copy). v1 (render + quota + premium scaffolding) gets its own session prompt only on Luke's word.**

## Operating constraints (non-negotiable)

- Push only with Luke's explicit approval; local commits fine. Pushing main deploys LIVE to telastyle.app — dark shipping means dark: nothing user-visible without the flag.
- Doppler-injected env only (`doppler run --project tela --config dev -- <cmd>`); never `doppler secrets get` sensitive values; never echo service keys.
- Never `git add .` / `git add -A`; never `--no-verify`. Combine add+commit in one step (Luke commits in parallel).
- Additive-only DB changes; nothing existing altered or repurposed.
- Legacy repo `/Users/lukegorski/ale` is READ-ONLY reference.
- Real user data stays in the dev environment; wardrobe photos never enter git history.
- All model spend logged per call; session cap $5 (expected: ~$2.50 backfill + test items).

## Definition of done

- [ ] Phase 0 complete: audit root-caused + fixed; `presentation` live with counts reported; enhancement v2 fidelity-checked (STOP honored) + founder backfill done ≤ cap.
- [ ] Migrations additive, Luke-reviewed (STOP honored), applied; entitlements truth table green; founder flip script works.
- [ ] Cutout pipeline: both founder closets 100% cut out (excl. folded); fail-open kill test passes; lazy trigger measured.
- [ ] Builder route dark + server-gated; all four locked recipes implemented to ship bar; i18n keys in all 14 dictionaries.
- [ ] Draft round-trips across two devices; deleted-item tolerance tested; events visible in admin.
- [ ] Save → manual outfit + card in grid + lookbook.
- [ ] Founder dogfood done, findings reported, final STOP honored; v1 prompt awaits Luke's word.
