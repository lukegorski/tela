/**
 * Worker handler for enhancement.process jobs.
 *
 * Picks up a job from the ENHANCE_PHOTO queue, runs the enhancement.process
 * capability inside a service-account RequestContext on behalf of the
 * userId in the job payload.
 */
import * as Sentry from '@sentry/node';
import {
  executeCapability,
  runInContext,
  type RequestContext,
} from '@tela/capabilities';
import type { EnhancePhotoJob } from '@tela/queue';
import type { Job } from 'pg-boss';
import { logger } from '../logger.js';

export async function handleEnhancementJob(jobs: Job<EnhancePhotoJob>[]): Promise<void> {
  // pg-boss v11 batches: even with batchSize=1 we get an array
  for (const job of jobs) {
    const { photoId, userId } = job.data;
    const ctx: RequestContext = {
      userId,
      source: 'worker',
      requestId: job.id,
      isServiceAccount: true,
    };

    try {
      logger.info({ jobId: job.id, photoId, userId }, 'enhancement job started');
      const result = await runInContext(ctx, () =>
        executeCapability('enhancement.process', { photoId }),
      );
      logger.info({ jobId: job.id, photoId, result }, 'enhancement job completed');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(
        { jobId: job.id, photoId, userId, err: error.message },
        'enhancement job failed',
      );
      Sentry.withScope((scope) => {
        scope.setTag('job', 'enhancement.process');
        scope.setUser({ id: userId });
        scope.setExtra('photoId', photoId);
        scope.setExtra('jobId', job.id);
        Sentry.captureException(error);
      });
      throw error; // pg-boss will retry per its retryLimit
    }
  }
}
