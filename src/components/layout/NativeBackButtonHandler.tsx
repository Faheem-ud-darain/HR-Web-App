'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getModalCount } from '@/lib/modalStack';

let CapacitorApp: any = null;
if (typeof window !== 'undefined') {
  try {
    const { App } = require('@capacitor/app');
    CapacitorApp = App;
  } catch {
    // Web fallback
  }
}

export function useNativeBackButtonHandler() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!CapacitorApp) return;

    let listener: any = null;

    (async () => {
      listener = await CapacitorApp.addListener('backButton', (event: { canGoBack: boolean }) => {
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
