// src/lib/hr/absences.ts
// Absence records (hr_absence_records), the no-call-no-show detection used
// by runAbsenceCheck, and mouse inactivity logs (which feed absence
// detection). Extracted from the former
// hrData.ts monolith (plan 014). See plans/014-split-hrdata-monolith.md.

'use client';
import { useQuery } from '@tanstack/react-query';
import { getAuthToken } from '../session';
import { API_BASE } from '../apiBase';
import {
  countAbsentWeekdays, detectAbsences, describeAbsence, findWeekendAbsenceRecords, findPreJoinAbsenceRecords,
} from '../core/absences';
import type { AbsenceRecord, MyAbsenceRecord, InactivityLog, Profile, TimesheetEntry, LeaveApplication } from './types';
import { pbList, pbListStrict, pbCreate, pbUpdate, formatMoney } from './shared';
import { hrActions, fetchTimesheetsFresh, displayName } from '../hrData';

export { countAbsentWeekdays };
import { pbFilter } from '../pbFilter';
import { daysAgoNYDateString } from '../timezone';
import type { PbRow } from '@/lib/pbTypes';
import { toAbsenceRecord } from '../core/payrollMappers';

// Columns toAbsenceRecord reads — keeps each fetched row small.
const ABSENCE_FIELDS = 'id,employeeEmail,employeeName,date,reason,inactivityMinutes,workedMinutes,deductionAmount,createdAt,created,acknowledged,deleted,deletedAt';


export function useMyAbsenceRecords() {
  return useQuery({
    queryKey: ['absences_me'],
    queryFn: async (): Promise<MyAbsenceRecord[]> => {
      const token = getAuthToken();
      if (!token) return [];
      const res = await fetch(`${API_BASE}/api/absences/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.items || []) as MyAbsenceRecord[];
    },
  });
}



export const absenceActions = {
  // ── Absence records (hr_absence_records — one row per employee per day) ──
  // Migrated off the old hr_absence_records_v1 / hr_absence_deleted_v1 KV
  // blobs (a growing array rewritten wholesale on every delete, plus a
  // separate tombstone-id array) into a real collection with soft-delete
  // (`deleted`/`deletedAt`) fields replacing the tombstone array, and a
  // partial unique index on (employeeEmail, date) WHERE deleted = false —
  // see AbsenceRecord's own comment. getAbsenceRecords below is
  // active-only (what the UI should show); runAbsenceCheck separately
  // fetches the FULL history including soft-deleted rows so it never
  // resurrects a record HR already removed.
  // `sinceDate` ("YYYY-MM-DD") limits the fetch to records on/after that day —
  // pages that only need recent months (payroll) pass it instead of pulling
  // the entire history. Omit it for the full history.
  // `email` scopes it to one employee server-side (an employee's own view
  // must not download everyone's records and filter client-side).
  getAbsenceRecords: async (opts: { sinceDate?: string; email?: string } = {}): Promise<AbsenceRecord[]> => {
    const parts = ['deleted = false'];
    if (opts.sinceDate) parts.push(pbFilter('date >= {:since}', { since: opts.sinceDate }));
    if (opts.email) parts.push(pbFilter('employeeEmail ~ {:email}', { email: opts.email }));
    const rows = (await pbList('hr_absence_records', { filter: parts.join(' && '), fields: ABSENCE_FIELDS })).map(toAbsenceRecord);
    const wanted = opts.email?.toLowerCase();
    return wanted ? rows.filter(r => r.employeeEmail.toLowerCase() === wanted) : rows;
  },
  // pbListStrict: this is the history runAbsenceCheck de-duplicates against. A failed read must be an error, not "no history",
  // or every absence in the window would be created a second time (and deducted twice).
  getAllAbsenceRecordsIncludingDeleted: async (opts: { sinceDate?: string } = {}): Promise<AbsenceRecord[]> =>
    (await pbListStrict('hr_absence_records', {
      ...(opts.sinceDate ? { filter: pbFilter('date >= {:since}', { since: opts.sinceDate }) } : {}),
      fields: ABSENCE_FIELDS,
    })).map(toAbsenceRecord),
  deleteAbsenceRecord: async (recordId: string): Promise<void> => {
    await pbUpdate('hr_absence_records', recordId, { deleted: true, deletedAt: new Date().toISOString() });
  },
  // Bulk removal — one write PER record but all fired concurrently via
  // Promise.all, rather than the old approach's full-array rewrite (which
  // needed both stores rewritten wholesale for even a single record).
  bulkDeleteAbsenceRecords: async (recordIds: string[]): Promise<void> => {
    if (recordIds.length === 0) return;
    const deletedAt = new Date().toISOString();
    await Promise.all(recordIds.map(id => pbUpdate('hr_absence_records', id, { deleted: true, deletedAt })));
  },
  // Marks a record as seen so AbsentPopup stops showing it — called by the
  // employee dismissing the popup, never by HR/Admin (they can always see
  // every record on the Absent Details page regardless of acknowledgment).
  acknowledgeAbsence: async (recordId: string): Promise<void> => {
    await pbUpdate('hr_absence_records', recordId, { acknowledged: true });
  },

  // No-call-no-show / mouse-inactivity auto-absence check. Client-triggered
  // (no server cron exists in this app — see pb_hooks, none use cronAdd),
  // meant to be called once per HR/Admin dashboard mount, same pattern as
  // closeStaleManualShiftIfAbandoned above but for the whole roster instead
  // of a single employee's own shift.
  //
  // Two ways a Pakistan-region employee's weekday can end up marked absent
  // (USA staff excluded — they clock in/out automatically via GPS geofence,
  // so a gap there means a device/GPS issue, not a no-show):
  //   1. 'no_clock_in' — no timesheet shift at all that day, and no
  //      approved leave covering it.
  //   2. 'inactivity' — they DID clock in, but the desktop Tracker agent's
  //      mouse-inactivity logs (hr_inactivity_logs) show 35+ continuous
  //      minutes of inactivity at some point during that day's shift(s).
  //      Per explicit product decision, this carries the exact same
  //      penalty as never clocking in at all.
  // Only ever creates NEW records for days not already recorded — this is
  // safe to call from every HR/Admin dashboard mount, it just no-ops once a
  // given employee+date combination has already been decided.
  runAbsenceCheck: async (employees: Profile[], _timesheets: TimesheetEntry[], leaves: LeaveApplication[], inactivityLogs: InactivityLog[]): Promise<void> => {
    // BUGFIX 2026-09-08: the `_timesheets` parameter is deliberately IGNORED
    // below in favor of a fresh fetch. This function is called from a
    // useEffect on the HR/Admin dashboard whose `timesheets` comes from
    // useTimesheets()'s React Query cache — staleTime 1 minute,
    // refetchOnWindowFocus disabled (see providers.tsx), no polling
    // interval. A dashboard tab left open for a while (very normal — HR/
    // Admin tend to keep it open all day) can sit on an HOURS-old snapshot
    // that simply predates shifts an employee clocked later that same day,
    // since nothing forces a refetch in between. Confirmed live: an
    // employee (luna@delcargo.us) with ~7 hours of real, clocked shifts on
    // a given date was still marked absent for "not starting a shift"
    // (0 minutes worked) that date — the check had run against a cached
    // timesheets snapshot taken before her later shifts existed. Given the
    // real financial consequence (an incorrect 2-days'-pay deduction) and
    // that this only ever evaluates days that have already fully ended
    // (see the `dateStr >= nyTodayStr` cutoff below), it's worth the one
    // extra network round trip to guarantee this can never again decide
    // someone's attendance from out-of-date shift data.
    // detectAbsences only looks ABSENCE_LOOKBACK_DAYS back; a small margin on top
    // of that keeps this to a single page instead of the 60-day default.
    const timesheets = await fetchTimesheetsFresh({ days: 10 });
    // The check only creates records inside its 5-day lookback, and its
    // self-healing cleanups only matter for recent mistakes — so it never needs
    // the whole table: 60 days of active records for the cleanups, 10 days
    // (incl. soft-deleted) for the don't-resurrect-a-deleted-absence check.
    const cleanupWindow = { sinceDate: daysAgoNYDateString(60) };
    const dedupeWindow = { sinceDate: daysAgoNYDateString(10) };
    let existingRecords = await hrActions.getAbsenceRecords(cleanupWindow);

    // Self-healing cleanup: the old PKT-based day bucketing (fixed above)
    // could occasionally land an absence record's date on an actual
    // Saturday/Sunday by the NY calendar. Weekends are never a workday, so
    // any such record is always wrong — reverse it and notify everyone
    // involved rather than leaving a stale bad deduction on the books.
    const weekendRecords = findWeekendAbsenceRecords(existingRecords);
    if (weekendRecords.length > 0) {
      // One batched write for both the records array and the tombstone list
      // (bulkDeleteAbsenceRecords) instead of deleteAbsenceRecord per
      // record, which was 2 full read-modify-write round trips PER bad
      // record found. Notifications still go out individually since each
      // one names a specific employee/date.
      await hrActions.bulkDeleteAbsenceRecords(weekendRecords.map(r => r.id));
      await Promise.all(weekendRecords.map(rec => {
        const note = `${rec.employeeName}'s absence deduction for ${rec.date} (a weekend) was reversed — employees are never marked absent on Saturdays or Sundays.`;
        return Promise.all([
          hrActions.addNotification('all', 'hr', note, undefined, undefined, rec.employeeEmail),
          hrActions.addNotification('all', 'admin', note, undefined, undefined, rec.employeeEmail),
          hrActions.addNotification(rec.employeeEmail, 'employee', `Your absence deduction for ${rec.date} has been reversed — that date was a weekend and should not have been marked absent.`),
        ]);
      }));
      existingRecords = await hrActions.getAbsenceRecords(cleanupWindow);
    }

    // Self-healing cleanup #2: an absence record dated before the matching
    // employee's own joinedDate is always wrong (can't be absent from a job
    // you hadn't started yet) — e.g. an employee added on the 16th getting
    // marked absent for the 14th. This can happen if the check ever ran
    // while the profile's joinedDate was still unset/being saved, or from
    // any other timing/config drift — reverse it the same way as the
    // weekend cleanup above, whatever the original cause.
    const preJoinRecords = findPreJoinAbsenceRecords(existingRecords, employees);
    if (preJoinRecords.length > 0) {
      await hrActions.bulkDeleteAbsenceRecords(preJoinRecords.map(r => r.id));
      await Promise.all(preJoinRecords.map(rec => {
        const note = `${rec.employeeName}'s absence deduction for ${rec.date} was reversed — that date is before their joining date and they weren't employed yet.`;
        return Promise.all([
          hrActions.addNotification('all', 'hr', note, undefined, undefined, rec.employeeEmail),
          hrActions.addNotification('all', 'admin', note, undefined, undefined, rec.employeeEmail),
          hrActions.addNotification(rec.employeeEmail, 'employee', `Your absence deduction for ${rec.date} has been reversed — that date is before your joining date.`),
        ]);
      }));
      existingRecords = await hrActions.getAbsenceRecords(cleanupWindow);
    }

    // Full history INCLUDING soft-deleted rows — the partial unique index on
    // hr_absence_records only constrains non-deleted rows, so checking
    // active-only records here would let this loop resurrect an absence HR
    // already deleted the moment its date rolled back into the 5-day
    // lookback window below. Keyed by employeeEmail_date (lowercase) rather
    // than record id, since ids are now opaque PocketBase ids, not the old
    // `${email}_${date}` composite string.
    const fullHistory = await hrActions.getAllAbsenceRecordsIncludingDeleted(dedupeWindow);
    const ignoredKeys = new Set(fullHistory.map(r => `${r.employeeEmail.toLowerCase()}_${r.date}`));
    const newRecords: Omit<AbsenceRecord, 'id'>[] = [];
    // Keyed by employeeEmail_date, same as ignoredKeys/freshIgnoredKeys —
    // holds the notification payload for each newly-detected absence until
    // we know for certain THIS call is the one that actually created the
    // record (see the bugfix comment below, near newRecords.push).
    const pendingNotifications = new Map<string, { emp: Profile; dateStr: string; reason: AbsenceRecord['reason']; inactivityMinutes?: number; workedMinutes?: number; deductionAmount: number; name: string }>();

    const candidates = detectAbsences({ employees, timesheets, leaves, inactivityLogs, ignoredKeys });
    for (const { employee: emp, date: dateStr, reason, inactivityMinutes, workedMinutes, deductionAmount } of candidates) {
      const name = displayName(emp, 'hr');
      // BUGFIX 2026-09-08: notifications used to be sent the moment a scan
      // computed someone as newly absent — before the DB write (and its
      // de-dupe check) ran — so two dashboards mounting at once sent the
      // notification triple twice for the same absence. Now the record + its
      // notification payload are just collected here; notifications go out
      // later, only for records THIS call actually manages to create.
      newRecords.push({
        employeeEmail: emp.email, employeeName: emp.fullName, date: dateStr,
        reason, inactivityMinutes, workedMinutes, deductionAmount, createdAt: new Date().toISOString(), acknowledged: false,
      });
      pendingNotifications.set(`${emp.email.toLowerCase()}_${dateStr}`, { emp, dateStr, reason, inactivityMinutes, workedMinutes, deductionAmount, name });
    }

    if (newRecords.length > 0) {
      // Re-fetch the full history (including soft-deleted rows) immediately
      // before creating, rather than reusing the fullHistory snapshot taken
      // at the top of this function. This function can run for several
      // seconds — if HR/Admin deletes an existing absence record while this
      // run is still in flight (or a second dashboard mount's
      // runAbsenceCheck runs concurrently), creating against the stale
      // snapshot would silently resurrect that deletion, which is exactly
      // the "deleted absence comes back" bug this closes. Re-reading fresh
      // right before creating means a concurrent delete always wins over a
      // stale in-flight check.
      const freshHistory = await hrActions.getAllAbsenceRecordsIncludingDeleted(dedupeWindow);
      const freshIgnoredKeys = new Set(freshHistory.map(r => `${r.employeeEmail.toLowerCase()}_${r.date}`));
      const safeNewRecords = newRecords.filter(r => !freshIgnoredKeys.has(`${r.employeeEmail.toLowerCase()}_${r.date}`));
      // Independent creates rather than one batched array write — the
      // partial unique index on (employeeEmail, date) WHERE deleted = false
      // is the database's own guarantee against a duplicate, so a rare
      // concurrent create landing between the fresh-fetch above and this
      // create (e.g. two dashboard mounts racing) is just a benign
      // constraint violation to swallow, not a bug to prevent client-side.
      // Track which ones actually succeeded — only those get notified.
      await Promise.all(safeNewRecords.map(async (r) => {
        try {
          await pbCreate('hr_absence_records', r);
        } catch {
          // Lost the race (or a genuine write error) — someone else's call
          // already created this record, or will notify for it themselves.
          // Either way, THIS call must not notify for it too.
          pendingNotifications.delete(`${r.employeeEmail.toLowerCase()}_${r.date}`);
        }
      }));
    }

    // Send notifications only for records this call actually created.
    await Promise.all(Array.from(pendingNotifications.values()).map(({ emp, dateStr, reason, inactivityMinutes, workedMinutes, deductionAmount, name }) => {
      const { reasonText, empReasonDetail } = describeAbsence(reason, dateStr, inactivityMinutes, workedMinutes);
      return Promise.all([
        hrActions.addNotification('all', 'hr', `${name} ${reasonText} and was marked absent — ${formatMoney(deductionAmount, emp.region)} deducted (2 days' pay).`, 'leave_task', name, emp.email),
        // Dashboard-only for Admin — HR already got the pushable copy above,
        // and payroll deductions are an HR-owned workflow day-to-day.
        hrActions.addNotification('all', 'admin', `${name} ${reasonText} and was marked absent — ${formatMoney(deductionAmount, emp.region)} deducted (2 days' pay).`, undefined, undefined, emp.email),
        hrActions.addNotification(emp.email, 'employee', `You were marked absent for ${dateStr} (${empReasonDetail}). A ${formatMoney(deductionAmount, emp.region)} deduction (2 days' pay) has been applied.`, 'leave_task'),
      ]);
    }));
  },


  // ── Mouse inactivity logs (hr_inactivity_logs — see
  // migration_data/create_inactivity_logs_collection.py) ──────────────────
  getInactivityLogs: async (filters?: { employeeEmail?: string; sinceISO?: string; untilISO?: string; minDurationSeconds?: number }): Promise<InactivityLog[]> => {
    // Same case-insensitive-email pattern as getScreenshots — `~` narrows
    // server-side, exact check below guards against substring false-matches.
    const filterParts: string[] = [];
    const toPbDate = (iso: string) => iso.replace('T', ' ').replace('Z', '');
    if (filters?.employeeEmail) filterParts.push(pbFilter('employee_email ~ {:email}', { email: filters.employeeEmail }));
    if (filters?.sinceISO) filterParts.push(pbFilter('start_at >= {:since}', { since: toPbDate(filters.sinceISO) }));
    if (filters?.untilISO) filterParts.push(pbFilter('start_at <= {:until}', { until: toPbDate(filters.untilISO) }));
    if (filters?.minDurationSeconds) filterParts.push(pbFilter('duration_seconds >= {:min}', { min: filters.minDurationSeconds }));
    const records = await pbList('hr_inactivity_logs', {
      sort: '-start_at',
      fields: 'id,employee_email,start_at,end_at,duration_seconds,device_label',
      ...(filterParts.length ? { filter: filterParts.join(' && ') } : {}),
    });
    let logs: InactivityLog[] = records.map((r: PbRow) => ({
      id: r.id,
      employeeEmail: r.employee_email,
      startAt: r.start_at,
      endAt: r.end_at,
      durationSeconds: Number(r.duration_seconds) || 0,
      deviceLabel: r.device_label || undefined,
    }));
    if (filters?.employeeEmail) {
      const wanted = filters.employeeEmail.toLowerCase();
      logs = logs.filter(l => (l.employeeEmail || '').toLowerCase() === wanted);
    }
    return logs;
  },
};
