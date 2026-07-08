# Outfit Builder — product + engineering spec (v3)

**Status: v-1 SPIKE COMPLETE — VERDICT: GO (Luke + cofounder, 2026-07-07). All SPIKE-DECIDES items resolved (§2a); evidence in `docs/outfit-builder-spike-report.md`.**
**Post-dogfood addendum (same day, Luke on the live prototype):** silhouette finalized as fully invisible (#9 updated); §3 gains "Sizing & proportion" — edge-anchored recipe v2 + deterministic Tier-0 sizing in v0, flagged size-estimation in v1 (self-critiqued design, approved by Luke).
**Owner thread:** outfits-page redesign (manual-first styling). Decisions in §2 and §2a were made explicitly by Luke (cofounder confirming §2a); do not relitigate them in build sessions.

---

## 1. Product intent

Invert the outfits page from AI-first to **manual-first**. Users build outfits themselves by flipping through their own wardrobe items on a mannequin-style canvas. AI styling remains available but becomes the **premium** path, not the default. The feature should feel like play (paper-doll composition), never lose the user's work, and treat the photoreal try-on render as a deliberate, valuable moment rather than an ambient effect.

**The central risk is NOT engineering — it's whether flipping cutouts of real wardrobe photos feels delightful and composes coherently.** The plan therefore led with a throwaway spike (§8, v-1 — complete, GO) before any durable infrastructure. The spike's one material finding: composition coherence requires pose-consistent inputs, addressed by the presentation gate + canonical-pose enhancement (§2a #12), not by cleverer geometry.

## 2. Locked decisions (Luke, 2026-07-07)

| # | Decision |
|---|---|
| 1 | Flipping is **instant and free**: transparent-cutout item images cycled per slot on a stylized canvas. Fashn renders are NEVER triggered by flipping. |
| 2 | Rendering on the model is a **deliberate action** with async delivery (~1–2 min), reusing the existing try-on pipeline unchanged. |
| 3 | **Beta premium = founder access, no payment infrastructure.** AI generation gets a fake-door premium gate; beta testers get founder entitlements. Payments come only after packaging is validated. |
| 4 | **Free render quota: 7 per week as a weekly pool** (not 1/day — allow bursts). Founders/premium bypass. General setting from day one, validated against beta usage. |
| 5 | **v1 slots: top, bottom, outerwear, shoes.** Bag / jewelry / eyewear / hat are a fast-follow (v1.1). Shoes participate in composition + saved outfit but not the render (pipeline already ignores them). |
| 6 | **Builder state persists server-side across sessions.** Whatever the user last had assembled is exactly what appears on reopen — any device. No auto-loaded suggestions, no random outfits in the workspace. Remix is OUT of v1. |
| 7 | **Zero disruption to the current app until a deliberate, reversible flip** (§8a). Everything ships dark behind a per-user flag; the outfits-page IA change is one small final commit. |

### 2a. Spike-locked recipes (v-1 verdicts — Luke + cofounder, 2026-07-07)

| # | Decision |
|---|---|
| 8 | **Cutout method: local background removal** (`@imgly/background-removal-node`, default isnet) **+ deterministic alpha-curve post-pass** (alpha 0 below 70, 255 above 190, linear ramp between), output WebP-with-alpha. Measured: $0, ~0.8s/item, pixel-faithful on 15/15 incl. white-on-white, lace, thin straps. Image-model cutouts (gpt-image-1.5, transparent output) REJECTED: regenerates garments (pattern relocation, texture loss, silhouette drift) at ~6.3¢ + ~30s per item. |
| 9 | **Canvas: invisible mannequin — fully invisible (finalized by Luke dogfooding the prototype, 2026-07-07).** Body-anchored composition (recipe in §3) with NO visible figure; the mannequin exists only as placement math. Styled-collage and slot-card treatments were rendered and set aside (spike kit `04-alternatives/`); collage remains a candidate for the *save-card* art direction only. |
| 10 | **Dress pattern: fluid.** Dresses live at the end of the top carousel; flipping onto one collapses top+bottom into the dress zone; swiping the bottom zone exits back to separates (restores last top). v0 adds a small "dresses →" discoverability hint on the top zone. Mirrors the existing dress-wins pipeline semantics. |
| 11 | **Selection semantics: tap-to-lock.** Browsing renders the candidate in a visually distinct preview state (dimmed + Keep/Revert affordance) and NEVER mutates the committed outfit; tapping the zone (or Keep) commits; starting to browse another slot reverts the prior browse. Structural moves (e.g., bottom-swipe dress exit) commit immediately. Centered-is-selected + undo REJECTED — it destroys work-in-progress by design. |
| 12 | **Presentation gate (Luke, post-spike).** Folded garment photos: soft warning + retake guidance at upload ("lay it flat"), hard exclusion from builder carousels. `presentation: flat \| folded \| angled` classified inside the existing `item.analyze` vision pass (zero extra API calls); existing folded items get a "retake to use in outfits" badge. Enhancement prompt v2 canonicalizes pose per category (upright, front-facing; tops sleeves relaxed; pants legs straight); founder closets get a one-time re-enhance backfill (~50 items ≈ $2.50). Measured need: ~25% of one founder closet is folded photos; 0% of the other. |
| 13 | **Slot scope reaffirmed.** Shoes stay in v1 (they visually terminate the composition; 20% of the cofounder's wardrobe). v1.1 accessories use **two-tier anchors**: on-body for worn-shape photo categories (necklace, eyewear, headwear), margin-beside-the-figure for display-pose categories (belt, scarf, bag) — implemented as tap-chips at anchor points, never additional swipe bands (four bands is the gesture budget on a phone). |

## 3. Interaction model

### Slots + canvas
- Mobile-first single-column canvas: **invisible-mannequin** placement (no visible figure, decision #9) with stacked slot zones — **outerwear, top, bottom, shoes** — each rendering the selected item's transparent cutout in body order.
- Each slot is a horizontal carousel of that category's items, swiped directly on its canvas zone. Slots can be empty (a "none" position — outerwear and shoes especially; "no jacket" is a first-class state).
- **Selection semantics — locked (#11): tap-to-lock.** Browsing shows a visually distinct preview (dimmed + Keep/Revert) and never mutates the committed outfit; tap commits; browsing a different slot reverts the prior browse. The spike prototyped centered-is-selected + undo as the alternative and rejected it: every peek rewrote the outfit with only one step recoverable.
- **Dress handling — locked (#10): fluid.** Dresses are the tail of the top carousel; landing on one collapses top+bottom into a single dress zone; swiping the bottom zone exits back to separates (restores the last top). A "dresses →" hint on the top zone ships in v0 for discoverability. Mirrors the existing dress-wins pipeline semantics. (The explicit Separates|Dress toggle was prototyped and set aside — modal, less playful.)
- **Post-save draft semantics — decide in v0 design review:** after "Save," does the workspace keep the composition (risk: accidental near-duplicate saves) or clear (risk: broken "keep going from here")? Recommendation to test: keep, with the Save button disabled until the composition changes again.
- Empty-wardrobe states: a slot with zero items shows an inline "Add tops →" affordance into the upload flow. The builder is the pull that grows wardrobes.

### Composition recipe (locked; spike-validated)
Items place by **trimmed alpha bbox** (opaque pixels at alpha>16) on a 3:4 portrait canvas over the invisible mannequin. Per-role constants — `widthFrac` (bbox width ÷ canvas width), `centerY` (bbox vertical center ÷ canvas height), max-height cap, z-order:

| role | widthFrac | centerY | maxH | z |
|---|---|---|---|---|
| outerwear | 0.90 | 0.29 | 0.46 | 30 |
| top | 0.74 | 0.285 | 0.42 | 20 |
| bottom | 0.58 | 0.665 | 0.50 | 10 |
| dress | 0.72 | 0.46 | 0.68 | 20 |
| shoes | 0.34 | 0.915 | 0.15 | 40 |

Plus one guard: tops with bbox aspect > 1.15 (sleeves spread) get width ×1.12. **Acceptance result:** 6/9 random top×bottom cells read as outfits; all 3 failures were one folded source photo — which is why coherence is now guaranteed upstream by decision #12 (presentation gate + canonical-pose enhancement), not by more geometry. Folded items are excluded from carousels until retaken.

**Recipe v2 (v0 ships this, not the spike module verbatim).** The spike constants above are the starting values, but v0 reworks two structural things the spike got away with only because the test closets lacked length variance:

1. **Edge-anchoring replaces center-anchoring.** Tops pin at the shoulder line, bottoms at the waist, dresses at the shoulder; garment length extends DOWNWARD from the anchor. Center-anchoring is a latent bug — a longline top would float its neckline upward; necklines and waists are the stable body landmarks. Constants re-derived from the spike values at port time; unit-tested placement math.
2. **Relational layering clamps.** Per-item multipliers compound (an oversized top hitting the sleeve-aspect guard reaches 0.93 canvas width — wider than outerwear at 0.90). Inner layers must never render wider than the outer layer: `top ≤ outerwear × ~0.92` when both are present, applied after all per-item scaling.

### Sizing & proportion (added post-dogfood 2026-07-07; self-critiqued design, Luke-approved)

**Problem.** Absolute garment scale is unrecoverable from photos in principle (no reference object in frame), and measured enhancement framing is *anti-correlated* with real size (tops fill 42–70% of frame height; a tank top filled more of its frame than a larger sweater). With fixed per-role width targets, a small tee renders the same size as a chunky knit. Fix is **metadata + deterministic math — never generative**, and never touches stored images (analysis is read-only; canvas scaling is uniform, aspect-preserving, display-time only).

- **v0 — Tier 0, deterministic, $0:** per-subcategory reference-width table (in code, auditable, tunable) × fit multiplier from the existing `closet_items.fit` (oversized ≈ ×1.12, relaxed ≈ ×1.05, regular ×1.0, slim ≈ ×0.92; NULL-safe default 1.0), clamped per role and by the relational layering rule above. Deterministic by construction: identical subcategory+fit always renders identically; re-analyzes cannot drift an item's size. **Acceptance test:** founder A/B grid (same outfits with/without sizing) — the spike's own methodology.
- **v1 — Tier 1, flagged collection:** `item.analyze` gains **length-class** (`cropped | regular | longline` — feeds the edge-anchored recipe), **size-label reading** when a care/size tag is visible (actual evidence, not estimation), and a **within-closet pairwise calibration** pass (one vision call per category over a grid of the user's own items → relative ordering/ratios; relative judgments are grounded, absolute ones are not). Stored as versioned `closet_items.size_estimate` jsonb `{source, version, values, confidence}`, **frozen once written** — an item's rendered size must never change without an explicit re-calibration. Recipe consumption stays behind a flag until founder data is eyeballed. **Explicitly rejected:** model-emitted absolute centimeters — a vision model cannot measure without a reference; its cm output is category prior + hallucinated precision + run-to-run noise, i.e., Tier 0 wearing a lab coat.
- **Horizon — Tier 2, only if a product feature needs true measurements:** user anchors (usual size per category via existing `users.bodyInfo`/preferences; one confirmed measured item; reference-object photo as opt-in; native AR capture later). Cheapest on-ramp: a "size look off?" tap-to-tune per-item correction in the builder — fixes the render immediately AND accumulates labeled data.
- **Stylist dividend (recorded, not scheduled):** the size/volume classes double as styling-intelligence inputs for the house-stylist rules (volume balance: oversized top → prefer slim/straight bottom; cropped over high-waist) — premium substance, not just rendering math.

### Save + render
- **Save** requires validity: (top AND bottom) OR dress. Shoes optional but nudged. Saved outfits get `source='manual'`, appear in grid + lookbook like AI outfits.
- **Card representation:** at save, the client exports the composed collage (canvas snapshot) and uploads it as the outfit's card image — cheap grid rendering AND an instantly shareable artifact. (Fashn render, when it exists, becomes the card's premium alternate.)
- **"See it on the model"**: fires existing `tryon.generate`. Async; reuses per-step polling. Quota indicator on the button ("5 of 7 left this week"); hidden for founder/premium entitlements.
- Renders show top/bottom/outerwear only; caption "garments only for now."

### Persistence (decision #6 mechanics)
- Single active draft per user, server-side: `outfit_drafts` (`user_id` unique, `slots` jsonb slot→itemId + dress state, `updated_at`). Debounced autosave (~1s). Builder mount restores verbatim.
- **Tolerances:** restore skips deleted/missing itemIds gracefully (empty that slot, subtle note). Concurrent devices: last-write-wins, documented, no merge.

## 4. New asset: transparent cutouts

Current enhanced photos are **JPEGs on white — no alpha**. Paper-doll stacking needs transparent cutouts (WebP-with-alpha preferred; PNG acceptable). New column `item_photos.cutout_storage_path`.

- **Bake-off — ANSWERED (decision #8, report §2):** the local lib won on the axis that matters most — identity fidelity (the image model regenerates garments) — *and* on cost ($0 vs ~$1.89/30-item closet), latency (0.8s vs 30s per item), and determinism. Cutouts run on the **enhanced** image (post prompt-v2 canonical pose), through `@imgly/background-removal-node` + the alpha-curve post-pass, stored as WebP-with-alpha.
- **Trigger strategy: lazy, not global.** Enqueue cutout generation on a user's FIRST builder-open (or at their flag flip), not as a fleet-wide backfill — no spend on users who never see the builder. At the measured ~0.8s/item, a 30-item closet cuts out in under half a minute on one worker, so lazy-on-first-open is comfortably interactive. Founders get proactive backfill during beta. New uploads: cutout step added to the enhancement flow, **fail-open and non-blocking** — a cutout failure must never affect the existing enhancement path.
- UI fallback while cutouts are pending/missing: enhanced JPEG on white — degraded but functional. Never block the builder.

## 5. Data + capability changes

| Change | Shape |
|---|---|
| `users.plan` + `users.features` | `plan: 'free' \| 'founder' \| 'premium'` (default free); `features` jsonb default `{}`. **Neither is read directly by gates.** |
| **Entitlements choke point** | `getEntitlements(user) → { builder: bool, aiStyling: bool, renderQuotaPerWeek: number \| null }` — ONE server-side function derives entitlements from plan + features; every gate (routes, capabilities, UI) reads only this. Future billing swaps the derivation, not the gates. Unit-tested truth table. |
| `outfits.source` | `'ai' \| 'manual'` (migration; existing rows backfill `'ai'`). |
| `outfit_drafts` | New table per §3. |
| `item_photos.cutout_storage_path` | New nullable column. |
| `closet_items.presentation` | `'flat' \| 'folded' \| 'angled'` (nullable varchar), classified by `item.analyze` (prompt extension, zero extra calls). Folded → excluded from builder carousels + "retake" badge; soft warning at upload. |
| **Enhancement prompt v2** | Canonical per-category flat-lay pose added to `enhancement.product_photo` (new prompt version; same single call per upload). One-time founder-closet re-enhance backfill (~$2.50). |
| `closet_items.size_estimate` (v1, flagged) | Versioned jsonb `{source, version, values, confidence}` from Tier-1 collection (§3 Sizing): length-class, size-label reads, pairwise closet calibration. Frozen once written. Tier 0 (v0) needs NO schema — existing `fit` + a constants table in code. |
| `outfits.card_storage_path` (or equivalent) | Collage snapshot from save (§3). Verify against how AI-outfit cards work today; reuse that mechanism if one exists. |
| `try_on_jobs.combo_hash` | Hash of sorted renderable itemIds + model-image identity + **pipeline_version salt** (bump on any render-affecting pipeline/prompt change — the framing fix already proved outputs change under identical inputs). On hit: **COPY the cached image to the new outfit's storage path** — never share pointers (process.ts's outfit-deleted cleanup deletes originals; shared pointers dangle). Per-user by construction (itemIds are per-user); no cross-user reuse. |
| **Render quota enforcement** | **Trailing-7-day count of `try_on_jobs` rows for the user, checked at enqueue inside `tryon.generate`.** NOT via `rate_limits`: that mechanism counts `generations` rows (written only AFTER completion → parallel-fire bypass), failed jobs write no generations row, and its window logic is hardcoded daily. Count jobs (status pending/running/complete) at enqueue; failures within the window still count (prevents infinite-retry abuse; our own failures are rare per the 0% baseline). |
| `outfit.createManual` | Validate slot composition (role rules, ownership), insert outfit + outfit_items `source='manual'`. |
| `outfit.saveDraft` / `outfit.getDraft` | Thin upsert + read. |
| `enhancement.cutout` | Cutout generation; lazy trigger + founder backfill entry point. |
| `outfit.generate` gate | Requires `entitlements.aiStyling`; free plan gets fake-door UI; API returns typed `premium_required` error. |

Explicitly reused unchanged: try-on pipeline (all shapes + framing validation + idempotent resume), async job infra, events, admin dashboards, i18n framework.

**Prerequisite audit (BEFORE v0):** the `role='shoes'`-holding-outerwear data oddity (followups P3) — slots are role-driven; run the mismatch audit query and fix root cause first.

## 6. Premium packaging (beta shape)

- Free: unlimited building/saving, 7 renders/week (trailing pool).
- Premium (fake door in beta): generous renders + AI styling. Free users see value framing + counted "coming soon" tap. Founders: same surface, "Founder access — on us," fully functional.
- No Stripe, no receipts. Entitlements choke point + counted gate-taps is the whole beta implementation.
- Positioning (cofounder copy): premium is the **house stylist** — her encoded taste (stylist_rules + annotated_examples) — not generic "AI."

## 7. Events (`domain.action_past_tense`, existing @tela/events)

- `outfit.builder_opened` (restored_draft: bool, cutouts_ready: bool)
- `outfit.builder_session_ended` (per-slot cycle counts, duration, saved: bool) — **reliability rule:** flush on `visibilitychange` with beacon semantics (mobile-web unload events are lossy), and cross-check counts against server-side draft-save deltas; if the client event proves too lossy, derive the session metric server-side and drop the client event.
- `outfit.manual_saved` (composition, had_shoes, dress_mode)
- `tryon.render_requested` (source, quota_remaining, cache_hit)
- `premium.gate_viewed` / `premium.gate_tapped` (surface)
- `wardrobe.add_prompted_from_builder` (slot)

## 8. Phasing → session prompts

**v-1 — SPIKE: DONE 2026-07-07, verdict GO.** All four recipes locked (§2a); evidence + judging kit in `docs/outfit-builder-spike-report.md` (kit on Luke's Desktop). Spike code stays on branch `spike/outfit-builder`, never merged.

**v0 — Builder core (dark; no render, no premium):** spike recipes applied (§2a) via **recipe v2** (edge-anchoring + relational layering clamps + Tier-0 deterministic sizing, §3). Cutout pipeline (lazy trigger + founder backfill) + builder UI (4 slots + fluid dress + tap-to-lock + empty states) + draft persistence (with restore tolerances) + save-as-manual-outfit + card snapshot + migrations (`outfits.source`, `outfit_drafts`, `item_photos.cutout_storage_path`, `closet_items.presentation`, `users.features`, card path) + entitlements choke point + events. Prerequisites: role-mismatch audit; presentation gate + `item.analyze` prompt extension; enhancement prompt v2 + founder re-enhance backfill.

**v1 — Render + premium scaffolding:** "See it on the model" → try-on; `combo_hash` cache (copy-on-hit, version salt); trailing-7-day quota in `tryon.generate`; `users.plan` + admin toggle (plan AND features editable from admin users page); AI gate + fake door; quota UI; Tier-1 size-estimation collection (flagged; §3 Sizing).

**v1.1 — Fast follows:** accessory slots (bag/jewelry/eyewear/hat, collage-only); step-cache render optimization (cached bottoms-on-model intermediates); possible remix button on outfit detail (explicitly deferred; nothing ever auto-loads the workspace).

**Horizon (flagged, not scheduled):** Fashn `model-create`/`model-swap` — "see it on YOU." Likely the strongest premium anchor the product will have; revisit after beta.

Each phase = a session prompt in `docs/session-prompts/` (house pattern: verified context, kill switches, STOP gates, operating constraints).

### 8a. Rollout — zero disruption to the current app (decision #7)

1. **New surface, not a replacement.** Builder lives at a new route with NO links from the existing UI. The current outfits page stays untouched throughout. The IA change (builder becomes hero, "Style me" demotes to premium button) is ONE small final commit, applied only when Luke flips.
2. **Per-user gating via entitlements** (`features.builder` input): route gates SERVER-SIDE — flag off means the route doesn't render even via typed URL. Rollout order: Luke → cofounder → testers. Rollback = flip back; no deploy.
3. **Additive-only data changes.** New tables + nullable columns; nothing existing altered or repurposed. Manual outfits appear only in their creator's grid.
4. **Shared-surface WHITELIST for build sessions** (the only pre-flip edits allowed to existing files): (a) the 14 locale dictionary files (new keys only); (b) the admin users page (plan/features toggles); (c) the enhancement flow's additive, fail-open cutout hook. Everything else: new files only. Any session needing an exception STOPS and asks Luke.
5. **Trunk-based dark shipping.** Increments merge to main (dark) through the normal review-then-push cadence — no long-lived feature branch. "Launch" is a flag flip.

## 9. Open questions

**Answered by the v-1 spike (Luke + cofounder, 2026-07-07):** cutout method → local lib + alpha curve (#8); canvas → invisible mannequin (#9); dress pattern → fluid (#10); selection semantics → tap-to-lock (#11).
**Luke + cofounder, before v1:** naming/copy for builder + premium tier; whether free users post-beta keep founder-era AI outfits visible (recommendation: yes — goodwill + they showcase premium).
**Settled post-dogfood (Luke, 2026-07-07):** silhouette → fully invisible (#9); sizing approach → §3 "Sizing & proportion" tiers.
**v0 design review:** post-save draft semantics (§3 recommendation: keep + disable Save until changed); polish of the tap-to-lock Keep/Revert bar (spike version covers the shoes zone); upload-gate copy for the folded-photo retake nudge (cofounder voice); Tier-0 sizing multiplier values (eyeball on the founder A/B grid).

## 10. Explicitly out of scope

Payments/Stripe; multiple named drafts; accessory try-on (Fashn can't); shoes in renders; dedicated social-share UX (the card snapshot is organically shareable; more later); "see it on YOU."
