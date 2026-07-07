import * as Sentry from '@sentry/node';
import { logger } from './logger.js';

/**
 * Diagnostic counters for the /health trace probe: how many envelopes of
 * each kind the SDK has handed to its transport since boot, plus the
 * sample rate initSentry resolved. Lets us tell "sampler dropped it" from
 * "envelope left the SDK but never reached Sentry" on a box with no log
 * access (Railway).
 */
export const sentryStats = {
  resolvedTracesSampleRate: null as number | null,
  transactionEnvelopes: 0,
  errorEnvelopes: 0,
};

/**
 * Initialize Sentry error tracking.
 * Safe to call even without SENTRY_DSN — it logs a warning and continues.
 */
export function initSentry() {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    logger.warn('SENTRY_DSN not set — error tracking disabled');
    return;
  }

  // Sampling is its own dial, decoupled from environment naming:
  // SENTRY_TRACES_SAMPLE_RATE (0..1) overrides the per-env default of
  // 0.1 in production / 1.0 elsewhere. Set it to 1 in Doppler when a
  // debugging session needs every distributed trace.
  const rateOverride = Number(process.env.SENTRY_TRACES_SAMPLE_RATE || undefined);
  const tracesSampleRate = Number.isFinite(rateOverride)
    ? rateOverride
    : process.env.NODE_ENV === 'production'
      ? 0.1
      : 1.0;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate,
    // Propagate the `sentry-trace` + `baggage` headers on outgoing
    // requests to web + admin + browser. The matching sets live in
    // apps/web/src/instrumentation-client.ts +
    // apps/web/src/sentry.server.config.ts (web) and
    // apps/admin/src/instrumentation-client.ts +
    // apps/admin/src/sentry.server.config.ts (admin). Without this, a
    // chat-stream POST that errors mid-flight shows as two disconnected
    // events in Sentry (one web/admin, one api) instead of a single
    // distributed trace. Incoming `sentry-trace` headers from web/admin
    // are continued automatically by the http integration — which only
    // instruments anything because init runs via instrument.ts/--import
    // before node:http loads (see instrument.ts).
    tracePropagationTargets: [
      'localhost',
      /^https:\/\/tela-development\.up\.railway\.app/,
      /^https:\/\/tela-web-development\.up\.railway\.app/,
      /^https:\/\/telastyle\.app/,
      /^https:\/\/tela-admin-development\.up\.railway\.app/,
      /^https:\/\/admin\.telastyle\.app/,
    ],
  });

  sentryStats.resolvedTracesSampleRate = tracesSampleRate;
  Sentry.getClient()?.on('beforeEnvelope', (envelope) => {
    for (const item of envelope[1] as [{ type?: string }, unknown][]) {
      const type = item[0]?.type;
      if (type === 'transaction') sentryStats.transactionEnvelopes++;
      else if (type === 'event') sentryStats.errorEnvelopes++;
    }
  });

  logger.info({ tracesSampleRate }, 'Sentry initialized');
}
