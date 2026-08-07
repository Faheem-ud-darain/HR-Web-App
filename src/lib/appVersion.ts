// Single source of truth for the version numbers shown in the "App Version"
// card on Profile Settings (see AppVersionCard.tsx). These mirror the real
// version fields that live in each platform's own build config:
//   - web:     package.json -> "version"
//   - android: android/app/build.gradle -> defaultConfig.versionName
//   - ios:     ios/App/App.xcodeproj/project.pbxproj -> MARKETING_VERSION
//
// Those files aren't readable at runtime in a static-exported Capacitor
// build, so this is hand-maintained. IMPORTANT: whenever you bump a version
// in one of the files above, update the matching value here too, or this
// card will show stale numbers.
export const APP_VERSIONS = {
  web: '1.9',
  android: '1.9',
  ios: '1.9',
} as const;

export type AppPlatform = keyof typeof APP_VERSIONS;
