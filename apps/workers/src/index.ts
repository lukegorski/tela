#!/usr/bin/env node
/**
 * tela worker process. Long-running. Pulls jobs from pg-boss and dispatches
 * to capability handlers.
 *
 * Run: doppler run -- pnpm --filter @tela/workers dev
 * Deploy: separate Railway service with start command `pnpm --filter @tela/workers start`
 */
import * as Sentry from '@sentry/node';
import { initSentry } from './sentry.js';
import { logger } from './logger.js';
import { setObservabilityHooks } from '@tela/capabilities';
import { getQueue, closeQueue, JOB_NAMES } from '@tela/queue';
import { closeDb } from '@tela/db';
import { handleEnhancementJob } from './jobs/enhancement.js';

// Trigger capability registration
import '@tela/capabilities';

initSentry();

// Wire capability execution → pino + Sentry
setObservabilityHooks({
  onComplete: ({ capabilityName, userId, durationMs }) => {
    logger.info(
      { capabilityName, userId, durationMs: Math.round(durationMs) },
      'capability completed',
    );
  },
  onError: ({ capabilityName, userId, durationMs, error }) => {
    logger.error(
      {
        capabilityName,
        userId,
        durationMs: Math.round(durationMs),
        err: { message: error.message, stack: error.stack },
      },
      'capability failed',
    );
    Sentry.withScope((scope) => {
      scope.setTag('capability', capabilityName);
      if (userId) scope.setUser({ id: userId });
      scope.setTag('source', 'worker');
      Sentry.captureException(error);
    });
  },
});

async function main() {
  const queue = await getQueue();
  logger.info('queue connected, registering handlers');

  // Enhancement jobs: 2 concurrent (gpt-image-1.5 calls take ~30s each;
  // higher concurrency would risk Supabase pooler exhaustion)
  await queue.work(
    JOB_NAMES.ENHANCE_PHOTO,
    { batchSize: 1, pollingIntervalSeconds: 5 },
    handleEnhancementJob,
  );

  logger.info({ jobs: [JOB_NAMES.ENHANCE_PHOTO] }, 'workers started, waiting for jobs');
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down workers');
  await closeQueue();
  await closeDb();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

main().catch((err) => {
  logger.error({ err }, 'workers fatal error');
  process.exit(1);
});
