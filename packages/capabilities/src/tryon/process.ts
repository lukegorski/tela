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
} from '@tela/db';
import {
  startTryOn,
  pollFashnUntilDone,
  extractFashnOutputUrl,
  type FashnCategory,
} from '@tela/ai';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import {
  getSupabaseAdmin,
  ITEM_PHOTOS_BUCKET,
  TRY_ON_BUCKET,
} from '../storage/supabase.js';

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

/** Conservative per-Fashn-call cost in cents. Fashn charges ~$0.04/call. */
const FASHN_COST_CENTS_PER_CALL = 4;

/**
 * Run the Fashn try-on pipeline for an already-inserted try_on_jobs row.
 *
 * Long-running (30–90s for standard pipeline). Invoked by the apps/api
 * pg-boss worker, never directly from the user-facing tRPC mutation —
 * the user-facing `tryon.generate` enqueues this and returns immediately
 * with the jobId so the client can poll `tryon.getStatus`.
 *
 * Status machine:
 *   pending → running → complete | failed
 *
 * Pipelines (MVP cut, same as before the async refactor):
 *   - dress (one-pieces): single Fashn call
 *   - standard (top + bottom): two sequential Fashn calls (bottoms then top)
 *
 * Layered (with outerwear) is intentionally rejected — the multi-step
 * orchestration for it lands in a later phase.
 */
export const processTryOn = registerCapability({
  name: 'tryon.process',
  description:
    'Execute the Fashn try-on pipeline for an already-queued job. Worker-only — the user-facing tryon.generate enqueues this and returns immediately. Long-running (30–90s).',
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

    await db
      .update(tryOnJobs)
      .set({ status: 'running' as TryOnStatus, updatedAt: new Date() })
      .where(eq(tryOnJobs.id, jobId));

    await logEvent({
      userId,
      type: 'tryon.started',
      source,
      payload: { jobId, outfitId },
    });

    try {
      // Load outfit items + photos.
      const items = await db
        .select({
          itemId: closetItems.id,
          category: closetItems.category,
          subcategory: closetItems.subcategory,
          role: outfitItems.role,
          photoStoragePath: itemPhotos.storagePath,
          enhancedStoragePath: itemPhotos.enhancedStoragePath,
        })
        .from(outfitItems)
        .innerJoin(closetItems, eq(outfitItems.closetItemId, closetItems.id))
        .innerJoin(itemPhotos, eq(closetItems.photoId, itemPhotos.id))
        .where(eq(outfitItems.outfitId, outfitId));

      if (items.length === 0) throw new Error('Outfit has no items');

      const dress = items.find((i) => i.category === 'dress');
      const top = items.find((i) => i.category === 'top');
      const bottom = items.find((i) => i.category === 'bottom');
      const outerwear = items.find((i) => i.category === 'outerwear');

      if (outerwear) {
        throw new Error(
          'Layered outfits (with outerwear) are not yet supported. Phase 10.7+.',
        );
      }

      let pipeline: 'dress' | 'standard';
      if (dress) pipeline = 'dress';
      else if (top || bottom) pipeline = 'standard';
      else throw new Error('Outfit has no try-on-able pieces');

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

      // The model image was chosen at enqueue time and stored on the job.
      let currentImageUrl = job.modelImageUrl;
      let costCents = 0;

      async function runStep(garmentUrl: string, category: FashnCategory): Promise<void> {
        const predictionId = await startTryOn({
          modelImageUrl: currentImageUrl,
          garmentImageUrl: garmentUrl,
          category,
        });
        const result = await pollFashnUntilDone(predictionId, { maxIterations: 60 });
        if (result.status !== 'completed') {
          throw new Error(
            `Fashn step '${category}' returned status '${result.status}'${
              result.error ? `: ${result.error}` : ''
            }`,
          );
        }
        const url = extractFashnOutputUrl(result.output);
        if (!url) throw new Error(`Fashn step '${category}' completed without an output URL`);
        currentImageUrl = url;
        costCents += FASHN_COST_CENTS_PER_CALL;
      }

      if (pipeline === 'dress' && dress) {
        await runStep(await signGarment(dress), 'one-pieces');
      } else {
        if (bottom) await runStep(await signGarment(bottom), 'bottoms');
        if (top) await runStep(await signGarment(top), 'tops');
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
        model: 'fashn:tryon-v1.6',
        inputSnapshot: { outfitId, pipeline, jobId },
        rawOutput: storagePath,
        parsedOutput: { storagePath },
        latencyMs: 0,
        costCents,
      });

      await logEvent({
        userId,
        type: 'tryon.completed',
        source,
        payload: { jobId, outfitId, costCents },
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

      return {
        jobId,
        status: 'failed' as const,
        resultStoragePath: null,
        costCents: 0,
      };
    }
  },
});
