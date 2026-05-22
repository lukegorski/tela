'use client';

/**
 * Last-resort error boundary. Catches React render errors that escape
 * every nested error.tsx — including hydration failures + crashes
 * inside the route-group layouts (which sit ABOVE any error.tsx and
 * therefore can't be caught by one).
 *
 * Critically, without this file Sentry never sees those root-level
 * crashes. Next.js renders its built-in fallback page and the original
 * error is lost. global-error.tsx is the only place we can grab them.
 *
 * Owns its own <html>/<body> because it REPLACES the root layout when
 * active — no styles, no fonts, no providers are available. Keep this
 * minimal.
 *
 * Next 16 changed the second prop's name from `reset` to
 * `unstable_retry`; we accept it but don't surface a retry button in
 * the UI yet (re-rendering the broken tree usually crashes again
 * unless the underlying state changed). Future polish.
 */
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: '#1a1a1a',
          background: '#fafafa',
        }}
      >
        <div style={{ textAlign: 'center', padding: '2rem', maxWidth: 480 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '0.95rem', color: '#666', marginBottom: '1.5rem' }}>
            We&apos;ve been notified. Please refresh the page to try again.
          </p>
          {error.digest && (
            <p style={{ fontSize: '0.75rem', color: '#999', fontFamily: 'monospace' }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
