'use client';

import React, { useState } from 'react';
import { TaskBoard } from '@/components/ui/TaskBoard';
import { TaskModal } from '@/components/ui/TaskModal';
import { Modal } from '@/components/ui/Modal';
import { ClipboardList, Star, CheckCircle2, UserCog, Loader2 } from 'lucide-react';
import { useTasks, useProfiles, useTeams, hrActions, displayName, setTeamLeadAdmin } from '@/lib/hrData';

export default function AdminTasksPage() {
  const { data: tasks = [], refetch: refetchTasks } = useTasks();
  const { data: employees = [], refetch: refetchProfiles } = useProfiles();
  const { data: teams = [] } = useTeams();
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [isLeadOpen, setIsLeadOpen] = useState(false);

  // Team Lead modal state
  const [leadEmpId, setLeadEmpId] = useState('');
  const [leadTeams, setLeadTeams] = useState<string[]>([]);
  const [leadSuccess, setLeadSuccess] = useState('');
  const [isSavingLead, setIsSavingLead] = useState(false);

  const handleSaveLead = async () => {
    if (!leadEmpId || isSavingLead) return;
    setIsSavingLead(true);
    try {
      await setTeamLeadAdmin(leadEmpId, leadTeams);
      refetchProfiles();
      const emp = employees.find(e => e.id === leadEmpId);
      setLeadSuccess(`${emp ? displayName(emp, 'admin') : ''} — team lead updated!`);
      setTimeout(() => { setIsLeadOpen(false); setLeadSuccess(''); setLeadEmpId(''); setLeadTeams([]); }, 1300);
    } finally {
      setIsSavingLead(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Task Overview</h1>
          <p className="text-slate-500">Assign and monitor tasks across all departments and teams.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setIsLeadOpen(true)}
            className="bg-white hover:bg-amber-50 border border-amber-200 text-amber-700 font-semibold px-4 py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform flex items-center gap-1.5"
          >
            <Star className="h-4 w-4" /> Manage Team Leads
          </button>
          <button
            onClick={() => setIsTaskOpen(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-4 py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform flex items-center gap-1.5 shadow-sm"
          >
            <ClipboardList className="h-4 w-4" /> Assign New Task
          </button>
        </div>
      </div>

      <TaskBoard
        tasks={tasks}
        onUpdate={() => refetchTasks()}
        canDelete={true}
        readOnly={false}
      />

      <TaskModal
        isOpen={isTaskOpen}
        onClose={() => setIsTaskOpen(false)}
        employees={employees.filter(e => e.role === 'employee' || e.isTeamLead)}
        createdBy="admin"
        onTaskAdded={() => refetchTasks()}
      />

      {/* Team Lead Management Modal */}
      <Modal isOpen={isLeadOpen} onClose={() => setIsLeadOpen(false)} title="Manage Team Leads">
        <div className="space-y-4">
          {leadSuccess && (
            <div className="p-3 text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />{leadSuccess}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Select Employee</label>
            <select
              value={leadEmpId}
              onChange={e => {
                setLeadEmpId(e.target.value);
                const emp = employees.find(em => em.id === e.target.value);
                setLeadTeams(emp?.leadTeams || []);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900"
            >
              <option value="">— Select employee —</option>
              {employees.filter(e => e.role === 'employee').map(emp => (
                <option key={emp.id} value={emp.id}>
                  {displayName(emp, 'admin')} {emp.isTeamLead ? '(Lead)' : ''} — {emp.teams.join(', ') || 'No team'}
                </option>
              ))}
            </select>
          </div>

          {leadEmpId && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Lead of Teams</label>
              {teams.map(t => (
                <label key={t.id} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={leadTeams.includes(t.name)}
                    onChange={() => setLeadTeams(prev => prev.includes(t.name) ? prev.filter(x => x !== t.name) : [...prev, t.name])}
                    className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                  />
                  <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">{t.name}</span>
                </label>
              ))}
            </div>
          )}

          {/* Current leads list */}
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Current Team Leads</p>
            {employees.filter(e => e.isTeamLead && (e.leadTeams?.length ?? 0) > 0).map(emp => (
              <div key={emp.id} className="flex items-center justify-between text-xs bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <span className="font-semibold text-slate-800 flex items-center gap-1"><Star className="h-3 w-3 text-amber-500" /> {displayName(emp, 'admin')}</span>
                <span className="text-amber-700 font-semibold">{emp.leadTeams?.join(', ')}</span>
              </div>
            ))}
            {employees.filter(e => e.isTeamLead && (e.leadTeams?.length ?? 0) > 0).length === 0 && (
              <p className="text-xs text-slate-400 italic">No team leads assigned yet.</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button onClick={() => setIsLeadOpen(false)} disabled={isSavingLead} className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
            <button onClick={handleSaveLead} disabled={!leadEmpId || isSavingLead} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform shadow-sm disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
              {isSavingLead && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isSavingLead ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
