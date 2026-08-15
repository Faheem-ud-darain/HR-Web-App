import { NextResponse } from 'next/server';
import { requireSession, verifyPassword, hashPassword } from '@/lib/serverAuth';
import {
  adminFindProfileByEmail,
  adminUpdateProfile,
  adminGetKV,
  adminSetKV,
  adminUploadProfilePicture,
} from '@/lib/pbAdmin';

export const runtime = 'edge';

// Server-side replacement for employee/profile/page.tsx's bank details /
// contact numbers / CV / ID scans / passport / profile picture — the exact
// same set of fields hrActions.updateProfileDetails handles client-side,
// just scoped here so the caller can only ever read or write their OWN
// record (identified by their verified session JWT), never anyone else's.
// This is the second collection of fields moved off the fully-public
// hr_profiles/hr_delcargo_store path, after the login/salary migration —
// see Notes on the auth refactor for what's still NOT covered yet (HR/Admin
// managing OTHER employees' profiles — role changes, onboarding approval,
// offboarding, base salary edits — which remain on the public client for
// now and need their own follow-up pass).
// approvalStatus is included here so a new employee's own onboarding
// submission can set it to 'pending' server-side — the counterpart to
// onboardingCompleted below. HR/Admin's actual approve/reject decision
// (setting it to 'approved'/'rejected' + reviewer fields) goes through the
// separate hr/admin-gated /api/admin/profile route, never this one.
const KV_EXTRA_KEYS = ['personalPhone', 'companyPhone', 'approvalStatus'] as const;
const KV_DOC_KEYS = ['cvFileName', 'cvFileData', 'identityDocs', 'passportFileName', 'passportFileData'] as const;
const REAL_FIELD_MAP: Record<string, string> = {
  bankName: 'bank_name',
  accountNumber: 'account_number',
  iban: 'iban',
  // Self-service onboarding completion flag — written by the new-employee
  // onboarding form and by the "resubmit after rejection" reset in
  // (dashboard)/layout.tsx (both mutate the CURRENT session's own profile,
  // so this stays in the self-scoped route rather than the HR/Admin one).
  onboardingCompleted: 'onboarding_completed',
};

function extraKey(profileId: string) {
  return `hr_profile_extra_${profileId}`;
}
function docsKey(profileId: string) {
  return `hr_profile_docs_${profileId}`;
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const profile = await adminFindProfileByEmail(session.email);
    if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });

    const [extras, docs] = await Promise.all([
      adminGetKV(extraKey(profile.id)),
      adminGetKV(docsKey(profile.id)),
    ]);

    return NextResponse.json({
      id: profile.id,
      bankName: profile.bank_name || '',
      accountNumber: profile.account_number || '',
      iban: profile.iban || '',
      personalPhone: extras?.value?.personalPhone || '',
      companyPhone: extras?.value?.companyPhone || '',
      cvFileName: docs?.value?.cvFileName || '',
      identityDocs: docs?.value?.identityDocs || [],
      passportFileName: docs?.value?.passportFileName || '',
      // File *data* (base64) is intentionally omitted from the GET response
      // beyond what's needed to show "a document is on file" — the profile
      // page only needs the filenames to render its "Uploaded" state, not
      // the raw bytes, unless/until it actually needs to display or
      // re-download them. Keeps this response small.
    });
  } catch (err: any) {
    console.error('[profile/me GET] error:', err);
    return NextResponse.json({ error: 'Could not load profile.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    const profile = await adminFindProfileByEmail(session.email);
    if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });

    // Change-password path — deliberately handled first and separately from
    // the plain field passthrough below. This replaces
    // employee/profile/page.tsx's old client-side check
    // (`profile.password !== currentPass`), which compared against the
    // plaintext password field returned by the fully-public useProfiles()
    // list — meaning literally anyone fetching hr_profiles anonymously
    // already saw it, current-password check or not. Here the real stored
    // value never leaves the server: verifyPassword handles both a
    // pre-migration plaintext row and a post-migration bcrypt hash (see
    // src/lib/serverAuth.ts), and the new password is always stored hashed.
    if (body.currentPassword !== undefined && body.newPassword !== undefined) {
      const ok = await verifyPassword(body.currentPassword, profile.password);
      if (!ok) {
        return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
      }
      if (typeof body.newPassword !== 'string' || body.newPassword.length < 6) {
        return NextResponse.json({ error: 'New password must be at least 6 characters.' }, { status: 400 });
      }
      const hashed = await hashPassword(body.newPassword);
      await adminUpdateProfile(profile.id, { password: hashed });
      return NextResponse.json({ ok: true });
    }

    const realFields: Record<string, any> = {};
    for (const [clientKey, pbKey] of Object.entries(REAL_FIELD_MAP)) {
      if (body[clientKey] !== undefined) realFields[pbKey] = body[clientKey];
    }
    if (Object.keys(realFields).length > 0) {
      await adminUpdateProfile(profile.id, realFields);
    }

    const extraUpdates: Record<string, any> = {};
    for (const key of KV_EXTRA_KEYS) {
      if (body[key] !== undefined) extraUpdates[key] = body[key];
    }
    if (Object.keys(extraUpdates).length > 0) {
      const existing = (await adminGetKV(extraKey(profile.id)))?.value || {};
      await adminSetKV(extraKey(profile.id), { ...existing, ...extraUpdates });
    }

    const docUpdates: Record<string, any> = {};
    for (const key of KV_DOC_KEYS) {
      if (body[key] !== undefined) docUpdates[key] = body[key];
    }
    if (Object.keys(docUpdates).length > 0) {
      const existing = (await adminGetKV(docsKey(profile.id)))?.value || {};
      await adminSetKV(docsKey(profile.id), { ...existing, ...docUpdates });
    }

    if (body.profilePicture !== undefined) {
      await adminUploadProfilePicture(profile.id, body.profilePicture);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[profile/me PATCH] error:', err);
    return NextResponse.json({ error: 'Could not save changes. Please try again.' }, { status: 500 });
  }
}
