'use client';
import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { pb } from './pocketbase';
import { getNYDateString, formatTimeNY, formatDateNY } from './timezone';
import { getOrCreateDeviceId, getAuthToken } from './session';
import { API_BASE } from './apiBase';
import type {
  Profile, Warehouse, Announcement, MaintenanceNotice, LeaveApplication, Task,
  TimesheetEntry, PayrollRecord, AbsenceRecord, TrackingSettings, TrackerHeartbeat,
  CaptureHealthStatus, ShiftTabHeartbeat, ShiftStopSignal, TrackerQuitIntent,
  TrackerPing, TrackerPong, TrackerStopCommand, TrackerCommand, TrackerDiagnostics,
  UserSessionSlot, Screenshot, InactivityLog, Notification, NotificationCategory,
  NotificationPrefs, CareerPosition, CareerApplicationStatus, CareerApplication,
  TicketReply, Ticket, TicketPresence, TicketSeenState, TypingState, Team, Message,
  TeamDocument, PayrollSelf, MyAbsenceRecord, ProfileSelf, NotificationReadMap,
} from './hr/types';
export * from './hr/types';
import {
  withTimeout, looksLikeRealId,
  pbList, pbListByEmailField, pbCreate, pbUpdate, pbDelete, pbUpsertByField,
  pbFindByField, pbGetKV, pbSetKV, pbGetKVByPrefix, pbDeleteKVByKeys,
  getWeekdaysInMonth, formatMoney, formatDurationBetween, localShiftDate,
  useKVByPrefix, useInvalidate, HR_ADMIN_LINE_TEAM_ID,
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
// ─────────────────────────────────────────────────────────────────────────

// Standard full shift length — a day worked for this many minutes (8h)
// earns the full daily rate; less than this (but at/above the 4h absent
// floor) earns a proportional fraction. Mirrors employee/page.tsx's own
// REQUIRED_SHIFT_MINUTES constant for the "End Shift" under-8-hours notice.
const STANDARD_SHIFT_MINUTES = 8 * 60;



// ---------------------------------------------------------------------------
// TYPES (app-shape, camelCase — same shapes pages already expect)
// ---------------------------------------------------------------------------



// Team members and team leads only ever see the Alias (or the real name as
// a fallback if no alias has been set yet — better than showing a blank).
// HR/Admin see the real name with the alias appended for reference. This is
// UI-level masking only — see the security caveat in project notes; every
// hr_ collection is currently publicly readable, so this is not a real
// access boundary until PocketBase auth rules are turned on for production.

// System Maintenance Notice — a deliberately separate thing from
// Announcement above, not just an "important announcement" with extra
// fields. Two real differences: (1) always targets literally everyone
// (Employee/Team Lead/HR/Admin alike) — a system going down for
// maintenance affects every role equally, unlike a targeted company
// announcement; (2) carries real ISO UTC instants for a start/end window,
// entered by Admin/HR as Pakistan local time and displayed to every viewer
// converted to THEIR OWN device's local timezone — see pktLocalToUtcIso/
// formatInViewerLocalTime in src/lib/timezone.ts for why this is the one
// deliberate exception to the rest of the app's America/New_York-only
// display rule.
//
// Stored in hr_delcargo_store (no dedicated PocketBase collection/schema
// migration needed) rather than hr_announcements, precisely because it
// needs real convertible instants — hr_announcements' `timestamp` field is
// a pre-formatted NY display string baked in at creation time (see
// addAnnouncement), which can't be un-formatted back into a real instant
// for per-viewer conversion.



// hr_timesheets: no in_progress/completed status in the real schema (fixed
// enum pending|approved|rejected instead). We represent "open shift" as
// clockOut being empty, and keep `approvalStatus` as a separate HR workflow
// flag layered on top — see SCHEMA_REFERENCE.md.


// A single day an employee was auto-marked absent, with a specific reason —
// stored in the dedicated hr_absence_records PocketBase collection.
// Persisted (rather than recomputed live like countAbsentWeekdays) because:
// (1) the "Absent Details" pages need real reasons to display, not just a
// count, and (2) the deduction it causes is applied exactly once, at
// detection time, not re-derived on every payroll page load.
// Soft-deleted via `deleted`/`deletedAt` (rather than a real row delete) so
// runAbsenceCheck can tell "never happened" apart from "happened, then HR
// removed it" and never resurrect a removed record on its next pass.




// Exact substring tracker-agent/agent_gui.py's get_tracking_settings() writes
// into lastCaptureError when the agent's currently-paired agentToken no

// Multi-device session enforcement for Employee (and Team Lead, who shares
// the Employee dashboard) accounts only — Admin/HR are exempt and may be
// signed in from as many places as they like (see auth/page.tsx). Per
// explicit product decision: up to MAX_USER_SESSION_DEVICES (2) devices may
// be signed in at once, each employee can see their own list of devices and
// remotely log any of them out from the Profile page's "Logged-in Devices"
// card, and a 3rd device is blocked from logging in until one is freed.
//
// One JSON array lives under a single hr_delcargo_store KV key per email
// (same "list of slots in one KV row" shape as everything else in this
// file that needs a small per-employee list — not a dedicated collection).
// `deviceId` (see getOrCreateDeviceId in src/lib/session.ts) is a STABLE
// per-browser/app-install identifier that survives logging out and back in
// on the same device — unlike `sessionToken`, which is regenerated every
// login. This distinction matters: without a stable deviceId, logging out
// and back in on your own laptop would look like "a new device" and
// needlessly eat into the 2-device cap.

// `imageUrl` points at either a real PocketBase file URL (hr_screenshots
// records — the current format, set by the tracker agents) or a data: URL
// (legacy screenshot_<id> rows still sitting in hr_delcargo_store from
// before the hr_screenshots collection existed — see MIGRATING_OLD_SCREENSHOTS
// in migration_data/create_screenshots_collection.py). Either way, `<img
// src={imageUrl}>` just works — callers don't need to know which source a
// given screenshot came from.

// One contiguous stretch of mouse inactivity (no cursor movement) lasting at
// least 3 minutes, reported by the desktop tracker agent (see
// tracker-agent/agent_gui.py's _inactivity_loop). Only recorded while
// tracking is enabled AND the employee's shift is active — matches the same
// gating screenshots use, so this never counts idle time outside a shift.

// Read receipts for regular Team Chat messages — same shape again (message
// id -> emails who've viewed it). Kept as its own KV key/blob rather than
// reusing hr_announcement_reads_v1 since messages are a much higher-volume,
// ever-growing collection; if this ever becomes large enough to matter,
// pruning entries for messages older than some retention window (mirroring
// hrActions.checkScreenshotRetention's pattern) would be the next step —
// not needed yet at this app's scale.
type MessageReadMap = Record<string, string[]>;


// hr_tickets has no dedicated file-type column (see SCHEMA_REFERENCE.md —
// only employee_email/employee_name/subject/description/status/priority/
// category/assigned_to/resolution/replies exist), so unlike Team Chat
// (hr_messages.attachment, a real PocketBase file field) there's no server
// endpoint to upload a binary to for tickets. `replies` is itself a real
// JSON column though, so attachments here are embedded directly as base64
// data: URLs inside the reply object — same trick already used for CV/
// passport/identity documents elsewhere in this app. attachmentUrl is
// therefore always a data: URL, never a real file URL; keep attachments
// small (see MAX_DOCUMENT_IMAGE_BYTES / MAX_DOCUMENT_PDF_BYTES in
// imageCompressor.ts) since the whole ticket round-trips on every read/write.

// "Live" presence for a support ticket — lets the employee see when HR
// currently has their ticket open, same idea as TrackerHeartbeat above but
// per-ticket instead of per-employee. HR's TicketsView heartbeats this
// (see touchTicketPresence) while a ticket is selected; the employee's
// TicketsView polls getAllTicketPresences/getTicketPresencesForIds and

// Durable "the employee has read this ticket as of this time" marker — unlike
// TicketPresence above (which only lasts ~20s and answers "is HR looking at

// Real hr_teams row — adopted structure (lead + members + warehouse).

// Team Chat — one channel per hr_teams row, no DMs. senderName is a
// real-name snapshot (see create_messages_collection.py) used only by the
// Admin oversight view; everywhere else, resolve senderEmail through
// displayName(profile, viewerRole) so an Alias change also applies
// retroactively to old messages.

// Team Documents — per-team onboarding/instructional file library shown
// alongside Team Chat (see create_team_documents_collection.py). Upload is
// UI-restricted to Admin/HR/Team Lead; every team member (including ones
// added later) can view. uploadedByName/Role are snapshots for fallback
// display only — the UI resolves the live profile first, same pattern as
// Message.senderName.

// ---------------------------------------------------------------------------
// Mappers (PocketBase snake_case record -> app camelCase shape)
// ---------------------------------------------------------------------------



// Documents (CV/passport/identity scans) live in their OWN KV prefix,
// separate from the lightweight hr_profile_extra_ overlay above. These are
// base64-encoded files up to several MB each — if they lived in
// hr_profile_extra_ like the rest of the overlay, useProfiles() (which
// fetches every hr_profile_extra_ row up front, on every dashboard page
// load, including the login screen) would download every employee's CV,
// passport, and ID scans on every page load, whether or not anything on
// that page shows a document. Keeping them in a separate prefix means
// useProfiles() stays light, and document bytes only get fetched by
// useProfileDocuments() when a specific employee's documents are actually
// being viewed.




// NOTE: document fields (cvFileName/cvFileData/identityDocs/passportFileName/
// passportFileData) are deliberately NOT in this list — they route through
// PROFILE_DOC_KEYS / saveProfileDocuments instead. See the comment above
// profileDocsKey.
// Fetches ONE employee's CV/passport/identity-document scans on demand —
// NOT part of useProfiles(). Only call this where those files are actually
// about to be shown (a documents review modal, the employee's own profile
// page), keyed on that one profileId, so nobody pays for every employee's
// documents just to load a dashboard or list page.

// useCareerApplications (public direct-PocketBase read of every applicant's
// PII) was removed as part of plan 012, Phase 1 — CareersView.tsx now
// fetches this HR/Admin-only, session-checked, via
// src/app/api/admin/careers/applications instead.
// status is applied server-side (PocketBase filter), not just client-side —
// without this, "50 open tickets" actually meant "the 50 most-recently-
// created tickets of any status, filtered to open afterward," which could
// under-fill (or entirely miss) an older still-open ticket once enough
// newer closed tickets existed. Passing status through to getList's filter
// means the 50/Load-More count is always 50 real matches of whichever tab
// is active. queryKey includes status so switching Open <-> Closed doesn't
// serve stale cached results from the other tab.
// Migrated off the public pb.collection('hr_payroll').getFullList() call —
// hr_payroll's PocketBase rules are locked to admins-only (plan 012 Phase
// 1). The route itself (src/app/api/admin/payroll/route.ts, GET) decides
// scope from the verified session: HR/Admin get the full company-wide
// list (unchanged behavior for admin/payroll, hr/payroll, the admin
// dashboard, and admin/insights — all already role-gated pages), anyone
// else gets only their OWN records (needed because TopNav's search bar
// calls this hook unconditionally for every role).
export function usePayroll() {
  return useQuery({
    queryKey: ['hr_payroll'],
    queryFn: async (): Promise<PayrollRecord[]> => {
      const token = getAuthToken();
      if (!token) return [];
      const res = await fetch(`${API_BASE}/api/admin/payroll`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.records || [];
    },
  });
}

// HR/Admin-only: one employee's payroll rows, via the same route's
// ?employeeId= scope. Used by exportEmployeeArchive's "Download Archive"
// action (was previously a direct public pbList call against hr_payroll).
export async function getPayrollForEmployeeAdmin(employeeId: string): Promise<any[]> {
  const token = getAuthToken();
  if (!token) return [];
  const res = await fetch(`${API_BASE}/api/admin/payroll?employeeId=${encodeURIComponent(employeeId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.records || [];
}

// HR/Admin-only: purges one employee's payroll rows. Used by
// deleteEmployee's permanent-delete purge flow (was previously a direct
// public pbList+pbDelete pair against hr_payroll). Best-effort, like the
// career-applications equivalent — a failed purge here shouldn't abort the
// rest of deleteEmployee's cleanup.
export async function deletePayrollForEmployeeAdmin(employeeId: string): Promise<void> {
  const token = getAuthToken();
  if (!token) return;
  await fetch(`${API_BASE}/api/admin/payroll?employeeId=${encodeURIComponent(employeeId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}


// Employee/HR/Admin's OWN salary data, via the new server-side
// /api/payroll/me route (see that route's comment) — replaces the old
// pattern of usePayroll() + useProfiles() fetching EVERY employee's salary
// and base pay into the browser just to filter down to one person's own
// numbers. Requires a valid session JWT (src/lib/session.ts's
// getAuthToken()) from the new server-side login — see src/app/auth/page.tsx.
export function usePayrollSelf() {
  return useQuery({
    queryKey: ['payroll_self'],
    queryFn: async (): Promise<PayrollSelf | null> => {
      const token = getAuthToken();
      if (!token) return null;
      const res = await fetch(`${API_BASE}/api/payroll/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      // Route responds as { profile: {...}, pendingIncrement, payrollRecord }
      // — flattened here into one PayrollSelf object for callers.
      const data = await res.json();
      if (!data?.profile) return null;
      return { ...data.profile, pendingIncrement: data.pendingIncrement || 0, payrollRecord: data.payrollRecord || null };
    },
  });
}

// One employee's own daily attendance deductions (hr_absence_records), via
// the authenticated /api/absences/me route — see that route's own comment
// for why this exists instead of the old hrActions.getAbsenceRecords()
// (reads the whole company's records, unauthenticated). Used by the
// employee Salary page to show a running "why was I deducted this month"
// list, day by day, rather than only the end-of-month total.

// Own bank details / contact numbers / document filenames / password, via
// the new server-side /api/profile/me route — replaces
// employee/profile/page.tsx's old pattern of reading these straight off
// the fully-public useProfiles() list (which included everyone's plaintext
// password and bank details) and writing them via the equally-public
// hrActions.updateProfileDetails. Requires a valid session JWT (see
// src/lib/session.ts's getAuthToken()).

// Update any subset of the caller's own bank/phone/document/picture fields
// — see /api/profile/me's PATCH handler for the exact field list. Throws on
// failure (mirrors pbUpdate/pbCreate's existing throw-on-!res.ok pattern
// elsewhere in this file) — callers already wrap these calls in try/catch.

// Self-service password change — verifies currentPassword server-side and
// never exposes the real stored value to the client. Replaces the old
// client-side `profile.password !== currentPass` comparison in
// employee/profile/page.tsx, which relied on the plaintext password field
// being present in the (fully-public) useProfiles() response.

// ── HR/Admin-privileged writes to OTHER employees' profiles ────────────────
// Server-side counterparts to hrActions.updateProfileDetails/addEmployee/
// approveOnboarding/rejectOnboarding/resetPassword/applyAnniversaryIncrement,
// routed through /api/admin/profile (gated to session.role hr/admin, see
// that route for the exact field-splitting logic) instead of the fully
// public hr_profiles/hr_delcargo_store collections. These are additive —
// the hrActions.* versions above are left in place for now (still used by
// hrActions.deleteEmployee/exportEmployeeArchive and a couple of other
// still-public call sites not yet migrated) — but every caller that edits
// ANOTHER employee's profile should prefer these going forward.




// Admin-triggered reset of ANOTHER employee's password — always stores a
// bcrypt hash server-side (unlike hrActions.resetPassword, which still
// writes plaintext via the public client and is being phased out in favor
// of this).

// Same processedThroughYear computation as hrActions.applyAnniversaryIncrement
// (kept identical so the two don't drift), just posted to the admin route
// instead of writing hr_profiles directly from the browser.

// Creates a new employee via the admin-gated route — server hashes the
// initial/temp password instead of writing it in plaintext (addEmployee's
// old client path did fromProfileFields(emp).password = plaintext).

// Thin admin-gated equivalents of hrActions.updateEmployeeTeams/setTeamLead
// — same field mapping (teams / is_team_lead+lead_teams), just written
// through /api/admin/profile instead of the public client. hr_teams itself
// (the separate collection tracking each team's member-list/lead) is
// unaffected and stays on the existing hrActions.updateTeamMembers/
// updateTeamLead path — out of scope for this hr_profiles/hr_payroll pass.

// HR/Admin-gated write for a single hr_payroll record — see
// /api/admin/payroll's comment for what this does and doesn't cover yet
// (the "Process Payroll" / "Release Monthly Funds" write is authenticated;
// the payroll LIST view itself is still fed by the public useProfiles()/
// usePayroll()/useLeaves()/useTimesheets() hooks via computePayrollView,
// pending its own larger migration pass).
export async function upsertPayrollRecordAdmin(record: PayrollRecord): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error('Not signed in.');
  const res = await fetch(`${API_BASE}/api/admin/payroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ record }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
}

// HR/Admin-only read of every submitted job application (applicant PII) —
// see src/app/api/admin/careers/applications' own comment. Returns []
// (rather than throwing) when not signed in as HR/Admin, matching the
// "one-time fetch, not a React Query hook" pattern admin/insights already
// uses for absence records — CareersView.tsx only calls this at all when
// role is 'hr' or 'admin'.


// One employee's own past applications, HR/Admin-session-checked — used by
// exportEmployeeArchive below (the "Download Archive" action) instead of
// reading hr_career_applications directly via the public client, which
// stopped working once that collection's PocketBase rules were locked down
// (plan 012, Phase 1). Returns [] rather than throwing when not signed in
// as HR/Admin, or on any error — archive export treats this the same as
// "no applications on file" rather than failing the whole export.

// Purge every application under one email — used only by
// hrActions.deleteEmployee's permanent-delete flow, replacing the old
// direct pbList+pbDelete pair that stopped working once
// hr_career_applications' PocketBase rules were locked down.

// Team Chat, one channel per team. Polling rather than a PocketBase
// realtime (SSE) subscription — this app's web deploy proxies PocketBase
// through a Next.js rewrite (see next.config.ts), and long-lived SSE
// connections through that kind of proxy aren't guaranteed to stay open on
// every host. Polling is the same "near-real-time" approach already used
// for hr_tickets above and is proven to work here. If you confirm SSE stays
// connected in your actual deployment, this can be upgraded to
// pb.collection('hr_messages').subscribe(...) for instant delivery.

// Fetches every KV row whose key matches a prefix - used for tracking
// settings / heartbeats / screenshots, which don't have dedicated tables.


// Convenience: call inside a component to get a function that invalidates
// (and thus refetches) one or more query keys after a mutation.

// ---------------------------------------------------------------------------
// PURE BUSINESS LOGIC (unchanged formulas, ported from src/lib/db.ts)
// ---------------------------------------------------------------------------






// Approved leave covers a given date if the leave's parsed date range
// (parseLeaveDates) spans it — compared as NY calendar dates, not raw Date
// object equality, since parseLeaveDates' Date objects don't carry the
// fixed-timezone treatment the rest of the app's dates do.
//
// Returns the actual LeaveApplication (so callers can read its `type` —
// Urgent/Normal/PTO/Sick Leave/Parental Leave) rather than just a boolean.
// This matters for AbsenceRecord display/payroll: runAbsenceCheck only
// checks "is there ANY approved leave covering this date" at the moment it
// scans (a 5-day lookback), so a leave application approved AFTER that scan
// already ran leaves behind a stale AbsenceRecord — reason 'no_clock_in' /
// 'under_4_hours' / 'inactivity' — for a day that turned out to be a real,
// approved leave day. Every place that shows or charges for that record
// needs to re-check leave coverage live, not trust the frozen `reason`.


// How many of a SINGLE employee's approved Urgent/Normal leave days
// (America/New_York calendar days) fall inside one specific payroll month —
// counted by walking every calendar day the leave's date range spans and
// checking each one's own month, exactly like runAbsenceCheck/
// getShiftShortfallDeduction already walk day-by-day elsewhere in this file.
//
// This is NOT the same thing as isApprovedLeaveOnDate/getApprovedLeaveOnDate
// above (which answer "is this ONE date covered") — this answers "how many
// days of this employee's leave history land in THIS month", which is what
// computePayrollView's Urgent/Normal Leave deduction needs, and which
// previously did not exist: computePayrollView used to sum every approved
// Urgent/Normal leave this employee had EVER taken, with no month filter at
// all, so a single approved Urgent/Normal leave request kept being deducted
// again every single month forever, not just the month it was actually
// taken in. A leave that spans a month boundary (e.g. filed Aug 30 - Sep 2)
// is correctly split — only the days that actually fall in `monthKey` count
// toward that month's deduction, the rest count toward the other month.

// Same month-scoping as getApprovedLeaveDaysInMonth above, but counts
// matching REQUESTS (not days) that overlap the given month at all — used
// for the "N UL" Rebate Eligible/No Rebate badge on the HR Payroll page,
// which counts how many separate Urgent Leave requests an employee has,
// not how many days. Previously that badge counted every approved Urgent
// Leave request this employee had EVER made, all-time, with no month
// filter — the same unscoped-forever bug as the deduction math above, just
// in a purely informational badge rather than the actual charge.

// PTO accrual runs off the employee's account-creation date, not their
// joining date — the two can differ (e.g. account created before/after
// the actual start date). Falls back to joinedDate for anyone onboarded
// before accountCreationDate existed, so nothing changes for them.

// Counts how many anniversary "events" (same month/day as salaryStartDate,
// one per year) have occurred on or before today, and have not yet been
// applied to base_salary. This intentionally catches up multiple missed
// years at once — e.g. a salaryStartDate set 4 years in the past with no
// prior processing history returns 4, not 0 or 1 — so setting a backdated
// salaryStartDate correctly backfills every increment that should already
// have happened, rather than only ever firing one at a time going forward.
//
// These 3 functions now just delegate to src/lib/incrementMath.ts, which
// holds the actual (identical, unchanged) implementation — pulled out into
// its own file with no client-only imports so the new server-side
// /api/payroll/me route (see that route + Notes on the auth refactor) can
// reuse the exact same math without dragging hrData.ts's React/React-Query/
// browser-`pb`-instance imports into the Edge runtime bundle. Re-exported
// here under their original names so no existing call site anywhere in the
// app needs to change.
import { getMissedIncrementEvents, getPendingIncrement, getIncrementHistory, getPendingIncrementForPayrollMonth } from './incrementMath';
export { getMissedIncrementEvents, getPendingIncrement, getIncrementHistory, getPendingIncrementForPayrollMonth };
export type { IncrementEvent } from './incrementMath';

export function getFinalLeavePayout(profile: Profile, leaves: LeaveApplication[]): number {
  const remainingDays = getRemainingPTO(leaves, profile.fullName, getPTOAccrualDate(profile));
  const dailyRate = profile.baseSalary / getWeekdaysInMonth(getNYDateString(new Date()).slice(0, 7));
  return Math.round(remainingDays * dailyRate);
}

// Absence deduction for one employee's target month, recomputed from their
// CURRENT base salary — deliberately NOT a sum of each AbsenceRecord's own
// (frozen) `deductionAmount` field. That field is set once, at detection
// time, from whatever emp.baseSalary was that day (see runAbsenceCheck) and
// never revisited. If a salary was ever wrong in the system for a while
// (data-entry mistake, since-corrected) any absence recorded during that
// window kept charging 2x the OLD, much larger daily rate forever — this
// is how a 20,000 salary could show a 130,000 "absence deduction": a
// couple of leftover records from when the salary was mistakenly set much
// higher. Recomputing from count * current daily rate means a salary
// correction fixes every past absence deduction for that employee too, not
// just future ones. Shared by computePayrollView and the HR/Admin payroll
// pages' own "absence total" breakdown so both always show the same number.
// Never negative (a month can't have a negative absence count) — guarded
// anyway in case a bad/NaN baseSalary ever slips through.
export function getAbsenceDeductionForMonth(
  absenceRecords: AbsenceRecord[],
  employeeEmail: string,
  currentBaseSalary: number,
  monthKey: string,
  leaves: LeaveApplication[] = []
): number {
  const wanted = (employeeEmail || '').toLowerCase();
  const count = absenceRecords.filter(a => {
    if (a.employeeEmail.toLowerCase() !== wanted) return false;
    if (a.date.slice(0, 7) !== monthKey) return false;
    // Skip any absence record whose date turned out to be covered by an
    // approved leave — see getApprovedLeaveOnDate's comment. runAbsenceCheck
    // only checked leave status at scan time, so a leave approved afterward
    // leaves a stale 'no_clock_in'/'under_4_hours'/'inactivity' record
    // behind for what is actually now a leave day. That day is already
    // charged (at the correct Urgent/Normal rate, or not at all for
    // PTO/Sick/Parental) via the Urgent/Normal Leave deduction above —
    // counting it here too would double-charge the same day.
    if (getApprovedLeaveOnDate(leaves, a.employeeName, a.date)) return false;
    return true;
  }).length;
  const dailyRate = currentBaseSalary / getWeekdaysInMonth(monthKey);
  const raw = Math.round(count * 2 * dailyRate);
  return Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

// Shift-shortfall deduction — the "for each day divide their worked/onshift
// hours with the total shift hours to calculate their daily salary" half of
// the 2026-09-03 shift-pay formula. A day with a real shift that ran LESS
// than the standard 8 hours but still cleared the 4-hour absent floor
// previously cost nothing at all (only a full no-show/under-4h day did,
// via the flat 2-day absence penalty below/runAbsenceCheck). This closes
// that gap: for each such partial day this month, deduct the proportional
// shortfall — dailyRate * (1 - workedMinutes/480) — from pay. Deliberately
// scoped identically to runAbsenceCheck (Pakistan region only, not exempt,
// weekdays only, on/after joinedDate, skipped on approved-leave days) and
// deliberately SKIPS any date that already has an AbsenceRecord (that
// day's flat 2-day penalty already covers it — this must never double-
// charge the same day twice) and any date with zero recorded minutes
// (a true no-show is runAbsenceCheck's job, not this function's — it only
// prorates a shift that actually happened but ran short). Only counts
// dates through yesterday (today's shift may still be in progress).
export function getShiftShortfallDeduction(
  timesheets: TimesheetEntry[],
  absenceRecords: AbsenceRecord[],
  leaves: LeaveApplication[],
  profile: Pick<Profile, 'fullName' | 'email' | 'region' | 'joinedDate' | 'exemptFromAbsenceCheck'>,
  currentBaseSalary: number,
  monthKey: string,
  today: Date = new Date()
): number {
  if (profile.region !== 'Pakistan') return 0;
  if (profile.exemptFromAbsenceCheck) return 0;

  const todayStr = getNYDateString(today);
  const joinedStr = profile.joinedDate && /^\d{4}-\d{2}-\d{2}/.test(profile.joinedDate)
    ? profile.joinedDate.slice(0, 10)
    : '';
  const email = (profile.email || '').toLowerCase();
  const absentDates = new Set(
    absenceRecords.filter(a => a.employeeEmail.toLowerCase() === email && !a.deleted).map(a => a.date)
  );

  // Bucket every timesheet minute this employee worked by NY calendar day —
  // same shiftDate bucketing runAbsenceCheck uses, just for the whole month
  // instead of a 5-day lookback.
  const minutesByDate = new Map<string, number>();
  for (const t of timesheets) {
    if (!t.employeeEmail || t.employeeEmail.toLowerCase() !== email || !t.clockIn) continue;
    const d = new Date(t.clockIn);
    if (isNaN(d.getTime())) continue;
    const shiftDate = getNYDateString(d);
    if (shiftDate.slice(0, 7) !== monthKey) continue;
    let mins = 0;
    if (t.clockOut) {
      const outTime = new Date(t.clockOut).getTime();
      if (!isNaN(outTime) && outTime > d.getTime()) mins = Math.floor((outTime - d.getTime()) / 60000);
    }
    minutesByDate.set(shiftDate, (minutesByDate.get(shiftDate) || 0) + mins);
  }

  const dailyRate = currentBaseSalary / getWeekdaysInMonth(monthKey);
  const MIN_REQUIRED_WORK_MINUTES = 4 * 60;
  let totalShortfall = 0;

  for (const [dateStr, mins] of minutesByDate) {
    if (dateStr >= todayStr) continue; // today/future — shift may still be in progress
    if (joinedStr && dateStr < joinedStr) continue;
    if (!isWeekday(dateStr)) continue;
    if (absentDates.has(dateStr)) continue; // already flat-penalized by runAbsenceCheck — never double-charge
    if (mins < MIN_REQUIRED_WORK_MINUTES) continue; // that's runAbsenceCheck's job, not this function's
    if (mins >= STANDARD_SHIFT_MINUTES) continue; // full (or over) shift — no shortfall
    if (isApprovedLeaveOnDate(leaves, profile.fullName, dateStr)) continue;
    totalShortfall += dailyRate * (1 - mins / STANDARD_SHIFT_MINUTES);
  }

  const rounded = Math.round(totalShortfall);
  return Number.isFinite(rounded) ? Math.max(0, rounded) : 0;
}



// ---------------------------------------------------------------------------
// hrActions — every write in the app goes through here.
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
  // ── Payroll ───────────────────────────────────────────────────────────
  // Computes the current payroll view for a set of employees (pure, no
  // writes) — mirrors old db.getPayroll()'s calculation. Callers decide
  // whether/when to persist via upsertPayrollRecord (e.g. only on "Process").
  //
  // `absenceRecords` is the real source of truth for no-call-no-show /
  // inactivity deductions (the flat 2-day penalty). Deliberately NOT
  // recomputed live from timesheets+leaves the way urgent-leave deductions
  // are: absence detection needs a one-time historical scan (inactivity
  // logs especially) and needs to persist a specific reason for the Absent
  // Details pages, so runAbsenceCheck (below) creates a real AbsenceRecord
  // once per absence, and this function just sums up whichever records
  // already exist for the employee this month.
  //
  // `timesheets` (2026-09-03) now also feeds getShiftShortfallDeduction —
  // the day-by-day worked-hours/8-hours proration for shifts that ran
  // short of a full day without qualifying as absent (4h-8h range).
  computePayrollView: (employees: Profile[], existingPayroll: PayrollRecord[], leaves: LeaveApplication[], timesheets: TimesheetEntry[] = [], absenceRecords: AbsenceRecord[] = []): PayrollRecord[] => {
    const today = new Date();
    const dayOfMonth = parseInt(getNYDateString(today).split('-')[2], 10);
    
    // When payroll is accessed during the processing window (Days 1–3 of the month),
    // the target month being processed is the PREVIOUS month (e.g. Aug 1-3 processes July).
    let targetMonthDate = new Date(today);
    if (dayOfMonth >= 1 && dayOfMonth <= 3) {
      targetMonthDate.setMonth(targetMonthDate.getMonth() - 1);
    }
    const targetMonthKey = getNYDateString(targetMonthDate).slice(0, 7);

    return employees
      .filter(emp => emp.role === 'employee' || emp.role === 'team_lead')
      .map(emp => {
        // Scoped to THIS calendar month — see PayrollRecord.month's comment.
        // Without the month check this would match any row ever created
        // for the employee (there used to only ever be one), silently
        // reusing/overwriting a prior month's already-paid record instead
        // of starting a fresh one for targetMonthKey.
        const existing = existingPayroll.find(p => p.employeeId === emp.id && p.month === targetMonthKey);
        // Payroll-specific deferral — see getPendingIncrementForPayrollMonth's
        // comment: an anniversary increment only starts affecting pay from
        // the calendar month AFTER the anniversary month, never the
        // anniversary's own month, regardless of when this is processed.
        const pendingIncrement = getPendingIncrementForPayrollMonth(emp, targetMonthKey);

        // 1. Calculate Base Salary for Current Month (Handling Mid-Month Joiners)
        let effectiveBaseSalary = emp.baseSalary;
        let isFirstMonthLateJoiner = false;
        // True whenever targetMonthKey IS this employee's own first
        // calendar month of employment — drives the automatic first-month
        // salary reserve below (item 3), regardless of which day in that
        // month they actually joined.
        let isEmployeesFirstMonth = false;

        if (emp.joinedDate) {
          const joinedDateObj = new Date(emp.joinedDate);
          const joinedMonthKey = getNYDateString(joinedDateObj).slice(0, 7);

          // Check if employee joined in this current month
          if (joinedMonthKey === targetMonthKey) {
            isEmployeesFirstMonth = true;
            const joinDayOfMonth = parseInt(getNYDateString(joinedDateObj).split('-')[2], 10);

            // Rule:
            // - If joined in month's first 5 days (joinDayOfMonth <= 5): Processed normally with full base salary.
            // - If joined after a week (joinDayOfMonth > 5): Prorated for days worked, and carried over if unpaid.
            if (joinDayOfMonth > 5) {
              isFirstMonthLateJoiner = true;
              const year = joinedDateObj.getFullYear();
              const month = joinedDateObj.getMonth();
              const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
              const daysWorkedInMonth = totalDaysInMonth - joinDayOfMonth + 1;
              const dailyRate = emp.baseSalary / totalDaysInMonth;
              effectiveBaseSalary = Math.round(daysWorkedInMonth * dailyRate);
            }
          }
        }

        // 2. Urgent Leave Deductions — 2 days' pay deducted for EACH DAY of
        // Urgent leave taken (submitted any time, no advance notice), but
        // ONLY for the days of that leave that actually fall in
        // targetMonthKey — see getApprovedLeaveDaysInMonth's own comment:
        // this used to sum every approved Urgent leave day this employee
        // had EVER taken with no month filter at all, so one approved
        // Urgent/Normal leave request kept being deducted again every
        // single month forever instead of just the month it was taken in.
        const urgentDays = getApprovedLeaveDaysInMonth(leaves, emp.fullName, 'Urgent', targetMonthKey);
        const dailyRateForDeduction = emp.baseSalary / getWeekdaysInMonth(targetMonthKey);
        const rawUrgentDeduction = Math.round(urgentDays * 2 * dailyRateForDeduction);
        // Never negative — guards against a malformed `duration` string
        // (parseLeaveDates returning something that nets out negative/NaN)
        // silently turning into a negative "deduction" that would actually
        // increase pay.
        const urgentDeduction = Number.isFinite(rawUrgentDeduction) ? Math.max(0, rawUrgentDeduction) : 0;

        // 2b. Normal Leave Deductions — the PTO/Sick-Leave replacement
        // (see LeaveApplication.type's comment): requires 14 days' advance
        // notice (enforced client-side at submission, in employee/leaves),
        // deducts 1 day's pay for EACH DAY taken (half the Urgent-leave
        // rate, by design — parallel structure, different multiplier), same
        // per-month scoping as Urgent Leave above.
        const normalDays = getApprovedLeaveDaysInMonth(leaves, emp.fullName, 'Normal', targetMonthKey);
        const rawNormalDeduction = Math.round(normalDays * 1 * dailyRateForDeduction);
        const normalDeduction = Number.isFinite(rawNormalDeduction) ? Math.max(0, rawNormalDeduction) : 0;
        const onboardingPenalty = emp.onboardingCompleted ? 0 : (emp.region === 'USA' ? 10 : 200);

        // 3. Absence Deductions — see getAbsenceDeductionForMonth's own
        // comment for why this is recomputed from the employee's current
        // base salary instead of summing each record's frozen snapshot.
        const absenceDeduction = getAbsenceDeductionForMonth(absenceRecords, emp.email, emp.baseSalary, targetMonthKey, leaves);

        // 3b. Shift Shortfall Deductions — see getShiftShortfallDeduction's
        // comment. Covers the 4h-8h partial-shift range that absence
        // detection (< 4h only) never touched at all.
        const shiftShortfallDeduction = getShiftShortfallDeduction(timesheets, absenceRecords, leaves, emp, emp.baseSalary, targetMonthKey);

        // 4. Prior Month Unpaid Salary Arrears — informational only.
        // If this employee has other hr_payroll rows (any month besides
        // this one) still sitting `!processed`, sum what they'd have paid
        // out (baseSalary + bonus - deductions + incrementAmount) so HR/
        // Admin can see "there's still X unpaid from a prior month" and go
        // process that old record directly. Deliberately NOT added into
        // this month's baseSalary/deductions/net-pay — see
        // PayrollRecord.pendingArrears's comment for why folding it in used
        // to quietly inflate (and re-trigger absence-deduction confusion
        // on) the CURRENT month's numbers with a prior month's already-
        // settled deduction math. Each month's own effectiveBaseSalary
        // (this month's proration only) is what actually gets paid now;
        // pendingArrears is just a pointer at old unpaid rows, never a
        // second source of truth for what this month's pay is.
        const pendingArrears = existingPayroll
          .filter(p => p.employeeId === emp.id && !p.processed && p.id !== existing?.id)
          .reduce((acc, p) => acc + (p.baseSalary + p.bonus - p.deductions + p.incrementAmount), 0);

        // Combined deductions for the month — floored at 0 (a deduction can
        // never subtract a negative amount, i.e. add to pay) and capped at
        // this month's own base salary (effectiveBaseSalary — pendingArrears
        // is purely informational now and never enters this month's pay
        // math at all, so there's nothing else it could be capped against).
        // This is the
        // safety net for exactly the scenario that prompted it: a leftover
        // bad/stale deduction (or several) summing to far more than the
        // employee's actual salary and producing a nonsensical net pay.
        // It's a display/payroll-output safeguard, not a substitute for
        // fixing the underlying bad record(s) — if this cap is ever
        // visibly kicking in for a real employee, HR/Admin should still go
        // look at why (see getAbsenceDeductionForMonth's comment for the
        // most common cause).
        // 5. First-Month Reserve (item 3) — an employee's entire first
        // calendar month of pay is withheld rather than paid out, and
        // accumulates in their reservedSalaryBalance (see hr/payroll and
        // admin/payroll pages' handleProcess, which write that balance at
        // Process time) to be paid out only at resignation/termination.
        // Folded into combinedDeductions below so net pay for this record
        // already comes out to (at most) any carried-over arrears from
        // BEFORE this month — never this month's own base salary — without
        // needing a separate net-pay formula. See PayrollRecord.
        // reservedThisMonth's comment for why this isn't its own DB column.
        const reservedThisMonth = isEmployeesFirstMonth ? Math.round(effectiveBaseSalary) : 0;

        const rawCombinedDeductions = urgentDeduction + normalDeduction + absenceDeduction + shiftShortfallDeduction + onboardingPenalty + reservedThisMonth;
        const combinedDeductions = Number.isFinite(rawCombinedDeductions)
          ? Math.max(0, Math.min(rawCombinedDeductions, effectiveBaseSalary))
          : 0;

        // Itemized breakdown — "show the reason to employee and HR why
        // salary is deducted" (explicit product decision, 2026-09-03).
        // Same not-a-DB-column treatment as reservedThisMonth: recomputed
        // fresh from the pieces above rather than persisted. Deliberately
        // uses the RAW (pre-cap) per-item amounts, not a cap-scaled share —
        // if the safety-net cap above ever kicks in, this list can sum to
        // more than the actual `deductions` charged, which is the more
        // honest picture ("here's everything that was owed, but you can
        // never be charged more than one month's pay") rather than
        // quietly rescaling each reason down.
        const deductionBreakdown: { label: string; amount: number }[] = [];
        if (urgentDeduction > 0) deductionBreakdown.push({ label: `Urgent Leave (${urgentDays} day${urgentDays === 1 ? '' : 's'} × 2 days' pay)`, amount: urgentDeduction });
        if (normalDeduction > 0) deductionBreakdown.push({ label: `Normal Leave (${normalDays} day${normalDays === 1 ? '' : 's'} × 1 day's pay)`, amount: normalDeduction });
        if (absenceDeduction > 0) deductionBreakdown.push({ label: 'Absence (no-show / under 4h / inactivity)', amount: absenceDeduction });
        if (shiftShortfallDeduction > 0) deductionBreakdown.push({ label: 'Partial Shifts (worked under 8h, at/above 4h)', amount: shiftShortfallDeduction });
        if (onboardingPenalty > 0) deductionBreakdown.push({ label: 'Onboarding Not Completed', amount: onboardingPenalty });
        if (reservedThisMonth > 0) deductionBreakdown.push({ label: 'First-Month Reserve (not lost — paid at resignation/termination)', amount: reservedThisMonth });

        if (existing) {
          return {
            ...existing,
            region: emp.region,
            baseSalary: existing.processed ? existing.baseSalary : effectiveBaseSalary,
            deductions: combinedDeductions,
            incrementAmount: existing.processed ? existing.incrementAmount : pendingIncrement,
            month: targetMonthKey,
            reservedThisMonth,
            deductionBreakdown,
            pendingArrears,
          };
        }

        return {
          id: '',
          employeeId: emp.id,
          name: emp.fullName,
          role: emp.jobTitle || 'Staff',
          region: emp.region,
          baseSalary: effectiveBaseSalary,
          unpaidLeaves: emp.onboardingCompleted ? 0 : 2,
          bonus: 0,
          deductions: combinedDeductions,
          incrementAmount: pendingIncrement,
          processed: false,
          month: targetMonthKey,
          pendingArrears,
          reservedThisMonth,
          deductionBreakdown,
        };
      });
  },
  // upsertPayrollRecord (public pbCreate/pbUpdate write to hr_payroll) removed —
  // dead code with zero remaining callers (superseded by upsertPayrollRecordAdmin,
  // the authenticated /api/admin/payroll POST route) before hr_payroll's
  // PocketBase rules were ever locked, per plan 012 Phase 1.


  // ─────────────────────────────────────────────────────────────────────────





  // ── KV Overlay Helpers ───────────────────────────────────────────────
  // deleteKV removed (2026-09-10) — its only caller (GoogleIntegrationCard's
  // disconnect flow) now goes through the authenticated
  // /api/google/integration route instead (see that route's own comment).
  getKV: async (key: string): Promise<any | null> => pbGetKV(key),
  setKV: async (key: string, value: any): Promise<void> => pbSetKV(key, value),
};
