/**
 * Co-located worker startup. The API process also pulls jobs from pg-boss.
 *
 * For now this is the simplest deploy story (one Railway service for both
 * HTTP + workers). Split into a separate apps/workers Railway service when
 * scale or isolation requires it — the handlers themselves live in their
 * own files and can be moved without changes.
 */
import * as Sentry from '@sentry/node';
import {
  executeCapability,
  runInContext,
  type RequestContext,
} from '@tela/capabilities';
import {
  getQueue,
  JOB_NAMES,
  type EnhancePhotoJob,
  type ProcessTryOnJob,
} from '@tela/queue';
import type { Job } from 'pg-boss';
import { logger } from './logger.js';

async function handleEnhancementJob(jobs: Job<EnhancePhotoJob>[]): Promise<void> {
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
      throw error;
    }
  }
}

async function handleTryOnJob(jobs: Job<ProcessTryOnJob>[]): Promise<void> {
  for (const job of jobs) {
    const { jobId, userId, outfitId } = job.data;
    const ctx: RequestContext = {
      userId,
      source: 'worker',
      requestId: job.id,
      isServiceAccount: true,
    };
    try {
      logger.info({ jobId, userId, outfitId }, 'try-on job started');
      const result = await runInContext(ctx, () =>
        executeCapability('tryon.process', { jobId, outfitId }),
      );
      logger.info({ jobId, outfitId, result }, 'try-on job completed');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      // The capability already wrote status='failed' to the row before
      // throwing, so the user-facing UI sees the failure via getStatus.
      // We log here for ops visibility + Sentry alerting.
      logger.error(
        { jobId, userId, outfitId, err: error.message },
        'try-on job failed',
      );
      Sentry.withScope((scope) => {
        scope.setTag('job', 'tryon.process');
        scope.setUser({ id: userId });
        scope.setExtra('outfitId', outfitId);
        scope.setExtra('tryOnJobId', jobId);
        Sentry.captureException(error);
      });
      throw error;
    }
  }
}

export async function startInProcessWorker(): Promise<void> {
  // Skip in test/eval environments
  if (process.env.SKIP_WORKER === '1') {
    logger.warn('SKIP_WORKER=1 — worker not started');
    return;
  }

  try {
    const queue = await getQueue();
    await queue.work(
      JOB_NAMES.ENHANCE_PHOTO,
      { batchSize: 1, pollingIntervalSeconds: 5 },
      handleEnhancementJob,
    );
    await queue.work(
      JOB_NAMES.PROCESS_TRY_ON,
      { batchSize: 1, pollingIntervalSeconds: 3 },
      handleTryOnJob,
    );
    logger.info(
      { jobs: [JOB_NAMES.ENHANCE_PHOTO, JOB_NAMES.PROCESS_TRY_ON] },
      'in-process worker started',
    );
  } catch (err) {
    // Don't crash the API if the worker fails to start — HTTP can still serve
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error({ err: error.message }, 'in-process worker failed to start');
    Sentry.captureException(error);
  }
}
