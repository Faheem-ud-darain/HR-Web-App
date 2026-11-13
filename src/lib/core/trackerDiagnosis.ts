import type { TrackerHeartbeat } from '../hr/types';
import { getCaptureGap, hasStaleTrackerToken, isHeartbeatLive } from './timesheets';
import type { IntegrityFinding } from './trackingSettings';

// One answer per tracker to "is it working, and if not, what do I do?". The dashboard badges, the scheduled alert and the
// on-demand health report all use it, so they never disagree and the HR message always carries the fix, not only the symptom.
// Pure: the caller reads the data (src/lib/trackingIntegrity.ts) and says whether the app version is too old.

export type DiagnosisState =
  | 'healthy' | 'not_set_up' | 'tracking_off' | 'not_installed' | 'offline' | 'update_required'
  | 'stale_token' | 'locked' | 'capture_failing' | 'no_captures' | 'not_reporting' | 'data_mismatch' | 'update_available';
export type DiagnosisSeverity = 'ok' | 'info' | 'warn' | 'problem';

/** The raw facts behind a diagnosis, for whoever has to go and check the tracker. */
export interface TrackerDetails {
  trackingOn: boolean | null;
  intervalMinutes: number | null;
  onShiftSince: string | null;
  lastSeenAt: string | null;
  lastCaptureAt: string | null;
  agentVersion: string | null;
  device: string | null;
  lastError: string | null;
  failures: number;
}

export interface TrackerDiagnosis {
  email: string;
  state: DiagnosisState;
  severity: DiagnosisSeverity;
  /** What is wrong, in plain words. */
  cause: string;
  /** What to do about it ('' when nothing is needed). */
  action: string;
  details: TrackerDetails;
}

export function diagnoseTracker(args: {
  email: string;
  settings: { enabled: boolean; intervalMinutes: number; agentToken?: string } | null;
  heartbeat: TrackerHeartbeat | null;
  openShift: { clockIn: string } | null;
  updateRequired?: boolean;
  /** The newest version, when this tracker is on an older (but still allowed) one. */
  updateAvailable?: string | null;
  /** When this person's newest screenshot was taken: proof the tracker has connected, which a closed tracker's missing heartbeat is not. */
  lastScreenshotAt?: string | null;
  now?: number;
}): TrackerDiagnosis {
  const { email, settings, heartbeat: hb, openShift } = args;
  const now = args.now ?? Date.now();
  const onShift = !!openShift;
  const details: TrackerDetails = {
    trackingOn: settings ? settings.enabled : null, intervalMinutes: settings?.intervalMinutes ?? null, onShiftSince: openShift?.clockIn ?? null,
    lastSeenAt: hb?.lastSeenAt ?? args.lastScreenshotAt ?? null, lastCaptureAt: hb?.lastCaptureAt ?? args.lastScreenshotAt ?? null, agentVersion: hb?.agentVersion ?? null, device: hb?.deviceLabel ?? null,
    lastError: hb?.lastCaptureError ?? null, failures: hb?.consecutiveCaptureFailures ?? 0,
  };
  const make = (state: DiagnosisState, severity: DiagnosisSeverity, cause: string, action = ''): TrackerDiagnosis => ({ email, state, severity, cause, action, details });

  if (!settings || !settings.agentToken) return make('not_set_up', 'info', 'No tracker has been set up for this person.', 'Open Tracking and generate a setup code for them.');
  if (!settings.enabled) {
    return onShift
      ? make('tracking_off', 'problem', 'On shift with tracking switched OFF, so nothing is being captured.', 'Switch tracking on for them in Tracking.')
      : make('tracking_off', 'info', 'Tracking is switched off for this person.');
  }
  if (!hb && args.lastScreenshotAt) {
    // A tracker removes its heartbeat when it is closed, so no heartbeat only means it is not running now; its screenshots show it did connect.
    const since = Math.max(0, Math.round((now - new Date(args.lastScreenshotAt).getTime()) / 60000));
    return make('offline', onShift ? 'problem' : 'info', `The tracker is closed or off: there is no signal now, but it sent a screenshot ${since < 120 ? `${since} min` : `${Math.round(since / 60)} h`} ago.`, onShift ? 'Ask them to open the tracker and check their internet connection.' : '');
  }
  if (!hb) return make('not_installed', onShift ? 'problem' : 'warn', 'Tracking is on but their tracker has never connected.', 'Send them the tracker download and their setup code.');
  const minutesAgo = Math.max(0, Math.round((now - new Date(hb.lastSeenAt).getTime()) / 60000));
  if (!isHeartbeatLive(hb, now)) {
    return make('offline', onShift ? 'problem' : 'info', `The tracker has not been heard from for ${minutesAgo} min. The computer may be off, asleep or offline, or the tracker was closed.`, onShift ? 'Ask them to open the tracker and check their internet connection.' : '');
  }
  if (args.updateRequired) return make('update_required', 'warn', `Their tracker (v${hb.agentVersion}) is too old.`, 'Ask them to install the latest tracker.');
  if (hasStaleTrackerToken(hb)) return make('stale_token', 'problem', 'Their tracker is using an old setup code, so it is not capturing.', 'Generate a new setup code in Tracking and have them reconnect with it.');
  if (onShift && hb.isLocked) return make('locked', 'info', 'Their screen is locked, so nothing can be captured right now.', 'Nothing, unless it stays locked during their shift.');
  if ((hb.consecutiveCaptureFailures ?? 0) >= 3) {
    const why = hb.lastCaptureError || 'Screenshot capture is failing.';
    const permission = /permission|recording|denied/i.test(why);
    return make('capture_failing', 'problem', why, permission ? 'Turn on Screen Recording for the tracker in System Settings > Privacy & Security, then restart the tracker.' : 'Restart the tracker; if it keeps failing, reinstall it.');
  }
  if (hb.captureEnabled === undefined) return make('not_reporting', 'warn', 'This tracker does not report screenshot health, so a silent failure would go unnoticed.', 'Update to the newest tracker version.');
  const gap = getCaptureGap({
    onShift, trackingOn: true, heartbeatLive: true, lastCaptureAt: hb.lastCaptureAt, shiftStartedAt: openShift?.clockIn,
    intervalMinutes: settings.intervalMinutes, now, captureReported: true,
  });
  if (gap.status === 'no_captures') return make('no_captures', 'problem', `On shift and connected, but no screenshot for ${gap.minutes} min.`, 'Ask them to restart the tracker and check that screen capture is allowed.');
  if (args.updateAvailable) return make('update_available', 'warn', `Working, but on v${hb.agentVersion}; v${args.updateAvailable} is the latest.`, 'Ask them to restart the tracker and choose "Update now" when it asks (Chromebooks update by themselves within a few hours).');
  return make('healthy', 'ok', 'Connected and capturing.');
}

/** Fleet summary: how many trackers are in each state, and the ones that need someone's attention, worst first. */
export function summariseDiagnoses(all: TrackerDiagnosis[]): { counts: Partial<Record<DiagnosisState, number>>; attention: TrackerDiagnosis[] } {
  const counts: Partial<Record<DiagnosisState, number>> = {};
  for (const d of all) counts[d.state] = (counts[d.state] || 0) + 1;
  const rank: Record<DiagnosisSeverity, number> = { problem: 0, warn: 1, info: 2, ok: 3 };
  const attention = all.filter(d => d.severity === 'problem' || d.severity === 'warn').sort((a, b) => rank[a.severity] - rank[b.severity] || a.email.localeCompare(b.email));
  return { counts, attention };
}

/**
 * Adds the data problems the integrity check finds (a profile flag that disagrees with the tracking settings, or tracking on with no settings row):
 * they are real faults that do not show in the tracker's own heartbeat. A tracker that looked fine becomes a warning; one that already has a
 * problem keeps it and gains the note.
 */
export function withDataFindings(diagnoses: TrackerDiagnosis[], findings: IntegrityFinding[]): TrackerDiagnosis[] {
  const data = findings.filter(f => f.kind === 'flag_mismatch' || f.kind === 'no_settings_row');
  return diagnoses.map(d => {
    const mine = data.filter(f => f.email.toLowerCase() === d.email.toLowerCase());
    if (!mine.length) return d;
    const note = mine.map(f => f.detail).join(' ');
    const fix = 'Switch tracking off and on once on the Tracking page; that re-syncs both flags.';
    if (d.severity === 'ok' || d.severity === 'info') return { ...d, state: 'data_mismatch', severity: 'warn', cause: note, action: fix };
    return { ...d, cause: `${d.cause} Also: ${note}` };
  });
}
