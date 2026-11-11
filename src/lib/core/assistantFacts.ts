import type { AbsenceRecord, LeaveApplication, Profile, TimesheetEntry } from '../hr/types';
import { absenceReasonLabel } from './absences';
import { calculatePTOAccrued, getAccruedPTOForDisplay, getApprovedLeaveDays, getLeaveRange, getPTOAccrualDate, getRemainingPTO, leaveDayCount } from './leaves';
import { elapsedMinutes } from './timesheets';
import { absenceFloorMinutes, requiredDayMinutes } from './workDay';
import { getNYDateString } from '../timezone';
import { isNameMismatch } from './communicationAudit';

// The facts Del (the HR assistant) reads out: tickets, the communication trail, attendance days, why an absence was recorded, and leave
// balances. Pure, so each rule is tested; the live runner only fetches rows and hands them here. No names or addresses leave this file raw:
// callers pass in the alias lookup, and addresses are only ever reported as groups ("Address A").

const DAY = 86400000;
const ms = (iso: unknown) => Date.parse(String(iso || '').replace(' ', 'T'));
const minutesText = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;

// ── tickets ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface TicketRow {
  id: string; employeeName: string; employeeEmail: string; subject: string; description: string; department: string; status: string; created: string;
  replies: { senderRole?: string; message?: string; timestamp?: string; event?: string }[];
}
export interface TicketFilter { status?: 'open' | 'closed' | 'all'; olderThanDays?: number; search?: string; employeeEmail?: string; department?: string; waitingOn?: 'hr' | 'employee' }

/** One ticket in plain facts: how old, how many replies, who spoke last and so who is being waited on. */
export function ticketFacts(t: TicketRow, now: number) {
  const spoken = (t.replies || []).filter(r => r.message && !r.event);
  const last = spoken[spoken.length - 1];
  const lastFrom = last ? (last.senderRole === 'employee' ? 'employee' : 'HR') : null;
  const lastAt = last ? ms(last.timestamp) : ms(t.created);
  return {
    ageDays: Math.max(0, Math.floor((now - ms(t.created)) / DAY)),
    replies: spoken.length,
    lastReplyFrom: lastFrom,
    waitingOn: t.status !== 'open' ? null : lastFrom === 'HR' ? 'employee' : 'HR',
    quietDays: Number.isFinite(lastAt) ? Math.max(0, Math.floor((now - lastAt) / DAY)) : null,
  };
}

/** Tickets matching every filter given, oldest first when filtering by age, otherwise newest first. */
export function filterTickets(rows: TicketRow[], f: TicketFilter, now: number): TicketRow[] {
  const q = (f.search || '').trim().toLowerCase();
  const out = rows.filter(t => {
    if (f.status && f.status !== 'all' && t.status !== f.status) return false;
    if (f.employeeEmail && (t.employeeEmail || '').toLowerCase() !== f.employeeEmail.toLowerCase()) return false;
    if (f.department && t.department !== f.department) return false;
    const facts = ticketFacts(t, now);
    if (typeof f.olderThanDays === 'number' && facts.ageDays < f.olderThanDays) return false;
    if (f.waitingOn && facts.waitingOn !== (f.waitingOn === 'hr' ? 'HR' : 'employee')) return false;
    if (q && !`${t.subject} ${t.description}`.toLowerCase().includes(q)) return false;
    return true;
  });
  return typeof f.olderThanDays === 'number' ? out.sort((a, b) => ms(a.created) - ms(b.created)) : out.sort((a, b) => ms(b.created) - ms(a.created));
}

// ── the communication trail ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface TrailRow { kind: string; actor: string; actor_role: string; claimed_sender: string; ip: string; country: string; device: string; occurred_at: string }

/**
 * Who sent each message on a ticket and from where. Addresses become groups ("Address A") so the assistant can say two replies came from the
 * same place or different places without ever holding a raw address; the raw ones are on the trail page, which only HR and Admin can open.
 */
export function summariseTrail(rows: TrailRow[], whoIs: (email: string) => string) {
  const label = new Map<string, string>();
  const group = (ip: string) => { if (!ip) return 'unknown address'; if (!label.has(ip)) label.set(ip, `Address ${String.fromCharCode(65 + label.size)}`); return label.get(ip)!; };
  const entries = [...rows].sort((a, b) => ms(a.occurred_at) - ms(b.occurred_at)).map(r => ({
    when: String(r.occurred_at || '').slice(0, 16).replace('T', ' ') + ' UTC',
    what: r.kind,
    account: whoIs(r.actor),
    role: r.actor_role,
    address: group(r.ip),
    country: r.country || 'unknown',
    device: r.device || 'unknown',
    ...(isNameMismatch(r) ? { signed_in_as_different_person_than_the_name_on_the_message: true } : {}),
  }));
  const perAccount = new Map<string, Set<string>>();
  for (const e of entries) (perAccount.get(e.account) ?? perAccount.set(e.account, new Set()).get(e.account)!).add(`${e.address} / ${e.device}`);
  return {
    messages_recorded: entries.length,
    addresses_seen: label.size,
    entries,
    accounts_using_several_places: [...perAccount.entries()].filter(([, s]) => s.size > 1).map(([account, s]) => ({ account, places: [...s] })),
  };
}

// ── absences: why one was recorded, and who recorded it ──────────────────────────────────────────────────────────────────────────

/** How an absence came to be: the tracker ending the shift live at the 37-minute limit, or the daily check reviewing the day afterwards. */
export function absenceSource(r: Pick<AbsenceRecord, 'reason' | 'createdAt'>, shifts: Pick<TimesheetEntry, 'clockOut'>[]): string {
  if (r.reason === 'inactivity') {
    const made = ms(r.createdAt);
    if (shifts.some(s => s.clockOut && Math.abs(ms(s.clockOut) - made) < 3 * 60000)) return 'The tracker ended the shift the moment 37 minutes of continuous inactivity was reached, and recorded the absence at once.';
    return 'The daily check found an idle stretch of 37 minutes or more inside a shift.';
  }
  return 'The daily check reviewed the day after it ended.';
}

export function absenceFacts(
  records: AbsenceRecord[], shifts: TimesheetEntry[], leaves: LeaveApplication[], p: Pick<Profile, 'fullName' | 'partTime'>,
) {
  return records.filter(r => !r.deleted).sort((a, b) => a.date.localeCompare(b.date)).map(r => {
    const near = leaves.find(l => l.employeeName === p.fullName && l.status !== 'rejected' && (() => { const g = getLeaveRange(l); return !!g && r.date >= g.start && r.date <= g.end; })());
    return {
      date: r.date,
      why: absenceReasonLabel(r, absenceFloorMinutes(p)),
      how_it_was_recorded: absenceSource(r, shifts.filter(s => s.clockOut)),
      ...(near ? { leave_request_covering_this_day: near.status === 'approved' ? 'Approved leave covers this day, so it is not charged.' : `A leave request covers this day but is not final yet (${near.status === 'hr_approved' ? 'HR approved, waiting for the CEO' : near.status}); the day is charged until it is approved.` } : {}),
    };
  });
}

// ── one employee's day ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export function attendanceDay(
  date: string, shifts: TimesheetEntry[], absences: AbsenceRecord[], leaves: LeaveApplication[], p: Pick<Profile, 'fullName' | 'partTime' | 'region'>, now: number,
) {
  const mine = shifts.filter(s => s.clockIn && getNYDateString(new Date(s.clockIn)) === date).sort((a, b) => a.clockIn.localeCompare(b.clockIn));
  const time = (iso: string) => new Date(iso).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  const absence = absences.find(r => !r.deleted && r.date === date);
  const onLeave = leaves.find(l => l.employeeName === p.fullName && l.status === 'approved' && (() => { const g = getLeaveRange(l); return !!g && date >= g.start && date <= g.end; })());
  const total = mine.reduce((s, t) => s + elapsedMinutes(t.clockIn, t.clockOut, now), 0);
  return {
    date,
    shifts: mine.map(t => {
      const idleEnd = !!t.clockOut && !!absence && absence.reason === 'inactivity' && Math.abs(ms(t.clockOut) - ms(absence.createdAt)) < 3 * 60000;
      return {
        started: `${time(t.clockIn)} New York time`,
        ended: t.clockOut ? `${time(t.clockOut)} New York time` : 'still open',
        length: minutesText(elapsedMinutes(t.clockIn, t.clockOut, now)),
        ...(idleEnd ? { ended_by: 'the tracker, after 37 minutes of continuous inactivity (an absence was recorded)' } : {}),
      };
    }),
    total_worked: minutesText(total),
    required_for_a_full_day: minutesText(requiredDayMinutes(p)),
    ...(p.region === 'USA' ? { how_attendance_is_marked: 'USA staff are clocked in and out automatically by their phone at the warehouse (geofence); there is no desktop tracker.' } : {}),
    ...(absence ? { absence_recorded: { why: absenceReasonLabel(absence, absenceFloorMinutes(p)), how: absenceSource(absence, mine) } } : {}),
    ...(onLeave ? { approved_leave: `${onLeave.type} (${leaveDayCount(getLeaveRange(onLeave)!)} day request)` } : {}),
    ...(!mine.length && !absence && !onLeave ? { note: 'No shift, absence record or approved leave for this day (it may be a weekend, or the day may not have been checked yet).' } : {}),
  };
}

// ── leave balance ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export function leaveBalance(p: Pick<Profile, 'fullName' | 'joinedDate' | 'accountCreationDate'>, leaves: LeaveApplication[], now: Date) {
  const since = getPTOAccrualDate(p);
  const mine = leaves.filter(l => l.employeeName === p.fullName);
  const year = String(now.getFullYear());
  const takenByType: Record<string, number> = {};
  for (const l of mine) {
    if (l.status !== 'approved') continue;
    const g = getLeaveRange(l);
    if (!g || g.start.slice(0, 4) !== year) continue;
    takenByType[l.type] = (takenByType[l.type] || 0) + leaveDayCount(g);
  }
  const usable = getRemainingPTO(mine, p.fullName, since, now);
  const shown = getAccruedPTOForDisplay(since, now);
  const real = calculatePTOAccrued(since, now);
  return {
    pto_and_sick_accrued_so_far: real,
    pto_and_sick_taken_days: getApprovedLeaveDays(mine, p.fullName, ['PTO', 'Sick Leave']),
    usable_balance_now: usable,
    ...(shown === 0 && real > 0 ? { note: 'PTO and sick leave are frozen company-wide until 1 January 2027: the usable balance reads 0 and new PTO/sick requests are closed, but accrual keeps counting and nothing is lost.' } : {}),
    approved_days_taken_this_year_by_type: takenByType,
    requests_waiting: mine.filter(l => l.status === 'pending' || l.status === 'hr_approved').length,
  };
}
