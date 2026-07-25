'use client';

// ---------------------------------------------------------------------------
// OneSignal push notifications — the ONLY thing this app uses OneSignal for.
// No email, SMS, in-app messages, journeys, etc. Just push.
//
// Setup (one-time, done in your browser — not from this file):
//   1. Create a free OneSignal account + app at https://onesignal.com
//   2. Add an Android platform — needs your Firebase project's service
//      account JSON key (Firebase console → Project settings → Service
//      accounts → Generate new private key), uploaded to the OneSignal
//      dashboard, not added to this codebase.
//   3. Add an iOS platform (needs an Apple Push Notification key (.p8) from
//      your Apple Developer account — also added to the OneSignal dashboard).
//   4. Add a Web Push platform if you want browser notifications too.
//   5. Copy your "OneSignal App ID" from Settings → Keys & IDs and paste it
//      below, replacing ONESIGNAL_APP_ID.
//   6. Run `npm install @onesignal/capacitor-plugin` (adds the native SDK),
//      then `npx cap sync` for Android/iOS.
//   7. iOS also needs the "Push Notifications" capability enabled in Xcode
//      (ios/App/App.xcodeproj) — this is a one-click toggle in Xcode's
//      "Signing & Capabilities" tab, not something editable from here.
//
// See Notes/PUSH_NOTIFICATIONS_SETUP.md for the full walkthrough.
// ---------------------------------------------------------------------------

import { Capacitor } from '@capacitor/core';

// TODO: replace with your real OneSignal App ID (Settings → Keys & IDs).
// Typed explicitly as `string` (not left as a literal type) — once a real
// ID is filled in here, TypeScript would otherwise narrow it to that exact
// literal and flag the `!== 'YOUR_ONESIGNAL_APP_ID'` check below as an
// "always false" comparison, failing the build (exactly what happened the
// first time this was wired up).
export const ONESIGNAL_APP_ID: string = '429b20a0-defd-4807-badd-460ec334cf35';

// Exported (not just used internally) so PushWebScript.tsx can check this
// too, instead of re-doing the same comparison itself — single source of
// truth for "is push actually configured".
export const isPushConfigured = (): boolean => !!ONESIGNAL_APP_ID && ONESIGNAL_APP_ID !== 'YOUR_ONESIGNAL_APP_ID';

let initStarted = false;

/**
 * Initializes push notifications for whichever shell the app is currently
 * running in (native Android/iOS via Capacitor, or a plain browser tab),
 * and — if given — logs the device in to OneSignal under `externalId` (we
 * pass the signed-in user's email) so a specific employee can be targeted
 * by email from the OneSignal dashboard/API later, not just "everyone".
 *
 * Safe to call multiple times; only the first call actually initializes,
 * later calls just (re-)log in the given externalId.
 */
export async function initPush(externalId?: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!isPushConfigured()) {
    console.warn('[push] OneSignal App ID not set yet — see src/lib/push.ts. Skipping push init.');
    return;
  }

  if (initStarted) {
    if (externalId) await loginPush(externalId);
    return;
  }
  initStarted = true;

  try {
    if (Capacitor.isNativePlatform()) {
      await initNative(externalId);
    } else {
      initWeb(externalId);
    }
  } catch (err) {
    console.error('[push] Initialization failed:', err);
  }
}

async function initNative(externalId?: string): Promise<void> {
  // Dynamic import: this native SDK should never end up in the plain web
  // bundle, only in the Capacitor (Android/iOS) build.
  const { default: OneSignal, LogLevel } = await import('@onesignal/capacitor-plugin');

  OneSignal.Debug.setLogLevel(LogLevel.Warn);
  OneSignal.initialize(ONESIGNAL_APP_ID);
  if (externalId) OneSignal.login(externalId);

  // Shows the native "Allow Notifications?" system prompt. `false` = don't
  // fall back to iOS's silent "provisional" permission — we want an
  // explicit yes/no from the user.
  await OneSignal.Notifications.requestPermission(false);
}

function initWeb(externalId?: string): void {
  const w = window as any;
  w.OneSignalDeferred = w.OneSignalDeferred || [];
  w.OneSignalDeferred.push(async (OneSignal: any) => {
    await OneSignal.init({ appId: ONESIGNAL_APP_ID });
    if (externalId) await OneSignal.login(externalId);
    await OneSignal.Notifications.requestPermission();
  });
}

async function loginPush(externalId: string): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { default: OneSignal } = await import('@onesignal/capacitor-plugin');
      OneSignal.login(externalId);
    } else {
      const w = window as any;
      if (w.OneSignal?.login) {
        await w.OneSignal.login(externalId);
      } else {
        // Web SDK hasn't finished loading yet — queue it the same way
        // initWeb does.
        w.OneSignalDeferred = w.OneSignalDeferred || [];
        w.OneSignalDeferred.push((OneSignal: any) => OneSignal.login(externalId));
      }
    }
  } catch (err) {
    console.error('[push] Login failed:', err);
  }
}

/**
 * Call on logout so a shared device (e.g. a warehouse kiosk) doesn't keep
 * the previous employee's account linked to this device's push
 * subscription after they sign out.
 */
export async function logoutPush(): Promise<void> {
  if (typeof window === 'undefined' || !isPushConfigured()) return;
  try {
    if (Capacitor.isNativePlatform()) {
      const { default: OneSignal } = await import('@onesignal/capacitor-plugin');
      await OneSignal.logout();
    } else {
      const w = window as any;
      if (w.OneSignal?.logout) await w.OneSignal.logout();
    }
  } catch (err) {
    console.error('[push] Logout failed:', err);
  }
}
