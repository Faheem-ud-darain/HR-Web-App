import { NextResponse } from 'next/server';
import { requireSession, hashPassword, isBcryptHash } from '@/lib/serverAuth';
import {
  adminFindProfileByEmail,
  adminUpdateProfile,
  adminUploadProfilePicture,
  adminFindByField,
  adminUpsertByField,
  adminDeleteByField,
  pbAdminFetch,
} from '@/lib/pbAdmin';
import { splitProfileUpdate, fromProfileFields } from '@/lib/profileFields';

export const runtime = 'edge';

// HR/Admin-privileged writes to OTHER employees' hr_profiles records — role
// changes, team/lead-team/warehouse assignment, onboarding approve/reject,
// base salary + increment edits, offboarding flag, and admin-triggered
// password resets. This is the counterpart to /api/profile/me (self-service
// only) — the caller here can target *any* profileId, so it is gated to
// session.role === 'hr' || 'admin' rather than "whoever the JWT belongs to".
//
// Mirrors the exact real/overlay/docs field-routing already proven out in
// /api/profile/me/route.ts and hrActions.updateProfileDetails client-side,
// via the shared src/lib/profileFields.ts helpers, so this doesn't re-derive
// that classification logic a third time.
//
// Deliberately NOT covered here (left on the public client for now — see
// standing notes on the auth migration): hrActions.deleteEmployee (a large,
// irreversible, multi-collection purge spanning tracking/screenshots/
// payroll/timesheets/tasks/tickets/etc.) and hrActions.exportEmployeeArchive
// (a broad multi-collection export). Both are big enough, and destructive/
// broad enough, that they deserve their own careful pass rather than being
// rushed in alongside this batch of more contained profile-field edits.

// Plan 027 Phase 2: profile overlays moved off hr_delcargo_store onto
// their own collections (hr_profile_extras/hr_profile_docs — one row per
// profile, keyed by profile_id, same generic find-or-create-by-field
// shape as Phase 1's collections). getExtras/mergeExtras below replace
// every repeated "read existing, spread in a patch, write back" call site
// in this file with one call each.
async function getExtras(profileId: string): Promise<Record<string, any>> {
  const row = await adminFindByField('hr_profile_extras', 'profile_id', profileId);
  return row?.data || {};
}
async function mergeExtras(profileId: string, patch: Record<string, any>): Promise<void> {
  const existing = await getExtras(profileId);
  await adminUpsertByField('hr_profile_extras', 'profile_id', profileId, { ...existing, ...patch });
}
async function mergeDocs(profileId: string, patch: Record<string, any>): Promise<void> {
  const row = await adminFindByField('hr_profile_docs', 'profile_id', profileId);
  const existing = row?.data || {};
  await adminUpsertByField('hr_profile_docs', 'profile_id', profileId, { ...existing, ...patch });
}

// Plan 013 step 1: no new account should ever be protected only by a
// single, universal, guessable literal ('123', 'employee123', ...) shared
// by every not-yet-approved account across the whole deployment. When the
// caller doesn't supply an explicit temp password, generate one per
// account instead — still a temp password the employee logs in with
// during onboarding (same lifecycle as before), just not a shared secret
// anyone who knows this codebase could type in. Uses Web Crypto
// (crypto.getRandomValues) rather than Math.random so it's cryptographically
// unpredictable and Edge-runtime compatible (same constraint as
// serverAuth.ts's hashPassword — see that file's header comment).
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; // no 0/O/1/l/I — avoids operator/employee transcription errors
function generateTempPassword(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += TEMP_PASSWORD_ALPHABET[bytes[i] % TEMP_PASSWORD_ALPHABET.length];
    if (i === 4) out += '-';
  }
  return out;
}

async function requireHrOrAdmin(request: Request) {
  const session = await requireSession(request);
  if (!session) return { session: null, error: NextResponse.json({ error: 'Not authenticated.' }, { status: 401 }) };
  if (session.role !== 'hr' && session.role !== 'admin') {
    return { session: null, error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) };
  }
  return { session, error: null };
}

// POST { profileId, updates } — general-purpose profile field update,
// covering role/teams/leadTeams/warehouses/baseSalary/offboarding/etc. via
// the same splitProfileUpdate() classification used by updateProfileSelf.
export async function POST(request: Request) {
  const { session, error } = await requireHrOrAdmin(request);
  if (error) return error;

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { profileId, updates } = body || {};
  if (!profileId || typeof profileId !== 'string' || !updates || typeof updates !== 'object') {
    return NextResponse.json({ error: 'profileId and updates are required.' }, { status: 400 });
  }

  try {
    // `password` is intentionally pulled out of the generic updates object
    // before splitProfileUpdate/fromProfileFields ever see it. The old
    // client-side UserProfileModal edit form pre-filled a plaintext password
    // field from the (already public) profile list and, on save, wrote
    // whatever was in that box straight back to hr_profiles.password via
    // updateProfileDetails's plain field passthrough — meaning every profile
    // edit silently rewrote the plaintext password even when the admin never
    // meant to change it. Routing password changes through the same hashed
    // path as the dedicated 'resetPassword' action below closes that off:
    // this route never writes an unhashed password, no matter which code
    // path the client calls.
    const { password: newPassword, ...restUpdates } = updates;
    const { real, overlay, docs, profilePicture } = splitProfileUpdate(restUpdates);

    if (Object.keys(real).length > 0) {
      await adminUpdateProfile(profileId, fromProfileFields(real));
    }

    // Skip entirely if this is already a pbkdf2$... hash — the client's
    // Edit Credentials field pre-fills from whatever's currently stored
    // (see UserProfileModal.tsx), which is that same hash once an employee
    // has logged in since the hashing migration. Without this check, every
    // profile save that didn't touch the password field at all — editing
    // Job Title, Base Salary, anything — would re-hash an already-hashed
    // value into a hash-of-a-hash and silently break that employee's login,
    // which is exactly what happened here.
    if (newPassword !== undefined && newPassword !== null && newPassword !== '' && !isBcryptHash(newPassword)) {
      if (typeof newPassword !== 'string' || newPassword.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
      }
      const hashed = await hashPassword(newPassword);
      await adminUpdateProfile(profileId, { password: hashed });
    }

    if (Object.keys(overlay).length > 0) {
      await mergeExtras(profileId, overlay);
    }

    if (Object.keys(docs).length > 0) {
      await mergeDocs(profileId, docs);
    }

    if (profilePicture !== undefined) {
      await adminUploadProfilePicture(profileId, profilePicture);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[admin/profile POST] error:', err);
    return NextResponse.json({ error: 'Could not save changes. Please try again.' }, { status: 500 });
  }
}

// POST-style sub-actions are exposed as their own verbs below rather than
// overloading the generic updates object, since each has slightly different
// semantics (notifications, tombstone-clearing, password hashing) beyond a
// plain field write.

// PUT { action: 'approveOnboarding' | 'rejectOnboarding', profileId, reviewerEmail, rejectionReason? }
export async function PUT(request: Request) {
  const { session, error } = await requireHrOrAdmin(request);
  if (error) return error;

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { action, profileId } = body || {};
  if (!profileId || typeof profileId !== 'string') {
    return NextResponse.json({ error: 'profileId is required.' }, { status: 400 });
  }

  try {
    if (action === 'approveOnboarding') {
      await mergeExtras(profileId, {
        approvalStatus: 'approved',
        approvalReviewedBy: session!.email,
        approvalReviewedAt: new Date().toISOString(),
        // Plan 013 step 2: approval is the point where the employee is
        // expected to stop using the HR-issued temp password — force a
        // change on their next login rather than leaving it open-ended.
        // Cleared by /api/profile/me's change-password path once they do.
        mustChangePassword: true,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'rejectOnboarding') {
      await mergeExtras(profileId, {
        approvalStatus: 'rejected',
        approvalReviewedBy: session!.email,
        approvalReviewedAt: new Date().toISOString(),
        approvalRejectionReason: body.rejectionReason || '',
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'resetPassword') {
      // Admin-triggered reset of ANOTHER employee's password — the
      // counterpart to /api/profile/me's self-service changeOwnPassword.
      // Unlike hrActions.resetPassword (still plaintext, client-side), this
      // always stores a bcrypt hash — closing the last plaintext-write path
      // for hr_profiles.password.
      if (!body.newPassword || typeof body.newPassword !== 'string' || body.newPassword.length < 6) {
        return NextResponse.json({ error: 'New password must be at least 6 characters.' }, { status: 400 });
      }
      const hashed = await hashPassword(body.newPassword);
      await adminUpdateProfile(profileId, { password: hashed });
      // Same reasoning as approveOnboarding above — an admin-issued
      // password is another temp password by definition, so force a
      // change on next login rather than leaving it as a long-lived
      // secret only HR knows.
      await mergeExtras(profileId, { mustChangePassword: true });
      return NextResponse.json({ ok: true });
    }

    if (action === 'applyIncrement') {
      // Mirrors hrActions.applyAnniversaryIncrement: writes the new
      // base_salary real column plus the lastIncrementProcessedYear overlay
      // marker in one call, so the two never drift apart.
      const { newBaseSalary, processedYear } = body;
      if (typeof newBaseSalary !== 'number' || typeof processedYear !== 'number') {
        return NextResponse.json({ error: 'newBaseSalary and processedYear are required.' }, { status: 400 });
      }
      await adminUpdateProfile(profileId, { base_salary: newBaseSalary });
      await mergeExtras(profileId, { lastIncrementProcessedYear: processedYear });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err: any) {
    console.error('[admin/profile PUT] error:', err);
    return NextResponse.json({ error: 'Could not complete the requested action.' }, { status: 500 });
  }
}

// POST-like create — separate verb (PATCH) for adding a brand-new employee,
// since it creates a record rather than updating one.
// PATCH { action: 'addEmployee', profile: {...} }
export async function PATCH(request: Request) {
  const { session, error } = await requireHrOrAdmin(request);
  if (error) return error;

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (body?.action !== 'addEmployee' || !body.profile) {
    return NextResponse.json({ error: 'action must be addEmployee, with a profile payload.' }, { status: 400 });
  }

  try {
    const fields = fromProfileFields(body.profile);
    // Plan 013 step 1: an explicitly-supplied temp password is honored as
    // before; when none is given, generate a per-account random one rather
    // than falling back to a literal every account in every deployment used
    // to share. Hashed either way — the plaintext only ever exists in this
    // one response, for the admin to hand to the new hire.
    const rawPassword = typeof body.profile.password === 'string' && body.profile.password ? body.profile.password : generateTempPassword();
    fields.password = await hashPassword(rawPassword);

    const created = await pbAdminFetch(`/api/collections/hr_profiles/records`, {
      method: 'POST',
      body: JSON.stringify(fields),
    });

    const profileId = created?.id;
    if (profileId) {
      await adminUpsertByField('hr_profile_extras', 'profile_id', profileId, { accountCreationDate: new Date().toISOString() });

      // Clear any prior deletion tombstone for this email, mirroring
      // hrActions.addEmployee's client-side behavior, so a re-added employee
      // isn't silently treated as still-deleted by whatever reads that list.
      // hr_deleted_profile_emails is one row per email (plan 027) — clearing
      // a tombstone is now a single delete-if-exists instead of a
      // read-whole-array/filter/write-whole-array round trip.
      if (body.profile.email) {
        await adminDeleteByField('hr_deleted_profile_emails', 'email', String(body.profile.email).toLowerCase().trim());
      }
    }

    // Return the temp password (whether admin-supplied or generated) so the
    // caller can display/communicate it — this is the only place it's ever
    // sent back in plaintext, and only to an already-authenticated HR/Admin.
    return NextResponse.json({ ok: true, id: profileId, tempPassword: rawPassword });
  } catch (err: any) {
    console.error('[admin/profile PATCH] error:', err);
    return NextResponse.json({ error: 'Could not create employee.' }, { status: 500 });
  }
}
