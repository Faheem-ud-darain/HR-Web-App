// The native Capacitor build (Android/iOS) is a static export with no
// server of its own — it already talks to PocketBase directly at a
// hardcoded https://pb.delcargo.us for that reason (see src/lib/pocketbase.ts).
// Next.js API routes (e.g. /api/auth/forgot-password) have the same
// problem: a relative fetch('/api/...') resolves against nothing inside
// the native WebView, so native calls need the deployed site's absolute
// URL instead.
//
// Current production URL: https://hub.delcargo.us (moved off the old
// delcargo-io.vercel.app URL to a Cloudflare-hosted custom subdomain,
// 2026-08-20 — confirmed by the user). Bumped here AND the native apps
// need a rebuild for this to take effect, since this value is baked into
// the static export at build time, not read at runtime. If the host moves
// again, prefer setting NEXT_PUBLIC_SITE_URL in the deployment env over
// editing this file — then only a rebuild is needed, no code change.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.delcargo.us';

const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.();

// Prefix to use for same-app API route calls (Next.js API routes under
// src/app/api/**, NOT PocketBase — that still goes through `pb` from
// src/lib/pocketbase.ts). '' on web (relative fetch works fine through the
// same origin), SITE_URL on native.
export const API_BASE = isNative ? SITE_URL : '';
