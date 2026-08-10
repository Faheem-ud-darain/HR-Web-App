import PocketBase from 'pocketbase';

const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.();
// The native app has no server of its own to proxy through, so it must talk
// to PocketBase directly — now over HTTPS via pb.delcargo.us (Caddy reverse
// proxy in front of PocketBase on the droplet), instead of the old bare HTTP
// IP. That old setup required disabling Android/iOS's built-in HTTPS
// security checks app-wide just to allow this one insecure connection,
// which is why it's gone now — see capacitor.config.ts,
// AndroidManifest.xml, and Info.plist.
const PB_URL = isNative ? 'https://pb.delcargo.us' : '/api/pb';

export const pb = new PocketBase(PB_URL);

// Optional: Automatically disable auto-cancellation globally if requests are rapid
pb.autoCancellation(false);
