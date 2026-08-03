# Building the iOS app from a fresh clone

## The mistake that causes the "out folder" error

`npx cap sync ios` copies whatever is in the `out/` folder into the native
iOS project as its web content. That folder is **only** created by a
Capacitor-flavored build — plain `npm run build` (just `next build`) does
**not** produce it, because `next.config.ts` only turns on
`output: 'export'` (the static-export mode that writes to `out/`) when the
`CAPACITOR_BUILD=true` environment variable is set. A plain `next build` is
what the *web* deployment (Vercel) uses, and it writes to `.next/`, not
`out/`.

So this sequence fails every time, on any machine, with an "out folder"
error from `cap sync`:

```bash
npm install
npm run build       # ❌ wrong command for native — never creates out/
npx cap sync ios     # fails — out/ doesn't exist
```

## The correct sequence

Always use the `cap:sync:ios` / `cap:ios` npm scripts instead of calling
`next build` and `cap sync` separately — they run the right build first:

```bash
git pull
npm install
npm run cap:ios        # builds for Capacitor, syncs, and opens Xcode
```

Or, if you don't want Xcode to open automatically:

```bash
npm run cap:sync:ios
npx cap open ios
```

`npm run cap:ios` / `npm run cap:sync:ios` both internally run
`scripts/build-for-capacitor.mjs` (via `npm run build:capacitor`) first,
which sets `CAPACITOR_BUILD=true` before calling `next build` — that's what
actually produces `out/` for `cap sync` to read.

## Full fresh-machine checklist (new Mac, first time)

```bash
git clone <repo-url> delcargo-hr
cd delcargo-hr
npm install
npm run cap:ios
```

`npm run cap:ios` handles the build + sync + opening Xcode in one step —
after that, just hit Run in Xcode with a signed development team selected
(Signing & Capabilities tab) and a device/simulator chosen.

If Xcode ever complains about CocoaPods being out of date, run once:

```bash
cd ios/App && pod install && cd ../..
```

then re-run `npm run cap:sync:ios`.

## Every time you pull new code afterward

```bash
git pull
npm install          # only strictly needed if package.json changed
npm run cap:sync:ios
npx cap open ios      # if Xcode isn't already open
```

Never run `npm run build` (plain) before working on the native app — that
command is for the Vercel web deployment only and will silently leave
`out/` empty or stale, which `cap sync` will not warn you about (see the
comment at the top of `scripts/build-for-capacitor.mjs` for the exact
failure mode this causes).
