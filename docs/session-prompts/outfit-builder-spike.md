# Session prompt — Outfit Builder v-1 SPIKE (throwaway prototype, GO/NO-GO)

## Read first

`docs/outfit-builder-spec.md` (v2, commit `4dd2a36`) top to bottom — especially §2 locked decisions, §3 SPIKE-DECIDES items, §4 bake-off, §8 v-1 scope. The spec's decisions are Luke's; do not relitigate. This session exists because **the central risk is not engineering — it's whether flipping real-wardrobe cutouts composes coherently and feels delightful on a phone.**

## Mission

Produce a **GO/NO-GO verdict + four locked recipes**, judged by Luke + cofounder:

1. **Cutout method** — image-model transparent output vs local background-removal lib.
2. **Composition/normalization recipe** — how cutouts scale/anchor/stack so arbitrary combinations read as an outfit.
3. **Dress pattern** — explicit one-piece toggle vs fluid dress-carousel-in-the-top+bottom-zone.
4. **Selection semantics** — centered-is-selected + undo vs tap-to-lock vs dwell; must protect work-in-progress from casual browsing.

## Spike license + hard limits

- **Throwaway license:** prototype code quality bar is LOW. No tests required. Hardcoded English fine (skip the 14-locale dictionary pass). Hardcoded user gate fine.
- **Hard limits:** ZERO schema changes/migrations. ZERO new capabilities. ZERO edits to existing routes/components/pipelines. No Fashn calls (renders are out of spike scope).
- **Code stays on a branch** (`spike/outfit-builder`), never merged. Only the report + spec updates merge to main. This is the one house-pattern exception to trunk-based work — the code is explicitly disposable.
- **Judging is local-first:** run via `bash scripts/dev-web.sh` (or equivalent) and produce a judging kit (below) of images + screen recordings. Only if Luke asks for hands-on-phone judging, discuss a dark deploy with him — do not push spike code to main.
- **Spend cap: $5 total** for image-model cutout calls, logged per call. Local-lib experiments are free.

## Phase 1 — Cutout bake-off (both methods, same real items)

1. Pull **10–15 real items** from Luke's + cofounder's wardrobes in the dev DB (they are real users; enhanced photos exist per item). Deliberately include hard cases: white/light garments (white-on-white edges), anything sheer, thin straps, and any folded/awkwardly-photographed garments you can find.
2. **Known gap:** the dev DB had ZERO dress items as of July. For the dress-pattern prototype, either ask Luke to have the cofounder upload 1–2 real dresses through the normal flow (best — real dogfood), or use 2 placeholder dress images clearly marked as placeholders (acceptable for interaction-feel only, NOT for cutout judging).
3. Method (a): image-model edit with transparent background output via the existing @tela/ai image path (verify the current API's transparent-background support before assuming; the enhancement pipeline is the reference integration). ~5¢/image.
4. Method (b): a local background-removal library (e.g. an ONNX-based JS lib or rembg via a throwaway script — pick whatever runs tonight; determinism + zero cost are the point).
5. Produce a **side-by-side sheet** (single composite image per item: original → method A → method B on a checkerboard background) + a table: edge quality notes, holes/gaps handling, color fringe, per-item runtime, per-item cost. Include the §4 cost-at-scale framing (model ≈ $1.50/30-item closet vs lib ≈ free) in the report.

## Phase 2 — Composition coherence (the acceptance test)

1. Implement the normalization heuristic sketch from spec §3: per-category width targets (top shoulder ≈ bottom waist × k), vertical anchors, z-order (bottom under top under outerwear; shoes at feet). Iterate constants by eye — this is recipe-finding, not engineering.
2. **Acceptance test: a 3×3 grid** — 3 random tops × 3 random bottoms from the real items, every combination auto-stacked with zero manual adjustment. Screenshot the grid. The question for judges: does each cell read as "an outfit," not "two pictures near each other"?
3. Sample BOTH canvas aesthetics (spec §9): literal mannequin/silhouette backdrop vs abstract floating stack. One screenshot each, same outfit.
4. Note failure modes honestly: which real photos break the recipe (folded pants, cropped flat-lays), how common that is in the real wardrobes (count), and whether the fix is recipe rules or per-item flags.

## Phase 3 — Interaction feel (touch prototype)

1. Bare flag-gated page (hardcode Luke's + cofounder's user IDs), mobile viewport: the 4 slot carousels (outerwear/top/bottom/shoes) with the Phase 2 recipe live.
2. Prototype **both dress patterns** (spec §3): (a) explicit toggle; (b) dress carousel occupying the top+bottom zone where swiping either separates slot fluidly exits dress mode.
3. Prototype at least TWO selection-semantics candidates: (a) centered-is-selected + one-step undo; (b) tap-to-lock with a visually distinct browse state. (Dwell-based only if time permits.)
4. Record short screen captures (10–20s each): general flipping feel, each dress pattern, each selection candidate, plus one "browse nearly destroys my outfit and the mechanism saves it" demonstration per candidate.

## Phase 4 — Judging kit + STOP gate

Assemble into `~/Desktop/tela-builder-spike/` AND write the report at `docs/outfit-builder-spike-report.md` (this file merges to main):

- Side-by-side cutout sheet + cost/runtime/quality table + your recommendation.
- The 3×3 coherence grid + both aesthetic samples + failure-mode count.
- Screen recordings (Desktop folder; reference filenames from the report).
- Your recommended recipe for all four decisions, each with a one-paragraph rationale.
- A draft GO/NO-GO with reasoning (GO = coherence grid passes + at least one cutout method meets the quality bar at acceptable cost).

**STOP. Luke + cofounder judge the kit.** Do not proceed past this point in the same session unless Luke explicitly returns verdicts.

## Phase 5 — After verdicts (only on Luke's word)

1. Update `docs/outfit-builder-spec.md`: replace every SPIKE-DECIDES marker with the locked recipe; record GO/NO-GO + date at the top.
2. Finalize the spike report with the verdicts.
3. Commit docs to main (report + spec update only — spike code stays on its branch, unmerged).
4. Recommend the v0 session prompt be cut next (Luke's call; the v0 scope is spec §8).

## Operating constraints (non-negotiable)

- Push only with Luke's explicit approval; local commits fine. Pushing main deploys LIVE to telastyle.app — which is why spike code lives on a branch and only docs merge.
- Doppler-injected env only (`doppler run --project tela --config dev -- <cmd>`); never `doppler secrets get` sensitive values; never echo service keys.
- Never `git add .` / `git add -A`; never `--no-verify`.
- Legacy repo `/Users/lukegorski/ale` is READ-ONLY reference.
- Next.js 16 + Turbopack: read `node_modules/next/dist/docs/` before Next-specific work (yes, even for a spike page).
- Real user data (Luke's + cofounder's wardrobe photos) stays in the dev environment + the local Desktop kit; nothing gets uploaded to third parties beyond the OpenAI image call already used in production enhancement.

## Definition of done

- [ ] Both cutout methods run against the same 10–15 real items incl. hard cases; sheet + table produced; spend ≤ $5 logged.
- [ ] 3×3 coherence grid produced with zero manual per-cell adjustment; failure modes counted.
- [ ] Both dress patterns + ≥2 selection candidates prototyped and recorded.
- [ ] Judging kit on Desktop + report committed; STOP gate honored.
- [ ] (Post-verdict) spec SPIKE-DECIDES markers replaced; GO/NO-GO recorded; v0 recommended or NO-GO rationale written.
