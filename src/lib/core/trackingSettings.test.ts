import { describe, it, expect } from 'vitest';
import { planTrackingSettingsChange, isTrackingOn, newAgentToken, type TrackingSettingsRow } from './trackingSettings';

const row: TrackingSettingsRow = { id: 'r1', employeeEmail: 'alex@x.us', enabled: true, intervalMinutes: 5, excludeFromAutoDelete: false, agentToken: 'agt_keepmekeepme1' };
const hr = { email: 'hr@x.us', role: 'hr' };
const admin = { email: 'admin@x.us', role: 'admin' };
const alex = { email: 'alex@x.us', role: 'employee' };

describe('planTrackingSettingsChange', () => {
  it('sends only the fields that changed: regenerating a code cannot turn tracking off', () => {
    const plan = planTrackingSettingsChange({ actor: alex, targetEmail: 'alex@x.us', updates: { agentToken: 'agt_brandnewcode12' }, existing: row });
    expect(plan).toMatchObject({ ok: true, mode: 'update', write: { agentToken: 'agt_brandnewcode12' } });
    expect(plan.ok && Object.keys(plan.write)).toEqual(['agentToken']);
  });

  it('writes nothing for an empty update or an unchanged value', () => {
    expect(planTrackingSettingsChange({ actor: hr, targetEmail: 'alex@x.us', updates: {}, existing: row })).toMatchObject({ ok: true, mode: 'none' });
    expect(planTrackingSettingsChange({ actor: hr, targetEmail: 'alex@x.us', updates: { enabled: true }, existing: row })).toMatchObject({ ok: true, mode: 'none' });
  });

  it('records old and new values for the audit log', () => {
    const plan = planTrackingSettingsChange({ actor: admin, targetEmail: 'ALEX@x.us', updates: { enabled: false, intervalMinutes: 10 }, existing: row });
    expect(plan).toMatchObject({ ok: true, mode: 'update', changes: { enabled: [true, false], intervalMinutes: [5, 10] } });
  });

  it('creates a row with defaults and a fresh code only when none exists', () => {
    const plan = planTrackingSettingsChange({ actor: alex, targetEmail: 'alex@x.us', updates: {}, existing: null });
    expect(plan).toMatchObject({ ok: true, mode: 'create', write: { enabled: false, intervalMinutes: 15, excludeFromAutoDelete: false, employeeEmail: 'alex@x.us' } });
    expect(plan.ok && plan.write.agentToken).toMatch(/^agt_[a-z0-9]{10,40}$/);
  });

  it('lets an employee change only their own setup code', () => {
    expect(planTrackingSettingsChange({ actor: alex, targetEmail: 'zara@x.us', updates: { agentToken: 'agt_brandnewcode12' }, existing: row })).toMatchObject({ ok: false, status: 403 });
    expect(planTrackingSettingsChange({ actor: alex, targetEmail: 'alex@x.us', updates: { enabled: false }, existing: row })).toMatchObject({ ok: false, status: 403 });
    expect(planTrackingSettingsChange({ actor: alex, targetEmail: 'alex@x.us', updates: { intervalMinutes: 1 }, existing: row })).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects bad input', () => {
    expect(planTrackingSettingsChange({ actor: hr, targetEmail: '', updates: {}, existing: row })).toMatchObject({ ok: false, status: 400 });
    expect(planTrackingSettingsChange({ actor: hr, targetEmail: 'alex@x.us', updates: { enabled: 'yes' }, existing: row })).toMatchObject({ ok: false, status: 400 });
    expect(planTrackingSettingsChange({ actor: hr, targetEmail: 'alex@x.us', updates: { intervalMinutes: 0 }, existing: row })).toMatchObject({ ok: false, status: 400 });
    expect(planTrackingSettingsChange({ actor: hr, targetEmail: 'alex@x.us', updates: { agentToken: 'bad token!' }, existing: row })).toMatchObject({ ok: false, status: 400 });
    expect(planTrackingSettingsChange({ actor: hr, targetEmail: 'alex@x.us', updates: { role: 'admin' }, existing: row })).toMatchObject({ ok: false, status: 400 });
  });
});

describe('isTrackingOn', () => {
  it('trusts the settings row when there is one, whatever the profile flag says', () => {
    expect(isTrackingOn(true, { enabled: false, agentToken: 'agt_x' })).toBe(false); // alex/zara: profile on, settings off
    expect(isTrackingOn(false, { enabled: true, agentToken: 'agt_x' })).toBe(true);  // luna: profile off, settings on
  });
  it('falls back to the profile flag only when there is no real settings row', () => {
    expect(isTrackingOn(true, undefined)).toBe(true);
    expect(isTrackingOn(true, { enabled: false, agentToken: '' })).toBe(true);
    expect(isTrackingOn(false, null)).toBe(false);
  });
});

describe('newAgentToken', () => {
  it('always looks like a valid code', () => {
    for (let i = 0; i < 50; i++) expect(newAgentToken()).toMatch(/^agt_[a-z0-9]{10,40}$/);
  });
});

import { buildIntegrityReport } from './trackingSettings';

describe('buildIntegrityReport', () => {
  const now = Date.parse('2026-10-22T20:00:00Z');
  const hbLive = { lastSeenAt: '2026-10-22T19:58:00Z', lastCaptureAt: '2026-10-22T19:55:00Z', captureEnabled: true };
  it('finds mismatches, a missing row, and on-shift gaps — and stays quiet for healthy employees', () => {
    const report = buildIntegrityReport({
      now,
      profiles: [
        { email: 'ok@x.us', role: 'employee', trackingEnabled: true },
        { email: 'alex@x.us', role: 'employee', trackingEnabled: true },   // settings off
        { email: 'luna@x.us', role: 'employee', trackingEnabled: false },  // settings on
        { email: 'zara@x.us', role: 'employee', trackingEnabled: true },   // on shift, settings off
        { email: 'quiet@x.us', role: 'employee', trackingEnabled: true },  // on shift, connected, no captures
        { email: 'norow@x.us', role: 'employee', trackingEnabled: true },
        { email: 'boss@x.us', role: 'hr', trackingEnabled: false },
      ],
      settings: [
        { employeeEmail: 'ok@x.us', enabled: true, intervalMinutes: 15, agentToken: 'agt_a' },
        { employeeEmail: 'alex@x.us', enabled: false, intervalMinutes: 15, agentToken: 'agt_b' },
        { employeeEmail: 'luna@x.us', enabled: true, intervalMinutes: 15, agentToken: 'agt_c' },
        { employeeEmail: 'zara@x.us', enabled: false, intervalMinutes: 15, agentToken: 'agt_d' },
        { employeeEmail: 'quiet@x.us', enabled: true, intervalMinutes: 15, agentToken: 'agt_e' },
      ],
      openShifts: [
        { employeeEmail: 'ok@x.us', clockIn: '2026-10-22T14:00:00Z' },
        { employeeEmail: 'zara@x.us', clockIn: '2026-10-22T14:00:00Z' },
        { employeeEmail: 'quiet@x.us', clockIn: '2026-10-22T14:00:00Z' },
      ],
      heartbeats: { 'ok@x.us': hbLive, 'quiet@x.us': { lastSeenAt: '2026-10-22T19:58:00Z', lastCaptureAt: '2026-10-22T16:00:00Z', captureEnabled: true } },
    });
    const kinds = report.map(f => `${f.kind}:${f.email}`).sort();
    expect(kinds).toEqual([
      'flag_mismatch:alex@x.us', 'flag_mismatch:luna@x.us', 'flag_mismatch:zara@x.us',
      'no_settings_row:norow@x.us', 'on_shift_no_captures:quiet@x.us', 'on_shift_tracking_off:zara@x.us',
    ]);
  });
});
