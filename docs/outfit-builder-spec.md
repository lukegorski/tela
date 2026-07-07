# Outfit Builder — product + engineering spec (v1)

**Status: DRAFT for Luke + cofounder review — 2026-07-07**
**Owner thread:** outfits-page redesign (manual-first styling). Decisions below were made explicitly by Luke on 2026-07-07; do not relitigate them in build sessions.

---

## 1. Product intent

Invert the outfits page from AI-first to **manual-first**. Users build outfits themselves by flipping through their own wardrobe items on a mannequin-style canvas. AI styling remains available but becomes the **premium** path, not the default. The feature should feel like play (paper-doll composition), never lose the user's work, and treat the photoreal try-on render as a deliberate, valuable moment rather than an ambient effect.

## 2. Locked decisions (2026-07-07)

| # | Decision |
|---|---|
| 1 | Flipping is **instant and free**: transparent-cutout item images cycled per slot on a stylized canvas. Fashn renders are NEVER triggered by flipping. |
| 2 | Rendering on the model is a **deliberate action** with async delivery (~1–2 min), reusing the existing try-on pipeline unchanged. |
| 3 | **Beta premium = founder access flags, no payment infrastructure.** AI generation gets a fake-door premium gate; all beta testers get `founder` plan with everything unlocked. Payments come only after packaging is validated. |
| 4 | **Free render quota: 7 per week as a weekly pool** (not 1/day — allow bursts). Founders/premium bypass. Implemented via the existing `rate_limits` mechanism, general setting from day one, validated against beta usage. |
| 5 | **v1 slots: top, bottom, outerwear, shoes.** Bag / jewelry / eyewear / hat are a fast-follow (v1.1). Shoes participate in composition + saved outfit but not the render (pipeline already ignores them). |
| 6 | **Builder state persists server-side across sessions.** Whatever the user last had assembled/scrolled is exactly what appears on reopen — on any device. No auto-loaded suggestions, no random outfits in the workspace. Remix is OUT of v1. |

## 3. Interaction model

### Slots + canvas
- Mobile-first single-column canvas: a stylized mannequin/silhouette backdrop with four stacked slot zones — **outerwear, top, bottom, shoes** — each rendering the currently-selected item's transparent cutout, positioned in body order.
- Each slot is an independent horizontal carousel of that category's wardrobe items. **The centered item IS the selection** — no separate confirm step. Swiping a slot = restyling that layer.
- Slots can be emptied (a "none" position in the carousel — outerwear and shoes especially). Outerwear "none" is first-class: most outfits have no jacket.
- **Dress mode:** a one-piece toggle. Selecting a dress occupies top+bottom (both slot carousels collapse into one dress carousel); mirrors the existing dress-wins pipeline semantics. UI treatment needs cofounder input (see Open Questions).
- Empty-wardrobe states: a slot whose category has zero items shows an inline "Add tops →" affordance into the wardrobe upload flow. The builder is the pull that grows wardrobes.

### Save + render
- **Save** requires a valid outfit: (top AND bottom) OR dress. Shoes optional but nudged (subtle prompt if missing). Saved outfits get `source='manual'`, appear in the outfits grid + lookbook exactly like AI outfits.
- **"See it on the model"**: fires the existing `tryon.generate` on the saved outfit. Async; in-place progress states reusing the current per-step polling (`asyncStep`). Quota indicator lives on this button ("5 of 7 left this week" for free plan; hidden for founders/premium).
- Renders show top/bottom/outerwear only; a small caption notes "garments only for now" so the missing shoes read as expected behavior, not a bug.

### Persistence (decision #6 mechanics)
- Single active **draft per user**, server-side: `outfit_drafts` table (`user_id` unique, `slots` jsonb mapping slot→itemId (+ dress mode flag), `updated_at`). Debounced autosave (~1s after last change). Builder mount restores the draft verbatim.
- Per-slot scroll position IS the selection (centered item), so persisting slot→itemId fully captures "where they scrolled."
- v1 = one draft (the workspace). Multiple named drafts are a possible later feature, not now.

## 4. New asset: transparent cutouts

Current enhanced photos are **JPEGs on white — no alpha channel**. Paper-doll stacking needs transparent cutouts.

- New derived asset per item photo: transparent-background cutout (WebP-with-alpha preferred for size; PNG acceptable). New column `item_photos.cutout_storage_path` + storage alongside enhanced.
- Generation approach — **bake-off in the build session** on ~5 tricky items (white garments, sheer fabrics, fine straps): (a) image-model edit with transparent background output vs (b) deterministic local background-removal lib. Decide on quality + cost + determinism; document the choice.
- Hook: generate at enhancement time for new uploads (pipeline extension) + one-time backfill script for existing wardrobes (pennies per item at current scale).
- UI fallback: if cutout missing (backfill lag/failure), show the enhanced JPEG — degraded but functional. Never block the builder on cutout availability.

## 5. Data + capability changes

| Change | Shape |
|---|---|
| `outfits.source` | `'ai' \| 'manual'` (migration; existing rows backfill `'ai'`). Drives analytics + grid badges. |
| `outfit_drafts` | New table per §3. |
| `item_photos.cutout_storage_path` | New nullable column. |
| `users.plan` | `'free' \| 'founder' \| 'premium'` (default `'free'`). Admin-settable (small addition to admin users page). |
| `try_on_jobs.combo_hash` | Content hash of sorted renderable itemIds + model image — dedupe cache so an identical combination NEVER pays Fashn twice, even across separate saved outfits (renders are seed-deterministic). Lookup before enqueue; on hit, link the existing result. |
| `outfit.createManual` | New capability: validate slot composition (role rules, ownership), insert outfit + outfit_items with `source='manual'`. |
| `outfit.saveDraft` / `outfit.getDraft` | Thin draft persistence capabilities (or one upsert + read pair). |
| `enhancement.cutout` (or pipeline step) | Cutout generation + backfill entry point. |
| `tryon.generate` additions | Pre-check weekly render quota via `rate_limits` (the long-deferred "extend rate_limits to Fashn" followup — now with a product driver); `users.plan` bypass; combo_hash lookup. |
| `outfit.generate` gate | Requires plan ∈ {founder, premium}; free plan gets the fake-door UI (below), API returns a typed `premium_required` error. |

Explicitly reused unchanged: try-on pipeline (all three shapes + framing validation + idempotent resume), async job infra, events, admin dashboards, i18n framework (14 locales — all new strings need the full dictionary pass).

## 6. Premium packaging (beta shape)

- Free: unlimited building/saving, 7 renders/week.
- Premium (fake door in beta): unlimited/high renders + AI styling ("Style me" = today's outfit.generate). Gate UI for free users: value framing + "coming soon" waitlist tap (counted). For founders: same surface but marked "Founder access — on us," fully functional.
- **No Stripe, no receipts, no entitlement service.** `users.plan` + capability gates + counted gate-taps is the whole beta implementation.
- Positioning note for copy (cofounder): the premium isn't "AI" — it's the house stylist. The stylist_rules/annotated_examples layer IS her taste; say so.

## 7. Events (all via existing @tela/events, `domain.action_past_tense`)

- `outfit.builder_opened` (payload: restored_draft: bool)
- `outfit.builder_session_ended` (per-slot cycle counts, duration, saved: bool — ONE summary event per session, not per swipe; swipe-level events would be noise)
- `outfit.manual_saved` (slot composition, had_shoes, dress_mode)
- `tryon.render_requested` (source: 'builder' | 'grid', quota_remaining, cache_hit)
- `premium.gate_viewed` / `premium.gate_tapped` (surface: 'style_me' | 'render_quota')
- `wardrobe.add_prompted_from_builder` (slot)

These feed the beta engagement questions directly: composition depth, save rate, render conversion, premium intent, wardrobe-growth pull.

## 8. Phasing → session prompts

**v0 — Builder core (no render, no premium):** cutout pipeline + backfill; builder UI (4 slots + dress mode + empty states); server-side draft persistence; save as manual outfit; migrations (`outfits.source`, `outfit_drafts`, `item_photos.cutout_storage_path`, `users.features`); events. *Ships DARK — see §8a.*

**v1 — Render + premium scaffolding:** "See it on the model" wired to try-on; `combo_hash` cache; weekly quota via rate_limits; `users.plan` + admin toggle; AI gate + fake door; quota UI.

**v1.1 — Fast follows:** accessory slots (bag/jewelry/eyewear/hat, collage-only); role-hygiene audit promotion (the `role='shoes'` mismatch P3 becomes load-bearing once slots are role-driven — audit BEFORE v0 ships, actually: pull into v0 prep); step-cache render optimization (cached bottoms-on-model intermediates → cheaper re-renders when only the top changed); possible remix button on outfit detail (explicitly deferred; nothing ever auto-loads the workspace).

**Horizon (flagged, not scheduled):** Fashn `model-create`/`model-swap` — "see it on YOU" (user's own photo as the mannequin). Likely the strongest premium anchor the product will have; revisit after beta.

Each phase becomes a session prompt in `docs/session-prompts/` following the house pattern (verified context, kill switches, STOP gates, operating constraints).

### 8a. Rollout — zero disruption to the current app (Luke's requirement, 2026-07-07)

The current user experience must be unaffected until a deliberate, reversible flip:

1. **New surface, not a replacement.** The builder lives at a new route with NO links from the existing UI. The current outfits page stays untouched throughout v0/v1. The IA change (builder becomes the outfits-page hero, "Style me" demotes to the premium button) is ONE small final commit, applied only when Luke flips.
2. **Per-user feature flag**: `users.features` jsonb (default `{}`), admin-toggleable from the admin users page. The builder route gates SERVER-SIDE on `features.builder` — flag off means the route doesn't render even via typed URL. Rollout order: Luke → cofounder → testers. Rollback = flip the flag back; no deploy.
3. **Additive-only data changes.** New tables + nullable columns only; nothing existing is altered or repurposed. Manual outfits appear only in their creator's own grid.
4. **Shared-surface rules for build sessions:** (a) NO modifications to existing routes/components during v0/v1 except the final flip commit; (b) the enhancement-pipeline cutout extension must be fail-open and non-blocking — a cutout failure can never affect the existing photo-enhancement flow; (c) `outfit.generate` behavior is unchanged for all users during beta (everyone is founder-plan).
5. **Trunk-based dark shipping.** Increments merge to main (flag off) through the normal review-then-push cadence — no long-lived feature branch, no big-bang merge. "Launch" is a flag flip.

## 9. Open questions (cofounder + Luke)

1. Dress-mode UI treatment (toggle? auto-collapse when a dress is centered?) — needs her design instinct.
2. Cutout bake-off acceptance bar — she should judge the 5-item sample.
3. Naming/copy for the builder surface + premium tier.
4. Whether free users at beta's end keep their founder-era AI outfits visible (grandfathered artifacts) — recommendation: yes, they're remix-bait and goodwill.
5. Canvas aesthetic: literal mannequin silhouette vs abstract stacked composition — sample both in v0.

## 10. Explicitly out of scope

Payments/Stripe; multiple named drafts; accessory try-on (Fashn can't); shoes in renders; social sharing surfaces (the rendered image is organically shareable — dedicated share UX later); "see it on YOU."
