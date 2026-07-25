# Splash screen + app icon — setup guide

Code side is done (see "What's already done" below). What's left is
generating the actual native image files for Android/iOS from
`SplashIcon.png` and `AppIcon.png` (both already in this repo's root) —
that's a build-time asset-generation step, not something editable from
inside this codebase directly.

## 1. Copy the source images into `public/`

The custom JS splash animation (`SplashScreenOverlay.tsx`) shows
`SplashIcon.png` as a normal bundled web asset, so it needs to live in
`public/` (same as `AppIcon.png` already does, for the push notification
large icon):

1. Copy `SplashIcon.png` from the project root into `public/SplashIcon.png`.

## 2. Install the two Capacitor packages

```
npm install
```

This pulls in `@capacitor/splash-screen` (already added to
`package.json`) — the runtime plugin `SplashScreenOverlay.tsx` calls to
hide the native splash at the right moment.

Then, for generating the actual icon/splash image files (a separate,
one-time dev tool, not a runtime dependency):

```
npm install @capacitor/assets --save-dev
```

## 3. Generate the native icon + splash images

Create an `assets/` folder in the project root (if it doesn't exist) with:

- `assets/icon.png` — copy of `AppIcon.png` (already 256×256, already has
  its brand-orange background baked in).
- `assets/splash.png` — copy of `SplashIcon.png` (transparent logo — the
  tool composites it onto the background color below).

Then run:

```
npx capacitor-assets generate --android --ios --iconBackgroundColor "#EA580C" --iconBackgroundColorDark "#EA580C" --splashBackgroundColor "#EA580C" --splashBackgroundColorDark "#EA580C"
```

This overwrites, for **Android**: every `mipmap-*/ic_launcher*.png`
(legacy + adaptive icon) and every `drawable-*/splash.png` density/orientation
variant. For **iOS** (once that platform's actually being built —
`ios/App/App/Assets.xcassets` already exists in this repo from an earlier
`npx cap add ios`): `AppIcon.appiconset` (1024×1024 App Store icon) and
`Splash.imageset` (2732×2732 launch image).

**Two honesty flags, not guaranteed problems, just worth checking:**

- `AppIcon.png` is 256×256. That's fine for how small Android actually
  renders a launcher icon on-device, but Apple's App Store listing wants a
  crisp 1024×1024 source — this will get upscaled to that size, which may
  look slightly soft blown up large (e.g. in Settings or a big App Store
  preview). Works fine for now/dev builds; worth revisiting with a
  higher-res master before an actual App Store submission.
- Same caveat for `SplashIcon.png` scaled up to iOS's 2732×2732 splash
  canvas, if its source resolution is small — I haven't checked its exact
  pixel dimensions.

## 4. Sync and rebuild

```
$env:CAPACITOR_BUILD="true"; npm run build; npx cap sync android
cd android
./gradlew assembleDebug
```

(Add `npx cap sync ios` / open in Xcode the same way, once you're ready to
test the iOS build.)

## What's already done (code side)

- **`capacitor.config.ts`** — added a `SplashScreen` plugin block:
  brand-orange (`#EA580C`) background, `launchAutoHide: false` (keeps the
  native splash on screen until the JS side explicitly hides it — see
  next point), no spinner.
- **`src/components/SplashScreenOverlay.tsx`** (new) — the actual custom
  in/out animation. Native-only (renders nothing on the plain web site —
  checked via `Capacitor.isNativePlatform()`). On mount it renders an
  overlay that looks identical to the native splash (same orange
  background, same centered logo) and immediately calls
  `SplashScreen.hide()`, so the native→JS handoff is invisible. From there
  it's pure CSS: the logo scales+fades in (520ms, the same
  `--ease-out-snappy` curve used everywhere else in this app), holds
  ~550ms, then the whole overlay scales+fades out (380ms, a mirrored
  ease-in curve) and unmounts, revealing the real app underneath.
  Respects `prefers-reduced-motion` (see `globals.css`).
- **`globals.css`** — `.splash-logo-in` / `.splash-overlay-out` keyframes,
  following this file's existing animation conventions exactly (same
  pattern as `.dialog-enter`, `.page-enter`, etc.).
- **`src/app/layout.tsx`** — mounts `<SplashScreenOverlay />`.

Nothing above requires the native image files to exist to compile/run —
if you skip steps 1-3, the app will just show whatever the *current*
placeholder `@drawable/splash` and `mipmap/ic_launcher*` files are (the
default Capacitor template graphics) underneath the correctly-animated JS
overlay, until you regenerate them.
