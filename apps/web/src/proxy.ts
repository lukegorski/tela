/**
 * Next 16 proxy (formerly "middleware"). Two responsibilities:
 *
 * 1. Refresh the Supabase auth cookie so RSCs see a fresh session.
 * 2. Redirect locale-less paths (e.g. /wardrobe) to a locale-prefixed
 *    path (e.g. /en/wardrobe) based on the user's Accept-Language header.
 *
 * Routes that don't take a locale prefix (/auth/* OAuth callback +
 * sign-out, /trpc, /chat/stream, Next internals) are exempt from
 * locale routing.
 *
 * Note: /admin used to live in this app under the (admin) route group.
 * It was removed (Phase 14 prep) — the new admin lives at
 * admin.telastyle.app via a separate apps/admin Next service. This app
 * (apps/web) MUST NOT serve any /admin path.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { detectLocaleFromHeader, isLocale } from '@/lib/i18n';

const LOCALE_EXEMPT_PREFIXES = ['/auth', '/api', '/trpc', '/chat/stream', '/_next'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // ─── 1. Locale routing ───
  const { pathname } = request.nextUrl;

  if (!LOCALE_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) {
    const firstSegment = pathname.split('/')[1] ?? '';
    if (!isLocale(firstSegment)) {
      // No locale in URL — detect from Accept-Language and redirect
      const acceptLang = request.headers.get('accept-language');
      const locale = detectLocaleFromHeader(acceptLang);
      const newUrl = request.nextUrl.clone();
      newUrl.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
      return NextResponse.redirect(newUrl);
    }
  }

  // ─── 2. Refresh Supabase session cookie ───
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }>,
        ) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Match all paths except Next internals + static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
