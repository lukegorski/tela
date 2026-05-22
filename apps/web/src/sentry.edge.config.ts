/**
 * Edge runtime Sentry init for apps/web. Catches errors that fire
 * inside middleware + edge route handlers. We don't currently run
 * anything on the edge runtime, but Next.js still calls `register`
 * with NEXT_RUNTIME=edge during build/probe, so this file must exist
 * to keep the runtime branching in instrumentation.ts symmetric.
 *
 * The edge runtime has no Node APIs (no `fs`, no `process.exit`), so
 * the init is intentionally minimal — same env gating + scrubbing,
 * no tracePropagationTargets (no outbound HTTP from current edge code).
 */
import * as Sentry from '@sentry/nextjs';

import { scrubBreadcrumb, scrubSensitiveData } from '@/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  beforeSend: scrubSensitiveData,
  beforeBreadcrumb: scrubBreadcrumb,
});
