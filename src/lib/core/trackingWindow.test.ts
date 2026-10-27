import { describe, expect, it } from 'vitest';
import type { InactivityLog, TimesheetEntry } from '../hrData';
import { computeWindow, formatDuration, getShiftSecondsInRange, groupLogsByDay } from './trackingWindow';

const entry = (email: string, clockIn: string, clockOut?: string) => ({ employeeEmail: email, clockIn, clockOut }) as TimesheetEntry;
const log = (startAt: string, durationSeconds: number) => ({ startAt, durationSeconds }) as InactivityLog;

describe('formatDuration', () => {
  it('shows minutes under an hour and hours with minutes above', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(42 * 60)).toBe('42m');
    expect(formatDuration(65 * 60)).toBe('1h 5m');
  });
  it('rounds to whole minutes before splitting, never "0h 60m"', () => {
    expect(formatDuration(3599)).toBe('1h 0m');
  });
});

describe('getShiftSecondsInRange', () => {
  const since = new Date('2026-10-01T00:00:00Z');
  const until = new Date('2026-10-02T00:00:00Z');
  it('counts only the part of a shift that falls inside the window', () => {
    const t = [entry('a@x.com', '2026-09-30T22:00:00Z', '2026-10-01T02:00:00Z')];
    expect(getShiftSecondsInRange(t, 'a@x.com', since, until)).toBe(2 * 3600);
  });
  it('counts an open shift up to now and ignores other employees', () => {
    const now = new Date('2026-10-01T10:00:00Z');
    const t = [entry('a@x.com', '2026-10-01T08:00:00Z'), entry('b@x.com', '2026-10-01T01:00:00Z', '2026-10-01T09:00:00Z')];
    expect(getShiftSecondsInRange(t, 'A@x.com', since, until, now)).toBe(2 * 3600);
  });
});

describe('computeWindow', () => {
  it('"day" is exactly 24 hours and "2days" is 48 hours ending where that day ends', () => {
    const day = computeWindow('day', '2026-10-15');
    expect(day.until.getTime() - day.since.getTime()).toBe(24 * 3600 * 1000);
    const two = computeWindow('2days', '2026-10-15');
    expect(two.until.getTime()).toBe(day.until.getTime());
    expect(two.until.getTime() - two.since.getTime()).toBe(48 * 3600 * 1000);
  });
  it('"week" ends now and starts 7 days earlier', () => {
    const w = computeWindow('week', '2026-10-15');
    expect(Math.round((w.until.getTime() - w.since.getTime()) / 86_400_000)).toBe(7);
  });
});

describe('groupLogsByDay', () => {
  it('groups by New York day, orders each day earliest-first and puts the newest day first', () => {
    const groups = groupLogsByDay([
      log('2026-10-02T15:00:00Z', 60),
      log('2026-10-01T15:00:00Z', 30),
      log('2026-10-01T13:00:00Z', 90),
    ]);
    expect(groups.map(g => g.day)).toEqual(['Oct 2, 2026', 'Oct 1, 2026']);
    expect(groups[1].logs.map(l => l.durationSeconds)).toEqual([90, 30]);
    expect(groups[1].totalSeconds).toBe(120);
  });
});
