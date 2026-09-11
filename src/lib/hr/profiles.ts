// src/lib/hr/profiles.ts
// Profile CRUD (hr_profiles), profile "extras"/documents overlay storage,
// onboarding/increment/password admin actions, and multi-device session
// enforcement (an Employee/Team Lead login concern, not cleanly any of the
// plan's other 9 domains — placed here as the closest fit; see plan 014's
// implementation notes for this judgment call). Extracted from the former
// hrData.ts monolith (plan 014). See plans/014-split-hrdata-monolith.md.

'use client';
import { useQuery } from '@tanstack/react-query';
import { pb } from '../pocketbase';
import { getOrCreateDeviceId, getAuthToken } from '../session';
import { API_BASE } from '../apiBase';
import type { Profile, UserSessionSlot, Screenshot, ProfileSelf } from './types';
import {
  pbList, pbListByEmailField, pbCreate, pbUpdate, pbDelete, pbFindByField, pbUpsertByField,
  pbGetKV, pbSetKV, pbGetKVByPrefix, pbDeleteKVByKeys, withTimeout,
  looksLikeRealId,
} from './shared';
import {
  hrActions, getPayrollForEmployeeAdmin, deletePayrollForEmployeeAdmin,
  getCareerApplicationsForEmailAdmin, deleteCareerApplicationsForEmailAdmin,
} from '../hrData';

export function isTechnicalSupportMember(teams?: string[] | null): boolean {
  if (!teams || !Array.isArray(teams)) return false;
  return teams.some(t => {
    const lower = (t || '').toLowerCase().trim();
    return lower === 'technical support' || lower === 'internal technical support';
  });
}

export function displayName(profile: { fullName: string; alias?: string } | null | undefined, viewerRole: 'employee' | 'hr' | 'admin' | 'team_lead' | null | undefined): string {
  if (!profile) return '';
  const canSeeRealName = viewerRole === 'hr' || viewerRole === 'admin';
  if (canSeeRealName) {
    return profile.alias ? `${profile.fullName} (${profile.alias})` : profile.fullName;
  }
  return profile.alias || profile.fullName;
}

export const MAX_USER_SESSION_DEVICES = 2;
// If a device's slot hasn't heartbeated in this long, it's treated as
// abandoned (browser/tab closed without hitting Log Out) and doesn't count
// against the cap — so an employee whose old laptop just silently died
// isn't ever permanently locked out of one of their 2 slots.
export const USER_SESSION_STALE_MS = 3 * 60 * 1000; // 3 minutes tolerance for multi-device heartbeat check
// Plan 027: multi-device sessions moved off the generic hr_delcargo_store
// KV table (keyed by a lossy slugified email, `user_session_<slug>`) onto
// their own hr_user_sessions collection — one row per email (the real,
// un-slugified address, via pbFindByField/pbUpsertByField's exact-match
// field lookup), same pattern already proven out for hr_tracking_settings/
// hr_ticket_presence. Existing hr_delcargo_store session rows are NOT
// migrated (the slug can't be reversed back to an exact email losslessly);
// they're simply abandoned — every session function below already
// re-claims a slot from scratch when none is found, exactly as it does
// today for a brand-new device, so this is a one-time "everyone's already-
// open sessions look like a fresh device on next check-in" event, not a
// breaking change.
//
// hr_user_sessions already existed in PocketBase before this plan (created
// ahead of time in earlier prep work, never wired into any app code) —
// its payload field is `data`, not the `slots` name used elsewhere in this
// plan's own admin-only collections, so this file follows the collection
// that's actually there rather than renaming it.
const USER_SESSIONS_COLLECTION = 'hr_user_sessions';
const userSessionEmailKeyFor = (email: string) => (email || '').toLowerCase().trim();

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

export function useProfileDocuments(profileId: string | null | undefined) {
  return useQuery({
    queryKey: ['hr_profile_docs', profileId],
    queryFn: () => getProfileDocuments(profileId as string),
    enabled: !!profileId,
  });
}

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

export async function resetPasswordServer(profileId: string, newPassword: string): Promise<void> {
  await adminProfileRequest('PUT', { action: 'resetPassword', profileId, newPassword });
}

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

export async function addEmployeeServer(emp: Omit<Profile, 'id' | 'onboardingCompleted'>): Promise<{ id: string; tempPassword?: string }> {
  return adminProfileRequest('PATCH', { action: 'addEmployee', profile: emp });
}

export async function updateEmployeeTeamsAdmin(profileId: string, newTeams: string[]): Promise<void> {
  await updateProfileAdmin(profileId, { teams: newTeams });
}

export async function setTeamLeadAdmin(profileId: string, leadTeams: string[]): Promise<void> {
  await updateProfileAdmin(profileId, { isTeamLead: leadTeams.length > 0, leadTeams });
}

export const profileActions = {
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

  // ── Multi-device session enforcement (Employee/Team Lead only) ──────────
  // Reads the raw KV row and normalizes it into an array — a pre-existing
  // session written before this multi-device migration is a bare
  // {email, sessionToken, deviceLabel, loggedInAt, lastSeenAt} object with
  // no deviceId; treated as one legacy slot (deviceId 'legacy') so an
  // in-flight session from right before this shipped doesn't just vanish
  // and force everyone to re-login.
  getUserSessions: async (email: string): Promise<UserSessionSlot[]> => {
    const row = await pbFindByField(USER_SESSIONS_COLLECTION, 'email', userSessionEmailKeyFor(email));
    const raw = row?.data;
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
    try {
      await pbUpsertByField(USER_SESSIONS_COLLECTION, 'email', userSessionEmailKeyFor(email), { data: next });
    } catch (err) {
      // Fails OPEN — never block someone's login over a session-tracking
      // storage hiccup (e.g. hr_user_sessions not existing yet mid-
      // migration, see plan 027). The 2-device cap simply doesn't get
      // enforced for this one login attempt; nothing about auth itself
      // depends on this write succeeding.
      console.warn('[session] claimUserSessionSlot storage error, allowing login without persisting the slot:', err);
    }
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
      await pbUpsertByField(USER_SESSIONS_COLLECTION, 'email', userSessionEmailKeyFor(cleanEmail), { data: next });
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
    await pbUpsertByField(USER_SESSIONS_COLLECTION, 'email', userSessionEmailKeyFor(email), { data: next });
  },
  // Wipes every device slot at once — used by "Log out from everywhere and
  // sign in here" on the login screen when the 2-device cap is already full.
  clearAllUserSessions: async (email: string): Promise<void> => {
    const row = await pbFindByField(USER_SESSIONS_COLLECTION, 'email', userSessionEmailKeyFor(email));
    if (row) await pbDelete(USER_SESSIONS_COLLECTION, row.id);
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
};
