// Shared helpers for the DelCargo Tracker desktop agent's one-time setup
// code — used by both the HR/Admin Setup Agent modal (TrackingView.tsx)
// and the employee self-service setup card (employee/tracker/page.tsx), so
// the encoding logic only lives in one place.
//
// Format must stay in sync with decode_setup_code() in
// tracker-agent/agent_gui.py: base64url of JSON {"u": pocketbaseUrl,
// "t": agentToken}. The old "k" (Supabase anon key) field has been removed;
// PocketBase's public collections require no API key for reads/writes.

export const TRACKER_RELEASES_URL = 'https://github.com/Faheem-ud-darain/HR-Web-App/releases';

// Direct-download links to the actual installer files, instead of sending
// people to the GitHub Releases page and making them find/click the right
// asset themselves. GitHub's "/latest/download/<filename>" path always
// redirects to whichever release was published most recently (from the
// "tracker-agent-v*" tag build — see .github/workflows/build-tracker-agent.yml)
// and serves the file with a Content-Disposition: attachment header, so the
// browser starts downloading immediately instead of navigating to a page.
// Filenames must stay in sync with that workflow's release asset names.
export const TRACKER_DOWNLOAD_WINDOWS_URL = 'https://github.com/Faheem-ud-darain/HR-Web-App/releases/latest/download/DelCargo_Tracker_Setup.exe';
export const TRACKER_DOWNLOAD_MAC_URL = 'https://github.com/Faheem-ud-darain/HR-Web-App/releases/latest/download/DelCargo_Tracker_Setup.dmg';
export const TRACKER_DOWNLOAD_MAC_ZIP_URL = 'https://github.com/Faheem-ud-darain/HR-Web-App/releases/latest/download/DelCargo-Tracker-Mac.zip';
export const TRACKER_DOWNLOAD_CHROMEOS_URL = '/Delcargo_Chromebook_Tracker.zip';

// The minimum agent build employees must be running. When an employee's
// tracker heartbeat reports an agentVersion older than this, the web portal
// shows an "Update Required" banner on their Tracker Setup page, and
// HR/Admin sees an outdated-build badge in TrackingView. Bump this string
// whenever a new mandatory build ships (keep in sync with APP_VERSION in
// tracker-agent/agent_gui.py AND the git tag pushed to trigger the release).
// Bumped 6 -> 11: v10 and earlier shipped with the reason_text/deduction_text
// SyntaxError (fixed alongside the Start Shift/black-screenshot/orphan-shift/
// lingering-process fixes), and v11 adds the upload/capture jitter from
// staggered_screenshot_plan.md — both are worth pushing everyone onto.
// Bumped 11 -> 14: v14 adds lock-screen detection (skips capture instead of
// silently uploading a lock-screen image) and reports capture-health fields
// in every heartbeat (lastCaptureAt/lastCaptureError/isLocked/
// consecutiveCaptureFailures/captureEnabled) so HR/Admin's TrackingView can
// tell a genuinely-capturing tracker apart from one that's just "Connected"
// but producing nothing — this closes the exact exploit where employees on
// v11-v13 could sit at a lock screen for hours and still show as fully
// tracked. Everyone must be pushed onto v14+.
export const TRACKER_MIN_VERSION = '14';

// Device label the Chromebook/Chrome extension reports in its heartbeat
// (see chrome-extension/background.js's handleHeartbeatTick) — used below
// to recognize it distinctly from the Windows/Mac desktop agent.
const CHROMEBOOK_DEVICE_LABEL = 'Chromebook / Chrome OS';

/**
 * Returns true when the connected tracker agent needs an update.
 * Compares component-by-component so "2" > "1.10" works correctly.
 * Returns false (no update needed) when version info is unavailable —
 * we don't want to false-alarm employees whose agents predate the
 * agentVersion heartbeat field (they'll appear as "unknown").
 *
 * Pass deviceLabel when available so the Chromebook/Chrome extension is
 * skipped entirely: it reports its own Chrome-extension manifest version
 * (semver-style, e.g. "1.0.12"), which is not on the same numbering scheme
 * as the desktop agent's flat incrementing APP_VERSION integer that
 * TRACKER_MIN_VERSION is calibrated against. Comparing them component-by-
 * component would misread "1.0.12" as older than "13" forever (1 < 13 on
 * the very first component) and permanently show "Update Required" for
 * every Chromebook, regardless of how current it actually is.
 */
export function needsTrackerUpdate(agentVersion: string | undefined, deviceLabel?: string): boolean {
  if (!agentVersion) return false; // pre-v6 agents don't send a version — don't alarm
  if (deviceLabel === CHROMEBOOK_DEVICE_LABEL) return false;
  const parse = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0);
  const agent = parse(agentVersion);
  const min = parse(TRACKER_MIN_VERSION);
  for (let i = 0; i < Math.max(agent.length, min.length); i++) {
    const a = agent[i] ?? 0;
    const m = min[i] ?? 0;
    if (a < m) return true;
    if (a > m) return false;
  }
  return false; // equal — up to date
}

/** Best-effort OS guess from the browser, used only to default which
 * download button we highlight — all are always shown regardless. */
export function detectOS(): 'windows' | 'mac' | 'cros' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = (navigator.userAgent || '').toLowerCase();
  if (ua.includes('cros')) return 'cros';
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'mac';
  return 'other';
}

/** True when this code is running inside the Capacitor-wrapped native
 * mobile app (Android/iOS — see capacitor.config.ts), as opposed to a
 * regular desktop/mobile web browser. Same detection PocketBase's own
 * client uses (src/lib/pocketbase.ts) to pick its API URL — kept as a
 * separate export here since it's also needed for UI-only decisions
 * (e.g. blocking manual shift start when screen tracking is required,
 * since the desktop tracker agent can never run on a phone). */
export function isNativeMobileApp(): boolean {
  return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();
}

/** The PocketBase server URL used by both the web app and tracker agents.
 * Now HTTPS via pb.delcargo.us (Caddy reverse proxy in front of PocketBase)
 * instead of the old bare HTTP IP — see src/lib/pocketbase.ts for the full
 * story on why that mattered. */
export const POCKETBASE_URL = 'https://pb.delcargo.us';

export function encodeSetupCode(url: string, token: string): string {
  const json = JSON.stringify({ u: url, t: token });
  if (typeof window === 'undefined') return '';
  // Use TextEncoder to handle UTF-8 safely instead of deprecated unescape()
  const utf8Bytes = new TextEncoder().encode(json);
  const binaryString = Array.from(utf8Bytes).map(byte => String.fromCharCode(byte)).join('');
  const b64 = window.btoa(binaryString);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Returns the PocketBase server URL for tracker agent setup. No anon key needed. */
export function getPocketBaseConfig(): { url: string } {
  return {
    url: POCKETBASE_URL,
  };
}
