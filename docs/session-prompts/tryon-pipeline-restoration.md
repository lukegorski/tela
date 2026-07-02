# Session prompt — Restore deferred try-on multi-model pipeline

## Context

The legacy app (`/Users/lukegorski/ale`) runs try-on as a multi-call Fashn pipeline that varies by outfit type. During the Tela rebuild, this was deliberately deferred to ship the async-job refactor — see the docstring at the top of `packages/capabilities/src/tryon/process.ts`:

> Pipelines (MVP cut, same as before the async refactor): - dress (one-pieces): single Fashn call - standard (top + bottom): two sequential Fashn calls (bottoms then top). Layered (with outerwear) is intentionally rejected — the multi-step orchestration for it lands in a later phase.

That "later phase" is now. This session restores the deferred steps so try-on quality matches the legacy app. **This is not fixing a regression — the cut was intentional.**

## Hard prerequisite (do not start until verified)

`man.jpg` in Supabase Storage must already be the correct file (Firebase Storage MD5 `06feb4d68b8876ccb5d61056c6ab156f`, 345,888 bytes). Verify with:

```bash
curl -sI "$(node -e "console.log(process.env.SUPABASE_URL)")/storage/v1/object/public/models/man.jpg" | grep -i etag
```

If etag does not match `06feb4d68b8876ccb5d61056c6ab156f`, **STOP** and surface to Luke — the man.jpg migration task is upstream of this work.

## Phase 0: Verify Fashn models still exist (kill switch)

Legacy pipeline uses three Fashn model names: `tryon-v1.6`, `tryon-max`, `edit`. The Fashn product may have changed since legacy was written. Before writing any code:

1. Pull `FASHN_API_KEY` from Doppler (do NOT echo to chat).
2. Make a minimal `POST https://api.fashn.ai/v1/run` call for each of the three model_names with a throwaway payload.
3. If any model returns 4xx-model-not-found, **STOP** and report to Luke — the pipeline shape needs redesign, not restoration.

If all three respond, proceed.

## Verified architectural facts (do not re-derive)

- **`TryOnStep` enum is garment-based, NOT pipeline-stage-based.** Values: `'bottoms' | 'top' | 'outerwear' | 'dress'`. Source: `packages/db/src/schema/stubs.ts:126`. The `asyncStep` column tracks *which garment is being applied next*, not which Fashn model is running.
- **`intermediateImageUrl` column already exists** on `try_on_jobs`. Docstring: "Most recent intermediate image URL produced by Fashn — kept around so the next step can layer on top of it. Becomes the final image when status flips to 'complete'."
- **pg-boss default `expireInSeconds` is 900s (15 min).** Plenty of headroom for 3 sequential Fashn calls (~30-60s each).
- **Pipeline shape in legacy is outfit-type-dependent** — read `/Users/lukegorski/ale/src/app/api/outfits/try-on/route.ts` (especially the per-category iteration) and `/Users/lukegorski/ale/src/app/api/outfits/try-on/advance/route.ts` before designing. Summary:
  - **Dress (one-pieces)**: single `tryon-v1.6` call.
  - **Standard (top + bottom)**: iterate per garment, `tryon-v1.6` each time, chaining `intermediateImageUrl`.
  - **Layered (with outerwear)**: legacy starts step 1 server-side then RETURNS — the client polls and calls `/api/outfits/try-on/advance` for remaining steps using `tryon-max` and `edit`.
- **`buildFitPrompt(analysis)` in `/Users/lukegorski/ale/src/lib/fashn.ts`** is simple — takes `WardrobeItemAnalysis` (length, fit, subcategory, sleeveLength) and builds a natural-language prompt. Straightforward port.
- **No retry logic exists today** in `packages/ai/src/providers/fashn.ts` — out of scope for this session; failure handling is a separate followup.

## Orchestration shape: server-side single-job with idempotent resume (decided)

Legacy splits layered try-on between server-side step 1 and client-orchestrated remaining steps via the `/advance` route. **That split exists because Vercel function timeouts (60s on Pro serverless, 300s on Fluid) cannot hold a 3×60-90s Fashn pipeline.** Tela runs on Railway with pg-boss workers (default 900s timeout). The Vercel constraint does not apply — do not carry the workaround forward.

**Decision:** one pg-boss job per try-on, running the full pipeline server-side. The worker writes `intermediateImageUrl` + `asyncStep` to the DB row after each Fashn step so the client can render per-step progress by polling `tryon.getStatus`.

### Why not the client-orchestrated split

- B has a real correctness bug A doesn't: if the user closes the app mid-pipeline, the job sits in `awaitingAdvance` forever unless we add a sweeper cron. A keeps running server-side regardless of client state.
- B leaks pipeline structure to the client (must know what step comes next, or coordinate via server).
- B's per-step-retry advantage is replicable in A with the idempotent-resume requirement below.
- Latency is strictly worse in B (poll interval + advance-mutation roundtrip per step).

### Idempotent-resume requirement (load-bearing)

At the top of `process.ts`'s `execute`, before kicking off any Fashn call, check whether the job already has progress:

- If `job.status === 'running'` AND `job.asyncStep` is set AND `job.intermediateImageUrl` is non-null → this is a resume after worker crash / pg-boss retry. Use `intermediateImageUrl` as `currentImageUrl`, and skip garments that have already been applied (infer from `asyncStep` — it names the *next* garment to apply).
- Otherwise → fresh start. Use `job.modelImageUrl` as `currentImageUrl`.

This is what makes A retry-safe and equivalent to B for per-step-retry without B's split-system complexity.

### Pre-implementation sanity check (5 min)

Before coding, verify `pollFashnUntilDone`'s poll interval in `packages/ai/src/providers/fashn.ts`. Math:

- Per-step worst case = `pollIntervalSeconds × maxIterations` (currently `maxIterations: 60` in `process.ts:159`).
- 3 steps × per-step worst case + Supabase upload + DB writes must be < pg-boss `expireInSeconds` (default 900s).
- If poll interval is 1s → 3×60 = 180s, plenty of headroom.
- If poll interval is 5s → 3×300 = 900s, no headroom. Either raise `expireInSeconds` at job-send time or lower `maxIterations`.

Report the actual math to Luke before merging.

## Implementation outline

1. Port `buildFitPrompt` from legacy (`/Users/lukegorski/ale/src/lib/fashn.ts`) into `packages/ai/src/providers/fashn.ts` or a new helper in `packages/capabilities/src/tryon/`.
2. Extend `packages/ai/src/providers/fashn.ts` `startTryOn` (or add `startTryOnAdvanced`) to accept `model_name` and pass through to Fashn.
3. Rework `packages/capabilities/src/tryon/process.ts`:
   - **Add idempotent-resume guard** (see above) before any Fashn call.
   - Branch on outfit type (dress | standard | layered).
   - Iterate per garment using sort order matching legacy (top, bottom, dress, outerwear, shoes — verify in legacy route.ts).
   - Before each step, set `asyncStep` to the garment about to be applied (matching enum: `'bottoms' | 'top' | 'outerwear' | 'dress'`).
   - After each successful step, write `intermediateImageUrl` to DB so a resume can pick up here.
   - On final step, flip `status` to `'complete'` and the final image URL becomes `resultStoragePath` (after Supabase mirroring). Clear `intermediateImageUrl` and `asyncStep` per the existing pattern.
4. Remove the "layered intentionally rejected" guard.
5. Update the docstring at the top of `process.ts` to reflect the restored pipeline AND the idempotent-resume contract.

## Verification gates

- Run the existing try-on test suite (if any) — locate via `grep -r "tryon\|try-on" packages/capabilities/tests/ packages/capabilities/src/**/*.test.ts`.
- **Manual end-to-end on a deployed preview**: create one outfit per type (dress, standard, layered), trigger try-on, confirm:
  - Each produces a coherent image (not a half-applied garment).
  - Image quality visually matches a legacy app try-on for the same outfit (Luke will need to spot-check).
- **Cost reality check**: log estimated cost per outfit type (1×$0.04 / 2×$0.04 / 3×$0.04+). Confirm with Luke whether to gate behind a daily spend cap before merge. Search for existing spend-cap infrastructure first: `grep -r "spendCap\|spend_cap\|dailyLimit" packages/`.

## Out of scope (do not touch)

- Fashn retry / failure-handling logic — separate followup.
- Try-on model selection UX (gender picker) — already working.
- Sentry capture of Fashn errors — separate observability followup.
- Any change to `tryOnSettings` schema.

## Definition of done

- [ ] Phase 0 verifies all three Fashn models respond.
- [ ] Pre-implementation sanity check on `pollFashnUntilDone` timing reported to Luke.
- [ ] Idempotent-resume guard at top of `process.ts` covers crash-mid-pipeline + pg-boss-retry cases.
- [ ] All three outfit types produce coherent end-to-end try-ons in preview.
- [ ] Cost-per-type logged or capped per Luke's call.
- [ ] `process.ts` docstring updated to reflect restored pipeline.
- [ ] `docs/post-cutover-followups.md` "Try-on quality + failure handling" entry — the quality portion marked `[DONE]`, failure handling left open.
- [ ] PR description includes legacy-vs-new screenshot comparison for at least one standard outfit.

## Operating constraints

- Push only with Luke's explicit approval; show changes for review first.
- Never `doppler secrets get` on `FASHN_API_KEY` or any other sensitive secret — use it via the Doppler-injected env in dev/preview.
- Never `git add .` or `git add -A` — stage specific files.
- Never `--no-verify` or skip pre-commit hooks.
- Atomic stage+commit+verify in one bash chain.
