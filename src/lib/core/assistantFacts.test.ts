import { describe, expect, it } from 'vitest';
import type { AbsenceRecord, LeaveApplication, Profile, TimesheetEntry } from '../hr/types';
import { absenceFacts, absenceSource, attendanceDay, filterTickets, leaveBalance, summariseTrail, ticketFacts, type TicketRow, type TrailRow } from './assistantFacts';
import { LIVE_DEFS } from '../assistant/live';

const NOW = Date.parse('2026-11-10T16:00:00Z');
const days = (n: number) => new Date(NOW - n * 86400000).toISOString();

describe('Del reads tickets as facts: age, replies, who is being waited on', () => {
  const t = (id: string, over: Partial<TicketRow> = {}): TicketRow => ({ id, employeeName: 'Emily', employeeEmail: 'e@delcargo.us', subject: 'Salary delay', description: 'My salary has not arrived', department: 'hr', status: 'open', created: days(5), replies: [], ...over });
  it('is waiting on HR when nobody has replied or the employee spoke last, and on the employee when HR did', () => {
    expect(ticketFacts(t('a'), NOW)).toMatchObject({ ageDays: 5, replies: 0, lastReplyFrom: null, waitingOn: 'HR' });
    expect(ticketFacts(t('a', { replies: [{ senderRole: 'hr', message: 'Looking', timestamp: days(2) }] }), NOW)).toMatchObject({ replies: 1, lastReplyFrom: 'HR', waitingOn: 'employee', quietDays: 2 });
    expect(ticketFacts(t('a', { replies: [{ senderRole: 'hr', message: 'x', timestamp: days(2) }, { senderRole: 'employee', message: 'y', timestamp: days(1) }] }), NOW).waitingOn).toBe('HR');
    expect(ticketFacts(t('a', { status: 'closed' }), NOW).waitingOn).toBeNull();
  });
  it('ignores closed/reopened events when working out who spoke last', () => {
    expect(ticketFacts(t('a', { replies: [{ senderRole: 'employee', message: 'hi', timestamp: days(3) }, { senderRole: 'hr', event: 'closed', timestamp: days(1) }] }), NOW)).toMatchObject({ replies: 1, lastReplyFrom: 'employee' });
  });
  it('answers "open longer than 3 days", by person, by words, and by who it waits on', () => {
    const rows = [t('old', { created: days(6) }), t('new', { created: days(1), subject: 'VPN down', description: 'cannot connect', employeeEmail: 'b@delcargo.us', department: 'technical' }), t('shut', { status: 'closed', created: days(9) })];
    expect(filterTickets(rows, { status: 'open', olderThanDays: 3 }, NOW).map(x => x.id)).toEqual(['old']);
    expect(filterTickets(rows, { status: 'all' }, NOW).map(x => x.id)).toEqual(['new', 'old', 'shut']);
    expect(filterTickets(rows, { status: 'open', employeeEmail: 'B@delcargo.us' }, NOW).map(x => x.id)).toEqual(['new']);
    expect(filterTickets(rows, { status: 'open', search: 'salary' }, NOW).map(x => x.id)).toEqual(['old']);
    expect(filterTickets(rows, { status: 'open', department: 'technical' }, NOW).map(x => x.id)).toEqual(['new']);
    expect(filterTickets(rows, { status: 'open', waitingOn: 'employee' }, NOW)).toEqual([]);
  });
});

describe('the communication trail, as Del may see it', () => {
  const r = (over: Partial<TrailRow>): TrailRow => ({ kind: 'ticket_reply', actor: 'hr@delcargo.us', actor_role: 'hr', claimed_sender: 'hr@delcargo.us', ip: '203.0.113.5', country: 'PK', device: 'Chrome on Windows', occurred_at: '2026-11-09T19:24:00Z', ...over });
  const whoIs = (e: string) => (e === 'hr@delcargo.us' ? 'Employee 4' : 'an unknown account');
  it('groups addresses and never carries a raw one', () => {
    const out = summariseTrail([r({}), r({ ip: '198.51.100.9', country: 'US', device: 'Safari on iOS', occurred_at: '2026-11-09T20:46:00Z' }), r({ occurred_at: '2026-11-09T21:00:00Z' })], whoIs);
    expect(out.addresses_seen).toBe(2);
    expect(out.entries.map(e => e.address)).toEqual(['Address A', 'Address B', 'Address A']);
    expect(JSON.stringify(out)).not.toMatch(/203\.0\.113|198\.51\.100/);
  });
  it('lists them in time order and flags an account used from several places', () => {
    const out = summariseTrail([r({ ip: '198.51.100.9', device: 'Safari on iOS', occurred_at: '2026-11-09T20:00:00Z' }), r({ occurred_at: '2026-11-09T19:00:00Z' })], whoIs);
    expect(out.entries[0].address).toBe('Address A');
    expect(out.accounts_using_several_places).toEqual([{ account: 'Employee 4', places: ['Address A / Chrome on Windows', 'Address B / Safari on iOS'] }]);
  });
  it('flags a message that says one account sent it while another was signed in', () => {
    const out = summariseTrail([r({ claimed_sender: 'someone@delcargo.us' })], whoIs);
    expect(out.entries[0]).toHaveProperty('signed_in_as_different_person_than_the_name_on_the_message', true);
  });
  it('says plainly when nothing is recorded', () => {
    expect(summariseTrail([], whoIs)).toMatchObject({ messages_recorded: 0, addresses_seen: 0, entries: [] });
  });
});

const emp = (over: Partial<Profile> = {}): Profile => ({ id: 'p', fullName: 'Emily Test', email: 'e@delcargo.us', role: 'employee', joinedDate: '2024-01-01', onboardingCompleted: true, baseSalary: 45000, teams: [], region: 'Pakistan', ...over } as Profile);
const shift = (clockIn: string, clockOut?: string): TimesheetEntry => ({ id: clockIn, employeeEmail: 'e@delcargo.us', date: '', clockIn, clockOut, status: clockOut ? 'completed' : 'in_progress', approvalStatus: 'pending' });
const absence = (over: Partial<AbsenceRecord>): AbsenceRecord => ({ id: 'a', employeeEmail: 'e@delcargo.us', employeeName: 'Emily Test', date: '2026-11-09', reason: 'inactivity', inactivityMinutes: 37, deductionAmount: 0, createdAt: '2026-11-09T18:05:10Z', acknowledged: true, ...over } as AbsenceRecord);
const leave = (over: Partial<LeaveApplication>): LeaveApplication => ({ id: 'l', employeeName: 'Emily Test', type: 'Normal', duration: '', reason: '', status: 'approved', startDate: '2026-11-09', endDate: '2026-11-09', ...over } as LeaveApplication);

describe('why an absence was recorded, and how', () => {
  it('knows when the tracker ended the shift live and when the daily check found it', () => {
    expect(absenceSource(absence({}), [{ clockOut: '2026-11-09T18:05:00Z' }])).toMatch(/the moment 37 minutes/);
    expect(absenceSource(absence({}), [{ clockOut: '2026-11-09T22:00:00Z' }])).toMatch(/daily check found/);
    expect(absenceSource(absence({ reason: 'no_clock_in' }), [])).toMatch(/daily check reviewed/);
  });
  it('gives the plain reason, and a leave request that covers the day (final or not)', () => {
    const out = absenceFacts([absence({ reason: 'under_4_hours', workedMinutes: 193 })], [], [leave({ status: 'hr_approved' })], emp());
    expect(out[0].why).toBe('Only 3h 13m worked (the minimum is 4 hours)');
    expect(out[0].leave_request_covering_this_day).toMatch(/not final yet.*HR approved, waiting for the CEO/);
    expect(absenceFacts([absence({})], [], [leave({})], emp())[0].leave_request_covering_this_day).toMatch(/not charged/);
    expect(absenceFacts([absence({ deleted: true })], [], [], emp())).toEqual([]);
  });
  it('uses a part-time person’s own minimum', () => {
    expect(absenceFacts([absence({ reason: 'under_4_hours', workedMinutes: 120 })], [], [], emp({ partTime: true }))[0].why).toContain('minimum is 2.5 hours');
  });
});

describe('one employee’s day', () => {
  it('lists the shifts, the total, and says when the tracker ended one for idle time', () => {
    const out = attendanceDay('2026-11-09', [shift('2026-11-09T14:01:00Z', '2026-11-09T18:05:00Z'), shift('2026-11-09T18:07:00Z', '2026-11-09T22:08:00Z')], [absence({})], [], emp(), NOW);
    expect(out.shifts).toHaveLength(2);
    expect(out.shifts[0]).toMatchObject({ started: '9:01 AM New York time', ended: '1:05 PM New York time', length: '4h 04m' });
    expect(out.shifts[0]).toHaveProperty('ended_by');
    expect(out.shifts[1]).not.toHaveProperty('ended_by');
    expect(out.total_worked).toBe('8h 05m');
    expect(out.absence_recorded?.how).toMatch(/the moment 37 minutes/);
  });
  it('shows an open shift, a USA person’s geofence, and an empty day plainly', () => {
    expect(attendanceDay('2026-11-10', [shift('2026-11-10T14:00:00Z')], [], [], emp(), NOW).shifts[0].ended).toBe('still open');
    expect(attendanceDay('2026-11-10', [], [], [], emp({ region: 'USA' }), NOW).how_attendance_is_marked).toMatch(/geofence/);
    expect(attendanceDay('2026-11-08', [], [], [], emp(), NOW).note).toMatch(/weekend/);
  });
  it('reports approved leave on the day', () => {
    expect(attendanceDay('2026-11-09', [], [], [leave({})], emp(), NOW).approved_leave).toContain('Normal');
  });
});

describe('leave balance', () => {
  it('reads zero while the company-wide freeze is on, while saying accrual continues', () => {
    const out = leaveBalance(emp(), [leave({ type: 'PTO', startDate: '2026-03-02', endDate: '2026-03-03' })], new Date(NOW));
    expect(out.usable_balance_now).toBe(0);
    expect(out.pto_and_sick_accrued_so_far).toBeGreaterThan(0);
    expect(out.pto_and_sick_taken_days).toBe(2);
    expect(out.note).toMatch(/frozen/);
    expect(out.approved_days_taken_this_year_by_type).toEqual({ PTO: 2 });
  });
  it('counts requests still waiting', () => {
    expect(leaveBalance(emp(), [leave({ status: 'pending' }), leave({ status: 'hr_approved' }), leave({ status: 'rejected' })], new Date(NOW)).requests_waiting).toBe(2);
  });
});

describe('Del’s live tool list', () => {
  const names = LIVE_DEFS.map(d => d.function.name);
  it('has every tool once, including the new ones, and none that writes', () => {
    expect(new Set(names).size).toBe(names.length);
    for (const n of ['list_tickets', 'ticket_trail', 'attendance_day', 'absence_details', 'leave_balance']) expect(names).toContain(n);
    for (const n of names) expect(n).not.toMatch(/^(set|update|delete|create|send|pay|write|approve)_/);
  });
});
