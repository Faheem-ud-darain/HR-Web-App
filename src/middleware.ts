import { NextRequest, NextResponse } from 'next/server';

// CORS for every /api/* route — added 2026-08-20 after the iOS Xcode
// simulator build couldn't log in.
//
// Root cause: the native Capacitor app is a static export with no server of
// its own, so it calls the deployed site's absolute URL for login/
// password-reset/etc. (see src/lib/apiBase.ts — API_BASE resolves to the
// production host, currently https://hub.delcargo.us, on native; '' on
// web). That means every one of those fetch() calls from the app is
// CROSS-ORIGIN: the request's Origin is `capacitor://localhost` (iOS) or
// `https://localhost` (Android, see capacitor.config.ts's default
// androidScheme), never the production host itself.
// None of the route handlers under src/app/api/** ever set an
// Access-Control-Allow-Origin header or handled the OPTIONS preflight POST
// with a JSON body triggers, so WKWebView's fetch — which enforces CORS
// exactly like desktop Safari — silently discarded the response. The
// server-side login logic in src/app/api/auth/login/route.ts was actually
// running and returning a valid 200 the whole time; the browser layer in
// the WebView just refused to hand the JS code that response, which surfaced
// in the UI as the generic "An error occurred while logging in." catch
// block in src/app/auth/page.tsx. This never showed up in web testing
// because the web build's fetch('/api/auth/login') is same-origin and never
// triggers CORS at all.
//
// Fixed centrally here (rather than in each of the 8 route.ts files under
// src/app/api/**) so no individual route can regress this by omission.
// Access-Control-Allow-Origin: '*' is safe for these routes specifically —
// none of them rely on cookies (`credentials: 'include'`); the client sends
// email/password or a Bearer token in the request body/header instead (see
// src/lib/session.ts's AUTH_TOKEN_KEY) — so there's no session-fixation risk
// from allowing any origin to read the JSON response.
const ALLOWED_HEADERS = 'Content-Type, Authorization';
const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';

export function middleware(request: NextRequest) {
  // Preflight — browsers (including WKWebView) send this automatically
  // ahead of any POST with a JSON body before the real request, and expect
  // a 2xx with these headers back before they'll even attempt the real one.
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': ALLOWED_METHODS,
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Every other /api/* request — let it reach its route handler as normal,
  // then stamp the same CORS headers onto whatever that handler returns.
  const response = NextResponse.next();
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
  response.headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
