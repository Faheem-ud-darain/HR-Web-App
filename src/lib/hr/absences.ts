// src/lib/hr/absences.ts
// Absence records (hr_absence_records), the no-call-no-show detection used
// by runAbsenceCheck, and mouse inactivity logs (which feed absence
// detection). checkScreenshotRetention also lives here — in the original
// file it sits directly under the "Mouse inactivity logs" banner with no
// separate section divider of its own, so it moved along with that section
// rather than being split out into profiles.ts on a guess; see plan 014's
// implementation notes for this judgment call. Extracted from the former
// hrData.ts monolith (plan 014). See plans/014-split-hrdata-monolith.md.

'use client';
import { useQuery } from '@tanstack/react-query';
import { getAuthToken } from '../session';
import { API_BASE } from '../apiBase';
import { getNYDateString } from '../timezone';
import type { AbsenceRecord, MyAbsenceRecord, InactivityLog, Profile, TimesheetEntry, LeaveApplication } from './types';
import { pbList, pbCreate, pbUpdate, pbDelete, pbGetKVByPrefix, pbDeleteKVByKeys, getWeekdaysInMonth, localShiftDate, formatMoney } from './shared';
import { hrActions, isWeekday, isApprovedLeaveOnDate, fetchTimesheetsFresh, displayName } from '../hrData';

function toAbsenceRecord(r: any): AbsenceRecord {
  return {
    id: r.id, employeeEmail: r.employeeEmail, employeeName: r.employeeName, date: r.date,
    reason: r.reason, inactivityMinutes: r.inactivityMinutes || undefined, workedMinutes: r.workedMinutes || undefined,
    deductionAmount: r.deductionAmount, createdAt: r.createdAt || r.created, acknowledged: !!r.acknowledged,
    deleted: !!r.deleted, deletedAt: r.deletedAt || undefined,
  };
}

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

// Per explicit product decision: only Pakistan-region employees are subject
// to this check (USA staff clock in/out automatically via GPS geofencing,
// so a "missing" shift there means something different — a device/GPS
// issue, not a no-show — and isn't penalized the same way). Counts weekdays
// (Mon-Fri, America/New_York calendar) in the current pay month, from the
// 1st through yesterday (today doesn't count — its 24 hours haven't fully
// elapsed yet), where the employee has neither a timesheet shift nor
// approved leave covering that day. Days before the employee's own
// joinedDate are never counted (can't be absent from a job you hadn't
// started yet).
export function countAbsentWeekdays(
  profile: Pick<Profile, 'fullName' | 'region' | 'joinedDate'>,
  timesheets: TimesheetEntry[],
  leaves: LeaveApplication[],
  today: Date = new Date()
): number {
  if (profile.region !== 'Pakistan') return 0;

  const todayStr = getNYDateString(today);
  // joinedDate is a plain calendar date ("YYYY-MM-DD") — take it directly
  // rather than round-tripping through new Date()+NY conversion, which reads
  // a date-only string as UTC midnight and rolls it back a day once
  // converted to NY time (see the matching fix/comment in runAbsenceCheck).
  const joinedStr = profile.joinedDate && /^\d{4}-\d{2}-\d{2}/.test(profile.joinedDate)
    ? profile.joinedDate.slice(0, 10)
    : '';

  // Every calendar date this employee actually has a shift recorded for,
  // regardless of which device/timezone wrote it — localShiftDate always
  // re-derives the date in America/New_York from the real clockIn instant.
  const shiftDates = new Set(
    timesheets
      .filter(t => t.employeeEmail && t.clockIn)
      .map(t => localShiftDate(t.clockIn, t.date))
  );

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  let absentDays = 0;
  for (const cursor = new Date(monthStart); cursor < today; cursor.setDate(cursor.getDate() + 1)) {
    const dateStr = getNYDateString(cursor);
    if (dateStr >= todayStr) break; // never count today or the future
    if (joinedStr && dateStr < joinedStr) continue; // not employed yet
    if (!isWeekday(dateStr)) continue;
    if (shiftDates.has(dateStr)) continue;
    if (isApprovedLeaveOnDate(leaves, profile.fullName, dateStr)) continue;
    absentDays++;
  }
  return absentDays;
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
  getAbsenceRecords: async (): Promise<AbsenceRecord[]> =>
    (await pbList('hr_absence_records', { filter: 'deleted = false' })).map(toAbsenceRecord),
  getAllAbsenceRecordsIncludingDeleted: async (): Promise<AbsenceRecord[]> =>
    (await pbList('hr_absence_records')).map(toAbsenceRecord),
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
    const timesheets = await fetchTimesheetsFresh();
    const INACTIVITY_THRESHOLD_SECONDS = 37 * 60;
    // Per explicit product decision: absence "day" bucketing runs on the same
    // America/New_York midnight-boundary calendar used everywhere else in the
    // app (shift dates via localShiftDate, leave dates, attendance display) —
    // not the employee's own device/region timezone. Using a different
    // timezone basis here than the rest of the app was the root cause of
    // employees getting marked absent on what was actually a Saturday/Sunday
    // from this app's own point of view: a several-hour day-boundary offset
    // could shift a date across the Mon-Fri/weekend line entirely.
    const nyTodayStr = getNYDateString(new Date());
    const ABSENCE_ENFORCEMENT_START_DATE = '2026-08-04';
    let existingRecords = await hrActions.getAbsenceRecords();

    // Self-healing cleanup: the old PKT-based day bucketing (fixed above)
    // could occasionally land an absence record's date on an actual
    // Saturday/Sunday by the NY calendar. Weekends are never a workday, so
    // any such record is always wrong — reverse it and notify everyone
    // involved rather than leaving a stale bad deduction on the books.
    const weekendRecords = existingRecords.filter(r => !isWeekday(r.date));
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
      existingRecords = await hrActions.getAbsenceRecords();
    }

    // Self-healing cleanup #2: an absence record dated before the matching
    // employee's own joinedDate is always wrong (can't be absent from a job
    // you hadn't started yet) — e.g. an employee added on the 16th getting
    // marked absent for the 14th. This can happen if the check ever ran
    // while the profile's joinedDate was still unset/being saved, or from
    // any other timing/config drift — reverse it the same way as the
    // weekend cleanup above, whatever the original cause.
    const preJoinRecords = existingRecords.filter(rec => {
      const emp = employees.find(e => e.email.toLowerCase() === rec.employeeEmail.toLowerCase());
      if (!emp?.joinedDate || !/^\d{4}-\d{2}-\d{2}/.test(emp.joinedDate)) return false;
      return rec.date < emp.joinedDate.slice(0, 10);
    });
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
      existingRecords = await hrActions.getAbsenceRecords();
    }

    // Full history INCLUDING soft-deleted rows — the partial unique index on
    // hr_absence_records only constrains non-deleted rows, so checking
    // active-only records here would let this loop resurrect an absence HR
    // already deleted the moment its date rolled back into the 5-day
    // lookback window below. Keyed by employeeEmail_date (lowercase) rather
    // than record id, since ids are now opaque PocketBase ids, not the old
    // `${email}_${date}` composite string.
    const fullHistory = await hrActions.getAllAbsenceRecordsIncludingDeleted();
    const ignoredKeys = new Set(fullHistory.map(r => `${r.employeeEmail.toLowerCase()}_${r.date}`));
    const newRecords: Omit<AbsenceRecord, 'id'>[] = [];
    // Keyed by employeeEmail_date, same as ignoredKeys/freshIgnoredKeys —
    // holds the notification payload for each newly-detected absence until
    // we know for certain THIS call is the one that actually created the
    // record (see the bugfix comment below, near newRecords.push).
    const pendingNotifications = new Map<string, { emp: Profile; dateStr: string; reason: AbsenceRecord['reason']; inactivityMinutes?: number; workedMinutes?: number; deductionAmount: number; name: string }>();

    for (const emp of employees) {
      if (emp.region !== 'Pakistan') continue;
      if (emp.role !== 'employee' && emp.role !== 'team_lead') continue;
      // Skip part-time employees or anyone explicitly marked exempt by HR/Admin
      if (emp.exemptFromAbsenceCheck) continue;

      const empTimesheets = timesheets.filter(t => t.employeeEmail && t.employeeEmail.toLowerCase() === emp.email.toLowerCase() && t.clockIn);
      const empInactivity = inactivityLogs.filter(l => l.employeeEmail && l.employeeEmail.toLowerCase() === emp.email.toLowerCase());
      
      // joinedDate is stored as a plain calendar date ("YYYY-MM-DD") — the
      // actual day the employee joined, not a specific instant. Take the
      // date portion directly instead of round-tripping through
      // `new Date(...)` + NY-timezone conversion: a date-only string parses
      // as UTC midnight, and converting THAT to NY time rolls it back to
      // the previous evening — e.g. "2026-08-16" became "2026-08-15" —
      // silently shifting the join-date cutoff.
      const joinedStr = emp.joinedDate && /^\d{4}-\d{2}-\d{2}/.test(emp.joinedDate)
        ? emp.joinedDate.slice(0, 10)
        : '';

      const shiftDatesWithShift = new Set<string>();
      const shiftDatesWithTotalMinutes = new Map<string, number>();
      const shiftDatesWithMaxSingleInactivity = new Map<string, number>();

      for (const t of empTimesheets) {
        if (!t.clockIn) continue;

        // Bucket by the absolute UTC clockIn timestamp converted to the NY
        // midnight-boundary calendar day — consistent with how every other
        // date in the app (leaves, timesheets shown on the Attendance page,
        // etc.) is bucketed via getNYDateString/localShiftDate.
        const d = new Date(t.clockIn);
        if (isNaN(d.getTime())) continue;
        const shiftDate = getNYDateString(d);
        shiftDatesWithShift.add(shiftDate);
        
        let shiftMins = 0;
        if (t.clockOut) {
          const inTime = d.getTime();
          const outTime = new Date(t.clockOut).getTime();
          if (!isNaN(outTime) && outTime > inTime) {
            shiftMins = Math.floor((outTime - inTime) / 60000);
          }
          
          // Absence is only triggered if a SINGLE continuous inactivity run reaches 37+ mins (2220s),
          // not by summing up multiple smaller inactive periods across the shift.
          const logsForShift = empInactivity.filter(l => {
            const lt = new Date(l.startAt).getTime();
            return lt >= inTime && lt <= outTime;
          });
          let maxSingleInactiveSecs = 0;
          for (const l of logsForShift) {
            const duration = l.durationSeconds || 0;
            if (duration > maxSingleInactiveSecs) {
              maxSingleInactiveSecs = duration;
            }
          }
          const existingMax = shiftDatesWithMaxSingleInactivity.get(shiftDate) || 0;
          shiftDatesWithMaxSingleInactivity.set(shiftDate, Math.max(existingMax, maxSingleInactiveSecs));
        } else {
          // Active or unclosed shift
          const inTime = d.getTime();
          shiftMins = Math.max(0, Math.floor((Date.now() - inTime) / 60000));
        }

        const existingTotal = shiftDatesWithTotalMinutes.get(shiftDate) || 0;
        shiftDatesWithTotalMinutes.set(shiftDate, existingTotal + shiftMins);
      }

      const today = new Date();
      const lookbackStart = new Date(today);
      lookbackStart.setDate(today.getDate() - 5); // Check at most past 5 days
      for (const cursor = new Date(lookbackStart); cursor < today; cursor.setDate(cursor.getDate() + 1)) {
        const dateStr = getNYDateString(cursor);
        if (dateStr >= nyTodayStr) break;
        if (dateStr < ABSENCE_ENFORCEMENT_START_DATE) continue;
        if (joinedStr && dateStr < joinedStr) continue;
        if (!isWeekday(dateStr)) continue; // Saturday/Sunday (by NY calendar) are never checked
        const ignoreKey = `${emp.email.toLowerCase()}_${dateStr}`;
        if (ignoredKeys.has(ignoreKey)) continue;

        const totalWorkedMins = shiftDatesWithTotalMinutes.get(dateStr) || 0;
        const onLeave = isApprovedLeaveOnDate(leaves, emp.fullName, dateStr);

        let reason: AbsenceRecord['reason'] | null = null;
        let inactivityMinutes: number | undefined;
        let workedMinutes: number | undefined;

        // Requirement: Total on shift time < 4 hours (240 minutes) = Absent, >= 4 hours = Present
        const MIN_REQUIRED_WORK_MINUTES = 4 * 60; // 240 minutes

        if (totalWorkedMins < MIN_REQUIRED_WORK_MINUTES) {
          if (!onLeave) {
            if (totalWorkedMins === 0) {
              reason = 'no_clock_in';
            } else {
              reason = 'under_4_hours';
              workedMinutes = totalWorkedMins;
            }
          }
        } else if (!onLeave) {
          const maxSingleInactiveSecs = shiftDatesWithMaxSingleInactivity.get(dateStr) || 0;
          if (maxSingleInactiveSecs >= INACTIVITY_THRESHOLD_SECONDS) {
            reason = 'inactivity';
            inactivityMinutes = Math.round(maxSingleInactiveSecs / 60);
          }
        }
        if (!reason) continue; // present and accounted for (worked >= 4h without excessive inactivity)

        const dailyRate = emp.baseSalary / getWeekdaysInMonth(dateStr.slice(0, 7));
        const deductionAmount = Math.round(2 * dailyRate);
        const name = displayName(emp, 'hr');

        // BUGFIX 2026-09-08: notifications used to be sent right here,
        // unconditionally, the moment this scan computed someone as newly
        // absent — before the DB write (and its de-dupe check) below even
        // ran. runAbsenceCheck is called from more than one page (HR and
        // Admin dashboards both mount it), so whenever two dashboards
        // loaded within moments of each other, BOTH calls independently
        // computed the same newly-absent employees and BOTH sent the full
        // HR+Admin+employee notification triple for them — confirmed live:
        // exact duplicate "marked absent" notifications for the same
        // person/date, timestamps a fraction of a second apart. The
        // database write below was always protected by a unique index (see
        // its own comment), so only one copy of the record was ever
        // actually created — but by then the duplicate notifications had
        // already gone out to employees ("misleading... again and again").
        // Now the record + its notification texts are just collected here;
        // notifications are sent later, only for whichever records THIS
        // call actually manages to create (see below) — a concurrent call
        // that loses the race skips sending its notifications entirely.
        newRecords.push({
          employeeEmail: emp.email, employeeName: emp.fullName, date: dateStr,
          reason, inactivityMinutes, workedMinutes, deductionAmount, createdAt: new Date().toISOString(), acknowledged: false,
        });
        pendingNotifications.set(`${emp.email.toLowerCase()}_${dateStr}`, { emp, dateStr, reason, inactivityMinutes, workedMinutes, deductionAmount, name });
      }
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
      const freshHistory = await hrActions.getAllAbsenceRecordsIncludingDeleted();
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
      const reasonText = reason === 'inactivity'
        ? `was inactive for ${inactivityMinutes} minutes during their shift on ${dateStr}`
        : reason === 'under_4_hours'
        ? `worked less than 4 hours (${Math.floor((workedMinutes || 0) / 60)}h ${(workedMinutes || 0) % 60}m) on ${dateStr}`
        : `did not start a shift on ${dateStr}`;
      const empReasonDetail = reason === 'inactivity'
        ? `${inactivityMinutes} min inactivity during shift`
        : reason === 'under_4_hours'
        ? `worked only ${Math.floor((workedMinutes || 0) / 60)}h ${(workedMinutes || 0) % 60}m (under 4 hours minimum)`
        : 'not starting a shift';
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
  getInactivityLogs: async (filters?: { employeeEmail?: string; sinceISO?: string; untilISO?: string }): Promise<InactivityLog[]> => {
    // Same case-insensitive-email pattern as getScreenshots — `~` narrows
    // server-side, exact check below guards against substring false-matches.
    const filterParts: string[] = [];
    if (filters?.employeeEmail) filterParts.push(`employee_email ~ "${filters.employeeEmail.replace(/"/g, '\\"')}"`);
    if (filters?.sinceISO) filterParts.push(`start_at >= "${filters.sinceISO.replace('T', ' ').replace('Z', '')}"`);
    if (filters?.untilISO) filterParts.push(`start_at <= "${filters.untilISO.replace('T', ' ').replace('Z', '')}"`);
    const records = await pbList('hr_inactivity_logs', {
      sort: '-start_at',
      ...(filterParts.length ? { filter: filterParts.join(' && ') } : {}),
    });
    let logs: InactivityLog[] = records.map((r: any) => ({
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
  // 2026-09-07: delegated entirely to /api/tracking/screenshots-retention
  // (admin/hr only) — this used to run the whole warn-then-delete sweep
  // client-side against the public client, including the actual DELETE
  // calls, which (unnoticed until this audit) were already silently
  // failing in production: hr_screenshots' Update/Delete rules were
  // already admin-only in PocketBase, so the client-side deletes here
  // never had a real PocketBase admin token and just 403'd every month.
  // The server route does the identical warn/delete state machine with a
  // real admin connection, so the sweep actually deletes old screenshots
  // now. Best-effort: any HR/Admin dashboard mount can trigger this, so a
  // transient failure here is not worth surfacing to the user.
  checkScreenshotRetention: async (): Promise<void> => {
    const token = getAuthToken();
    if (!token) return;
    try {
      await fetch(`${API_BASE}/api/tracking/screenshots-retention`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* best-effort — next dashboard mount tries again */ }
  },
};
