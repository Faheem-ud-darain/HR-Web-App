'use client';

import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import React from 'react';
import { StarIcon as Star, TrashIcon as Trash2 } from '@/components/ui/icons';
import { displayName, type Profile, type Team, type Warehouse } from '@/lib/hrData';
import { Select } from '@/components/ui/Input';
import { ListSkeleton } from '@/components/ui/Skeleton';

interface TeamZonesProps {
  teams: Team[];
  employees: Profile[];
  warehouses: Warehouse[];
  loading: boolean;
  deletingName: string | null;
  onDrop: (teamName: string) => void;
  onOpenProfile: (email: string) => void;
  onAssignWarehouse: (teamName: string, whId: string) => void;
  onRemoveMember: (emp: Profile, teamName: string) => void;
  onDelete: (teamName: string) => void;
}

// The right panel of the team builder: one drop zone per team, listing its members.
export function TeamZones({ teams, employees, warehouses, loading, deletingName, onDrop, onOpenProfile, onAssignWarehouse, onRemoveMember, onDelete }: TeamZonesProps) {
  return (
    <div className="lg:col-span-8 space-y-4">
      <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Departments / Dropzones</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {loading && <ListSkeleton rows={3} />}
        {!loading && teams.map(team => {
          const members = employees.filter(e => team.members.includes(e.email));
          return (
            <div
              key={team.id}
              onDragOver={e => e.preventDefault()}
              onDrop={() => onDrop(team.name)}
              className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 min-h-[160px] flex flex-col transition-colors hover:bg-slate-100/50"
            >
              <div className="flex justify-between items-center mb-3">
                <span className="font-bold text-xs text-slate-700 uppercase tracking-wider">{team.name}</span>
                <div className="flex items-center gap-1.5">
                  <Select
                    onChange={e => { if (e.target.value) { onAssignWarehouse(team.name, e.target.value); e.target.value = ''; } }}
                    fieldSize="md" className="max-w-[110px] truncate"
                  >
                    <option value="">+ Assign Wh</option>
                    {warehouses.map(wh => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
                  </Select>
                  <IconButton size="sm" label="Delete team" loading={deletingName === team.name} onClick={() => onDelete(team.name)} className="text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></IconButton>
                </div>
              </div>

              <div className="flex-1 space-y-2">
                {members.map(member => (
                  <div
                    key={member.id}
                    onClick={() => onOpenProfile(member.email)}
                    className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm text-xs font-semibold text-slate-700 flex justify-between items-center cursor-pointer hover:border-slate-300 transition-colors"
                  >
                    <span>{displayName(member, 'hr')}</span>
                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                      {member.isTeamLead && member.leadTeams?.includes(team.name) && (
                        <span className="text-caption font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <Star className="h-3.5 w-3.5" /> Lead
                        </span>
                      )}
                      <Button variant="ghost" size="xs" onClick={() => onRemoveMember(member, team.name)} className="text-slate-400 hover:text-rose-600">Remove</Button>
                    </div>
                  </div>
                ))}
                {members.length === 0 && <div className="h-full flex items-center justify-center text-slate-400 text-caption font-bold py-6">Drag members here</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
