'use client';

import React from 'react';
import { BuildingsIcon as Building2, StarIcon as Star, UsersIcon as Users } from '@phosphor-icons/react/dist/ssr';
import { displayName, type Profile, type Team } from '@/lib/hrData';
import { isTeamLead, isWarehouseManager } from '@/lib/core/teams';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { ListSkeleton } from '@/components/ui/Skeleton';

interface EmployeeListProps {
  employees: Profile[];
  teams: Team[];
  loading: boolean;
  onOpenProfile: (email: string) => void;
  onStartDrag: (emp: Profile) => void;
  onToggleLead: (emp: Profile) => void;
  onAssign: (emp: Profile, teamName: string) => void;
}

function EmployeeCard({ emp, teams, onOpenProfile, onStartDrag, onToggleLead, onAssign }: Omit<EmployeeListProps, 'employees' | 'loading'> & { emp: Profile }) {
  const lead = isTeamLead(emp);
  // Teams this person is not in yet: what the phone "Assign to team" select offers.
  const joinable = teams.filter(t => !t.members.includes(emp.email));
  return (
    <div draggable onDragStart={() => onStartDrag(emp)} className="cursor-grab select-none hover:shadow-md transition-shadow transition-transform active:scale-97">
      <Card onClick={() => onOpenProfile(emp.email)} className="p-4 bg-white border border-slate-200 hover:border-slate-300 cursor-pointer">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div>
            <div className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
              {displayName(emp, 'hr')}
              {lead && <span title={`Lead of: ${emp.leadTeams?.join(', ')}`} className="text-amber-500"><Star weight="fill" className="h-3.5 w-3.5" /></span>}
              {isWarehouseManager(emp) && (
                <span title="Warehouse Manager" className="text-purple-700 font-bold text-xs flex items-center gap-0.5 cursor-help"><Building2 className="h-3.5 w-3.5" /> Manager</span>
              )}
            </div>
            <div className="text-caption text-slate-600 mt-0.5 uppercase tracking-wide font-medium">{emp.jobTitle || emp.role}</div>
          </div>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onToggleLead(emp); }}
            title={lead ? 'Remove team lead' : 'Make team lead'}
            className={`flex-shrink-0 flex min-h-9 items-center gap-1 text-caption font-bold px-2 py-1 rounded-lg border transition-colors transition-transform active:scale-95 lg:min-h-0 ${
              lead
                ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700'
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700'
            }`}
          >
            <Star className="h-3.5 w-3.5" />
            {lead ? 'Lead' : 'Set Lead'}
          </button>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {emp.teams.length === 0
            ? <span className="text-caption text-slate-400">No teams assigned</span>
            : emp.teams.map(t => <Badge key={t} variant="default" className="text-caption px-1.5 py-0.2">{t}</Badge>)}
        </div>
        {/* Touch screens never fire HTML5 drag and drop, so phones get this select; it runs the same assign() as a drop. */}
        {teams.length > 0 && (
          <Select
            value=""
            onChange={e => { if (e.target.value) { onAssign(emp, e.target.value); e.target.value = ''; } }}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            fieldSize="md" className="md:hidden mt-2.5"
          >
            <option value="">Assign to team…</option>
            {joinable.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </Select>
        )}
      </Card>
    </div>
  );
}

// The left panel of the team builder: every employee as a draggable card.
export function EmployeeList({ employees, loading, ...card }: EmployeeListProps) {
  return (
    <div className="lg:col-span-4 space-y-4">
      <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
        <Users className="h-4 w-4 text-orange-600" /> Employee List
      </h3>
      <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
        {loading && <ListSkeleton rows={5} />}
        {!loading && employees.map(emp => <EmployeeCard key={emp.id} emp={emp} {...card} />)}
      </div>
    </div>
  );
}
