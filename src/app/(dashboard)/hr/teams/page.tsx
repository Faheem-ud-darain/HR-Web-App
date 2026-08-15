'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { hrActions, Profile, Team, useProfiles, useTeams, useWarehouses, displayName, updateEmployeeTeamsAdmin, setTeamLeadAdmin, updateProfileAdmin } from '@/lib/hrData';
import { getSessionEmail } from '@/lib/session';
import { Users, Trash2, Plus, AlertTriangle, CheckCircle2, UserCog, Star, Edit, Trash, Sparkles, Building2, Loader2, CheckSquare, Square } from 'lucide-react';
import { UserProfileModal } from '@/components/ui/UserProfileModal';

export default function HRTeamsPage() {
  const { data: allProfiles = [], refetch: refetchProfiles } = useProfiles();
  const { data: allTeams = [], refetch: refetchTeams } = useTeams();
  const { data: allWarehouses = [], refetch: refetchWarehouses } = useWarehouses();
  
  const employees = allProfiles;
  // hr_teams.members (array of employee emails) is the authoritative
  // membership list now — `teamNames` is just a display/selection helper.
  const teamNames = allTeams.map((t: Team) => t.name);
  const warehouses = allWarehouses;
  const findTeamByName = (name: string) => allTeams.find((t: Team) => t.name === name);
  const teamNamesForEmployee = (email: string) => allTeams.filter((t: Team) => t.members.includes(email)).map((t: Team) => t.name);
  
  const [pageTab, setPageTab] = useState<'teams' | 'warehouses'>('teams');
  const [searchQuery, setSearchQuery] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [creatingTeam, setCreatingTeam] = useState(false);

  // Profile modal states
  const [selectedProfileEmail, setSelectedProfileEmail] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');

  // Warehouse states
  const [whName, setWhName] = useState('');
  const [whLat, setWhLat] = useState('');
  const [whLon, setWhLon] = useState('');
  const [whRadius, setWhRadius] = useState('500');
  const [whSuccess, setWhSuccess] = useState('');

  // Warehouse editing states
  const [editingWhId, setEditingWhId] = useState<string | null>(null);
  const [editingWhName, setEditingWhName] = useState('');
  const [editingWhLat, setEditingWhLat] = useState('');
  const [editingWhLon, setEditingWhLon] = useState('');
  const [editingWhRadius, setEditingWhRadius] = useState('');
  
  // Drag and Drop & Prompt Modal State
  const [draggedEmployee, setDraggedEmployee] = useState<Profile | null>(null);
  const [targetTeam, setTargetTeam] = useState<string | null>(null);
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  // Manage Team Leads Modal State
  const [isTeamLeadOpen, setIsTeamLeadOpen] = useState(false);
  const [leadEmployeeId, setLeadEmployeeId] = useState('');
  const [leadTeamSelections, setLeadTeamSelections] = useState<string[]>([]);
  const [leadSuccess, setLeadSuccess] = useState('');

  // Manage Warehouse Leads Modal State
  const [isWhLeadOpen, setIsWhLeadOpen] = useState(false);
  const [whLeadEmployeeId, setWhLeadEmployeeId] = useState('');
  const [whLeadSelections, setWhLeadSelections] = useState<string[]>([]);
  const [whLeadSuccess, setWhLeadSuccess] = useState('');
  const [cleaningWarehouses, setCleaningWarehouses] = useState(false);
  const [deletingTeamName, setDeletingTeamName] = useState<string | null>(null);
  const [isSavingTeamLead, setIsSavingTeamLead] = useState(false);
  const [isSavingWhLead, setIsSavingWhLead] = useState(false);
  const [isCreatingWh, setIsCreatingWh] = useState(false);
  const [deletingWhId, setDeletingWhId] = useState<string | null>(null);
  const [isSavingWhEdit, setIsSavingWhEdit] = useState(false);

  useEffect(() => {
    const email = getSessionEmail();
    if (email) setCurrentUserEmail(email);

    const handleSearch = (e: Event) => {
      setSearchQuery((e as CustomEvent).detail || '');
    };
    window.addEventListener('globalSearch', handleSearch);
    return () => window.removeEventListener('globalSearch', handleSearch);
  }, []);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setTeamError(null);
    const trimmedName = newTeamName.trim();
    if (!trimmedName) return;

    if (teamNames.some(t => t.toLowerCase() === trimmedName.toLowerCase())) {
      setTeamError(`A team named "${trimmedName}" already exists.`);
      setTimeout(() => setTeamError(null), 3000);
      return;
    }

    setCreatingTeam(true);
    try {
      await hrActions.addTeam(trimmedName);
      await refetchTeams();
      setNewTeamName('');
      setSaveSuccess(`Team "${trimmedName}" created successfully!`);
      setTimeout(() => setSaveSuccess(null), 1500);
    } catch (err) {
      console.error('[Teams] Create team failed:', err);
      setTeamError('Failed to create team. Please try again.');
      setTimeout(() => setTeamError(null), 3000);
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleDeleteTeam = async (teamName: string) => {
    if (deletingTeamName) return;
    const confirmDelete = window.confirm(`Are you sure you want to delete the "${teamName}" team? Members will be removed from this team.`);
    if (!confirmDelete) return;

    setDeletingTeamName(teamName);
    try {
      const team = findTeamByName(teamName);
      if (team) {
        await hrActions.deleteTeam(team.id);
        // Mirror the removal onto each member's profile.teams[] (still used
        // elsewhere in the app, e.g. Tasks page filters by team name).
        await Promise.all(
          employees
            .filter((e: Profile) => e.teams.includes(teamName))
            .map((e: Profile) => updateEmployeeTeamsAdmin(e.id, e.teams.filter(t => t !== teamName)))
        );
      }
      refetchTeams();
      refetchProfiles();
      setSaveSuccess(`Deleted team`);
      setTimeout(() => setSaveSuccess(null), 1500);
    } finally {
      setDeletingTeamName(null);
    }
  };

  const handleDragStart = (emp: Profile) => {
    setDraggedEmployee(emp);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Enable drop target
  };

  // Shared by the desktop drag-and-drop drop zone AND the mobile "Assign to
  // team" select rendered on each employee card. HTML5's native
  // drag-and-drop API (draggable/onDragStart/onDragOver/onDrop) never fires
  // on touch devices at all — a hard browser limitation, not a sizing/CSS
  // issue — so phones need a completely different interaction to reach this
  // same assignment logic.
  const assignEmployeeToTeam = (employee: Profile, teamName: string) => {
    const team = findTeamByName(teamName);
    if (team && team.members.includes(employee.email)) {
      return;
    }

    setDraggedEmployee(employee);
    setTargetTeam(teamName);

    const currentTeamNames = teamNamesForEmployee(employee.email);
    if (currentTeamNames.length > 0) {
      setIsPromptOpen(true);
    } else {
      performAllocation(employee, [teamName]);
    }
  };

  const handleDropOnTeam = (teamName: string) => {
    if (!draggedEmployee) return;
    assignEmployeeToTeam(draggedEmployee, teamName);
  };

  // Writes membership to the authoritative hr_teams.members arrays, then
  // mirrors the resulting team-name list onto profile.teams[] for parts of
  // the app (e.g. Tasks page) that still filter employees by team name.
  const performAllocation = async (employee: Profile, finalTeamNames: string[]) => {
    await Promise.all(
      allTeams.map(async (team: Team) => {
        const isMember = team.members.includes(employee.email);
        const shouldBeMember = finalTeamNames.includes(team.name);
        if (isMember && !shouldBeMember) {
          await hrActions.updateTeamMembers(team.id, team.members.filter(m => m !== employee.email));
        } else if (!isMember && shouldBeMember) {
          await hrActions.updateTeamMembers(team.id, [...team.members, employee.email]);
        }
      })
    );
    await updateEmployeeTeamsAdmin(employee.id, finalTeamNames);
    refetchTeams();
    refetchProfiles();
    setDraggedEmployee(null);
    setTargetTeam(null);
    setIsPromptOpen(false);

    setSaveSuccess('Assignments updated successfully!');
    setTimeout(() => setSaveSuccess(null), 1500);
  };

  const handleConfirmMultiTeam = (mode: 'both' | 'reassign') => {
    if (!draggedEmployee || !targetTeam) return;

    const currentTeamNames = teamNamesForEmployee(draggedEmployee.email);
    if (mode === 'both') {
      const mergedTeams = [...new Set([...currentTeamNames, targetTeam])];
      performAllocation(draggedEmployee, mergedTeams);
    } else {
      performAllocation(draggedEmployee, [targetTeam]);
    }
  };

  const handleToggleTeamLead = async (emp: Profile) => {
    const alreadyLead = emp.isTeamLead && (emp.leadTeams?.length ?? 0) > 0;
    if (alreadyLead) {
      await setTeamLeadAdmin(emp.id, []);
      setSaveSuccess(`${displayName(emp, 'hr')} is no longer a team lead.`);
    } else {
      const leadTeams = emp.teams.length > 0 ? emp.teams : [];
      await setTeamLeadAdmin(emp.id, leadTeams);
      setSaveSuccess(`${displayName(emp, 'hr')} is now Team Lead of: ${leadTeams.join(', ') || '(no teams yet)'}`);
    }
    refetchProfiles();
    setTimeout(() => setSaveSuccess(null), 2000);
  };

  const handleLeadToggle = (teamName: string) => {
    setLeadTeamSelections(prev =>
      prev.includes(teamName) ? prev.filter(t => t !== teamName) : [...prev, teamName]
    );
  };

  const handleSaveTeamLead = async () => {
    if (!leadEmployeeId || isSavingTeamLead) return;
    setIsSavingTeamLead(true);
    try {
      const emp = allProfiles.find(e => e.id === leadEmployeeId);
      await setTeamLeadAdmin(leadEmployeeId, leadTeamSelections);
      // Best-effort mirror onto hr_teams.leadEmail (one lead per team in the
      // real schema): set it for newly-selected teams, clear it for teams
      // this employee previously led but is no longer selected for.
      if (emp) {
        await Promise.all(
          allTeams.map(async (team: Team) => {
            const shouldLead = leadTeamSelections.includes(team.name);
            if (shouldLead && team.leadEmail !== emp.email) {
              await hrActions.updateTeamLead(team.id, emp.email);
            } else if (!shouldLead && team.leadEmail === emp.email) {
              await hrActions.updateTeamLead(team.id, '');
            }
          })
        );
      }
      refetchProfiles();
      refetchTeams();
      setLeadSuccess(`${emp?.fullName} is now team lead of: ${leadTeamSelections.join(', ') || '(none)'}`);
      setTimeout(() => { setIsTeamLeadOpen(false); setLeadSuccess(''); setLeadEmployeeId(''); setLeadTeamSelections([]); }, 1400);
    } finally {
      setIsSavingTeamLead(false);
    }
  };

  const handleWhLeadToggle = (whId: string) => {
    setWhLeadSelections(prev =>
      prev.includes(whId) ? prev.filter(id => id !== whId) : [...prev, whId]
    );
  };

  const handleSaveWhLead = async () => {
    if (!whLeadEmployeeId || isSavingWhLead) return;
    const emp = allProfiles.find(e => e.id === whLeadEmployeeId);
    if (!emp) return;

    setIsSavingWhLead(true);
    try {
      const isNowLead = whLeadSelections.length > 0;
      await updateProfileAdmin(emp.id, {
        isWarehouseLead: isNowLead,
        managedWarehouses: whLeadSelections,
        jobTitle: isNowLead ? 'Warehouse Manager' : emp.jobTitle
      });

      refetchProfiles();
      setWhLeadSuccess(`${displayName(emp, 'hr')} is now Warehouse Manager for: ${
        whLeadSelections.map(id => allWarehouses.find(w => w.id === id)?.name || id).join(', ') || '(none)'
      }`);
      setTimeout(() => {
        setIsWhLeadOpen(false);
        setWhLeadSuccess('');
        setWhLeadEmployeeId('');
        setWhLeadSelections([]);
      }, 1500);
    } finally {
      setIsSavingWhLead(false);
    }
  };

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingWh || !whName.trim() || !whLat || !whLon) return;

    setIsCreatingWh(true);
    try {
      await hrActions.addWarehouse({
        name: whName.trim(),
        latitude: Number(whLat),
        longitude: Number(whLon),
        radius: Number(whRadius)
      });
      refetchWarehouses();
      setWhName('');
      setWhLat('');
      setWhLon('');
      setWhRadius('500');
      setWhSuccess('Warehouse created successfully!');
      setTimeout(() => setWhSuccess(''), 1500);
    } finally {
      setIsCreatingWh(false);
    }
  };

  const handleDeleteWarehouse = async (id: string) => {
    if (deletingWhId) return;
    const confirmDelete = window.confirm('Are you sure you want to delete this warehouse? Assignments will be updated.');
    if (!confirmDelete) return;

    setDeletingWhId(id);
    try {
      await hrActions.deleteWarehouse(id, allProfiles);
      refetchWarehouses();
      refetchProfiles();
      setWhSuccess('Warehouse deleted successfully.');
      setTimeout(() => setWhSuccess(''), 1500);
    } finally {
      setDeletingWhId(null);
    }
  };

  const handleStartEditWarehouse = (wh: any) => {
    setEditingWhId(wh.id);
    setEditingWhName(wh.name);
    setEditingWhLat(wh.latitude.toString());
    setEditingWhLon(wh.longitude.toString());
    setEditingWhRadius(wh.radius.toString());
  };

  const handleUpdateWarehouseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingWhEdit || !editingWhId) return;

    setIsSavingWhEdit(true);
    try {
      await hrActions.updateWarehouse(editingWhId, {
        name: editingWhName.trim(),
        latitude: Number(editingWhLat),
        longitude: Number(editingWhLon),
        radius: Number(editingWhRadius)
      });
      refetchWarehouses();
      setEditingWhId(null);
      setWhSuccess('Warehouse updated successfully.');
      setTimeout(() => setWhSuccess(''), 1500);
    } finally {
      setIsSavingWhEdit(false);
    }
  };

  const handleAssignWarehouse = async (empId: string, whId: string, checked: boolean) => {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;

    let current = emp.assignedWarehouses || [];
    if (checked) {
      current = [...current, whId];
    } else {
      current = current.filter(id => id !== whId);
    }

    await updateProfileAdmin(emp.id, { assignedWarehouses: current });
    refetchProfiles();
    setWhSuccess(`Warehouse assignment updated for ${displayName(emp, 'hr')}`);
    setTimeout(() => setWhSuccess(''), 1500);
  };

  // Strips any warehouse ID on any employee/team that doesn't resolve to a
  // current hr_warehouses record — leftovers from the old KV->collection
  // migration (see fix_warehouse_id_mismatch.py) that couldn't be
  // auto-remapped because no matching warehouse name was found.
  const handleCleanupStaleWarehouses = async () => {
    const liveIds = new Set(warehouses.map(w => w.id));
    const staleProfiles = employees.filter(emp =>
      (emp.assignedWarehouses || []).some(id => !liveIds.has(id)) ||
      (emp.managedWarehouses || []).some(id => !liveIds.has(id))
    );
    const staleTeams = allTeams.filter((t: Team) => t.warehouseId && !liveIds.has(t.warehouseId));

    if (staleProfiles.length === 0 && staleTeams.length === 0) {
      setWhSuccess('No unrecognized warehouse links found — nothing to clean up.');
      setTimeout(() => setWhSuccess(''), 2000);
      return;
    }

    const confirmed = window.confirm(
      `This will remove unrecognized warehouse links from ${staleProfiles.length} employee(s)` +
      (staleTeams.length > 0 ? ` and ${staleTeams.length} team(s)` : '') +
      `. Valid warehouse assignments are left untouched. Continue?`
    );
    if (!confirmed) return;

    setCleaningWarehouses(true);
    try {
      await Promise.all(staleProfiles.map(emp =>
        updateProfileAdmin(emp.id, {
          assignedWarehouses: (emp.assignedWarehouses || []).filter(id => liveIds.has(id)),
          managedWarehouses: (emp.managedWarehouses || []).filter(id => liveIds.has(id)),
        })
      ));
      await Promise.all(staleTeams.map((t: Team) => hrActions.updateTeamWarehouse(t.id, '')));
      refetchProfiles();
      refetchTeams();
      setWhSuccess(`Cleaned up stale warehouse links on ${staleProfiles.length} employee(s)${staleTeams.length > 0 ? ` and ${staleTeams.length} team(s)` : ''}.`);
      setTimeout(() => setWhSuccess(''), 3000);
    } catch (err) {
      console.error('[Teams] Warehouse cleanup failed:', err);
      setWhSuccess('Cleanup failed. Please try again.');
      setTimeout(() => setWhSuccess(''), 3000);
    } finally {
      setCleaningWarehouses(false);
    }
  };

  const handleAssignWarehouseToTeam = async (teamName: string, whId: string) => {
    const team = findTeamByName(teamName);
    const membersOfTeam = employees.filter((emp: Profile) =>
      team ? team.members.includes(emp.email) : emp.teams.includes(teamName)
    );
    await Promise.all(membersOfTeam.map(async (emp: Profile) => {
      const current = emp.assignedWarehouses || [];
      if (!current.includes(whId)) {
        await updateProfileAdmin(emp.id, { assignedWarehouses: [...current, whId] });
      }
    }));
    if (team) await hrActions.updateTeamWarehouse(team.id, whId);
    refetchProfiles();
    refetchTeams();
    setWhSuccess(`Warehouse assigned to all members of team: ${teamName}`);
    setTimeout(() => setWhSuccess(''), 1500);
  };

  const filteredEmployees = employees.filter(emp => {
    return emp.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
           emp.role.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Teams &amp; Warehouses</h1>
          <p className="text-slate-500">Build teams, allocate staff, and configure USA warehouse geofencing.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
          {pageTab === 'teams' ? (
            <button
              onClick={() => setIsTeamLeadOpen(true)}
              className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-4 py-2.5 rounded-xl text-xs active:scale-97 transition-colors transition-transform flex items-center justify-center gap-1.5 shadow-sm"
            >
              <UserCog className="h-4 w-4" /> Manage Team Leads
            </button>
          ) : (
            <button
              onClick={() => setIsWhLeadOpen(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-4 py-2.5 rounded-xl text-xs active:scale-97 transition-colors transition-transform flex items-center justify-center gap-1.5 shadow-sm"
            >
              <UserCog className="h-4 w-4" /> Manage Warehouse Managers
            </button>
          )}
          {saveSuccess && (
            <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 fade-enter shadow-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {saveSuccess}
            </div>
          )}
        </div>
      </div>

      {/* Section tabs — splits what used to be one very long scrolling page
          (team builder + drag-drop allocation + warehouse config + USA
          warehouse assignments) into two focused workflows, matching the
          Queue/History tab pattern already used on the Leaves pages. */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setPageTab('teams')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
            pageTab === 'teams'
              ? 'border-orange-500 text-orange-700 bg-orange-50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="h-4 w-4" /> Teams &amp; Allocation
        </button>
        <button
          onClick={() => setPageTab('warehouses')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
            pageTab === 'warehouses'
              ? 'border-orange-500 text-orange-700 bg-orange-50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="h-4 w-4" /> USA Warehouse Geofencing
        </button>
      </div>

      {pageTab === 'teams' && (
      <>
      {/* Inline Team Builder Form */}
      <Card className="p-4 bg-slate-50/50 border border-slate-200 space-y-3">
        {teamError && (
          <div className="p-2.5 text-xs bg-rose-50 text-rose-600 border border-rose-100 rounded-lg font-semibold flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />{teamError}
          </div>
        )}
        <form onSubmit={handleCreateTeam} className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="flex-1 w-full space-y-1">
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Enter team/department name (e.g. Quality Assurance)"
              className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900"
            />
          </div>
          <button
            type="submit"
            disabled={creatingTeam || !newTeamName.trim()}
            className="w-full sm:w-auto bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {creatingTeam ? 'Creating…' : 'Create Team'}
          </button>
        </form>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Left Panel: Draggable Employees */}
        <div className="lg:col-span-4 space-y-4">
          <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
            <Users className="h-4 w-4 text-orange-600" /> Employee List
          </h3>
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredEmployees.map(emp => (
              <div 
                key={emp.id}
                draggable
                onDragStart={() => handleDragStart(emp)}
                className="cursor-grab select-none hover:shadow-md transition-shadow transition-transform active:scale-97"
              >
                <Card 
                  onClick={() => setSelectedProfileEmail(emp.email)} 
                  className="p-4 bg-white border border-slate-200 hover:border-slate-300 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <div className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                        {displayName(emp, 'hr')}
                        {emp.isTeamLead && (emp.leadTeams?.length ?? 0) > 0 && (
                          <span title={`Lead of: ${emp.leadTeams?.join(', ')}`} className="text-amber-500"><Star className="h-3 w-3 fill-amber-500" /></span>
                        )}
                        {emp.isWarehouseLead && (emp.managedWarehouses?.length ?? 0) > 0 && (
                          <span title="Warehouse Manager" className="text-purple-700 font-bold text-xs flex items-center gap-0.5" style={{ cursor: 'help' }}><Building2 className="h-3 w-3" /> Manager</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-wide font-medium">{emp.jobTitle || emp.role}</div>
                    </div>
                    <button
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); handleToggleTeamLead(emp); }}
                      title={emp.isTeamLead && (emp.leadTeams?.length ?? 0) > 0 ? 'Remove team lead' : 'Make team lead'}
                      className={`flex-shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors transition-transform active:scale-95 ${
                        emp.isTeamLead && (emp.leadTeams?.length ?? 0) > 0
                          ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700'
                          : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700'
                      }`}
                    >
                      <Star className="h-3 w-3" />
                      {emp.isTeamLead && (emp.leadTeams?.length ?? 0) > 0 ? 'Lead' : 'Set Lead'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {emp.teams.length === 0 ? (
                      <span className="text-[10px] text-slate-400">No teams assigned</span>
                    ) : (
                      emp.teams.map(t => (
                        <Badge key={t} variant="default" className="text-[9px] px-1.5 py-0.2">{t}</Badge>
                      ))
                    )}
                  </div>

                  {/* Mobile-only "Assign to team" — native HTML5
                      drag-and-drop never fires on touch devices at all (a
                      hard browser limitation, not a sizing bug), so dragging
                      this card onto a team dropzone silently does nothing on
                      phones. This calls the exact same assignEmployeeToTeam()
                      path the desktop drag-and-drop uses. */}
                  {teamNames.length > 0 && (
                    <select
                      value=""
                      onChange={e => { if (e.target.value) { assignEmployeeToTeam(emp, e.target.value); e.target.value = ''; } }}
                      onClick={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                      className="md:hidden mt-2.5 w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-[10px] font-bold text-slate-700 outline-none focus:border-orange-500"
                    >
                      <option value="">Assign to team…</option>
                      {teamNames.filter(t => !findTeamByName(t)?.members.includes(emp.email)).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  )}
                </Card>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel: Teams Drop Zones Grid */}
        <div className="lg:col-span-8 space-y-4">
          <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">
            Departments / Dropzones
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {allTeams.map((team: Team) => {
              const teamName = team.name;
              const members = employees.filter((e: Profile) => team.members.includes(e.email));
              return (
                <div
                  key={team.id}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDropOnTeam(teamName)}
                  className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 min-h-[160px] flex flex-col transition-colors hover:bg-slate-100/50"
                >
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-bold text-xs text-slate-700 uppercase tracking-wider">{teamName}</span>
                    <div className="flex items-center gap-1.5">
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAssignWarehouseToTeam(teamName, e.target.value);
                            e.target.value = '';
                          }
                        }}
                        className="text-[10px] font-bold bg-white border border-slate-200 rounded-lg px-1.5 py-0.5 text-slate-500 focus:border-orange-500 outline-none max-w-[110px] truncate"
                      >
                        <option value="">+ Assign Wh</option>
                        {warehouses.map(wh => (
                          <option key={wh.id} value={wh.id}>{wh.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleDeleteTeam(teamName)}
                        disabled={deletingTeamName === teamName}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Delete Team"
                      >
                        {deletingTeamName === teamName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 space-y-2">
                    {members.map(member => (
                      <div 
                        key={member.id} 
                        onClick={() => setSelectedProfileEmail(member.email)}
                        className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm text-xs font-semibold text-slate-700 flex justify-between items-center cursor-pointer hover:border-slate-300 transition-colors"
                      >
                        <span>{displayName(member, 'hr')}</span>
                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          {member.isTeamLead && member.leadTeams?.includes(teamName) && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <Star className="h-2.5 w-2.5" /> Lead
                            </span>
                          )}
                          <button
                            onClick={() => {
                              const remain = teamNamesForEmployee(member.email).filter(t => t !== teamName);
                              performAllocation(member, remain);
                            }}
                            className="text-slate-400 hover:text-rose-600 text-[10px] font-bold"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                    {members.length === 0 && (
                      <div className="h-full flex items-center justify-center text-slate-400 text-[10px] font-bold py-6">
                        Drag members here
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </>
      )}

      {/* Team Lead Management Modal */}
      <Modal isOpen={isTeamLeadOpen} onClose={() => setIsTeamLeadOpen(false)} title="Manage Team Leads">
        <div className="space-y-4">
          {leadSuccess && (
            <div className="p-3 text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />{leadSuccess}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Select Employee</label>
            <select
              value={leadEmployeeId}
              onChange={e => {
                setLeadEmployeeId(e.target.value);
                const emp = employees.find(em => em.id === e.target.value);
                setLeadTeamSelections(emp?.leadTeams || []);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900"
            >
              <option value="">— Select employee —</option>
              {employees.filter(e => e.role === 'employee').map(emp => (
                <option key={emp.id} value={emp.id}>
                  {displayName(emp, 'hr')} {emp.isTeamLead ? '(Lead)' : ''} — {emp.teams.join(', ')}
                </option>
              ))}
            </select>
          </div>

          {leadEmployeeId && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Assign as Lead of Teams</label>
              <div className="space-y-2 mt-1">
                {teamNames.map(t => (
                  <label key={t} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={leadTeamSelections.includes(t)}
                      onChange={() => handleLeadToggle(t)}
                      className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                    />
                    <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">{t}</span>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Deselecting all teams removes the Team Lead designation.</p>
            </div>
          )}

          {/* Current Team Leads List */}
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Current Team Leads</p>
            {employees.filter(e => e.isTeamLead && (e.leadTeams?.length ?? 0) > 0).map(emp => (
              <div key={emp.id} className="flex items-center justify-between text-xs bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                <span className="font-semibold text-slate-800 flex items-center gap-1"><Star className="h-3 w-3 text-purple-600" /> {displayName(emp, 'hr')}</span>
                <span className="text-purple-700 font-semibold">{emp.leadTeams?.join(', ')}</span>
              </div>
            ))}
            {employees.filter(e => e.isTeamLead && (e.leadTeams?.length ?? 0) > 0).length === 0 && (
              <p className="text-xs text-slate-400 italic">No team leads assigned yet.</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button onClick={() => setIsTeamLeadOpen(false)} disabled={isSavingTeamLead} className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
            <button onClick={handleSaveTeamLead} disabled={!leadEmployeeId || isSavingTeamLead} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform shadow-sm disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
              {isSavingTeamLead && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isSavingTeamLead ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Warehouse Lead / Manager Management Modal */}
      <Modal isOpen={isWhLeadOpen} onClose={() => setIsWhLeadOpen(false)} title="Manage Warehouse Managers">
        <div className="space-y-4">
          {whLeadSuccess && (
            <div className="p-3 text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />{whLeadSuccess}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Select USA Employee</label>
            <select
              value={whLeadEmployeeId}
              onChange={e => {
                setWhLeadEmployeeId(e.target.value);
                const emp = employees.find(em => em.id === e.target.value);
                setWhLeadSelections(emp?.managedWarehouses || []);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900"
            >
              <option value="">— Select employee —</option>
              {employees.filter(e => e.region === 'USA' && e.role === 'employee').map(emp => (
                <option key={emp.id} value={emp.id}>
                  {displayName(emp, 'hr')} {emp.isWarehouseLead ? '(Manager)' : ''}
                </option>
              ))}
            </select>
          </div>

          {whLeadEmployeeId && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Assign as Manager of Warehouses</label>
              <div className="space-y-2 mt-1">
                {warehouses.map(w => (
                  <label key={w.id} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={whLeadSelections.includes(w.id)}
                      onChange={() => handleWhLeadToggle(w.id)}
                      className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">{w.name}</span>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Deselecting all warehouses removes the Warehouse Manager designation.</p>
            </div>
          )}

          {/* Current Warehouse Managers List */}
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Current Warehouse Managers</p>
            {employees.filter(e => e.isWarehouseLead && (e.managedWarehouses?.length ?? 0) > 0).map(emp => (
              <div key={emp.id} className="flex items-center justify-between text-xs bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                <span className="font-semibold text-slate-800 flex items-center gap-1"><Building2 className="h-3 w-3 text-purple-600" /> {displayName(emp, 'hr')}</span>
                <span className="text-purple-700 font-semibold">
                  {emp.managedWarehouses?.map(id => warehouses.find(w => w.id === id)?.name || id).join(', ')}
                </span>
              </div>
            ))}
            {employees.filter(e => e.isWarehouseLead && (e.managedWarehouses?.length ?? 0) > 0).length === 0 && (
              <p className="text-xs text-slate-400 italic">No warehouse managers assigned yet.</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button onClick={() => setIsWhLeadOpen(false)} disabled={isSavingWhLead} className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
            <button onClick={handleSaveWhLead} disabled={!whLeadEmployeeId || isSavingWhLead} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform shadow-sm disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
              {isSavingWhLead && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isSavingWhLead ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Multi-Team Confirmation Prompt Dialog */}
      <Modal isOpen={isPromptOpen} onClose={() => setIsPromptOpen(false)} title="Conflict Checklist: Multi-Team Assignment">
        <div className="space-y-4">
          <div className="flex gap-3 bg-amber-50 border border-amber-100 p-4 rounded-lg text-amber-900 text-xs font-semibold leading-relaxed">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <div>
              <p className="font-bold text-sm text-amber-950 mb-1">Employee is already assigned to other teams</p>
              <p className="font-medium text-amber-800">
                <strong>{draggedEmployee ? displayName(draggedEmployee, 'hr') : ''}</strong> is currently assigned to: <strong>{draggedEmployee?.teams.join(', ')}</strong>.
              </p>
            </div>
          </div>
          
          <p className="text-xs text-slate-600 leading-relaxed font-semibold">
            Would you like to assign them to <strong>{targetTeam}</strong> as an additional department, or reassign them to <strong>{targetTeam}</strong> exclusively?
          </p>

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-slate-200">
            <button 
              onClick={() => setIsPromptOpen(false)}
              className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-lg text-xs active:scale-97 transition-colors transition-transform order-3 sm:order-1"
            >
              Cancel Drop
            </button>
            <button 
              onClick={() => handleConfirmMultiTeam('reassign')}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold px-4 py-2 rounded-lg text-xs active:scale-97 transition-colors transition-transform order-2 sm:order-2"
            >
              Reassign Exclusively
            </button>
            <button 
              onClick={() => handleConfirmMultiTeam('both')}
              className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-4 py-2 rounded-lg text-xs active:scale-97 transition-colors transition-transform shadow-sm order-1 sm:order-3"
            >
              Add to Both Teams
            </button>
          </div>
        </div>
      </Modal>

      {/* Warehouse Geofence configuration and Employee Assignment section */}
      {pageTab === 'warehouses' && (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Configure logistics warehouses and assign them to USA employees for auto check-in geofencing.</p>
          </div>
          <button
            onClick={handleCleanupStaleWarehouses}
            disabled={cleaningWarehouses}
            title="Remove leftover warehouse IDs from a past migration that no longer match any current warehouse"
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-lg text-xs active:scale-97 transition-colors transition-transform flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5 text-orange-600" /> {cleaningWarehouses ? 'Cleaning up…' : 'Clean Up Stale Warehouse Links'}
          </button>
        </div>

        {whSuccess && (
          <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            {whSuccess}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Configure warehouses list and add form */}
          <div className="lg:col-span-6 space-y-4">
            <Card className="border border-slate-200">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-sm">Add Warehouse Location</h3>
              </div>
              <CardContent className="p-6">
                <form onSubmit={handleCreateWarehouse} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Warehouse Name *</label>
                    <input 
                      type="text" 
                      required
                      value={whName}
                      onChange={e => setWhName(e.target.value)}
                      placeholder="e.g. Seattle Logistics Yard"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs focus:border-orange-500 outline-none text-slate-900"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Latitude *</label>
                      <input 
                        type="number" 
                        step="0.000001"
                        required
                        value={whLat}
                        onChange={e => setWhLat(e.target.value)}
                        placeholder="e.g. 47.6062"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs focus:border-orange-500 outline-none text-slate-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Longitude *</label>
                      <input 
                        type="number" 
                        step="0.000001"
                        required
                        value={whLon}
                        onChange={e => setWhLon(e.target.value)}
                        placeholder="e.g. -122.3321"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs focus:border-orange-500 outline-none text-slate-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Radius (meters) *</label>
                      <input 
                        type="number" 
                        required
                        value={whRadius}
                        onChange={e => setWhRadius(e.target.value)}
                        placeholder="e.g. 500"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs focus:border-orange-500 outline-none text-slate-900"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isCreatingWh}
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 rounded-lg text-xs transition-colors transition-transform shadow-sm active:scale-97 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    {isCreatingWh && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {isCreatingWh ? 'Adding…' : 'Add Warehouse'}
                  </button>
                </form>
              </CardContent>
            </Card>

            <Card className="border border-slate-200">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-sm">Active Warehouses ({warehouses.length})</h3>
              </div>
              <CardContent className="p-4 space-y-2 max-h-60 overflow-y-auto">
                {warehouses.map(wh => (
                  <div key={wh.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex justify-between items-center text-xs">
                    <div>
                      <div className="font-bold text-slate-800">{wh.name}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Coords: {wh.latitude}, {wh.longitude} · Radius: {wh.radius}m</div>
                    </div>
                    <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleStartEditWarehouse(wh)}
                        disabled={deletingWhId === wh.id}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Edit Warehouse"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteWarehouse(wh.id)}
                        disabled={deletingWhId === wh.id}
                        className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Delete Warehouse"
                      >
                        {deletingWhId === wh.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Assign Warehouses to USA Employees */}
          <div className="lg:col-span-6 space-y-4">
            <Card className="border border-slate-200 h-full">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-sm">USA Warehouse Assignments</h3>
              </div>
              <CardContent className="p-6 space-y-4 max-h-[460px] overflow-y-auto">
                {employees.filter(e => e.region === 'USA').map(emp => (
                  <div key={emp.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                    <div className="flex justify-between items-center gap-2 pb-3 border-b border-slate-100">
                      <div className="h-8 w-8 rounded-full bg-orange-50 text-orange-700 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                        {emp.fullName.split(' ').map(w => w[0]).join('').slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 text-sm truncate">{displayName(emp, 'hr')}</div>
                        <div className="text-[10px] text-slate-400 font-semibold truncate">{emp.email} · {emp.jobTitle || 'USA Staff'}</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Assigned Warehouses</p>
                      <div className="grid grid-cols-2 gap-2">
                        {warehouses.map(wh => {
                          const isAssigned = (emp.assignedWarehouses || []).includes(wh.id);
                          return (
                            <button
                              key={wh.id}
                              type="button"
                              onClick={() => handleAssignWarehouse(emp.id, wh.id, !isAssigned)}
                              title={wh.name}
                              className={`flex items-center gap-1.5 text-xs font-semibold p-2 rounded-lg border text-left transition-colors ${
                                isAssigned
                                  ? 'bg-orange-50 border-orange-300 text-orange-800'
                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              {isAssigned ? (
                                <CheckSquare className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                              ) : (
                                <Square className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                              )}
                              <span className="truncate">{wh.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
                {employees.filter(e => e.region === 'USA').length === 0 && (
                  <p className="text-xs text-slate-400 italic text-center py-6">No USA region employees found.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      )}

      {selectedProfileEmail && (
        <UserProfileModal
          isOpen={!!selectedProfileEmail}
          onClose={() => setSelectedProfileEmail(null)}
          employeeEmail={selectedProfileEmail}
          currentUserRole="hr"
          currentUserEmail={currentUserEmail}
          onUpdate={() => {
            refetchProfiles();
          }}
        />
      )}

      {editingWhId && (
        <Modal isOpen onClose={() => setEditingWhId(null)} title="Edit Warehouse Details">
          <form onSubmit={handleUpdateWarehouseSubmit} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Warehouse Name *</label>
              <input 
                type="text" 
                required
                value={editingWhName}
                onChange={e => setEditingWhName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs outline-none focus:border-orange-500 font-semibold"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Latitude *</label>
                <input 
                  type="number" 
                  step="0.000001"
                  required
                  value={editingWhLat}
                  onChange={e => setEditingWhLat(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs outline-none focus:border-orange-500 font-semibold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Longitude *</label>
                <input 
                  type="number" 
                  step="0.000001"
                  required
                  value={editingWhLon}
                  onChange={e => setEditingWhLon(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs outline-none focus:border-orange-500 font-semibold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Radius (m) *</label>
                <input 
                  type="number" 
                  required
                  value={editingWhRadius}
                  onChange={e => setEditingWhRadius(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs outline-none focus:border-orange-500 font-semibold"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button type="button" disabled={isSavingWhEdit} onClick={() => setEditingWhId(null)} className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-4 py-2.5 rounded-xl text-xs active:scale-97 transition-colors transition-transform disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
              <button type="submit" disabled={isSavingWhEdit} className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs active:scale-97 transition-colors transition-transform shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
                {isSavingWhEdit && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isSavingWhEdit ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
