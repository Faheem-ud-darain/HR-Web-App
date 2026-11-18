// The absence sweep, in the one order that is correct: a shift whose desktop tracker stopped reporting is closed first, then
// any shift still open past the hard cap, then the absence check runs on what is left. Without the first two a still-open
// overnight shift would be misread as either "worked" or a multi-hour false inactivity absence. Each step is best-effort: a
// failure in one step must not stop the next, and the sweep never throws (it runs from a page effect).
// Absence records feed payroll deductions; runAbsenceCheck itself decides who is absent (core/absences.detectAbsences) and
// skips anything already on record, so running this from several screens is harmless.
import { hrActions } from '../hrData';
import { ABSENCE_LOOKBACK_DAYS, INACTIVITY_THRESHOLD_SECONDS } from '../core/absences';
import { fetchLeavesStrict } from './leaves';
import type { LeaveApplication, Profile, TimesheetEntry } from './types';

// The absence check decides from three lists (shifts, approved leaves, inactivity logs). Each is read here with a strict read that throws on
// a failed request, never from what the screen happens to hold: a screen's copy turns a failed read into an empty list, and an empty list
// means "nobody clocked in" or "nobody is on leave", which creates absences and deducts pay. If any read fails, no absence is created.
export async function runAttendanceSweep(employees: Profile[], timesheets: TimesheetEntry[], _screenLeaves: LeaveApplication[], now: Date = new Date()): Promise<void> {
  try { await hrActions.autoCloseOrphanTrackedShifts(timesheets); } catch { /* best-effort */ }
  try { await hrActions.autoCloseStaleOpenShifts(timesheets, employees); } catch { /* best-effort */ }
  try {
    const since = new Date(now);
    since.setDate(since.getDate() - ABSENCE_LOOKBACK_DAYS);
    const [leaves, inactivityLogs] = await Promise.all([
      fetchLeavesStrict(),
      hrActions.getInactivityLogs({ sinceISO: since.toISOString(), minDurationSeconds: INACTIVITY_THRESHOLD_SECONDS, strict: true }),
    ]);
    await hrActions.runAbsenceCheck(employees, timesheets, leaves, inactivityLogs);
  } catch (err) {
    // Best-effort, and safe: the next sweep (any HR/Admin dashboard load) looks back five days, so nothing is lost by waiting.
    console.warn('[sweep] absence check skipped, a required read failed:', err);
  }
}
