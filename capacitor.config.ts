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

  plugins: {
    // Native splash screen — this is only the "before the JS engine has
    // even booted" placeholder (a single static image, `@drawable/splash`
    // on Android / the Splash.imageset on iOS — see
    // Notes/SPLASH_AND_ICON_SETUP.md for how to (re)generate those from
    // SplashIcon.png). It intentionally matches the brand orange + logo
    // that SplashScreenOverlay.tsx shows next, so the handoff between the
    // two is invisible.
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
      backgroundColor: '#EA580C',
      androidScaleType: 'CENTER_INSIDE',
      splashFullScreen: true,
      splashImmersive: true,
      showSpinner: false,
    },
  },
};

export default config;
