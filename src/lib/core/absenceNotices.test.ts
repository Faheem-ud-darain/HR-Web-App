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
