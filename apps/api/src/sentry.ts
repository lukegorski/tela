import * as Sentry from '@sentry/node';
import { logger } from './logger.js';

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

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Propagate the `sentry-trace` + `baggage` headers on outgoing
    // requests to web + browser. The matching set on the apps/web side
    // lives in apps/web/src/instrumentation-client.ts and
    // apps/web/src/sentry.server.config.ts. Without this, a chat-stream
    // POST that errors mid-flight shows as two disconnected events in
    // Sentry (one web, one api) instead of a single distributed trace.
    tracePropagationTargets: [
      'localhost',
      /^https:\/\/tela-development\.up\.railway\.app/,
      /^https:\/\/tela-web-development\.up\.railway\.app/,
      /^https:\/\/telastyle\.app/,
    ],
  });

  logger.info('Sentry initialized');
}
