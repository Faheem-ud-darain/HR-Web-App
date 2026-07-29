// Thin wrapper around location watching for the GPS auto clock-in/out
// geofence feature (see src/lib/geofence.ts and the USA-employee effect in
// (dashboard)/employee/page.tsx).
//
// On native (Capacitor iOS/Android), uses @capgo/background-geolocation so
// location updates — and therefore auto clock-in/out — keep working while
// the app is backgrounded or the screen is locked. This requires "Always"
// location authorization (see ios/App/App/Info.plist's
// NSLocationAlwaysAndWhenInUseUsageDescription) and, on Android,
// ACCESS_BACKGROUND_LOCATION (see AndroidManifest.xml — this permission has
// its own Play Console declaration-form requirement before publishing,
// unrelated to anything in this file).
//
// On plain web (the browser dashboard, not the native app), there is no
// browser API for background geolocation — that's a deliberate web-platform
// restriction, not something a library can work around — so this falls back
// to navigator.geolocation.watchPosition(), which only ever fires while the
// tab is open and in the foreground. Web users therefore only get automatic
// check-in/out while the dashboard tab is actually open; this matches the
// app's previous (pre-background-geolocation) behavior everywhere.
import { Capacitor } from '@capacitor/core';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface GeoWatchHandle {
  stop: () => void;
}

// `code` is 'UNSUPPORTED' | 'NOT_AUTHORIZED' | undefined — callers branch on
// this to decide which of the geoPermission states to show, same as before.
export type GeoErrorHandler = (message: string, code?: string) => void;

export async function watchLocation(
  onSuccess: (point: GeoPoint) => void,
  onError: GeoErrorHandler
): Promise<GeoWatchHandle> {
  if (Capacitor.isNativePlatform()) {
    const { BackgroundGeolocation } = await import('@capgo/background-geolocation');

    await BackgroundGeolocation.start(
      {
        // Defined => the plugin keeps delivering updates (and shows this
        // persistent Android notification) while backgrounded. Undefined
        // would silently limit updates to the foreground only, defeating
        // the whole point of using this plugin over navigator.geolocation.
        backgroundMessage: 'Tracking your location to automatically clock you in/out at your assigned warehouse.',
        backgroundTitle: 'Delcargo — Shift Tracking Active',
        requestPermissions: true,
        stale: false,
        // Meters the device must move before a new update fires — cuts
        // down on battery/update-spam versus a 0 (every possible update)
        // filter, while still being tight enough to catch a warehouse
        // entry/exit promptly (most warehouse geofence radii here are on
        // the order of 100m+ — see hr_warehouses.radius).
        distanceFilter: 25,
      },
      (location, error) => {
        if (error) {
          onError(error.message || 'Unable to determine your location.', error.code);
          return;
        }
        if (location) {
          onSuccess({ latitude: location.latitude, longitude: location.longitude });
        }
      }
    );

    return {
      stop: () => {
        BackgroundGeolocation.stop();
      },
    };
  }

  // Web fallback — foreground only, see file header comment.
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError('Geolocation is not supported in this browser.', 'UNSUPPORTED');
    return { stop: () => {} };
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => onSuccess({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
    (err) =>
      onError(
        err.message || 'Unable to determine your location.',
        err.code === err.PERMISSION_DENIED ? 'NOT_AUTHORIZED' : undefined
      ),
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
  );

  return {
    stop: () => navigator.geolocation.clearWatch(watchId),
  };
}
