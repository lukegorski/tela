/**
 * Browser-side Sentry init. Replaces the older `sentry.client.config.ts`
 * convention which is deprecated under Turbopack (Next 16's default
 * bundler). Loaded automatically by Next.js on first client render.
 *
 * Mirrors apps/api/src/sentry.ts shape (V2 reference) with browser-
 * specific additions:
 *
 *   - tracePropagationTargets: distributed tracing into apps/api. The
 *     matching addition on the api side lives in apps/api/src/sentry.ts.
 *   - beforeSend + beforeBreadcrumb: PII scrubbing for tRPC bodies and
 *     Supabase signed-URL tokens. See `@/lib/sentry-scrub` and the
 *     privacy policy at `/privacy` lines 161-170 for the legal reason
 *     scrubbing is mandatory.
 *
 * enabled: production only. Local pnpm dev does NOT report to Sentry
 * (HMR / strict-mode would flood the project). To smoke-test Sentry
 * locally, build + start in production mode: `NODE_ENV=production
 * pnpm build && pnpm start`.
 *
 * Replay integration is NOT installed — paid feature, deferred until
 * users return + bug-triage value justifies cost. (In @sentry/nextjs
 * v10 Replay is opt-in, not in default integrations, so simply not
 * adding it is sufficient.)
 *
 * Also exports `onRouterTransitionStart` so the App Router can
 * propagate trace headers across client-side navigations. Without this
 * export the distributed-tracing trail breaks at every `<Link>` click.
 */
import * as Sentry from '@sentry/nextjs';

import { scrubBreadcrumb, scrubSensitiveData } from '@/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
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

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
