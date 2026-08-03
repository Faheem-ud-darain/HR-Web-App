// The native Capacitor build (Android/iOS) is a static export with no
// server of its own — it already talks to PocketBase directly at a
// hardcoded https://pb.delcargo.us for that reason (see src/lib/pocketbase.ts).
// Next.js API routes (e.g. /api/auth/forgot-password) have the same
// problem: a relative fetch('/api/...') resolves against nothing inside
// the native WebView, so native calls need the deployed site's absolute
// URL instead.
//
// Current production URL: https://delcargo-io.vercel.app (confirmed by the
// user on 2026-08-04). This is expected to move to a custom subdomain
// later — when that happens, set NEXT_PUBLIC_SITE_URL in the deployment
// env instead of editing this file, and rebuild the native apps so the
// new value gets baked into the static export.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://delcargo-io.vercel.app';

const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.();

// Prefix to use for same-app API route calls (Next.js API routes under
// src/app/api/**, NOT PocketBase — that still goes through `pb` from
// src/lib/pocketbase.ts). '' on web (relative fetch works fine through the
// same origin), SITE_URL on native.
export const API_BASE = isNative ? SITE_URL : '';
