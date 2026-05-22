/**
 * PII scrubbing helpers for Sentry. Shared across client/server/edge
 * runtimes because the same payload shapes flow through every Sentry
 * event regardless of where it's captured.
 *
 * Why this exists: the privacy policy (`/privacy`, lines 161-170)
 * promises that Sentry events are "scrubbed for personally identifying
 * information" before transmission. The defaults only scrub a handful
 * of headers (Authorization, Cookie); our specific data flows leak PII
 * through URL query params + tRPC request bodies that the defaults
 * don't know about.
 *
 * Concretely scrubs:
 *   1. Supabase storage signed-URL `token` query params (8-min image
 *      access grant; leaking via breadcrumbs = unauthorized image read).
 *   2. tRPC request bodies on chat/profile/wardrobe paths (may contain
 *      user chat text, body measurements, location, free-form prefs).
 *
 * Authorization / Cookie headers are scrubbed by Sentry's defaults.
 */

import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';

const SENSITIVE_TRPC_PATHS = [
  '/api/trpc/chat.',
  '/api/trpc/profile.',
  '/api/trpc/wardrobe.',
  '/api/trpc/capability.execute',
  '/chat/stream',
];

function stripTokenFromUrl(url: string): string {
  try {
    const u = new URL(url, 'http://placeholder.invalid');
    if (u.searchParams.has('token')) {
      u.searchParams.set('token', '[SCRUBBED]');
    }
    return u.toString().replace(/^http:\/\/placeholder\.invalid/, '');
  } catch {
    return url;
  }
}

function isSensitivePath(url: string | undefined): boolean {
  if (!url) return false;
  return SENSITIVE_TRPC_PATHS.some((p) => url.includes(p));
}

export function scrubSensitiveData(event: ErrorEvent): ErrorEvent {
  if (event.request?.url) {
    event.request.url = stripTokenFromUrl(event.request.url);
  }

  if (event.request?.data && isSensitivePath(event.request.url)) {
    event.request.data = '[SCRUBBED]';
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => {
      const data = crumb.data;
      if (data && typeof data === 'object') {
        const next: Record<string, unknown> = { ...data };
        if (typeof next.url === 'string') {
          next.url = stripTokenFromUrl(next.url);
        }
        if (typeof next.to === 'string') {
          next.to = stripTokenFromUrl(next.to);
        }
        if (typeof next.from === 'string') {
          next.from = stripTokenFromUrl(next.from);
        }
        return { ...crumb, data: next };
      }
      return crumb;
    });
  }

  return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const data = breadcrumb.data;
  if (!data || typeof data !== 'object') return breadcrumb;
  const next: Record<string, unknown> = { ...data };
  if (typeof next.url === 'string') {
    next.url = stripTokenFromUrl(next.url);
  }
  if (typeof next.to === 'string') {
    next.to = stripTokenFromUrl(next.to);
  }
  if (typeof next.from === 'string') {
    next.from = stripTokenFromUrl(next.from);
  }
  if (typeof next.url === 'string' && isSensitivePath(next.url)) {
    if ('body' in next) next.body = '[SCRUBBED]';
    if ('data' in next) next.data = '[SCRUBBED]';
  }
  return { ...breadcrumb, data: next };
}
