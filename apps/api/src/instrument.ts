/**
 * Sentry bootstrap. Loaded via `node --import ./dist/instrument.js dist/index.js`
 * (see the `start` script) so Sentry.init() runs BEFORE index.ts and its import
 * graph (hono, @hono/node-server → node:http) are even linked.
 *
 * Putting `import './instrument.js'` first in index.ts would NOT work: ESM
 * hoists and evaluates the entire static import graph before any module body
 * runs, so node:http would already be loaded by the time init executed and
 * @sentry/node's ESM loader hooks (import-in-the-middle via module.register)
 * could never wrap it. That init-after-import mistake is why the api shipped
 * zero transactions until 2026-07 — only `--import` evaluates a module to
 * completion before the entry point is resolved.
 *
 * Keep this module's import surface minimal: anything imported here loads
 * before instrumentation is active. If a standalone OTel exporter is ever
 * adopted, its SDK init belongs here too (same before-everything constraint).
 *
 * Main-thread only, via dynamic import: worker threads inherit execArgv, so
 * every Worker re-runs this file. In dev, pino's pino-pretty transport IS a
 * worker thread — an unguarded init here imports logger.js → pino spawns a
 * transport worker → which re-runs this file → spawns another worker, a
 * runaway thread chain (~4 threads/sec, measured). The import must be dynamic
 * because a static one would load sentry.js → logger.js → pino in every
 * worker regardless of the isMainThread check below.
 */
import { isMainThread } from 'node:worker_threads';

if (isMainThread) {
  const { initSentry } = await import('./sentry.js');
  initSentry();
}
