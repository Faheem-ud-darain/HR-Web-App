'use client';

import type { PbRow } from '@/lib/pbTypes';

// Lightweight, safe Haptic Feedback wrapper for Capacitor Native Apps (iOS/Android)
// Gracefully degrades on Web browsers without throwing errors.

let HapticsPlugin: PbRow | null = null;
let ImpactStyleEnum: PbRow | null = null;
let NotificationTypeEnum: PbRow | null = null;

if (typeof window !== 'undefined') {
  try {
    // Loaded lazily inside this guard on purpose (see NativeBackButtonHandler): a top-level
    // import would run native-plugin code during server rendering and in the web build.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Haptics, ImpactStyle, NotificationType } = require('@capacitor/haptics');
    HapticsPlugin = Haptics;
    ImpactStyleEnum = ImpactStyle;
    NotificationTypeEnum = NotificationType;
  } catch {
    // Fallback for Web/SSR
  }
}

// In a normal browser the plugin falls back to navigator.vibrate(), which Chrome refuses (and logs an error
// for) until the person has tapped the page, and which makes no sense on a desktop at all. Inside the native
// apps it always works.
function allowed(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.()) return true;
  return navigator.userActivation?.hasBeenActive === true && window.matchMedia('(pointer: coarse)').matches;
}

export const triggerHaptic = {
  // Light tap for button clicks, tab switches, toggles
  light: async () => {
    if (!HapticsPlugin || !allowed()) return;
    try {
      await HapticsPlugin.impact({ style: ImpactStyleEnum?.Light || 'LIGHT' });
    } catch { /* ignore */ }
  },

  // Medium tap for modal opens, dropdown selections, main actions
  medium: async () => {
    if (!HapticsPlugin || !allowed()) return;
    try {
      await HapticsPlugin.impact({ style: ImpactStyleEnum?.Medium || 'MEDIUM' });
    } catch { /* ignore */ }
  },

  // Heavy tap for important actions like clock-in / clock-out
  heavy: async () => {
    if (!HapticsPlugin || !allowed()) return;
    try {
      await HapticsPlugin.impact({ style: ImpactStyleEnum?.Heavy || 'HEAVY' });
    } catch { /* ignore */ }
  },

  // Success vibration pattern for form submissions, ticket resolution
  success: async () => {
    if (!HapticsPlugin || !allowed()) return;
    try {
      await HapticsPlugin.notification({ type: NotificationTypeEnum?.Success || 'SUCCESS' });
    } catch { /* ignore */ }
  },

  // Warning vibration pattern for warnings or deletions
  warning: async () => {
    if (!HapticsPlugin || !allowed()) return;
    try {
      await HapticsPlugin.notification({ type: NotificationTypeEnum?.Warning || 'WARNING' });
    } catch { /* ignore */ }
  },

  // Selection change feedback for tab switches
  selection: async () => {
    if (!HapticsPlugin || !allowed()) return;
    try {
      await HapticsPlugin.selectionStart();
      await HapticsPlugin.selectionChanged();
      await HapticsPlugin.selectionEnd();
    } catch { /* ignore */ }
  },
};
