'use client';

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

// Custom branded launch animation for the native app (Android/iOS only —
// this renders nothing on the plain web/Vercel site, since there's no
// native splash screen to hand off from there and showing a full-screen
// orange takeover on every browser visit would just be annoying).
//
// How this hands off from the native splash screen (see
// capacitor.config.ts's SplashScreen plugin block and
// Notes/SPLASH_AND_ICON_SETUP.md for the native image itself):
//   1. Capacitor shows a single static image (brand orange + centered logo)
//      the instant the app launches, before the JS engine has even booted.
//      `launchAutoHide: false` keeps it on screen indefinitely.
//   2. Once React mounts, this component renders an *identical-looking*
//      full-screen overlay (same background color, same logo, centered the
//      same way) and immediately calls SplashScreen.hide() — because the
//      two look the same, that swap is invisible.
//   3. From there, everything is normal JS/CSS animation: the logo animates
//      in (.splash-logo-in, globals.css), holds briefly, then the whole
//      overlay animates out (.splash-overlay-out) and unmounts, revealing
//      the app underneath. This is the "custom in/out" part that Capacitor's
//      own splash screen config can't do on its own (it only supports a
//      static image and a linear fade).
const HOLD_MS = 550;
const EXIT_MS = 380;

type Phase = 'entering' | 'holding' | 'exiting' | 'hidden';

export function SplashScreenOverlay() {
  // null until we've checked the platform on the client — avoids a
  // server/client render mismatch (Capacitor.isNativePlatform() only means
  // anything in the browser).
  const [isNative, setIsNative] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>('entering');

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  useEffect(() => {
    if (!isNative) return;

    let holdTimer: ReturnType<typeof setTimeout>;
    let exitTimer: ReturnType<typeof setTimeout>;

    // Dynamic import: this native plugin should never end up in the plain
    // web bundle, same reasoning as OneSignal's native import in push.ts.
    import('@capacitor/splash-screen').then(({ SplashScreen }) => {
      SplashScreen.hide().catch(() => {
        // Best-effort — if this fails (e.g. plugin not yet synced into a
        // given build), the CSS overlay still runs and unmounts itself on
        // its own timers, it just won't have hidden the native layer
        // underneath first. Never block the app on this.
      });
    });

    holdTimer = setTimeout(() => setPhase('exiting'), HOLD_MS);
    exitTimer = setTimeout(() => setPhase('hidden'), HOLD_MS + EXIT_MS);

    return () => {
      clearTimeout(holdTimer);
      clearTimeout(exitTimer);
    };
  }, [isNative]);

  if (!isNative || phase === 'hidden') return null;

  return (
    <div
      className={`fixed inset-0 z-[999] flex items-center justify-center bg-orange-600 ${
        phase === 'exiting' ? 'splash-overlay-out' : ''
      }`}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- bundled local
          asset served from the native app's own www/out folder, not a
          remote image; next/image's optimizer isn't available in a static
          Capacitor export anyway. */}
      <img
        src="/SplashIcon.png"
        alt=""
        className="splash-logo-in w-24 h-24 select-none pointer-events-none"
        draggable={false}
      />
    </div>
  );
}
