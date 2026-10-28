'use client';

import React from 'react';
import { CheckSquareIcon as CheckSquare, SparkleIcon as Sparkles, SquareIcon as Square } from '@phosphor-icons/react/dist/ssr';
import { displayName, type Profile, type Warehouse } from '@/lib/hrData';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { WarehouseManager } from '@/components/ui/WarehouseManager';

interface WarehousesTabProps {
  employees: Profile[];
  warehouses: Warehouse[];
  cleaning: boolean;
  onCleanup: () => void;
  onToggleAssignment: (emp: Profile, whId: string) => void;
}

// "USA Warehouse Geofencing": the warehouse list and form, and which warehouses each USA employee is assigned to
// (used for automatic check-in by location).
export function WarehousesTab({ employees, warehouses, cleaning, onCleanup, onToggleAssignment }: WarehousesTabProps) {
  const usaStaff = employees.filter(e => e.region === 'USA');
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Configure logistics warehouses and assign them to USA employees for auto check-in geofencing.</p>
        <Button
          variant="outline"
          onClick={onCleanup}
          disabled={cleaning}
          title="Remove leftover warehouse IDs from a past migration that no longer match any current warehouse"
          className="shrink-0"
        >
          <Sparkles className="h-3.5 w-3.5 text-orange-600" /> {cleaning ? 'Cleaning up…' : 'Clean Up Stale Warehouse Links'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <WarehouseManager layout="stacked" className="lg:col-span-6" />

        <div className="lg:col-span-6 space-y-4">
          <Card className="border border-slate-200 h-full">
            <div className="px-6 py-4 border-b border-slate-100"><h3 className="font-bold text-slate-900 text-sm">USA Warehouse Assignments</h3></div>
            <CardContent className="p-6 space-y-4 max-h-[460px] overflow-y-auto">
              {usaStaff.map(emp => (
                <div key={emp.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <Avatar src={emp.profilePicture} name={emp.fullName} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 text-sm truncate">{displayName(emp, 'hr')}</div>
                      <div className="text-caption text-slate-400 font-semibold truncate">{emp.email} · {emp.jobTitle || 'USA Staff'}</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-caption font-bold text-slate-400 uppercase tracking-wider">Assigned Warehouses</p>
                    <div className="grid grid-cols-2 gap-2">
                      {warehouses.map(wh => {
                        const assigned = (emp.assignedWarehouses || []).includes(wh.id);
                        return (
                          <button
                            key={wh.id}
                            type="button"
                            onClick={() => onToggleAssignment(emp, wh.id)}
                            title={wh.name}
                            aria-pressed={assigned}
                            className={`flex items-center gap-1.5 text-xs font-semibold p-2 rounded-lg border text-left transition-colors ${
                              assigned ? 'bg-orange-50 border-orange-300 text-orange-800' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            {assigned ? <CheckSquare className="h-3.5 w-3.5 text-orange-600 shrink-0" /> : <Square className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
                            <span className="truncate">{wh.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
              {usaStaff.length === 0 && <p className="text-xs text-slate-400 italic text-center py-6">No USA region employees found.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
