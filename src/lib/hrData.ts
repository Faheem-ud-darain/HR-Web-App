'use client';
// hrData.ts is now a thin barrel: every type/hook/action lives in one of the
// domain modules under ./hr/*, and this file just re-exports them under
// their original names (plus reassembles hrActions by spreading each
// domain's own actions object) so none of the ~150 files importing from
// './hrData' anywhere in the app need to change. See plans/014.
//
// Two things to know before touching it:
//  - It is a pass-through: deleting it would only change import lines (about 150 files), no behaviour. That is a
//    mechanical job to do LAST, after the domains have been deepened (see the architecture review), not first.
//  - It is also a cycle. Seven modules in ./hr/* import `hrActions` back from here to call another domain's actions (a
//    clock-out sends notifications, the absence check closes shifts). It works because those calls happen at run time,
//    never while the modules load. Do not use `hrActions` or anything from here at the top level of a ./hr module.
//  New code should import from the domain module it needs (./hr/timesheets, ./core/payroll...), not from here.
export * from './hr/types';
import {
  sharedActions,
} from './hr/shared';
import {
  notificationActions,
} from './hr/notifications';
import {
  careerActions,
} from './hr/careers';
import { taskActions } from './hr/tasks';
export { useTasks, useMyTasks } from './hr/tasks';
import {
  ticketActions,
} from './hr/tickets';
import {
  teamActions,
} from './hr/teams';
import {
  leaveActions,
} from './hr/leaves';
import {
  timesheetActions
} from './hr/timesheets';
export {
  hasStaleTrackerToken, getCaptureHealth, getCaptureGap, TRACKER_HEARTBEAT_STALE_MS,
  SHIFT_TAB_HEARTBEAT_STALE_MS, TRACKER_HEARTBEAT_GRACE_MS,
  useTimesheets, useTrackingSettings, useAllTrackerHeartbeats, fetchTimesheetsFresh,
} from './hr/timesheets';
import { absenceActions } from './hr/absences';
export { useMyAbsenceRecords, countAbsentWeekdays } from './hr/absences';
import {
  payrollActions,
} from './hr/payroll';
export {
  usePayroll, getPayrollForEmployeeAdmin, deletePayrollForEmployeeAdmin, usePayrollSelf,
  usePayrollCorrections, createPayrollCorrection, settlePayrollCorrection,
  payrollAdminAction, getMissedIncrementEvents, getPendingIncrement, getIncrementHistory,
  getPendingIncrementForPayrollMonth, getFinalLeavePayout, getAbsenceDeductionForMonth,
  getShiftShortfallDeduction, canReviewPreviousMonthPayroll, previousPayrollMonthKey,
} from './hr/payroll';
export type { IncrementEvent } from './hr/payroll';
import {
  profileActions,
} from './hr/profiles';
export {
  isTechnicalSupportMember, displayName, MAX_USER_SESSION_DEVICES,
  USER_SESSION_STALE_MS, getProfileExtras, saveProfileExtras,
  getProfileDocuments, saveProfileDocuments, useProfiles, useMyProfile, useProfileDocuments,
  useProfileSelf, updateProfileSelf, changeOwnPassword, updateProfileAdmin,
  approveOnboardingServer, rejectOnboardingServer, resetPasswordServer,
  applyIncrementServer, addEmployeeServer, updateEmployeeTeamsAdmin,
  setTeamLeadAdmin,
} from './hr/profiles';
export type { ArchiveProgress } from './hr/profiles';
export type { PayrollCorrection } from './core/payrollCorrections';
export {
  useLeaves, parseLeaveDates, calculateTenure, calculatePTOAccrued, getAccruedPTOForDisplay,
  getApprovedLeaveDays, getRemainingPTO, isWeekday, getApprovedLeaveOnDate,
  isApprovedLeaveOnDate, getApprovedLeaveDaysInMonth,
  countApprovedLeaveRequestsInMonth, getPTOAccrualDate,
} from './hr/leaves';
export {
  useWarehouses, useTeams, useMessages, useTeamDocuments,
  } from './hr/teams';
export {
  useTickets, TICKET_PRESENCE_STALE_MS, TYPING_STALE_MS,
} from './hr/tickets';
export {
  useCareers, getCareerApplicationsAdmin, updateApplicationStatusAdmin,
  getCareerApplicationsForEmailAdmin, deleteCareerApplicationsForEmailAdmin,
} from './hr/careers';
export {
  isAnnouncementForProfile, buildNotificationLink, useNotifications,
  useAnnouncements, useMaintenanceNotices,
} from './hr/notifications';
export {
  getWeekdaysInMonth, formatMoney, formatDurationBetween, localShiftDate,
  useInvalidate, HR_ADMIN_LINE_TEAM_ID,
} from './hr/shared';

// ─────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for all PocketBase access in this app.
//
// Rules for anyone editing this file or the pages that use it:
//   1. No page/component may call `pb.collection(...)` directly. Every read
//      goes through the `use*()` hooks below (React Query — in-memory cache
//      only, never localStorage). Every write goes through `hrActions.*`.
//   2. Field names here are taken verbatim from the live PocketBase export
//      (see SCHEMA_REFERENCE.md) — do not invent/guess field names.
//   3. hr_delcargo_store (generic key/value collection) is still legitimate
//      server storage for things with no dedicated table (tracking
//      settings, screenshots, heartbeats, notification read/cleared maps,
//      profile "extra" fields, deletion tombstones). It is fetched fresh
//      every time, never cached to localStorage.
//
// This file itself no longer touches PocketBase directly — every rule above
// is enforced by the individual ./hr/* domain modules it re-exports.
// ─────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// hrActions — every write in the app goes through here (reassembled from
// each domain's own actions object — see ./hr/*).
// ---------------------------------------------------------------------------

export const hrActions = {
  ...profileActions,
  ...notificationActions,
  ...careerActions,
  ...taskActions,
  ...ticketActions,
  ...teamActions,
  ...leaveActions,
  ...timesheetActions,
  ...absenceActions,
  ...payrollActions,
  ...sharedActions,
};
