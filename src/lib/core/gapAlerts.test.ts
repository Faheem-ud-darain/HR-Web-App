import { describe, expect, it } from 'vitest';
import { GAP_ALERT_EVERY_MS, planGapAlerts, type IntegrityFinding } from './trackingSettings';

const off = (email: string): IntegrityFinding => ({ kind: 'on_shift_tracking_off', email, detail: 'On shift with tracking switched OFF.' });
const quiet = (email: string): IntegrityFinding => ({ kind: 'on_shift_no_captures', email, detail: 'No screenshot for 40 minutes.' });
const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);

describe('planGapAlerts', () => {
  it('alerts the first time someone is flagged and remembers it', () => {
    const { send, next } = planGapAlerts([off('a@x.com')], {}, NOW);
    expect(send).toHaveLength(1);
    expect(next['on_shift_tracking_off:a@x.com']).toBe(new Date(NOW).toISOString());
  });

  it('stays quiet for the same problem until the repeat time has passed', () => {
    const state = { 'on_shift_tracking_off:a@x.com': new Date(NOW - 20 * 60 * 1000).toISOString() };
    const early = planGapAlerts([off('a@x.com')], state, NOW);
    expect(early.send).toHaveLength(0);
    expect(early.next).toEqual(state);
    const later = planGapAlerts([off('a@x.com')], state, NOW + GAP_ALERT_EVERY_MS);
    expect(later.send).toHaveLength(1);
  });

  it('forgets people who are no longer flagged, so a new problem alerts again', () => {
    const state = { 'on_shift_no_captures:a@x.com': new Date(NOW - 10 * 60 * 1000).toISOString() };
    expect(planGapAlerts([], state, NOW).next).toEqual({});
    expect(planGapAlerts([quiet('a@x.com')], planGapAlerts([], state, NOW).next, NOW).send).toHaveLength(1);
  });

  it('treats the two problems and different people separately, ignoring emails case', () => {
    const state = { 'on_shift_tracking_off:a@x.com': new Date(NOW - 60 * 1000).toISOString() };
    const { send } = planGapAlerts([off('A@X.com'), quiet('a@x.com'), off('b@x.com')], state, NOW);
    expect(send.map(f => `${f.kind}:${f.email}`)).toEqual(['on_shift_no_captures:a@x.com', 'on_shift_tracking_off:b@x.com']);
  });

  it('only alerts for people on shift with nothing captured, not for flag mismatches', () => {
    const mismatch: IntegrityFinding = { kind: 'flag_mismatch', email: 'a@x.com', detail: 'Flags disagree.' };
    expect(planGapAlerts([mismatch], {}, NOW).send).toHaveLength(0);
  });

  it('an unreadable saved time counts as never alerted', () => {
    expect(planGapAlerts([off('a@x.com')], { 'on_shift_tracking_off:a@x.com': 'not a date' }, NOW).send).toHaveLength(1);
  });
});
