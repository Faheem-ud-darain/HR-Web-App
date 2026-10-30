'use client';

import React, { useMemo } from 'react';
import { ShieldWarningIcon as ShieldAlert, UserIcon as User } from '@/components/ui/icons';
import { useProfiles } from '@/lib/hrData';
import { profileAccess, type ViewerRole } from '@/lib/core/userProfile';
import { Button } from './Button';
import { Modal } from './Modal';
import { ProfileCardBody } from './userProfile/ProfileCardBody';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeEmail: string;
  currentUserRole: ViewerRole;
  currentUserEmail: string;
  onUpdate?: () => void;
}

// The employee profile card, opened from the team, reports and payroll pages. HR and Admin see everything (and can edit
// or offboard whoever they manage); everyone else sees only their own team and their team leads. This shell does the
// lookup, the access check and the overlay; ./userProfile holds the view, the edit form and the offboarding checklist.
export function UserProfileModal({ isOpen, onClose, employeeEmail, currentUserRole, currentUserEmail, onUpdate }: UserProfileModalProps) {
  const { data: profiles, refetch } = useProfiles();
  const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
  const profile = useMemo(() => profiles?.find(p => same(p.email, employeeEmail)) ?? null, [profiles, employeeEmail]);
  // The signed-in viewer's own profile: which teams they lead or belong to decides what they may see.
  const viewer = useMemo(() => profiles?.find(p => same(p.email, currentUserEmail)) ?? null, [profiles, currentUserEmail]);
  if (!isOpen || !profile) return null;

  const { hasAccess, canManage } = profileAccess(currentUserRole, profile, viewer);
  const onChanged = async () => { await refetch(); onUpdate?.(); };

  if (!hasAccess) {
    return (
      <Modal isOpen onClose={onClose} title="Access Restricted" icon={<ShieldAlert weight="duotone" className="h-5 w-5 text-rose-500" aria-hidden="true" />} footer={<Button variant="secondary" fullWidth onClick={onClose}>Close Panel</Button>}>
        <p className="text-xs text-slate-500 font-semibold leading-relaxed">
          You do not have permission to view this profile. Profiles can only be viewed by administrators, HR, or team members and team leaders sharing the same department.
        </p>
      </Modal>
    );
  }

  return (
    <Modal isOpen onClose={onClose} title="Employee Profile Card" icon={<User className="h-5 w-5 text-orange-600" aria-hidden="true" />}>
      <ProfileCardBody key={profile.id} profile={profile} viewerRole={currentUserRole} canManage={canManage} onChanged={onChanged} onClose={onClose} />
    </Modal>
  );
}
