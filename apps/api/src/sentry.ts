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
  });

  logger.info('Sentry initialized');
}
