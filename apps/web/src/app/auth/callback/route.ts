/**
 * OAuth callback handler. Supabase Auth redirects here with a `code` query
 * param after the user authorizes (Google, etc.) or after clicking an email
 * confirmation link. We exchange the code for a session, set the cookie, and
 * either redirect onward (full-page flow) or render a tiny HTML page that
 * postMessages the parent window and closes itself (popup flow — matches
 * legacy Firebase signInWithPopup UX).
 *
 * Popup vs redirect is selected by the caller via the `?popup=1` query
 * param. The useAuth hook's `signInWithGoogle` sets it; email
 * confirmation links don't.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Body of the popup-mode response. Sends a postMessage to window.opener
 * (which the parent's signInWithGoogle is listening for) and closes
 * itself. JSON.stringify of strings is safe to inline; anything else
 * would need careful escaping.
 */
function popupHtml(status: 'ok' | 'error', payload: Record<string, string>): string {
  const messageJson = JSON.stringify({ __tela_oauth: true, status, ...payload });
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Signing in…</title></head>
<body style="background:#000;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<script>
(function () {
  try {
    if (window.opener) {
      window.opener.postMessage(${messageJson}, window.location.origin);
    }
  } catch (e) {
    console.error('[tela oauth popup] postMessage failed', e);
  }
  window.close();
  // If window.close() is rejected by the browser (e.g., the popup wasn't
  // opened by script and the user navigated here directly), leave a
  // visible message rather than a blank page.
  setTimeout(function () {
    document.body.innerHTML = '<p style="font-size:14px;opacity:.7">You can close this window.</p>';
  }, 200);
})();
</script>
<noscript>JavaScript is required to complete sign-in. Please enable it and try again.</noscript>
</body></html>`;
}

function popupResponse(status: 'ok' | 'error', payload: Record<string, string>): NextResponse {
  return new NextResponse(popupHtml(status, payload), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';
  const isPopup = url.searchParams.get('popup') === '1';

  const errorRedirect = (msg: string) =>
    isPopup
      ? popupResponse('error', { message: msg })
      : NextResponse.redirect(
          new URL(`/?error=${encodeURIComponent(msg)}`, request.url),
        );

  if (!code) {
    return errorRedirect('missing_code');
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return errorRedirect(error.message);
  }

  if (isPopup) {
    return popupResponse('ok', { next });
  }
  return NextResponse.redirect(new URL(next, request.url));
}
