import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import {
  getDb,
  outfits,
  outfitItems,
  closetItems,
  itemPhotos,
  tryOnJobs,
  generations,
  type TryOnStatus,
  type TryOnStep,
} from '@tela/db';
import {
  startTryOn,
  startTryOnMax,
  startFashnEdit,
  pollFashnUntilDone,
  extractFashnOutputUrl,
} from '@tela/ai';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import {
  getSupabaseAdmin,
  ITEM_PHOTOS_BUCKET,
  TRY_ON_BUCKET,
} from '../storage/supabase.js';
import { buildFitPrompt } from './fitPrompt.js';
import { checkFraming } from './framingCheck.js';
import { planPipeline, sliceForResume } from './pipeline.js';

const input = z.object({
  jobId: z.string().uuid(),
  outfitId: z.string().uuid(),
});

const output = z.object({
  jobId: z.string().uuid(),
  status: z.enum(['complete', 'failed']),
  resultStoragePath: z.string().nullable(),
  costCents: z.number(),
});

/**
 * Conservative per-Fashn-call cost in cents. Fashn charges ~$0.04/call for
 * tryon-v1.6; tryon-max and edit list in the same order of magnitude.
 */
const FASHN_COST_CENTS_PER_CALL = 4;

/**
 * Ported verbatim from legacy advance/route.ts — tuned so the edit model
 * layers the jacket without repainting the garments underneath.
 */
const OUTERWEAR_PROMPT =
  "Add this open jacket over the model's current outfit. Keep the shirt underneath fully visible through the jacket opening. Do not change or remove the existing shirt or pants.";

/**
 * Poll ceilings per model (iterations × 2s interval). tryon-v1.6 usually
 * finishes in 20–40s; tryon-max and edit are slower — legacy polled those
 * for up to 180s, so we allow the same.
 */
const POLL_MAX_ITERATIONS = { 'tryon-v1.6': 60, 'tryon-max': 90, edit: 90 } as const;

/**
 * Run the Fashn try-on pipeline for an already-inserted try_on_jobs row.
 *
 * Long-running (30s–8min depending on pipeline). Invoked by the apps/api
 * pg-boss worker, never directly from the user-facing tRPC mutation —
 * the user-facing `tryon.generate` enqueues this and returns immediately
 * with the jobId so the client can poll `tryon.getStatus`.
 *
 * Status machine:
 *   pending → running → complete | failed
 *
 * Pipelines (restored to legacy parity — outfit-type-dependent):
 *   - dress (one-pieces): single tryon-v1.6 call. Dress wins over other
 *     pieces: a dress + outerwear outfit renders the dress only, exactly
 *     like legacy.
 *   - standard (top + bottom, no outerwear): sequential tryon-v1.6 calls,
 *     bottoms then top.
 *   - layered (outerwear present): bottoms via tryon-v1.6, top via
 *     tryon-max (with a buildFitPrompt guidance prompt), then outerwear
 *     layered on via the edit model. Runs fully server-side inside this
 *     one job — legacy's client-orchestrated /advance split was a Vercel
 *     function-timeout workaround that doesn't apply on Railway/pg-boss
 *     (900s job expiration vs ~480s worst-case poll ceiling).
 *
 * Idempotent-resume contract (what makes pg-boss retries safe):
 *   Before each Fashn call the worker writes async_step — the garment
 *   about to be applied. After each completed step it writes
 *   intermediate_image_url (+ accumulated cost_cents). If the worker
 *   crashes or the job expires, the pg-boss retry finds status='running'
 *   with async_step + intermediate_image_url set and resumes at async_step
 *   on top of intermediate_image_url instead of re-running (and re-paying
 *   for) completed steps. The in-flight step is re-run, so at most one
 *   Fashn call is duplicated. If the outfit's items changed between
 *   attempts, the plan is recomputed and the job restarts from the model
 *   image.
 *
 * Framing validation (see framingCheck.ts): outputs of the prompt-guided
 * models (tryon-max, edit) are checked with a cheap vision call — Fashn
 * occasionally zooms the composition in and loses the lower body, and its
 * fixed default seed makes the bad frame reproduce on plain retry. A
 * flagged step is re-run once with a random seed and the passing output
 * wins. Worst case this adds one extra poll ceiling per flagged step
 * (~180s each — still inside the 900s pg-boss expiration even if both
 * prompt-guided steps retry).
 */
export const processTryOn = registerCapability({
  name: 'tryon.process',
  description:
    'Execute the Fashn try-on pipeline for an already-queued job. Worker-only — the user-facing tryon.generate enqueues this and returns immediately. Long-running (30s–8min depending on pipeline).',
  input,
  output,

  async execute({ jobId, outfitId }) {
    const { userId, source } = getRequestContext();
    const db = getDb();

    // Load the queued job + verify it's still pending (race guard).
    const job = await db.query.tryOnJobs.findFirst({
      where: and(eq(tryOnJobs.id, jobId), eq(tryOnJobs.userId, userId)),
    });
    if (!job) throw new Error(`Try-on job ${jobId} not found`);
    if (job.status === 'complete' || job.status === 'failed') {
      // Already processed — idempotent skip.
      return {
        jobId: job.id,
        status: job.status,
        resultStoragePath: job.resultStoragePath,
        costCents: job.costCents,
      };
    }

    // Crash/retry detection: status 'running' with a step cursor and an
    // intermediate image means a previous attempt died mid-pipeline (worker
    // crash or pg-boss expiration). Resume from where it left off.
    const resume =
      job.status === 'running' && job.asyncStep && job.intermediateImageUrl
        ? { step: job.asyncStep, imageUrl: job.intermediateImageUrl, costCents: job.costCents }
        : null;

    await db
      .update(tryOnJobs)
      .set({ status: 'running' as TryOnStatus, updatedAt: new Date() })
      .where(eq(tryOnJobs.id, jobId));

    await logEvent({
      userId,
      type: 'tryon.started',
      source,
      payload: { jobId, outfitId, ...(resume ? { resumedAtStep: resume.step } : {}) },
    });

    let costCents = 0;
    const framingLog: Array<{
      step: TryOnStep;
      /** null = validator unavailable (fail-open accept). */
      feetVisible: boolean | null;
      retried: boolean;
      recovered?: boolean;
    }> = [];
    try {
      // Load outfit items + photos.
      const items = await db
        .select({
          itemId: closetItems.id,
          category: closetItems.category,
          subcategory: closetItems.subcategory,
          fit: closetItems.fit,
          length: closetItems.length,
          sleeveLength: closetItems.sleeveLength,
          role: outfitItems.role,
          photoStoragePath: itemPhotos.storagePath,
          enhancedStoragePath: itemPhotos.enhancedStoragePath,
        })
        .from(outfitItems)
        .innerJoin(closetItems, eq(outfitItems.closetItemId, closetItems.id))
        .innerJoin(itemPhotos, eq(closetItems.photoId, itemPhotos.id))
        .where(eq(outfitItems.outfitId, outfitId));

      if (items.length === 0) throw new Error('Outfit has no items');

      const { pipeline, steps: plannedSteps } = planPipeline({
        dress: items.find((i) => i.category === 'dress'),
        top: items.find((i) => i.category === 'top'),
        bottom: items.find((i) => i.category === 'bottom'),
        outerwear: items.find((i) => i.category === 'outerwear'),
      });
      if (plannedSteps.length === 0) throw new Error('Outfit has no try-on-able pieces');

      // The model image was chosen at enqueue time and stored on the job.
      let currentImageUrl = job.modelImageUrl;
      let steps = plannedSteps;
      if (resume) {
        const remaining = sliceForResume(plannedSteps, resume.step);
        if (remaining) {
          steps = remaining;
          currentImageUrl = resume.imageUrl;
          costCents = resume.costCents;
        }
        // else: the outfit's items changed since the crashed attempt — the
        // stale intermediate image is discarded and the new plan runs in
        // full from the model image.
      }

      const supabase = getSupabaseAdmin();
      const ttlSeconds = 3600;

      async function signGarment(item: (typeof items)[number]): Promise<string> {
        const path = item.enhancedStoragePath ?? item.photoStoragePath;
        const { data, error } = await supabase.storage
          .from(ITEM_PHOTOS_BUCKET)
          .createSignedUrl(path, ttlSeconds);
        if (error || !data) {
          throw new Error(
            `Failed to sign garment URL for item ${item.itemId}: ${error?.message}`,
          );
        }
        return data.signedUrl;
      }

      for (const planned of steps) {
        // Advance the resume cursor BEFORE the Fashn call: a crash anywhere
        // in this iteration resumes at this step, on top of the last
        // completed step's intermediate image.
        await db
          .update(tryOnJobs)
          .set({ asyncStep: planned.step, asyncJobId: null, updatedAt: new Date() })
          .where(eq(tryOnJobs.id, jobId));

        const garmentUrl = await signGarment(planned.item);

        // Start + poll one Fashn call for this step. Extracted so the
        // framing retry below can re-run the identical step with an explicit
        // seed — Fashn defaults to a FIXED seed, so a plain re-run
        // reproduces a bad frame bit-for-bit.
        const runStep = async (seed?: number): Promise<string> => {
          let predictionId: string;
          switch (planned.model) {
            case 'tryon-v1.6':
              predictionId = await startTryOn({
                modelImageUrl: currentImageUrl,
                garmentImageUrl: garmentUrl,
                category: planned.category,
              });
              break;
            case 'tryon-max':
              predictionId = await startTryOnMax({
                modelImageUrl: currentImageUrl,
                productImageUrl: garmentUrl,
                prompt: buildFitPrompt(planned.item),
                seed,
              });
              break;
            case 'edit':
              predictionId = await startFashnEdit({
                imageUrl: currentImageUrl,
                prompt: OUTERWEAR_PROMPT,
                contextImageUrl: garmentUrl,
                seed,
              });
              break;
          }

          await db
            .update(tryOnJobs)
            .set({ asyncJobId: predictionId, updatedAt: new Date() })
            .where(eq(tryOnJobs.id, jobId));

          const result = await pollFashnUntilDone(predictionId, {
            maxIterations: POLL_MAX_ITERATIONS[planned.model],
          });
          if (result.status !== 'completed') {
            throw new Error(
              `Fashn ${planned.model} step '${planned.step}' returned status '${result.status}'${
                result.error ? `: ${result.error}` : ''
              }`,
            );
          }
          const url = extractFashnOutputUrl(result.output);
          if (!url) {
            throw new Error(
              `Fashn ${planned.model} step '${planned.step}' completed without an output URL`,
            );
          }
          return url;
        };

        let stepUrl = await runStep();
        costCents += FASHN_COST_CENTS_PER_CALL;

        // Framing validation — prompt-guided models only (tryon-v1.6
        // preserves the input frame; max/edit occasionally zoom in and lose
        // the lower body). On a bad frame, retry the step ONCE with a random
        // seed and keep the passing output. Fail-open: a null check result
        // (validator unavailable) accepts the image as-is.
        if (planned.model !== 'tryon-v1.6') {
          const first = await checkFraming({ userId, imageUrl: stepUrl });
          if (first && !first.feetVisible) {
            await logEvent({
              userId,
              type: 'tryon.framing_retry',
              source,
              payload: {
                jobId,
                outfitId,
                step: planned.step,
                lowestVisiblePart: first.lowestVisiblePart,
              },
            });
            try {
              const retryUrl = await runStep(randomInt(1, 2 ** 31));
              costCents += FASHN_COST_CENTS_PER_CALL;
              const second = await checkFraming({ userId, imageUrl: retryUrl });
              // If the re-check is unavailable, prefer the retry: the
              // original is a KNOWN bad frame, the retry is merely unknown.
              const recovered = second ? second.feetVisible : true;
              if (recovered) stepUrl = retryUrl;
              framingLog.push({ step: planned.step, feetVisible: false, retried: true, recovered });
            } catch {
              // Retry failed at the Fashn level — keep the original (cropped
              // but complete) render rather than failing the whole job.
              framingLog.push({
                step: planned.step,
                feetVisible: false,
                retried: true,
                recovered: false,
              });
            }
          } else {
            framingLog.push({
              step: planned.step,
              feetVisible: first ? first.feetVisible : null,
              retried: false,
            });
          }
        }

        currentImageUrl = stepUrl;

        // Persist progress so a retried attempt resumes past this step
        // instead of re-paying for it.
        await db
          .update(tryOnJobs)
          .set({
            intermediateImageUrl: currentImageUrl,
            asyncJobId: null,
            costCents,
            updatedAt: new Date(),
          })
          .where(eq(tryOnJobs.id, jobId));
      }

      // Mirror the final image to Supabase Storage so we own a stable URL
      // (Fashn output URLs expire).
      const imageRes = await fetch(currentImageUrl);
      if (!imageRes.ok) {
        throw new Error(`Failed to fetch final Fashn image (${imageRes.status})`);
      }
      const buffer = Buffer.from(await imageRes.arrayBuffer());
      const storagePath = `${userId}/${outfitId}/${jobId}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from(TRY_ON_BUCKET)
        .upload(storagePath, buffer, {
          contentType: 'image/jpeg',
          cacheControl: '31536000',
          upsert: true,
        });
      if (uploadErr) throw new Error(`Failed to upload try-on result: ${uploadErr.message}`);

      await db
        .update(tryOnJobs)
        .set({
          status: 'complete' as TryOnStatus,
          resultStoragePath: storagePath,
          intermediateImageUrl: null,
          asyncJobId: null,
          asyncStep: null,
          costCents,
          updatedAt: new Date(),
          completedAt: new Date(),
        })
        .where(eq(tryOnJobs.id, jobId));

      // Record a generation row for the cost dashboard. Fashn isn't
      // prompt-driven, so we use a synthetic prompt version id.
      await db.insert(generations).values({
        userId,
        operation: 'tryon.generate',
        promptName: 'tryon.fashn',
        promptVersionId: '00000000-0000-0000-0000-000000000000',
        model: `fashn:${[...new Set(plannedSteps.map((s) => s.model))].join('+')}`,
        inputSnapshot: {
          outfitId,
          pipeline,
          jobId,
          steps: plannedSteps.map((s) => s.step),
          resumedAtStep: resume?.step ?? null,
        },
        rawOutput: storagePath,
        parsedOutput: { storagePath, framing: framingLog },
        latencyMs: 0,
        costCents,
      });

      await logEvent({
        userId,
        type: 'tryon.completed',
        source,
        payload: {
          jobId,
          outfitId,
          costCents,
          pipeline,
          framingRetries: framingLog.filter((f) => f.retried).length,
        },
      });

      // Cross-check that the outfit row still exists (could have been deleted
      // mid-pipeline). If gone, our just-inserted result is orphaned — clean up.
      const outfitStillExists = await db.query.outfits.findFirst({
        where: and(eq(outfits.id, outfitId), eq(outfits.userId, userId)),
      });
      if (!outfitStillExists) {
        await supabase.storage.from(TRY_ON_BUCKET).remove([storagePath]);
      }

      return {
        jobId,
        status: 'complete' as const,
        resultStoragePath: storagePath,
        costCents,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(tryOnJobs)
        .set({
          status: 'failed' as TryOnStatus,
          error: message,
          updatedAt: new Date(),
          completedAt: new Date(),
        })
        .where(eq(tryOnJobs.id, jobId));

      await logEvent({
        userId,
        type: 'tryon.failed',
        source,
        payload: { jobId, outfitId, error: message },
      });

      // Row state is settled (status='failed' written above, partial
      // costCents already persisted by the per-step writes), so the job is
      // terminal before the throw and a duplicate delivery no-ops via the
      // early idempotent skip. Re-throwing is what surfaces the failure to
      // the worker's catch — Sentry capture + pg-boss failure marking.
      // Retries stay off via retryLimit: 0 pinned at the enqueue site.
      throw err;
    }
  },
});
