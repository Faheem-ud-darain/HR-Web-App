
import type { PbRow } from '@/lib/pbTypes';
import type { Profile } from './hr/types';

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
// The one list of which profile fields live in the documents row and which in the overlay row. The browser side
// (lib/hr/profiles.ts) imports these too, so the two can no longer drift apart.
export const PROFILE_DOC_KEYS: (keyof Profile)[] = ['cvFileName', 'cvFileData', 'identityDocs', 'passportFileName', 'passportFileData'];

export const OVERLAY_KEYS: (keyof Profile)[] = [
  'offboarded', 'offboardDate', 'offboardingStatus', 'lastIncrementProcessedYear',
  'accountCreationDate', 'alias', 'approvalStatus', 'approvalReviewedBy',
  'approvalReviewedAt', 'approvalRejectionReason', 'personalPhone', 'companyPhone',
  'exemptFromAbsenceCheck', 'reservedSalaryBalance', 'manualReservedAmount', 'manualReservedNote',
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

export function fromProfileFields(p: PbRow): PbRow {
  const fields: PbRow = {};
  for (const [key, pbKey] of Object.entries(FIELD_MAP)) {
    if (p[key] !== undefined) {
      // Normalize email to lowercase on write, same as hrData.ts's
      // fromProfileFields — keep these two in sync (see file-header note).
      // Every downstream lookup keyed on employeeEmail assumes lowercase;
      // a mixed-case email slipping through here (this is the server-side
      // path used by the admin addEmployee/updateProfile API routes) is
      // exactly the "some employees still facing the capital-letter email
      // issue" bug class.
      fields[pbKey] = key === 'isTeamLead' ? String(!!p[key]) : key === 'email' ? String(p[key]).toLowerCase() : p[key];
    }
  }
  return fields;
}

export interface SplitProfileUpdate {
  real: PbRow;
  overlay: PbRow;
  docs: PbRow;
  profilePicture?: string;
}

// Same 3-way split as hrActions.updateProfileDetails in hrData.ts.
export function splitProfileUpdate(updates: PbRow): SplitProfileUpdate {
  const overlay: PbRow = {};
  const docs: PbRow = {};
  const real: PbRow = {};
  let profilePicture: string | undefined;
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'profilePicture') { profilePicture = value; continue; }
    if ((PROFILE_DOC_KEYS as string[]).includes(key)) docs[key] = value;
    else if ((OVERLAY_KEYS as string[]).includes(key)) overlay[key] = value;
    else real[key] = value;
  }
  return { real, overlay, docs, profilePicture };
}
