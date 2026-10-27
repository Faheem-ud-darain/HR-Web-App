'use client';

import React from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { displayName, type Profile, type TimesheetEntry } from '@/lib/hrData';
import { NoticeModal } from '@/components/ui/NoticeModal';

interface ForceModalProps {
  employee: Profile;
  role: 'admin' | 'hr';
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

// Ends the employee's current shift as if they had clicked "End Shift" themselves.
export function ForceEndShiftModal({ employee, role, busy, onConfirm, onClose }: ForceModalProps) {
  return (
    <NoticeModal
      title="Force End Shift"
      tone="rose"
      icon={AlertTriangle}
      action={{ label: busy ? 'Ending Shift…' : 'Force End Shift', onClick: onConfirm, variant: 'danger', disabled: busy }}
      closeLabel="Cancel"
      busy={busy}
      onClose={onClose}
    >
      This will immediately end {displayName(employee, role)}&apos;s current shift, the same as if they clicked &quot;End Shift&quot; themselves. Their desktop tracker will be told to stop capturing right away. The next time they try to start a shift, the portal will run the same tracker connection check as always — if their tracker is still on an old/regenerated setup code, they&apos;ll see the &quot;Reconnect Tracker Required&quot; block until they reconnect it.
    </NoticeModal>
  );
}

// Invalidates the employee's setup code, which is what GUARANTEES the "Reconnect Required" block on their next
// Start Shift (Force End Shift alone does nothing if their tracker was not already stale).
export function ForceDisconnectModal({ employee, role, busy, onConfirm, onClose, openShift }: ForceModalProps & { openShift: TimesheetEntry | null }) {
  const name = displayName(employee, role);
  return (
    <NoticeModal
      title="Force Disconnect Tracker"
      tone="orange"
      icon={ShieldAlert}
      extra={openShift ? [{ tone: 'amber', icon: AlertTriangle, text: <>{name} is currently on an open shift. This alone won&apos;t end it — their tracker will simply stop capturing mid-shift. Use Force End Shift as well if you want them clocked out right now.</> }] : []}
      action={{ label: busy ? 'Disconnecting…' : 'Force Disconnect', onClick: onConfirm, disabled: busy }}
      closeLabel="Cancel"
      busy={busy}
      onClose={onClose}
    >
      This immediately invalidates {name}&apos;s current tracker setup code. Their currently-installed desktop tracker will stop being recognized within about 20 seconds and show &quot;Setup token not recognized&quot; on their side. Their next Start Shift attempt will be blocked with the &quot;Reconnect Tracker Required&quot; screen until they open Tracker Setup, copy the new code, and paste it into the app — there is no way around it.
    </NoticeModal>
  );
}
