# Session prompt — Try-on failure handling + retry

## Context

Try-on has zero retry today and silently loses failures from Sentry. The pipeline can fail mid-call (network blip, Fashn 5xx, content moderation rejection, rate limit, invalid input), and the current shape treats all failures identically — write `status='failed'` and stop.

This session fixes three gaps: **observability** (Sentry not capturing), **resilience** (no retry on transient errors with circuit breaker against outage amplification), **cost accounting** (Fashn calls that succeed before pipeline fails are unbilled).

## Hard prerequisite (do not start until verified)

**Pipeline restoration (`docs/session-prompts/tryon-pipeline-restoration.md`) must have shipped and the idempotent-resume guard must be in `process.ts`.** This is not optional — retry semantics depend on it. If a retry runs without the resume guard, it restarts from step 1, repays for completed steps, and is statistically just as likely to fail at the same step. Verify by reading the top of `packages/capabilities/src/tryon/process.ts`'s `execute` block and confirming it inspects `job.status === 'running'` + `job.asyncStep` + `job.intermediateImageUrl` to skip completed steps.

If the guard is missing, **STOP** and surface to Luke.

## Phase 0: Measure + verify before changing anything (gates the work)

### 0.1 Baseline failure rate

Query `try_on_jobs`:

```sql
SELECT status, COUNT(*) AS n
FROM try_on_jobs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY status;

-- And error shape distribution:
SELECT
  LEFT(error, 80) AS error_prefix,
  COUNT(*) AS n
FROM try_on_jobs
WHERE status = 'failed' AND created_at > NOW() - INTERVAL '30 days'
GROUP BY error_prefix
ORDER BY n DESC
LIMIT 20;
```

Report the breakdown to Luke. **If failure rate is <1% and Sentry alerting alone is enough, scope shrinks dramatically — stop after step 1 below and discuss with Luke before doing 2–4.** If failure rate is >5%, the work is urgent and fully justified.

### 0.2 Verify `tryon.generate` interface

Before inventing any new mutation:

```bash
grep -n "force\|regenerate" packages/capabilities/src/tryon/generate.ts
```

Confirm whether `force: true` already triggers a re-run of an existing job. If yes, the "retry button" is a UI-only change (call existing mutation). If not, decide whether to extend `tryon.generate` or add `tryon.regenerate`. **Do not assume — verify and report.**

### 0.3 Check whether `costCents` is user-facing

```bash
grep -rn "costCents" --include="*.ts" --include="*.tsx" apps/ packages/ | grep -v dist
```

If `costCents` from `try_on_jobs` is read by any user-billing path (spend cap UI, "X of Y free try-ons", etc.), changing it to include failures will incorrectly charge users for failed work. **If user-facing, split into `internalCostCents` (ops dashboard) and `userBillableCostCents` (success only) before proceeding with step 4 below.**

### 0.4 Reachability test (no API spend)

Confirm `apps/api/src/worker.ts` is the active try-on worker (not `apps/workers/src/`) and that `handleTryOnJob` is still registered there. If a parallel session has moved it, the prompt's catch-block references need re-anchoring.

## Verified current state (do not re-derive)

> **Line-number caveat:** all line references below were verified 2026-05-26, BEFORE the pipeline-restoration session rewrote `process.ts`. Re-locate every reference by code pattern, not line number. The swallow-and-return catch behavior should survive restoration (retry logic is explicitly out of restoration's scope), but confirm it did before building on that assumption.

> **2026-07-02 learnings (framing-validation work, commit `358df60`) — read before designing:**
> - **Fashn is deterministic per serving window**: `tryon-max` and `edit` default to a FIXED seed (42). Identical inputs reproduce bitwise-identical outputs within a window, but results drift ACROSS windows (their infra). Consequence for THIS session: any retry of a Fashn call intended to get a different outcome MUST pass an explicit random seed — a plain re-run reproduces the failure. `startTryOnMax`/`startEdit` already accept `seed?`; `startTryOn` (v1.6) does not yet.
> - **Quality-failure retry already exists for framing**: `process.ts` now has a `runStep(seed?)` closure per step + a vision framing check (`framingCheck.ts`) with one reseeded retry. Slot transient/permanent ERROR classification into the same `runStep` structure — do not build a parallel mechanism.
> - **Spend-cap infra partially exists**: the `rate_limits` table (packages/ai/src/rateLimits.ts) enforces dailyMaxCents/dailyMaxCalls/perCallMaxCents per user/capability for AI-GATEWAY calls (framing checks are covered). Fashn calls bypass it (direct fetch, cost logged post-hoc to generations under operation `tryon.generate`). If this session adds Fashn spend protection, extend that table/mechanism — do not invent a new one.
> - **Fashn error-shape probing (Step 3) partial freebie**: Phase 0 of the restoration session observed that invalid inputs return HTTP 400 with field-level validation messages (rejected pre-billing). Content-moderation and poll-failure shapes remain unprobed.

### Sentry gap (root cause)

`packages/capabilities/src/tryon/process.ts:248-273` catches all exceptions, writes `status='failed'` to the DB row, and **RETURNS** a result object with `status: 'failed'`. It does NOT re-throw.

Consequence: `apps/api/src/worker.ts:72-90` `handleTryOnJob`'s catch block (which has `Sentry.captureException` with `tag: 'job: tryon.process'`, user, and extras) **is never reached** for in-pipeline failures. Only pre-try-block exceptions ever hit it.

**Result: try-on failures are invisible in Sentry today.** The DB row records them and the user sees "failed" in the UI, but ops has no alerting signal.

### No retry today

- `apps/api/src/worker.ts:107-111` registers `queue.work(JOB_NAMES.PROCESS_TRY_ON, { batchSize: 1, pollingIntervalSeconds: 3 }, handleTryOnJob)` — no `retryLimit`, `retryDelay`, or `retryBackoff` specified.
- `packages/queue/src/index.ts:32-33` creates queues via `boss.createQueue(JOB_NAMES.PROCESS_TRY_ON)` — no policy at queue creation either.
- pg-boss v11 default is `retryLimit: 0`.
- Even if retries were configured, the worker function returns success (not throws), so pg-boss wouldn't trigger them.

### Cost accounting gap

`process.ts:267-272` returns `costCents: 0` on failure. But each Fashn call we made before failing **was billed by Fashn** ($0.04 each). For a standard outfit that fails on the second call, we paid $0.08 but record $0. Internal cost dashboards understate true spend on failures.

### Error classes (verified from code)

`packages/ai/src/providers/fashn.ts`:
- `startTryOn` throws `Error: Fashn /run failed (${status}): ${body}` on non-2xx HTTP. The status code is in the message string.
- `pollFashnUntilDone` returns `{ status, output, error }` where `status` can be `'completed'`, `'failed'`, or other terminal states.
- `process.ts:160-164` converts poll-failures to a synthetic Error: `Fashn step '${category}' returned status '${result.status}'${result.error ? \`: \${result.error}\` : ''}`.

**So failure information arrives at the catch block as plain `Error` objects with status code / Fashn status string baked into the message.** A classifier that string-matches on this is fragile — see Implementation step 2 for the better shape.

## Scope of this session

Four ordered changes. **Do not reorder — earlier steps preserve safe defaults that later steps relax.**

### Step 1: Wire Sentry capture WITHOUT enabling retries (safe-by-default)

Two changes that ship together as one PR:

**(a) Re-throw in `process.ts` catch block** so `apps/api/src/worker.ts`'s existing Sentry capture sees the error. Move the DB-write of `status='failed'` to happen first, then re-throw the original error.

**(b) Pin `retryLimit: 0` explicitly** at the `tryon.generate` enqueue site (where the job is sent to pg-boss). This makes the new re-throw behaviorally identical to the old swallow — pg-boss sees a failure but doesn't retry, so total Fashn cost per failure is unchanged.

Result: Sentry now captures every try-on failure. Zero change to user-visible behavior or cost. This is the smallest unit that delivers value and is safe to ship without the rest.

**Gate before proceeding to step 2:** confirm Sentry events arrive for an intentionally-failed try-on in preview. If yes, this PR can merge to main as standalone observability win.

### Step 2: Typed failure classifier (no behavior change)

Add `FashnFailure` type + `classifyFashnFailure` function to `packages/ai/src/providers/fashn.ts`.

Goal: structured failure info at the source, not regex-from-message at the catch site.

```ts
// packages/ai/src/providers/fashn.ts
export type FashnFailure =
  | { kind: 'http'; status: number; body: string }
  | { kind: 'poll'; fashnStatus: string; fashnError: string | null }
  | { kind: 'network'; cause: unknown };

export class FashnError extends Error {
  constructor(public failure: FashnFailure, message: string) {
    super(message);
  }
}
```

Change `startTryOn` to throw `FashnError({ kind: 'http' | 'network', ... })` instead of plain `Error`.

Change `process.ts:160-164` to throw `FashnError({ kind: 'poll', ... })` instead of synthesizing a string.

Then:

```ts
export function classifyFashnFailure(failure: FashnFailure): 'transient' | 'permanent' {
  if (failure.kind === 'network') return 'transient';
  if (failure.kind === 'http') {
    if (failure.status === 429 || failure.status === 408) return 'transient';
    if (failure.status >= 500) return 'transient';
    return 'permanent'; // 4xx
  }
  // kind === 'poll' — Fashn finished and told us why it failed
  // Permanent: content moderation, validation. Transient: timeout, internal-error.
  // SHAPE TBD — see Step 3 probing.
  return 'permanent'; // conservative default until probing populates this
}
```

Unit tests cover each branch with fixture failures.

**This step does not change runtime behavior** — nothing reads `classifyFashnFailure` yet. It's a pure refactor + new helper. Ships independently.

### Step 3: Probe Fashn for real error shapes (bounded API spend)

Goal: populate the `kind: 'poll'` branch of `classifyFashnFailure` with verified Fashn error-string patterns so it makes correct transient/permanent decisions.

**Spend budget: max $0.30 (≈ 8 calls). Log each call. If you blow the budget, STOP.**

Probes by error class:

| Error class | How to trigger | API spend? | Notes |
|---|---|---|---|
| Network error | `fetch` to `https://nonexistent.invalid` | Free | Unit-testable with mock |
| HTTP 401 | Mangle `Authorization` header | Free (rejected pre-bill) | |
| HTTP 422 / validation | Submit `model_image` as plain string `"not a url"` | Likely free | Verify Fashn rejects pre-bill |
| HTTP 5xx | Cannot reliably trigger | — | Document as inferred from any seen-in-prod 5xx logs |
| HTTP 429 | Hammer endpoint until rate-limited | Could spend | **Skip — too costly to trigger deliberately, classify based on docs** |
| Poll-failure: content moderation | Submit a known-flagged image (e.g., a NSFW search result — DO NOT commit the image, use a URL) | **Billed** | 1 call |
| Poll-failure: bad garment | Submit a garment-shaped photo of a non-clothing object | **Billed** | 1 call |
| Poll-failure: timeout | Cannot trigger | — | Document expected shape |

After probing, document the actual Fashn error-message patterns in a code comment on `classifyFashnFailure`. Update the `kind: 'poll'` branch to pattern-match against real strings.

### Step 4: Enable retry + cost accounting + circuit breaker

This is the largest step. Three sub-changes that should ship together:

**(a) Conditional retry in worker catch.**

Update `process.ts` catch block:

```ts
} catch (err) {
  const partialCostCents = costCents; // running total at time of failure
  const message = err instanceof Error ? err.message : String(err);
  const failure = err instanceof FashnError ? err.failure : null;
  const classification = failure ? classifyFashnFailure(failure) : 'permanent';

  await db.update(tryOnJobs).set({
    status: 'failed' as TryOnStatus,
    error: message,
    costCents: partialCostCents, // see step 4(b)
    // ...
  }).where(eq(tryOnJobs.id, jobId));

  await logEvent({ /* unchanged */ });

  if (classification === 'transient') {
    throw err; // let pg-boss retry per policy
  }
  // permanent: return success-shape, no retry
  return { jobId, status: 'failed' as const, resultStoragePath: null, costCents: partialCostCents };
}
```

Update `tryon.generate` enqueue site:

```ts
await boss.send(JOB_NAMES.PROCESS_TRY_ON, { jobId, userId, outfitId }, {
  retryLimit: 2,        // 3 total attempts
  retryDelay: 30,       // seconds
  retryBackoff: true,   // exponential: 30s, 60s, 120s
  expireInSeconds: 600, // 10 min per attempt — faster re-queue on worker death than default 900s
});
```

**(b) Cost accounting fix — but split if user-facing.**

If Phase 0.3 found `costCents` is user-facing, add an `internalCostCents` column (migration) and write partial spend there. Leave user-facing `costCents` as 0 on failure. If not user-facing, just update `costCents` to partial total. Also insert a `generations` row with `parsedOutput: { failed: true, lastStep: <stepName>, classification }` so cost dashboards reflect failed spend.

**(c) Circuit breaker against outage amplification.**

Without this, a Fashn outage = 50 users × 3 retry attempts × $0.04 = $6+ in waste plus user-visible 5-minute wait-to-fail. Implementation:

```ts
// packages/ai/src/providers/fashn.ts
// In-memory sliding window — process-local is fine; pg-boss workers are
// typically 1-2 instances, and per-instance breaker is conservative.
let recent5xxTimestamps: number[] = [];
let breakerOpenUntil = 0;
const BREAKER_WINDOW_MS = 60_000;
const BREAKER_TRIP_THRESHOLD = 5;
const BREAKER_OPEN_MS = 120_000;

export function shouldFailFast(): boolean {
  return Date.now() < breakerOpenUntil;
}

export function record5xx(): void {
  const now = Date.now();
  recent5xxTimestamps = recent5xxTimestamps.filter((t) => now - t < BREAKER_WINDOW_MS);
  recent5xxTimestamps.push(now);
  if (recent5xxTimestamps.length >= BREAKER_TRIP_THRESHOLD) {
    breakerOpenUntil = now + BREAKER_OPEN_MS;
    // Sentry breadcrumb so we know the breaker tripped
  }
}
```

`startTryOn` calls `shouldFailFast()` at top → throws fail-fast `FashnError({ kind: 'http', status: 503, body: 'breaker open' })` which classifier maps to transient (still retries on next attempt after delay, but we don't pile on a downed service).

**Trade-off acknowledged:** in-memory state means a worker restart resets the breaker. For 1-2 worker instances this is fine. If we ever scale to many workers, move to Redis or a DB-backed counter — note in the comment.

## UX decisions to surface to Luke (do not pick — ask)

### A. Retry visibility

With retries enabled, worst case is `3 attempts × 90s + 30s + 60s backoff = ~360s = 6 minutes` before user sees "failed". Should the UI surface attempt count and "retrying..." state, or keep retries invisible?

- **Invisible**: simpler client, but a 6-min loading spinner with no feedback looks broken.
- **Visible**: adds `status='retrying'` + `attemptNumber` to `try_on_jobs`, surfaces in `tryon.getStatus` response, UI shows "Retrying (2 of 3)...".

Recommend "visible" for transparency, but defer to Luke.

### B. Manual retry button on failed try-ons

For permanent failures (bad garment), retry is pointless. For transient failures (Fashn outage, exhausted auto-retries), manual retry might succeed. Either:

- **A1**: always show retry button regardless of class
- **A2**: only show on transient class (requires `failureClass` column)

Recommend A1 unless analytics data is wanted.

### C. Worker restart / deploy mid-pipeline

If Railway redeploys while a try-on is mid-Fashn-call, pg-boss re-queues only after `expireInSeconds` elapses (we're setting 600s = 10 min). User sees a 10-min "stuck" state. The pipeline-restoration's idempotent-resume guard means it resumes from last completed step, but the wait is invisible.

Options to discuss:
- Accept the 10-min wait (rare event, simple).
- Add a "we're working on it" UI based on `created_at` age (cosmetic only — actual resume still takes 10 min).
- Reduce `expireInSeconds` further (risk: a slow Fashn step gets killed).

Surface trade-offs, do not pick.

## Verification gates

- **Phase 0 baseline** report delivered to Luke before any code changes.
- **Step 1 isolation**: PR with re-throw + `retryLimit: 0` ships, Sentry shows captured events for a forced failure, NO change to user-visible cost or behavior.
- **Step 2 isolation**: classifier PR ships green with unit tests, NO runtime behavior change.
- **Step 3**: probing log shows actual spend ≤ $0.30, comment in code documents Fashn error patterns.
- **Step 4 verification**:
  - Trigger 503 in test (mock `startTryOn` or use breaker open) → pg-boss retries, second attempt succeeds, single try-on row goes `pending → running → complete`.
  - Trigger permanent failure (bad image URL) → pg-boss does NOT retry, single attempt, `status='failed'`.
  - Trigger breaker: 5 fast 5xx → 6th call fails fast in <100ms (not waiting for Fashn timeout).
  - Cost dashboard query: failed jobs show partial `costCents` matching successful-step count.
  - User-facing billing (if applicable per 0.3): NOT charged for failed work.

## Out of scope

- Pipeline restoration (separate session — hard prereq above).
- Per-user spend caps (separate followup).
- Replacing pg-boss with a different queue.
- Distributed circuit breaker (in-memory is fine for current scale; documented upgrade path).
- Fashn API key rotation.

## Definition of done

- [ ] Phase 0.1 baseline failure rate reported to Luke.
- [ ] Phase 0.2 `tryon.generate` interface verified — `force` behavior documented.
- [ ] Phase 0.3 `costCents` user-facing check done — split if needed.
- [ ] Phase 0.4 worker location confirmed.
- [ ] Step 1 PR merged: Sentry capture works, behavior unchanged, `retryLimit: 0` pinned.
- [ ] Step 2 PR merged: `FashnError` + `classifyFashnFailure` exist with unit tests, no runtime behavior change.
- [ ] Step 3 probe complete: comment in code documents Fashn poll-failure patterns, total API spend ≤ $0.30 and logged.
- [ ] Step 4 PR merged: retry policy enabled, circuit breaker live, partial costs recorded, UX decisions (A/B/C above) resolved with Luke before merge.
- [ ] Manual transient + permanent + breaker tests all pass in preview.
- [ ] `docs/post-cutover-followups.md` "Try-on quality + failure handling" — failure-handling portion marked `[DONE]`.
- [ ] PR description for Step 4 includes a Sentry event link + Fashn cost reconciliation showing failure costs now tracked.

## Operating constraints

- Push only with Luke's explicit approval; show changes for review first.
- Never `doppler secrets get` on `FASHN_API_KEY` or any sensitive secret — use Doppler-injected env (`doppler run -- <cmd>`).
- Never echo Supabase service-role or secret keys to chat.
- Step 3 probing: log each Fashn call, hard stop at $0.30. If a single call costs more than expected, STOP and tell Luke before continuing.
- Never `git add .` or `git add -A` — stage specific files.
- Never `--no-verify` or skip pre-commit hooks. If a hook fails, fix root cause.
- Atomic stage+commit+verify in one bash chain.
- Each step (1, 2, 3, 4) is its own PR — do not bundle. Ship in order.
