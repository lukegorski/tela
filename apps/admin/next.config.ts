import { execSync } from 'node:child_process';
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Resolve the build commit SHA. Railway does NOT expose
// RAILWAY_GIT_COMMIT_SHA at build time (only at Node runtime), so reading
// the env var alone leaves NEXT_PUBLIC_SENTRY_RELEASE blank on Railway —
// empirically verified post-deploy: deployed admin chunk showed
// `release:void 0` in the Sentry init, and client events landed with
// release: null. Falling back to `git rev-parse HEAD` (always available
// in the nixpacks build container) mirrors what @sentry/cli does for its
// own release.name auto-detection — that's why source-map upload was
// working all along while client release tag was not.
const SENTRY_RELEASE_SHA: string = (() => {
  if (process.env.RAILWAY_GIT_COMMIT_SHA) return process.env.RAILWAY_GIT_COMMIT_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['pipe', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
})();

const config: NextConfig = {
  // Transpile workspace packages we consume directly. @tela/api is a type-only
  // import (AppRouter), but Next still requires it listed here for the
  // experimental.externalDir resolution to work. @tela/db is consumed at
  // runtime by admin lib helpers via getSql() / getDb().
  transpilePackages: ['@tela/api', '@tela/db'],
  experimental: {
    externalDir: true,
  },
  // Expose the build-time commit SHA to client bundles as
  // NEXT_PUBLIC_SENTRY_RELEASE. Sentry's withSentryConfig sets `release.name`
  // for build-time source-map upload association, but does NOT inject a
  // runtime `release` value into the SDK under Turbopack — the webpack-plugin
  // global injection (globalThis.SENTRY_RELEASE) doesn't fire, so client
  // events land with `release: null`. Inlining the value here lets
  // Sentry.init({ release: process.env.NEXT_PUBLIC_SENTRY_RELEASE }) in
  // instrumentation-client.ts attach the tag to every browser event.
  env: {
    NEXT_PUBLIC_SENTRY_RELEASE: SENTRY_RELEASE_SHA,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },
};

// Wrap with Sentry's webpack/Turbopack plugin. The wrap is responsible
// for uploading source maps at build time so stack traces in Sentry
// resolve to original source (without this they're minified gibberish).
//
// At build time the plugin needs SENTRY_AUTH_TOKEN + SENTRY_ORG +
// SENTRY_PROJECT_ADMIN — these MUST be present in Railway's admin-service
// env allowlist, OR upload fails silently. See
// docs/post-cutover-followups.md "Sentry on apps/admin" for the
// env-var hand-off list.
//
// `release.name` falls back to undefined if RAILWAY_GIT_COMMIT_SHA
// isn't injected at build time. That just means no commit-to-error
// linking — Sentry still functions normally.
//
// SENTRY_PROJECT_ADMIN (suffixed) keeps apps/admin pointed at the
// `tela-admin` Sentry project while apps/web continues to read
// SENTRY_PROJECT (= `tela-web`). Doppler tela/dev syncs both vars to
// Railway; each service's env allowlist picks the one it needs.
export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_ADMIN,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Tunnel browser events through our own origin so ad blockers that
  // block *.sentry.io don't blind us to error reports. Mirrors
  // apps/web/next.config.ts (house convention: web/admin symmetric).
  // Admin has no proxy/middleware, so no locale-exemption counterpart
  // is needed here.
  tunnelRoute: '/monitoring',
  // Quiet during local dev, verbose only in CI
  silent: !process.env.CI,
  // Drop the source maps from the final bundle after upload — we don't
  // want them publicly fetchable from the deployed app.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  // Strip Sentry's internal debug logger from production webpack
  // bundles. Has no effect under Turbopack (which is Next 16's default),
  // but the option is the new home for the previously top-level
  // `disableLogger` flag — using it here keeps us off the deprecation
  // warning path.
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
  release: {
    name: SENTRY_RELEASE_SHA || undefined,
  },
});
