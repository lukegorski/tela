import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb, tryOnJobs } from '@tela/db';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import { getSupabaseAdmin, TRY_ON_BUCKET } from '../storage/supabase.js';

const input = z.object({
  jobId: z.string().uuid().optional(),
  outfitId: z.string().uuid().optional(),
});

const output = z.object({
  jobId: z.string().uuid().nullable(),
  status: z.enum(['pending', 'running', 'complete', 'failed']).nullable(),
  resultUrl: z.string().nullable(),
  costCents: z.number(),
  error: z.string().nullable(),
  asyncStep: z.string().nullable(),
  /**
   * The model image URL used for this job. Useful for the UI to show which
   * model the user picked. Null when no job has been started for this outfit.
   */
  model: z.string().nullable(),
});

/**
 * Fetch the latest try-on job for an outfit (by outfitId) or a specific
 * job (by jobId). Returns null fields if no job exists yet — useful for
 * the outfit detail page to decide whether to show a "Try on" button or
 * a "View try-on" preview.
 *
 * Either jobId or outfitId must be provided; jobId wins when both are.
 */
export const getTryOnStatus = registerCapability({
  name: 'tryon.getStatus',
  description:
    "Fetch the status of a try-on job — by jobId, or the latest for an outfitId. Returns a result URL when status is 'complete'. Use this to drive the outfit detail page's try-on UI.",
  input,
  output,
  // Intentionally NOT exposed to chat — see note on tryon.generate. The
  // chat has no polling loop, so surfacing status would mean the LLM
  // calls this once, gets `pending`, and lies about the state.

  async execute({ jobId, outfitId }) {
    if (!jobId && !outfitId) {
      throw new Error('Pass jobId or outfitId');
    }

    const { userId } = getRequestContext();
    const db = getDb();

    const where = jobId
      ? and(eq(tryOnJobs.id, jobId), eq(tryOnJobs.userId, userId))
      : and(eq(tryOnJobs.outfitId, outfitId!), eq(tryOnJobs.userId, userId));

    const job = await db.query.tryOnJobs.findFirst({
      where,
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    if (!job) {
      return {
        jobId: null,
        status: null,
        resultUrl: null,
        costCents: 0,
        error: null,
        asyncStep: null,
        model: null,
      };
    }

    let resultUrl: string | null = null;
    if (job.status === 'complete' && job.resultStoragePath) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.storage
        .from(TRY_ON_BUCKET)
        .createSignedUrl(job.resultStoragePath, 3600);
      if (!error && data) resultUrl = data.signedUrl;
    }

    return {
      jobId: job.id,
      status: job.status,
      resultUrl,
      costCents: job.costCents,
      error: job.error,
      asyncStep: job.asyncStep,
      model: job.modelImageUrl,
    };
  },
});
