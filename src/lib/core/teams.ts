import type { Profile, Team } from '../hr/types';

// The rules behind the HR Teams page (team membership, leads, warehouse links). Pure, so they can be tested; the page
// only applies the changes these return.

type LeadFields = Pick<Profile, 'isTeamLead' | 'leadTeams'>;
type ManagerFields = Pick<Profile, 'isWarehouseLead' | 'managedWarehouses'>;

// A person counts as a team lead only while they actually lead at least one team.
export const isTeamLead = (p: LeadFields): boolean => !!p.isTeamLead && (p.leadTeams?.length ?? 0) > 0;
export const isWarehouseManager = (p: ManagerFields): boolean => !!p.isWarehouseLead && (p.managedWarehouses?.length ?? 0) > 0;

export const toggleInList = <T,>(list: T[], item: T): T[] => (list.includes(item) ? list.filter(x => x !== item) : [...list, item]);

// hr_teams.members is the authoritative membership list.
export const teamNamesFor = (teams: Team[], email: string): string[] => teams.filter(t => t.members.includes(email)).map(t => t.name);

// The people in a team; when the team record is missing, fall back to the team names on their profiles.
export const membersOfTeam = (profiles: Profile[], team: Team | undefined, teamName: string): Profile[] =>
  profiles.filter(p => (team ? team.members.includes(p.email) : p.teams.includes(teamName)));

// Moving someone who is already in other teams: keep those teams too, or make the new one their only team.
export const mergeTeamAssignment = (current: string[], target: string, mode: 'both' | 'reassign'): string[] =>
  mode === 'both' ? [...new Set([...current, target])] : [target];

// The membership writes that make `email` a member of exactly `finalNames`: one entry per team that changes.
export function membershipChanges(teams: Team[], email: string, finalNames: string[]): { id: string; members: string[] }[] {
  const changes: { id: string; members: string[] }[] = [];
  for (const team of teams) {
    const isMember = team.members.includes(email);
    const shouldBe = finalNames.includes(team.name);
    if (isMember && !shouldBe) changes.push({ id: team.id, members: team.members.filter(m => m !== email) });
    else if (!isMember && shouldBe) changes.push({ id: team.id, members: [...team.members, email] });
  }
  return changes;
}

// Each team has one lead (hr_teams.leadEmail): set it on the teams this person is now selected for, and clear it on
// the teams they led before but no longer do.
export function leadChanges(teams: Team[], email: string, selectedNames: string[]): { id: string; leadEmail: string }[] {
  const changes: { id: string; leadEmail: string }[] = [];
  for (const team of teams) {
    const shouldLead = selectedNames.includes(team.name);
    if (shouldLead && team.leadEmail !== email) changes.push({ id: team.id, leadEmail: email });
    else if (!shouldLead && team.leadEmail === email) changes.push({ id: team.id, leadEmail: '' });
  }
  return changes;
}

// Warehouse ids on people and teams that match no current warehouse (left over from the old key-value migration).
export function findStaleWarehouseLinks(profiles: Profile[], teams: Team[], liveIds: ReadonlySet<string>) {
  const stale = (ids?: string[]) => (ids || []).some(id => !liveIds.has(id));
  return {
    staleProfiles: profiles.filter(p => stale(p.assignedWarehouses) || stale(p.managedWarehouses)),
    staleTeams: teams.filter(t => t.warehouseId && !liveIds.has(t.warehouseId)),
  };
}
