'use client';

import React, { useState } from 'react';
import { hrActions, addEmployeeServer, type Team } from '@/lib/hrData';
import { Button } from '@/components/ui/Button';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SuccessNote } from '@/components/ui/SuccessNote';

const today = () => new Date().toISOString().split('T')[0];
const emptyForm = () => ({ fullName: '', email: '', jobTitle: '', gender: 'male', role: 'employee', region: 'Pakistan', salary: '', team: '', tempPassword: '' });
type Form = ReturnType<typeof emptyForm>;

// "Onboard Employee": creates the account (the server returns a random temporary password when none is typed),
// adds the person to the chosen team and notifies HR and Admin. Mount it only while open, so the form starts empty.
export function OnboardEmployeeModal({ teams, onRegistered, onClose }: { teams: Team[]; onRegistered: () => void; onClose: () => void }) {
  const [form, setForm] = useState<Form>(emptyForm);
  const [joinedDate, setJoinedDate] = useState(today);
  // PTO accrual runs from the account creation date, not the joining date.
  const [accountCreationDate, setAccountCreationDate] = useState(today);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const field = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [key]: e.target.value }));
  const usa = form.region === 'USA';
  // The team shown in the dropdown: the one picked, else the first real team (never a name that may not exist).
  const teamName = form.team || teams[0]?.name || '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (busy) return;
    const { fullName, email, salary, jobTitle } = form;
    const team = teamName;
    if (!fullName || !email || !salary || !jobTitle) return setError('Please fill in all required fields.');
    if (isNaN(Number(salary)) || Number(salary) <= 0) return setError('Please enter a valid base salary.');

    setBusy(true);
    // Set once the account exists, so a failure in a later step cannot hide its temporary password.
    let created: { tempPassword?: string } | null = null;
    const typedPassword = form.tempPassword.trim();
    // With no password typed, the server generated a random one: the only time it is ever visible in plaintext.
    const registeredNote = () => (!typedPassword && created?.tempPassword
      ? `Employee successfully registered! Temporary password: ${created.tempPassword} — share this with them; it won't be shown again.`
      : 'Employee successfully registered!');
    try {
      created = await addEmployeeServer({
        fullName,
        email,
        role: form.role as 'employee' | 'hr' | 'admin' | 'team_lead',
        joinedDate,
        accountCreationDate,
        baseSalary: Number(salary),
        teams: [team],
        password: typedPassword || undefined,
        jobTitle,
        gender: form.gender as 'male' | 'female',
        region: form.region as 'USA' | 'Pakistan',
      }) ?? {};

      // Mirror membership onto the authoritative hr_teams.members list.
      const targetTeam = teams.find(t => t.name === team);
      if (targetTeam && !targetTeam.members.includes(email)) {
        await hrActions.updateTeamMembers(targetTeam.id, [...targetTeam.members, email]);
      }
      await hrActions.addNotification('all', 'hr', `New employee ${fullName} onboarded onto team ${team}.`);
      await hrActions.addNotification('all', 'admin', `New employee ${fullName} onboarded onto team ${team}.`);
      onRegistered();

      // Keep the dialog open when a password was generated, so it can be copied down, and clear the form for the next person.
      if (!typedPassword && created.tempPassword) {
        setSuccess(registeredNote());
        setForm(emptyForm());
        return;
      }
      setSuccess(registeredNote());
      setTimeout(onClose, 1500);
    } catch (err) {
      console.error('Onboard employee failed:', err);
      if (created) {
        // The account exists: show its password and say which part failed instead of "could not register".
        setSuccess(registeredNote());
        setError('The account was created, but adding them to their team or notifying HR/Admin failed. Please add them to the team manually.');
        setForm(emptyForm());
        onRegistered();
      } else {
        setError('Could not register that employee. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Onboard New Employee" className="md:max-w-2xl">
      <form onSubmit={submit} className="space-y-4 pt-1">
        <FormError>{error}</FormError>
        <SuccessNote className="p-3.5 rounded-xl">{success}</SuccessNote>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Full Name *"><Input type="text" required value={form.fullName} onChange={field('fullName')} fieldSize="soft" placeholder="e.g. John Doe" /></FormField>
          <FormField label="Job Title / Designation *"><Input type="text" required value={form.jobTitle} onChange={field('jobTitle')} fieldSize="soft" placeholder="e.g. QA Specialist" /></FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Email Address *"><Input type="email" required value={form.email} onChange={field('email')} fieldSize="soft" placeholder="e.g. john@company.com" /></FormField>
          <FormField label="Gender">
            <Select value={form.gender} onChange={field('gender')} fieldSize="soft" chevron>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </Select>
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Role Type">
            <Select value={form.role} onChange={field('role')} fieldSize="soft" chevron>
              <option value="employee">Employee</option>
              <option value="hr">HR</option>
            </Select>
          </FormField>
          <FormField label="Region / Base Location Mode">
            <Select value={form.region} onChange={field('region')} fieldSize="soft" chevron>
              <option value="Pakistan">Pakistan (Remote Employee)</option>
              <option value="USA">USA Employee (Warehouse Geofencing)</option>
            </Select>
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label={<>Base Salary ({usa ? 'USD $' : 'PKR'}) *</>}>
            <Input type="text" required value={form.salary} onChange={field('salary')} fieldSize="soft" placeholder={usa ? 'e.g. 5000' : 'e.g. 50000'} />
          </FormField>
          <FormField label="Assign Team">
            <Select value={teamName} onChange={field('team')} fieldSize="soft" chevron>
              {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </Select>
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Joining Date *"><Input type="date" required value={joinedDate} onChange={e => setJoinedDate(e.target.value)} fieldSize="soft" className="cursor-pointer" /></FormField>
          <div className="space-y-1.5">
            <FieldLabel size="sm" title="PTO accrual is calculated from this date, not the joining date">Account Creation Date *</FieldLabel>
            <Input type="date" required value={accountCreationDate} onChange={e => setAccountCreationDate(e.target.value)} fieldSize="soft" className="cursor-pointer" />
            <p className="text-caption text-slate-400 font-semibold">PTO accrual is calculated from this date.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Temporary Password"><Input type="text" value={form.tempPassword} onChange={field('tempPassword')} fieldSize="soft" placeholder="e.g. welcome123" /></FormField>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button type="button" variant="outline" size="md" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Registering…' : 'Register & Invite'}</Button>
        </div>
      </form>
    </Modal>
  );
}
