'use client';

import React, { useState } from 'react';
import { formatMoney, getFinalLeavePayout, saveProfileExtras, useLeaves, useWarehouses, type Profile } from '@/lib/hrData';
import type { OffboardForm as OffboardValues, ViewerRole } from '@/lib/core/userProfile';
import { ConfirmDialog } from '../ConfirmDialog';
import { EditProfileForm } from './EditProfileForm';
import { OffboardForm } from './OffboardForm';
import { ProfileActions } from './ProfileActions';
import { ProfileDetails } from './ProfileDetails';
import { ProfileHeader } from './ProfileHeader';

interface ProfileCardBodyProps {
  profile: Profile;
  viewerRole: ViewerRole;
  canManage: boolean;
  // Reloads the profiles and tells the page that opened the card.
  onChanged: () => void | Promise<unknown>;
  onClose: () => void;
}

// The scrolling body of the card for one employee: the view, the edit form or the offboarding checklist, and the final
// offboarding confirmation. Mounted per employee, so switching person starts from a clean state.
export function ProfileCardBody({ profile, viewerRole, canManage, onChanged, onClose }: ProfileCardBodyProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'offboard'>('view');
  const [pendingOffboard, setPendingOffboard] = useState<OffboardValues | null>(null);
  const [offboarding, setOffboarding] = useState(false);
  const { data: allWarehouses } = useWarehouses();
  const warehouses = allWarehouses || [];
  // This employee's own leaves (all of them) drive their PTO bank and final payout. A list that has not loaded (or
  // failed) must never be read as "no leave taken" when that payout is worked out, hence the status flags.
  const { data: allLeaves, isSuccess: leavesLoaded, isError: leavesFailed } = useLeaves({ employeeName: profile.fullName });
  const leaves = allLeaves || [];

  const confirmOffboard = async () => {
    if (offboarding || !pendingOffboard) return;
    if (!leavesLoaded) {
      alert(leavesFailed
        ? "This employee's leave history could not be loaded, so the final payout can't be worked out. Close this and reopen the profile, then try again."
        : "This employee's leave history is still loading. Please wait a moment, then confirm again.");
      return;
    }
    setOffboarding(true);
    try {
      // Company policy: the remaining PTO/Sick bank is paid out in full at contract end, and so is the reserved salary
      // (the automatic first-month withhold plus any manual note). Offboarding only flips flags on the profile: chat
      // history, tasks, tickets and documents stay where they are. Only "Delete Account Permanently" removes data.
      await saveProfileExtras(profile.id, {
        offboarded: true,
        offboardDate: new Date().toISOString().split('T')[0],
        offboardingStatus: {
          ...pendingOffboard,
          finalLeavePayout: getFinalLeavePayout(profile, leaves),
          finalReservedPayout: (profile.reservedSalaryBalance || 0) + (profile.manualReservedAmount || 0),
        },
      });
      setPendingOffboard(null);
      setMode('view');
      await onChanged();
    } finally {
      setOffboarding(false);
    }
  };

  return (
    <>
      <div className="px-5 py-5 overflow-y-auto flex-1 space-y-5">
        <ProfileHeader profile={profile} viewerRole={viewerRole} />

        {mode === 'view' && (
          <div className="space-y-4">
            <ProfileDetails profile={profile} viewerRole={viewerRole} warehouses={warehouses} canManage={canManage} onChanged={onChanged} />
            {canManage && (
              <ProfileActions profile={profile} onEdit={() => setMode('edit')} onOffboard={() => setMode('offboard')} onChanged={onChanged} onDeleted={() => { void onChanged(); onClose(); }} />
            )}
          </div>
        )}
        {mode === 'edit' && (
          <EditProfileForm profile={profile} viewerRole={viewerRole} warehouses={warehouses} onCancel={() => setMode('view')} onSaved={() => { setMode('view'); void onChanged(); }} />
        )}
        {mode === 'offboard' && <OffboardForm profile={profile} leaves={leaves} onCancel={() => setMode('view')} onSubmit={setPendingOffboard} />}
      </div>

      <ConfirmDialog
        isOpen={pendingOffboard !== null}
        onClose={() => setPendingOffboard(null)}
        onConfirm={confirmOffboard}
        title="Offboard this employee?"
        message={`This will deactivate ${profile.fullName}'s account and immediately block all access to the workspace. A final PTO/Sick bank payout of ${formatMoney(getFinalLeavePayout(profile, leaves), profile.region)} will be recorded. Their record stays in the system as "Offboarded" and can be reactivated later.${!leavesLoaded ? (leavesFailed ? ' WARNING: their leave history could not be loaded, so the payout above is not reliable.' : ' Note: their leave history is still loading, so the payout above may change.') : ''}`}
        confirmLabel={offboarding ? 'Offboarding…' : 'Yes, Offboard'}
        variant="warning"
        loading={offboarding}
      />
    </>
  );
}
