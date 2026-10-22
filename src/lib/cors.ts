// CORS allow-list for the /api/* routes (used by src/middleware.ts).
//
// Who legitimately calls these routes from a browser context:
//  - the web app itself (same-origin — never needs CORS, but its origin is
//    listed anyway so previews/aliases keep working),
//  - the native Capacitor shells, which are a static export calling the
//    deployed site cross-origin: `capacitor://localhost` (iOS) and
//    `https://localhost` (Android's default scheme), plus `ionic://localhost`
//    and `http://localhost` for older/alternate shell configs,
//  - local development (`http://localhost:<port>`).
// Anything else — a random website's script — gets no CORS headers, so the
// browser refuses to hand it the response. (Routes still authenticate with a
// Bearer token; CORS is defence in depth, not the access control.)
//
// Plain TypeScript, no Node APIs: this runs in the Edge runtime.

const EXACT_ORIGINS = new Set([
  'https://hub.delcargo.us',
  'https://delcargo-io.vercel.app', // previous production host, may still be bookmarked/linked
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost',
  'http://localhost',
]);

const PATTERN_ORIGINS: RegExp[] = [
  /^http:\/\/localhost:\d{2,5}$/,
  // Cloudflare Pages deployments of this project (production alias + per-commit previews).
  /^https:\/\/(?:[a-z0-9-]+\.)?hr-web-app\.pages\.dev$/,
];

export const CORS_ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
export const CORS_ALLOWED_HEADERS = 'Content-Type, Authorization';

/** The origin to echo back, or null if this origin isn't allowed. */
export function allowedOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null;
  if (EXACT_ORIGINS.has(origin)) return origin;
  return PATTERN_ORIGINS.some(re => re.test(origin)) ? origin : null;
}

/** CORS response headers for a request from `origin` (empty if not allowed). */
export function corsHeaders(origin: string | null | undefined): Record<string, string> {
  const allowed = allowedOrigin(origin);
  if (!allowed) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': CORS_ALLOWED_METHODS,
    'Access-Control-Allow-Headers': CORS_ALLOWED_HEADERS,
    Vary: 'Origin',
  };
}
