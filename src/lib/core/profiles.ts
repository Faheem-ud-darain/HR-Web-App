// Profile mapping + per-viewer scoping, shared by the browser and the Edge
// routes (plain TypeScript, no I/O).
//
// hr_profiles holds salary, bank details and password hashes next to ordinary
// directory data, and the browser used to download ALL of it for EVERYONE.
// The /api/roster route now builds the list on the server and runs every
// profile through scopeProfileForViewer, so each person only receives what
// they're entitled to:
//   - nobody ever receives a password hash, not even HR/Admin;
//   - HR/Admin receive everything else (they manage these records);
//   - everyone else receives their OWN record in full, and only the public
//     directory fields of colleagues (name, role, team, job title, photo...).
import type { Profile } from '../hr/types';
import type { PbRow } from '@/lib/pbTypes';

/** The fields any signed-in person may see about a colleague. */
export const PUBLIC_PROFILE_KEYS = [
  'id', 'fullName', 'email', 'role', 'joinedDate', 'onboardingCompleted',
  'teams', 'isTeamLead', 'leadTeams', 'isWarehouseLead', 'managedWarehouses',
  'jobTitle', 'gender', 'profilePicture', 'region', 'assignedWarehouses',
  'trackingEnabled', 'alias',
] as const satisfies readonly (keyof Profile)[];

export interface ProfileViewer {
  email: string;
  role: string;
}

export const isStaffRole = (role: string | null | undefined): boolean => role === 'hr' || role === 'admin';

/** Raw hr_profiles record (+ its overlay extras) -> Profile. `pictureUrl` is the resolved photo URL. */
export function mapProfileRecord(p: PbRow, extras: Partial<Profile> = {}, pictureUrl?: string): Profile {
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
    profilePicture: pictureUrl || p.profile_picture || undefined,
    region: p.region,
    assignedWarehouses: p.assigned_warehouses || [],
    trackingEnabled: !!p.tracking_enabled,
    salaryStartDate: p.salary_start_date || p.joined_date || '',
    ...extras,
  };
}

/** The profile as `viewer` is allowed to see it (see the module comment). */
export function scopeProfileForViewer(profile: Profile, viewer: ProfileViewer): Profile {
  // Never ship a password hash to any browser.
  const { password: _password, ...rest } = profile;
  void _password;
  const isSelf = !!viewer.email && rest.email?.toLowerCase() === viewer.email.toLowerCase();
  if (isStaffRole(viewer.role) || isSelf) return rest;

  const publicView: Record<string, unknown> = {};
  for (const key of PUBLIC_PROFILE_KEYS) {
    if (rest[key] !== undefined) publicView[key] = rest[key];
  }
  // Required Profile fields that aren't public are present but empty, so
  // consumers that expect the shape never trip over `undefined`.
  return { baseSalary: 0, teams: [], ...publicView } as unknown as Profile;
}
