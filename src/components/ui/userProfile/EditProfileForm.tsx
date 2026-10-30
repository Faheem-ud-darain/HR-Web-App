'use client';

import { Checkbox } from '@/components/ui/Checkbox';
import { PasswordInput } from '@/components/ui/PasswordInput';
import React, { useState } from 'react';
import { updateProfileAdmin, type Profile, type Warehouse } from '@/lib/hrData';
import { editFormFrom, type EditForm, type ViewerRole } from '@/lib/core/userProfile';
import { Button } from '../Button';
import { FieldLabel } from '../FieldLabel';
import { FormField } from '../FormField';
import { Input, Select } from '../Input';

const today = () => new Date().toISOString().split('T')[0];

interface EditProfileFormProps {
  profile: Profile;
  viewerRole: ViewerRole;
  warehouses: Warehouse[];
  onCancel: () => void;
  onSaved: () => void;
}

// "Edit Credentials": name, alias, email, optional new password, job and pay details, role, dates and warehouses. The
// password box starts blank (a stored hash is never shown): blank means "keep the current password".
export function EditProfileForm({ profile, viewerRole, warehouses, onCancel, onSaved }: EditProfileFormProps) {
  const [form, setForm] = useState<EditForm>(() => editFormFrom(profile, today()));
  const [saving, setSaving] = useState(false);
  // One setter per field: `bind('jobTitle')` gives a control its value and change handler.
  const bind = <K extends keyof EditForm>(key: K) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [key]: e.target.value })),
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.email.trim() || saving) return;
    setSaving(true);
    try {
      await updateProfileAdmin(profile.id, { ...form, baseSalary: Number(form.baseSalary) || 0, alias: form.alias.trim() || undefined });
      onSaved();
    } catch (err) {
      // The server can refuse a save (e.g. a password under 6 characters), so say so instead of doing nothing.
      console.error('Profile save failed:', err);
      alert(`Could not save these changes: ${err instanceof Error ? err.message : 'unknown error'}. Nothing was saved — please check the fields (the password box in particular needs to be at least 6 characters, or left blank to keep the current password) and try again.`);
    } finally {
      setSaving(false);
    }
  };

  const pointer = 'cursor-pointer';
  return (
    <form onSubmit={save} className="space-y-4">
      <FormField label="Full Name *"><Input type="text" required {...bind('fullName')} fieldSize="sm" /></FormField>

      <FormField label={<>Alias <span className="normal-case font-medium text-slate-400">(shown to their team instead of their real name)</span></>}>
        <Input type="text" {...bind('alias')} placeholder="e.g. Falcon, Agent-07, Employee 14" fieldSize="sm" />
        <p className="text-caption text-slate-400 font-medium">Only HR/Admin ever see the real name. Leave blank to show the real name to everyone (not recommended once this is enforced in production).</p>
      </FormField>

      <FormField label="Email Address *"><Input type="email" required {...bind('email')} fieldSize="sm" /></FormField>

      <FormField label="Account Password">
        <PasswordInput {...bind('password')} placeholder="Leave blank to keep the current password" minLength={6} fieldSize="sm" autoComplete="new-password" />
        <p className="text-caption text-slate-400 font-medium">Their current password is never shown here for security. Only fill this in to set a new one (at least 6 characters) — otherwise leave it blank.</p>
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Job Title / Designation"><Input type="text" {...bind('jobTitle')} fieldSize="sm" /></FormField>
        <FormField label="Base Salary"><Input type="number" {...bind('baseSalary')} fieldSize="sm" /></FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Region / Base Location">
          <Select {...bind('region')} fieldSize="sm" className={pointer}><option value="Pakistan">Pakistan</option><option value="USA">USA</option></Select>
        </FormField>
        <FormField label="Gender">
          <Select {...bind('gender')} fieldSize="sm" className={pointer}><option value="male">Male</option><option value="female">Female</option></Select>
        </FormField>
      </div>

      <FormField label="System Role *">
        <Select {...bind('role')} fieldSize="sm" className={pointer}>
          <option value="employee">Employee</option>
          <option value="team_lead">Team Lead</option>
          <option value="hr">HR Admin</option>
          {viewerRole === 'admin' && <option value="admin">System Admin</option>}
        </Select>
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Joining Date *"><Input type="date" required {...bind('joinedDate')} fieldSize="sm" className={pointer} /></FormField>
        <FormField label={<span title="Salary tracking starts from this month">Salary Track Month *</span>}><Input type="date" required {...bind('salaryStartDate')} fieldSize="sm" className={pointer} /></FormField>
      </div>

      <FormField label={<span title="PTO accrual is calculated from this date instead of the joining date">Account Creation Date *</span>}>
        <Input type="date" required {...bind('accountCreationDate')} fieldSize="sm" className={pointer} />
        <p className="text-caption text-slate-400 font-semibold">PTO accrual is calculated from this date, not the joining date.</p>
      </FormField>

      <div className="space-y-1.5">
        <FieldLabel size="plain">Assigned Warehouses</FieldLabel>
        <div className="space-y-1.5 max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50/50">
          {warehouses.map(wh => (
            <Checkbox key={wh.id} className="min-h-0!" checked={form.assignedWarehouses.includes(wh.id)} onChange={checked => setForm(f => ({ ...f, assignedWarehouses: checked ? [...f.assignedWarehouses, wh.id] : f.assignedWarehouses.filter(id => id !== wh.id) }))}>{wh.name}</Checkbox>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-3 border-t border-slate-100">
        <Button type="button" variant="secondary" className="flex-1" disabled={saving} onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving} className="flex-1">{saving ? 'Saving…' : 'Save Changes'}</Button>
      </div>
    </form>
  );
}
