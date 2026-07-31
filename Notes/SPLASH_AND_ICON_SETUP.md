# Splash screen + app icon — setup guide

Code side is done for all three targets — native Android, native iOS, and
plain web (see "What's already done" below). What's left is copying a
handful of binary image files into `public/` — a manual step for whoever
has real filesystem/shell access, since an agent working from a repomix
export or a sandbox with no working shell (both have happened in this
repo's history) can't safely copy binary PNG/webp files without corrupting
them.

## 1. Copy the source images into `public/`

Run from the repo root (PowerShell):

```powershell
Copy-Item "SplashIcon.png" "public\SplashIcon.png"
New-Item -ItemType Directory -Force -Path "public\icons" | Out-Null
Copy-Item "icons\*.webp" "public\icons\"
```

- `SplashIcon.png` → `public/SplashIcon.png`: the custom JS splash
  animation (`SplashScreenOverlay.tsx`) shows this as a normal bundled web
  asset (`<img src="/SplashIcon.png">`), so it has to live under `public/`
  — same as `AppIcon.png` already does, for the push notification large
  icon. **This file was missing from `public/` even though
  `SplashScreenOverlay.tsx` already referenced it** — until it's copied,
  that `<img>` 404s (silently, since it's `aria-hidden` and has no visible
  broken-image fallback UI) on every native app launch and every web page
  load.
- `icons/*.webp` → `public/icons/`: the whole `icons/` folder at the repo
  root was never actually inside `public/`, so despite `manifest.webmanifest`
  referencing them, Next's static export never included them — they 404
  for anyone trying to install the site as a PWA. Fixed on the manifest
  side (see below); still needs these files physically copied in.

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
- **`src/app/layout.tsx`** — mounts `<SplashScreenOverlay />`, and now also
  sets `metadata.manifest`, `metadata.icons`, `metadata.appleWebApp`, and
  `viewport.themeColor` (brand orange, `#EA580C`). Previously
  `public/manifest.webmanifest` existed but nothing linked to it anywhere —
  no browser ever actually read it.
- **`public/manifest.webmanifest`** — fixed its icon paths (they pointed at
  `../icons/...`, which resolves outside `public/` and always 404s from a
  manifest served at `/manifest.webmanifest`; now `/icons/...`) and added
  `name`, `short_name`, `start_url`, `display: "standalone"`,
  `background_color`, and `theme_color`. These are what let Android/Chrome
  generate an install splash screen (composited from the manifest's name +
  background color + largest icon — there's no separate splash image to
  author for that path) when someone adds the site to their home screen.
- **Web boot splash** — `SplashScreenOverlay.tsx` no longer gates its
  render on "is this native" resolving after mount; it now shows
  unconditionally from first paint (including the pre-rendered static
  HTML itself) on **plain web too**, then fades out on the same fixed
  timers as native, giving the browser site a branded launch moment
  instead of a blank-page flash while fonts/data/hydration catch up. It
  still only mounts once per hard page load (not on client-side route
  changes), since it lives in the root layout.

Nothing above requires the native image files to exist to compile/run —
if you skip steps 1-3, the app will just show whatever the *current*
placeholder `@drawable/splash` and `mipmap/ic_launcher*` files are (the
default Capacitor template graphics) underneath the correctly-animated JS
overlay, until you regenerate them. The web boot splash and PWA install
splash, though, need `SplashIcon.png` / `icons/*.webp` actually copied into
`public/` (step 1 above) to show a real logo instead of a broken image.
