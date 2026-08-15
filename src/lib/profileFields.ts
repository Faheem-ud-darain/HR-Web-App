// Shared field-routing logic for hr_profiles writes, split out of
// hrData.ts so the new admin-gated server route
// (src/app/api/admin/profile/route.ts) can classify an update payload into
// "real hr_profiles column" / "hr_profile_extra_ KV overlay" /
// "hr_profile_docs_ KV overlay" the exact same way
// hrActions.updateProfileDetails already does client-side, without pulling
// hrData.ts's client-only imports (React, react-query, the browser `pb`
// instance) into the Edge runtime bundle. Uses loose `Record<string, any>`
// typing rather than the real `Profile` interface (which lives in
// hrData.ts) to avoid a circular import between the two files — this is
// purely field-routing plumbing, not business logic that benefits from
// strict typing here.
//
// IMPORTANT: keep this in sync with hrData.ts's fromProfileFields/
// PROFILE_DOC_KEYS/OVERLAY_KEYS if either ever changes — there's
// deliberately no automatic way to enforce that (the alternative, hrData.ts
// importing this file, is the right long-term fix but is a larger change
// than this pass; flagged as a known follow-up rather than silently risking
// drift going unnoticed).
export const PROFILE_DOC_KEYS = ['cvFileName', 'cvFileData', 'identityDocs', 'passportFileName', 'passportFileData'];

export const OVERLAY_KEYS = [
  'offboarded', 'offboardDate', 'offboardingStatus', 'lastIncrementProcessedYear',
  'accountCreationDate', 'alias', 'approvalStatus', 'approvalReviewedBy',
  'approvalReviewedAt', 'approvalRejectionReason', 'personalPhone', 'companyPhone',
  'exemptFromAbsenceCheck',
];

const FIELD_MAP: Record<string, string> = {
  fullName: 'full_name',
  email: 'email',
  role: 'role',
  joinedDate: 'joined_date',
  onboardingCompleted: 'onboarding_completed',
  baseSalary: 'base_salary',
  teams: 'teams',
  password: 'password',
  isTeamLead: 'is_team_lead',
  leadTeams: 'lead_teams',
  isWarehouseLead: 'is_warehouse_lead',
  managedWarehouses: 'managed_warehouses',
  jobTitle: 'job_title',
  gender: 'gender',
  bankName: 'bank_name',
  accountNumber: 'account_number',
  iban: 'iban',
  region: 'region',
  assignedWarehouses: 'assigned_warehouses',
  trackingEnabled: 'tracking_enabled',
  salaryStartDate: 'salary_start_date',
};

export function fromProfileFields(p: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [key, pbKey] of Object.entries(FIELD_MAP)) {
    if (p[key] !== undefined) {
      fields[pbKey] = key === 'isTeamLead' ? String(!!p[key]) : p[key];
    }
  }
  return fields;
}

export interface SplitProfileUpdate {
  real: Record<string, any>;
  overlay: Record<string, any>;
  docs: Record<string, any>;
  profilePicture?: string;
}

// Same 3-way split as hrActions.updateProfileDetails in hrData.ts.
export function splitProfileUpdate(updates: Record<string, any>): SplitProfileUpdate {
  const overlay: Record<string, any> = {};
  const docs: Record<string, any> = {};
  const real: Record<string, any> = {};
  let profilePicture: string | undefined;
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'profilePicture') { profilePicture = value; continue; }
    if (PROFILE_DOC_KEYS.includes(key)) docs[key] = value;
    else if (OVERLAY_KEYS.includes(key)) overlay[key] = value;
    else real[key] = value;
  }
  return { real, overlay, docs, profilePicture };
}
