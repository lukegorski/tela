// Railway healthcheck. Minimal by design — no DB, no auth, no Sentry,
// no SSR — Railway needs a fresh 200 from the live container, not a
// prerendered/cached snapshot.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok' });
}
