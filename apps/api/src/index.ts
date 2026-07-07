import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { trpcServer } from '@hono/trpc-server';
import * as Sentry from '@sentry/node';
import { initSentry, sentryStats } from './sentry.js';
import { logger } from './logger.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { appRouter } from './trpc/router.js';
import { createContext } from './trpc/context.js';
import { mountCostDashboard } from './admin/costs.js';
import { mountChatStream } from './chatStream.js';
import { mountAdminChatStream } from './admin/chatStream.js';
import { closeDb } from '@tela/db';
import { setObservabilityHooks } from '@tela/capabilities';
import { startInProcessWorker } from './worker.js';

// Sentry is normally initialized in instrument.ts via `node --import` before
// this module's imports load (required for http tracing under ESM). If the
// process was started without the flag (`tsx watch` in dev, or a regressed
// start command), fall back to late init: error capture still works, but
// loader hooks can no longer attach, so transactions/traces are silently off.
if (!Sentry.isInitialized()) {
  logger.warn(
    'Sentry not initialized via --import ./dist/instrument.js — late init, http tracing disabled',
  );
  initSentry();
}

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

// Health check. With `x-tela-trace-probe: 1` it also reports the handler's
// active Sentry span — ground truth for whether http instrumentation is
// live in THIS process (trace ids are non-secret; they're already shared
// with browsers via sentry-trace headers). Lets us verify tracing on
// Railway with plain curl, since the Sentry API token can't read events.
app.get('/health', (c) => {
  const base = { status: 'ok', timestamp: new Date().toISOString() };
  if (c.req.header('x-tela-trace-probe') !== '1') return c.json(base);
  // Opt-in in-process sampler experiment: run N detached root traces and
  // report how many recorded plus raw sampleRand values — measures the
  // live effective root sample rate without relying on traffic statistics
  // or Sentry-side visibility. Recorded spans are real envelopes named
  // 'sample-experiment' (deliberate: they double as ingest canaries that
  // the health-check inbound filter won't eat).
  const expN = Math.min(Number(c.req.header('x-tela-sample-experiment') ?? 0) || 0, 300);
  let experiment: { n: number; recorded: number; sampleRands: number[] } | null = null;
  if (expN > 0) {
    let recorded = 0;
    const sampleRands: number[] = [];
    for (let i = 0; i < expN; i++) {
      Sentry.startNewTrace(() => {
        const pc = Sentry.getCurrentScope().getPropagationContext();
        if (sampleRands.length < 12) sampleRands.push(pc.sampleRand);
        Sentry.startSpan({ name: 'sample-experiment', forceTransaction: true }, (sp) => {
          if (sp.isRecording()) recorded++;
        });
      });
    }
    experiment = { n: expN, recorded, sampleRands };
  }
  const span = Sentry.getActiveSpan();
  const s = span ? Sentry.spanToJSON(span) : null;
  const dsn = Sentry.getClient()?.getDsn();
  return c.json({
    ...base,
    node: process.version,
    sentryInitialized: Sentry.isInitialized(),
    trace: s
      ? {
          trace_id: s.trace_id,
          span_id: s.span_id,
          parent_span_id: s.parent_span_id ?? null,
          // The real sampling verdict: getActiveSpan() also returns
          // non-recording spans, whose transactions are never exported.
          is_recording: span?.isRecording() ?? false,
          trace_flags: span?.spanContext().traceFlags ?? null,
        }
      : null,
    // Public DSN parts only — confirms which Sentry project this process
    // actually targets (a Railway-side env override would show up here).
    dsn: dsn ? { host: dsn.host, projectId: dsn.projectId } : null,
    stats: sentryStats,
    // What the ACTIVE client actually carries at runtime — if this is
    // undefined while stats.resolvedTracesSampleRate is 0.1, the sampler
    // is consulting a different client than the one initSentry configured.
    clientTracesSampleRate: Sentry.getClient()?.getOptions().tracesSampleRate ?? null,
    sdkVersion: Sentry.SDK_VERSION,
    // Dual-SDK-copy detector: more than one version key here means two
    // @sentry instances share this process.
    sdkCarriers: Object.keys(
      (globalThis as Record<string, unknown> & { __SENTRY__?: Record<string, unknown> })
        .__SENTRY__ ?? {},
    ),
    // Env var NAMES only (never values): reveals Railway-side vars that
    // Doppler doesn't show us, e.g. OTEL_* sampler overrides.
    envKeys: Object.keys(process.env)
      .filter((k) => /^(SENTRY_|OTEL_|NODE_OPTIONS)/.test(k))
      .sort(),
    experiment,
  });
});

// Read-only admin cost dashboard (HTML + JSON), service-account auth required
mountCostDashboard(app);

// SSE endpoint for streaming chat (Phase 9.2). Bearer-token auth, separate
// from tRPC because tRPC mutations don't natively stream.
mountChatStream(app);

// SSE endpoint for streaming admin chat (Phase 14c). Bearer-token auth +
// is_admin gate. Same wire format as /chat/stream so the AdminAiChat UI
// can reuse rendering logic.
mountAdminChatStream(app);

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
