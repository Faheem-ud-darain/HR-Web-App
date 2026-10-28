'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { displayName, type Profile } from '@/lib/hrData';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

// Asked when someone who is already in other teams is moved: add the new team, or make it their only one.
export function MultiTeamPrompt({ isOpen, employee, targetTeam, onChoose, onClose }: {
  isOpen: boolean; employee: Profile | null; targetTeam: string | null; onChoose: (mode: 'both' | 'reassign') => void; onClose: () => void;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Conflict Checklist: Multi-Team Assignment">
      <div className="space-y-4">
        <div className="flex gap-3 bg-amber-50 border border-amber-100 p-4 rounded-lg text-amber-900 text-xs font-semibold leading-relaxed">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <p className="font-bold text-sm text-amber-950 mb-1">Employee is already assigned to other teams</p>
            <p className="font-medium text-amber-800">
              <strong>{employee ? displayName(employee, 'hr') : ''}</strong> is currently assigned to: <strong>{employee?.teams.join(', ')}</strong>.
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed font-semibold">
          Would you like to assign them to <strong>{targetTeam}</strong> as an additional department, or reassign them to <strong>{targetTeam}</strong> exclusively?
        </p>
        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-slate-200">
          <Button variant="outline" onClick={onClose} className="order-3 sm:order-1">Cancel Drop</Button>
          <Button variant="secondary" onClick={() => onChoose('reassign')} className="order-2">Reassign Exclusively</Button>
          <Button onClick={() => onChoose('both')} className="order-1 sm:order-3">Add to Both Teams</Button>
        </div>
      </div>
    </Modal>
  );
}
