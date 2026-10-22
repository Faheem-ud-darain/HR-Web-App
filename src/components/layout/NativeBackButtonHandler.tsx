'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getModalCount } from '@/lib/modalStack';
import type { PbRow } from '@/lib/pbTypes';

let CapacitorApp: PbRow | null = null;
let CapacitorKeyboard: PbRow | null = null;

if (typeof window !== 'undefined') {
  try {
    // Loaded lazily inside this guard on purpose: server rendering and the plain web build
    // must never evaluate native-plugin code, which a top-level import would do.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { App } = require('@capacitor/app');
    CapacitorApp = App;
  } catch { /* Web fallback */ }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Keyboard } = require('@capacitor/keyboard');
    CapacitorKeyboard = Keyboard;
  } catch { /* Web fallback */ }
}

export function useNativeBackButtonHandler() {
  const router = useRouter();
  const pathname = usePathname();

  // Keyboard avoidance & active input scroll into view
  useEffect(() => {
    if (!CapacitorKeyboard) return;

    let showListener: PbRow | null = null;

    (async () => {
      try {
        CapacitorKeyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => {});
        CapacitorKeyboard.setScroll({ isDisabled: false }).catch(() => {});
        
        showListener = await CapacitorKeyboard.addListener('keyboardDidShow', () => {
          const activeEl = document.activeElement as HTMLElement;
          if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
            setTimeout(() => {
              activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
          }
        });
      } catch {
        // Fallback for web
      }
    })();

    return () => {
      if (showListener && typeof showListener.remove === 'function') {
        showListener.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (!CapacitorApp) return;

    let listener: PbRow | null = null;

    (async () => {
      listener = await CapacitorApp.addListener('backButton', () => {
        // Priority 1: Close open Modal / Sheet overlay
        if (getModalCount() > 0) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
          return;
        }

        // Priority 2: Navigate back if in a sub-view
        const rootPaths = ['/admin', '/hr', '/employee', '/auth', '/'];
        const isRootTab = rootPaths.includes(pathname);

        if (!isRootTab) {
          router.back();
        } else {
          // Minimize / Exit app when pressing back on main dashboard tabs
          CapacitorApp.minimizeApp();
        }
      });
    })();

    return () => {
      if (listener && typeof listener.remove === 'function') {
        listener.remove();
      }
    };
  }, [router, pathname]);
}

export function NativeBackButtonHandler() {
  useNativeBackButtonHandler();
  return null;
}
