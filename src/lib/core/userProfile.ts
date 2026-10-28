import type { Profile } from '../hr/types';

// Rules and form seeds behind the employee profile card (view, edit and offboarding). Pure, so they can be tested.

// Detects the `pbkdf2$<iterations>$<salt>$<hash>` format hashPassword() writes (see serverAuth.ts). Re-implemented here
// because serverAuth.ts is server-only and must never be imported from client code.
export const isHashedPassword = (value: string | undefined | null): boolean =>
  typeof value === 'string' && /^pbkdf2\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(value);

export type ViewerRole = 'admin' | 'hr' | 'employee' | 'team_lead';
type TeamFields = Pick<Profile, 'teams' | 'leadTeams'>;

// Who may open a profile, and who may change it. Admin can manage HR and below; HR can manage employees (not other HR
// or Admin). Everyone else sees only their own team and their team leads.
export function profileAccess(viewerRole: ViewerRole, profile: Pick<Profile, 'role' | 'teams' | 'leadTeams' | 'isTeamLead'>, viewer: TeamFields | null | undefined) {
  const privileged = viewerRole === 'admin' || viewerRole === 'hr';
  const viewerTeams = viewer?.teams ?? [];
  const viewingTheirLead = !!profile.isTeamLead && !!profile.leadTeams?.some(t => viewerTeams.includes(t));
  const leadViewingMember = viewerRole === 'team_lead' && profile.teams.some(t => viewer?.leadTeams?.includes(t));
  const sameTeam = profile.teams.some(t => viewerTeams.includes(t));
  return {
    hasAccess: privileged || viewingTheirLead || leadViewingMember || sameTeam,
    canManage: viewerRole === 'admin' || (viewerRole === 'hr' && profile.role !== 'admin' && profile.role !== 'hr'),
  };
}

export interface EditForm {
  fullName: string; email: string; password: string; jobTitle: string; baseSalary: string;
  region: 'USA' | 'Pakistan'; gender: 'male' | 'female'; role: Profile['role'];
  joinedDate: string; salaryStartDate: string; accountCreationDate: string; alias: string; assignedWarehouses: string[];
}

// The edit form's starting values. The password starts blank: a stored pbkdf2 hash must never be shown, and a blank
// password means "do not change it" all the way to the server.
export function editFormFrom(p: Profile, today: string): EditForm {
  const joined = p.joinedDate || today;
  return {
    fullName: p.fullName, email: p.email,
    password: isHashedPassword(p.password) ? '' : p.password || '',
    jobTitle: p.jobTitle || 'Staff', baseSalary: p.baseSalary.toString(),
    region: p.region || 'Pakistan', gender: p.gender || 'male', role: p.role,
    joinedDate: joined, salaryStartDate: p.salaryStartDate || joined, accountCreationDate: p.accountCreationDate || joined,
    alias: p.alias || '', assignedWarehouses: p.assignedWarehouses || [],
  };
}

export interface OffboardForm { itClearance: boolean; financeClearance: boolean; hrClearance: boolean; companyNumberReturned: boolean; notes: string }

export const offboardFormFrom = (p: Profile): OffboardForm => ({
  itClearance: !!p.offboardingStatus?.itClearance,
  financeClearance: !!p.offboardingStatus?.financeClearance,
  hrClearance: !!p.offboardingStatus?.hrClearance,
  companyNumberReturned: !!p.offboardingStatus?.companyNumberReturned,
  notes: p.offboardingStatus?.notes || '',
});

// A company-allocated number is company property: when one is on file it must be confirmed returned before
// offboarding can go ahead. With none on file there is nothing to return.
export const companyNumberBlocksOffboard = (p: Pick<Profile, 'companyPhone'>, form: Pick<OffboardForm, 'companyNumberReturned'>): boolean =>
  !!p.companyPhone && !form.companyNumberReturned;

// "$1,200.50" or "1200.5" -> 1200.5; anything unreadable -> 0.
export const parseReserveAmount = (input: string): number => Number(input.replace(/[^0-9.-]/g, '')) || 0;
