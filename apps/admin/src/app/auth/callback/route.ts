/**
 * OAuth callback handler. Supabase Auth redirects here with a `code` query
 * param after the user authorizes Google. We exchange the code for a
 * session, set the cookie, and redirect onward.
 *
 * Default `next` is /admin/users (not /) so a successful sign-in lands the
 * admin on the real home instead of bouncing through the root page's
 * client-side redirect — one hop instead of two.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/admin/users';

  // Inside Railway's container, request.url's host is localhost:8080 (Next's
  // internal bind), so absolute redirects built from it would dump users at
  // localhost after sign-in. x-forwarded-host + x-forwarded-proto preserve
  // the public origin the browser sees. Falls back to url.origin for local
  // dev (no proxy in front).
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const baseUrl = forwardedHost
    ? `${forwardedProto ?? 'https'}://${forwardedHost}`
    : url.origin;

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
