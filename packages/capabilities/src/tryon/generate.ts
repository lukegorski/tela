import { z } from 'zod';
import { eq, and, inArray, sql as drizzleSql } from 'drizzle-orm';
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
import { getSupabaseAdmin, ITEM_PHOTOS_BUCKET, TRY_ON_BUCKET } from '../storage/supabase.js';

const input = z.object({
  outfitId: z.string().uuid(),
  /**
   * If true, regenerate even if a complete try-on already exists for this
   * outfit. False by default: if there's already a complete row, return it.
   */
  force: z.boolean().default(false),
});

const output = z.object({
  jobId: z.string().uuid(),
  status: z.enum(['pending', 'running', 'complete', 'failed']),
  resultUrl: z.string().nullable(),
  costCents: z.number(),
  error: z.string().nullable(),
});

/**
 * Default model images used for Fashn try-on. Hosted on Firebase Storage
 * from the legacy app — public URLs that Fashn can fetch directly. We'll
 * port these to Supabase eventually but they work fine in production today.
 *
 * For MVP this is a single hard-coded picker; Phase 10 polish adds a
 * users.tryOnSettings JSONB so users can switch between man / woman /
 * self-photo.
 */
const DEFAULT_MODEL_URL =
  'https://firebasestorage.googleapis.com/v0/b/aletela.firebasestorage.app/o/models%2Fwoman.jpg?alt=media';

/** Conservative per-Fashn-call cost in cents. Fashn charges roughly $0.04/call for tryon-v1.6. */
const FASHN_COST_CENTS_PER_CALL = 4;

/**
 * Run a Fashn try-on for the given outfit. Two pipelines supported in this
 * MVP cut:
 *   - Dress (one-pieces): single Fashn call.
 *   - Standard (top + bottom): two sequential Fashn calls (bottoms then top).
 *
 * Layered (top + bottom + outerwear) is intentionally rejected for now —
 * the multi-step async orchestration lives in a separate capability that's
 * still being built.
 *
 * Status machine on the try_on_jobs row:
 *   pending → running → complete (success)
 *   pending → running → failed (any error)
 *
 * If a complete job already exists for this outfit and force=false, we
 * return it without re-running.
 */
export const generateTryOn = registerCapability({
  name: 'tryon.generate',
  description:
    'Run a Fashn try-on for an outfit. Supports dress (single Fashn call) and standard top+bottom pipelines (two sequential calls). Returns immediately on cache hit; otherwise blocks until the pipeline completes. Layered outfits with outerwear are not yet supported.',
  input,
  output,

  async execute({ outfitId, force }) {
    const { userId, source } = getRequestContext();
    const db = getDb();

    // 1. Verify outfit ownership
    const outfit = await db.query.outfits.findFirst({
      where: and(eq(outfits.id, outfitId), eq(outfits.userId, userId)),
    });
    if (!outfit) {
      throw new Error('Outfit not found or does not belong to user');
    }

    // 2. Cache hit check — return existing complete job unless forced
    if (!force) {
      const existing = await db.query.tryOnJobs.findFirst({
        where: and(eq(tryOnJobs.outfitId, outfitId), eq(tryOnJobs.status, 'complete')),
      });
      if (existing) {
        return {
          jobId: existing.id,
          status: 'complete' as const,
          resultUrl: existing.resultStoragePath
            ? await signResultUrl(existing.resultStoragePath)
            : null,
          costCents: existing.costCents,
          error: null,
        };
      }
    }

    // 3. Load outfit items + photos. We need the storage path to mint
    // signed URLs Fashn can pull from.
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

    if (items.length === 0) {
      throw new Error('Outfit has no items');
    }

    // 4. Determine pipeline. Categories from item.analyze: 'top', 'bottom',
    // 'dress', 'outerwear', 'shoes', 'accessory'. We only act on the first
    // four and ignore shoes/accessories (Fashn doesn't try them on
    // separately).
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
    if (dress) {
      pipeline = 'dress';
    } else if (top && bottom) {
      pipeline = 'standard';
    } else if (top || bottom) {
      // top-only or bottom-only — treat as standard with one missing piece.
      // Fashn's tryon-v1.6 accepts a single garment image at a time, so we
      // can run a partial pipeline.
      pipeline = 'standard';
    } else {
      throw new Error(
        'Outfit has no try-on-able pieces (need at least a top, bottom, or dress)',
      );
    }

    // 5. Create the try_on_jobs row up front so we have an audit trail
    // even if we crash mid-pipeline.
    const [job] = await db
      .insert(tryOnJobs)
      .values({
        userId,
        outfitId,
        status: 'running' as TryOnStatus,
        modelImageUrl: DEFAULT_MODEL_URL,
      })
      .returning({ id: tryOnJobs.id });

    await logEvent({
      userId,
      type: 'tryon.started',
      source,
      payload: { jobId: job.id, outfitId, pipeline },
    });

    try {
      // 6. Mint signed URLs for the garment images Fashn needs to fetch.
      // 1-hour TTL is plenty for the pipeline.
      const supabase = getSupabaseAdmin();
      const ttlSeconds = 3600;

      async function signGarment(item: (typeof items)[number]): Promise<string> {
        const path = item.enhancedStoragePath ?? item.photoStoragePath;
        const { data, error } = await supabase.storage
          .from(ITEM_PHOTOS_BUCKET)
          .createSignedUrl(path, ttlSeconds);
        if (error || !data) {
          throw new Error(`Failed to sign garment URL for item ${item.itemId}: ${error?.message}`);
        }
        return data.signedUrl;
      }

      let currentImageUrl = DEFAULT_MODEL_URL;
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
        if (!url) {
          throw new Error(`Fashn step '${category}' completed without an output URL`);
        }
        currentImageUrl = url;
        costCents += FASHN_COST_CENTS_PER_CALL;
      }

      if (pipeline === 'dress' && dress) {
        const dressUrl = await signGarment(dress);
        await runStep(dressUrl, 'one-pieces');
      } else {
        // standard — bottoms first (more grounding for the figure), then top.
        if (bottom) {
          await runStep(await signGarment(bottom), 'bottoms');
        }
        if (top) {
          await runStep(await signGarment(top), 'tops');
        }
      }

      // 7. Download the final image and upload to Supabase Storage so we
      // own a stable URL. Fashn output URLs expire.
      const imageRes = await fetch(currentImageUrl);
      if (!imageRes.ok) {
        throw new Error(`Failed to fetch final Fashn image (${imageRes.status})`);
      }
      const buffer = Buffer.from(await imageRes.arrayBuffer());
      const storagePath = `${userId}/${outfitId}/${job.id}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from(TRY_ON_BUCKET)
        .upload(storagePath, buffer, {
          contentType: 'image/jpeg',
          cacheControl: '31536000',
          upsert: true,
        });
      if (uploadErr) {
        throw new Error(`Failed to upload try-on result: ${uploadErr.message}`);
      }

      // 8. Mark job complete + log a generation row for cost dashboards.
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
        .where(eq(tryOnJobs.id, job.id));

      // The generations table is normally written by @tela/ai's gateway.
      // We don't go through the gateway for Fashn (different vendor), so
      // we record our own row so the cost dashboard sees it. operation =
      // 'tryon.generate', model = 'fashn:tryon-v1.6'.
      await db.insert(generations).values({
        userId,
        operation: 'tryon.generate',
        promptName: 'tryon.fashn',
        promptVersionId: '00000000-0000-0000-0000-000000000000', // synthetic — Fashn isn't prompt-driven
        model: 'fashn:tryon-v1.6',
        inputSnapshot: { outfitId, pipeline, jobId: job.id },
        rawOutput: storagePath,
        parsedOutput: { storagePath },
        latencyMs: 0,
        costCents,
      });

      await logEvent({
        userId,
        type: 'tryon.completed',
        source,
        payload: { jobId: job.id, outfitId, costCents },
      });

      return {
        jobId: job.id,
        status: 'complete' as const,
        resultUrl: await signResultUrl(storagePath),
        costCents,
        error: null,
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
        .where(eq(tryOnJobs.id, job.id));

      await logEvent({
        userId,
        type: 'tryon.failed',
        source,
        payload: { jobId: job.id, outfitId, error: message },
      });

      return {
        jobId: job.id,
        status: 'failed' as const,
        resultUrl: null,
        costCents: 0,
        error: message,
      };
    }
  },
});

/** Sign a try-on result for client display. 1 hour TTL — UI re-fetches as needed. */
async function signResultUrl(storagePath: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(TRY_ON_BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error || !data) {
    throw new Error(`Failed to sign try-on result URL: ${error?.message}`);
  }
  return data.signedUrl;
}

// Suppress unused warnings until we wire layered pipelines
void inArray;
void drizzleSql;
