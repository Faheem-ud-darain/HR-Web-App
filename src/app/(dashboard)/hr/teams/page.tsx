'use client';

import React, { useEffect, useState } from 'react';
import { BuildingsIcon as Building2, UserGearIcon as UserCog, UsersIcon as Users, StarIcon as Star } from '@/components/ui/icons';
import { displayName, hrActions, useProfiles, useTeams, useWarehouses } from '@/lib/hrData';
import { isTeamLead, isWarehouseManager } from '@/lib/core/teams';
import { useSessionEmail } from '@/lib/useSession';
import { useFlash } from '@/lib/useFlash';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SuccessNote } from '@/components/ui/SuccessNote';
import { Tabs } from '@/components/ui/Tabs';
import { UserProfileModal } from '@/components/ui/lazy';
import { AssignLeadModal, leadRow } from './_components/AssignLeadModal';
import { EmployeeList } from './_components/EmployeeList';
import { MultiTeamPrompt } from './_components/MultiTeamPrompt';
import { TeamBuilderForm } from './_components/TeamBuilderForm';
import { TeamZones } from './_components/TeamZones';
import { WarehousesTab } from './_components/WarehousesTab';
import { useTeamActions } from './_components/useTeamActions';
import { useWarehouseActions } from './_components/useWarehouseActions';

type PageTab = 'teams' | 'warehouses';

// HR "Teams & Warehouses": build teams and allocate staff (drag and drop, or a select on phones), name team leads,
// and configure the USA warehouses and who works at them. The rules are in lib/core/teams; the writes in
// ./_components/useTeamActions and useWarehouseActions.
export default function HRTeamsPage() {
  const { data: employees = [], isLoading: profilesLoading, refetch: refetchProfiles } = useProfiles();
  const { data: teams = [], isLoading: teamsLoading, refetch: refetchTeams } = useTeams();
  const { data: warehouses = [] } = useWarehouses();
  const currentUserEmail = useSessionEmail() || '';

  const [tab, setTab] = useState<PageTab>('teams');
  const [search, setSearch] = useState('');
  const [leadsOpen, setLeadsOpen] = useState(false);
  const [managersOpen, setManagersOpen] = useState(false);
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const [notice, flash] = useFlash();

  // The top bar's search box filters this page's employee list too.
  useEffect(() => {
    const onSearch = (e: Event) => setSearch((e as CustomEvent).detail || '');
    window.addEventListener('globalSearch', onSearch);
    return () => window.removeEventListener('globalSearch', onSearch);
  }, []);

  const shared = { profiles: employees, teams, refetchTeams, refetchProfiles, flash };
  const team = useTeamActions(shared);
  const wh = useWarehouseActions({ ...shared, warehouses });

  const q = search.toLowerCase();
  const visibleEmployees = employees.filter(e => e.fullName.toLowerCase().includes(q) || e.role.toLowerCase().includes(q));
  const leaders = employees.filter(isTeamLead);
  const managers = employees.filter(isWarehouseManager);
  const warehouseName = (id: string) => warehouses.find(w => w.id === id)?.name || id;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Teams &amp; Warehouses</h1>
          <p className="text-slate-500">Build teams, allocate staff, and configure USA warehouse geofencing.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
          {tab === 'teams'
            ? <Button onClick={() => setLeadsOpen(true)}><UserCog className="h-4 w-4" /> Manage Team Leads</Button>
            : <Button variant="purple" onClick={() => setManagersOpen(true)}><UserCog className="h-4 w-4" /> Manage Warehouse Managers</Button>}
          <SuccessNote className="fade-enter shadow-sm py-1.5 px-3">{notice}</SuccessNote>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'teams', label: 'Teams & Allocation', icon: <Users className="h-4 w-4" /> },
          { value: 'warehouses', label: 'USA Warehouse Geofencing', icon: <Building2 className="h-4 w-4" /> },
        ]}
      />

      {tab === 'teams' ? (
        <>
          <TeamBuilderForm
            teamNames={teams.map(t => t.name)}
            onCreate={async name => { await hrActions.addTeam(name); await refetchTeams(); flash(`Team "${name}" created successfully!`, 1500); }}
          />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <EmployeeList
              employees={visibleEmployees}
              teams={teams}
              loading={profilesLoading}
              onOpenProfile={setProfileEmail}
              onStartDrag={team.startDrag}
              onToggleLead={team.toggleLead}
              onAssign={team.assign}
            />
            <TeamZones
              teams={teams}
              employees={employees}
              warehouses={warehouses}
              loading={teamsLoading}
              deletingName={team.deleting}
              onDrop={team.drop}
              onOpenProfile={setProfileEmail}
              onAssignWarehouse={wh.assignToTeam}
              onRemoveMember={team.removeFromTeam}
              onDelete={team.requestDelete}
            />
          </div>
        </>
      ) : (
        <WarehousesTab employees={employees} warehouses={warehouses} cleaning={wh.cleaning} onCleanup={wh.requestCleanup} onToggleAssignment={wh.toggleAssignment} />
      )}

      <AssignLeadModal
        isOpen={leadsOpen}
        onClose={() => setLeadsOpen(false)}
        title="Manage Team Leads"
        tone="orange"
        employeeLabel="Select Employee"
        candidates={employees.filter(e => e.role === 'employee')}
        optionLabel={e => `${displayName(e, 'hr')} ${e.isTeamLead ? '(Lead)' : ''} — ${e.teams.join(', ')}`}
        currentSelection={e => e.leadTeams || []}
        options={teams.map(t => ({ id: t.name, label: t.name }))}
        selectionLabel="Assign as Lead of Teams"
        hint="Deselecting all teams removes the Team Lead designation."
        currentHeading="Current Team Leads"
        current={leaders.map(e => leadRow(e, e.leadTeams?.join(', ') ?? ''))}
        currentIcon={<Star className="h-3.5 w-3.5 text-purple-600" />}
        emptyText="No team leads assigned yet."
        onSave={team.saveLeads}
      />
      <AssignLeadModal
        isOpen={managersOpen}
        onClose={() => setManagersOpen(false)}
        title="Manage Warehouse Managers"
        tone="purple"
        employeeLabel="Select USA Employee"
        candidates={employees.filter(e => e.region === 'USA' && e.role === 'employee')}
        optionLabel={e => `${displayName(e, 'hr')} ${e.isWarehouseLead ? '(Manager)' : ''}`}
        currentSelection={e => e.managedWarehouses || []}
        options={warehouses.map(w => ({ id: w.id, label: w.name }))}
        selectionLabel="Assign as Manager of Warehouses"
        hint="Deselecting all warehouses removes the Warehouse Manager designation."
        currentHeading="Current Warehouse Managers"
        current={managers.map(e => leadRow(e, (e.managedWarehouses || []).map(warehouseName).join(', ')))}
        currentIcon={<Building2 className="h-3.5 w-3.5 text-purple-600" />}
        emptyText="No warehouse managers assigned yet."
        onSave={wh.saveManager}
      />

      <MultiTeamPrompt isOpen={team.promptOpen} employee={team.dragged} targetTeam={team.target} onChoose={team.chooseMulti} onClose={team.closePrompt} />

      {profileEmail && (
        <UserProfileModal isOpen onClose={() => setProfileEmail(null)} employeeEmail={profileEmail} currentUserRole="hr" currentUserEmail={currentUserEmail} onUpdate={() => { void refetchProfiles(); }} />
      )}

      <ConfirmDialog
        isOpen={team.pendingDelete !== null}
        onClose={team.cancelDelete}
        onConfirm={team.confirmDelete}
        title="Delete team?"
        message={`Are you sure you want to delete the "${team.pendingDelete}" team? Members will be removed from this team.`}
        confirmLabel={team.deleting ? 'Deleting…' : 'Delete'}
        variant="danger"
        loading={!!team.deleting}
      />
      <ConfirmDialog
        isOpen={wh.pendingCleanup !== null}
        onClose={wh.cancelCleanup}
        onConfirm={wh.confirmCleanup}
        title="Clean up stale warehouse links?"
        message={wh.pendingCleanup
          ? `This will remove unrecognized warehouse links from ${wh.pendingCleanup.staleProfiles.length} employee(s)`
            + (wh.pendingCleanup.staleTeams.length > 0 ? ` and ${wh.pendingCleanup.staleTeams.length} team(s)` : '')
            + `. Valid warehouse assignments are left untouched. Continue?`
          : ''}
        confirmLabel={wh.cleaning ? 'Cleaning up…' : 'Clean Up'}
        variant="warning"
        loading={wh.cleaning}
      />
    </div>
  );
}
