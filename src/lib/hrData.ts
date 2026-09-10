'use client';
// hrData.ts is now a thin barrel: every type/hook/action lives in one of the
// domain modules under ./hr/*, and this file just re-exports them under
// their original names (plus reassembles hrActions by spreading each
// domain's own actions object) so none of the ~100 files importing from
// './hrData' anywhere in the app need to change. See plans/014.
export * from './hr/types';
import {
  getWeekdaysInMonth, formatMoney, formatDurationBetween, localShiftDate,
  useKVByPrefix, useInvalidate, HR_ADMIN_LINE_TEAM_ID, sharedActions,
} from './hr/shared';
import {
  isAnnouncementForProfile, buildNotificationLink, useNotifications,
  useAnnouncements, useMaintenanceNotices, notificationActions,
} from './hr/notifications';
import {
  useCareers, getCareerApplicationsAdmin, updateApplicationStatusAdmin,
  getCareerApplicationsForEmailAdmin, deleteCareerApplicationsForEmailAdmin,
  careerActions,
} from './hr/careers';
import { useTasks, useMyTasks, taskActions } from './hr/tasks';
export { useTasks, useMyTasks } from './hr/tasks';
import {
  useTickets, computeTicketActivitySignature, hasUnseenTicketActivity,
  markTicketActivitySeen, TICKET_PRESENCE_STALE_MS, TYPING_STALE_MS,
  ticketActions,
} from './hr/tickets';
import {
  useWarehouses, useTeams, useMessages, useAllMessages, useTeamDocuments,
  computeMessageActivitySignature, hasUnseenMessageActivity, markMessageActivitySeen,
  hasUnseenHrAdminLineActivity, teamActions,
} from './hr/teams';
import {
  useLeaves, parseLeaveDates, calculateTenure, calculatePTOAccrued,
  getApprovedLeaveDays, getRemainingPTO, isWeekday, getApprovedLeaveOnDate,
  isApprovedLeaveOnDate, getApprovedLeaveDaysInMonth,
  countApprovedLeaveRequestsInMonth, getPTOAccrualDate, leaveActions,
} from './hr/leaves';
import {
  hasStaleTrackerToken, getCaptureHealth, TRACKER_HEARTBEAT_STALE_MS,
  SHIFT_TAB_HEARTBEAT_STALE_MS, TRACKER_HEARTBEAT_GRACE_MS,
  useTimesheets, useTrackingSettings, timesheetActions,
  fetchTimesheetsFresh,
} from './hr/timesheets';
export {
  hasStaleTrackerToken, getCaptureHealth, TRACKER_HEARTBEAT_STALE_MS,
  SHIFT_TAB_HEARTBEAT_STALE_MS, TRACKER_HEARTBEAT_GRACE_MS,
  useTimesheets, useTrackingSettings, fetchTimesheetsFresh,
} from './hr/timesheets';
import { useMyAbsenceRecords, countAbsentWeekdays, absenceActions } from './hr/absences';
export { useMyAbsenceRecords, countAbsentWeekdays } from './hr/absences';
import {
  usePayroll, getPayrollForEmployeeAdmin, deletePayrollForEmployeeAdmin, usePayrollSelf,
  upsertPayrollRecordAdmin, getMissedIncrementEvents, getPendingIncrement, getIncrementHistory,
  getPendingIncrementForPayrollMonth, getFinalLeavePayout, getAbsenceDeductionForMonth,
  getShiftShortfallDeduction, payrollActions,
} from './hr/payroll';
export {
  usePayroll, getPayrollForEmployeeAdmin, deletePayrollForEmployeeAdmin, usePayrollSelf,
  upsertPayrollRecordAdmin, getMissedIncrementEvents, getPendingIncrement, getIncrementHistory,
  getPendingIncrementForPayrollMonth, getFinalLeavePayout, getAbsenceDeductionForMonth,
  getShiftShortfallDeduction,
} from './hr/payroll';
export type { IncrementEvent } from './hr/payroll';
import {
  isTechnicalSupportMember, displayName, MAX_USER_SESSION_DEVICES,
  USER_SESSION_STALE_MS, getProfileExtras, saveProfileExtras,
  getProfileDocuments, saveProfileDocuments, useProfiles, useProfileDocuments,
  useProfileSelf, updateProfileSelf, changeOwnPassword, updateProfileAdmin,
  approveOnboardingServer, rejectOnboardingServer, resetPasswordServer,
  applyIncrementServer, addEmployeeServer, updateEmployeeTeamsAdmin,
  setTeamLeadAdmin, profileActions,
} from './hr/profiles';
export {
  isTechnicalSupportMember, displayName, MAX_USER_SESSION_DEVICES,
  USER_SESSION_STALE_MS, getProfileExtras, saveProfileExtras,
  getProfileDocuments, saveProfileDocuments, useProfiles, useProfileDocuments,
  useProfileSelf, updateProfileSelf, changeOwnPassword, updateProfileAdmin,
  approveOnboardingServer, rejectOnboardingServer, resetPasswordServer,
  applyIncrementServer, addEmployeeServer, updateEmployeeTeamsAdmin,
  setTeamLeadAdmin,
} from './hr/profiles';
export {
  useLeaves, parseLeaveDates, calculateTenure, calculatePTOAccrued,
  getApprovedLeaveDays, getRemainingPTO, isWeekday, getApprovedLeaveOnDate,
  isApprovedLeaveOnDate, getApprovedLeaveDaysInMonth,
  countApprovedLeaveRequestsInMonth, getPTOAccrualDate,
} from './hr/leaves';
export {
  useWarehouses, useTeams, useMessages, useAllMessages, useTeamDocuments,
  computeMessageActivitySignature, hasUnseenMessageActivity, markMessageActivitySeen,
  hasUnseenHrAdminLineActivity,
} from './hr/teams';
export {
  useTickets, computeTicketActivitySignature, hasUnseenTicketActivity,
  markTicketActivitySeen, TICKET_PRESENCE_STALE_MS, TYPING_STALE_MS,
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
  useKVByPrefix, useInvalidate, HR_ADMIN_LINE_TEAM_ID,
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
