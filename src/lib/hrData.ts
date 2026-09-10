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


export function isTechnicalSupportMember(teams?: string[] | null): boolean {
  if (!teams || !Array.isArray(teams)) return false;
  return teams.some(t => {
    const lower = (t || '').toLowerCase().trim();
    return lower === 'technical support' || lower === 'internal technical support';
  });
}

// Team members and team leads only ever see the Alias (or the real name as
// a fallback if no alias has been set yet — better than showing a blank).
// HR/Admin see the real name with the alias appended for reference. This is
// UI-level masking only — see the security caveat in project notes; every
// hr_ collection is currently publicly readable, so this is not a real
// access boundary until PocketBase auth rules are turned on for production.
export function displayName(profile: { fullName: string; alias?: string } | null | undefined, viewerRole: 'employee' | 'hr' | 'admin' | 'team_lead' | null | undefined): string {
  if (!profile) return '';
  const canSeeRealName = viewerRole === 'hr' || viewerRole === 'admin';
  if (canSeeRealName) {
    return profile.alias ? `${profile.fullName} (${profile.alias})` : profile.fullName;
  }
  return profile.alias || profile.fullName;
}

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
export const MAX_USER_SESSION_DEVICES = 2;
// If a device's slot hasn't heartbeated in this long, it's treated as
// abandoned (browser/tab closed without hitting Log Out) and doesn't count
// against the cap — so an employee whose old laptop just silently died
// isn't ever permanently locked out of one of their 2 slots.
export const USER_SESSION_STALE_MS = 3 * 60 * 1000; // 3 minutes tolerance for multi-device heartbeat check
const userSessionKeyFor = (email: string) => `user_session_${(email || '').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

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

const profileExtraKey = (profileId: string) => `hr_profile_extra_${profileId}`;

export async function getProfileExtras(profileId: string): Promise<Partial<Profile>> {
  if (!profileId) return {};
  return ((await pbGetKV(profileExtraKey(profileId))) as Partial<Profile>) || {};
}

export async function saveProfileExtras(profileId: string, extras: Partial<Profile>): Promise<void> {
  if (!profileId) return;
  const existing = (await pbGetKV(profileExtraKey(profileId))) || {};
  await pbSetKV(profileExtraKey(profileId), { ...existing, ...extras });
}

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
const profileDocsKey = (profileId: string) => `hr_profile_docs_${profileId}`;
const PROFILE_DOC_KEYS: (keyof Profile)[] = ['cvFileName', 'cvFileData', 'identityDocs', 'passportFileName', 'passportFileData'];

export async function getProfileDocuments(profileId: string): Promise<Partial<Profile>> {
  if (!profileId) return {};
  return ((await pbGetKV(profileDocsKey(profileId))) as Partial<Profile>) || {};
}

export async function saveProfileDocuments(profileId: string, docs: Partial<Profile>): Promise<void> {
  if (!profileId) return;
  const existing = (await pbGetKV(profileDocsKey(profileId))) || {};
  await pbSetKV(profileDocsKey(profileId), { ...existing, ...docs });
}

function toProfile(p: any, extras: Partial<Profile> = {}): Profile {
  return {
    id: p.id,
    fullName: p.full_name,
    email: p.email,
    role: p.role,
    joinedDate: p.joined_date,
    onboardingCompleted: !!p.onboarding_completed,
    baseSalary: Number(p.base_salary) || 0,
    teams: p.teams || [],
    password: p.password,
    isTeamLead: p.is_team_lead === true || p.is_team_lead === 'true',
    leadTeams: p.lead_teams || [],
    isWarehouseLead: !!p.is_warehouse_lead,
    managedWarehouses: p.managed_warehouses || [],
    jobTitle: p.job_title,
    gender: p.gender,
    bankName: p.bank_name,
    accountNumber: p.account_number,
    iban: p.iban,
    // Prefer the real PocketBase file field (profile_picture_file) — a
    // proper uploaded file served via PocketBase's own file URL — over the
    // legacy `profile_picture` text column, which used to hold the entire
    // picture as an inline base64 string (see uploadProfilePicture below for
    // why that had to change: OneSignal's push notification large-icon
    // field needs a real fetchable URL, and every profile list load was
    // downloading everyone's full-size encoded photo whether or not it was
    // even being displayed). Falls back to the old text field for any
    // profile that hasn't been migrated yet — see
    // migration_data/migrate_profile_pictures_to_files.mjs.
    profilePicture: p.profile_picture_file
      ? pb.files.getURL(p, p.profile_picture_file)
      : (p.profile_picture || undefined),
    region: p.region,
    assignedWarehouses: p.assigned_warehouses || [],
    trackingEnabled: !!p.tracking_enabled,
    salaryStartDate: p.salary_start_date || p.joined_date || '',
    ...extras,
  };
}

function fromProfileFields(p: Partial<Profile>): any {
  const fields: any = {};
  if (p.fullName !== undefined) fields.full_name = p.fullName;
  // Normalize to lowercase on write — every downstream lookup (timesheets,
  // tasks, tickets, tracking settings, absence records, etc.) assumes a
  // lowercase employeeEmail and either does a case-insensitive `~` filter
  // with a client-side re-check, or (in a few older/simpler call sites) a
  // plain exact `=` filter that silently fails to match a mixed-case email.
  // Normalizing here, once, at the source is safer than trying to make
  // every one of those call sites case-insensitive.
  if (p.email !== undefined) fields.email = p.email.toLowerCase();
  if (p.role !== undefined) fields.role = p.role;
  if (p.joinedDate !== undefined) fields.joined_date = p.joinedDate;
  if (p.onboardingCompleted !== undefined) fields.onboarding_completed = p.onboardingCompleted;
  if (p.baseSalary !== undefined) fields.base_salary = p.baseSalary;
  if (p.teams !== undefined) fields.teams = p.teams;
  if (p.password !== undefined) fields.password = p.password;
  if (p.isTeamLead !== undefined) fields.is_team_lead = String(!!p.isTeamLead);
  if (p.leadTeams !== undefined) fields.lead_teams = p.leadTeams;
  if (p.isWarehouseLead !== undefined) fields.is_warehouse_lead = p.isWarehouseLead;
  if (p.managedWarehouses !== undefined) fields.managed_warehouses = p.managedWarehouses;
  if (p.jobTitle !== undefined) fields.job_title = p.jobTitle;
  if (p.gender !== undefined) fields.gender = p.gender;
  if (p.bankName !== undefined) fields.bank_name = p.bankName;
  if (p.accountNumber !== undefined) fields.account_number = p.accountNumber;
  if (p.iban !== undefined) fields.iban = p.iban;
  // profilePicture is deliberately NOT mapped here — it never goes through
  // this plain-JSON path anymore. updateProfileDetails below strips it out
  // of `real` and routes it through uploadProfilePicture() instead, which
  // uploads it as an actual file (multipart) to profile_picture_file rather
  // than writing a giant base64 string into a text column.
  if (p.region !== undefined) fields.region = p.region;
  if (p.assignedWarehouses !== undefined) fields.assigned_warehouses = p.assignedWarehouses;
  if (p.trackingEnabled !== undefined) fields.tracking_enabled = p.trackingEnabled;
  if (p.salaryStartDate !== undefined) fields.salary_start_date = p.salaryStartDate;
  return fields;
}

// NOTE: document fields (cvFileName/cvFileData/identityDocs/passportFileName/
// passportFileData) are deliberately NOT in this list — they route through
// PROFILE_DOC_KEYS / saveProfileDocuments instead. See the comment above
// profileDocsKey.
const OVERLAY_KEYS: (keyof Profile)[] = [
  'offboarded', 'offboardDate', 'offboardingStatus', 'lastIncrementProcessedYear',
  'accountCreationDate', 'alias', 'approvalStatus', 'approvalReviewedBy',
  'approvalReviewedAt', 'approvalRejectionReason', 'personalPhone', 'companyPhone',
  'exemptFromAbsenceCheck', 'reservedSalaryBalance', 'manualReservedAmount', 'manualReservedNote',
];



// ---------------------------------------------------------------------------
// QUERY HOOKS — the only supported way to read data. In-memory cache only.
// ---------------------------------------------------------------------------

export function useProfiles() {
  return useQuery({
    queryKey: ['hr_profiles'],
    queryFn: async () => {
      const [records, extraRows] = await Promise.all([
        pbList('hr_profiles', { sort: 'full_name' }),
        pbGetKVByPrefix('hr_profile_extra_'),
      ]);
      const extrasById: Record<string, Partial<Profile>> = {};
      extraRows.forEach(row => { extrasById[row.key.replace('hr_profile_extra_', '')] = row.value || {}; });
      return records.map((r: any) => toProfile(r, extrasById[r.id] || {}));
    },
  });
}
// Fetches ONE employee's CV/passport/identity-document scans on demand —
// NOT part of useProfiles(). Only call this where those files are actually
// about to be shown (a documents review modal, the employee's own profile
// page), keyed on that one profileId, so nobody pays for every employee's
// documents just to load a dashboard or list page.
export function useProfileDocuments(profileId: string | null | undefined) {
  return useQuery({
    queryKey: ['hr_profile_docs', profileId],
    queryFn: () => getProfileDocuments(profileId as string),
    enabled: !!profileId,
  });
}

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
export function useProfileSelf() {
  return useQuery({
    queryKey: ['profile_self'],
    queryFn: async (): Promise<ProfileSelf | null> => {
      const token = getAuthToken();
      if (!token) return null;
      const res = await fetch(`${API_BASE}/api/profile/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
  });
}

// Update any subset of the caller's own bank/phone/document/picture fields
// — see /api/profile/me's PATCH handler for the exact field list. Throws on
// failure (mirrors pbUpdate/pbCreate's existing throw-on-!res.ok pattern
// elsewhere in this file) — callers already wrap these calls in try/catch.
export async function updateProfileSelf(fields: Partial<{
  bankName: string; accountNumber: string; iban: string;
  personalPhone: string; companyPhone: string;
  cvFileName: string; cvFileData: string;
  identityDocs: { name: string; data: string }[];
  passportFileName: string; passportFileData: string;
  profilePicture: string;
  onboardingCompleted: boolean;
  approvalStatus: string;
}>): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error('Not signed in.');
  const res = await fetch(`${API_BASE}/api/profile/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Update failed: ${res.status}`);
  }
}

// Self-service password change — verifies currentPassword server-side and
// never exposes the real stored value to the client. Replaces the old
// client-side `profile.password !== currentPass` comparison in
// employee/profile/page.tsx, which relied on the plaintext password field
// being present in the (fully-public) useProfiles() response.
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error('Not signed in.');
  const res = await fetch(`${API_BASE}/api/profile/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || 'Current password is incorrect.');
  }
}

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

async function adminProfileRequest(
  method: 'POST' | 'PUT' | 'PATCH',
  body: Record<string, any>
): Promise<any> {
  const token = getAuthToken();
  if (!token) throw new Error('Not signed in.');
  const res = await fetch(`${API_BASE}/api/admin/profile`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
  return res.json().catch(() => ({}));
}

// General-purpose field update on ANY profileId — role/teams/leadTeams/
// warehouses/baseSalary/offboarding/alias/etc. Mirrors
// hrActions.updateProfileDetails' real/overlay/docs split (done server-side
// via src/lib/profileFields.ts) and additionally routes a `password` field
// through a hashed write instead of ever writing it in plaintext (see the
// route's comment on this — the old client path silently rewrote the
// plaintext password on every profile save, whether or not it changed).
export async function updateProfileAdmin(profileId: string, updates: Record<string, any>): Promise<void> {
  await adminProfileRequest('POST', { profileId, updates });
}

export async function approveOnboardingServer(profile: Profile, _reviewerEmail?: string): Promise<void> {
  await adminProfileRequest('PUT', { action: 'approveOnboarding', profileId: profile.id });
  // Notification-send is unrelated to hr_profiles/hr_payroll access control
  // (hr_notifications isn't part of this migration) — kept on the existing
  // public path via hrActions, same as before.
  await hrActions.addNotification(profile.email, 'employee', 'Your onboarding documents were approved — your dashboard is now unlocked!');
}

export async function rejectOnboardingServer(profile: Profile, _reviewerEmail: string, reason: string): Promise<void> {
  await adminProfileRequest('PUT', { action: 'rejectOnboarding', profileId: profile.id, rejectionReason: reason });
  await hrActions.addNotification(profile.email, 'employee', `Your onboarding documents need another look: ${reason}`);
}

// Admin-triggered reset of ANOTHER employee's password — always stores a
// bcrypt hash server-side (unlike hrActions.resetPassword, which still
// writes plaintext via the public client and is being phased out in favor
// of this).
export async function resetPasswordServer(profileId: string, newPassword: string): Promise<void> {
  await adminProfileRequest('PUT', { action: 'resetPassword', profileId, newPassword });
}

// Same processedThroughYear computation as hrActions.applyAnniversaryIncrement
// (kept identical so the two don't drift), just posted to the admin route
// instead of writing hr_profiles directly from the browser.
export async function applyIncrementServer(profile: Profile, currentBaseSalary: number, incrementAmount: number): Promise<void> {
  if (incrementAmount <= 0) return;
  const anniversarySource = profile.salaryStartDate || profile.joinedDate;
  const anniversaryDate = anniversarySource ? new Date(anniversarySource) : null;
  const now = new Date();
  let processedThroughYear = now.getFullYear();
  if (anniversaryDate && !isNaN(anniversaryDate.getTime())) {
    let eventsElapsed = now.getFullYear() - anniversaryDate.getFullYear();
    const thisYearAnniversary = new Date(now.getFullYear(), anniversaryDate.getMonth(), anniversaryDate.getDate());
    if (thisYearAnniversary > now) eventsElapsed -= 1;
    processedThroughYear = anniversaryDate.getFullYear() + Math.max(0, eventsElapsed);
  }
  await adminProfileRequest('PUT', {
    action: 'applyIncrement',
    profileId: profile.id,
    newBaseSalary: currentBaseSalary + incrementAmount,
    processedYear: processedThroughYear,
  });
}

// Creates a new employee via the admin-gated route — server hashes the
// initial/temp password instead of writing it in plaintext (addEmployee's
// old client path did fromProfileFields(emp).password = plaintext).
export async function addEmployeeServer(emp: Omit<Profile, 'id' | 'onboardingCompleted'>): Promise<{ id: string; tempPassword?: string }> {
  return adminProfileRequest('PATCH', { action: 'addEmployee', profile: emp });
}

// Thin admin-gated equivalents of hrActions.updateEmployeeTeams/setTeamLead
// — same field mapping (teams / is_team_lead+lead_teams), just written
// through /api/admin/profile instead of the public client. hr_teams itself
// (the separate collection tracking each team's member-list/lead) is
// unaffected and stays on the existing hrActions.updateTeamMembers/
// updateTeamLead path — out of scope for this hr_profiles/hr_payroll pass.
export async function updateEmployeeTeamsAdmin(profileId: string, newTeams: string[]): Promise<void> {
  await updateProfileAdmin(profileId, { teams: newTeams });
}

export async function setTeamLeadAdmin(profileId: string, leadTeams: string[]): Promise<void> {
  await updateProfileAdmin(profileId, { isTeamLead: leadTeams.length > 0, leadTeams });
}

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



// A TimesheetEntry's `date` field is fixed to whatever calendar date it


// ---------------------------------------------------------------------------
// Team Chat unseen-activity signature — same "count vs. last-seen count in
// localStorage" pattern as tickets above, used to light up a dot on the
// Team Chat nav item (every role, not just HR/Admin).
// ---------------------------------------------------------------------------

// `myTeamIds` is 'all' for Admin (auto-a-member of every channel) or the

// ---------------------------------------------------------------------------
// hrActions — every write in the app goes through here.
// ---------------------------------------------------------------------------

export const hrActions = {
  ...notificationActions,
  ...careerActions,
  ...taskActions,
  ...ticketActions,
  ...teamActions,
  ...leaveActions,
  ...timesheetActions,
  ...absenceActions,
  // ── Profiles ──────────────────────────────────────────────────────────
  addEmployee: async (emp: Omit<Profile, 'id' | 'onboardingCompleted'>): Promise<Profile> => {
    const fields = fromProfileFields({ ...emp, onboardingCompleted: false });
    const created = await pbCreate('hr_profiles', fields);
    // accountCreationDate is an overlay-only field (no hr_profiles column),
    // so fromProfileFields drops it — persist it separately or it's lost.
    if (emp.accountCreationDate) {
      await saveProfileExtras(created.id, { accountCreationDate: emp.accountCreationDate });
    }
    // clear tombstone if this email was previously deleted
    if (emp.email) {
      const existing = ((await pbGetKV('hr_deleted_profile_emails_v1')) as string[]) || [];
      const lower = emp.email.toLowerCase();
      if (existing.map(e => e.toLowerCase()).includes(lower)) {
        await pbSetKV('hr_deleted_profile_emails_v1', existing.filter(e => e.toLowerCase() !== lower));
      }
    }
    return toProfile(created, emp.accountCreationDate ? { accountCreationDate: emp.accountCreationDate } : {});
  },

  updateProfileDetails: async (profileId: string, updates: Partial<Profile>): Promise<void> => {
    const overlay: Partial<Profile> = {};
    const docs: Partial<Profile> = {};
    const real: Partial<Profile> = {};
    (Object.keys(updates) as (keyof Profile)[]).forEach(k => {
      // profilePicture never goes through the plain-JSON `real` path — see
      // uploadProfilePicture below, called separately a few lines down.
      if (k === 'profilePicture') return;
      if (PROFILE_DOC_KEYS.includes(k)) (docs as any)[k] = (updates as any)[k];
      else if (OVERLAY_KEYS.includes(k)) (overlay as any)[k] = (updates as any)[k];
      else (real as any)[k] = (updates as any)[k];
    });
    if (Object.keys(real).length > 0) await pbUpdate('hr_profiles', profileId, fromProfileFields(real));
    if (Object.keys(overlay).length > 0) await saveProfileExtras(profileId, overlay);
    if (Object.keys(docs).length > 0) await saveProfileDocuments(profileId, docs);
    if (updates.profilePicture !== undefined) await hrActions.uploadProfilePicture(profileId, updates.profilePicture);
  },

  // Uploads a profile picture as a REAL PocketBase file (multipart), into
  // the profile_picture_file field — not the legacy profile_picture text
  // column, which used to store the entire image as an inline base64
  // string. That base64 approach had two real problems: (1) OneSignal's
  // push-notification large-icon field needs a URL it can actually fetch
  // over HTTP(S) — it can't render an inline base64 data URI, so shift/
  // ticket/chat push notifications could never show a real profile photo;
  // (2) every useProfiles() load (basically every dashboard page) was
  // downloading every employee's full-size encoded photo inline in the
  // JSON response, whether or not that page even displays it.
  //
  // dataUrl is whatever AvatarCropperModal.tsx already produces (a
  // `data:image/webp;base64,...` string from canvas.toDataURL) — this
  // function is the ONLY place that needs to change to make that work with
  // a real file field; the cropper itself doesn't need touching.
  //
  // Passing an empty string clears the picture (removes the file).
  uploadProfilePicture: async (profileId: string, dataUrl: string): Promise<void> => {
    if (!dataUrl) {
      // PocketBase's convention for clearing a single file field via
      // multipart: send the field name with an empty value.
      const formData = new FormData();
      formData.append('profile_picture_file', '');
      await pb.collection('hr_profiles').update(profileId, formData);
      return;
    }
    const blob = await (await fetch(dataUrl)).blob();
    const formData = new FormData();
    formData.append('profile_picture_file', blob, `profile_${profileId}.webp`);
    await pb.collection('hr_profiles').update(profileId, formData);
  },

  // Onboarding approval gate — see approvalStatus on Profile and the gate
  // screen in (dashboard)/layout.tsx. Approving unlocks the employee's
  // dashboard on their next load; rejecting keeps them locked out with a
  // reason HR/Admin can leave for them.
  approveOnboarding: async (profile: Profile, reviewerEmail: string): Promise<void> => {
    await saveProfileExtras(profile.id, {
      approvalStatus: 'approved',
      approvalReviewedBy: reviewerEmail,
      approvalReviewedAt: new Date().toISOString(),
      approvalRejectionReason: undefined,
    });
    await hrActions.addNotification(profile.email, 'employee', 'Your onboarding documents were approved — your dashboard is now unlocked!');
  },
  rejectOnboarding: async (profile: Profile, reviewerEmail: string, reason: string): Promise<void> => {
    await saveProfileExtras(profile.id, {
      approvalStatus: 'rejected',
      approvalReviewedBy: reviewerEmail,
      approvalReviewedAt: new Date().toISOString(),
      approvalRejectionReason: reason,
    });
    await hrActions.addNotification(profile.email, 'employee', `Your onboarding documents need another look: ${reason}`);
  },

  // Purges every trace of this employee across the database, not just the
  // hr_profiles row. Previously "Delete Permanently" only removed the
  // profile row and left everything else (documents, payroll, leaves,
  // tasks, tickets, timesheets, screenshots, notifications, tracking
  // token) orphaned in place indefinitely — this now actually deletes it.
  // Callers should prompt HR/Admin to download an export first (see
  // exportEmployeeArchive below) since this is irreversible.
  // NOTE: hr_messages (Team Chat) is deliberately NOT included in this
  // purge — team chat history is a shared, team-owned record, not this one
  // person's individual data, so their sent messages/files stay visible to
  // the rest of the team even after a full account deletion (same as they
  // already do through offboarding, see confirmOffboard in
  // UserProfileModal.tsx). Don't add hr_messages here without asking first.
  deleteEmployee: async (id: string, email: string, fullName?: string): Promise<void> => {
    const lower = (email || '').toLowerCase();

    // Revoke tracking: remove their row from the tracking-settings list so
    // an already-installed desktop tracker can't keep polling with a
    // still-valid token and silently uploading screenshots after they're
    // gone. Also drop their heartbeat row.
    if (email) {
      const settingsRow = await pbFindByField('hr_tracking_settings', 'employeeEmail', lower)
        ?? (await pbList('hr_tracking_settings', { filter: `employeeEmail ~ "${lower.replace(/"/g, '\\"')}"` }))
          .find((r: any) => (r.employeeEmail || '').toLowerCase() === lower);
      if (settingsRow) await pbDelete('hr_tracking_settings', settingsRow.id);
      await pbDeleteKVByKeys([`tracker_heartbeat_${lower.replace(/[^a-z0-9]/g, '_')}`]);
    }

    // Screenshots — both the real hr_screenshots collection and any
    // legacy base64 rows still in hr_delcargo_store. Best-effort: a single
    // stale/already-gone screenshot row must not abort the whole deletion
    // (deleteScreenshots itself now uses allSettled, but guard here too in
    // case getScreenshots/the call itself throws for an unrelated reason).
    if (email) {
      try {
        const shots = await hrActions.getScreenshots({ employeeEmail: email });
        if (shots.length) await hrActions.deleteScreenshots(shots.map(s => s.id));
      } catch (err) {
        console.error('[hrData] deleteEmployee: screenshot cleanup failed, continuing:', err);
      }
    }

    // Everything else, deleted in parallel — each resource type is
    // independent, so one failing shouldn't block the others.
    const deletions: Promise<any>[] = [];
    if (email) {
      deletions.push(
        deletePayrollForEmployeeAdmin(id),
        pbListByEmailField('hr_timesheets', 'employee_id', email)
          .then(rows => Promise.allSettled(rows.map((r: any) => pbDelete('hr_timesheets', r.id)))),
        pbListByEmailField('hr_tasks', 'assigned_email', email)
          .then(rows => Promise.allSettled(rows.map((r: any) => pbDelete('hr_tasks', r.id)))),
        pbListByEmailField('hr_tickets', 'employee_email', email)
          .then(rows => Promise.allSettled(rows.map((r: any) => pbDelete('hr_tickets', r.id)))),
        deleteCareerApplicationsForEmailAdmin(email),
        pbListByEmailField('hr_notifications', 'recipient_email', email)
          .then(rows => Promise.allSettled(rows.map((r: any) => pbDelete('hr_notifications', r.id)))),
      );
    }
    if (fullName) {
      // hr_leaves has no email field — matched by name everywhere else in
      // this app (see getApprovedLeaveDays/getRemainingPTO), so do the same here.
      deletions.push(
        pbList('hr_leaves', { filter: `employee_name = "${fullName.replace(/"/g, '\\"')}"` })
          .then(rows => Promise.allSettled(rows.map((r: any) => pbDelete('hr_leaves', r.id))))
      );
    }
    if (email) {
      // Remove them from any team member lists so they don't linger as a
      // dangling member reference.
      deletions.push(
        pbList('hr_teams').then(teams => Promise.allSettled(
          teams
            .filter((t: any) => (t.members || []).some((m: string) => (m || '').toLowerCase() === lower))
            .map((t: any) => pbUpdate('hr_teams', t.id, { members: (t.members || []).filter((m: string) => (m || '').toLowerCase() !== lower) }))
        ))
      );
      // Per-user notification read/cleared map entries.
      deletions.push((async () => {
        const readMap = ((await pbGetKV('hr_notification_reads_prod_v1')) as Record<string, string[]>) || {};
        const clearedMap = ((await pbGetKV('hr_notification_cleared_prod_v1')) as Record<string, string[]>) || {};
        let readChanged = false, clearedChanged = false;
        for (const key of Object.keys(readMap)) if (key.toLowerCase() === lower) { delete readMap[key]; readChanged = true; }
        for (const key of Object.keys(clearedMap)) if (key.toLowerCase() === lower) { delete clearedMap[key]; clearedChanged = true; }
        if (readChanged) await pbSetKV('hr_notification_reads_prod_v1', readMap);
        if (clearedChanged) await pbSetKV('hr_notification_cleared_prod_v1', clearedMap);
      })());
    }
    await Promise.allSettled(deletions);

    // Finally the profile row itself, plus the tombstone (so a future
    // re-add with this same email starts clean rather than tripping over
    // stale overlay-key assumptions).
    await pbDelete('hr_profiles', id);
    if (email) {
      const existing = ((await pbGetKV('hr_deleted_profile_emails_v1')) as string[]) || [];
      if (!existing.map(e => e.toLowerCase()).includes(lower)) {
        await pbSetKV('hr_deleted_profile_emails_v1', [...existing, lower]);
      }
    }

    // Profile-extras overlay (offboarded/offboardDate/offboardingStatus etc.)
    // and the separate profile-documents overlay (CV/passport/identity
    // scans — see profileDocsKey). This runs LAST, deliberately: if
    // anything above throws, the overlay (and therefore the "Offboarded"
    // status) must stay intact so a failed, partial delete doesn't silently
    // revert the employee to "active".
    await pbDeleteKVByKeys([profileExtraKey(id), profileDocsKey(id)]);
  },

  // Bundles everything the app knows about one employee into a downloadable
  // ZIP — profile + decoded documents (CV/passport/identity docs, using
  // their original filenames), payroll/leaves/tasks/tickets/timesheets/
  // career-application/notification records as JSON, and actual screenshot
  // image files. Meant to be offered right before "Delete Permanently"
  // (which is irreversible and, as of the fix above, actually purges all
  // of this).
  exportEmployeeArchive: async (profile: Profile): Promise<{ filename: string; blob: Blob }> => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const email = profile.email;

    const { password, ...profileMeta } = profile as any;
    zip.file('profile.json', JSON.stringify(profileMeta, null, 2));

    // Documents no longer travel with the Profile object (see
    // profileDocsKey above) — fetch this one employee's on demand here.
    const { cvFileName, cvFileData, passportFileName, passportFileData, identityDocs } = await getProfileDocuments(profile.id);

    const addDataUrlFile = (filename: string | undefined, dataUrl: string | undefined) => {
      if (!dataUrl || !filename) return;
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      zip.file(`documents/${filename}`, base64, { base64: true });
    };
    addDataUrlFile(cvFileName, cvFileData);
    addDataUrlFile(passportFileName, passportFileData);
    (identityDocs || []).forEach((doc: { name?: string; data?: string }, i: number) => {
      if (!doc?.data) return;
      const base64 = doc.data.includes(',') ? doc.data.split(',')[1] : doc.data;
      zip.file(`documents/${doc.name || `identity_${i}`}`, base64, { base64: true });
    });

    const [payrollRows, timesheetRows, taskRows, ticketRows, appRows, notifRows, leaveRows, shots] = await Promise.all([
      getPayrollForEmployeeAdmin(profile.id),
      pbListByEmailField('hr_timesheets', 'employee_id', email),
      pbListByEmailField('hr_tasks', 'assigned_email', email),
      pbListByEmailField('hr_tickets', 'employee_email', email),
      email ? getCareerApplicationsForEmailAdmin(email) : Promise.resolve([]),
      pbListByEmailField('hr_notifications', 'recipient_email', email),
      pbList('hr_leaves', { filter: `employee_name = "${profile.fullName.replace(/"/g, '\\"')}"` }),
      email ? hrActions.getScreenshots({ employeeEmail: email }) : Promise.resolve([]),
    ]);
    zip.file('payroll.json', JSON.stringify(payrollRows, null, 2));
    zip.file('timesheets.json', JSON.stringify(timesheetRows, null, 2));
    zip.file('tasks.json', JSON.stringify(taskRows, null, 2));
    zip.file('tickets.json', JSON.stringify(ticketRows, null, 2));
    zip.file('career_applications.json', JSON.stringify(appRows, null, 2));
    zip.file('notifications.json', JSON.stringify(notifRows, null, 2));
    zip.file('leaves.json', JSON.stringify(leaveRows, null, 2));

    await Promise.all(shots.map(async (s, i) => {
      try {
        const res = await fetch(s.imageUrl);
        const blob = await res.blob();
        const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
        zip.file(`screenshots/${new Date(s.timestamp).toISOString().replace(/[:.]/g, '-')}_${i}.${ext}`, blob);
      } catch {
        // Best-effort — one broken/expired image URL shouldn't abort the whole export.
      }
    }));

    const blob = await zip.generateAsync({ type: 'blob' });
    const filename = `${profile.fullName.replace(/\s+/g, '_')}_data_export_${new Date().toISOString().split('T')[0]}.zip`;
    return { filename, blob };
  },

  updateOnboardingStatus: (profileId: string, completed: boolean) =>
    pbUpdate('hr_profiles', profileId, { onboarding_completed: completed }),

  updateEmployeeTeams: (profileId: string, newTeams: string[]) =>
    pbUpdate('hr_profiles', profileId, { teams: newTeams }),

  setTeamLead: (profileId: string, leadTeams: string[]) =>
    pbUpdate('hr_profiles', profileId, { is_team_lead: String(leadTeams.length > 0), lead_teams: leadTeams }),

  resetPassword: (profileId: string, newPass: string) =>
    pbUpdate('hr_profiles', profileId, { password: newPass }),

  // Applies the full pending increment (including any back-filled missed
  // years) in one shot and stamps lastIncrementProcessedYear to the calendar
  // year of the most recent anniversary event that's now caught up — not
  // just "this year" — so a multi-year backfill doesn't get silently
  // re-triggered next time this runs.
  applyAnniversaryIncrement: async (profile: Profile, currentBaseSalary: number, incrementAmount: number): Promise<void> => {
    if (incrementAmount <= 0) return;
    const anniversarySource = profile.salaryStartDate || profile.joinedDate;
    const anniversaryDate = anniversarySource ? new Date(anniversarySource) : null;
    const now = new Date();
    let processedThroughYear = now.getFullYear();
    if (anniversaryDate && !isNaN(anniversaryDate.getTime())) {
      let eventsElapsed = now.getFullYear() - anniversaryDate.getFullYear();
      const thisYearAnniversary = new Date(now.getFullYear(), anniversaryDate.getMonth(), anniversaryDate.getDate());
      if (thisYearAnniversary > now) eventsElapsed -= 1;
      processedThroughYear = anniversaryDate.getFullYear() + Math.max(0, eventsElapsed);
    }
    await pbUpdate('hr_profiles', profile.id, { base_salary: currentBaseSalary + incrementAmount });
    await saveProfileExtras(profile.id, { lastIncrementProcessedYear: processedThroughYear });
  },

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




  // ── Multi-device session enforcement (Employee/Team Lead only) ──────────
  // Reads the raw KV row and normalizes it into an array — a pre-existing
  // session written before this multi-device migration is a bare
  // {email, sessionToken, deviceLabel, loggedInAt, lastSeenAt} object with
  // no deviceId; treated as one legacy slot (deviceId 'legacy') so an
  // in-flight session from right before this shipped doesn't just vanish
  // and force everyone to re-login.
  getUserSessions: async (email: string): Promise<UserSessionSlot[]> => {
    const raw = await pbGetKV(userSessionKeyFor(email));
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    return [{
      deviceId: 'legacy',
      deviceLabel: raw.deviceLabel || 'Unknown device',
      sessionToken: raw.sessionToken,
      loggedInAt: raw.loggedInAt,
      lastSeenAt: raw.lastSeenAt,
    }];
  },
  isSessionSlotLive: (s: UserSessionSlot | null | undefined): boolean =>
    !!s?.lastSeenAt && (Date.now() - new Date(s.lastSeenAt).getTime()) < USER_SESSION_STALE_MS,
  // Attempts to claim a device slot at login. If this exact deviceId
  // already has a (possibly stale) slot, it's just refreshed — logging out
  // and back in on the same device never counts as a new one. Otherwise, a
  // new slot is added only if fewer than MAX_USER_SESSION_DEVICES OTHER
  // devices are currently live; if the cap is already full, returns
  // `{ ok: false, liveSessions }` (the other live devices) so the caller
  // can show which devices are blocking the login, without claiming
  // anything.
  claimUserSessionSlot: async (
    email: string, deviceId: string, deviceLabel: string, sessionToken: string
  ): Promise<{ ok: boolean; liveSessions: UserSessionSlot[] }> => {
    const all = await hrActions.getUserSessions(email);
    const live = all.filter(s => hrActions.isSessionSlotLive(s));
    const others = live.filter(s => s.deviceId !== deviceId);
    if (others.length >= MAX_USER_SESSION_DEVICES) {
      return { ok: false, liveSessions: others };
    }
    const existing = live.find(s => s.deviceId === deviceId);
    const now = new Date().toISOString();
    const next: UserSessionSlot[] = [
      ...others,
      { deviceId, deviceLabel, sessionToken, loggedInAt: existing?.loggedInAt || now, lastSeenAt: now },
    ];
    await pbSetKV(userSessionKeyFor(email), next);
    return { ok: true, liveSessions: next };
  },
  // Called periodically while a dashboard session is open. Returns false if
  // this device's slot is gone — either removed remotely (the employee hit
  // "Log out" on this device from the Devices card on another device/tab)
  // or evicted by a "log out everywhere" forced login — the caller should
  // force a local logout when this happens.
  touchUserSessionSlot: async (email: string, deviceId: string, sessionToken: string): Promise<boolean> => {
    try {
      const cleanEmail = (email || '').toLowerCase().trim();
      if (!cleanEmail || !deviceId || !sessionToken) return true;

      const all = await hrActions.getUserSessions(cleanEmail);
      const mine = all.find(s => s.deviceId === deviceId);

      if (!mine) {
        // Device slot was cleared or predates current session — re-claim slot for this active device session
        await hrActions.claimUserSessionSlot(cleanEmail, deviceId, typeof navigator !== 'undefined' ? (navigator.userAgent.includes('Chrome') ? 'Browser' : 'Device') : 'Device', sessionToken);
        return true;
      }

      // If slot exists but sessionToken was explicitly changed by another login on this device -> superseded
      if (mine.sessionToken && mine.sessionToken !== sessionToken) {
        return false;
      }

      const next = all.map(s => s.deviceId === deviceId ? { ...s, sessionToken, lastSeenAt: new Date().toISOString() } : s);
      await pbSetKV(userSessionKeyFor(cleanEmail), next);
      return true;
    } catch (err) {
      console.warn('[session] touchUserSessionSlot network/server error, maintaining local session:', err);
      return true; // Never log user out on a temporary network error or fetch timeout
    }
  },
  // Removes exactly one device's slot — used both by the Profile page's
  // "Logged-in Devices" card (logging out another device remotely) and by
  // this device's own explicit Log Out (see logoutSession below).
  removeUserSessionDevice: async (email: string, deviceId: string): Promise<void> => {
    const all = await hrActions.getUserSessions(email);
    const next = all.filter(s => s.deviceId !== deviceId);
    await pbSetKV(userSessionKeyFor(email), next);
  },
  // Wipes every device slot at once — used by "Log out from everywhere and
  // sign in here" on the login screen when the 2-device cap is already full.
  clearAllUserSessions: async (email: string): Promise<void> => {
    await pbDeleteKVByKeys([userSessionKeyFor(email)]);
  },
  // Frees just THIS device's slot on explicit logout — skipped for Admin/HR,
  // who never claim one in the first place.
  logoutSession: async (email: string, role: string | null, deviceId: string): Promise<void> => {
    if (!email || role === 'admin' || role === 'hr' || !deviceId) return;
    try { await hrActions.removeUserSessionDevice(email, deviceId); } catch { /* best-effort */ }
  },

  // Single entry point for every "Log Out" button in the app (Sidebar,
  // TopNav, the onboarding-pending gate screen). For Employee/Team Lead
  // accounts this also auto-ends any currently open shift — logging out
  // shouldn't leave a shift silently running with nobody at the desk — and
  // frees the single-session slot so the employee (or someone else) can log
  // back in immediately elsewhere. Returns whether a shift was actually
  // stopped, so the caller can show a heads-up on next login.
  performLogout: async (email: string, role: string | null): Promise<{ shiftStopped: boolean }> => {
    let shiftStopped = false;
    if (email && role !== 'admin' && role !== 'hr') {
      try {
        const open = await hrActions.getOpenShift(email);
        if (open) {
          await hrActions.clockOut(email);
          shiftStopped = true;
          await hrActions.addNotification(email, 'employee', 'Your shift was automatically ended because you logged out.');
          // performLogout only ever gets a bare email/role — unlike the other
          // 3 shift notification call sites (manual button, GPS geofence,
          // closeStaleManualShiftIfAbandoned), it never had a full Profile
          // object to pull a name/alias/photo from, which is why this used
          // to just print the raw email. Fetching it fresh here is a bit
          // heavier, but logout is infrequent enough that it doesn't matter,
          // and it's what lets this notification carry the same name+alias+
          // profile-picture treatment as every other shift event.
          let actorLabel = email;
          let actorEmailForPush: string | undefined = email;
          try {
            const rawMatches = await pbList('hr_profiles', { filter: `email ~ "${email.replace(/"/g, '\\"')}"` });
            const rawProfile = rawMatches.find((r: any) => (r.email || '').toLowerCase() === email.toLowerCase());
            if (rawProfile) {
              const extras = await getProfileExtras(rawProfile.id);
              actorLabel = displayName(toProfile(rawProfile, extras), 'hr');
            }
          } catch {
            // Best-effort — worst case this notification falls back to the
            // raw email, same as before this fetch existed.
          }
          await hrActions.addNotification('all', 'hr', `${actorLabel} logged out while on shift — their shift was ended automatically.`, 'shift', actorLabel, actorEmailForPush);
          // Dashboard-only for Admin — HR already got the pushable copy above.
          await hrActions.addNotification('all', 'admin', `${actorLabel} logged out while on shift — their shift was ended automatically.`, undefined, undefined, actorEmailForPush);
          // Durable (localStorage, not the per-tab session storage used for
          // the "signed in elsewhere" notice) flag read by auth/page.tsx the
          // next time this exact email logs back in — even if that's after
          // fully closing the browser — so the employee gets a clear heads-up
          // that their shift didn't just keep running unattended.
          if (typeof window !== 'undefined') {
            try { window.localStorage.setItem(`shift_auto_stopped_${email.toLowerCase()}`, '1'); } catch { /* ignore */ }
          }
        }
      } catch { /* best-effort — never block logout on this */ }
    }
    try {
      const deviceId = await getOrCreateDeviceId();
      await hrActions.logoutSession(email, role, deviceId);
    } catch { /* best-effort — never block logout on this */ }
    return { shiftStopped };
  },
  // 2026-09-07: moved off the public PocketBase client onto an
  // authenticated route (/api/tracking/screenshots) — hr_screenshots'
  // List/View rules are locked down as part of the PocketBase public-access
  // audit, so an unauthenticated fetch here would now just 401/403. The
  // route replicates the exact same real-collection + legacy-KV merge this
  // function used to do client-side; see that route's own comment.
  getScreenshots: async (filters: { employeeEmail: string; sinceISO?: string; untilISO?: string }): Promise<Screenshot[]> => {
    const token = getAuthToken();
    if (!token) return [];
    const params = new URLSearchParams({ employeeEmail: filters.employeeEmail });
    if (filters.sinceISO) params.set('sinceISO', filters.sinceISO);
    if (filters.untilISO) params.set('untilISO', filters.untilISO);
    const res = await fetch(`${API_BASE}/api/tracking/screenshots?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []) as Screenshot[];
  },
  // Retained for the deleteEmployee purge flow (still on the public client
  // for now — see the standing note on that migration in
  // /api/admin/profile/route.ts). The routine monthly sweep no longer calls
  // this directly — see checkScreenshotRetention below.
  deleteScreenshots: async (ids: string[]): Promise<void> => {
    const realIds = ids.filter(id => looksLikeRealId(id));
    const legacyIds = ids.filter(id => !looksLikeRealId(id));
    // allSettled, not all: a single already-gone/stale screenshot row must
    // not abort deletion of the rest of the batch (this used to bubble up
    // and kill the whole employee-delete flow on one bad row).
    await Promise.allSettled([
      ...realIds.map(id => pbDelete('hr_screenshots', id)),
      legacyIds.length ? pbDeleteKVByKeys(legacyIds.map(id => `screenshot_${id}`)) : Promise.resolve(),
    ]);
  },

  // ── KV Overlay Helpers ───────────────────────────────────────────────
  // deleteKV removed (2026-09-10) — its only caller (GoogleIntegrationCard's
  // disconnect flow) now goes through the authenticated
  // /api/google/integration route instead (see that route's own comment).
  getKV: async (key: string): Promise<any | null> => pbGetKV(key),
  setKV: async (key: string, value: any): Promise<void> => pbSetKV(key, value),
};
