// OTel must be initialized first — before any other imports that need tracing
import { initOtel } from './otel.js';
initOtel();

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { trpcServer } from '@hono/trpc-server';
import * as Sentry from '@sentry/node';
import { initSentry } from './sentry.js';
import { logger } from './logger.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { appRouter } from './trpc/router.js';
import { createContext } from './trpc/context.js';
import { mountCostDashboard } from './admin/costs.js';
import { mountChatStream } from './chatStream.js';
import { closeDb } from '@tela/db';
import { setObservabilityHooks } from '@tela/capabilities';
import { startInProcessWorker } from './worker.js';

// Initialize Sentry (no-ops if DSN not set)
initSentry();

// Import capabilities to trigger registration
import '@tela/capabilities';

// Wire capability execution into pino + Sentry. Capabilities don't depend on
// either directly — these hooks are registered here at app startup.
setObservabilityHooks({
  onStart: ({ capabilityName, userId, source, requestId }) => {
    logger.debug({ capabilityName, userId, source, requestId }, 'capability started');
  },
  onComplete: ({ capabilityName, userId, source, requestId, durationMs }) => {
    logger.info(
      { capabilityName, userId, source, requestId, durationMs: Math.round(durationMs) },
      'capability completed',
    );
  },
  onError: ({ capabilityName, userId, source, requestId, durationMs, error }) => {
    logger.error(
      {
        capabilityName,
        userId,
        source,
        requestId,
        durationMs: Math.round(durationMs),
        err: { message: error.message, stack: error.stack },
      },
      'capability failed',
    );
    Sentry.withScope((scope) => {
      scope.setTag('capability', capabilityName);
      if (userId) scope.setUser({ id: userId });
      if (source) scope.setTag('source', source);
      if (requestId) scope.setTag('requestId', requestId);
      Sentry.captureException(error);
    });
  },
});

// ─── App ───

const app = new Hono();

// Global middleware
app.use('*', cors());
app.use('*', requestLogger);
app.onError(errorHandler);

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Read-only admin cost dashboard (HTML + JSON), service-account auth required
mountCostDashboard(app);

// SSE endpoint for streaming chat (Phase 9.2). Bearer-token auth, separate
// from tRPC because tRPC mutations don't natively stream.
mountChatStream(app);

// Mount tRPC
app.use(
  '/trpc/*',
  trpcServer({
    router: appRouter,
    createContext: (_opts, c) => createContext(c),
  }),
);

// ─── Server ───

const port = parseInt(process.env.PORT ?? '3001', 10);

const server = serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    logger.info({ port: info.port }, 'tela API server started');
  },
);

// Start the in-process worker (pulls enhancement jobs from pg-boss).
// Don't await — the worker boots async; the HTTP server is the critical path.
void startInProcessWorker();

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close();
  await closeDb();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
