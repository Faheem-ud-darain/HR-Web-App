'use client';

import { useEffect, useState } from 'react';
import { isNativeMobileApp } from '@/lib/trackerSetup';

/**
 * Tracks the native keyboard height on Capacitor (iOS + Android) using the
 * @capacitor/keyboard plugin events.
 *
 * Returns `keyboardHeight` in CSS pixels (0 when the keyboard is hidden).
 *
 * Why this exists:
 * On Android with `StatusBar.overlaysWebView = true` (full-screen WebView),
 * `windowSoftInputMode="adjustResize"` in AndroidManifest.xml is silently
 * ignored — the viewport does NOT shrink when the keyboard opens. Instead
 * the keyboard just covers the bottom portion of the screen with no layout
 * response. `resizeOnFullScreen: true` in capacitor.config.ts fixes the
 * resize, but for `fixed inset-0` panels it still helps to know the exact
 * keyboard height so the panel can pad itself above the keyboard.
 *
 * On iOS, the keyboard slides up over the content. The plugin fires
 * `keyboardWillShow` with the keyboard height *before* the keyboard
 * animates in, so the UI can pre-adjust to avoid a jarring jump.
 *
 * On web (non-Capacitor), always returns 0 — no native keyboard events.
 */
export function useNativeKeyboard(): { keyboardHeight: number } {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    // Only register native listeners inside the Capacitor app — the plugin
    // doesn't exist in a regular browser, importing it there would throw.
    if (typeof window === 'undefined' || !isNativeMobileApp()) return;

    let willShowHandle: { remove: () => void } | null = null;
    let didHideHandle: { remove: () => void } | null = null;

    import('@capacitor/keyboard').then(({ Keyboard }) => {
      Keyboard.addListener('keyboardWillShow', (info) => {
        setKeyboardHeight(info.keyboardHeight);
      }).then((h) => { willShowHandle = h; });

      Keyboard.addListener('keyboardDidHide', () => {
        setKeyboardHeight(0);
      }).then((h) => { didHideHandle = h; });
    }).catch(() => {
      // Plugin unavailable (e.g. old Capacitor build without the plugin
      // registered) — fall back to 0, no keyboard tracking.
    });

    return () => {
      willShowHandle?.remove();
      didHideHandle?.remove();
    };
  }, []);

  return { keyboardHeight };
}
