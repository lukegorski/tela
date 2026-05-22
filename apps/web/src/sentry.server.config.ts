/**
 * Server-side (Node runtime) Sentry init for apps/web. Catches SSR /
 * RSC / route-handler errors that fire inside the Node runtime — these
 * never reach the browser-side Sentry client, so without this init
 * they'd vanish.
 *
 * Loaded by apps/web/src/instrumentation.ts via runtime branching.
 *
 * Same env gating + PII scrubbing as the client config — kept
 * intentionally symmetric so any future scrubbing rule added in
 * `@/lib/sentry-scrub` applies to every event regardless of where it
 * was captured.
 */
import * as Sentry from '@sentry/nextjs';

import { scrubBreadcrumb, scrubSensitiveData } from '@/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  tracePropagationTargets: [
    'localhost',
    /^https:\/\/tela-development\.up\.railway\.app/,
    /^https:\/\/tela-web-development\.up\.railway\.app/,
    /^https:\/\/telastyle\.app/,
  ],
  beforeSend: scrubSensitiveData,
  beforeBreadcrumb: scrubBreadcrumb,
});
