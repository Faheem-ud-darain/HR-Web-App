// The absence sweep, in the one order that is correct: a shift whose desktop tracker stopped reporting is closed first, then
// any shift still open past the hard cap, then the absence check runs on what is left. Without the first two a still-open
// overnight shift would be misread as either "worked" or a multi-hour false inactivity absence. Each step is best-effort: a
// failure in one step must not stop the next, and the sweep never throws (it runs from a page effect).
// Absence records feed payroll deductions; runAbsenceCheck itself decides who is absent (core/absences.detectAbsences) and
// skips anything already on record, so running this from several screens is harmless.
import { hrActions } from '../hrData';
import { ABSENCE_LOOKBACK_DAYS, INACTIVITY_THRESHOLD_SECONDS } from '../core/absences';
import type { LeaveApplication, Profile, TimesheetEntry } from './types';

export async function runAttendanceSweep(employees: Profile[], timesheets: TimesheetEntry[], leaves: LeaveApplication[], now: Date = new Date()): Promise<void> {
  try { await hrActions.autoCloseOrphanTrackedShifts(timesheets); } catch { /* best-effort */ }
  try { await hrActions.autoCloseStaleOpenShifts(timesheets, employees); } catch { /* best-effort */ }
  try {
    const since = new Date(now);
    since.setDate(since.getDate() - ABSENCE_LOOKBACK_DAYS);
    const inactivityLogs = await hrActions.getInactivityLogs({ sinceISO: since.toISOString(), minDurationSeconds: INACTIVITY_THRESHOLD_SECONDS });
    await hrActions.runAbsenceCheck(employees, timesheets, leaves, inactivityLogs);
  } catch { /* best-effort */ }
}
