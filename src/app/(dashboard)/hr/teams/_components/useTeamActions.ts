'use client';

import { useState } from 'react';
import { displayName, hrActions, setTeamLeadAdmin, updateEmployeeTeamsAdmin, type Profile, type Team } from '@/lib/hrData';
import { leadChanges, membershipChanges, mergeTeamAssignment, teamNamesFor } from '@/lib/core/teams';

interface Args {
  profiles: Profile[];
  teams: Team[];
  refetchTeams: () => unknown;
  refetchProfiles: () => unknown;
  flash: (message: string, ms?: number) => void;
}

// Everything the Teams tab changes: moving people between teams (drag and drop on desktop, a select on phones),
// removing a team, and making someone a team lead. hr_teams.members is the authoritative membership list; each
// change is mirrored onto profile.teams[], which parts of the app (e.g. the Tasks page) still filter by.
export function useTeamActions({ profiles, teams, refetchTeams, refetchProfiles, flash }: Args) {
  // The person being moved and where to: kept while the "already in other teams" question is open.
  const [dragged, setDragged] = useState<Profile | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const refresh = () => { void refetchTeams(); void refetchProfiles(); };

  // Makes `emp` a member of exactly `names`: writes only the teams that change, then mirrors onto the profile.
  const allocate = async (emp: Profile, names: string[]) => {
    await Promise.all(membershipChanges(teams, emp.email, names).map(c => hrActions.updateTeamMembers(c.id, c.members)));
    await updateEmployeeTeamsAdmin(emp.id, names);
    refresh();
    setDragged(null);
    setTarget(null);
    setPromptOpen(false);
    flash('Assignments updated successfully!', 1500);
  };

  // One path for both ways of moving someone: dropping a card on a team (desktop) and the select on the card
  // (phones, where HTML5 drag and drop never fires).
  const assign = (emp: Profile, teamName: string) => {
    if (teams.find(t => t.name === teamName)?.members.includes(emp.email)) return;
    setDragged(emp);
    setTarget(teamName);
    if (teamNamesFor(teams, emp.email).length > 0) setPromptOpen(true);
    else void allocate(emp, [teamName]);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const name = pendingDelete;
    setPendingDelete(null);
    setDeleting(name);
    try {
      const team = teams.find(t => t.name === name);
      if (team) {
        await hrActions.deleteTeam(team.id);
        await Promise.all(profiles.filter(p => p.teams.includes(name)).map(p => updateEmployeeTeamsAdmin(p.id, p.teams.filter(t => t !== name))));
      }
      refresh();
      flash(`Deleted team "${name}"`, 1500);
    } finally {
      setDeleting(null);
    }
  };

  // Quick toggle on an employee card: lead of all their current teams, or no longer a lead.
  const toggleLead = async (emp: Profile) => {
    const wasLead = !!emp.isTeamLead && (emp.leadTeams?.length ?? 0) > 0;
    await setTeamLeadAdmin(emp.id, wasLead ? [] : emp.teams);
    void refetchProfiles();
    flash(wasLead ? `${displayName(emp, 'hr')} is no longer a team lead.` : `${displayName(emp, 'hr')} is now Team Lead of: ${emp.teams.join(', ') || '(no teams yet)'}`);
  };

  // The "Manage Team Leads" dialog: set the person's lead teams, then mirror onto each team's leadEmail.
  const saveLeads = async (emp: Profile, selection: string[]): Promise<string> => {
    await setTeamLeadAdmin(emp.id, selection);
    await Promise.all(leadChanges(teams, emp.email, selection).map(c => hrActions.updateTeamLead(c.id, c.leadEmail)));
    refresh();
    return `${emp.fullName} is now team lead of: ${selection.join(', ') || '(none)'}`;
  };

  return {
    dragged, target, promptOpen, pendingDelete, deleting,
    startDrag: setDragged, assign, allocate, toggleLead, saveLeads, confirmDelete,
    drop: (teamName: string) => { if (dragged) assign(dragged, teamName); },
    chooseMulti: (mode: 'both' | 'reassign') => {
      if (dragged && target) void allocate(dragged, mergeTeamAssignment(teamNamesFor(teams, dragged.email), target, mode));
    },
    removeFromTeam: (emp: Profile, teamName: string) => allocate(emp, teamNamesFor(teams, emp.email).filter(t => t !== teamName)),
    closePrompt: () => setPromptOpen(false),
    requestDelete: (name: string) => { if (!deleting) setPendingDelete(name); },
    cancelDelete: () => setPendingDelete(null),
  };
}
