/**
 * Sign-out POST handler. Clears the Supabase session cookie and redirects
 * to the locale-aware landing page (which doubles as the login surface).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}
