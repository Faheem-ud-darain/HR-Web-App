import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.delcargo.internal',
  appName: 'Delcargo Internal',
  // Matches next.config.ts's `output: 'export'` build output — `next build`
  // writes the static site into `out/`, which Capacitor then bundles into
  // the native app as its local web content.
  webDir: 'out',
  // The app now talks to PocketBase over HTTPS at pb.delcargo.us (see
  // src/lib/pocketbase.ts) instead of a bare HTTP IP, so the cleartext
  // exception this used to need (cleartext: true, androidScheme: 'http' —
  // plus the matching AndroidManifest.xml usesCleartextTraffic and Info.plist
  // NSAllowsArbitraryLoads entries, both removed) is gone. Capacitor's
  // default androidScheme is already 'https', so no server block is needed
  // at all.
  //
  // IMPORTANT: don't build/ship this until pb.delcargo.us is actually live
  // with a valid HTTPS certificate — see the PocketBase HTTPS migration
  // notes. Until then the app has no way to reach PocketBase at all.

  android: {
    // Required by @capgo/background-geolocation (see
    // src/lib/backgroundGeolocation.ts) — without this, Android silently
    // stops delivering location updates to the WebView bridge ~5 minutes
    // after the app is backgrounded, which would make USA employees'
    // auto clock-out stop working exactly when it matters most (after
    // they've left and closed the app). See
    // https://github.com/capacitor-community/background-geolocation/issues/89.
    useLegacyBridge: true,
  },

  plugins: {
    // Native splash screen — this is only the "before the JS engine has
    // even booted" placeholder (a single static image, `@drawable/splash`
    // on Android / the Splash.imageset on iOS — see
    // Notes/SPLASH_AND_ICON_SETUP.md). That image is the real "DC HUB"
    // navy/gold app icon (resources/icon.png), not the old orange
    // SplashIcon.png — so backgroundColor here has to be the matching navy,
    // not brand orange, or there'd be a visible flash from navy → orange the
    // instant this native layer paints. SplashScreenOverlay.tsx's own
    // background now uses this same navy tone so the handoff into its
    // animated "DC" mark is invisible.
    //
    // launchAutoHide: false is the important part — it means the native
    // splash stays on screen until SplashScreenOverlay.tsx explicitly calls
    // SplashScreen.hide() once the JS splash's own entrance animation has
    // started, instead of Capacitor auto-hiding it the instant the webview
    // is ready (which is what causes the "flash of unstyled app" a lot of
    // Capacitor apps have before their real UI has laid out).
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#0B0F1A',
      androidScaleType: 'CENTER_INSIDE',
      splashFullScreen: true,
      splashImmersive: true,
      showSpinner: false,
    },

    // iOS notch/Dynamic Island fix (the header-under-status-bar bug):
    // Capacitor's WKWebView already draws edge-to-edge under the status bar
    // once viewport-fit=cover is set (see layout.tsx), which is what lets
    // env(safe-area-inset-top) resolve to a real value for .pt-safe
    // (globals.css) to push header content below the notch/status bar. But
    // that only fully works with the icons/clock visible and correctly
    // colored if we also explicitly claim the overlay here and set an icon
    // style — otherwise iOS can fall back to whatever default it likes,
    // which is exactly the "under the status bar" symptom on some iOS
    // versions/devices. `overlaysWebView: true` matches the edge-to-edge
    // webview; `style: 'DARK'` renders dark status bar icons/text, which is
    // legible against TopNav's light/translucent background
    // (bg-white/85 backdrop-blur-md). See StatusBarInit in
    // SplashScreenOverlay.tsx for the JS-side call this config pairs with.
    // iOS notch/Dynamic Island status bar contrast fix:
    // Forces dark status bar icons/text (clock, battery, Wi-Fi) on white/light app backgrounds
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
    },

    // Android keyboard resize workaround: when `StatusBar.overlaysWebView`
    // is true (above), Android has a known bug where `adjustResize`
    // (set in AndroidManifest.xml) is silently ignored — the WebView
    // doesn't actually resize when the keyboard opens, so the keyboard
    // just covers the bottom of the screen with no layout response.
    // `resizeOnFullScreen: true` forces the Capacitor Keyboard plugin to
    // apply its own resize workaround on top of `adjustResize`, so both
    // modes work correctly. Without this, keyboard-aware layouts (tickets
    // reply bar, team chat input) sit under the keyboard instead of
    // scrolling above it.
    Keyboard: {
      resizeOnFullScreen: true,
    },
  },
};

export default config;
