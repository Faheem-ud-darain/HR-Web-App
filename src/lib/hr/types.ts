// src/lib/hr/types.ts
// Every exported interface/type used across the HR app's domain modules.
// Extracted from the former hrData.ts monolith (plan 014) — pure type
// declarations only, no runtime behavior. See plans/014-split-hrdata-monolith.md.

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
    // Reserved-balance payout at resignation/termination (item 3/8 of the
    // 2026-09-03 payroll overhaul) — reservedSalaryBalance (automatic
    // first-month withhold) + manualReservedAmount (HR/Admin's manual
    // record-only annotation) as of the moment offboarding is confirmed.
    // Like finalLeavePayout, this is a one-time snapshot taken at
    // confirmOffboard time, not a live-recomputed value.
    finalReservedPayout?: number;
    // Only meaningful when this employee had a companyPhone on file — the
    // company-allocated number must be handed back before offboarding
    // completes (see confirmOffboard in UserProfileModal.tsx, which blocks
    // submission on this when applicable).
    companyNumberReturned?: boolean;
  };
  lastIncrementProcessedYear?: number;
  // ── Reserved salary balance (item 3/8, 2026-09-03 payroll overhaul) ────
  // Automatic: an employee's first calendar month of pay is always withheld
  // rather than paid out (see computePayrollView's reservedThisMonth), and
  // accumulates here at "Process" time. Paid out only at resignation or
  // termination (offboardingStatus.finalReservedPayout above) — never
  // deducted from any later month's normal pay.
  reservedSalaryBalance?: number;
  // Manual: HR/Admin can record an already-reserved amount for an EXISTING
  // employee (e.g. carried over from before this system existed) purely as
  // a tracking annotation — per explicit product decision this does NOT
  // affect that employee's current/live payroll calculation at all, it
  // only shows alongside reservedSalaryBalance on the Net Payable view and
  // gets folded into finalReservedPayout at offboarding.
  manualReservedAmount?: number;
  manualReservedNote?: string;
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
  // Plan 013 step 2: set true by HR/Admin's approveOnboarding action (see
  // admin/profile/route.ts) the moment an account is approved — forces the
  // employee to set their own password (replacing the HR-issued temp one)
  // on their next login, via ForcedPasswordChangeModal in
  // (dashboard)/layout.tsx. Cleared server-side by /api/profile/me's
  // change-password path once they actually do. Overlay-only, like the
  // approval fields above — never set from the generic profile-edit UI.
  mustChangePassword?: boolean;
  // Contact numbers — overlay-only (no hr_profiles columns), self-service
  // edited from the employee's own Profile page (see employee/profile/page.tsx),
  // same pattern as bank details. personalPhone is the employee's own number;
  // companyPhone is only set if the company has issued them a separate
  // work/SIM number (optional).
  personalPhone?: string;
  companyPhone?: string;
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

export interface MaintenanceNotice {
  id: string;
  title: string;
  message: string;
  startAt: string; // ISO UTC instant
  endAt: string; // ISO UTC instant
  createdBy: string;
  createdAt: string; // ISO UTC — "posted" info only, not the maintenance window itself
}

export interface LeaveApplication {
  id: string; employeeName: string; type: 'PTO' | 'Sick Leave' | 'Urgent' | 'Parental Leave' | 'Normal';
  duration: string; reason: string; status: 'pending' | 'hr_approved' | 'approved' | 'rejected';
}

export interface Task {
  id: string; title: string; description: string; assignedTo: string; assignedEmail: string;
  team: string; dueDate: string; priority: 'low' | 'medium' | 'high'; status: 'todo' | 'in_progress' | 'done';
  createdBy: string;
}

export interface TimesheetEntry {
  id: string; employeeEmail: string; date: string; clockIn: string; clockOut?: string;
  duration?: string; status: 'in_progress' | 'completed'; approvalStatus: 'pending' | 'approved' | 'rejected';
}

export interface PayrollRecord {
  id: string; employeeId: string; name: string; role: string; region?: 'USA' | 'Pakistan';
  baseSalary: number; unpaidLeaves: number; bonus: number; deductions: number; processed: boolean;
  incrementAmount: number;
  // "YYYY-MM" (America/New_York calendar month this record belongs to) —
  // uses hr_payroll's pre-existing month/year columns, which the app used
  // to leave completely unwritten. Without this, every employee had at
  // most one hr_payroll row ever: computePayrollView's `existing` lookup
  // matched by employeeId alone, so "processing" September just overwrote
  // August's row in place instead of creating a new one, and a paid month
  // could never go back to showing "pending" the following month. Now
  // each calendar month gets its own row, scoped by this field.
  month: string;
  // NOT a persisted hr_payroll column — the live hr_payroll schema has no
  // slot for it. Deliberately recomputed fresh every time by
  // computePayrollView (from emp.joinedDate + this record's own `month`),
  // the same way effectiveBaseSalary's late-joiner proration already is,
  // rather than requiring a new PocketBase column. Whatever this equals is
  // ALSO folded straight into `deductions` before it's ever written, so
  // net pay (baseSalary + bonus - deductions + incrementAmount) already
  // reflects it being withheld — this field exists purely so the UI can
  // show it as its own labeled line ("Reserved — paid at resignation")
  // instead of an opaque generic deduction. See getShiftShortfallDeduction
  // and the "1. Calculate Base Salary" block's isEmployeesFirstMonth for
  // where this comes from.
  reservedThisMonth: number;
  // NOT a persisted column either (same reasoning as reservedThisMonth) —
  // the itemized "why was I deducted" list shown on the Net Payable modal
  // (HR/Admin) and the Employee dashboard. Sums to (at least) `deductions`
  // — see its own comment in computePayrollView for why it can sum to
  // MORE when the safety-net cap has kicked in.
  deductionBreakdown: { label: string; amount: number }[];
  // NOT a persisted column (same reasoning as reservedThisMonth) — the sum
  // of this employee's OTHER hr_payroll rows that are still `!processed`
  // (any month other than this record's own `month`). Purely informational:
  // it tells HR/Admin "there is still X unpaid from a prior month sitting
  // out there", but is deliberately NEVER folded into this month's
  // baseSalary/deductions/net-pay math. It used to be (see
  // computePayrollView's old totalBaseWithArrears), which silently pulled a
  // prior month's already-absence-deducted net pay into the CURRENT
  // month's base salary the moment that prior month rolled past its
  // processing window without being marked "Complete Payout" — so an
  // employee's September numbers (and September's own absence deductions)
  // were quietly inflated by whatever August still owed. Each month's
  // figures must stand on their own; unpaid prior months are surfaced here
  // instead, for HR to resolve by actually processing that old record (at
  // which point it stops counting toward this).
  pendingArrears: number;
}

export interface AbsenceRecord {
  id: string; // opaque PocketBase record id
  employeeEmail: string;
  employeeName: string;
  date: string; // "YYYY-MM-DD", America/New_York calendar day
  reason: 'no_clock_in' | 'inactivity' | 'under_4_hours';
  inactivityMinutes?: number; // only set when reason === 'inactivity'
  workedMinutes?: number; // set when reason === 'under_4_hours'
  deductionAmount: number;
  createdAt: string; // ISO instant this record was created
  acknowledged: boolean; // employee has seen/dismissed the explanatory popup
  deleted?: boolean;
  deletedAt?: string;
}

export interface TrackingSettings {
  id?: string; employeeEmail: string; enabled: boolean; intervalMinutes: number; excludeFromAutoDelete: boolean; agentToken: string;
}

export interface TrackerHeartbeat {
  employeeEmail: string; deviceId: string; deviceLabel?: string; connectedAt: string; lastSeenAt: string;
  /** Written by the desktop agent since v6 — used by the web portal to detect outdated builds. */
  agentVersion?: string;
  // ── Capture-health fields, written by the desktop agent since v14 ──────
  // Added because "Connected" (a live heartbeat) previously meant nothing
  // about whether screenshots were actually being captured — an employee
  // could sit at their lock screen (or have screen-recording permission
  // revoked) for hours while the dashboard kept showing a green "Connected"
  // badge, since the heartbeat loop and the capture loop were entirely
  // independent. See getCaptureHealth below for how these are interpreted.
  /** ISO timestamp of the most recent successful screenshot upload, or null/undefined if none yet this run. */
  lastCaptureAt?: string | null;
  /** Human-readable reason the most recent capture attempt didn't produce an uploaded screenshot (e.g. "Screen is locked", a network error) — null once a capture succeeds. */
  lastCaptureError?: string | null;
  /** True when the agent detected the OS session was locked on its most recent capture tick (Windows: secure-desktop check; macOS: CGSSessionScreenIsLocked). */
  isLocked?: boolean;
  /** How many consecutive capture attempts have failed or been skipped (lock, upload error) — resets to 0 on the next success. */
  consecutiveCaptureFailures?: number;
  /** Whether the agent currently believes it *should* be capturing (HR toggle on AND an active shift) — lets the dashboard avoid flagging "not capturing" when there's simply no shift running right now. */
  captureEnabled?: boolean;
}

export type CaptureHealthStatus = 'ok' | 'locked' | 'failing' | 'idle' | 'unknown' | 'stale_token';

export interface ShiftTabHeartbeat { employeeEmail: string; lastSeenAt: string; }

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

export interface TrackerQuitIntent {
  employeeEmail: string;
  timestamp: string; // ISO — portal ignores signals older than 15 min
}

export interface TrackerPing {
  employeeEmail: string;
  requestId: string;   // random uuid — must match pong's requestId to be valid
  requestedAt: string; // ISO — agent ignores pings older than 30s
}

export interface TrackerPong {
  employeeEmail: string;
  requestId: string;   // echoed from the ping — portal validates this matches
  respondedAt: string; // ISO
}

export interface TrackerStopCommand {
  employeeEmail: string;
  commandId: string;  // random id — agent deletes key after acting on it
  issuedAt: string;   // ISO — agent ignores commands older than 60s
}

export interface TrackerCommand {
  employeeEmail: string;
  type: 'diagnostics' | 'reload_settings';
  issuedAt: string; // ISO — agent ignores commands older than ~60s
}

export interface TrackerDiagnostics {
  employeeEmail: string;
  respondedAt: string; // ISO
  appVersion: string;
  platform: string;
  deviceLabel: string;
  connected: boolean;
  connectionStatus?: string;
  enabled: boolean;
  enabledByHr: boolean;
  shiftActive: boolean;
  isLocked: boolean;
  lastError?: string;
  lastCaptureAt?: string;
  consecutiveCaptureFailures?: number;
  intervalMinutes?: number;
  autostart: boolean;
  updateAvailableVersion?: string;
}

export interface UserSessionSlot {
  deviceId: string; deviceLabel: string; sessionToken: string; loggedInAt: string; lastSeenAt: string;
}

export interface Screenshot { id: string; employeeEmail: string; timestamp: string; imageUrl: string; deviceLabel?: string; legacy?: boolean; }

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
  // The category this row was created with (see hrActions.addNotification).
  // Written on every row but, until the HR & Admin Line feature, never read
  // back into the app — nothing client-side needed it (the per-recipient
  // opt-out check happens server-side in pb_hooks/push_notifications.pb.js
  // against the raw record). The HR & Admin Line sidebar unread-dot needs
  // it to pick 'hr_admin_line' rows out of the notifications feed that's
  // already loaded app-wide for the bell — see hasUnseenHrAdminLineActivity
  // below — rather than fetching hr_notifications a second time just for
  // that.
  category?: NotificationCategory;
}

export type NotificationCategory = 'announcement' | 'ticket' | 'chat_mention' | 'leave_task' | 'shift' | 'maintenance' | 'hr_admin_line' | 'internal';

export type NotificationPrefs = Record<Exclude<NotificationCategory, 'internal' | 'maintenance' | 'hr_admin_line'>, boolean>;

export interface CareerPosition {
  id: string; title: string; department: string; location: string; description: string; requirements: string[];
}

export type CareerApplicationStatus = 'pending' | 'reviewed' | 'shortlisted' | 'rejected' | 'hired';

export interface CareerApplication {
  id: string; positionId: string; positionTitle: string; applicantName: string; applicantEmail: string;
  coverLetter: string; submittedAt: string; status: CareerApplicationStatus;
}

export interface TicketReply {
  id: string; senderName: string; senderRole: 'employee' | 'hr' | 'admin' | 'team_lead'; message: string; timestamp: string;
  attachmentName?: string; attachmentUrl?: string; attachmentSize?: number; senderEmail?: string;
}

export interface Ticket {
  id: string; employeeName: string; employeeEmail: string; title: string; description: string;
  department: 'hr' | 'technical';
  status: 'open' | 'closed'; createdAt: string; replies: TicketReply[];
}

export interface TicketPresence {
  id?: string; ticketId: string; email: string; role: string; lastSeenAt: string;
}

export interface TicketSeenState {
  ticketId: string; employeeSeenAt: string;
}

export interface TypingState {
  scope: 'chat' | 'ticket'; scopeId: string; email: string; displayName: string; lastTypedAt: string;
}

export interface Team {
  id: string; name: string; leadEmail?: string; members: string[]; warehouseId?: string;
}

export interface Message {
  id: string; teamId: string; senderEmail: string; senderName: string;
  text?: string; attachmentUrl?: string; attachmentName?: string; attachmentSize?: number;
  isAnnouncement?: boolean; timestamp: string;
  // Forward metadata (HR & Admin Line feature) — set only on messages sent
  // via hrActions.forwardToHrAdminLine, always into the fixed
  // HR_ADMIN_LINE_TEAM_ID channel. `text` is left empty on a forwarded
  // message; the forwarded card renders from these fields instead.
  // Requires the forward_* columns added by
  // migration_data/add_forward_fields_to_messages.py — NOT YET RUN against
  // the live PocketBase instance as of this writing (see that script's
  // header comment). Until it's run, PocketBase silently drops these keys
  // on write and toMessage's forward_* reads all come back undefined, so
  // a forwarded message just renders as an empty-looking plain message
  // with no card — not a crash, just missing the extra styling until the
  // migration is applied.
  isForward?: boolean;
  forwardKind?: 'ticket' | 'announcement' | 'chat';
  // The source's title (ticket/announcement) or source channel's display
  // name (chat) — NOT a UI label like "Forwarded → Ticket"; that tag is
  // derived from forwardKind at render time (see TeamChatView.tsx).
  forwardLabel?: string;
  // The source record's raw id (ticket id / announcement id / source
  // teamId) — deliberately NOT a pre-built path. buildNotificationLink
  // bakes in a role-specific base path (/hr/... vs /admin/...), but this
  // channel is read by BOTH hr and admin, so the "View original" link is
  // resolved at render time from this raw id + forwardKind using the
  // *viewer's own* role, not the forwarder's.
  forwardLink?: string;
  forwardNote?: string;
}

export interface TeamDocument {
  id: string; teamId: string; title: string; description?: string;
  fileUrl: string; fileName: string; fileSize?: number;
  uploadedByEmail: string; uploadedByName: string; uploadedByRole?: string;
  timestamp: string;
}

export interface PayrollSelf {
  id: string;
  fullName: string;
  teams: string[];
  baseSalary: number;
  salaryStartDate?: string;
  joinedDate: string;
  lastIncrementProcessedYear?: number;
  region?: 'USA' | 'Pakistan';
  pendingIncrement: number;
  // Reserved-balance fields (item 3/8) — see /api/payroll/me's comment.
  reservedSalaryBalance?: number;
  manualReservedAmount?: number;
  payrollRecord: {
    bonus: number;
    deductions: number;
    processed: boolean;
    month?: string;
    // "why was I deducted" — same itemized list HR/Admin see on the Net
    // Payable modal (PayrollRecord.deductionBreakdown), plus this month's
    // reserved-salary amount if this was the employee's first month.
    deductionBreakdown?: { label: string; amount: number }[];
    reservedThisMonth?: number;
  } | null;
}

export interface MyAbsenceRecord {
  id: string;
  date: string; // "YYYY-MM-DD"
  reason: 'no_clock_in' | 'inactivity' | 'under_4_hours';
  inactivityMinutes?: number;
  workedMinutes?: number;
  deductionAmount: number;
  createdAt: string;
}

export interface ProfileSelf {
  id: string;
  bankName: string;
  accountNumber: string;
  iban: string;
  personalPhone: string;
  companyPhone: string;
  cvFileName: string;
  identityDocs: { name: string; data: string }[];
  passportFileName: string;
}


// Shared across notifications.ts and teams.ts (hasUnseenHrAdminLineActivity) —
// originally a private `type` in hrData.ts; exported here (visibility-only
// change, no behavior change) so both domain modules can use it.
export type NotificationReadMap = Record<string, string[]>;
