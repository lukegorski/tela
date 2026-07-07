# Outfit Builder — product + engineering spec (v2)

**Status: DRAFT for Luke + cofounder review — 2026-07-07 (v2 after adversarial self-critique, same day)**
**Owner thread:** outfits-page redesign (manual-first styling). Decisions in §2 were made explicitly by Luke; do not relitigate them in build sessions. Items marked **SPIKE-DECIDES** are deliberately unresolved until the v-1 spike answers them with real assets on a real phone.

---

## 1. Product intent

Invert the outfits page from AI-first to **manual-first**. Users build outfits themselves by flipping through their own wardrobe items on a mannequin-style canvas. AI styling remains available but becomes the **premium** path, not the default. The feature should feel like play (paper-doll composition), never lose the user's work, and treat the photoreal try-on render as a deliberate, valuable moment rather than an ambient effect.

**The central risk is NOT engineering — it's whether flipping cutouts of real wardrobe photos feels delightful and composes coherently.** The plan therefore leads with a throwaway spike (§8, v-1) before any durable infrastructure.

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

## 3. Interaction model

### Slots + canvas
- Mobile-first single-column canvas: stylized silhouette backdrop with stacked slot zones — **outerwear, top, bottom, shoes** — each rendering the selected item's transparent cutout in body order.
- Each slot is a horizontal carousel of that category's items. Slots can be empty (a "none" position — outerwear and shoes especially; "no jacket" is a first-class state).
- **Selection semantics — SPIKE-DECIDES.** Naive "centered item = selection" means browsing mutates the outfit (peek at one more top and your loved combo is gone, autosaved away). Candidates to probe: (a) centered-is-selected + one-step undo; (b) tap-to-lock per slot with visually distinct browse state; (c) dwell-based commitment. The spike picks whichever feels right AND protects work-in-progress.
- **Dress handling — SPIKE-DECIDES.** Two candidate patterns, both prototyped for the cofounder (her audience is womenswear-heavy; dresses must not feel bolted on): (a) explicit one-piece toggle collapsing top+bottom; (b) dresses as a natural carousel occupying the top+bottom zone, where swiping either separates slot fluidly exits dress mode. Whichever wins must mirror the existing dress-wins pipeline semantics.
- **Post-save draft semantics — decide in v0 design review:** after "Save," does the workspace keep the composition (risk: accidental near-duplicate saves) or clear (risk: broken "keep going from here")? Recommendation to test: keep, with the Save button disabled until the composition changes again.
- Empty-wardrobe states: a slot with zero items shows an inline "Add tops →" affordance into the upload flow. The builder is the pull that grows wardrobes.

### Composition coherence (the real hard problem)
Stacking arbitrary cutouts must **read as an outfit**, not a collage of mismatched scales. Real wardrobe photos vary in aspect ratio, garment scale, and orientation (some garments photographed folded). Required: per-category normalization heuristics (relative width targets — e.g., top shoulder-width ≈ bottom waist-width × k — plus vertical anchor points). **Acceptance test (spike): 3 random tops × 3 random bottoms from a real closet must stack into something that reads as an outfit.** Folded/awkward source photos may need flagging or exclusion rules; the spike quantifies how common they are in real wardrobes.

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

- **Bake-off (in the spike, on 10–15 real items incl. white garments, sheer fabrics, fine straps):** (a) image-model edit with transparent output vs (b) deterministic local background-removal lib. **Weight cost-at-scale heavily**: model-based ≈ 5¢ × ~30-item closet = ~$1.50/user of pure asset cost pre-revenue; the local lib is ~free and deterministic. Model-based wins only on decisive quality superiority. Cofounder judges the sample (§9).
- **Trigger strategy: lazy, not global.** Enqueue cutout generation on a user's FIRST builder-open (or at their flag flip), not as a fleet-wide backfill — no spend on users who never see the builder. Founders get proactive backfill during beta. New uploads: cutout step added to the enhancement flow, **fail-open and non-blocking** — a cutout failure must never affect the existing enhancement path.
- UI fallback while cutouts are pending/missing: enhanced JPEG on white — degraded but functional. Never block the builder.

## 5. Data + capability changes

| Change | Shape |
|---|---|
| `users.plan` + `users.features` | `plan: 'free' \| 'founder' \| 'premium'` (default free); `features` jsonb default `{}`. **Neither is read directly by gates.** |
| **Entitlements choke point** | `getEntitlements(user) → { builder: bool, aiStyling: bool, renderQuotaPerWeek: number \| null }` — ONE server-side function derives entitlements from plan + features; every gate (routes, capabilities, UI) reads only this. Future billing swaps the derivation, not the gates. Unit-tested truth table. |
| `outfits.source` | `'ai' \| 'manual'` (migration; existing rows backfill `'ai'`). |
| `outfit_drafts` | New table per §3. |
| `item_photos.cutout_storage_path` | New nullable column. |
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

**v-1 — SPIKE (first, one session, throwaway-allowed, zero migrations):** flag-gated bare page (hardcoded gate is fine). Cutout 10–15 REAL items from Luke's + cofounder's wardrobes via BOTH bake-off methods. Hardcoded composition heuristics. Probe: composition-coherence acceptance test (§3), carousel feel on a real phone, both dress patterns, browse-vs-commit candidates. **Output: GO/NO-GO + four locked recipes** — cutout method, composition/normalization recipe, dress pattern, selection semantics. Cofounder judges. Nothing else proceeds until this reports.

**v0 — Builder core (dark; no render, no premium):** spike recipes applied. Cutout pipeline (lazy trigger + founder backfill) + builder UI (4 slots + dress + empty states) + draft persistence (with restore tolerances) + save-as-manual-outfit + card snapshot + migrations (`outfits.source`, `outfit_drafts`, `item_photos.cutout_storage_path`, `users.features`, card path) + entitlements choke point + events. Prerequisite: role-mismatch audit.

**v1 — Render + premium scaffolding:** "See it on the model" → try-on; `combo_hash` cache (copy-on-hit, version salt); trailing-7-day quota in `tryon.generate`; `users.plan` + admin toggle (plan AND features editable from admin users page); AI gate + fake door; quota UI.

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

**Spike answers (cofounder judging):** dress pattern (two prototypes); cutout quality bar + method; canvas aesthetic (literal silhouette vs abstract stack — sample both); selection/browse semantics.
**Luke + cofounder, before v1:** naming/copy for builder + premium tier; whether free users post-beta keep founder-era AI outfits visible (recommendation: yes — goodwill + they showcase premium).
**v0 design review:** post-save draft semantics (§3 recommendation: keep + disable Save until changed).

## 10. Explicitly out of scope

Payments/Stripe; multiple named drafts; accessory try-on (Fashn can't); shoes in renders; dedicated social-share UX (the card snapshot is organically shareable; more later); "see it on YOU."
