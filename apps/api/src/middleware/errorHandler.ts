import type { ErrorHandler } from 'hono';
import * as Sentry from '@sentry/node';
import { logger } from '../logger.js';

/**
 * Global error handler. Logs the error, captures in Sentry, and returns structured JSON.
 */
export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = c.get('requestId') ?? 'unknown';

  logger.error(
    {
      requestId,
      error: err.message,
      stack: err.stack,
      path: c.req.path,
      method: c.req.method,
    },
    'unhandled error',
  );

  // Sentry capture (safe to call even if not initialized — it no-ops)
  Sentry.captureException(err, {
    extra: { requestId, path: c.req.path, method: c.req.method },
  });

  return c.json(
    {
      error: 'Internal server error',
      requestId,
    },
    500,
  );
};
