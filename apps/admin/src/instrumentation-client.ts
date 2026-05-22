/**
 * Browser-side Sentry init for apps/admin. Replaces the older
 * `sentry.client.config.ts` convention which is deprecated under
 * Turbopack (Next 16's default bundler). Loaded automatically by
 * Next.js on first client render.
 *
 * Mirrors apps/web/src/instrumentation-client.ts with the admin DSN
 * env (NEXT_PUBLIC_SENTRY_DSN_ADMIN) and admin-specific
 * tracePropagationTargets. The paired addition on the api side lives
 * in apps/api/src/sentry.ts — admin tela URLs are appended there so
 * an admin→api tRPC error shows as ONE distributed trace, not two
 * disconnected events.
 *
 * PII scrubbing (`beforeSend` + `beforeBreadcrumb`) is admin-flavored:
 * see `@/lib/sentry-scrub`. The admin variant scrubs the catch-all
 * tRPC capability route + the admin SSE endpoint — cofounder queries
 * through AdminAiChat may include user emails / chat content that the
 * defaults wouldn't strip.
 *
 * enabled: production only. Local pnpm dev does NOT report to Sentry
 * (HMR / strict-mode would flood the project). To smoke-test Sentry
 * locally, build + start in production mode: `NODE_ENV=production
 * pnpm build && pnpm start`.
 *
 * Replay integration is NOT installed — paid feature, deferred until
 * cofounder error volume justifies cost. Tracked as P3 followup in
 * docs/post-cutover-followups.md.
 *
 * Also exports `onRouterTransitionStart` so the App Router can
 * propagate trace headers across client-side navigations. Without this
 * export the distributed-tracing trail breaks at every `<Link>` click.
 */
import * as Sentry from '@sentry/nextjs';

import { scrubBreadcrumb, scrubSensitiveData } from '@/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN_ADMIN,
  environment: process.env.NODE_ENV ?? 'development',
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  tracePropagationTargets: [
    'localhost',
    /^https:\/\/tela-development\.up\.railway\.app/,
    /^https:\/\/tela-admin-development\.up\.railway\.app/,
    /^https:\/\/admin\.telastyle\.app/,
  ],
  beforeSend: scrubSensitiveData,
  beforeBreadcrumb: scrubBreadcrumb,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
