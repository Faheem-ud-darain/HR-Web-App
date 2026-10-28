'use client';

import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ShieldWarningIcon as ShieldAlert, UserIcon as User, XIcon as X } from '@phosphor-icons/react/dist/ssr';
import { useProfiles } from '@/lib/hrData';
import { profileAccess, type ViewerRole } from '@/lib/core/userProfile';
import { pushModal, popModal } from '@/lib/modalStack';
import { useIsClient } from '@/lib/useIsClient';
import { Button } from './Button';
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
  // Rendered through a portal (as Modal.tsx does): an ancestor with a leftover transform would otherwise trap the
  // `fixed` overlay and push the card down the page instead of covering the viewport.
  const mounted = useIsClient();

  // This overlay is hand-rolled, so it registers with the modal stack itself: the mobile bottom nav hides while it is
  // open (see lib/modalStack.ts).
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    pushModal();
    return () => { document.body.style.overflow = 'unset'; popModal(); };
  }, [isOpen]);

  if (!isOpen || !profile || !mounted) return null;

  const { hasAccess, canManage } = profileAccess(currentUserRole, profile, viewer);
  const onChanged = async () => { await refetch(); onUpdate?.(); };

  if (!hasAccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-xl p-6 shadow-2xl max-w-sm w-full text-center space-y-4">
          <ShieldAlert weight="duotone" className="h-10 w-10 text-rose-500 mx-auto" />
          <h3 className="font-bold text-slate-800">Access Restricted</h3>
          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            You do not have permission to view this profile. Profiles can only be viewed by administrators, HR, or team members and team leaders sharing the same department.
          </p>
          <Button variant="secondary" fullWidth onClick={onClose}>Close Panel</Button>
        </div>
      </div>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col justify-end md:items-center md:justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full shadow-2xl overflow-hidden rounded-t-2xl md:rounded-xl max-h-[92vh] md:max-h-[85vh] md:max-w-lg flex flex-col">
        <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="h-1 w-10 rounded-full bg-slate-300" />
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-1.5"><User className="h-4 w-4 text-orange-600" /> Employee Profile Card</h2>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <ProfileCardBody key={profile.id} profile={profile} viewerRole={currentUserRole} canManage={canManage} onChanged={onChanged} onClose={onClose} />
      </div>
    </div>,
    document.body,
  );
}
