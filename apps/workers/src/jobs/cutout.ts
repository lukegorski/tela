/**
 * Worker handler for enhancement.cutout jobs (builder v0, spec §4).
 *
 * Runs the enhancement.cutout capability inside a service-account
 * RequestContext. Local model, no AI spend, ~1s/photo. The capability is
 * idempotent and self-skips (already done / not enhanced / folded).
 */
import * as Sentry from '@sentry/node';
import {
  executeCapability,
  runInContext,
  type RequestContext,
} from '@tela/capabilities';
import type { CutoutPhotoJob } from '@tela/queue';
import type { Job } from 'pg-boss';
import { logger } from '../logger.js';

export async function handleCutoutJob(jobs: Job<CutoutPhotoJob>[]): Promise<void> {
  for (const job of jobs) {
    const { photoId, userId } = job.data;
    const ctx: RequestContext = {
      userId,
      source: 'worker',
      requestId: job.id,
      isServiceAccount: true,
    };

    try {
      logger.info({ jobId: job.id, photoId, userId }, 'cutout job started');
      const result = await runInContext(ctx, () =>
        executeCapability('enhancement.cutout', { photoId }),
      );
      logger.info({ jobId: job.id, photoId, result }, 'cutout job completed');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error({ jobId: job.id, photoId, userId, err: error.message }, 'cutout job failed');
      Sentry.withScope((scope) => {
        scope.setTag('job', 'enhancement.cutout');
        scope.setUser({ id: userId });
        scope.setExtra('photoId', photoId);
        scope.setExtra('jobId', job.id);
        Sentry.captureException(error);
      });
      throw error; // pg-boss retries per retryLimit
    }
  }
}
