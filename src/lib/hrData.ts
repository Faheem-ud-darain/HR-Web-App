'use client';
import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { pb } from './pocketbase';
import { getNYDateString, formatTimeNY, formatDateNY } from './timezone';
import { getOrCreateDeviceId } from './session';

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

const WORKING_DAYS_PER_MONTH = 22;

// ---------------------------------------------------------------------------
// Low-level PocketBase primitives
// ---------------------------------------------------------------------------

function looksLikeRealId(id: any): boolean {
  return typeof id === 'string' && /^[a-z0-9]{15}$/.test(id);
}

async function pbList(collection: string, opts: { sort?: string; filter?: string } = {}): Promise<any[]> {
  try {
    return await pb.collection(collection).getFullList({ requestKey: null, ...opts });
  } catch (err) {
    console.error(`[hrData] getFullList error in ${collection}:`, err);
    return [];
  }
}

async function pbCreate(collection: string, fields: any): Promise<any> {
  return pb.collection(collection).create(fields);
}

async function pbUpdate(collection: string, id: string, fields: any): Promise<any> {
  return pb.collection(collection).update(id, fields);
}

async function pbDelete(collection: string, id: string): Promise<void> {
  if (!looksLikeRealId(id)) return;
  await pb.collection(collection).delete(id);
}

// hr_delcargo_store (KV) helpers — still real server storage, just not a
// per-entity table. Always fetched fresh; never written to localStorage.
async function pbGetKV(key: string): Promise<any | null> {
  try {
    const rec = await pb.collection('hr_delcargo_store').getFirstListItem(`key = "${key}"`, { requestKey: null });
    return rec.value;
  } catch {
    return null;
  }
}

async function pbSetKV(key: string, value: any): Promise<void> {
  try {
    const existing = await pb.collection('hr_delcargo_store').getFirstListItem(`key = "${key}"`, { requestKey: null });
    await pb.collection('hr_delcargo_store').update(existing.id, { value });
  } catch {
    await pb.collection('hr_delcargo_store').create({ key, value });
  }
}

async function pbGetKVByPrefix(prefix: string): Promise<{ key: string; value: any; id: string }[]> {
  try {
    const records = await pb.collection('hr_delcargo_store').getFullList({
      filter: `key ~ "${prefix}"`,
      requestKey: null,
    });
    return records.map((r: any) => ({ key: r.key, value: r.value, id: r.id }));
  } catch (err) {
    console.error(`[hrData] KV prefix fetch error (${prefix}):`, err);
    return [];
  }
}

async function pbDeleteKVByKeys(keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      const rec = await pb.collection('hr_delcargo_store').getFirstListItem(`key = "${key}"`, { requestKey: null });
      await pb.collection('hr_delcargo_store').delete(rec.id);
    } catch {
      // already gone
    }
  }
}

// ---------------------------------------------------------------------------
// TYPES (app-shape, camelCase — same shapes pages already expect)
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  fullName: string;
  email: string;
  role: 'employee' | 'hr' | 'admin' | 'team_lead';
  joinedDate: string;
  onboardingCompleted: boolean;
  baseSalary: number;
  teams: string[];
  password?: string;
  isTeamLead?: boolean;
  leadTeams?: string[];
  isWarehouseLead?: boolean;
  managedWarehouses?: string[];
  jobTitle?: string;
  gender?: 'male' | 'female';
  bankName?: string;
  accountNumber?: string;
  iban?: string;
  profilePicture?: string;
  region?: 'USA' | 'Pakistan';
  assignedWarehouses?: string[];
  trackingEnabled?: boolean;
  salaryStartDate?: string;
  // Overlay-only fields, not real hr_profiles columns — see profile extras below.
  // Date the employee's system/portal account was created. Falls back to
  // joinedDate for employees onboarded before this field existed. PTO
  // accrual is keyed off this instead of joinedDate (see getPTOAccrualDate).
  accountCreationDate?: string;
  // When true, runAbsenceCheck completely skips this employee — used for
  // part-time employees, contractors, or anyone whose schedule means the
  // "no clock-in on a weekday" rule does not apply to them.
  exemptFromAbsenceCheck?: boolean;
  offboarded?: boolean;
  offboardDate?: string;
  offboardingStatus?: {
    itClearance: boolean;
    financeClearance: boolean;
    hrClearance: boolean;
    notes?: string;
    finalLeavePayout?: number;
    // Only meaningful when this employee had a companyPhone on file — the
    // company-allocated number must be handed back before offboarding
    // completes (see confirmOffboard in UserProfileModal.tsx, which blocks
    // submission on this when applicable).
    companyNumberReturned?: boolean;
  };
  lastIncrementProcessedYear?: number;
  cvFileName?: string;
  cvFileData?: string;
  identityDocs?: { name: string; data: string }[];
  passportFileName?: string;
  passportFileData?: string;
  // Set by HR/Admin only (see UserProfileModal). Team members / team leads
  // only ever see this in place of the real name — see displayName() below.
  // HR/Admin always see the real name, with the alias shown alongside it.
  alias?: string;
  // Onboarding approval gate. Undefined/'pending' while the employee's
  // self-service onboarding stepper has been submitted but not yet reviewed
  // — the dashboard shows a "waiting for review" screen instead of the real
  // app. Only flips to 'approved' via HR/Admin action, which is what
  // actually unlocks the dashboard (separate from onboardingCompleted,
  // which just means "the stepper was submitted").
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approvalReviewedBy?: string;
  approvalReviewedAt?: string;
  approvalRejectionReason?: string;
  // Contact numbers — overlay-only (no hr_profiles columns), self-service
  // edited from the employee's own Profile page (see employee/profile/page.tsx),
  // same pattern as bank details. personalPhone is the employee's own number;
  // companyPhone is only set if the company has issued them a separate
  // work/SIM number (optional).
  personalPhone?: string;
  companyPhone?: string;
}

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

export interface Warehouse { id: string; name: string; latitude: number; longitude: number; radius: number; }

export interface Announcement {
  id: string; title: string; content: string; timestamp: string; createdBy: string;
  target: 'all' | 'usa' | 'pakistan' | string[];
  // Backed by hr_announcements' pre-existing `pinned` column — that field
  // already existed in the schema but was always written as `false` and
  // never read back anywhere (see addAnnouncement below), so repurposing it
  // as "important" needed no migration. An important announcement is the
  // one kind that gets a blocking popup (see AnnouncementPopup.tsx) instead
  // of just sitting quietly in the passive "Recent Announcements" feed.
  important: boolean;
}

// Shared "does this announcement apply to this person" check — the exact
// targeting rule employee/page.tsx's dashboard feed widget already used
// inline (region === 'usa'/'pakistan', or a specific warehouse-id list).
// Centralized here so AnnouncementPopup.tsx's blocking popup can never
// silently disagree with the feed widget about who an announcement is
// actually for.
export function isAnnouncementForProfile(ann: Announcement, profile: Profile | null | undefined): boolean {
  if (!profile) return false;
  if (ann.target === 'all') return true;
  if (profile.region === 'USA' && ann.target === 'usa') return true;
  if (profile.region === 'Pakistan' && ann.target === 'pakistan') return true;
  if (Array.isArray(ann.target) && profile.assignedWarehouses) {
    return ann.target.some(wId => profile.assignedWarehouses?.includes(wId));
  }
  return false;
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
export interface MaintenanceNotice {
  id: string;
  title: string;
  message: string;
  startAt: string; // ISO UTC instant
  endAt: string; // ISO UTC instant
  createdBy: string;
  createdAt: string; // ISO UTC — "posted" info only, not the maintenance window itself
}
const MAINTENANCE_NOTICES_KEY = 'hr_maintenance_notices_v1';
const MAINTENANCE_NOTICE_READS_KEY = 'hr_maintenance_notice_reads_v1';
type MaintenanceNoticeReadMap = Record<string, string[]>;

export interface LeaveApplication {
  id: string; employeeName: string; type: 'PTO' | 'Sick Leave' | 'Urgent' | 'Parental Leave';
  duration: string; reason: string; status: 'pending' | 'hr_approved' | 'approved' | 'rejected';
}

export interface Task {
  id: string; title: string; description: string; assignedTo: string; assignedEmail: string;
  team: string; dueDate: string; priority: 'low' | 'medium' | 'high'; status: 'todo' | 'in_progress' | 'done';
  createdBy: string;
}

// hr_timesheets: no in_progress/completed status in the real schema (fixed
// enum pending|approved|rejected instead). We represent "open shift" as
// clockOut being empty, and keep `approvalStatus` as a separate HR workflow
// flag layered on top — see SCHEMA_REFERENCE.md.
export interface TimesheetEntry {
  id: string; employeeEmail: string; date: string; clockIn: string; clockOut?: string;
  duration?: string; status: 'in_progress' | 'completed'; approvalStatus: 'pending' | 'approved' | 'rejected';
}

export interface PayrollRecord {
  id: string; employeeId: string; name: string; role: string; region?: 'USA' | 'Pakistan';
  baseSalary: number; unpaidLeaves: number; bonus: number; deductions: number; processed: boolean;
  incrementAmount: number;
}

// A single day an employee was auto-marked absent, with a specific reason —
// stored in hr_delcargo_store (no dedicated collection; see
// hr_absence_records_v1 in runAbsenceCheck) since it's app-internal
// bookkeeping, not a PocketBase-native concept. Persisted (rather than
// recomputed live like countAbsentWeekdays) because: (1) the "Absent
// Details" pages need real reasons to display, not just a count, and (2)
// the deduction it causes is applied exactly once, at detection time, not
// re-derived on every payroll page load.
export interface AbsenceRecord {
  id: string; // `${employeeEmail}_${date}` — naturally unique per employee per day
  employeeEmail: string;
  employeeName: string;
  date: string; // "YYYY-MM-DD", America/New_York calendar day
  reason: 'no_clock_in' | 'inactivity';
  inactivityMinutes?: number; // only set when reason === 'inactivity'
  deductionAmount: number;
  createdAt: string; // ISO instant this record was created
  acknowledged: boolean; // employee has seen/dismissed the explanatory popup
}

export interface TrackingSettings {
  employeeEmail: string; enabled: boolean; intervalMinutes: number; excludeFromAutoDelete: boolean; agentToken: string;
}

export interface TrackerHeartbeat {
  employeeEmail: string; deviceId: string; deviceLabel?: string; connectedAt: string; lastSeenAt: string;
  /** Written by the desktop agent since v6 — used by the web portal to detect outdated builds. */
  agentVersion?: string;
}
export const TRACKER_HEARTBEAT_STALE_MS = 3 * 60 * 1000;

// A short-lived "this browser tab is actively viewing an in-progress manual
// shift" heartbeat (Employee dashboard, non-USA/manual Start-Shift flow
// only — USA employees are governed by GPS geofencing instead, which has
// its own foreground/background lifecycle). Refreshed every ~20s while a
// manual shift is active. Lets the app tell a genuinely still-running
// shift apart from "the tab was closed N days/weeks ago and the shift just
// never got told to stop" — see closeStaleManualShiftIfAbandoned below, the
// safety net for when the pagehide-based immediate stop (best-effort —
// unload-style handlers never fire on a crash, force-quit, or killed
// process) never got the chance to run.
export interface ShiftTabHeartbeat { employeeEmail: string; lastSeenAt: string; }
// Was 2 minutes — too tight. On the native mobile app, simply locking the
// phone or switching apps for a couple of minutes (extremely normal during
// a shift) let this go stale, which closeStaleManualShiftIfAbandoned then
// read as "the app was closed" and auto-ended the shift — reported by
// employees as being randomly logged out / shift-ended mid-shift with a
// "closed the app" push notification, even though they hadn't closed
// anything. 15 minutes gives real backgrounding room to breathe while still
// catching a genuinely abandoned/crashed session within a reasonable
// window. See also the pagehide-handler native/web split below, the other
// half of this same fix.
export const SHIFT_TAB_HEARTBEAT_STALE_MS = 15 * 60 * 1000;
const shiftTabHeartbeatKeyFor = (email: string) => `shift_tab_heartbeat_${(email || '').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

// One-shot "your shift was just auto-ended by the desktop tracker" signal
// (see notify_shift_auto_stopped in tracker-agent/agent_gui.py, written
// right after quitting the app auto-clocks someone out). The Employee
// dashboard polls for this so it can pop up an explanation immediately if
// it's open in a browser somewhere, on top of (not instead of) the existing
// shift_auto_stopped_<email> localStorage flag that already covers the
// "wasn't looking at the dashboard right now" case at next login.
export interface ShiftStopSignal {
  // 'inactivity_absence' — written by handle_inactivity_auto_absence() in
  // tracker-agent/agent_gui.py the instant 35+ continuous idle minutes are
  // detected during a shift (see AUTO_ABSENT_INACTIVITY_SECONDS there) —
  // the agent has already ended the shift and created a real AbsenceRecord
  // by the time this signal lands; employee/page.tsx just needs to show the
  // right explanatory copy for this reason instead of the generic
  // "tracker closed" one.
  employeeEmail: string; timestamp: string; reason: 'tracker_closed' | 'inactivity_absence' | string;
}
const shiftStopSignalKeyFor = (email: string) => `shift_stop_signal_${(email || '').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

// ── 5-Signal Tracker Reliability System ─────────────────────────────────────
// All signals use hr_delcargo_store KV as the message bus. Key slug pattern
// matches heartbeat_key_for() in tracker-agent/agent_gui.py (email lowercased,
// non-alphanumeric chars replaced with '_').
const _slugify = (email: string) => (email || '').toLowerCase().replace(/[^a-z0-9]/g, '_');

// Signal 2: Written by tracker agent (with retry) on deliberate quit.
// Portal checks this to distinguish deliberate quit (clock out immediately)
// from a server blip (wait TRACKER_HEARTBEAT_GRACE_MS before acting).
export interface TrackerQuitIntent {
  employeeEmail: string;
  timestamp: string; // ISO — portal ignores signals older than 15 min
}
const trackerQuitIntentKeyFor = (email: string) => `tracker_quit_intent_${_slugify(email)}`;

// Signal 3: Written by portal when employee clicks "Start Shift". The tracker
// agent reads this via realtime SSE on hr_delcargo_store and responds with Signal 4.
export interface TrackerPing {
  employeeEmail: string;
  requestId: string;   // random uuid — must match pong's requestId to be valid
  requestedAt: string; // ISO — agent ignores pings older than 30s
}
const trackerPingKeyFor = (email: string) => `tracker_ping_${_slugify(email)}`;

// Signal 4: Written by tracker agent in response to Signal 3.
// Portal polls for this with matching requestId, then proceeds with clock-in.
export interface TrackerPong {
  employeeEmail: string;
  requestId: string;   // echoed from the ping — portal validates this matches
  respondedAt: string; // ISO
}
const trackerPongKeyFor = (email: string) => `tracker_pong_${_slugify(email)}`;

// Signal 5: Written by portal when employee clicks "End Shift" (via clockOut).
// Tracker agent reads this via realtime SSE and immediately stops capturing.
// Agent deletes this key after acting on it.
export interface TrackerStopCommand {
  employeeEmail: string;
  commandId: string;  // random id — agent deletes key after acting on it
  issuedAt: string;   // ISO — agent ignores commands older than 60s
}
const trackerStopCmdKeyFor = (email: string) => `tracker_stop_cmd_${_slugify(email)}`;

// Grace period before auto-clock-out when heartbeat dies but no quit intent
// signal is present. Protects active shifts from transient server timeouts
// (screenshot uploads blocking heartbeat writes). After 15 min continuously
// dead with no quit signal, the shift is treated as a crash and ended.
export const TRACKER_HEARTBEAT_GRACE_MS = 15 * 60 * 1000;
// ────────────────────────────────────────────────────────────────────────────

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
export interface UserSessionSlot {
  deviceId: string; deviceLabel: string; sessionToken: string; loggedInAt: string; lastSeenAt: string;
}
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
export interface Screenshot { id: string; employeeEmail: string; timestamp: string; imageUrl: string; deviceLabel?: string; legacy?: boolean; }
interface ScreenshotRetentionState { warnedAt?: string; pendingDeleteIds?: string[]; }

// One contiguous stretch of mouse inactivity (no cursor movement) lasting at
// least 3 minutes, reported by the desktop tracker agent (see
// tracker-agent/agent_gui.py's _inactivity_loop). Only recorded while
// tracking is enabled AND the employee's shift is active — matches the same
// gating screenshots use, so this never counts idle time outside a shift.
export interface InactivityLog {
  id: string; employeeEmail: string; startAt: string; endAt: string; durationSeconds: number; deviceLabel?: string;
}

export interface Notification {
  id: string; recipientEmail: string; recipientRole: string; message: string; read: boolean; timestamp: string;
  // Raw PocketBase system field (auto-set on every record, never written by
  // this app directly) — added so the bell can show "Today"/"Yesterday"/a
  // real date next to the time. `timestamp` above is a *display-only*
  // time-of-day string (e.g. "3:02 AM") written once at creation with no
  // date component at all (see addNotification below) — there was never a
  // way to recover the date from it, which is exactly why old notifications
  // only ever showed a time with no day context. `created` always has the
  // full date+time regardless, so it's the one to use for that.
  created?: string;
  // Where clicking this notification should navigate to (a role-correct
  // in-app path, e.g. "/hr/tickets?ticketId=abc123") — set by addNotification
  // for categories that point at a specific record (ticket, leave, chat
  // mention). Absent for generic/'internal' notifications with nothing to
  // deep-link to, and for anything created before this field existed.
  link?: string;
}
type NotificationReadMap = Record<string, string[]>;
type NotificationClearedMap = Record<string, string[]>;
// Same shape/pattern as NotificationReadMap (announcement id -> emails who've
// seen it) — kept as its own KV key since hr_announcements is a separate
// collection from hr_notifications, not a broadcast-notification row.
type AnnouncementReadMap = Record<string, string[]>;
// The 4 notification categories an employee can actually toggle on/off in
// their Settings (see NotificationPreferencesCard.tsx) — 'internal' is a
// 5th, non-configurable bucket for lower-signal ops notifications that
// only ever show in the in-app bell (see the comment on addNotification).
// 'maintenance' (System Maintenance Notices — see MaintenanceNotice below)
// is deliberately NOT included in NotificationPrefs/DEFAULT_NOTIFICATION_PREFS
// below — unlike the other 5 configurable categories, an employee should not
// be able to opt out of "the whole system is about to go down," so there's
// no toggle for it in Settings and no per-user preference to check.
// IMPORTANT CAVEAT (2026-08-04): this only means the client-side notification
// preferences UI/model don't offer an opt-out — whether a 'maintenance'
// notification actually fires a real OneSignal push still depends on
// pb_hooks/push_notifications.pb.js on the droplet recognizing 'maintenance'
// as one of its pushable categories server-side. That file isn't present in
// this repo checkout/session, so it could not be updated as part of this
// feature — see PROJECT_HISTORY.md for the exact server-side change needed.
export type NotificationCategory = 'announcement' | 'ticket' | 'chat_mention' | 'leave_task' | 'shift' | 'maintenance' | 'internal';
export type NotificationPrefs = Record<Exclude<NotificationCategory, 'internal' | 'maintenance'>, boolean>;
const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { announcement: true, ticket: true, chat_mention: true, leave_task: true, shift: true };

// Builds the role-correct in-app path for a notification's `link` field.
// team_lead shares the employee route tree everywhere (see
// (dashboard)/layout.tsx — "there is no /team_lead route"), so it maps to
// the same /employee/* paths as 'employee'.
function roleBasePath(role: string): string {
  if (role === 'hr') return '/hr';
  if (role === 'admin') return '/admin';
  return '/employee'; // employee, team_lead, or anything else
}
export function buildNotificationLink(role: string, kind: 'ticket' | 'leave' | 'chat' | 'task', id: string): string {
  const base = roleBasePath(role);
  if (kind === 'ticket') return `${base}/tickets?ticketId=${id}`;
  if (kind === 'leave') return `${base}/leaves?leaveId=${id}`;
  if (kind === 'task') return `${base}/tasks?taskId=${id}`; // Tasks list doesn't deep-select by id yet — still lands on the right screen.
  // Team Chat route differs per role even though the base doesn't follow
  // the simple /leaves, /tickets pattern.
  const chatPath = role === 'hr' || role === 'admin' ? `${base}/team-chats` : `${base}/chat`;
  return `${chatPath}?teamId=${id}`;
}

// Read receipts for regular Team Chat messages — same shape again (message
// id -> emails who've viewed it). Kept as its own KV key/blob rather than
// reusing hr_announcement_reads_v1 since messages are a much higher-volume,
// ever-growing collection; if this ever becomes large enough to matter,
// pruning entries for messages older than some retention window (mirroring
// hrActions.checkScreenshotRetention's pattern) would be the next step —
// not needed yet at this app's scale.
type MessageReadMap = Record<string, string[]>;

export interface CareerPosition {
  id: string; title: string; department: string; location: string; description: string; requirements: string[];
}
export type CareerApplicationStatus = 'pending' | 'reviewed' | 'shortlisted' | 'rejected' | 'hired';
export interface CareerApplication {
  id: string; positionId: string; positionTitle: string; applicantName: string; applicantEmail: string;
  coverLetter: string; submittedAt: string; status: CareerApplicationStatus;
}

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
export interface TicketReply {
  id: string; senderName: string; senderRole: 'employee' | 'hr' | 'admin' | 'team_lead'; message: string; timestamp: string;
  attachmentName?: string; attachmentUrl?: string; attachmentSize?: number; senderEmail?: string;
}
export interface Ticket {
  id: string; employeeName: string; employeeEmail: string; title: string; description: string;
  department: 'hr' | 'technical';
  status: 'open' | 'closed'; createdAt: string; replies: TicketReply[];
}

// "Live" presence for a support ticket — lets the employee see when HR
// currently has their ticket open, same idea as TrackerHeartbeat above but
// per-ticket instead of per-employee. HR's TicketsView heartbeats this
// (see touchTicketPresence) while a ticket is selected; the employee's
// TicketsView polls getAllTicketPresences and shows a "Live" badge for any
// ticket whose presence hasn't gone stale. KV-backed like everything else
// here — no real websocket/SSE presence channel in this app.
export interface TicketPresence {
  ticketId: string; email: string; role: string; lastSeenAt: string;
}
export const TICKET_PRESENCE_STALE_MS = 20 * 1000;
const ticketPresenceKeyFor = (ticketId: string) => `hr_ticket_presence_${ticketId}`;

// Durable "the employee has read this ticket as of this time" marker — unlike
// TicketPresence above (which only lasts ~20s and answers "is HR looking at
// this right now"), this never expires, so HR/Admin can tell whether a reply
// they sent has actually been read, same "Seen" convention as most chat
// apps. Written by the employee/team-lead's own TicketsView whenever they
// have a ticket selected (touched on an interval so it also advances if a
// new reply arrives while they're already looking at it), read by HR/Admin's
// TicketsView for whichever ticket is currently selected.
export interface TicketSeenState {
  ticketId: string; employeeSeenAt: string;
}
const ticketSeenKeyFor = (ticketId: string) => `hr_ticket_seen_${ticketId}`;

// "X is typing…" indicator — same KV-heartbeat idea as TicketPresence above,
// just keyed per (scope, id, senderEmail) instead of one row per ticket, since
// multiple people can be typing in the same team chat/ticket at once and we
// want to show all of them, not just the last one. Very short staleness
// window (a few seconds) since a typing indicator that lingers after someone
// actually stops typing reads as a bug, not a feature. Shared by both Team
// Chat (scope 'chat', id = teamId) and Tickets (scope 'ticket', id =
// ticketId) — see touchTypingState/clearTypingState/getTypingUsers below.
export interface TypingState {
  scope: 'chat' | 'ticket'; scopeId: string; email: string; displayName: string; lastTypedAt: string;
}
export const TYPING_STALE_MS = 5 * 1000;
const typingKeyFor = (scope: 'chat' | 'ticket', scopeId: string, email: string) =>
  `hr_typing_${scope}_${scopeId}_${email.toLowerCase()}`;
const typingPrefixFor = (scope: 'chat' | 'ticket', scopeId: string) => `hr_typing_${scope}_${scopeId}_`;

// Real hr_teams row — adopted structure (lead + members + warehouse).
export interface Team {
  id: string; name: string; leadEmail?: string; members: string[]; warehouseId?: string;
}

// Team Chat — one channel per hr_teams row, no DMs. senderName is a
// real-name snapshot (see create_messages_collection.py) used only by the
// Admin oversight view; everywhere else, resolve senderEmail through
// displayName(profile, viewerRole) so an Alias change also applies
// retroactively to old messages.
export interface Message {
  id: string; teamId: string; senderEmail: string; senderName: string;
  text?: string; attachmentUrl?: string; attachmentName?: string; attachmentSize?: number;
  isAnnouncement?: boolean; timestamp: string;
}

// Team Documents — per-team onboarding/instructional file library shown
// alongside Team Chat (see create_team_documents_collection.py). Upload is
// UI-restricted to Admin/HR/Team Lead; every team member (including ones
// added later) can view. uploadedByName/Role are snapshots for fallback
// display only — the UI resolves the live profile first, same pattern as
// Message.senderName.
export interface TeamDocument {
  id: string; teamId: string; title: string; description?: string;
  fileUrl: string; fileName: string; fileSize?: number;
  uploadedByEmail: string; uploadedByName: string; uploadedByRole?: string;
  timestamp: string;
}

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
  if (p.email !== undefined) fields.email = p.email;
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
  'exemptFromAbsenceCheck',
];

function toWarehouse(w: any): Warehouse {
  return { id: w.id, name: w.name, latitude: Number(w.latitude), longitude: Number(w.longitude), radius: Number(w.radius) };
}
function toLeave(l: any): LeaveApplication {
  return { id: l.id, employeeName: l.employee_name, type: l.type, duration: l.duration, reason: l.reason, status: l.status };
}
function toNotification(n: any): Notification {
  return { id: n.id, recipientEmail: n.recipient_email, recipientRole: n.recipient_role, message: n.message, timestamp: n.timestamp, created: n.created, read: !!n.read, link: n.link || undefined };
}
function toTask(t: any): Task {
  return { id: t.id, title: t.title, description: t.description, assignedTo: t.assigned_to, assignedEmail: t.assigned_email, team: t.team, dueDate: t.due_date, priority: t.priority, status: t.status, createdBy: t.created_by };
}
function toAnnouncement(a: any): Announcement {
  return { id: a.id, title: a.title, content: a.content, timestamp: a.timestamp, createdBy: a.created_by, target: a.target || a.target_role || 'all', important: !!a.pinned };
}
function toCareer(c: any): CareerPosition {
  return { id: c.id, title: c.title, department: c.department, location: c.location, description: c.description, requirements: c.requirements || [] };
}
function toCareerApplication(a: any): CareerApplication {
  return {
    id: a.id, positionId: a.position_id, positionTitle: a.position_title, applicantName: a.applicant_name,
    applicantEmail: a.applicant_email, coverLetter: a.cover_letter, submittedAt: a.submitted_at,
    status: (a.status || 'pending') as CareerApplicationStatus,
  };
}
function toTicket(t: any): Ticket {
  return { id: t.id, employeeName: t.employee_name, employeeEmail: t.employee_email, title: t.subject, description: t.description, department: t.department || 'hr', status: t.status, createdAt: t.created, replies: t.replies || [] };
}
function toPayroll(p: any): PayrollRecord {
  return {
    id: p.id, employeeId: p.employee_id, name: p.employee_name, role: p.role, region: p.region,
    baseSalary: Number(p.base_salary) || 0, unpaidLeaves: Number(p.unpaid_leaves) || 0, bonus: Number(p.bonus) || 0,
    deductions: Number(p.deductions) || 0, incrementAmount: Number(p.increment_amount) || 0, processed: !!p.processed,
  };
}
function toTeam(t: any): Team {
  return { id: t.id, name: t.name, leadEmail: t.lead_email || undefined, members: t.members || [], warehouseId: t.warehouse_id || undefined };
}
function toMessage(m: any): Message {
  return {
    id: m.id,
    teamId: m.team_id,
    senderEmail: m.sender_email,
    senderName: m.sender_name,
    text: m.text || undefined,
    attachmentUrl: m.attachment ? pb.files.getURL(m, m.attachment) : undefined,
    attachmentName: m.attachment_name || undefined,
    attachmentSize: typeof m.attachment_size === 'number' ? m.attachment_size : undefined,
    isAnnouncement: !!m.is_announcement,
    timestamp: m.created,
  };
}
function toTeamDocument(d: any): TeamDocument {
  return {
    id: d.id,
    teamId: d.team_id,
    title: d.title,
    description: d.description || undefined,
    fileUrl: d.file ? pb.files.getURL(d, d.file) : '',
    fileName: d.file_name || d.file || 'file',
    fileSize: typeof d.file_size === 'number' ? d.file_size : undefined,
    uploadedByEmail: d.uploaded_by_email,
    uploadedByName: d.uploaded_by_name,
    uploadedByRole: d.uploaded_by_role || undefined,
    timestamp: d.created,
  };
}
function toTimesheet(t: any): TimesheetEntry {
  const clockOut = t.clock_out || undefined;
  return {
    id: t.id, employeeEmail: t.employee_id, date: t.date, clockIn: t.clock_in, clockOut,
    duration: t.duration || undefined,
    status: clockOut ? 'completed' : 'in_progress',
    approvalStatus: t.status || 'pending',
  };
}

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
export function useLeaves() {
  return useQuery({ queryKey: ['hr_leaves'], queryFn: async () => (await pbList('hr_leaves')).map(toLeave) });
}
export function useNotifications() {
  return useQuery({
    queryKey: ['hr_notifications'],
    queryFn: async () => (await pbList('hr_notifications', { sort: '-created' })).map(toNotification),
    // The bell lives in the persistent dashboard layout (TopNav), which
    // never remounts on client-side navigation — without polling it only
    // ever fetched once per session, so new notifications (e.g. a leave
    // request) silently never appeared until a hard page reload. The
    // realtime subscription in ToastNotification.tsx invalidates this query
    // immediately when a new row comes in; this interval is just a backstop
    // in case that subscription drops.
    refetchInterval: 15000,
  });
}
export function useWarehouses() {
  return useQuery({ queryKey: ['hr_warehouses'], queryFn: async () => (await pbList('hr_warehouses')).map(toWarehouse) });
}
export function useTasks() {
  return useQuery({ queryKey: ['hr_tasks'], queryFn: async () => (await pbList('hr_tasks', { sort: '-created' })).map(toTask) });
}
export function useAnnouncements() {
  return useQuery({
    queryKey: ['hr_announcements'],
    queryFn: async () => (await pbList('hr_announcements', { sort: '-created' })).map(toAnnouncement),
    // Same staleness issue as notifications — dashboard Overview pages only
    // fetched this once; poll so a newly-posted announcement shows up
    // without requiring a hard reload.
    refetchInterval: 30000,
  });
}
// Polls fairly quickly (15s, faster than useAnnouncements' 30s) — the whole
// point of a maintenance notice is that it should reach everyone with as
// little delay as possible once posted, including anyone already sitting
// on a dashboard page at the time.
export function useMaintenanceNotices() {
  return useQuery({
    queryKey: ['hr_maintenance_notices'],
    queryFn: () => hrActions.getMaintenanceNotices(),
    refetchInterval: 15000,
  });
}
export function useCareers() {
  return useQuery({ queryKey: ['hr_careers'], queryFn: async () => (await pbList('hr_careers')).map(toCareer) });
}
export function useCareerApplications() {
  return useQuery({ queryKey: ['hr_career_applications'], queryFn: async () => (await pbList('hr_career_applications', { sort: '-created' })).map(toCareerApplication) });
}
export function useTickets() {
  return useQuery({
    queryKey: ['hr_tickets'],
    queryFn: async () => (await pbList('hr_tickets', { sort: '-created' })).map(toTicket),
    // Was 15000ms — too slow for a screen someone is actively watching a
    // live conversation on (HR/employee could sit staring at an open ticket
    // for up to 15s after a reply lands before it appeared). Matches
    // useMessages()'s 4000ms chat cadence instead, same "polling instead of
    // SSE" tradeoff explained there (this app's web deploy proxies
    // PocketBase through a Next.js rewrite that doesn't reliably keep a
    // long-lived EventSource open, so pb.collection(...).subscribe() isn't
    // used here — see ToastNotification.tsx for the one place it IS used,
    // defensively, with a .catch() for exactly this reason).
    refetchInterval: 4000,
  });
}
export function usePayroll() {
  return useQuery({ queryKey: ['hr_payroll'], queryFn: async () => (await pbList('hr_payroll')).map(toPayroll) });
}
export function useTeams() {
  return useQuery({ queryKey: ['hr_teams'], queryFn: async () => (await pbList('hr_teams', { sort: 'name' })).map(toTeam) });
}
// Team Chat, one channel per team. Polling rather than a PocketBase
// realtime (SSE) subscription — this app's web deploy proxies PocketBase
// through a Next.js rewrite (see next.config.ts), and long-lived SSE
// connections through that kind of proxy aren't guaranteed to stay open on
// every host. Polling is the same "near-real-time" approach already used
// for hr_tickets above and is proven to work here. If you confirm SSE stays
// connected in your actual deployment, this can be upgraded to
// pb.collection('hr_messages').subscribe(...) for instant delivery.
export function useMessages(teamId: string | null | undefined, limit: number = 50) {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!teamId) return;
    let unsubscribed = false;

    // Real-time delta sync subscription via PocketBase WebSocket
    pb.collection('hr_messages')
      .subscribe('*', (e) => {
        if (unsubscribed) return;
        if (e.record && e.record.team_id === teamId) {
          queryClient.invalidateQueries({ queryKey: ['hr_messages', teamId] });
        }
      })
      .catch((err) => {
        console.warn('[hrData] PocketBase realtime subscription fallback to polling:', err);
      });

    return () => {
      unsubscribed = true;
      pb.collection('hr_messages').unsubscribe('*').catch(() => {});
    };
  }, [teamId, queryClient]);

  return useQuery({
    queryKey: ['hr_messages', teamId, limit],
    queryFn: async () => {
      if (!teamId) return [];
      const rows = await pb.collection('hr_messages').getList(1, limit, {
        filter: `team_id = "${teamId}"`,
        sort: '-created',
        requestKey: null,
      });
      // Reverse to return in chronological order
      return rows.items.map(toMessage).reverse();
    },
    enabled: !!teamId,
    refetchInterval: 8000,
    staleTime: 4000,
  });
}
// Every message across every team, unscoped — used only for the sidebar's
// unseen-activity dot (see computeMessageActivitySignature), which needs
// to know about new messages in channels the user isn't currently looking
// at. Polls less aggressively than useMessages since a dot lighting up a
// few seconds late is a non-issue.
export function useAllMessages() {
  return useQuery({
    queryKey: ['hr_messages_all'],
    queryFn: async () => (await pbList('hr_messages', { sort: '-created' })).map(toMessage),
    refetchInterval: 15000,
  });
}
// Team Documents — one library per team (see hr_team_documents /
// create_team_documents_collection.py). Polled like useMessages rather than
// realtime-subscribed, same proxy-through-Next.js reasoning.
export function useTeamDocuments(teamId: string | null | undefined) {
  return useQuery({
    queryKey: ['hr_team_documents', teamId],
    queryFn: async () => {
      if (!teamId) return [];
      const rows = await pbList('hr_team_documents', { filter: `team_id = "${teamId}"`, sort: '-created' });
      return rows.map(toTeamDocument);
    },
    enabled: !!teamId,
    refetchInterval: 15000,
  });
}
export function useTimesheets() {
  return useQuery({ queryKey: ['hr_timesheets'], queryFn: async () => (await pbList('hr_timesheets', { sort: '-created' })).map(toTimesheet) });
}

// Fetches every KV row whose key matches a prefix - used for tracking
// settings / heartbeats / screenshots, which don't have dedicated tables.
export function useKVByPrefix(prefix: string) {
  return useQuery({
    queryKey: ['hr_kv', prefix],
    queryFn: () => pbGetKVByPrefix(prefix),
    refetchInterval: 5000,
  });
}

// Convenience: call inside a component to get a function that invalidates
// (and thus refetches) one or more query keys after a mutation.
export function useInvalidate() {
  const qc = useQueryClient();
  return (keys: string[]) => keys.forEach(k => qc.invalidateQueries({ queryKey: [k] }));
}

// ---------------------------------------------------------------------------
// PURE BUSINESS LOGIC (unchanged formulas, ported from src/lib/db.ts)
// ---------------------------------------------------------------------------

export function parseLeaveDates(duration: string): { start: Date; end: Date } | null {
  try {
    const parts = duration.split(' - ');
    if (parts.length < 2) { const d = new Date(parts[0]); return { start: d, end: d }; }
    return { start: new Date(parts[0]), end: new Date(parts[1]) };
  } catch { return null; }
}

export function calculateTenure(joinedDate: string): { years: number; totalMonths: number } {
  const start = new Date(joinedDate);
  const today = new Date();
  let years = today.getFullYear() - start.getFullYear();
  let months = today.getMonth() - start.getMonth();
  if (months < 0 || (months === 0 && today.getDate() < start.getDate())) { years--; months += 12; }
  const totalMonths = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
  return { years: Math.max(0, years), totalMonths: Math.max(0, totalMonths) };
}

export function calculatePTOAccrued(joinedDate: string): number {
  const { totalMonths } = calculateTenure(joinedDate);
  let totalAccrued = 0;
  for (let m = 0; m < totalMonths; m++) {
    const yearOfService = Math.floor(m / 12) + 1;
    let monthlyRate = 0.83;
    if (yearOfService === 2) monthlyRate = 1.0;
    else if (yearOfService === 3) monthlyRate = 1.17;
    else if (yearOfService === 4) monthlyRate = 1.33;
    else if (yearOfService === 5) monthlyRate = 1.5;
    else if (yearOfService === 6) monthlyRate = 1.67;
    else if (yearOfService === 7) monthlyRate = 1.83;
    else if (yearOfService === 8) monthlyRate = 2.08;
    else if (yearOfService === 9) monthlyRate = 2.25;
    else if (yearOfService >= 10) monthlyRate = 2.5;
    totalAccrued += monthlyRate;
  }
  return Math.min(30, Math.round(totalAccrued * 100) / 100);
}

export function getApprovedLeaveDays(leaves: LeaveApplication[], fullName: string, types: Array<'PTO' | 'Sick Leave'>): number {
  return leaves
    .filter(l => l.employeeName === fullName && l.status === 'approved' && types.includes(l.type as any))
    .reduce((acc, l) => {
      const dates = parseLeaveDates(l.duration);
      if (!dates) return acc + 1;
      const diff = Math.abs(dates.end.getTime() - dates.start.getTime());
      return acc + Math.ceil(diff / (1000 * 3600 * 24)) + 1;
    }, 0);
}

export function getRemainingPTO(leaves: LeaveApplication[], fullName: string, joinedDate: string): number {
  const accrued = calculatePTOAccrued(joinedDate);
  const taken = getApprovedLeaveDays(leaves, fullName, ['PTO', 'Sick Leave']);
  return Math.max(0, Math.round((accrued - taken) * 100) / 100);
}

// Returns true if `dateStr` (a "YYYY-MM-DD" America/New_York calendar date,
// same shape as getNYDateString/localShiftDate produce) falls on a Monday
// through Friday. Parsed at UTC noon specifically so the weekday read back
// out can't be shifted by a day depending on the runtime's own local
// timezone — noon UTC is always still the same calendar day in
// America/New_York (which is never more than 5 hours behind UTC).
function isWeekday(dateStr: string): boolean {
  const day = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

// Approved leave covers a given date if the leave's parsed date range
// (parseLeaveDates) spans it — compared as NY calendar dates, not raw Date
// object equality, since parseLeaveDates' Date objects don't carry the
// fixed-timezone treatment the rest of the app's dates do.
function isApprovedLeaveOnDate(leaves: LeaveApplication[], fullName: string, dateStr: string): boolean {
  return leaves.some(l => {
    if (l.employeeName !== fullName || l.status !== 'approved') return false;
    const dates = parseLeaveDates(l.duration);
    if (!dates) return false;
    const startStr = getNYDateString(dates.start);
    const endStr = getNYDateString(dates.end);
    return dateStr >= startStr && dateStr <= endStr;
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
  const joinedStr = profile.joinedDate ? getNYDateString(new Date(profile.joinedDate)) : '';

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

// PTO accrual runs off the employee's account-creation date, not their
// joining date — the two can differ (e.g. account created before/after
// the actual start date). Falls back to joinedDate for anyone onboarded
// before accountCreationDate existed, so nothing changes for them.
export function getPTOAccrualDate(profile: Pick<Profile, 'joinedDate' | 'accountCreationDate'>): string {
  return profile.accountCreationDate || profile.joinedDate;
}

// Counts how many anniversary "events" (same month/day as salaryStartDate,
// one per year) have occurred on or before today, and have not yet been
// applied to base_salary. This intentionally catches up multiple missed
// years at once — e.g. a salaryStartDate set 4 years in the past with no
// prior processing history returns 4, not 0 or 1 — so setting a backdated
// salaryStartDate correctly backfills every increment that should already
// have happened, rather than only ever firing one at a time going forward.
//
// Event numbering: event #1 falls on the first anniversary (start year + 1),
// event #2 on start year + 2, etc. lastIncrementProcessedYear stores the
// calendar year of the last event actually applied, so "events processed" =
// lastIncrementProcessedYear - startYear (0 if never processed).
export function getMissedIncrementEvents(profile: Profile): number {
  const anniversarySource = profile.salaryStartDate || profile.joinedDate;
  if (!anniversarySource) return 0;
  const anniversaryDate = new Date(anniversarySource);
  if (isNaN(anniversaryDate.getTime())) return 0;
  const now = new Date();
  if (anniversaryDate > now) return 0;

  const startYear = anniversaryDate.getFullYear();
  let eventsElapsed = now.getFullYear() - startYear;
  const thisYearAnniversary = new Date(now.getFullYear(), anniversaryDate.getMonth(), anniversaryDate.getDate());
  if (thisYearAnniversary > now) eventsElapsed -= 1; // this year's anniversary hasn't happened yet
  if (eventsElapsed < 1) return 0;

  const eventsProcessed = profile.lastIncrementProcessedYear ? Math.max(0, profile.lastIncrementProcessedYear - startYear) : 0;
  return Math.max(0, eventsElapsed - eventsProcessed);
}

// Total pending increment amount, including any back-filled/missed years —
// flat per-event amount (region-dependent), non-compounding, multiplied by
// however many anniversary events haven't been processed yet.
export function getPendingIncrement(profile: Profile): number {
  const missedEvents = getMissedIncrementEvents(profile);
  if (missedEvents <= 0) return 0;
  const perEvent = profile.region === 'USA' ? 100 : 10000;
  return missedEvents * perEvent;
}

export interface IncrementEvent {
  /** Calendar year this anniversary event falls in. */
  year: number;
  amount: number;
  applied: boolean;
}

// Reconstructs a year-by-year increment timeline for display purposes
// (e.g. the Salary Ledger's Base Salary breakdown modal). IMPORTANT: the
// system only ever stores a single flat per-event amount and a
// "processed through" year — it does not keep a real historical ledger of
// exactly what was applied and when. So "original starting base salary" and
// each past year's amount are *reconstructed* by working backwards from
// the current base_salary using today's flat rate, which is only accurate
// if the per-event amount and region never changed and base_salary was
// never manually edited outside the increment system in between. Treat
// this as a best-effort breakdown, not an audited ledger.
export function getIncrementHistory(profile: Profile): { originalBaseSalary: number; events: IncrementEvent[] } {
  const anniversarySource = profile.salaryStartDate || profile.joinedDate;
  const perEvent = profile.region === 'USA' ? 100 : 10000;
  if (!anniversarySource) return { originalBaseSalary: profile.baseSalary, events: [] };
  const anniversaryDate = new Date(anniversarySource);
  if (isNaN(anniversaryDate.getTime())) return { originalBaseSalary: profile.baseSalary, events: [] };

  const now = new Date();
  const startYear = anniversaryDate.getFullYear();
  let eventsElapsedToToday = now.getFullYear() - startYear;
  const thisYearAnniversary = new Date(now.getFullYear(), anniversaryDate.getMonth(), anniversaryDate.getDate());
  if (thisYearAnniversary > now) eventsElapsedToToday -= 1;
  if (anniversaryDate > now) eventsElapsedToToday = 0;

  const eventsProcessed = profile.lastIncrementProcessedYear ? Math.max(0, profile.lastIncrementProcessedYear - startYear) : 0;
  const totalEvents = Math.max(eventsElapsedToToday, eventsProcessed);
  const originalBaseSalary = profile.baseSalary - eventsProcessed * perEvent;

  const events: IncrementEvent[] = [];
  for (let n = 1; n <= totalEvents; n++) {
    events.push({ year: startYear + n, amount: perEvent, applied: n <= eventsProcessed });
  }
  return { originalBaseSalary, events };
}

export function getFinalLeavePayout(profile: Profile, leaves: LeaveApplication[]): number {
  const remainingDays = getRemainingPTO(leaves, profile.fullName, getPTOAccrualDate(profile));
  const dailyRate = profile.baseSalary / WORKING_DAYS_PER_MONTH;
  return Math.round(remainingDays * dailyRate);
}

export const formatMoney = (amount: number, region?: 'USA' | 'Pakistan') =>
  region === 'USA' ? `$${amount.toLocaleString()}` : `PKR ${amount.toLocaleString()}`;

export function formatDurationBetween(startISO: string, endISO: string): string {
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

// A TimesheetEntry's `date` field is fixed to whatever calendar date it
// happened to be (in America/New_York — see clockIn() below) when the record
// was written — it's a plain "YYYY-MM-DD" string, not a real timestamp, so it
// never re-renders relative to whoever's actually looking at it. Per product
// decision, the whole app displays exactly one timezone (America/New_York)
// regardless of the employee's or viewer's own device/location — no
// per-device or IP-based timezone conversion anywhere (see
// src/lib/timezone.ts) — so any "Date" column shown in the UI should derive
// that date fresh from the real clockIn timestamp via that same fixed
// timezone, rather than trusting the stored field (which is fine on its own,
// this just guards against any old rows written before this was fixed).
// Falls back to the stored `date` if clockIn is ever missing/unparseable.
export function localShiftDate(clockInISO: string | undefined | null, fallbackDate?: string): string {
  if (clockInISO) {
    const d = new Date(clockInISO);
    if (!isNaN(d.getTime())) {
      return getNYDateString(d);
    }
  }
  return fallbackDate || '—';
}

// ---------------------------------------------------------------------------
// Ticket activity "seen" tracking (client-side only, per role+email) — used
// to light up a small dot on the Support Tickets nav item when there's a
// new ticket or reply the viewer hasn't looked at yet.
// ---------------------------------------------------------------------------

// A single number that changes whenever there's new activity relevant to
// this viewer: for HR/Admin that's every ticket + every reply on every
// ticket (they see all of it); for employees/team leads it's just replies
// from HR/Admin on their own tickets (their own messages don't count).
export function computeTicketActivitySignature(
  tickets: Ticket[],
  role: 'admin' | 'hr' | 'employee' | 'team_lead',
  email: string,
): number {
  if (role === 'admin' || role === 'hr') {
    return tickets.reduce((sum, t) => sum + 1 + t.replies.length, 0);
  }
  const mine = tickets.filter(t => t.employeeEmail.toLowerCase() === email.toLowerCase());
  return mine.reduce((sum, t) => sum + t.replies.filter(r => r.senderRole === 'hr' || r.senderRole === 'admin').length, 0);
}

function ticketSeenStorageKey(role: string, email: string): string {
  return `hr_tickets_seen_v1_${role}_${email.toLowerCase()}`;
}

export function hasUnseenTicketActivity(
  tickets: Ticket[],
  role: 'admin' | 'hr' | 'employee' | 'team_lead',
  email: string,
): boolean {
  if (typeof window === 'undefined' || !email) return false;
  const current = computeTicketActivitySignature(tickets, role, email);
  const stored = Number(window.localStorage.getItem(ticketSeenStorageKey(role, email)) || '0');
  return current > stored;
}

export function markTicketActivitySeen(
  tickets: Ticket[],
  role: 'admin' | 'hr' | 'employee' | 'team_lead',
  email: string,
): void {
  if (typeof window === 'undefined' || !email) return;
  const current = computeTicketActivitySignature(tickets, role, email);
  window.localStorage.setItem(ticketSeenStorageKey(role, email), String(current));
}

// ---------------------------------------------------------------------------
// Team Chat unseen-activity signature — same "count vs. last-seen count in
// localStorage" pattern as tickets above, used to light up a dot on the
// Team Chat nav item (every role, not just HR/Admin).
// ---------------------------------------------------------------------------

// `myTeamIds` is 'all' for Admin (auto-a-member of every channel) or the
// specific team ids a member/lead belongs to. Own messages never count —
// you already "saw" what you just sent.
export function computeMessageActivitySignature(
  messages: Message[],
  myTeamIds: string[] | 'all',
  email: string,
): number {
  const emailLower = email.toLowerCase();
  return messages.filter(m =>
    (myTeamIds === 'all' || myTeamIds.includes(m.teamId)) &&
    m.senderEmail.toLowerCase() !== emailLower
  ).length;
}

function chatSeenStorageKey(role: string, email: string): string {
  return `hr_chat_seen_v1_${role}_${email.toLowerCase()}`;
}

export function hasUnseenMessageActivity(
  messages: Message[],
  myTeamIds: string[] | 'all',
  role: string,
  email: string,
): boolean {
  if (typeof window === 'undefined' || !email) return false;
  const current = computeMessageActivitySignature(messages, myTeamIds, email);
  const stored = Number(window.localStorage.getItem(chatSeenStorageKey(role, email)) || '0');
  return current > stored;
}

export function markMessageActivitySeen(
  messages: Message[],
  myTeamIds: string[] | 'all',
  role: string,
  email: string,
): void {
  if (typeof window === 'undefined' || !email) return;
  const current = computeMessageActivitySignature(messages, myTeamIds, email);
  window.localStorage.setItem(chatSeenStorageKey(role, email), String(current));
}

// ---------------------------------------------------------------------------
// hrActions — every write in the app goes through here.
// ---------------------------------------------------------------------------

export const hrActions = {
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
      const allSettings = ((await pbGetKV('hr_tracking_settings_prod_v1')) as TrackingSettings[]) || [];
      const remaining = allSettings.filter(s => (s.employeeEmail || '').toLowerCase() !== lower);
      if (remaining.length !== allSettings.length) {
        await pbSetKV('hr_tracking_settings_prod_v1', remaining);
      }
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
        pbList('hr_payroll', { filter: `employee_id = "${id}"` })
          .then(rows => Promise.allSettled(rows.map((r: any) => pbDelete('hr_payroll', r.id)))),
        pbList('hr_timesheets', { filter: `employee_id = "${email.replace(/"/g, '\\"')}"` })
          .then(rows => Promise.allSettled(rows.map((r: any) => pbDelete('hr_timesheets', r.id)))),
        pbList('hr_tasks', { filter: `assigned_email = "${email.replace(/"/g, '\\"')}"` })
          .then(rows => Promise.allSettled(rows.map((r: any) => pbDelete('hr_tasks', r.id)))),
        pbList('hr_tickets', { filter: `employee_email = "${email.replace(/"/g, '\\"')}"` })
          .then(rows => Promise.allSettled(rows.map((r: any) => pbDelete('hr_tickets', r.id)))),
        pbList('hr_career_applications', { filter: `applicant_email = "${email.replace(/"/g, '\\"')}"` })
          .then(rows => Promise.allSettled(rows.map((r: any) => pbDelete('hr_career_applications', r.id)))),
        pbList('hr_notifications', { filter: `recipient_email = "${email.replace(/"/g, '\\"')}"` })
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
      pbList('hr_payroll', { filter: `employee_id = "${profile.id}"` }),
      email ? pbList('hr_timesheets', { filter: `employee_id = "${email.replace(/"/g, '\\"')}"` }) : Promise.resolve([]),
      email ? pbList('hr_tasks', { filter: `assigned_email = "${email.replace(/"/g, '\\"')}"` }) : Promise.resolve([]),
      email ? pbList('hr_tickets', { filter: `employee_email = "${email.replace(/"/g, '\\"')}"` }) : Promise.resolve([]),
      email ? pbList('hr_career_applications', { filter: `applicant_email = "${email.replace(/"/g, '\\"')}"` }) : Promise.resolve([]),
      email ? pbList('hr_notifications', { filter: `recipient_email = "${email.replace(/"/g, '\\"')}"` }) : Promise.resolve([]),
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

  // ── Leaves ────────────────────────────────────────────────────────────
  addLeave: (leave: Omit<LeaveApplication, 'id'>) =>
    pbCreate('hr_leaves', { employee_name: leave.employeeName, type: leave.type, duration: leave.duration, reason: leave.reason, status: leave.status || 'pending' }),
  updateLeaveStatus: (id: string, status: LeaveApplication['status']) =>
    pbUpdate('hr_leaves', id, { status }),

  // ── Notifications ─────────────────────────────────────────────────────
  // `category` drives real push notifications (not just the in-app bell):
  // a PocketBase server-side hook (see pb_hooks/push_notifications.pb.js)
  // watches every new hr_notifications row, and if it has one of the 4
  // pushable categories below AND the recipient hasn't turned that category
  // off in their notification settings, it sends a real OneSignal push.
  // Omitting `category` (or passing 'internal') means this notification
  // only ever shows in the in-app bell, never as a push — used for the
  // many lower-signal/internal-ops notifications (geofencing check-ins,
  // screenshot retention, new-employee-registered, etc.) that aren't one
  // of the categories employees can actually configure.
  // pushTitle/senderEmail are optional, push-only extras (never shown in the
  // in-app bell, which always just renders `message`) consumed by
  // push_notifications.pb.js on the droplet to build a WhatsApp-style
  // notification: pushTitle becomes the bold title (a ticket's subject, the
  // Team Chat sender's name, etc. — falls back to a generic per-category
  // title server-side if omitted) and senderEmail lets the hook look up
  // that person's profile_picture in hr_profiles to use as the Android
  // large icon/avatar. Neither field is required — omit senderEmail for
  // system-generated notifications that don't really have a "contact".
  // `link` is a role-correct in-app path (e.g. "/hr/tickets?ticketId=abc123")
  // that TopNav's bell dropdown navigates to when this notification is
  // clicked — see buildNotificationLink() below for how callers construct
  // one per recipient role. Requires a `link` (text) field on the
  // hr_notifications collection; if that field hasn't been added in the
  // PocketBase admin yet, PocketBase silently drops the extra key on write
  // (same as happened with category/push_title/sender_email before those
  // were added) and clicking just won't navigate anywhere — not a crash,
  // just a no-op until the field exists.
  addNotification: async (email: string, role: string, message: string, category?: NotificationCategory, pushTitle?: string, senderEmail?: string, link?: string): Promise<void> => {
    await pbCreate('hr_notifications', {
      recipient_email: email, recipient_role: role, message, read: false,
      category: category || 'internal',
      push_title: pushTitle || '',
      sender_email: senderEmail || '',
      link: link || '',
      timestamp: formatTimeNY(new Date()),
    });
  },
  getNotificationReadMap: (): Promise<NotificationReadMap> => pbGetKV('hr_notification_reads_prod_v1').then(v => v || {}),
  getNotificationClearedMap: (): Promise<NotificationClearedMap> => pbGetKV('hr_notification_cleared_prod_v1').then(v => v || {}),
  markNotificationsAsRead: async (notifications: Notification[], email: string, role: string): Promise<void> => {
    const emailLower = email.toLowerCase();
    const personal = notifications.filter(n => n.recipientEmail === email && !n.read);
    await Promise.all(personal.map(n => pbUpdate('hr_notifications', n.id, { read: true })));

    const broadcasts = notifications.filter(n => n.recipientRole === role && n.recipientEmail === 'all');
    if (broadcasts.length === 0) return;
    const readMap = ((await pbGetKV('hr_notification_reads_prod_v1')) as NotificationReadMap) || {};
    let changed = false;
    broadcasts.forEach(n => {
      const readers = readMap[n.id] || [];
      if (!readers.map(e => e.toLowerCase()).includes(emailLower)) { readMap[n.id] = [...readers, email]; changed = true; }
    });
    if (changed) await pbSetKV('hr_notification_reads_prod_v1', readMap);
  },
  isNotificationRead: (n: Notification, email: string, readMap: NotificationReadMap): boolean => {
    if (n.recipientEmail === email) return n.read;
    if (n.recipientEmail === 'all') return (readMap[n.id] || []).map(e => e.toLowerCase()).includes(email.toLowerCase());
    return n.read;
  },
  isNotificationCleared: (n: Notification, email: string, clearedMap: NotificationClearedMap): boolean =>
    (clearedMap[n.id] || []).map(e => e.toLowerCase()).includes(email.toLowerCase()),
  clearAllNotificationsFor: async (notifications: Notification[], email: string, role: string): Promise<void> => {
    await hrActions.markNotificationsAsRead(notifications, email, role);
    const visible = notifications.filter(n => n.recipientEmail.toLowerCase() === email.toLowerCase() || (n.recipientEmail === 'all' && n.recipientRole === role));
    if (visible.length === 0) return;
    const clearedMap = ((await pbGetKV('hr_notification_cleared_prod_v1')) as NotificationClearedMap) || {};
    const emailLower = email.toLowerCase();
    let changed = false;
    visible.forEach(n => {
      const clearers = clearedMap[n.id] || [];
      if (!clearers.map(e => e.toLowerCase()).includes(emailLower)) { clearedMap[n.id] = [...clearers, email]; changed = true; }
    });
    if (changed) await pbSetKV('hr_notification_cleared_prod_v1', clearedMap);
  },

  // ── Push notification preferences (hr_notification_prefs_v1) ───────────
  // Per-employee opt-in/out for each pushable category — read by the
  // PocketBase server-side hooks before sending a real OneSignal push (the
  // in-app bell notification always still gets created regardless; this
  // only controls whether a push is also sent for it). Missing categories
  // for a given email default to "on" (opt-out model), both here and in
  // the hook, so someone who's never opened Settings still gets pushes.
  getNotificationPrefs: async (email: string): Promise<NotificationPrefs> => {
    const all = ((await pbGetKV('hr_notification_prefs_v1')) as Record<string, Partial<NotificationPrefs>>) || {};
    return { ...DEFAULT_NOTIFICATION_PREFS, ...(all[email.toLowerCase()] || {}) };
  },
  updateNotificationPrefs: async (email: string, prefs: NotificationPrefs): Promise<void> => {
    const all = ((await pbGetKV('hr_notification_prefs_v1')) as Record<string, Partial<NotificationPrefs>>) || {};
    all[email.toLowerCase()] = prefs;
    await pbSetKV('hr_notification_prefs_v1', all);
  },

  // ── Warehouses ────────────────────────────────────────────────────────
  addWarehouse: (wh: Omit<Warehouse, 'id'>) => pbCreate('hr_warehouses', wh),
  updateWarehouse: (id: string, updates: Partial<Warehouse>) => pbUpdate('hr_warehouses', id, updates),
  deleteWarehouse: async (id: string, allProfiles: Profile[]): Promise<void> => {
    await pbDelete('hr_warehouses', id);
    await Promise.all(
      allProfiles
        .filter(p => p.assignedWarehouses?.includes(id))
        .map(p => pbUpdate('hr_profiles', p.id, { assigned_warehouses: (p.assignedWarehouses || []).filter(w => w !== id) }))
    );
  },

  // ── Announcements ─────────────────────────────────────────────────────
  // `important` writes into the pre-existing `pinned` column (see the
  // Announcement.important comment in the interface above) — no schema
  // migration needed, it just repurposes a column that already existed and
  // was always hardcoded to `false`.
  addAnnouncement: (title: string, content: string, target: Announcement['target'], createdBy: string, important: boolean = false) =>
    pbCreate('hr_announcements', {
      title, content, created_by: createdBy, target: typeof target === 'string' ? target : 'all',
      target_role: typeof target === 'string' ? target : 'all', author: createdBy, author_role: '', pinned: important,
      timestamp: formatTimeNY(new Date()) + ' ' + formatDateNY(new Date()),
    }),
  getAnnouncementReadMap: (): Promise<AnnouncementReadMap> => pbGetKV('hr_announcement_reads_v1').then(v => v || {}),
  isAnnouncementRead: (ann: Announcement, email: string, readMap: AnnouncementReadMap): boolean =>
    (readMap[ann.id] || []).map(e => e.toLowerCase()).includes(email.toLowerCase()),
  // Explicit "I acknowledge this" action for AnnouncementPopup's blocking
  // popup — as opposed to markAnnouncementsSeen below, which marks a whole
  // batch read merely because they were passively rendered in a feed. This
  // one only ever fires from the person's own button press, which is what
  // "make sure they've actually read it" requires for an `important`
  // announcement: it has to keep reappearing on every login/page refresh
  // until they explicitly press Mark as Read, not clear itself the moment
  // the popup happens to render. Shares the same hr_announcement_reads_v1
  // KV store as markAnnouncementsSeen/isAnnouncementRead, so marking one
  // read here also clears the passive feed's unread highlight, and vice
  // versa — one unified read-state, not two that could disagree.
  markAnnouncementRead: async (announcementId: string, email: string): Promise<void> => {
    if (!email) return;
    const readMap = ((await pbGetKV('hr_announcement_reads_v1')) as AnnouncementReadMap) || {};
    const emailLower = email.toLowerCase();
    const readers = readMap[announcementId] || [];
    if (!readers.map(e => e.toLowerCase()).includes(emailLower)) {
      readMap[announcementId] = [...readers, email];
      await pbSetKV('hr_announcement_reads_v1', readMap);
    }
  },
  // Called once the announcements a person can currently see have actually
  // been rendered on screen — writes read-state server-side for next visit,
  // but deliberately doesn't hand back the updated map, so the page that
  // just called this keeps showing the "unread" highlight for the remainder
  // of this visit instead of it vanishing the instant it renders (same
  // reasoning as the sidebar's unseen-ticket/chat dots: seen-on-arrival,
  // not seen-on-render).
  markAnnouncementsSeen: async (announcements: Announcement[], email: string): Promise<void> => {
    if (!email || announcements.length === 0) return;
    const emailLower = email.toLowerCase();
    const readMap = ((await pbGetKV('hr_announcement_reads_v1')) as AnnouncementReadMap) || {};
    let changed = false;
    announcements.forEach(ann => {
      const readers = readMap[ann.id] || [];
      if (!readers.map(e => e.toLowerCase()).includes(emailLower)) { readMap[ann.id] = [...readers, email]; changed = true; }
    });
    if (changed) await pbSetKV('hr_announcement_reads_v1', readMap);
  },
  // Both HR and Admin can post announcements (see admin/page.tsx and
  // hr/page.tsx's Post Announcement forms), and both already see the same
  // shared "Recent Announcements" feed regardless of who posted — so
  // deletion follows the same trust model: either role can delete any
  // announcement, not just ones they personally posted.
  deleteAnnouncement: (id: string) => pbDelete('hr_announcements', id),

  // ── System Maintenance Notices ──────────────────────────────────────────
  // See MaintenanceNotice above for why this is a separate system from
  // Announcement rather than an "important announcement" variant.
  getMaintenanceNotices: (): Promise<MaintenanceNotice[]> =>
    pbGetKV(MAINTENANCE_NOTICES_KEY).then(v => (Array.isArray(v) ? v : [])),

  // Creates the notice AND broadcasts a real hr_notifications row (category
  // 'maintenance') to all four roles so it shows in every dashboard's bell
  // immediately, not just the blocking popup — same "broadcast to role='X',
  // email='all'" pattern used elsewhere (e.g. shift-auto-ended-by-tracker
  // notifying 'all'/'hr'). team_lead needs its own separate call despite
  // sharing the employee dashboard, since recipient_role is matched by
  // exact string elsewhere (markNotificationsAsRead/getVisibleNotifications)
  // and 'employee' broadcasts never reach 'team_lead' accounts or vice versa.
  //
  // NOTE (2026-08-04): passing category: 'maintenance' here only makes the
  // in-app bell show it. Whether this actually fires a real OneSignal push
  // depends on pb_hooks/push_notifications.pb.js on the droplet recognizing
  // 'maintenance' as a pushable category — that file isn't present in this
  // repo checkout, so it couldn't be updated as part of this feature. See
  // PROJECT_HISTORY.md for the exact change still needed there.
  addMaintenanceNotice: async (
    title: string, message: string, startAtIso: string, endAtIso: string, createdBy: string
  ): Promise<void> => {
    const existing = await hrActions.getMaintenanceNotices();
    const notice: MaintenanceNotice = {
      id: `maint_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      title, message, startAt: startAtIso, endAt: endAtIso, createdBy,
      createdAt: new Date().toISOString(),
    };
    await pbSetKV(MAINTENANCE_NOTICES_KEY, [...existing, notice]);

    await Promise.all(
      (['employee', 'team_lead', 'hr', 'admin'] as const).map(role =>
        hrActions.addNotification('all', role, `${title}: ${message}`, 'maintenance', 'System Maintenance', createdBy)
      )
    );
  },

  deleteMaintenanceNotice: async (id: string): Promise<void> => {
    const existing = await hrActions.getMaintenanceNotices();
    await pbSetKV(MAINTENANCE_NOTICES_KEY, existing.filter(n => n.id !== id));
  },

  getMaintenanceNoticeReadMap: (): Promise<MaintenanceNoticeReadMap> =>
    pbGetKV(MAINTENANCE_NOTICE_READS_KEY).then(v => v || {}),

  isMaintenanceNoticeRead: (notice: MaintenanceNotice, email: string, readMap: MaintenanceNoticeReadMap): boolean =>
    (readMap[notice.id] || []).map(e => e.toLowerCase()).includes(email.toLowerCase()),

  markMaintenanceNoticeRead: async (noticeId: string, email: string): Promise<void> => {
    if (!email) return;
    const readMap = ((await pbGetKV(MAINTENANCE_NOTICE_READS_KEY)) as MaintenanceNoticeReadMap) || {};
    const emailLower = email.toLowerCase();
    const readers = readMap[noticeId] || [];
    if (!readers.map(e => e.toLowerCase()).includes(emailLower)) {
      readMap[noticeId] = [...readers, email];
      await pbSetKV(MAINTENANCE_NOTICE_READS_KEY, readMap);
    }
  },

  // Both HR and Admin can post/manage these (per explicit product decision),
  // same shared-trust model as deleteAnnouncement above.

  // ── Tasks ─────────────────────────────────────────────────────────────
  addTask: async (task: Omit<Task, 'id'>): Promise<void> => {
    const created = await pbCreate('hr_tasks', {
      title: task.title, description: task.description, assigned_to: task.assignedTo, assigned_email: task.assignedEmail,
      team: task.team, due_date: task.dueDate, priority: task.priority, status: task.status, created_by: task.createdBy,
    });
    await hrActions.addNotification(task.assignedEmail, 'employee', `New task assigned: "${task.title}" due ${task.dueDate}.`, 'leave_task', task.title, undefined, buildNotificationLink('employee', 'task', created.id));
  },
  updateTaskStatus: (id: string, status: Task['status']) => pbUpdate('hr_tasks', id, { status }),
  deleteTask: (id: string) => pbDelete('hr_tasks', id),

  // ── Careers ───────────────────────────────────────────────────────────
  addCareer: (position: Omit<CareerPosition, 'id'>) =>
    pbCreate('hr_careers', { title: position.title, department: position.department, location: position.location, type: '', description: position.description, requirements: position.requirements, status: 'open', created_by: '' }),
  deleteCareer: (id: string) => pbDelete('hr_careers', id),
  // Anti-spam guard: one submission per (position, email) pair. Returns true
  // if this email has already applied to this specific posting.
  hasAppliedForPosition: async (positionId: string, email: string): Promise<boolean> => {
    const safePos = positionId.replace(/"/g, '\\"');
    const safeEmail = email.trim().toLowerCase().replace(/"/g, '\\"');
    try {
      const matches = await pb.collection('hr_career_applications').getFullList({
        filter: `position_id = "${safePos}" && applicant_email = "${safeEmail}"`,
        requestKey: null,
      });
      return matches.length > 0;
    } catch (err) {
      console.error('[hrData] hasAppliedForPosition error:', err);
      return false;
    }
  },
  submitCareerApplication: (app: Omit<CareerApplication, 'id' | 'submittedAt' | 'status'>) =>
    pbCreate('hr_career_applications', {
      position_id: app.positionId, position_title: app.positionTitle, applicant_name: app.applicantName,
      applicant_email: app.applicantEmail.trim().toLowerCase(), phone: '', cover_letter: app.coverLetter, resume_url: '', status: 'pending',
      submitted_at: formatDateNY(new Date()) + ' ' + formatTimeNY(new Date()),
    }),
  updateApplicationStatus: (id: string, status: CareerApplicationStatus) =>
    pbUpdate('hr_career_applications', id, { status }),

  // ── Tickets ───────────────────────────────────────────────────────────
  // Returns the created Ticket (previously void) so callers can immediately
  // attach a file to it via addTicketReply — hr_tickets itself has no file
  // column, only `replies` does (see TicketReply comment above), so a
  // ticket-creation-time attachment has to be added as a follow-up reply
  // rather than a field on the ticket record itself.
  createTicket: async (ticket: { employeeName: string; employeeEmail: string; title: string; description: string; department: 'hr' | 'technical' }): Promise<Ticket> => {
    const created = await pbCreate('hr_tickets', {
      employee_email: ticket.employeeEmail, employee_name: ticket.employeeName, subject: ticket.title,
      description: ticket.description, department: ticket.department, status: 'open', priority: 'medium', category: 'general', assigned_to: '', resolution: '', replies: [],
    });
    // Admin also has a Tickets queue (admin/tickets) — this previously only
    // notified 'hr', same gap as leave requests.
    if (ticket.department === 'hr') {
      await hrActions.addNotification('all', 'hr', `New support ticket opened: "${ticket.title}" by ${ticket.employeeName}.`, 'ticket', ticket.title, ticket.employeeEmail, buildNotificationLink('hr', 'ticket', created.id));
    } else if (ticket.department === 'technical') {
      // Find all profiles on Technical Support / Internal Technical Support teams and notify them directly
      const profiles = await pbList('hr_profiles');
      const techEmails = profiles
        .filter((p: any) => isTechnicalSupportMember(p.teams))
        .map((p: any) => p.email)
        .filter(Boolean);
      for (const email of techEmails) {
        await hrActions.addNotification(email, 'employee', `New technical support ticket opened: "${ticket.title}" by ${ticket.employeeName}.`, 'ticket', ticket.title, ticket.employeeEmail, buildNotificationLink('employee', 'ticket', created.id));
      }
    }
    await hrActions.addNotification('all', 'admin', `New support ticket opened: "${ticket.title}" by ${ticket.employeeName}.`, 'ticket', ticket.title, ticket.employeeEmail, buildNotificationLink('admin', 'ticket', created.id));
    return toTicket(created);
  },
  addTicketReply: async (ticket: Ticket, reply: Omit<TicketReply, 'id' | 'timestamp'>): Promise<void> => {
    const newReply: TicketReply = { ...reply, id: `rep_${Date.now()}`, timestamp: new Date().toISOString() };
    await pbUpdate('hr_tickets', ticket.id, { replies: [...ticket.replies, newReply] });
    if (reply.senderRole === 'hr' || reply.senderRole === 'admin' || (ticket.department === 'technical' && reply.senderRole !== 'employee')) {
      const senderLabel = ticket.department === 'technical' ? 'Technical Support' : (reply.senderRole === 'hr' ? 'HR' : 'Admin');
      await hrActions.addNotification(ticket.employeeEmail, 'employee', `Support response received from ${senderLabel} regarding ticket "${ticket.title}".`, 'ticket', ticket.title, undefined, buildNotificationLink('employee', 'ticket', ticket.id));
    } else {
      if (ticket.department === 'hr') {
        await hrActions.addNotification('all', 'hr', `New support message from ${ticket.employeeName} on ticket "${ticket.title}".`, 'ticket', ticket.title, ticket.employeeEmail, buildNotificationLink('hr', 'ticket', ticket.id));
      } else if (ticket.department === 'technical') {
        const profiles = await pbList('hr_profiles');
        const techEmails = profiles
          .filter((p: any) => isTechnicalSupportMember(p.teams))
          .map((p: any) => p.email)
          .filter(Boolean);
        for (const email of techEmails) {
          await hrActions.addNotification(email, 'employee', `New support message from ${ticket.employeeName} on technical ticket "${ticket.title}".`, 'ticket', ticket.title, ticket.employeeEmail, buildNotificationLink('employee', 'ticket', ticket.id));
        }
      }
      await hrActions.addNotification('all', 'admin', `New support message from ${ticket.employeeName} on ticket "${ticket.title}".`, 'ticket', ticket.title, ticket.employeeEmail, buildNotificationLink('admin', 'ticket', ticket.id));
    }
  },
  updateTicketStatus: async (ticket: Ticket, status: 'open' | 'closed'): Promise<void> => {
    await pbUpdate('hr_tickets', ticket.id, { status });
    await hrActions.addNotification(ticket.employeeEmail, 'employee', `Support ticket "${ticket.title}" was marked as ${status}.`, 'ticket', ticket.title, undefined, buildNotificationLink('employee', 'ticket', ticket.id));
    if (ticket.department === 'hr') {
      await hrActions.addNotification('all', 'hr', `Support ticket "${ticket.title}" is now ${status}.`, 'ticket', ticket.title, undefined, buildNotificationLink('hr', 'ticket', ticket.id));
    } else if (ticket.department === 'technical') {
      const profiles = await pbList('hr_profiles');
      const techEmails = profiles
        .filter((p: any) => isTechnicalSupportMember(p.teams))
        .map((p: any) => p.email)
        .filter(Boolean);
      for (const email of techEmails) {
        await hrActions.addNotification(email, 'employee', `Technical ticket "${ticket.title}" is now ${status}.`, 'ticket', ticket.title, undefined, buildNotificationLink('employee', 'ticket', ticket.id));
      }
    }
    await hrActions.addNotification('all', 'admin', `Support ticket "${ticket.title}" is now ${status}.`, 'ticket', ticket.title, undefined, buildNotificationLink('admin', 'ticket', ticket.id));
    // Starts/clears the 15-day attachment-deletion timer (see
    // checkTicketAttachmentRetention below) — hr_tickets has no closedAt
    // column of its own, so this is tracked in the KV store the same way
    // tracking settings/heartbeats are. Re-opening clears the timer so a
    // ticket closed-then-reopened-then-closed-again gets a fresh 15 days
    // rather than deleting attachments early based on the first close.
    const closedAtMap = ((await pbGetKV('hr_ticket_closed_at_v1')) as Record<string, string>) || {};
    if (status === 'closed') closedAtMap[ticket.id] = new Date().toISOString();
    else delete closedAtMap[ticket.id];
    await pbSetKV('hr_ticket_closed_at_v1', closedAtMap);
  },
  // Best-effort, client-triggered (no server cron in this app — see
  // checkScreenshotRetention above for the same pattern) sweep that deletes
  // any file attachments left on a ticket's replies once the ticket has
  // been closed for 15+ days. Only strips the attachment fields —
  // messages/replies themselves stay intact, so the conversation history
  // remains readable, just without the (potentially sensitive) files.
  // Called from TicketsView.tsx whenever the Tickets page is open.
  checkTicketAttachmentRetention: async (): Promise<void> => {
    const TICKET_ATTACHMENT_RETENTION_MS = 15 * 24 * 60 * 60 * 1000;
    const closedAtMap = ((await pbGetKV('hr_ticket_closed_at_v1')) as Record<string, string>) || {};
    const dueIds = Object.keys(closedAtMap).filter(id => {
      const closedAt = new Date(closedAtMap[id]).getTime();
      return !isNaN(closedAt) && (Date.now() - closedAt) >= TICKET_ATTACHMENT_RETENTION_MS;
    });
    if (dueIds.length === 0) return;

    const tickets = (await pbList('hr_tickets', { filter: dueIds.map(id => `id = "${id}"`).join(' || ') })).map(toTicket);
    let mapChanged = false;
    for (const ticket of tickets) {
      const hasAttachments = ticket.replies.some(r => !!r.attachmentUrl);
      if (hasAttachments) {
        const scrubbedReplies = ticket.replies.map(r => {
          if (!r.attachmentUrl) return r;
          const { attachmentUrl, attachmentName, attachmentSize, ...rest } = r;
          return rest as TicketReply;
        });
        await pbUpdate('hr_tickets', ticket.id, { replies: scrubbedReplies });
      }
      // Whether or not there was anything to scrub (e.g. already cleaned up
      // by another tab), this ticket is done — stop tracking it.
      delete closedAtMap[ticket.id];
      mapChanged = true;
    }
    if (mapChanged) await pbSetKV('hr_ticket_closed_at_v1', closedAtMap);
  },

  // ── Ticket "live" presence (see TicketPresence above) ───────────────────
  touchTicketPresence: (ticketId: string, email: string, role: string): Promise<void> =>
    pbSetKV(ticketPresenceKeyFor(ticketId), { ticketId, email, role, lastSeenAt: new Date().toISOString() } as TicketPresence),
  clearTicketPresence: (ticketId: string): Promise<void> =>
    pbDeleteKVByKeys([ticketPresenceKeyFor(ticketId)]),
  getAllTicketPresences: async (): Promise<TicketPresence[]> =>
    (await pbGetKVByPrefix('hr_ticket_presence_')).map(row => row.value as TicketPresence),
  isTicketPresenceLive: (p: TicketPresence | null | undefined): boolean =>
    !!p?.lastSeenAt && (Date.now() - new Date(p.lastSeenAt).getTime()) < TICKET_PRESENCE_STALE_MS,

  // ── "X is typing…" indicator (see TypingState above) ────────────────────
  // Call on every keystroke in a composer (debounce on the caller's side —
  // TeamChatView/TicketsView call this at most once every ~1.5s while the
  // field is non-empty, not on every single keypress) while it's non-empty,
  // and call clearTypingState immediately on send/blur/empty so the
  // indicator disappears promptly rather than waiting out the stale window.
  touchTypingState: (scope: 'chat' | 'ticket', scopeId: string, email: string, displayName: string): Promise<void> =>
    pbSetKV(typingKeyFor(scope, scopeId, email), { scope, scopeId, email, displayName, lastTypedAt: new Date().toISOString() } as TypingState),
  clearTypingState: (scope: 'chat' | 'ticket', scopeId: string, email: string): Promise<void> =>
    pbDeleteKVByKeys([typingKeyFor(scope, scopeId, email)]),
  // Returns everyone currently (non-stale) typing in this scope, excluding
  // the viewer themself — that's the filtering the UI needs directly.
  getTypingUsers: async (scope: 'chat' | 'ticket', scopeId: string, excludeEmail: string): Promise<TypingState[]> => {
    const rows = (await pbGetKVByPrefix(typingPrefixFor(scope, scopeId))).map(row => row.value as TypingState);
    const now = Date.now();
    return rows.filter(r =>
      r.email.toLowerCase() !== excludeEmail.toLowerCase() &&
      !!r.lastTypedAt &&
      (now - new Date(r.lastTypedAt).getTime()) < TYPING_STALE_MS
    );
  },

  // ── Ticket "seen by employee" marker (see TicketSeenState above) ────────
  touchTicketSeenByEmployee: (ticketId: string): Promise<void> =>
    pbSetKV(ticketSeenKeyFor(ticketId), { ticketId, employeeSeenAt: new Date().toISOString() } as TicketSeenState),
  getTicketSeenState: (ticketId: string): Promise<TicketSeenState | null> =>
    pbGetKV(ticketSeenKeyFor(ticketId)),

  // ── Teams (real hr_teams: name + leadEmail + members + warehouseId) ────
  addTeam: (name: string, warehouseId?: string) => pbCreate('hr_teams', { name, lead_email: '', members: [], warehouse_id: warehouseId || '' }),
  deleteTeam: (id: string) => pbDelete('hr_teams', id),
  updateTeamMembers: (id: string, members: string[]) => pbUpdate('hr_teams', id, { members }),
  updateTeamLead: (id: string, leadEmail: string) => pbUpdate('hr_teams', id, { lead_email: leadEmail }),
  updateTeamWarehouse: (id: string, warehouseId: string) => pbUpdate('hr_teams', id, { warehouse_id: warehouseId }),

  // ── Team Chat (hr_messages — see migration_data/create_messages_collection.py) ──
  // One channel per team, no DMs. `file` is optional; when present it's
  // uploaded as a real PocketBase file on the `attachment` field (multipart
  // FormData), not base64-in-JSON, so large images/PDFs stay cheap to store
  // and serve. UI-only team-scoping for now — see the security note in the
  // migration script; every hr_ collection is currently publicly
  // readable/writable, same as the rest of this app pre-production.
  sendMessage: async (teamId: string, senderEmail: string, senderName: string, text: string, file?: File, isAnnouncement?: boolean): Promise<void> => {
    if (!text.trim() && !file) return;
    if (file) {
      const form = new FormData();
      form.append('team_id', teamId);
      form.append('sender_email', senderEmail);
      form.append('sender_name', senderName);
      form.append('text', text.trim());
      form.append('attachment', file);
      form.append('attachment_name', file.name);
      form.append('attachment_size', String(file.size));
      if (isAnnouncement) form.append('is_announcement', 'true');
      // Bypass Vercel proxy for large file uploads (same as uploadTeamDocument)
      const res = await fetch('https://pb.delcargo.us/api/collections/hr_messages/records', {
        method: 'POST',
        body: form,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
    } else {
      await pbCreate('hr_messages', {
        team_id: teamId, sender_email: senderEmail, sender_name: senderName, text: text.trim(),
        is_announcement: !!isAnnouncement,
      });
    }
  },

  // ── Team Chat read receipts (hr_message_reads_v1) ──────────────────────
  // Small, "announcement styled" read receipts for regular chat messages —
  // same read-tracking pattern as getAnnouncementReadMap/markAnnouncementsSeen
  // above, scoped to whichever messages are currently loaded (i.e. the
  // channel someone has open), not the whole message history at once.
  getMessageReadMap: (): Promise<MessageReadMap> => pbGetKV('hr_message_reads_v1').then(v => v || {}),
  isMessageRead: (msg: Message, email: string, readMap: MessageReadMap): boolean =>
    (readMap[msg.id] || []).map(e => e.toLowerCase()).includes(email.toLowerCase()),
  // Called whenever someone has a channel's messages on screen — marks every
  // currently-loaded message as seen by them (own messages included is
  // harmless; the UI never shows a viewer facepile that includes the sender
  // themselves). Deliberately doesn't return the updated map for the same
  // "seen-on-arrival, not seen-on-render" reasoning as markAnnouncementsSeen.
  markMessagesSeen: async (messages: Message[], email: string): Promise<void> => {
    if (!email || messages.length === 0) return;
    const emailLower = email.toLowerCase();
    const readMap = ((await pbGetKV('hr_message_reads_v1')) as MessageReadMap) || {};
    let changed = false;
    messages.forEach(m => {
      const readers = readMap[m.id] || [];
      if (!readers.map(e => e.toLowerCase()).includes(emailLower)) { readMap[m.id] = [...readers, email]; changed = true; }
    });
    if (changed) await pbSetKV('hr_message_reads_v1', readMap);
  },

  // ── Team Documents (hr_team_documents — see migration_data/create_team_documents_collection.py) ──
  // Per-team onboarding/instructional file library. Upload is UI-restricted
  // to Admin/HR/Team Lead (enforced in TeamDocumentsPanel.tsx, not the DB —
  // same open-rules posture as every other hr_ collection right now).
  uploadTeamDocument: async (
    teamId: string, title: string, description: string, file: File,
    uploaderEmail: string, uploaderName: string, uploaderRole: string
  ): Promise<void> => {
    const form = new FormData();
    form.append('team_id', teamId);
    form.append('title', title.trim());
    if (description.trim()) form.append('description', description.trim());
    form.append('file', file);
    form.append('file_name', file.name);
    form.append('file_size', String(file.size));
    form.append('uploaded_by_email', uploaderEmail);
    form.append('uploaded_by_name', uploaderName);
    form.append('uploaded_by_role', uploaderRole);
    // Bypass the Vercel proxy (/api/pb) for large file uploads to avoid Vercel's
    // strict 4.5MB Serverless Function payload limit, which would block videos.
    const res = await fetch('https://pb.delcargo.us/api/collections/hr_team_documents/records', {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Upload failed: ${res.status} ${errText}`);
    }
  },

  deleteTeamDocument: async (id: string): Promise<void> => {
    await pbDelete('hr_team_documents', id);
  },

  // ── Payroll ───────────────────────────────────────────────────────────
  // Computes the current payroll view for a set of employees (pure, no
  // writes) — mirrors old db.getPayroll()'s calculation. Callers decide
  // whether/when to persist via upsertPayrollRecord (e.g. only on "Process").
  //
  // `timesheets` is unused here now (kept for backward-compat with existing
  // callers) — `absenceRecords` is the real source of truth for no-call-
  // no-show / inactivity deductions. Deliberately NOT recomputed live from
  // timesheets+leaves the way urgent-leave deductions are: absence
  // detection needs a one-time historical scan (inactivity logs especially)
  // and needs to persist a specific reason for the Absent Details pages, so
  // runAbsenceCheck (below) creates a real AbsenceRecord once per absence,
  // and this function just sums up whichever records already exist for the
  // employee this month — recomputed fresh every render like everything
  // else here, just from a different, richer source than a live count.
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
        const existing = existingPayroll.find(p => p.employeeId === emp.id);
        const pendingIncrement = getPendingIncrement(emp);

        // 1. Calculate Base Salary for Current Month (Handling Mid-Month Joiners)
        let effectiveBaseSalary = emp.baseSalary;
        let isFirstMonthLateJoiner = false;

        if (emp.joinedDate) {
          const joinedDateObj = new Date(emp.joinedDate);
          const joinedMonthKey = getNYDateString(joinedDateObj).slice(0, 7);

          // Check if employee joined in this current month
          if (joinedMonthKey === targetMonthKey) {
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

        // 2. Urgent Leave Deductions
        const urgentDays = leaves
          .filter(l => l.employeeName === emp.fullName && l.type === 'Urgent' && l.status === 'approved')
          .reduce((acc, l) => {
            const dates = parseLeaveDates(l.duration);
            if (!dates) return acc + 1;
            const diff = Math.abs(dates.end.getTime() - dates.start.getTime());
            return acc + Math.ceil(diff / (1000 * 3600 * 24)) + 1;
          }, 0);
        const dailyRateForDeduction = emp.baseSalary / WORKING_DAYS_PER_MONTH;
        const urgentDeduction = Math.round(urgentDays * 2 * dailyRateForDeduction);
        const onboardingPenalty = emp.onboardingCompleted ? 0 : (emp.region === 'USA' ? 10 : 200);

        // 3. Absence Deductions
        const absenceDeduction = absenceRecords
          .filter(a => a.employeeEmail.toLowerCase() === emp.email.toLowerCase() && a.date.slice(0, 7) === targetMonthKey)
          .reduce((acc, a) => acc + a.deductionAmount, 0);

        // 4. Calculate Prior Month Unpaid Salary Arrears (Rollover)
        // If employee has unprocessed payroll from previous months (e.g. joined late in July and unpaid), carry over as Arrears
        const priorUnpaidArrears = existingPayroll
          .filter(p => p.employeeId === emp.id && !p.processed && p.id !== existing?.id)
          .reduce((acc, p) => acc + (p.baseSalary + p.bonus - p.deductions + p.incrementAmount), 0);

        // If employee joined late in the month (after day 5) and July hasn't been processed, the prorated salary carries into bonus/base
        const totalBaseWithArrears = effectiveBaseSalary + priorUnpaidArrears;

        if (existing) {
          return {
            ...existing,
            region: emp.region,
            baseSalary: existing.processed ? existing.baseSalary : totalBaseWithArrears,
            deductions: urgentDeduction + absenceDeduction + (emp.onboardingCompleted ? 0 : onboardingPenalty),
            incrementAmount: existing.processed ? existing.incrementAmount : pendingIncrement,
          };
        }

        return {
          id: '',
          employeeId: emp.id,
          name: emp.fullName,
          role: emp.jobTitle || 'Staff',
          region: emp.region,
          baseSalary: totalBaseWithArrears,
          unpaidLeaves: emp.onboardingCompleted ? 0 : 2,
          bonus: 0,
          deductions: urgentDeduction + absenceDeduction + onboardingPenalty,
          incrementAmount: pendingIncrement,
          processed: false,
        };
      });
  },
  upsertPayrollRecord: async (record: PayrollRecord): Promise<void> => {
    const fields = {
      employee_id: record.employeeId, employee_name: record.name, role: record.role, region: record.region || 'Pakistan',
      base_salary: record.baseSalary, unpaid_leaves: record.unpaidLeaves, bonus: record.bonus, deductions: record.deductions,
      net_pay: record.baseSalary + record.bonus - record.deductions + record.incrementAmount,
      increment_amount: record.incrementAmount, processed: record.processed,
      status: record.processed ? 'paid' : 'pending', paid_date: record.processed ? new Date().toISOString().split('T')[0] : '',
    };
    if (looksLikeRealId(record.id)) await pbUpdate('hr_payroll', record.id, fields);
    else await pbCreate('hr_payroll', fields);
  },

  // ── Tracking settings / heartbeats / screenshots (KV) ───────────────────
  getTrackingSettingsFor: async (email: string): Promise<TrackingSettings> => {
    const all = ((await pbGetKV('hr_tracking_settings_prod_v1')) as TrackingSettings[]) || [];
    return all.find(t => t.employeeEmail.toLowerCase() === email.toLowerCase())
      || { employeeEmail: email, enabled: false, intervalMinutes: 15, excludeFromAutoDelete: false, agentToken: '' };
  },
  updateTrackingSettings: async (email: string, updates: Partial<TrackingSettings>): Promise<TrackingSettings[]> => {
    const all = ((await pbGetKV('hr_tracking_settings_prod_v1')) as TrackingSettings[]) || [];
    const idx = all.findIndex(t => t.employeeEmail.toLowerCase() === email.toLowerCase());
    let updated: TrackingSettings[];
    if (idx >= 0) updated = all.map((t, i) => i === idx ? { ...t, ...updates } : t);
    else updated = [...all, { employeeEmail: email, enabled: false, intervalMinutes: 15, excludeFromAutoDelete: false, agentToken: `agt_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`, ...updates }];
    await pbSetKV('hr_tracking_settings_prod_v1', updated);
    return updated;
  },
  regenerateAgentToken: async (email: string): Promise<string> => {
    const token = `agt_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
    await hrActions.updateTrackingSettings(email, { agentToken: token });
    return token;
  },
  getTrackerHeartbeat: (email: string): Promise<TrackerHeartbeat | null> =>
    pbGetKV(`tracker_heartbeat_${email.toLowerCase().replace(/[^a-z0-9]/g, '_')}`),
  getAllTrackerHeartbeats: async (): Promise<TrackerHeartbeat[]> =>
    (await pbGetKVByPrefix('tracker_heartbeat_')).map(row => row.value as TrackerHeartbeat),
  // See ShiftStopSignal above — the tracker agent writes this the instant it
  // auto-clocks someone out from quitting. Never deleted server-side (the
  // agent just overwrites it on the next occurrence); the caller is
  // responsible for tracking which timestamp it's already shown a popup for
  // (see the localStorage check in employee/page.tsx) so the same signal
  // doesn't re-trigger the modal on every poll.
  getShiftStopSignal: (email: string): Promise<ShiftStopSignal | null> =>
    pbGetKV(shiftStopSignalKeyFor(email)),
  isHeartbeatLive: (hb: TrackerHeartbeat | null, intervalMinutes: number = 3): boolean => {
    if (!hb?.lastSeenAt) return false;
    // Extended from (interval+2) to (interval+10) minutes. The extra 8 min
    // buffer absorbs transient PocketBase timeouts (screenshot uploads blocking
    // heartbeat writes) so a slow server never falsely appears as "tracker gone".
    const toleranceMs = (Math.max(3, intervalMinutes) + 10) * 60 * 1000;
    return (Date.now() - new Date(hb.lastSeenAt).getTime()) < toleranceMs;
  },

  // ── 5-Signal System — new hrActions (Signals 2–5) ────────────────────────

  // Signal 2: Quit intent — written by tracker agent on deliberate quit.
  // Portal reads this to distinguish "deliberate quit" (clock out immediately)
  // from "server blip" (wait TRACKER_HEARTBEAT_GRACE_MS grace period).
  getTrackerQuitIntent: (email: string): Promise<TrackerQuitIntent | null> =>
    pbGetKV(trackerQuitIntentKeyFor(email)),
  clearTrackerQuitIntent: async (email: string): Promise<void> => {
    await pbDeleteKVByKeys([trackerQuitIntentKeyFor(email)]);
  },

  // Signal 3: Ping — portal writes this before allowing shift start.
  // Tracker agent reads via realtime SSE and responds with Signal 4 (pong).
  writeTrackerPing: async (email: string, requestId: string): Promise<void> => {
    await pbSetKV(trackerPingKeyFor(email), {
      employeeEmail: email,
      requestId,
      requestedAt: new Date().toISOString(),
    } as TrackerPing);
  },
  clearTrackerPing: async (email: string): Promise<void> => {
    await pbDeleteKVByKeys([trackerPingKeyFor(email)]);
  },

  // Signal 4: Pong — tracker agent writes this in response to a ping.
  // Portal polls for this with matching requestId (500ms interval, 8s timeout).
  getTrackerPong: (email: string): Promise<TrackerPong | null> =>
    pbGetKV(trackerPongKeyFor(email)),
  clearTrackerPong: async (email: string): Promise<void> => {
    await pbDeleteKVByKeys([trackerPongKeyFor(email)]);
  },

  // Signal 5: Stop command — portal writes this when shift ends (via clockOut).
  // Tracker agent reads via realtime SSE, stops capturing immediately, then
  // deletes this key. Also written by clockOut() directly — see below.
  writeTrackerStopCmd: async (email: string): Promise<void> => {
    await pbSetKV(trackerStopCmdKeyFor(email), {
      employeeEmail: email,
      commandId: Math.random().toString(36).slice(2) + Date.now().toString(36),
      issuedAt: new Date().toISOString(),
    } as TrackerStopCommand);
  },
  // ─────────────────────────────────────────────────────────────────────────

  // ── Manual-shift tab heartbeat + abandoned-tab safety net ───────────────
  touchShiftTabHeartbeat: async (email: string): Promise<void> => {
    try {
      await pbSetKV(shiftTabHeartbeatKeyFor(email), { employeeEmail: email, lastSeenAt: new Date().toISOString() } as ShiftTabHeartbeat);
    } catch { /* best-effort — a missed heartbeat just means one earlier stale-check window */ }
  },
  clearShiftTabHeartbeat: async (email: string): Promise<void> => {
    await pbDeleteKVByKeys([shiftTabHeartbeatKeyFor(email)]);
  },
  isShiftTabHeartbeatLive: (hb: ShiftTabHeartbeat | null): boolean =>
    !!hb?.lastSeenAt && (Date.now() - new Date(hb.lastSeenAt).getTime()) < SHIFT_TAB_HEARTBEAT_STALE_MS,

  // Fire-and-forget clock-out sent from a `pagehide` handler as the tab is
  // actually closing. A normal awaited hrActions.clockOut() call has no
  // guarantee of completing once the page starts tearing down, so this
  // uses fetch's `keepalive` option instead — the browser keeps the
  // request alive in the background past unload (the JSON body here is
  // tiny, well under keepalive's ~64KB cap). Best-effort only: this can't
  // run at all on a crash, force-quit, or killed process — exactly why
  // closeStaleManualShiftIfAbandoned exists as an independent second
  // safety net rather than relying on this alone.
  beaconClockOut: (shiftId: string, clockInISO: string): void => {
    try {
      const nowIso = new Date().toISOString();
      const url = `${pb.baseUrl}/api/collections/hr_timesheets/records/${shiftId}`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (pb.authStore.token) headers['Authorization'] = pb.authStore.token;
      fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ clock_out: nowIso, duration: formatDurationBetween(clockInISO, nowIso) }),
        keepalive: true,
      }).catch(() => { /* best-effort */ });
    } catch { /* best-effort */ }
  },

  // Safety net for a manually-started shift (non-USA employees only — USA
  // is governed by GPS geofencing) whose tab is just gone: closed
  // gracefully but the pagehide beacon above didn't get through in time,
  // or the tab/app crashed or was force-quit, neither of which gives any
  // handler a chance to run. Called once whenever the Employee dashboard
  // discovers an already-open shift for this profile. If nothing has kept
  // this shift's tab heartbeat warm recently AND the desktop tracker isn't
  // live either (so nothing else is actively watching this shift right
  // now), treats it as abandoned, clocks it out, and notifies the same way
  // performLogout does — including setting the same
  // shift_auto_stopped_<email> localStorage flag so the employee gets the
  // same "your shift was auto-ended" notice on next login.
  closeStaleManualShiftIfAbandoned: async (profile: Profile): Promise<boolean> => {
    if (profile.region === 'USA') return false;
    const open = await hrActions.getOpenShift(profile.email);
    if (!open) return false;
    const [tabHb, trackerHb] = await Promise.all([
      pbGetKV(shiftTabHeartbeatKeyFor(profile.email)) as Promise<ShiftTabHeartbeat | null>,
      hrActions.getTrackerHeartbeat(profile.email),
    ]);
    if (hrActions.isShiftTabHeartbeatLive(tabHb) || hrActions.isHeartbeatLive(trackerHb)) return false;
    await hrActions.clockOut(profile.email);
    await hrActions.clearShiftTabHeartbeat(profile.email);
    await hrActions.addNotification(profile.email, 'employee', 'Your shift was automatically ended because the app was closed.');
    // 'shift' category + pushTitle/senderEmail so this actually reaches
    // HR/Admin's phones (push_notifications.pb.js looks up profile.email's
    // profile_picture as the Android large icon) instead of only ever
    // showing up in the in-app bell, same treatment as the manual/GPS shift
    // notifications below.
    const shiftEndedName = displayName(profile, 'hr');
    await hrActions.addNotification('all', 'hr', `${shiftEndedName} closed the app while on shift — their shift was ended automatically.`, 'shift', shiftEndedName, profile.email);
    await hrActions.addNotification('all', 'admin', `${shiftEndedName} closed the app while on shift — their shift was ended automatically.`, 'shift', shiftEndedName, profile.email);
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(`shift_auto_stopped_${profile.email.toLowerCase()}`, '1'); } catch { /* ignore */ }
    }
    return true;
  },

  // ── Absence records (hr_delcargo_store key "hr_absence_records_v1") ────
  // See AbsenceRecord's own comment for why this lives in the generic KV
  // store rather than a dedicated collection, and why it's persisted rather
  // than purely recomputed like countAbsentWeekdays.
  getAbsenceRecords: async (): Promise<AbsenceRecord[]> => {
    try {
      const raw = await pbGetKV('hr_absence_records_v1');
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  },
  getDeletedAbsenceIds: async (): Promise<string[]> => {
    try {
      const raw = await pbGetKV('hr_absence_deleted_v1');
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  },
  deleteAbsenceRecord: async (recordId: string): Promise<void> => {
    const all = await hrActions.getAbsenceRecords();
    const next = all.filter(a => a.id !== recordId);
    await pbSetKV('hr_absence_records_v1', next);
    // Track deleted IDs so background runAbsenceCheck never re-marks them absent.
    // Store both the raw recordId AND the canonical email_date key (lowercase)
    // so the tombstone survives even if the email casing drifts between runs.
    const deletedIds = await hrActions.getDeletedAbsenceIds();
    const toAdd: string[] = [];
    if (!deletedIds.includes(recordId)) toAdd.push(recordId);
    const lower = recordId.toLowerCase();
    if (!deletedIds.includes(lower)) toAdd.push(lower);
    if (toAdd.length > 0) {
      await pbSetKV('hr_absence_deleted_v1', [...deletedIds, ...toAdd]);
    }
  },
  // Bulk removal — removes many records in one write per store rather than
  // N sequential reads/writes (avoids the race window where a parallel
  // runAbsenceCheck could re-create a record that was mid-deletion).
  bulkDeleteAbsenceRecords: async (recordIds: string[]): Promise<void> => {
    if (recordIds.length === 0) return;
    const idSet = new Set(recordIds.map(id => id.toLowerCase()));
    const all = await hrActions.getAbsenceRecords();
    const next = all.filter(a => !idSet.has(a.id.toLowerCase()));
    await pbSetKV('hr_absence_records_v1', next);
    const deletedIds = await hrActions.getDeletedAbsenceIds();
    const existing = new Set(deletedIds.map((d: string) => d.toLowerCase()));
    const toAdd: string[] = [];
    for (const id of recordIds) {
      if (!existing.has(id.toLowerCase())) toAdd.push(id.toLowerCase());
    }
    if (toAdd.length > 0) {
      await pbSetKV('hr_absence_deleted_v1', [...deletedIds, ...toAdd]);
    }
  },
  // Marks a record as seen so AbsentPopup stops showing it — called by the
  // employee dismissing the popup, never by HR/Admin (they can always see
  // every record on the Absent Details page regardless of acknowledgment).
  acknowledgeAbsence: async (recordId: string): Promise<void> => {
    const all = await hrActions.getAbsenceRecords();
    const next = all.map(a => a.id === recordId ? { ...a, acknowledged: true } : a);
    await pbSetKV('hr_absence_records_v1', next);
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
  runAbsenceCheck: async (employees: Profile[], timesheets: TimesheetEntry[], leaves: LeaveApplication[], inactivityLogs: InactivityLog[]): Promise<void> => {
    const INACTIVITY_THRESHOLD_SECONDS = 37 * 60;
    const pktTodayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
    const ABSENCE_ENFORCEMENT_START_DATE = '2026-08-04';
    const existingRecords = await hrActions.getAbsenceRecords();
    const deletedIds = await hrActions.getDeletedAbsenceIds();
    const ignoredIds = new Set([...existingRecords.map(r => r.id), ...deletedIds]);
    const newRecords: AbsenceRecord[] = [];

    for (const emp of employees) {
      if (emp.region !== 'Pakistan') continue;
      if (emp.role !== 'employee' && emp.role !== 'team_lead') continue;
      // Skip part-time employees or anyone explicitly marked exempt by HR/Admin
      if (emp.exemptFromAbsenceCheck) continue;

      const empTimesheets = timesheets.filter(t => t.employeeEmail && t.employeeEmail.toLowerCase() === emp.email.toLowerCase() && t.clockIn);
      const empInactivity = inactivityLogs.filter(l => l.employeeEmail && l.employeeEmail.toLowerCase() === emp.email.toLowerCase());
      
      let joinedStr = '';
      if (emp.joinedDate) {
        const jd = new Date(emp.joinedDate);
        if (!isNaN(jd.getTime())) joinedStr = jd.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
      }

      const shiftDatesWithShift = new Set<string>();
      const shiftDatesWithMaxSingleInactivity = new Map<string, number>();

      for (const t of empTimesheets) {
        if (!t.clockIn) continue;
        
        // IMPORTANT: Ignore t.date because it is stamped in New York time by the frontend.
        // We must rely purely on the absolute UTC clockIn timestamp converted to PKT.
        const d = new Date(t.clockIn);
        if (isNaN(d.getTime())) continue;
        const shiftDate = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
        shiftDatesWithShift.add(shiftDate);
        
        let maxSingleInactiveSecs = 0;
        if (t.clockOut) {
          const inTime = d.getTime();
          const outTime = new Date(t.clockOut).getTime();
          
          // Absence is only triggered if a SINGLE continuous inactivity run reaches 37+ mins (2220s),
          // not by summing up multiple smaller inactive periods across the shift.
          const logsForShift = empInactivity.filter(l => {
            const lt = new Date(l.startAt).getTime();
            return lt >= inTime && lt <= outTime;
          });
          for (const l of logsForShift) {
            const duration = l.durationSeconds || 0;
            if (duration > maxSingleInactiveSecs) {
              maxSingleInactiveSecs = duration;
            }
          }
        }
        
        const existingMax = shiftDatesWithMaxSingleInactivity.get(shiftDate) || 0;
        shiftDatesWithMaxSingleInactivity.set(shiftDate, Math.max(existingMax, maxSingleInactiveSecs));
      }

      const today = new Date();
      const lookbackStart = new Date(today);
      lookbackStart.setDate(today.getDate() - 35);
      for (const cursor = new Date(lookbackStart); cursor < today; cursor.setDate(cursor.getDate() + 1)) {
        const dateStr = cursor.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
        if (dateStr >= pktTodayStr) break;
        if (dateStr < ABSENCE_ENFORCEMENT_START_DATE) continue;
        if (joinedStr && dateStr < joinedStr) continue;
        if (!isWeekday(dateStr)) continue;
        const recordId = `${emp.email.toLowerCase()}_${dateStr}`;
        // Check both the canonical lowercase key AND the raw stored form to
        // prevent case-drift re-creation (the historic bug that caused deleted
        // records to keep coming back).
        if (ignoredIds.has(recordId) || ignoredIds.has(recordId.toLowerCase())) continue;

        const hadShift = shiftDatesWithShift.has(dateStr);
        const onLeave = isApprovedLeaveOnDate(leaves, emp.fullName, dateStr);

        let reason: AbsenceRecord['reason'] | null = null;
        let inactivityMinutes: number | undefined;
        if (!hadShift) {
          if (!onLeave) reason = 'no_clock_in';
        } else {
          const maxSingleInactiveSecs = shiftDatesWithMaxSingleInactivity.get(dateStr) || 0;
          if (maxSingleInactiveSecs >= INACTIVITY_THRESHOLD_SECONDS) {
            reason = 'inactivity';
            inactivityMinutes = Math.round(maxSingleInactiveSecs / 60);
          }
        }
        if (!reason) continue; // present and accounted for — nothing to record

        const dailyRate = emp.baseSalary / WORKING_DAYS_PER_MONTH;
        const deductionAmount = Math.round(2 * dailyRate);
        const name = displayName(emp, 'hr');

        newRecords.push({
          id: recordId, employeeEmail: emp.email, employeeName: emp.fullName, date: dateStr,
          reason, inactivityMinutes, deductionAmount, createdAt: new Date().toISOString(), acknowledged: false,
        });

        const reasonText = reason === 'inactivity'
          ? `was inactive for ${inactivityMinutes} minutes during their shift on ${dateStr}`
          : `did not start a shift on ${dateStr}`;
        await hrActions.addNotification('all', 'hr', `${name} ${reasonText} and was marked absent — ${formatMoney(deductionAmount, emp.region)} deducted (2 days' pay).`, 'leave_task', name, emp.email);
        await hrActions.addNotification('all', 'admin', `${name} ${reasonText} and was marked absent — ${formatMoney(deductionAmount, emp.region)} deducted (2 days' pay).`, 'leave_task', name, emp.email);
        await hrActions.addNotification(emp.email, 'employee', `You were marked absent for ${dateStr} (${reason === 'inactivity' ? `${inactivityMinutes} min inactivity during your shift` : 'not starting a shift'}). A ${formatMoney(deductionAmount, emp.region)} deduction (2 days' pay) has been applied.`, 'leave_task');
      }
    }

    if (newRecords.length > 0) {
      await pbSetKV('hr_absence_records_v1', [...existingRecords, ...newRecords]);
    }
  },

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
          await hrActions.addNotification('all', 'admin', `${actorLabel} logged out while on shift — their shift was ended automatically.`, 'shift', actorLabel, actorEmailForPush);
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
  getScreenshots: async (filters?: { employeeEmail?: string; sinceISO?: string; untilISO?: string }): Promise<Screenshot[]> => {
    // Current source: real hr_screenshots collection (PocketBase file field).
    // PocketBase's `=` filter operator is case-sensitive (SQLite BINARY
    // collation) — everywhere else in this app compares emails
    // case-insensitively, so an exact `=` here could silently omit an
    // employee's own screenshots if their stored casing ever drifts (e.g.
    // profile email re-saved with different casing after tracking was set
    // up). `~` (PocketBase's case-insensitive "like") narrows the query
    // server-side for efficiency, and the exact case-insensitive check
    // below guards against `~` accidentally substring-matching a different
    // employee's email (e.g. "bob@x.com" inside "bob@x.company.com").
    const filterParts: string[] = [];
    if (filters?.employeeEmail) filterParts.push(`employee_email ~ "${filters.employeeEmail.replace(/"/g, '\\"')}"`);
    if (filters?.sinceISO) filterParts.push(`captured_at >= "${filters.sinceISO.replace('T', ' ').replace('Z', '')}"`);
    if (filters?.untilISO) filterParts.push(`captured_at <= "${filters.untilISO.replace('T', ' ').replace('Z', '')}"`);
    const records = await pbList('hr_screenshots', {
      sort: '-captured_at',
      ...(filterParts.length ? { filter: filterParts.join(' && ') } : {}),
    });
    let fresh: Screenshot[] = records.map((r: any) => ({
      id: r.id,
      employeeEmail: r.employee_email,
      timestamp: r.captured_at,
      imageUrl: r.image ? pb.files.getURL(r, r.image) : '',
      deviceLabel: r.device_label || undefined,
    }));
    if (filters?.employeeEmail) {
      const wanted = filters.employeeEmail.toLowerCase();
      fresh = fresh.filter(s => (s.employeeEmail || '').toLowerCase() === wanted);
    }

    // Legacy source: base64 rows from before hr_screenshots existed. Kept
    // readable so old captures aren't silently lost; new agents no longer
    // write here (see tracker-agent/agent_gui.py).
    let legacyShots = (await pbGetKVByPrefix('screenshot_')).map(row => ({
      id: row.value.id,
      employeeEmail: row.value.employeeEmail,
      timestamp: row.value.timestamp,
      imageUrl: row.value.imageData,
      legacy: true,
    } as Screenshot));
    if (filters?.employeeEmail) {
      const wanted = filters.employeeEmail.toLowerCase();
      legacyShots = legacyShots.filter(s => (s.employeeEmail || '').toLowerCase() === wanted);
    }
    if (filters?.sinceISO) legacyShots = legacyShots.filter(s => s.timestamp >= filters.sinceISO!);
    if (filters?.untilISO) legacyShots = legacyShots.filter(s => s.timestamp <= filters.untilISO!);

    return [...fresh, ...legacyShots].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  },
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
  checkScreenshotRetention: async (): Promise<void> => {
    const RETENTION_DAYS = 30, WARNING_GRACE_DAYS = 3;
    const state = ((await pbGetKV('hr_screenshot_retention_state_v1')) as ScreenshotRetentionState) || {};
    const now = new Date();
    if (state.warnedAt && state.pendingDeleteIds?.length) {
      const graceElapsed = (now.getTime() - new Date(state.warnedAt).getTime()) >= WARNING_GRACE_DAYS * 24 * 3600 * 1000;
      if (!graceElapsed) return;
      const settings = ((await pbGetKV('hr_tracking_settings_prod_v1')) as TrackingSettings[]) || [];
      const excluded = new Set(settings.filter(s => s.excludeFromAutoDelete).map(s => s.employeeEmail.toLowerCase()));
      const allShots = await hrActions.getScreenshots();
      const stillDue = allShots.filter(s => state.pendingDeleteIds!.includes(s.id) && !excluded.has(s.employeeEmail.toLowerCase()));
      if (stillDue.length > 0) {
        await hrActions.deleteScreenshots(stillDue.map(s => s.id));
        await hrActions.addNotification('all', 'hr', `${stillDue.length} screenshot(s) older than ${RETENTION_DAYS} days were automatically deleted per the monthly retention policy.`);
        await hrActions.addNotification('all', 'admin', `${stillDue.length} screenshot(s) older than ${RETENTION_DAYS} days were automatically deleted per the monthly retention policy.`);
      }
      await pbSetKV('hr_screenshot_retention_state_v1', {});
      return;
    }
    const allShots = await hrActions.getScreenshots();
    if (allShots.length === 0) return;
    const settings = ((await pbGetKV('hr_tracking_settings_prod_v1')) as TrackingSettings[]) || [];
    const excluded = new Set(settings.filter(s => s.excludeFromAutoDelete).map(s => s.employeeEmail.toLowerCase()));
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 3600 * 1000);
    const toDelete = allShots.filter(s => new Date(s.timestamp) < cutoff && !excluded.has(s.employeeEmail.toLowerCase()));
    if (toDelete.length === 0) return;
    await hrActions.addNotification('all', 'hr', `${toDelete.length} screenshot(s) older than ${RETENTION_DAYS} days are scheduled for automatic deletion in ${WARNING_GRACE_DAYS} days. Export or mark specific employees as excluded before then.`);
    await hrActions.addNotification('all', 'admin', `${toDelete.length} screenshot(s) older than ${RETENTION_DAYS} days are scheduled for automatic deletion in ${WARNING_GRACE_DAYS} days. Export or mark specific employees as excluded before then.`);
    await pbSetKV('hr_screenshot_retention_state_v1', { warnedAt: now.toISOString(), pendingDeleteIds: toDelete.map(s => s.id) });
  },

  // ── Timesheets ────────────────────────────────────────────────────────
  getOpenShift: async (employeeEmail: string): Promise<TimesheetEntry | null> => {
    const all = (await pbList('hr_timesheets', { filter: `employee_id = "${employeeEmail}" && clock_out = ""` })).map(toTimesheet);
    return all[0] || null;
  },
  clockIn: async (employeeEmail: string): Promise<TimesheetEntry> => {
    const existingOpen = await hrActions.getOpenShift(employeeEmail);
    if (existingOpen) return existingOpen;
    const now = new Date();
    // Calendar date is bucketed by America/New_York wall-clock time, not UTC
    // and not the device's local timezone — see src/lib/timezone.ts. Without
    // this, an employee clocking in late at night could have their shift
    // filed under the wrong day depending on server/device timezone.
    const created = await pbCreate('hr_timesheets', {
      employee_id: employeeEmail, date: getNYDateString(now), clock_in: now.toISOString(),
      clock_out: '', status: 'pending',
    });
    return toTimesheet(created);
  },
  clockOut: async (employeeEmail: string): Promise<TimesheetEntry | null> => {
    const open = await hrActions.getOpenShift(employeeEmail);
    if (!open) return null;
    const nowIso = new Date().toISOString();
    const updated = await pbUpdate('hr_timesheets', open.id, { clock_out: nowIso, duration: formatDurationBetween(open.clockIn, nowIso) });
    // Clean up tab heartbeat (existing) and write Signal 5 stop command so the
    // tracker agent stops capturing immediately via realtime SSE — both are
    // best-effort: a failure here must never block the clock-out itself.
    try { await pbDeleteKVByKeys([shiftTabHeartbeatKeyFor(employeeEmail)]); } catch { /* best-effort */ }
    try { await hrActions.writeTrackerStopCmd(employeeEmail); } catch { /* best-effort */ }
    return toTimesheet(updated);
  },

  // ── KV Overlay Helpers ───────────────────────────────────────────────
  getKV: async (key: string): Promise<any | null> => pbGetKV(key),
  setKV: async (key: string, value: any): Promise<void> => pbSetKV(key, value),
  deleteKV: async (key: string): Promise<void> => pbDeleteKVByKeys([key]),
};
