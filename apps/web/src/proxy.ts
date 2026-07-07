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

// Routes exempt from the locale-prefix redirect.
//
// The /auth, /api, /trpc, /chat/stream, /_next set covers OAuth callbacks,
// API surface, and Next internals.
//
// The legal route group at apps/web/src/app/(legal)/* — privacy, terms,
// cookies, biometric-policy, dmca — is deliberately locale-free: the URLs
// are referenced from Google's OAuth consent screen and from the policies
// themselves, so they must be stable. Translated versions will live at
// /es/* and /pt-BR/* in a sibling group once translations land
// (post-Phase-A); those will not pass through this redirect either because
// the first segment will already be a locale.
const LOCALE_EXEMPT_PREFIXES = [
  '/auth',
  '/api',
  '/trpc',
  '/chat/stream',
  '/_next',
  '/privacy',
  '/terms',
  '/cookies',
  '/biometric-policy',
  '/dmca',
  // Sentry tunnel (tunnelRoute in next.config.ts). The browser SDK
  // POSTs envelopes here; a locale redirect would break the beforeFiles
  // rewrite that forwards them to Sentry ingest, silently killing error
  // reporting for ad-blocker users. Keep in sync with next.config.ts.
  '/monitoring',
];

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
