import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import {
  getDb,
  outfits,
  tryOnJobs,
  users,
  type TryOnStatus,
} from '@tela/db';
import { getQueue, JOB_NAMES, type ProcessTryOnJob } from '@tela/queue';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import { resolveModelImageUrl, getSupabaseAdmin, TRY_ON_BUCKET } from '../storage/supabase.js';

const input = z.object({
  outfitId: z.string().uuid(),
  /**
   * If true, regenerate even if a complete try-on already exists for this
   * outfit. Default false: cache hit returns the existing job.
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
 * Enqueue a Fashn try-on for an outfit. Returns immediately with the
 * try_on_jobs row id — the actual pipeline runs in the apps/api worker
 * via the `tryon.process` capability. Frontend polls `tryon.getStatus`
 * every ~2.5s while status is 'pending' or 'running'.
 *
 * On cache hit (existing complete job for this outfit, force=false), this
 * returns the cached row synchronously without enqueueing.
 */
export const generateTryOn = registerCapability({
  name: 'tryon.generate',
  description:
    'Enqueue a Fashn try-on for an outfit and return the jobId immediately. Pipeline runs in a background worker; poll tryon.getStatus to drive UI. Returns a cached complete job if one exists and force=false.',
  input,
  output,

  async execute({ outfitId, force }) {
    const { userId } = getRequestContext();
    const db = getDb();

    const outfit = await db.query.outfits.findFirst({
      where: and(eq(outfits.id, outfitId), eq(outfits.userId, userId)),
    });
    if (!outfit) {
      throw new Error('Outfit not found or does not belong to user');
    }

    // Cache hit — return the existing complete job (with a fresh signed URL).
    if (!force) {
      const existing = await db.query.tryOnJobs.findFirst({
        where: and(eq(tryOnJobs.outfitId, outfitId), eq(tryOnJobs.status, 'complete')),
      });
      if (existing) {
        let resultUrl: string | null = null;
        if (existing.resultStoragePath) {
          const supabase = getSupabaseAdmin();
          const { data } = await supabase.storage
            .from(TRY_ON_BUCKET)
            .createSignedUrl(existing.resultStoragePath, 3600);
          resultUrl = data?.signedUrl ?? null;
        }
        return {
          jobId: existing.id,
          status: 'complete' as const,
          resultUrl,
          costCents: existing.costCents,
          error: null,
        };
      }
    }

    // Read the user's preferred model. Falls back to model-woman if the
    // user hasn't touched try-on settings yet (matches DEFAULT_TRY_ON_SETTINGS).
    const userRow = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { tryOnSettings: true },
    });
    const modelImageUrl = resolveModelImageUrl(userRow?.tryOnSettings?.model ?? 'model-woman');

    const [job] = await db
      .insert(tryOnJobs)
      .values({
        userId,
        outfitId,
        status: 'pending' as TryOnStatus,
        modelImageUrl,
      })
      .returning({ id: tryOnJobs.id });

    const queue = await getQueue();
    const payload: ProcessTryOnJob = { jobId: job.id, userId, outfitId };
    await queue.send(JOB_NAMES.PROCESS_TRY_ON, payload);

    // Note: tryon.started event is emitted by the worker when work actually
    // begins — not here at enqueue time. Keeps the event timestamp meaningful.

    return {
      jobId: job.id,
      status: 'pending' as const,
      resultUrl: null,
      costCents: 0,
      error: null,
    };
  },
});
