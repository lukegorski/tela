/**
 * Next.js instrumentation hook. Called once when the server starts —
 * we use it to fan out Sentry init across runtimes.
 *
 * Runtime branching is REQUIRED because the Node runtime, edge runtime,
 * and browser run different Sentry SDKs underneath the @sentry/nextjs
 * wrapper. Importing the Node config inside an edge-runtime worker
 * crashes the build with "Module not found: fs".
 *
 *   NEXT_RUNTIME = 'nodejs' → sentry.server.config.ts
 *   NEXT_RUNTIME = 'edge'   → sentry.edge.config.ts
 *
 * Browser-side init is loaded automatically by Next.js from
 * `src/instrumentation-client.ts` — we don't need to import it here.
 *
 * `onRequestError` is re-exported from @sentry/nextjs so the framework
 * can call it for unhandled errors thrown during request handling.
 * Without re-exporting this, server-side errors from Server Components
 * + route handlers never report to Sentry.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs';
