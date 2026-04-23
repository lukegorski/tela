// OTel must be initialized first — before any other imports that need tracing
import { initOtel } from './otel.js';
initOtel();

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { trpcServer } from '@hono/trpc-server';
import { initSentry } from './sentry.js';
import { logger } from './logger.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { appRouter } from './trpc/router.js';
import { createContext } from './trpc/context.js';
import { closeDb } from '@tela/db';

// Initialize Sentry (no-ops if DSN not set)
initSentry();

// Import capabilities to trigger registration
import '@tela/capabilities';

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

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close();
  await closeDb();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
