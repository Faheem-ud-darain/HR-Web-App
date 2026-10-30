'use client';

import { Button } from '@/components/ui/Button';
import React from 'react';
import { CalendarBlankIcon as Calendar, CurrencyDollarIcon as DollarSign, BankIcon as Landmark, EnvelopeIcon as Mail, MapPinIcon as MapPin, PhoneIcon as Phone, ShieldIcon as Shield } from '@/components/ui/icons';
import { formatMoney, updateProfileAdmin, type Profile, type Warehouse } from '@/lib/hrData';
import type { ViewerRole } from '@/lib/core/userProfile';
import { Badge } from '../Badge';
import { OffboardingSummary } from './OffboardingSummary';
import { PendingIncrement } from './PendingIncrement';
import { ProfileField } from './ProfileField';
import { ReservedSalaryCard } from './ReservedSalaryCard';

interface ProfileDetailsProps {
  profile: Profile;
  viewerRole: ViewerRole;
  warehouses: Warehouse[];
  canManage: boolean;
  onChanged: () => void | Promise<unknown>;
}

// The read-only view of a profile: contact and pay details, teams and warehouses, bank details, the reserved salary
// (HR/Admin only) and, for an offboarded employee, the offboarding record.
export function ProfileDetails({ profile, viewerRole, warehouses, canManage, onChanged }: ProfileDetailsProps) {
  const staff = viewerRole === 'admin' || viewerRole === 'hr';
  const known = (id: string) => warehouses.some(w => w.id === id);
  const links = profile.assignedWarehouses || [];

  // Warehouse ids that match no current warehouse are leftovers from a past data migration: shown as unresolved, with
  // a button (for people who can manage this profile) to drop them.
  const removeUnrecognized = async () => {
    await updateProfileAdmin(profile.id, { assignedWarehouses: links.filter(known) });
    await onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <ProfileField label="Email Address" icon={Mail}>{profile.email}</ProfileField>
        <ProfileField label="Own Number" icon={Phone}>{profile.personalPhone || '—'}</ProfileField>
        <ProfileField label="Company Allocated Number" icon={Phone}>{profile.companyPhone || 'Not applicable'}</ProfileField>
        <ProfileField label="System Role" icon={Shield}>{profile.role}</ProfileField>
        <div>
          <ProfileField label="Base Salary" icon={DollarSign}>{formatMoney(profile.baseSalary, profile.region)}</ProfileField>
          {staff && <PendingIncrement profile={profile} onChanged={onChanged} />}
        </div>
        <ProfileField label="Location / Region" icon={MapPin}>{profile.region || 'Pakistan'}</ProfileField>
        <ProfileField label="Joined Date" icon={Calendar}>{profile.joinedDate}</ProfileField>
        <ProfileField label="Account Creation Date" icon={Calendar} title="PTO accrual is calculated from this date">{profile.accountCreationDate || profile.joinedDate}</ProfileField>
        <ProfileField label="Gender" className="capitalize">{profile.gender || 'male'}</ProfileField>
      </div>

      <div>
        <p className="text-caption font-bold text-slate-400 uppercase mb-1">Departments / Teams</p>
        <div className="flex flex-wrap gap-1">
          {profile.teams.length === 0 ? <span className="text-xs text-slate-400 italic">No assigned teams</span> : profile.teams.map(t => <Badge key={t} variant="default">{t}</Badge>)}
        </div>
      </div>

      <div>
        <p className="text-caption font-bold text-slate-400 uppercase mb-1">Assigned Warehouses</p>
        <div className="flex flex-wrap gap-1">
          {links.length === 0
            ? <span className="text-xs text-slate-400 italic">No warehouses assigned</span>
            : links.map(id => <Badge key={id} variant="success">{warehouses.find(w => w.id === id)?.name ?? 'Unrecognized warehouse (re-assign needed)'}</Badge>)}
        </div>
        {links.some(id => !known(id)) && canManage && (
          <Button type="button" variant="ghost" size="xs" onClick={removeUnrecognized} className="mt-1 text-rose-600!">Remove unrecognized warehouse links</Button>
        )}
      </div>

      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
        <p className="font-bold text-slate-800 flex items-center gap-1"><Landmark className="h-3.5 w-3.5" /> Bank Information</p>
        {profile.bankName ? (
          <div className="grid grid-cols-2 gap-2 text-caption font-medium text-slate-600">
            <div><span className="block text-caption text-slate-400 font-bold">BANK</span>{profile.bankName}</div>
            <div><span className="block text-caption text-slate-400 font-bold">ACCOUNT</span>{profile.accountNumber}</div>
            <div className="col-span-2"><span className="block text-caption text-slate-400 font-bold">IBAN / ROUTING</span><span className="font-mono">{profile.iban}</span></div>
          </div>
        ) : (
          <span className="text-slate-400 italic text-caption">Bank details are not shared yet.</span>
        )}
      </div>

      {staff && <ReservedSalaryCard profile={profile} onChanged={onChanged} />}
      <OffboardingSummary profile={profile} />
    </div>
  );
}
