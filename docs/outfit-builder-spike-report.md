# Outfit Builder v-1 spike — report + judging kit

**Status: FINAL — VERDICT: GO. Luke + cofounder confirmed all four recipes 2026-07-07 (same day as the spike): cutout = local lib + alpha curve; canvas = invisible mannequin (revised from body-stack after Luke's grid judgment — see Post-verdict addendum); dress = fluid; selection = tap-to-lock. Locked into spec v3 §2a.**
**Spike code:** branch `spike/outfit-builder` (never merges; this report + spec updates are the only artifacts that go to main, post-verdict).
**Judging kit:** `~/Desktop/tela-builder-spike/` (39 files — images, recordings, spend log). File references below point into that folder.
**Touch prototype:** run `bash scripts/dev-web.sh` on the spike branch → `http://localhost:3001/en/spike-builder` (gate is open in local dev; founder emails elsewhere). Judged on a 390×844 viewport; all recordings captured there.

---

## TL;DR — verdict: **GO** (confirmed), with the data-quality workstream promoted to a gate

The central risk the spike existed to probe — *do cutouts of real wardrobe photos compose coherently and feel like play?* — resolved positively, with one course-correction during judging (see Post-verdict addendum):

| Decision | Locked recipe (spec v3 §2a) |
|---|---|
| 1. Cutout method | **Local lib (@imgly/background-removal-node) + deterministic alpha-curve post-pass.** $0, ~0.8s/item, pixel-faithful. The image model regenerates garments — disqualifying for a wardrobe app. |
| 2. Composition + canvas | **Invisible mannequin**: per-role width targets + fixed vertical anchors on trimmed alpha bboxes (constants below), coherence guaranteed upstream by a **no-folded upload gate + canonical-pose enhancement** rather than more geometry. |
| 3. Dress pattern | **Fluid** (dresses at the end of the top carousel; bottom-swipe exits). Toggle prototyped and set aside. |
| 4. Selection semantics | **Tap-to-lock** — browsing is visually distinct, never mutates the outfit, and the protection is legible. Centered+undo rejected: silently destroys work by design. |

**The one real product risk found:** ~25% of the cofounder's real wardrobe photos are folded/crumpled garments, and even unfolded photos vary in pose (sleeves spread vs down, angled legs). Cutouts of folded clothes compose as laundry — no recipe fixes that. Verdict: prevent at the source — soft upload gate + `presentation` classification in `item.analyze` + canonical-pose enhancement prompt v2 (Luke's post-spike decision, spec §2a #12). Luke's wardrobe: 0% folded.

Total spend: **$1.04** of the $5 cap (17 OpenAI calls, logged per call in `spend-log.json`).

---

## 1. What was run

- **15 real items** from the dev DB (4 Luke, 11 marina), hard cases deliberately included: white-on-white (white dress shirt, cream sweater, cream tank, beige pants), sheer lace (cream blouse), thin straps (camisole, two strappy sandals), unusual silhouette (strapless top), irregular drape (red floral skirt), one folded garment (indigo jeans), one awkward-angle shot (buckled sandals). Inputs are the *enhanced* JPEGs, matching what production would feed a cutout step.
- **Both cutout methods on exactly those 15** (Method B additionally ran on all 50 non-accessory items to fill the prototype's carousels — free).
- **3×3 coherence grid**: 3 tops × 3 bottoms drawn by seeded RNG (seed 20260707) from the bake-off set, auto-stacked with zero per-cell adjustment.
- **Touch prototype** in the real web app (new route, own root layout, zero edits to existing files): 4 swipeable slot zones on the canvas, both dress patterns, both selection semantics, both canvas aesthetics, live-toggleable. Five recordings.
- **Dress placeholders:** the dev DB has zero dress items (the one "dress" hit is a *dress shirt*). Luke chose watermarked placeholders (2026-07-07) — two generated, clearly stamped PLACEHOLDER. Dress patterns are judged on interaction feel only; **dress cutout quality is explicitly unjudged this spike.**

## 2. Phase 1 — cutout bake-off

**Kit:** `01-cutout-bakeoff/_overview.png` (all 15, original | A | B on checkerboard), `per-item/*.png`, `_b-vs-b2.png` (post-pass proof).

### Method A — image model (gpt-image-1.5, production call shape + `background: 'transparent'`)

The Responses-API `image_generation` tool accepts `background: 'transparent'` + `output_format: 'png'` on top of the exact production enhancement call (`action: 'edit'`, `input_fidelity: 'high'`, quality medium, 1024×1536). All 15 returned genuine alpha. **But it regenerates the garment rather than cutting it out:**

- **Camisole**: floral pattern *moved position* on the fabric.
- **Red floral skirt**: embossed texture erased; flat saturated red; drape reshaped.
- **Cream sweater**: different neckline, smoothed knit, baked-in shadow.
- **White shirt / lace blouse / tank**: proportions inflated or recolored; placket details altered on the striped shirt.
- Several results bake soft shadows into the asset (bad for compositing — shadows must come from the canvas layer).

For a wardrobe app the asset must be *the user's garment*. A user knows her camisole; a rearranged print reads as wrong item. `input_fidelity: 'high'` does not prevent this.

### Method B — local lib (@imgly/background-removal-node, isnet, default settings)

Pixel-faithful on **15/15** — patterns, straps, buckles, lace texture all preserved exactly. Weaknesses: a translucent white **ghost rectangle** on white-on-white items (worst: white dress shirt), and soft alpha on genuinely sheer/vinyl materials (arguably *correct* for compositing). 

**Post-pass fix:** a deterministic alpha curve (0 below 70, 255 above 190, linear ramp between) kills the ghost while keeping soft garment edges — see `_b-vs-b2.png`. Residual faint edge fringe is invisible on the light builder canvas (verified in the prototype and the coherence grid, both of which use B+curve assets).

### Numbers (per item, measured)

| | Method A (gpt-image-1.5) | Method B (imgly + alpha curve) |
|---|---|---|
| Fidelity to the real garment | **Fails on ~half the set** (regeneration) | Exact, 15/15 |
| Edge quality | Clean but synthetic | Clean; mild halo on whites pre-curve, fixed by curve |
| Holes/gaps (straps, lace) | Good | Good (strap gaps properly transparent) |
| Color fringe | None (repainted) | None observed |
| Runtime | 25–39s (mean ~31s) | 0.7–1.1s (mean ~0.8s) |
| Cost | ~6.3¢/item measured (5¢ image + orchestration) | $0 |
| Determinism | No | Yes |
| 30-item closet | ~**$1.89**, ~16 min serial | ~$0, ~24s |

Spec §4 weights cost-at-scale heavily and says model-based wins only on decisive quality superiority. The result is the opposite: **B wins on quality where it matters (identity), plus cost, speed, and determinism.** Recommendation: **Method B + alpha-curve post-pass**, output WebP-with-alpha. (The 30s model latency would also have made spec §4's lazy on-first-builder-open trigger painful; at 0.8s/item, a 30-item closet cuts out in under a minute on one worker.)

## 3. Phase 2 — composition coherence (the acceptance test)

**Kit:** `02-coherence/coherence-grid.png`, `aesthetic-silhouette.png`, `aesthetic-abstract.png`.

### Recipe (constants iterated by eye, two rounds)

All units are fractions of a 3:4 portrait canvas; items are placed by their **trimmed alpha bbox** (not image frame):

| role | width target | vertical center | max height | z |
|---|---|---|---|---|
| outerwear | 0.90 | 0.29 | 0.46 | 30 |
| top | 0.74 | 0.285 | 0.42 | 20 |
| bottom | 0.58 | 0.665 | 0.50 | 10 |
| dress | 0.72 | 0.46 | 0.68 | 20 |
| shoes | 0.34 | 0.915 | 0.15 | 40 |

Plus one guard: tops with bbox aspect > 1.15 (sleeves spread flat) get width ×1.12, else spread-sleeve tops read too small in the torso. Z-order: bottom under top under outerwear; shoes over hems at the feet. The same module drives the node compositor (grid) and the live page — what judges see in the grid is exactly what the prototype renders.

### Acceptance grid result

Seeded random draw: white dress shirt / cream sweater / black camisole × light jeans / red floral skirt / folded indigo jeans.

- **6/9 cells read as outfits.** The three skirt cells are genuinely good; the light-jeans cells pass with a caveat (the source photo is shot at an angle, so the pair reads slightly lopsided — data, not recipe).
- **3/9 fail — all three are the folded indigo jeans**, which compose as a denim blob under a top. No scaling/anchoring can fix a photo of folded laundry.
- The white shirt composes cleanly on the off-white canvas — the white-on-white cutout risk did not materialize post-curve.

### Failure-mode count (real wardrobes)

Reviewed all 50 non-accessory items (`00-wardrobe/contact-*.png`):

- **marina: 8–9 of 32 (~25–28%) folded or awkwardly photographed** (folded jeans, 2 folded leggings, 2 folded skirts, folded trousers, folded shirt, folded sweater; plus one angled sandals shot).
- **Luke: 0 of 18.**

The enhancement pipeline preserves the folded presentation (correctly — it doesn't hallucinate an unfolded garment, and we wouldn't want it to). **Proposal for v0:** add a `presentation: flat | folded | angled` field to the existing `item.analyze` vision pass (zero extra API calls), then (a) folded items render in carousels with a "re-shoot for better outfits" nudge, and (b) they're excluded from any future auto-compose features. A cheap bbox-aspect heuristic (trousers/jeans/leggings with bbox w/h > 0.9 ≈ folded) catches most cases if we want it before v0's analyze change.

### Canvas aesthetics (both sampled, same outfit)

`aesthetic-silhouette.png` (faint mannequin behind the stack) vs `aesthetic-abstract.png` (gradient, floating stack + soft shadows). Also toggleable live in the prototype. My lean: **silhouette** — it gives the composition a body logic and makes empty slots legible ("nothing on the legs yet"), and it's what makes the paper-doll metaphor read. Cofounder judges.

## 4. Phase 3 — interaction feel (prototype + recordings)

**Kit:** `03-recordings/*.mp4` + `stills/`. All recorded on the real page against real cutouts.

| Recording | What it shows |
|---|---|
| `01-flipping-feel.mp4` | Swiping tops/bottoms/outerwear/shoes on the canvas; None states; live aesthetic toggle. |
| `02-dress-toggle.mp4` | Pattern A: explicit Separates ⇄ Dress segmented toggle; dress carousel spans both zones. |
| `03-dress-fluid.mp4` | Pattern B: flipping tops flows off the end into dresses (zones merge); swiping the bottom zone exits back to separates. |
| `04-select-centered-undo.mp4` | Semantics A: a stray swipe mutates the outfit; the floating ↩ Undo chip rescues it (one step). |
| `05-select-tap-lock.mp4` | Semantics B: browsing renders semi-transparent with a "browsing … Keep / Revert" bar; Revert proves the outfit was never touched; Keep commits. The "browse nearly destroys my outfit" save. |

Notes from building/using it:

- **Flipping on the canvas is the delight moment** — swiping a zone and watching the outfit recompose feels like a paper doll, not a form. The hypothesis holds on desktop-touch emulation; it needs 10 minutes on a real phone to confirm (see judging guide).
- **Selection:** centered-is-selected feels friction-free until you browse: every peek rewrites the outfit and only one step is recoverable. Tap-to-lock's browse state (dimmed item + Keep/Revert) makes work-in-progress protection *visible*. My recommendation: **tap-to-lock**, with the browse bar polished in v0 (current one is functional-ugly and can cover the shoes zone).
- **Dress patterns:** the toggle is unambiguous but modal — dresses feel like a different app mode. Fluid makes dresses part of the same flipping vocabulary and the bottom-swipe exit ("swipe to bring separates back") demoed well; its risk is discoverability (dresses hide at the end of a long top carousel). If fluid wins, v0 should add a small "dresses →" affordance on the top zone. Womenswear judgment belongs to the cofounder.
- Prototype simplifications to not over-read: identical labels for marina's two black camisoles make some flips look like no-ops; the browse bar text wraps clumsily; folded items are present in carousels (deliberately — feel the problem).

## 5. Spend log

17 calls, **$1.045 total** (cap $5). Full per-call detail in `spend-log.json` (also committed on the spike branch at `spike/assets/spend-log.json`).

| What | Calls | Cost |
|---|---|---|
| Method A cutouts (15 items) | 15 | 94.5¢ (~6.3¢ each: 5¢ image + gpt-5.4 orchestration tokens) |
| Placeholder dresses (images.generate, transparent) | 2 | 10.0¢ |
| Method B (50 items) + post-pass + all composition | 0 | $0 |

## 6. GO/NO-GO: **GO** — confirmed by Luke + cofounder, 2026-07-07

Per the session doc, GO = coherence grid passes + at least one cutout method meets the quality bar at acceptable cost.

1. **Cutout bar: met, at zero cost.** Method B + curve is faithful on all 15 including the deliberate hard cases, and is free, fast, and deterministic — the best possible answer to spec §4's cost-at-scale worry ($0 vs $1.50/closet).
2. **Coherence bar: met for flat-lay inputs.** Every grid failure is one folded source photo. With a folded flag (v0 proposal above), the builder composes coherently from real closets.
3. **Feel: strong signal, one confirmation pending.** All four interaction candidates work smoothly in the prototype; final feel judgment needs the cofounder's thumb on a real phone — which is exactly what the STOP gate is for.

**What would flip this to NO-GO:** if hands-on phone judging finds flipping mushy/laggy in a way desktop emulation hides, or if the cofounder judges the composed outfits as "two pictures near each other" despite the grid. Neither is expected from the evidence.

## 7. What the judges decided (spec §9) — all answered 2026-07-07; kept as the judging guide

1. **Cutout method** — confirm B+curve from `_overview.png` + `_b-vs-b2.png` (esp. white shirt, lace blouse, camisole rows).
2. **Coherence + canvas aesthetic** — does the 3×3 read as outfits? Silhouette or abstract?
3. **Dress pattern** — toggle (`02`) vs fluid (`03`) recordings, then hands-on.
4. **Selection semantics** — undo (`04`) vs tap-to-lock (`05`) recordings, then hands-on.
5. Optional hands-on: `bash scripts/dev-web.sh` on branch `spike/outfit-builder` → `localhost:3001/en/spike-builder` (all four probes live-toggleable in the foot bar). If phone judging is wanted, discuss a dark deploy with Luke — spike code does not merge to main for it.

## 8. Post-verdict addendum (2026-07-07, same day)

The judging conversation materially improved the plan — recorded here so the evidence trail stays honest:

1. **Luke failed the body-stack coherence grid** ("does not really look good"). Root cause: pose variance in real flat-lay photos (sleeves spread vs down, angled legs), which geometric normalization cannot fix — the folded-photo failure was only the worst case of a broader input-consistency problem.
2. **Alternatives were rendered with the same seeded 3×3** (kit `04-alternatives/`): styled flat-lay collage (strong — pose variance reads as intentional; folded items become natural) and stacked slot cards (legible but utility-feeling). Collage survives as a candidate art direction for the *save card* only.
3. **Final canvas direction (Luke): invisible mannequin** — the body-anchored recipe as prototyped — made viable by attacking inputs instead of rendering: **no-folded upload gate** (soft warn + retake guidance; hard exclusion from builder carousels; `presentation: flat|folded|angled` classified in the existing `item.analyze` pass) plus **enhancement prompt v2** canonicalizing per-category pose through the call every upload already makes (~$2.50 one-time founder re-enhance).
4. **Slot scope settled** (kit `04-alternatives/mannequin-scope.png`): shoes stay in v1 — without them the composition floats (panel B). v1.1 accessories get **two-tier anchors**: on-body for worn-shape photos (necklace verified with a real item; eyewear/headwear when assets exist), margin-beside-the-figure for display-pose photos (the coiled belt pinned at the waist looked absurd — evidence in the first triptych iteration). Interaction: tap-chips at anchors, never more swipe bands.
5. **Cofounder confirmed** dress = fluid, selection = tap-to-lock, and the mannequin canvas direction. GO recorded; spec updated to v3 (§2a).

**Next:** cut the v0 session prompt (spec §8 scope + the new prerequisites: role-mismatch audit, presentation gate, enhancement prompt v2 + founder re-enhance, cutout pipeline, builder UI with fluid dress + tap-to-lock, draft persistence, save-as-manual + card snapshot, migrations, entitlements choke point, events).

---

*Appendix — repo artifacts (branch `spike/outfit-builder`): `spike/tools/*.mjs` (inventory, download, both cutout methods, alpha refine, manifest, compositor, recordings), `spike/assets/` (originals, cutouts, sheets, grid, spend log), `apps/web/src/app/(spike)/[lang]/spike-builder/` (prototype page), `apps/web/public/spike-builder/` (52 WebP cutouts + manifest). The spec's §8 v-1 commit reference `4dd2a36` predates a rebase; spec v2 is `e0f69c8` on main.*
