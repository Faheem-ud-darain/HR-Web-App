// Allow-list for what an employee may change on their OWN profile through
// PATCH /api/profile/me. Pure (no PocketBase / Next imports) so it can be tested.
//
// Everything HR-controlled (role, salary, region, approval decision, offboarding, tracking and
// absence exemptions, reserved balances, ...) is deliberately NOT on the list; those go through the
// HR/Admin-gated /api/admin/profile route.

export const SELF_EDITABLE_KEYS = [
  'bankName', 'accountNumber', 'iban',
  'personalPhone', 'companyPhone',
  'cvFileName', 'cvFileData', 'identityDocs', 'passportFileName', 'passportFileData',
  'profilePicture',
  // Onboarding submission (see OnboardingFlow / the resubmit button in (dashboard)/layout.tsx).
  'onboardingCompleted', 'approvalStatus',
  // Password change (handled first by the route).
  'currentPassword', 'newPassword',
] as const;

// Named so the error can say "you may not change this" (403) rather than "unknown field" (400).
export const HR_CONTROLLED_KEYS = [
  'approvalStatus', 'approvalReviewedBy', 'approvalReviewedAt', 'approvalRejectionReason',
  'role', 'baseSalary', 'salaryStartDate', 'region', 'joinedDate', 'fullName', 'email', 'password',
  'teams', 'isTeamLead', 'leadTeams', 'isWarehouseLead', 'managedWarehouses', 'assignedWarehouses',
  'jobTitle', 'gender', 'alias', 'accountCreationDate', 'lastIncrementProcessedYear', 'mustChangePassword',
  'reservedSalaryBalance', 'manualReservedAmount', 'manualReservedNote',
  'offboarded', 'offboardDate', 'offboardingStatus',
  'exemptFromAbsenceCheck', 'trackingEnabled', 'id',
] as const;

export type SelfPatchResult =
  | { ok: true; fields: Record<string, unknown>; submitsOnboarding: boolean }
  | { ok: false; status: 400 | 403; error: string; fields: string[] };

export function classifySelfProfilePatch(body: unknown): SelfPatchResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, error: 'Invalid request body.', fields: [] };
  }
  const input = body as Record<string, unknown>;
  const allowed = new Set<string>(SELF_EDITABLE_KEYS);
  const fields: Record<string, unknown> = {};
  const forbidden: string[] = [];
  const unknown: string[] = [];
  let submitsOnboarding = false;

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (key === 'approvalStatus') {
      // The only approval change an employee may make is submitting their onboarding for review.
      // The stored value is always 'pending', never taken from the body beyond that request.
      if (value === 'pending') { submitsOnboarding = true; continue; }
      forbidden.push(key);
      continue;
    }
    if (allowed.has(key)) { fields[key] = value; continue; }
    if ((HR_CONTROLLED_KEYS as readonly string[]).includes(key)) forbidden.push(key);
    else unknown.push(key);
  }

  // Completing onboarding always puts the profile into review: without a status the dashboard treats
  // the profile as "grandfathered in" and unlocks it.
  if (fields.onboardingCompleted === true) submitsOnboarding = true;
  if (fields.onboardingCompleted !== undefined && typeof fields.onboardingCompleted !== 'boolean') {
    return { ok: false, status: 400, error: 'onboardingCompleted must be true or false.', fields: ['onboardingCompleted'] };
  }

  if (forbidden.length > 0) {
    return { ok: false, status: 403, error: `You cannot change these fields yourself: ${forbidden.join(', ')}. Ask HR or Admin.`, fields: forbidden };
  }
  if (unknown.length > 0) {
    return { ok: false, status: 400, error: `Unknown field(s): ${unknown.join(', ')}.`, fields: unknown };
  }
  return { ok: true, fields, submitsOnboarding };
}
