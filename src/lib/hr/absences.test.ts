// Tests for the no-call-no-show / mouse-inactivity absence-reason detection
// logic that lives inline inside absenceActions.runAbsenceCheck. Plan 015
// step 3.
//
// runAbsenceCheck is NOT a pure function — it does real PocketBase reads
// (via hrActions, re-exported from ../hrData) and writes (pbCreate, from
// ./shared), plus sends notifications. Per this plan's own boundaries
// (do NOT refactor production logic for testability), this test suite
// mocks those dependencies with vi.mock rather than changing the source.
// isWeekday and isApprovedLeaveOnDate are also imported from ../hrData
// inside absences.ts (part of the circular hrData.ts <-> hr/*.ts import
// pattern documented in plan 014) — the mock below re-exports the REAL
// implementations of those two (imported from ./leaves, their actual home)
// so the date/weekday/leave-overlap logic under test is genuine, not
// stubbed out.
//
// WHAT THIS COVERS: the actual reason-classification decision (no_clock_in
// vs under_4_hours vs inactivity vs "present, no reason"), the Pakistan-only/
// USA-excluded rule, the approved-leave override, and the dedup-against-
// existing-history behavior — the real financial/business logic in this
// function. WHAT THIS DOES NOT COVER: the concurrency/race-condition
// handling around the fresh re-fetch-before-create step (that requires
// simulating two concurrent calls racing against a real database's unique
// index, which is a job for an integration test against real PocketBase,
// not a unit test against mocks) — noted here rather than faked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AbsenceRecord, Profile, TimesheetEntry, InactivityLog, LeaveApplication } from './types';

// ── Controllable fixtures for the mocked ../hrData module ──────────────
let mockFreshTimesheets: TimesheetEntry[] = [];
let mockAbsenceHistory: AbsenceRecord[] = []; // stands in for BOTH getAbsenceRecords and getAllAbsenceRecordsIncludingDeleted
const addNotificationMock = vi.fn(async () => {});
const bulkDeleteAbsenceRecordsMock = vi.fn(async () => {});

vi.mock('../hrData', async () => {
  // Real isWeekday/isApprovedLeaveOnDate (their actual home is ./leaves) —
  // keeping these genuine, not stubbed, is what makes this test honest.
  const actualLeaves = await vi.importActual<typeof import('./leaves')>('./leaves');
  return {
    isWeekday: actualLeaves.isWeekday,
    isApprovedLeaveOnDate: actualLeaves.isApprovedLeaveOnDate,
    fetchTimesheetsFresh: vi.fn(async () => mockFreshTimesheets),
    displayName: (profile: { fullName: string } | null | undefined) => profile?.fullName || '',
    hrActions: {
      getAbsenceRecords: vi.fn(async () => mockAbsenceHistory),
      getAllAbsenceRecordsIncludingDeleted: vi.fn(async () => mockAbsenceHistory),
      bulkDeleteAbsenceRecords: bulkDeleteAbsenceRecordsMock,
      addNotification: addNotificationMock,
    },
  };
});

// Only pbCreate is actually invoked by runAbsenceCheck (the write path);
// everything else in ./shared is pure and kept real.
const pbCreateMock = vi.fn(async (_collection: string, fields: any) => ({ id: 'new-record-id', ...fields }));
vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return { ...actual, pbCreate: pbCreateMock };
});

// Imported AFTER the mocks above (vi.mock calls are hoisted by vitest, so
// declaration order in the file doesn't matter, but importing here keeps
// the intent readable).
const { absenceActions } = await import('./absences');

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'emp1', fullName: 'Test Employee', email: 'test@delcargo.us', role: 'employee',
    joinedDate: '2026-01-01', onboardingCompleted: true, baseSalary: 60000, teams: [],
    region: 'Pakistan', ...overrides,
  };
}

// A full 8-hour shift (480 minutes, well above both the 240-minute
// "present" floor and the standard shift length) on the given NY calendar
// date — used to make every OTHER weekday in the 5-day lookback window
// "present" so a test can isolate its assertion to one target date.
function fullShiftOn(email: string, nyDateStr: string): TimesheetEntry {
  return {
    id: `ts-${nyDateStr}`, employeeEmail: email, date: nyDateStr,
    clockIn: `${nyDateStr}T13:00:00Z`, clockOut: `${nyDateStr}T21:00:00Z`, // 9am-5pm EDT
    status: 'completed', approvalStatus: 'approved',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFreshTimesheets = [];
  mockAbsenceHistory = [];
  pbCreateMock.mockClear();
  // Pinned "today": Wednesday 2026-09-16, so the 5-day lookback window
  // (today-5 through yesterday) covers Sep 11 (Fri), 12 (Sat), 13 (Sun),
  // 14 (Mon), 15 (Tue) — only 11, 14, and 15 are weekdays. Every scenario
  // below targets Sep 15 and gives full attendance on Sep 11/14 so only
  // Sep 15's classification is actually under test.
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-16T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function extractCreatedRecords() {
  return pbCreateMock.mock.calls.map(([, fields]) => fields as Omit<AbsenceRecord, 'id'>);
}

describe('runAbsenceCheck — reason classification', () => {
  it('marks a Pakistan employee absent with reason "no_clock_in" when they never clocked in that weekday', async () => {
    const emp = makeProfile();
    mockFreshTimesheets = [fullShiftOn(emp.email, '2026-09-11'), fullShiftOn(emp.email, '2026-09-14')]; // present on the other 2 eligible weekdays
    await absenceActions.runAbsenceCheck([emp], [], [], []);
    const created = extractCreatedRecords();
    const target = created.find(r => r.date === '2026-09-15');
    expect(target).toBeDefined();
    expect(target!.reason).toBe('no_clock_in');
    expect(target!.workedMinutes).toBeUndefined();
  });

  it('marks a Pakistan employee absent with reason "under_4_hours" when they worked less than the 240-minute floor', async () => {
    const emp = makeProfile();
    mockFreshTimesheets = [
      fullShiftOn(emp.email, '2026-09-11'), fullShiftOn(emp.email, '2026-09-14'),
      { id: 'ts-partial', employeeEmail: emp.email, date: '2026-09-15', clockIn: '2026-09-15T13:00:00Z', clockOut: '2026-09-15T14:30:00Z', status: 'completed', approvalStatus: 'approved' }, // 90 minutes
    ];
    await absenceActions.runAbsenceCheck([emp], [], [], []);
    const created = extractCreatedRecords();
    const target = created.find(r => r.date === '2026-09-15');
    expect(target).toBeDefined();
    expect(target!.reason).toBe('under_4_hours');
    expect(target!.workedMinutes).toBe(90);
  });

  it('marks a Pakistan employee absent with reason "inactivity" when a single continuous inactivity run reaches 37+ minutes during a shift that otherwise cleared the 4-hour floor', async () => {
    const emp = makeProfile();
    mockFreshTimesheets = [
      fullShiftOn(emp.email, '2026-09-11'), fullShiftOn(emp.email, '2026-09-14'),
      { id: 'ts-target', employeeEmail: emp.email, date: '2026-09-15', clockIn: '2026-09-15T13:00:00Z', clockOut: '2026-09-15T20:00:00Z', status: 'completed', approvalStatus: 'approved' }, // 420 minutes — well above the 4h floor
    ];
    const inactivityLogs: InactivityLog[] = [
      { id: 'log1', employeeEmail: emp.email, startAt: '2026-09-15T15:00:00Z', endAt: '2026-09-15T15:40:00Z', durationSeconds: 40 * 60 },
    ];
    await absenceActions.runAbsenceCheck([emp], [], [], inactivityLogs);
    const created = extractCreatedRecords();
    const target = created.find(r => r.date === '2026-09-15');
    expect(target).toBeDefined();
    expect(target!.reason).toBe('inactivity');
    expect(target!.inactivityMinutes).toBe(40);
  });

  it('does NOT flag inactivity when no single continuous run reaches the 37-minute threshold, even if several shorter gaps would sum past it', async () => {
    const emp = makeProfile();
    mockFreshTimesheets = [
      fullShiftOn(emp.email, '2026-09-11'), fullShiftOn(emp.email, '2026-09-14'),
      { id: 'ts-target', employeeEmail: emp.email, date: '2026-09-15', clockIn: '2026-09-15T13:00:00Z', clockOut: '2026-09-15T20:00:00Z', status: 'completed', approvalStatus: 'approved' },
    ];
    // Two 20-minute gaps (40 min total) — neither alone reaches 37 minutes.
    const inactivityLogs: InactivityLog[] = [
      { id: 'log1', employeeEmail: emp.email, startAt: '2026-09-15T14:00:00Z', endAt: '2026-09-15T14:20:00Z', durationSeconds: 20 * 60 },
      { id: 'log2', employeeEmail: emp.email, startAt: '2026-09-15T16:00:00Z', endAt: '2026-09-15T16:20:00Z', durationSeconds: 20 * 60 },
    ];
    await absenceActions.runAbsenceCheck([emp], [], [], inactivityLogs);
    const created = extractCreatedRecords();
    expect(created.find(r => r.date === '2026-09-15')).toBeUndefined();
  });
});

describe('runAbsenceCheck — USA employees are excluded entirely', () => {
  it('never creates an absence record for a USA-region employee, even with zero clocked minutes', async () => {
    const emp = makeProfile({ region: 'USA' });
    mockFreshTimesheets = [];
    await absenceActions.runAbsenceCheck([emp], [], [], []);
    expect(pbCreateMock).not.toHaveBeenCalled();
  });
});

describe('runAbsenceCheck — approved leave overrides everything', () => {
  it('does not mark an employee absent on a date fully covered by an approved leave, regardless of hours worked', async () => {
    const emp = makeProfile();
    mockFreshTimesheets = [fullShiftOn(emp.email, '2026-09-11'), fullShiftOn(emp.email, '2026-09-14')]; // Sep 15 has zero minutes, which would normally be no_clock_in
    // Nominal "2026-09-16 - 2026-09-16" reads back (after the same
    // new Date(...) + NY-conversion shift documented in leaves.test.ts /
    // payroll.test.ts) as the actual NY date 2026-09-15 — the target date.
    const leaves: LeaveApplication[] = [
      { id: 'lv1', employeeName: emp.fullName, type: 'PTO', duration: '2026-09-16 - 2026-09-16', status: 'approved', reason: 'vacation' },
    ];
    await absenceActions.runAbsenceCheck([emp], [], leaves, []);
    const created = extractCreatedRecords();
    expect(created.find(r => r.date === '2026-09-15')).toBeUndefined();
  });
});

describe('runAbsenceCheck — exemption and joining-date guards', () => {
  it('completely skips an employee flagged exemptFromAbsenceCheck', async () => {
    const emp = makeProfile({ exemptFromAbsenceCheck: true });
    mockFreshTimesheets = [];
    await absenceActions.runAbsenceCheck([emp], [], [], []);
    expect(pbCreateMock).not.toHaveBeenCalled();
  });

  it('never marks a date before the employee\'s own joinedDate as absent', async () => {
    const emp = makeProfile({ joinedDate: '2026-09-16' }); // joins the day AFTER the target date
    mockFreshTimesheets = [fullShiftOn(emp.email, '2026-09-11'), fullShiftOn(emp.email, '2026-09-14')];
    await absenceActions.runAbsenceCheck([emp], [], [], []);
    const created = extractCreatedRecords();
    expect(created.find(r => r.date === '2026-09-15')).toBeUndefined();
  });
});

describe('runAbsenceCheck — dedup against existing history', () => {
  it('does not re-create a record for an employee/date combination already present in absence history (active or soft-deleted)', async () => {
    const emp = makeProfile();
    mockFreshTimesheets = [fullShiftOn(emp.email, '2026-09-11'), fullShiftOn(emp.email, '2026-09-14')]; // Sep 15 still has zero minutes
    mockAbsenceHistory = [
      { id: 'existing1', employeeEmail: emp.email, employeeName: emp.fullName, date: '2026-09-15', reason: 'no_clock_in', deductionAmount: 2000, createdAt: '2026-09-15T00:00:00Z', acknowledged: false },
    ];
    await absenceActions.runAbsenceCheck([emp], [], [], []);
    expect(pbCreateMock).not.toHaveBeenCalled();
  });
});
