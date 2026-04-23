import type { MiddlewareHandler } from 'hono';
import { logger } from '../logger.js';

/**
 * Logs every incoming request with method, path, status, and duration.
 */
export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = performance.now();
  const method = c.req.method;
  const path = c.req.path;
  const requestId = crypto.randomUUID();

  // Attach request ID to context for downstream use
  c.set('requestId', requestId);

  logger.info({ requestId, method, path }, 'request started');

  try {
    await next();
  } finally {
    const duration = Math.round(performance.now() - start);
    const status = c.res.status;

    const logFn = status >= 500 ? logger.error.bind(logger) : logger.info.bind(logger);
    logFn({ requestId, method, path, status, durationMs: duration }, 'request completed');
  }
};
