// Thin wrapper around the browser session-identity storage used across the
// dashboard. Login (src/app/auth/page.tsx) writes here via setSession();
// every other page that needs "who is logged in" should read through
// getSessionEmail()/getSessionRole() instead of hitting localStorage
// directly, so the "Remember me" checkbox on the login screen actually has
// an effect everywhere, not just at the moment of logging in.
//
// Remember me checked   -> localStorage   (survives closing the browser)
// Remember me unchecked -> sessionStorage (cleared when the tab/browser closes)
//
// IMPORTANT: this never stores the password, only "who is signed in" (email
// + role + a session token) — logging back in still always requires the
// real password. "Remember me" means "skip the login screen and land
// straight on the dashboard", not "pre-fill the email/password fields" —
// there's no autofill feature here, by design (storing a plaintext password
// anywhere client-side, even for a "convenience" autofill, would be a real
// security regression for an app holding employee PII).
//
// On native (Capacitor Android/iOS), plain localStorage turned out to be
// less durable than expected — it's WebView-backed storage, which some
// Android versions/OEMs are more willing to evict under storage pressure
// than they are actual app data, which is what caused "remember me" to
// silently stop working after fully closing and reopening the app even
// though the code here was already correct. `@capacitor/preferences` is
// backed by real native storage (SharedPreferences on Android, UserDefaults
// on iOS) instead, so every write mirrors into it as a durability backup,
// and hydrateSessionFromNativeStorage() (called once at app boot, see
// (dashboard)/layout.tsx) restores localStorage from it if the WebView
// copy went missing. On web, @capacitor/preferences' own implementation is
// just localStorage under a different key, so this mirroring is a
// harmless no-op there.

import { Capacitor } from '@capacitor/core';

const EMAIL_KEY = 'user_email';
const ROLE_KEY = 'user_role';
const TOKEN_KEY = 'session_token';

// Single source of truth for "what roles actually exist" — every place that
// reads a stored role (root page, auth page, dashboard layout) validates
// against this instead of trusting whatever string happens to be sitting in
// storage. A stale/corrupted value (e.g. from an old build, or storage
// tampering) should fall back to "not logged in", never get treated as a
// live session and routed somewhere that doesn't exist.
export const VALID_ROLES = ['admin', 'hr', 'employee', 'team_lead'] as const;
export type SessionRole = typeof VALID_ROLES[number];

export function isValidRole(role: string | null): role is SessionRole {
  return !!role && (VALID_ROLES as readonly string[]).includes(role);
}

// team_lead accounts share the employee dashboard (see auth/page.tsx and
// (dashboard)/layout.tsx) — there is no /team_lead route. Anything that
// needs to turn a role into a URL segment or a section-membership check
// should go through this instead of comparing the raw role string, so a
// team_lead never gets redirected at a route that doesn't exist.
export function dashboardSectionForRole(role: SessionRole): 'admin' | 'hr' | 'employee' {
  return role === 'team_lead' ? 'employee' : role;
}

async function mirrorToNativePreferences(email: string | null, role: string | null, token: string | null): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    if (email === null) {
      await Promise.all([
        Preferences.remove({ key: EMAIL_KEY }),
        Preferences.remove({ key: ROLE_KEY }),
        Preferences.remove({ key: TOKEN_KEY }),
      ]);
      console.log('[session] cleared native Preferences mirror');
    } else {
      await Promise.all([
        Preferences.set({ key: EMAIL_KEY, value: email }),
        Preferences.set({ key: ROLE_KEY, value: role || '' }),
        token ? Preferences.set({ key: TOKEN_KEY, value: token }) : Preferences.remove({ key: TOKEN_KEY }),
      ]);
      // Read straight back after writing — confirms the native round-trip
      // actually landed, rather than just trusting the `set()` promises
      // resolved. If this ever logs a mismatch, the plugin call itself is
      // silently lying about success.
      const [{ value: checkEmail }, { value: checkRole }] = await Promise.all([
        Preferences.get({ key: EMAIL_KEY }),
        Preferences.get({ key: ROLE_KEY }),
      ]);
      console.log('[session] wrote native Preferences mirror, verified read-back:', { checkEmail, checkRole });
    }
  } catch (err) {
    // Best-effort mirror only — localStorage/sessionStorage (already
    // written synchronously above/below) remain the source of truth for
    // the rest of this running session regardless of whether this succeeds.
    console.error('[session] Preferences mirror failed:', err);
  }
}

export async function setSession(email: string, role: string, remember: boolean, sessionToken?: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const cleanEmail = (email || '').toLowerCase().trim();

  // Always persist in localStorage so sessions survive tab closes, page refreshes, and app restarts
  window.localStorage.setItem(EMAIL_KEY, cleanEmail);
  window.localStorage.setItem(ROLE_KEY, role);
  if (sessionToken) window.localStorage.setItem(TOKEN_KEY, sessionToken);
  else window.localStorage.removeItem(TOKEN_KEY);

  // Clear any temporary copies from sessionStorage
  window.sessionStorage.removeItem(EMAIL_KEY);
  window.sessionStorage.removeItem(ROLE_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);

  await mirrorToNativePreferences(cleanEmail, role, sessionToken || null);
}

// Call once at app boot, before anything reads getSessionEmail()/
// getSessionRole() — restores localStorage from native Preferences if the
// WebView's own copy is missing (see the big comment above). No-op on web
// and a no-op if localStorage already has a session (the common case on
// every load after the first).
export async function hydrateSessionFromNativeStorage(): Promise<void> {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;

  // Previously this bailed out entirely the moment EMAIL_KEY alone was
  // present in localStorage, on the assumption that meant "the whole
  // session survived, nothing to restore." That's wrong if only *some* of
  // the three keys made it through whatever wiped WebView storage — e.g.
  // email present but role/token gone — since the early return meant the
  // missing keys never got recovered from Preferences even though they
  // were sitting right there. Every key is now checked and restored
  // independently instead of gating on just one of them.
  const hasEmail = !!window.localStorage.getItem(EMAIL_KEY);
  const hasRole = !!window.localStorage.getItem(ROLE_KEY);
  const hasToken = !!window.localStorage.getItem(TOKEN_KEY);
  if (hasEmail && hasRole) return; // token is optional (predates single-session enforcement)

  try {
    const { Preferences } = await import('@capacitor/preferences');
    const [{ value: email }, { value: role }, { value: token }] = await Promise.all([
      Preferences.get({ key: EMAIL_KEY }),
      Preferences.get({ key: ROLE_KEY }),
      Preferences.get({ key: TOKEN_KEY }),
    ]);
    if (!hasEmail && email) window.localStorage.setItem(EMAIL_KEY, email);
    if (!hasRole && role) window.localStorage.setItem(ROLE_KEY, role);
    if (!hasToken && token) window.localStorage.setItem(TOKEN_KEY, token);
  } catch (err) {
    console.error('[session] Preferences hydration failed:', err);
  }
}

export function getSessionEmail(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(EMAIL_KEY) || window.sessionStorage.getItem(EMAIL_KEY);
}

export function getSessionRole(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ROLE_KEY) || window.sessionStorage.getItem(ROLE_KEY);
}

// Random per-login token used to enforce "one active session" for Employee
// (and Team Lead) accounts — see hrActions.claimUserSession/touchUserSession
// in hrData.ts. Not used for Admin/HR, who may be signed in from multiple
// places at once.
export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY) || window.sessionStorage.getItem(TOKEN_KEY);
}

export function generateSessionToken(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// Best-effort human-readable "which browser/device" label, shown to a user
// who gets blocked from logging in because another session is still live —
// mirrors the tracker agent's own device_label concept (agent_gui.py).
export function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'another device';
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return [browser, os].filter(Boolean).join(' on ') || 'another device';
}

// Separate from the main session on purpose: this survives an explicit
// logout (clearSession doesn't touch it), so the email field on the login
// screen can still be pre-filled next time even after signing out — never
// the password, only the email (see the big comment at the top of this
// file for why password autofill isn't offered here). Always in
// localStorage regardless of "Remember me", since pre-filling an email
// field is not itself a "stay signed in" decision.
const REMEMBERED_EMAIL_KEY = 'remembered_login_email';

const DEVICE_ID_KEY = 'device_id';

// Stable per-install identifier for the "Logged-in Devices" list on the
// Profile page (see UserSessionSlot/claimUserSessionSlot in hrData.ts).
// Unlike the session token above (regenerated every login), this persists
// across logging out and back in on the same browser/app install, so doing
// that is recognized as the SAME device slot — not a new one that would
// eat into the 2-device limit. Mirrored to native Preferences for the same
// WebView-storage-eviction durability reason as the rest of this file (see
// the big comment at the top) — without this, an Android storage wipe
// would silently mint a "new device" identity every time.
export async function getOrCreateDeviceId(): Promise<string> {
  if (typeof window === 'undefined') return '';
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  if (Capacitor.isNativePlatform()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const { value } = await Preferences.get({ key: DEVICE_ID_KEY });
      if (value) {
        window.localStorage.setItem(DEVICE_ID_KEY, value);
        return value;
      }
    } catch { /* fall through to generating a fresh one */ }
  }

  const id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(DEVICE_ID_KEY, id);
  if (Capacitor.isNativePlatform()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key: DEVICE_ID_KEY, value: id });
    } catch { /* best-effort — worst case this ID isn't durable across a WebView storage wipe */ }
  }
  return id;
}

export function getRememberedEmail(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(REMEMBERED_EMAIL_KEY) || '';
}

export function setRememberedEmail(email: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
}

export function clearRememberedEmail(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(EMAIL_KEY);
  window.localStorage.removeItem(ROLE_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(EMAIL_KEY);
  window.sessionStorage.removeItem(ROLE_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);
  mirrorToNativePreferences(null, null, null);
}
