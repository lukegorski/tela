import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const config: NextConfig = {
  // Allow workspace packages to be transpiled (the tela monorepo dependencies)
  transpilePackages: ['@tela/api'],
  experimental: {
    // Required for our co-located workspace structure
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
    NEXT_PUBLIC_SENTRY_RELEASE: process.env.RAILWAY_GIT_COMMIT_SHA ?? '',
  },
  images: {
    // Allow next/image to load from any Supabase Storage bucket on any
    // Supabase project (dev/staging/prod). All ported components use
    // <Image> with signed URLs from /storage/v1/object/sign/... and
    // public URLs from /storage/v1/object/public/...; without this
    // allowlist next/image throws "Invalid src prop ... hostname not
    // configured" and the React tree errors out.
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
// SENTRY_PROJECT — these MUST be present in Railway's web-service env
// allowlist, OR upload fails silently. See docs/post-cutover-followups.md
// "Sentry in apps/web" for the env-var hand-off list.
//
// `release.name` falls back to undefined if RAILWAY_GIT_COMMIT_SHA
// isn't injected at build time. That just means no commit-to-error
// linking — Sentry still functions normally.
export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
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
    name: process.env.RAILWAY_GIT_COMMIT_SHA,
  },
});
