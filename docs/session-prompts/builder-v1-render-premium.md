# Session prompt — Builder v1: render on manual outfits + premium scaffolding

## Read first (in order)

1. `docs/outfit-builder-spec.md` (v3) — §2/§2a locked decisions, §3 "Save + render", §5 relevant rows (combo_hash, quota enforcement, plan/entitlements, outfit.generate gate), §6, §8 "v1", §8a rollout rules incl. the whitelist and the one blessed exception. Decisions are Luke's + cofounder's; do not relitigate.
2. The builder-v0 code it extends: the `/[lang]/builder` route, entitlements implementation, `outfit.createManual`, draft capabilities, cutout pipeline.
3. Memory-level environment facts: this is the FIRST builder session with a real dev environment (`tela/dev` → the `tela-dev` Supabase project since 2026-07-15). **Build and e2e-verify against dev FIRST; prod gets the dark ship only after dev is green.** Traps: root `pnpm db:migrate`/`prompts:sync` strip DATABASE_URL (use `pnpm --filter`); cold worktrees need `pnpm exec turbo build --filter='./packages/*'`; dev test account `luke@tela.test` (password with Luke); Google sign-in is prod-only.

## Mission (spec §8 v1 — nothing more)

1. **"See it on the model"** on manual outfits: fires the existing `tryon.generate`, async progress via the existing per-step polling. Caption "garments only for now" (renders cover top/bottom/outerwear; shoes excluded by pipeline design). **Card behavior, minimal v1 call:** the outfit DETAIL view shows the completed render prominently; the GRID card keeps the collage snapshot (visual consistency across the grid). Whether cards ever swap to renders is a design-review question — flag it, don't invent it.
2. **Combo-render cache**: `try_on_hash` inputs = sorted renderable itemIds + the RESOLVED model-image URL (not the settings enum — future custom models must invalidate by construction) + a `pipeline_version` salt constant (document the bump rule: any render-affecting pipeline/prompt change). **Cache eligibility is quality-conditioned:** a hit requires the source job's framing log to show all checks passed (no `recovered: false` kept-bad renders) — a known-bad source is a MISS and re-renders, restoring the reroll chance the cache would otherwise remove forever. On hit: **copy the cached image to the new outfit's storage path** — never share pointers (the outfit-deleted cleanup in `process.ts` deletes originals) — and record provenance via a `cached_from` column referencing the source job. Zero Fashn spend; `cache_hit: true` in events.
3. **Weekly render quota**: trailing-7-day count of the user's `try_on_jobs` rows checked at enqueue inside `tryon.generate` — counting pending/running/complete AND failed (failures count; prevents infinite-retry abuse) but **EXCLUDING cache-created rows** (`cached_from` set — free work must not consume quota). NOT via rate_limits (spec §5 records why). Bypass when `entitlements.renderQuotaPerWeek` is null (founder/premium). `getEntitlements` honors a `features.renderQuotaOverride` number — this IS the test seam (integration tests set it to 1) AND a per-user admin tuning knob during beta. **Accepted looseness (do not "fix"):** count-then-enqueue is unlocked — a double-tap can yield 8/7 at this scale; and there is no completion notification if the user backgrounds mid-render (the job finishes server-side; the outfit shows the render on return; push notifications are post-beta).
4. **Premium scaffolding**: `users.plan` (verify what v0 already shipped — extend the existing entitlements choke point, do NOT build a parallel mechanism); admin users page gains plan + features editors (§8a whitelist item b); `outfit.generate` requires `entitlements.aiStyling` with a typed `premium_required` error. **Fake-door surface in v1 = the BUILDER PAGE ONLY** (new surface): free users see the gate chip, founders see "Founder access — on us." The existing outfits page's "Style me" UI is NOT touched — its gate treatment ships with the IA-flip commit later (§8a; during beta everyone is founder, so the capability gate changes nothing user-visible there). `premium.gate_viewed`/`premium.gate_tapped` events, plus **`tryon.quota_denied`** on quota exhaustion (the second upsell signal).
4b. **Dress + outerwear honesty**: the builder can compose dress+jacket, but the pipeline's locked dress-wins rule renders the dress ONLY. When the composition includes dress+outerwear, the render button carries a one-line note that the jacket won't appear in this render yet (localized ×14). Extending the pipeline to layer outerwear over a dress render is explicitly OUT of v1 — file it as a followups entry instead.
5. **Quota UI**: "N of 7 left this week" on the render button for quota'd users; hidden for bypass. All new strings through the full 14-locale dictionary pass.

Explicitly OUT (do not build): Tier-1 sizing collection (separate future project, spec §3); accessory slots; step-cache optimization; any outfits-page IA change; payments.

## Phase 0 — Verify before building → report → STOP

1. **Entitlements shape as v0 actually shipped it**: does `users.plan` exist or only `features`? What is `getEntitlements`'s real signature/location? The truth-table test? Extend in place.
2. **Role-mismatch audit status**: spec §5 required the `role='shoes'` audit before v0 — confirm it ran (check followups/commits); if not, run the audit query and reconcile before touching render paths.
3. **Try-on surfaces today**: how AI outfits show renders (components, polling hooks) — reuse for manual outfits; confirm the null-occasion-tolerant surfaces (blessed exception `9fdf118`) render manual outfits correctly in detail view.
4. **Fashn cost/realities check**: renders from dev cost real Fashn cents (key is shared) — budget the e2e plan (~$1–2 total) and confirm the try-on worker path runs in the dev stack (v0's split report proved pg-boss enhancement on dev; confirm try-on too).
5. Report findings + implementation plan + STOP for Luke's go.

## Verification gates (dev first, then dark prod)

- Unit: entitlements truth table extended; quota window math (edge: exactly 7 in window; failed jobs count; window boundary); combo_hash determinism + salt bump behavior.
- Dev e2e: save manual outfit → render (real Fashn, ~12¢) → result displays; save a SECOND outfit with the identical combo → render is instant, zero Fashn spend, distinct storage object (copy verified), `cached_from` set; delete the first outfit → second outfit's render still loads (orphan-proof); verify a cache-created row does NOT count against quota.
- Cache quality-conditioning unit test: a source job whose framing log contains `recovered: false` must be treated as a MISS.
- Quota integration: with a plan='free' test user and `features.renderQuotaOverride: 1`, verify enforcement, the "N left" UI, the typed error path, and the `tryon.quota_denied` event; verify founder bypass.
- Dress+outerwear composition shows the jacket-not-in-render note; render completes with dress only, no error.
- Fake door: free user sees the gate + events fire; founder sees full function.
- Dark prod ship (Luke's push approval): flag-gated as ever; founders dogfood one real render on prod; `tryon.render_requested` events flowing with quota_remaining + cache_hit.
- Followups + spec §8 updated; report ends with what v1.1 should pick up.

## Operating constraints (non-negotiable)

- Push only with Luke's explicit approval; pushing main deploys LIVE. Local commits fine.
- Dev-first: all iteration against the dev project (`doppler run --project tela --config dev`); prod is for the final dark ship + dogfood only. NEVER point ad-hoc scripts at prd; `assert-not-prod.sh` guards apply.
- §8a whitelist governs existing-file edits: dictionaries (new keys), admin users page, plus this session's natural surfaces (tryon.generate capability, try_on_jobs migration — additive only). Anything beyond: STOP and ask Luke.
- In the Doppler dashboard, NEVER check "apply to Production/Staging" on dev saves.
- Never echo secrets; never `doppler secrets get` sensitive values; never `git add .`/`-A`; never `--no-verify`.
- Legacy `/Users/lukegorski/ale` is read-only.

## Definition of done

- [ ] Phase 0 report delivered; Luke's go received.
- [ ] All §Mission items live on dev, all verification gates green (incl. the orphan-proof cache test).
- [ ] Dark-shipped to prod with Luke's approval; founder dogfood render verified; events flowing.
- [ ] 14-locale strings complete; spec §8 v1 marked done; followups updated; v1.1 handoff notes written.
