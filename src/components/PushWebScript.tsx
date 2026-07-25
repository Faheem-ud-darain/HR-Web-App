'use client';

// Loads OneSignal's browser Web Push SDK — only in an actual browser tab,
// never inside the native Android/iOS app shell (that uses the separate
// @onesignal/capacitor-plugin native SDK instead, wired up in src/lib/push.ts).
// Rendering this on native would just be a wasted network request in the
// webview, since initWeb() in src/lib/push.ts never runs there anyway.

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { Capacitor } from '@capacitor/core';
import { isPushConfigured } from '@/lib/push';

export function PushWebScript() {
  const [showScript, setShowScript] = useState(false);

  useEffect(() => {
    setShowScript(!Capacitor.isNativePlatform() && isPushConfigured());
  }, []);

  if (!showScript) return null;

  return (
    <Script
      src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
      strategy="afterInteractive"
      async
    />
  );
}
