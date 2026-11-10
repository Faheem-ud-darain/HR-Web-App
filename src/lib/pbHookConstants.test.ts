import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAX_SHIFT_DURATION_MS, MIN_SHIFT_AGE_MS, ORPHAN_SHIFT_GRACE_MS, SHIFT_TAB_HEARTBEAT_STALE_MS, TRACKER_HEARTBEAT_LIVE_DEFAULT_MS, isHeartbeatLive, shiftMinutes,
} from './core/timesheets';
import { GEO_SHIFT_SILENCE_MS } from './core/geofence';
import { OVERLAY_KEYS } from './profileFields';
import { fromProfileFields } from './profileFields';
import { mapProfileRecord } from './core/profiles';

// The server hook that auto-closes stale shifts cannot import app code, so it repeats these numbers. If either side changes alone, this fails.
const hook = readFileSync('pb_hooks/auto_close_stale_shifts.pb.js', 'utf8');
const hookMs = (name: string): number => {
  const m = new RegExp(`const ${name} = ([\\d* ]+);`).exec(hook);
  if (!m) throw new Error(`${name} not found in the hook`);
  return m[1].split('*').reduce((n, part) => n * Number(part.trim()), 1);
};

describe('pb_hooks/auto_close_stale_shifts.pb.js matches the app', () => {
  it('uses the same windows', () => {
    expect(hookMs('SHIFT_TAB_HEARTBEAT_STALE_MS')).toBe(SHIFT_TAB_HEARTBEAT_STALE_MS);
    expect(hookMs('ORPHAN_SHIFT_GRACE_MS')).toBe(ORPHAN_SHIFT_GRACE_MS);
    expect(hookMs('GEO_SHIFT_SILENCE_MS')).toBe(GEO_SHIFT_SILENCE_MS);
    expect(hookMs('MIN_SHIFT_AGE_MS')).toBe(MIN_SHIFT_AGE_MS);
    expect(hookMs('MAX_SHIFT_DURATION_MS')).toBe(MAX_SHIFT_DURATION_MS);
  });

  it('treats a tracker as live for 13 minutes, which is the one window the app uses too', () => {
    expect(hookMs('TRACKER_HEARTBEAT_LIVE_TOLERANCE_MS')).toBe(TRACKER_HEARTBEAT_LIVE_DEFAULT_MS);
    const now = Date.UTC(2026, 10, 4, 12);
    const seen = (min: number) => ({ lastSeenAt: new Date(now - min * 60000).toISOString() }) as never;
    expect(isHeartbeatLive(seen(12), now)).toBe(true);
    expect(isHeartbeatLive(seen(14), now)).toBe(false);
  });
});

describe('shiftMinutes', () => {
  it('rounds like the saved "Xh Ym" text, counts an open shift up to the given time, and is 0 for bad input', () => {
    expect(shiftMinutes('2026-11-04T10:00:00Z', '2026-11-04T10:29:40Z')).toBe(30);
    expect(shiftMinutes('2026-11-04T10:00:00Z', undefined, Date.UTC(2026, 10, 4, 10, 45))).toBe(45);
    expect(shiftMinutes(undefined, undefined)).toBe(0);
    expect(shiftMinutes('x', 'y')).toBe(0);
    expect(shiftMinutes('2026-11-04T11:00:00Z', '2026-11-04T10:00:00Z')).toBe(0);
  });
});

describe('profile columns: writing and reading use the same list', () => {
  it('every column written by fromProfileFields is read back by mapProfileRecord', () => {
    const row = {
      id: 'p1', full_name: 'Zara K', email: 'zara@x.com', role: 'employee', joined_date: '2026-01-05', onboarding_completed: true, base_salary: 50000,
      teams: ['A'], password: 'pbkdf2$x', is_team_lead: 'true', lead_teams: ['A'], is_warehouse_lead: true, managed_warehouses: ['W'],
      job_title: 'Agent', gender: 'F', bank_name: 'B', account_number: '1', iban: 'PK00', region: 'Pakistan', assigned_warehouses: [],
      tracking_enabled: true, salary_start_date: '2026-01-05',
    };
    const { id, ...columns } = row;
    void id;
    expect(fromProfileFields(mapProfileRecord(row) as never)).toEqual(columns);
    expect(OVERLAY_KEYS.length).toBeGreaterThan(0);
  });
});
