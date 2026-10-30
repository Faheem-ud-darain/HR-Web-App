'use client';

import { Checkbox } from '@/components/ui/Checkbox';
import React, { useState } from 'react';
import { displayName, type Profile } from '@/lib/hrData';
import { toggleInList } from '@/lib/core/teams';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SuccessNote } from '@/components/ui/SuccessNote';

interface AssignLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  // Purple for warehouse managers, orange for team leads.
  tone: 'orange' | 'purple';
  employeeLabel: string;
  // Who can be picked, and how each option reads.
  candidates: Profile[];
  optionLabel: (emp: Profile) => string;
  // What the picked person currently leads (preselected), and what can be chosen.
  currentSelection: (emp: Profile) => string[];
  options: { id: string; label: string }[];
  selectionLabel: string;
  hint: string;
  // The list of everyone who already holds the role.
  currentHeading: string;
  current: { id: string; name: string; detail: string }[];
  currentIcon: React.ReactNode;
  emptyText: string;
  // Saves, and returns the confirmation to show before the dialog closes.
  onSave: (emp: Profile, selection: string[]) => Promise<string>;
}

// One dialog for both "Manage Team Leads" and "Manage Warehouse Managers": pick an employee, tick what they lead,
// save. Choosing nothing removes the role.
export function AssignLeadModal(p: AssignLeadModalProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [selection, setSelection] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  // Every opening starts clean.
  const [wasOpen, setWasOpen] = useState(p.isOpen);
  if (p.isOpen !== wasOpen) {
    setWasOpen(p.isOpen);
    if (p.isOpen) { setEmployeeId(''); setSelection([]); setSuccess(''); }
  }

  const emp = p.candidates.find(c => c.id === employeeId);

  const save = async () => {
    if (!emp || saving) return;
    setSaving(true);
    try {
      setSuccess(await p.onSave(emp, selection));
      setTimeout(p.onClose, 1400);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={p.isOpen} onClose={p.onClose} title={p.title}>
      <div className="space-y-4">
        <SuccessNote>{success}</SuccessNote>

        <FormField label={p.employeeLabel} size="md">
          <Select
            value={employeeId}
            onChange={e => { setEmployeeId(e.target.value); const picked = p.candidates.find(c => c.id === e.target.value); setSelection(picked ? p.currentSelection(picked) : []); }}
            fieldSize="md"
          >
            <option value="">— Select employee —</option>
            {p.candidates.map(c => <option key={c.id} value={c.id}>{p.optionLabel(c)}</option>)}
          </Select>
        </FormField>

        {emp && (
          <FormField label={p.selectionLabel} size="md">
            <div className="space-y-2 mt-1">
              {p.options.map(o => (
                <Checkbox key={o.id} className="min-h-0!" checked={selection.includes(o.id)} onChange={() => setSelection(s => toggleInList(s, o.id))}>{o.label}</Checkbox>
              ))}
            </div>
            <p className="text-caption text-slate-400 mt-2">{p.hint}</p>
          </FormField>
        )}

        <div className="border-t border-slate-200 pt-4 space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{p.currentHeading}</p>
          {p.current.map(row => (
            <div key={row.id} className="flex items-center justify-between text-xs bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
              <span className="font-semibold text-slate-800 flex items-center gap-1">{p.currentIcon} {row.name}</span>
              <span className="text-purple-700 font-semibold">{row.detail}</span>
            </div>
          ))}
          {p.current.length === 0 && <p className="text-xs text-slate-400 italic">{p.emptyText}</p>}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button variant="outline" onClick={p.onClose} disabled={saving}>Cancel</Button>
          <Button variant={p.tone === 'purple' ? 'purple' : 'primary'} onClick={save} disabled={!emp} loading={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
        </div>
      </div>
    </Modal>
  );
}

export const leadRow = (emp: Profile, detail: string) => ({ id: emp.id, name: displayName(emp, 'hr'), detail });
