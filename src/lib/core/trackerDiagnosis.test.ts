import { describe, expect, it } from 'vitest';
import type { TrackerHeartbeat } from '../hr/types';
import { diagnoseTracker, summariseDiagnoses, withDataFindings } from './trackerDiagnosis';
import type { IntegrityFinding } from './trackingSettings';

const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60 * 1000).toISOString();
const settings = { enabled: true, intervalMinutes: 15, agentToken: 'tok' };
const shift = { clockIn: iso(120) };
const hb = (over: Partial<TrackerHeartbeat> = {}): TrackerHeartbeat => ({
  employeeEmail: 'a@x.com', deviceId: 'd', connectedAt: iso(300), lastSeenAt: iso(1), agentVersion: '25',
  captureEnabled: true, lastCaptureAt: iso(5), consecutiveCaptureFailures: 0, ...over,
});
const diagnose = (over: Record<string, unknown> = {}) => diagnoseTracker({ email: 'a@x.com', settings, heartbeat: hb(), openShift: shift, now: NOW, ...over });

describe('diagnoseTracker', () => {
  it('a connected tracker that is capturing is healthy and needs nothing', () => {
    const d = diagnose();
    expect(d).toMatchObject({ state: 'healthy', severity: 'ok', action: '' });
  });

  it('a person with no setup, or with tracking off, is reported by their own state', () => {
    expect(diagnose({ settings: null }).state).toBe('not_set_up');
    expect(diagnose({ settings: { ...settings, agentToken: '' } }).state).toBe('not_set_up');
    expect(diagnose({ settings: { ...settings, enabled: false }, openShift: null })).toMatchObject({ state: 'tracking_off', severity: 'info' });
  });

  it('tracking off during a shift is a problem with the fix named', () => {
    const d = diagnose({ settings: { ...settings, enabled: false } });
    expect(d).toMatchObject({ state: 'tracking_off', severity: 'problem' });
    expect(d.action).toContain('Switch tracking on');
  });

  it('a closed tracker has no heartbeat, but its screenshots show it did connect: offline with the last screenshot, never "never connected"', () => {
    const shot = new Date(NOW - 90 * 60000).toISOString();
    expect(diagnose({ heartbeat: null, openShift: null, lastScreenshotAt: shot })).toMatchObject({ state: 'offline', severity: 'info', details: { lastCaptureAt: shot, lastSeenAt: shot } });
    expect(diagnose({ heartbeat: null, lastScreenshotAt: shot }).cause).toContain('90 min');
    expect(diagnose({ heartbeat: null, lastScreenshotAt: shot })).toMatchObject({ state: 'offline', severity: 'problem' }); // on shift with nothing running
    expect(diagnose({ heartbeat: null, lastScreenshotAt: null })).toMatchObject({ state: 'not_installed' });
  });
  it('tracking on but never connected is not installed, worse when on shift', () => {
    expect(diagnose({ heartbeat: null })).toMatchObject({ state: 'not_installed', severity: 'problem' });
    expect(diagnose({ heartbeat: null, openShift: null })).toMatchObject({ state: 'not_installed', severity: 'warn' });
  });

  it('a silent tracker is offline: a problem on shift, only information off shift', () => {
    const d = diagnose({ heartbeat: hb({ lastSeenAt: iso(40) }) });
    expect(d).toMatchObject({ state: 'offline', severity: 'problem' });
    expect(d.cause).toContain('40 min');
    expect(diagnose({ heartbeat: hb({ lastSeenAt: iso(40) }), openShift: null })).toMatchObject({ state: 'offline', severity: 'info', action: '' });
  });

  it('an old tracker version, and an old setup code, each get their own fix', () => {
    expect(diagnose({ updateRequired: true })).toMatchObject({ state: 'update_required', severity: 'warn' });
    const stale = diagnose({ heartbeat: hb({ captureEnabled: false, lastCaptureError: 'Setup token not recognized by the server' }) });
    expect(stale).toMatchObject({ state: 'stale_token', severity: 'problem' });
    expect(stale.action).toContain('new setup code');
  });

  it('a locked screen on shift is information, not a fault', () => {
    expect(diagnose({ heartbeat: hb({ isLocked: true }) })).toMatchObject({ state: 'locked', severity: 'info' });
  });

  it('repeated capture failures explain why, and a permission problem points at the setting to change', () => {
    const permission = diagnose({ heartbeat: hb({ consecutiveCaptureFailures: 4, lastCaptureError: 'Screen Recording permission denied' }) });
    expect(permission).toMatchObject({ state: 'capture_failing', severity: 'problem', cause: 'Screen Recording permission denied' });
    expect(permission.action).toContain('Screen Recording');
    const other = diagnose({ heartbeat: hb({ consecutiveCaptureFailures: 3, lastCaptureError: 'The screenshot could not be uploaded.' }) });
    expect(other.action).toContain('Restart the tracker');
    expect(diagnose({ heartbeat: hb({ consecutiveCaptureFailures: 2 }) }).state).toBe('healthy');
  });

  it('a tracker that does not report capture health is flagged as unable to be checked', () => {
    expect(diagnose({ heartbeat: hb({ captureEnabled: undefined }) })).toMatchObject({ state: 'not_reporting', severity: 'warn' });
  });

  it('connected but no screenshot for too long is a problem with the minutes', () => {
    const d = diagnose({ heartbeat: hb({ lastCaptureAt: iso(90) }) });
    expect(d).toMatchObject({ state: 'no_captures', severity: 'problem' });
    expect(d.cause).toContain('90 min');
    expect(diagnose({ heartbeat: hb({ lastCaptureAt: iso(90) }), openShift: null }).state).toBe('healthy');
  });
});

describe('update available', () => {
  it('a working tracker that is not on the latest build is a warning that says how to update', () => {
    const d = diagnose({ updateAvailable: '25' });
    expect(d).toMatchObject({ state: 'update_available', severity: 'warn' });
    expect(d.cause).toContain('v25');
    expect(d.action).toContain('Update now');
  });

  it('a real problem on an old build is still reported as the problem, not as an update', () => {
    expect(diagnose({ updateAvailable: '25', heartbeat: hb({ lastSeenAt: iso(40) }) }).state).toBe('offline');
    expect(diagnose({ updateAvailable: '25', heartbeat: hb({ consecutiveCaptureFailures: 5, lastCaptureError: 'boom' }) }).state).toBe('capture_failing');
  });

  it('a tracker already on the latest build is healthy', () => {
    expect(diagnose({ updateAvailable: null }).state).toBe('healthy');
  });
});

describe('summariseDiagnoses', () => {
  it('counts every state and lists only what needs attention, worst first', () => {
    const all = [
      diagnose({ email: 'ok@x.com' }),
      diagnose({ email: 'b@x.com', heartbeat: hb({ lastSeenAt: iso(40) }) }),
      diagnose({ email: 'a@x.com', heartbeat: null }),
      diagnose({ email: 'u@x.com', updateRequired: true }),
      diagnose({ email: 'n@x.com', settings: null }),
    ];
    const { counts, attention } = summariseDiagnoses(all);
    expect(counts).toEqual({ healthy: 1, offline: 1, not_installed: 1, update_required: 1, not_set_up: 1 });
    expect(attention.map(d => d.email)).toEqual(['a@x.com', 'b@x.com', 'u@x.com']);
  });
});

describe('details', () => {
  it('carries the raw facts a technician needs to check the tracker', () => {
    const d = diagnose({ heartbeat: hb({ deviceLabel: 'Windows PC', lastCaptureError: 'Screen is locked', consecutiveCaptureFailures: 2 }) });
    expect(d.details).toEqual({
      trackingOn: true, intervalMinutes: 15, onShiftSince: shift.clockIn, lastSeenAt: iso(1), lastCaptureAt: iso(5),
      agentVersion: '25', device: 'Windows PC', lastError: 'Screen is locked', failures: 2,
    });
    expect(diagnose({ settings: null, heartbeat: null, openShift: null }).details).toMatchObject({ trackingOn: null, lastSeenAt: null, failures: 0 });
  });
});

describe('withDataFindings', () => {
  const mismatch = (email: string): IntegrityFinding => ({ kind: 'flag_mismatch', email, detail: 'Profile flag is OFF but tracking settings say ON.' });

  it('turns an apparently healthy tracker with disagreeing flags into a warning with the fix', () => {
    const [d] = withDataFindings([diagnose()], [mismatch('A@x.com')]);
    expect(d).toMatchObject({ state: 'data_mismatch', severity: 'warn', cause: 'Profile flag is OFF but tracking settings say ON.' });
    expect(d.action).toContain('off and on');
  });

  it('keeps an existing problem and adds the data note to it', () => {
    const offline = diagnose({ heartbeat: hb({ lastSeenAt: iso(40) }) });
    const [d] = withDataFindings([offline], [mismatch('a@x.com')]);
    expect(d.state).toBe('offline');
    expect(d.cause).toContain('Also: Profile flag is OFF');
  });

  it('ignores findings about other people and findings that are not data problems', () => {
    const live: IntegrityFinding = { kind: 'on_shift_tracking_off', email: 'a@x.com', detail: 'x' };
    expect(withDataFindings([diagnose()], [mismatch('b@x.com'), live])[0].state).toBe('healthy');
  });
});
