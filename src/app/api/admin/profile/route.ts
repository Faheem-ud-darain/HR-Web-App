import { NextResponse } from 'next/server';
import { requireSession, hashPassword } from '@/lib/serverAuth';
import {
  adminFindProfileByEmail,
  adminUpdateProfile,
  adminGetKV,
  adminSetKV,
  adminUploadProfilePicture,
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

function extraKey(profileId: string) {
  return `hr_profile_extra_${profileId}`;
}
function docsKey(profileId: string) {
  return `hr_profile_docs_${profileId}`;
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

    if (newPassword !== undefined && newPassword !== null && newPassword !== '') {
      if (typeof newPassword !== 'string' || newPassword.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
      }
      const hashed = await hashPassword(newPassword);
      await adminUpdateProfile(profileId, { password: hashed });
    }

    if (Object.keys(overlay).length > 0) {
      const existing = (await adminGetKV(extraKey(profileId)))?.value || {};
      await adminSetKV(extraKey(profileId), { ...existing, ...overlay });
    }

    if (Object.keys(docs).length > 0) {
      const existing = (await adminGetKV(docsKey(profileId)))?.value || {};
      await adminSetKV(docsKey(profileId), { ...existing, ...docs });
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
      const existing = (await adminGetKV(extraKey(profileId)))?.value || {};
      await adminSetKV(extraKey(profileId), {
        ...existing,
        approvalStatus: 'approved',
        approvalReviewedBy: session!.email,
        approvalReviewedAt: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'rejectOnboarding') {
      const existing = (await adminGetKV(extraKey(profileId)))?.value || {};
      await adminSetKV(extraKey(profileId), {
        ...existing,
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
      const existing = (await adminGetKV(extraKey(profileId)))?.value || {};
      await adminSetKV(extraKey(profileId), { ...existing, lastIncrementProcessedYear: processedYear });
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
    // New accounts start with the same plaintext default ('123') convention
    // used elsewhere pre-migration, unless a password was explicitly given —
    // hashed either way so no new plaintext rows get created going forward.
    const rawPassword = typeof body.profile.password === 'string' && body.profile.password ? body.profile.password : '123';
    fields.password = await hashPassword(rawPassword);

    const created = await pbAdminFetch(`/api/collections/hr_profiles/records`, {
      method: 'POST',
      body: JSON.stringify(fields),
    });

    const profileId = created?.id;
    if (profileId) {
      await adminSetKV(extraKey(profileId), { accountCreationDate: new Date().toISOString() });

      // Clear any prior deletion tombstone for this email, mirroring
      // hrActions.addEmployee's client-side behavior, so a re-added employee
      // isn't silently treated as still-deleted by whatever reads that list.
      const tombstoneKey = 'hr_deleted_profile_emails_v1';
      const tombstones = (await adminGetKV(tombstoneKey))?.value;
      if (Array.isArray(tombstones) && body.profile.email) {
        const email = String(body.profile.email).toLowerCase().trim();
        const filtered = tombstones.filter((e: string) => String(e).toLowerCase().trim() !== email);
        if (filtered.length !== tombstones.length) {
          await adminSetKV(tombstoneKey, filtered);
        }
      }
    }

    return NextResponse.json({ ok: true, id: profileId });
  } catch (err: any) {
    console.error('[admin/profile PATCH] error:', err);
    return NextResponse.json({ error: 'Could not create employee.' }, { status: 500 });
  }
}
