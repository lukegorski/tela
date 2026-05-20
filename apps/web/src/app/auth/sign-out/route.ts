/**
 * Sign-out POST handler. Clears the Supabase session cookie and redirects
 * to the locale-aware landing page (which doubles as the login surface).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();

  // Build redirect base from forwarded headers — see /auth/callback for why
  // request.url is unsafe inside Railway (resolves to localhost:8080).
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const baseUrl = forwardedHost
    ? `${forwardedProto ?? 'https'}://${forwardedHost}`
    : new URL(request.url).origin;

  return NextResponse.redirect(new URL('/', baseUrl), { status: 303 });
}
