/**
 * OAuth callback handler. Supabase Auth redirects here with a `code` query
 * param after the user authorizes (Google, etc.) or after clicking an email
 * confirmation link. We exchange the code for a session, set the cookie, and
 * redirect onward.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';

  // Inside Railway's container `request.url`'s host is `localhost:8080` (Next's
  // internal bind), so absolute redirects built from it dumped users at
  // localhost after sign-in. The x-forwarded-host + x-forwarded-proto headers
  // preserve the public origin that the browser sees. Falls back to
  // request.url.origin for local dev (no proxy in front).
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const baseUrl = forwardedHost
    ? `${forwardedProto ?? 'https'}://${forwardedHost}`
    : url.origin;

  // Where to send the user when something goes wrong. Landing page is the
  // login surface; an `?error` query param surfaces in the UI.
  const errorRedirect = (msg: string) =>
    NextResponse.redirect(new URL(`/?error=${encodeURIComponent(msg)}`, baseUrl));

  if (!code) {
    return errorRedirect('missing_code');
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return errorRedirect(error.message);
  }

  return NextResponse.redirect(new URL(next, baseUrl));
}
