'use client';

import React from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { displayName, type Profile, type TimesheetEntry } from '@/lib/hrData';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface ForceModalProps {
  employee: Profile;
  role: 'admin' | 'hr';
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

function Footer({ confirmLabel, variant, busy, onConfirm, onClose }: { confirmLabel: string; variant: 'danger' | 'primary'; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
      <Button variant={variant} size="md" onClick={onConfirm} disabled={busy}>{confirmLabel}</Button>
      <Button variant="secondary" size="md" onClick={onClose} disabled={busy}>Cancel</Button>
    </div>
  );
}

// Ends the employee's current shift as if they had clicked "End Shift" themselves.
export function ForceEndShiftModal({ employee, role, busy, onConfirm, onClose }: ForceModalProps) {
  return (
    <Modal isOpen onClose={onClose} title="Force End Shift">
      <div className="space-y-4">
        <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 p-4 rounded-xl">
          <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-700 font-semibold leading-relaxed">
            This will immediately end {displayName(employee, role)}&apos;s current shift, the same as if they clicked &quot;End Shift&quot; themselves. Their desktop tracker will be told to stop capturing right away. The next time they try to start a shift, the portal will run the same tracker connection check as always — if their tracker is still on an old/regenerated setup code, they&apos;ll see the &quot;Reconnect Tracker Required&quot; block until they reconnect it.
          </p>
        </div>
        <Footer confirmLabel={busy ? 'Ending Shift…' : 'Force End Shift'} variant="danger" busy={busy} onConfirm={onConfirm} onClose={onClose} />
      </div>
    </Modal>
  );
}

// Invalidates the employee's setup code, which is what GUARANTEES the "Reconnect Required" block on their next
// Start Shift (Force End Shift alone does nothing if their tracker was not already stale).
export function ForceDisconnectModal({ employee, role, busy, onConfirm, onClose, openShift }: ForceModalProps & { openShift: TimesheetEntry | null }) {
  return (
    <Modal isOpen onClose={onClose} title="Force Disconnect Tracker">
      <div className="space-y-4">
        <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 p-4 rounded-xl">
          <ShieldAlert className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-700 font-semibold leading-relaxed">
            This immediately invalidates {displayName(employee, role)}&apos;s current tracker setup code. Their currently-installed desktop tracker will stop being recognized within about 20 seconds and show &quot;Setup token not recognized&quot; on their side. Their next Start Shift attempt will be blocked with the &quot;Reconnect Tracker Required&quot; screen until they open Tracker Setup, copy the new code, and paste it into the app — there is no way around it.
          </p>
        </div>
        {openShift && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 p-4 rounded-xl">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-700 font-semibold leading-relaxed">
              {displayName(employee, role)} is currently on an open shift. This alone won&apos;t end it — their tracker will simply stop capturing mid-shift. Use Force End Shift as well if you want them clocked out right now.
            </p>
          </div>
        )}
        <Footer confirmLabel={busy ? 'Disconnecting…' : 'Force Disconnect'} variant="primary" busy={busy} onConfirm={onConfirm} onClose={onClose} />
      </div>
    </Modal>
  );
}
