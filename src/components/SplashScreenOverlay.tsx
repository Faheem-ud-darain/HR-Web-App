'use client';

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

// Branded launch animation, shown once per app boot on every platform
// (native Android/iOS *and* the plain web/Vercel site). It renders
// unconditionally from the very first paint (including the static-exported
// HTML itself, before any JS has run) so there's no blank-white-page flash
// while fonts/data/hydration catch up — then animates itself out on a fixed
// timer a moment later. Because this component lives in the root layout
// (src/app/layout.tsx), it only mounts once per hard page load, not on
// every client-side route change within the app.
//
// This is a hand-drawn recreation of the actual "DC HUB" app icon
// (resources/icon.png / the Android launcher icon), built as inline SVG
// instead of a static image so each piece — the speech-bubble outline, the
// two letters, the tail, the "Employee Portal" label, the "by DelCargo" mark
// below it — can animate in as
// its own tailored step instead of one generic image fade+scale. This
// replaces the old design, which used a completely different (unrelated,
// orange) icon that didn't match the app's real navy/gold identity at all.
//
// How this hands off from the *native* splash screen specifically (see
// capacitor.config.ts's SplashScreen plugin block and
// Notes/SPLASH_AND_ICON_SETUP.md for the native image itself):
//   1. Capacitor shows a single static image (the same navy/gold "DC HUB"
//      mark, background color matched in capacitor.config.ts) the instant
//      the app launches, before the JS engine has even booted.
//      `launchAutoHide: false` keeps it on screen indefinitely.
//   2. Once React mounts, this component's overlay (identical navy
//      background underneath it) triggers SplashScreen.hide() — because the
//      two look the same at that instant (bubble not yet drawn), that swap
//      is invisible.
//   3. From there, everything is custom JS/CSS animation: the speech-bubble
//      outline draws itself in (stroke animation, not a fade), the tail pops
//      in, "D" then "C" pop in with a slight spring overshoot, then
//      "Employee Portal" and "by DelCargo" each focus in in turn from
//      wide/faded letter-spacing to settled, then after a hold the whole
//      overlay releases (fades + drifts up) to reveal the app. This is the
//      "custom, tailored" part a static image + linear fade can't do.
//
// On plain web, steps 2/3 are identical minus the native plugin calls —
// same overlay, same timings, just without anything to hand off from.
const HOLD_MS = 2080; // must clear the "by DelCargo" line's own delay+duration below
const EXIT_MS = 420;

type Phase = 'entering' | 'exiting' | 'hidden';

export function SplashScreenOverlay() {
  // Deliberately starts as 'entering' on every platform (not gated behind
  // an "is this native?" check resolved after mount) — that's what makes
  // it show up in the very first paint on web instead of only appearing
  // after a client-side effect runs.
  const [phase, setPhase] = useState<Phase>('entering');

  useEffect(() => {
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
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

      // iOS status bar setup — pairs with the StatusBar plugin block in
      // capacitor.config.ts. Belt-and-suspenders alongside
      // viewport-fit=cover (layout.tsx) + .pt-safe (globals.css): this
      // explicitly tells iOS the webview owns the area under the status bar
      // (overlay, not push-down) and forces dark icons so they stay legible
      // over TopNav's light, translucent background. No-op on Android
      // (status bar there is already handled by the OS theme) and on web.
      // If this plugin isn't in the installed build yet (not synced), it
      // just fails silently — the existing CSS safe-area handling still
      // applies on its own.
      import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
        StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
        // Style.Dark in Capacitor means "dark content / dark icons" (for light backgrounds)
        // Style.Light in Capacitor means "light content / white icons" (for dark backgrounds)
        StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      }).catch(() => {
        // Plugin not installed/synced into this build yet — safe to ignore.
      });
    }

    const holdTimer = setTimeout(() => setPhase('exiting'), HOLD_MS);
    const exitTimer = setTimeout(() => setPhase('hidden'), HOLD_MS + EXIT_MS);

    return () => {
      clearTimeout(holdTimer);
      clearTimeout(exitTimer);
    };
  }, []);

  if (phase === 'hidden') return null;

  return (
    <div
      className={`fixed inset-0 z-[var(--z-splash)] flex flex-col items-center justify-center gap-5 ${
        phase === 'exiting' ? 'splash-overlay-out' : ''
      }`}
      // Matches capacitor.config.ts's SplashScreen.backgroundColor
      // (#0B0F1A) at the edges — the radial lift toward the center is what
      // makes the bubble read as "lit" rather than flat, same effect as the
      // source icon's own background treatment.
      style={{ background: 'radial-gradient(circle at 50% 42%, #141c33 0%, #0b0f1a 60%, #05070c 100%)' }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 200 170"
        className="w-36 h-36 sm:w-40 sm:h-40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="dcGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFE08A" />
            <stop offset="45%" stopColor="#FFC93C" />
            <stop offset="100%" stopColor="#F2A93B" />
          </linearGradient>
        </defs>

        {/* Speech-bubble outline — draws itself in via a stroke animation
            (pathLength=1 normalizes stroke-dasharray/dashoffset to simple
            0–1 units) instead of fading in as a flat shape. */}
        <rect
          x="14" y="14" width="172" height="108" rx="30"
          stroke="url(#dcGold)" strokeWidth="9"
          pathLength={1}
          className="splash-bubble-draw"
        />

        {/* Bubble tail */}
        <path
          d="M64 118 L54 152 L96 120 Z"
          fill="url(#dcGold)"
          className="splash-tail-in"
        />

        {/* "D" then "C" — pop in with a slight spring overshoot, staggered
            just after the bubble finishes drawing. Sized to fill more of the
            bubble's interior (up from fontSize 60) — x positions pulled in
            slightly so the two bigger glyphs stay centered as a pair instead
            of pushing toward the bubble's rounded corners. */}
        <text
          x="70" y="94" textAnchor="middle" fontSize="70" fontWeight={800}
          fill="#ffffff" fontFamily="var(--font-display), Arial, sans-serif"
          className="splash-letter splash-letter-d"
        >
          D
        </text>
        <text
          x="130" y="94" textAnchor="middle" fontSize="70" fontWeight={800}
          fill="url(#dcGold)" fontFamily="var(--font-display), Arial, sans-serif"
          className="splash-letter splash-letter-c"
        >
          C
        </text>
      </svg>

      {/* Text block below the mark — "Employee Portal" reads as the app's
          name/purpose (bigger, brighter), "by DelCargo" as a smaller
          attribution line underneath it, same relationship as a product name
          vs. its maker's mark. Grouped in its own tight-gap column so the two
          lines sit close to each other while still being a clear step below
          the icon above (the outer flex column's own gap-5). */}
      <div className="flex flex-col items-center gap-1.5">
        <p
          className="splash-title-in text-base sm:text-lg font-bold text-white"
          style={{ letterSpacing: '0.08em' }}
        >
          Employee Portal
        </p>
        <p
          className="splash-tagline-in text-[11px] font-semibold text-amber-200/90"
          style={{ letterSpacing: '0.12em' }}
        >
          by DelCargo
        </p>
      </div>
    </div>
  );
}
