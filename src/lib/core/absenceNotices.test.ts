import { describe, expect, it } from 'vitest';
import type { AbsenceRecord, LeaveApplication, Profile } from '../hr/types';
import { absencesCoveredByLeave, detectAbsences } from './absences';

// Wrong deduction notices: a day covered by an approved leave must lose its absence, and a person with no salary must not be told about a zero deduction.
const rec = (id: string, date: string, over: Partial<AbsenceRecord> = {}): AbsenceRecord => ({ id, employeeEmail: 'u@delcargo.us', employeeName: 'Umme Rooman', date, reason: 'no_clock_in', deductionAmount: 4286, createdAt: '', acknowledged: true, ...over } as AbsenceRecord);
const leave = { id: 'l1', employeeName: 'Umme Rooman', type: 'Normal', duration: '', startDate: '2026-11-05', endDate: '2026-11-06', status: 'approved' } as LeaveApplication;

describe('absencesCoveredByLeave', () => {
  it('picks this person’s active absences inside the leave dates, and nothing else', () => {
    const records = [
      rec('a', '2026-11-05'), rec('b', '2026-11-06'), rec('c', '2026-11-09'),
      rec('d', '2026-11-05', { deleted: true }), rec('e', '2026-11-05', { employeeName: 'Someone Else' }),
    ];
    expect(absencesCoveredByLeave(records, leave).map(r => r.id)).toEqual(['a', 'b']);
  });
  it('picks nothing when the leave has no readable dates', () => {
    expect(absencesCoveredByLeave([rec('a', '2026-11-05')], { ...leave, startDate: undefined, endDate: undefined, duration: '' })).toEqual([]);
  });
});

describe('detectAbsences with no salary', () => {
  const NOW = new Date('2026-11-11T16:00:00Z');
  const emp = (baseSalary: number) => ({ id: 'p', fullName: 'Test Person', email: 't@delcargo.us', role: 'employee', joinedDate: '2020-01-01', onboardingCompleted: true, baseSalary, teams: [], region: 'Pakistan' }) as Profile;
  const run = (p: Profile) => detectAbsences({ employees: [p], timesheets: [], leaves: [], inactivityLogs: [], ignoredKeys: new Set(), now: NOW });
  it('flags a paid person who never clocked in', () => {
    expect(run(emp(45000)).length).toBeGreaterThan(0);
  });
  it('records nothing for a person with no salary, so no "0 deduction" notice is ever sent', () => {
    expect(run(emp(0))).toEqual([]);
  });
});

// Idle time outside a shift: Emily's 5 Nov 2026 saved 6h24m of idle logs for a 3h13m of shifts, most of it after her shifts had ended.
import { clipLogsToShifts, secondsInsideShifts } from './inactivity';
import type { InactivityLog, TimesheetEntry } from '../hr/types';

describe('idle time counts only inside a shift', () => {
  const shift = (clockIn: string, clockOut: string): TimesheetEntry => ({ id: clockIn, employeeEmail: 'e@delcargo.us', date: '', clockIn, clockOut, status: 'completed', approvalStatus: 'pending' });
  const log = (startAt: string, endAt: string): InactivityLog => ({ id: startAt, employeeEmail: 'e@delcargo.us', startAt, endAt, durationSeconds: (Date.parse(endAt) - Date.parse(startAt)) / 1000 });
  const shifts = [shift('2026-11-05T14:44:00Z', '2026-11-05T16:54:00Z'), shift('2026-11-05T20:24:00Z', '2026-11-05T20:50:00Z')];

  it('cuts a log to its overlap with the shifts', () => {
    expect(secondsInsideShifts(log('2026-11-05T16:49:00Z', '2026-11-05T18:12:00Z'), shifts)).toBe(5 * 60); // 82 minutes saved, 5 inside the shift
    expect(secondsInsideShifts(log('2026-11-05T18:14:00Z', '2026-11-05T20:23:00Z'), shifts)).toBe(0); // entirely between shifts
    expect(secondsInsideShifts(log('2026-11-05T15:00:00Z', '2026-11-05T15:20:00Z'), shifts)).toBe(20 * 60); // fully inside: unchanged
  });
  it('counts a log that spans two shifts only where each shift is open', () => {
    expect(secondsInsideShifts(log('2026-11-05T16:00:00Z', '2026-11-05T20:30:00Z'), shifts)).toBe((54 + 6) * 60);
  });
  it('runs an open shift until now', () => {
    const open = [{ clockIn: '2026-11-05T14:00:00Z', clockOut: undefined }];
    expect(secondsInsideShifts(log('2026-11-05T14:10:00Z', '2026-11-05T14:50:00Z'), open, Date.parse('2026-11-05T14:30:00Z'))).toBe(20 * 60);
  });
  it('drops logs with nothing inside a shift', () => {
    const kept = clipLogsToShifts([log('2026-11-05T18:14:00Z', '2026-11-05T20:23:00Z'), log('2026-11-05T16:49:00Z', '2026-11-05T18:12:00Z')], shifts);
    expect(kept.map(l => l.durationSeconds)).toEqual([300]);
  });
});

describe('the absence check ignores idle time outside the shift', () => {
  const NOW = new Date('2026-11-07T16:00:00Z'); // 5 Nov is inside the check's 5-day look-back
  const emp = { id: 'p', fullName: 'Emily', email: 'emily@delcargo.us', role: 'employee', joinedDate: '2020-01-01', onboardingCompleted: true, baseSalary: 45000, teams: [], region: 'Pakistan' } as Profile;
  const day = { id: 't', employeeEmail: 'emily@delcargo.us', date: '2026-11-05', clockIn: '2026-11-05T14:44:00Z', clockOut: '2026-11-05T22:54:00Z', status: 'completed', approvalStatus: 'pending' } as TimesheetEntry; // 8h10m shift
  const run = (logs: InactivityLog[]) => detectAbsences({ employees: [emp], timesheets: [day], leaves: [], inactivityLogs: logs, ignoredKeys: new Set(), now: NOW }).filter(c => c.date === '2026-11-05');
  const mk = (a: string, b: string): InactivityLog => ({ id: a, employeeEmail: 'emily@delcargo.us', startAt: a, endAt: b, durationSeconds: (Date.parse(b) - Date.parse(a)) / 1000 });
  it('flags a real 40-minute idle stretch inside the shift', () => {
    expect(run([mk('2026-11-05T16:00:00Z', '2026-11-05T16:40:00Z')]).map(c => c.reason)).toEqual(['inactivity']);
  });
  it('does not flag a long log that only touches the shift for a few minutes', () => {
    expect(run([mk('2026-11-05T22:50:00Z', '2026-11-06T01:00:00Z')])).toEqual([]); // starts 4 minutes before the shift ends
  });
});
