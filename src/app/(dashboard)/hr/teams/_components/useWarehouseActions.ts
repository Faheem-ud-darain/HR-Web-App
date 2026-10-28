'use client';

import { useState } from 'react';
import { displayName, hrActions, updateProfileAdmin, type Profile, type Team, type Warehouse } from '@/lib/hrData';
import { findStaleWarehouseLinks, membersOfTeam, toggleInList } from '@/lib/core/teams';

interface Args {
  profiles: Profile[];
  teams: Team[];
  warehouses: Warehouse[];
  refetchTeams: () => unknown;
  refetchProfiles: () => unknown;
  flash: (message: string, ms?: number) => void;
}

// Everything that links warehouses to people and teams: assigning a warehouse to an employee or a whole team, naming
// warehouse managers, and the clean-up of links to warehouses that no longer exist.
export function useWarehouseActions({ profiles, teams, warehouses, refetchTeams, refetchProfiles, flash }: Args) {
  const [pendingCleanup, setPendingCleanup] = useState<ReturnType<typeof findStaleWarehouseLinks> | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const liveIds = () => new Set(warehouses.map(w => w.id));

  const toggleAssignment = async (emp: Profile, whId: string) => {
    await updateProfileAdmin(emp.id, { assignedWarehouses: toggleInList(emp.assignedWarehouses || [], whId) });
    void refetchProfiles();
    flash(`Warehouse assignment updated for ${displayName(emp, 'hr')}`, 1500);
  };

  const assignToTeam = async (teamName: string, whId: string) => {
    const team = teams.find(t => t.name === teamName);
    await Promise.all(membersOfTeam(profiles, team, teamName).map(async emp => {
      const current = emp.assignedWarehouses || [];
      if (!current.includes(whId)) await updateProfileAdmin(emp.id, { assignedWarehouses: [...current, whId] });
    }));
    if (team) await hrActions.updateTeamWarehouse(team.id, whId);
    void refetchProfiles();
    void refetchTeams();
    flash(`Warehouse assigned to all members of team: ${teamName}`, 1500);
  };

  // The "Manage Warehouse Managers" dialog: naming no warehouses removes the manager role.
  const saveManager = async (emp: Profile, selection: string[]): Promise<string> => {
    const isManager = selection.length > 0;
    await updateProfileAdmin(emp.id, { isWarehouseLead: isManager, managedWarehouses: selection, jobTitle: isManager ? 'Warehouse Manager' : emp.jobTitle });
    void refetchProfiles();
    return `${displayName(emp, 'hr')} is now Warehouse Manager for: ${selection.map(id => warehouses.find(w => w.id === id)?.name || id).join(', ') || '(none)'}`;
  };

  const requestCleanup = () => {
    const stale = findStaleWarehouseLinks(profiles, teams, liveIds());
    if (stale.staleProfiles.length === 0 && stale.staleTeams.length === 0) flash('No unrecognized warehouse links found — nothing to clean up.');
    else setPendingCleanup(stale);
  };

  const confirmCleanup = async () => {
    if (!pendingCleanup) return;
    const { staleProfiles, staleTeams } = pendingCleanup;
    const live = liveIds();
    setPendingCleanup(null);
    setCleaning(true);
    try {
      await Promise.all(staleProfiles.map(p => updateProfileAdmin(p.id, {
        assignedWarehouses: (p.assignedWarehouses || []).filter(id => live.has(id)),
        managedWarehouses: (p.managedWarehouses || []).filter(id => live.has(id)),
      })));
      await Promise.all(staleTeams.map(t => hrActions.updateTeamWarehouse(t.id, '')));
      void refetchProfiles();
      void refetchTeams();
      flash(`Cleaned up stale warehouse links on ${staleProfiles.length} employee(s)${staleTeams.length > 0 ? ` and ${staleTeams.length} team(s)` : ''}.`, 3000);
    } catch (err) {
      console.error('[Teams] Warehouse cleanup failed:', err);
      flash('Cleanup failed. Please try again.', 3000);
    } finally {
      setCleaning(false);
    }
  };

  return { toggleAssignment, assignToTeam, saveManager, requestCleanup, confirmCleanup, cancelCleanup: () => setPendingCleanup(null), pendingCleanup, cleaning };
}
