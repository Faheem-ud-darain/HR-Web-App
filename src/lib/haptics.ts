'use client';

// Lightweight, safe Haptic Feedback wrapper for Capacitor Native Apps (iOS/Android)
// Gracefully degrades on Web browsers without throwing errors.

let HapticsPlugin: any = null;
let ImpactStyleEnum: any = null;
let NotificationTypeEnum: any = null;

if (typeof window !== 'undefined') {
  try {
    const { Haptics, ImpactStyle, NotificationType } = require('@capacitor/haptics');
    HapticsPlugin = Haptics;
    ImpactStyleEnum = ImpactStyle;
    NotificationTypeEnum = NotificationType;
  } catch {
    // Fallback for Web/SSR
  }
}

export const triggerHaptic = {
  // Light tap for button clicks, tab switches, toggles
  light: async () => {
    if (!HapticsPlugin) return;
    try {
      await HapticsPlugin.impact({ style: ImpactStyleEnum?.Light || 'LIGHT' });
    } catch { /* ignore */ }
  },

  // Medium tap for modal opens, dropdown selections, main actions
  medium: async () => {
    if (!HapticsPlugin) return;
    try {
      await HapticsPlugin.impact({ style: ImpactStyleEnum?.Medium || 'MEDIUM' });
    } catch { /* ignore */ }
  },

  // Heavy tap for important actions like clock-in / clock-out
  heavy: async () => {
    if (!HapticsPlugin) return;
    try {
      await HapticsPlugin.impact({ style: ImpactStyleEnum?.Heavy || 'HEAVY' });
    } catch { /* ignore */ }
  },

  // Success vibration pattern for form submissions, ticket resolution
  success: async () => {
    if (!HapticsPlugin) return;
    try {
      await HapticsPlugin.notification({ type: NotificationTypeEnum?.Success || 'SUCCESS' });
    } catch { /* ignore */ }
  },

  // Warning vibration pattern for warnings or deletions
  warning: async () => {
    if (!HapticsPlugin) return;
    try {
      await HapticsPlugin.notification({ type: NotificationTypeEnum?.Warning || 'WARNING' });
    } catch { /* ignore */ }
  },

  // Selection change feedback for tab switches
  selection: async () => {
    if (!HapticsPlugin) return;
    try {
      await HapticsPlugin.selectionStart();
      await HapticsPlugin.selectionChanged();
      await HapticsPlugin.selectionEnd();
    } catch { /* ignore */ }
  },
};
