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
    } else {
      await Promise.all([
        Preferences.set({ key: EMAIL_KEY, value: email }),
        Preferences.set({ key: ROLE_KEY, value: role || '' }),
        token ? Preferences.set({ key: TOKEN_KEY, value: token }) : Preferences.remove({ key: TOKEN_KEY }),
      ]);
    }
  } catch (err) {
    // Best-effort mirror only — localStorage/sessionStorage (already
    // written synchronously above/below) remain the source of truth for
    // the rest of this running session regardless of whether this succeeds.
    console.error('[session] Preferences mirror failed:', err);
  }
}

export function setSession(email: string, role: string, remember: boolean, sessionToken?: string): void {
  if (typeof window === 'undefined') return;
  const primary = remember ? window.localStorage : window.sessionStorage;
  const other = remember ? window.sessionStorage : window.localStorage;
  primary.setItem(EMAIL_KEY, email);
  primary.setItem(ROLE_KEY, role);
  if (sessionToken) primary.setItem(TOKEN_KEY, sessionToken);
  else primary.removeItem(TOKEN_KEY);
  // Clear any stale copy left in the other storage — e.g. logging back in
  // without "Remember me" after a previous session had it checked.
  other.removeItem(EMAIL_KEY);
  other.removeItem(ROLE_KEY);
  other.removeItem(TOKEN_KEY);

  // Only mirror into durable native storage when "Remember me" was actually
  // checked — an unchecked session is meant to disappear when the app/tab
  // closes, native storage would defeat that.
  if (remember) {
    mirrorToNativePreferences(email, role, sessionToken || null);
  } else {
    mirrorToNativePreferences(null, null, null);
  }
}

// Call once at app boot, before anything reads getSessionEmail()/
// getSessionRole() — restores localStorage from native Preferences if the
// WebView's own copy is missing (see the big comment above). No-op on web
// and a no-op if localStorage already has a session (the common case on
// every load after the first).
export async function hydrateSessionFromNativeStorage(): Promise<void> {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;
  if (window.localStorage.getItem(EMAIL_KEY)) return; // already present, nothing to restore

  try {
    const { Preferences } = await import('@capacitor/preferences');
    const [{ value: email }, { value: role }, { value: token }] = await Promise.all([
      Preferences.get({ key: EMAIL_KEY }),
      Preferences.get({ key: ROLE_KEY }),
      Preferences.get({ key: TOKEN_KEY }),
    ]);
    if (email && role) {
      window.localStorage.setItem(EMAIL_KEY, email);
      window.localStorage.setItem(ROLE_KEY, role);
      if (token) window.localStorage.setItem(TOKEN_KEY, token);
    }
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
