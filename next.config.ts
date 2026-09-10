import type { NextConfig } from "next";

const isCapacitor = process.env.CAPACITOR_BUILD?.trim() === 'true';

const nextConfig: NextConfig = {
  output: isCapacitor ? 'export' : undefined,
  env: {
    // PocketBase now sits behind Caddy at pb.delcargo.us with a proper
    // HTTPS certificate, instead of the old bare-IP plain-HTTP address —
    // see src/lib/pocketbase.ts for why that mattered for the native app.
    // The web rewrite below is a server-to-server hop (Vercel → PocketBase)
    // so it was never a browser security issue, but pointing it at the
    // domain too means it keeps working even if the droplet's IP ever
    // changes — no redeploy needed, just a DNS update.
    NEXT_PUBLIC_PB_URL: 'https://pb.delcargo.us',
  },

  images: {
    unoptimized: isCapacitor,
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'pb.delcargo.us' },
      // Current production host (moved off Vercel to Cloudflare, 2026-08-20
      // — see src/lib/apiBase.ts). Kept the old Vercel hostname below too,
      // harmless to leave in, in case anything (old cached pages, old email
      // links) still references an image URL on that host.
      { protocol: 'https', hostname: 'hub.delcargo.us' },
      { protocol: 'https', hostname: 'delcargo-io.vercel.app' },
    ],
  },

  // Plan 013 step 4: standard security response headers, applied to every
  // route. Only meaningful for the real server build (isCapacitor's static
  // export has no server/headers mechanism at all — the native app shell
  // doesn't need these HTTP-level headers regardless).
  //
  // Audited what this app's browser bundle actually loads before writing
  // the CSP below (see plan 013's implementation notes for the full
  // audit): next/font/google self-hosts both fonts at build time (no
  // runtime request to fonts.googleapis.com/fonts.gstatic.com at all), so
  // no external font-src is needed. The only two things a browser tab
  // talks to outside its own origin are PocketBase (pb.delcargo.us — REST
  // + realtime SSE) and OneSignal's Web Push SDK (cdn.onesignal.com's
  // script, plus its own onesignal.com API calls and service worker).
  // Google OAuth / Resend email are server-to-server only (Next.js API
  // routes), never fetched from the browser bundle, so they don't need a
  // connect-src entry; meet.google.com/calendar.google.com are plain link
  // hrefs (full-page navigations), not XHR/fetch, so they're unaffected by
  // connect-src too.
  async headers() {
    if (isCapacitor) return [];

    const csp = [
      "default-src 'self'",
      // 'unsafe-inline' is a deliberate starting point, not a final state
      // — Next.js's own hydration bootstrap and this app's inline
      // Tailwind-driven styles both rely on it, and switching to a
      // nonce/hash-based policy is a larger follow-up pass of its own
      // (flagged in plan 013 rather than rushed in here blind). 'self' +
      // OneSignal's CDN covers every actual <script> this app loads.
      // 'unsafe-eval' is dev-only — React's development build uses eval()
      // for its debugging/call-stack features (confirmed live: without
      // this, `next dev` logs "eval() is not supported... make sure
      // unsafe-eval is included"); React's own docs note it never uses
      // eval() in production, so the real deployed build never needs it.
      `script-src 'self' 'unsafe-inline' https://cdn.onesignal.com${process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      // data:/blob: cover this app's many inline/base64 avatars, cropper
      // output, and document/screenshot previews (see AvatarCropperModal,
      // DocumentPreviewModal, TrackingView, etc.) — none of those are a
      // real external host, just how the browser already renders
      // in-memory/uploaded image data.
      "img-src 'self' data: blob: https://pb.delcargo.us https://hub.delcargo.us",
      "font-src 'self' data:",
      // PocketBase (REST + its realtime SSE subscriptions) and OneSignal's
      // own API/service-worker traffic are the only non-self network
      // destinations this app's browser code actually calls.
      "connect-src 'self' https://pb.delcargo.us https://onesignal.com https://*.onesignal.com",
      "worker-src 'self' https://cdn.onesignal.com",
      "media-src 'self' blob:",
      // Equivalent to X-Frame-Options: DENY, expressed the modern way —
      // kept both below since X-Frame-Options is still honored by a few
      // older embedded webviews CSP's frame-ancestors doesn't reach.
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
  /* config options here */
};

export default nextConfig;
