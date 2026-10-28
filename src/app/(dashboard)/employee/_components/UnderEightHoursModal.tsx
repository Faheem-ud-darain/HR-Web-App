'use client';

import React from 'react';
import { WarningIcon as AlertTriangle } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

const hoursMinutes = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

// A heads-up, purely informational: by the time it shows, the clock-out has already run and the shift is ended.
// It used to be a confirmation GATE that blocked the clock-out until a second click, which let shifts silently stay
// open for up to 16 hours when an employee did not click through it. Never add a button here that the
// shift-ending action depends on.
export function UnderEightHoursModal({ workedMinutes, remainingMinutes, onClose }: { workedMinutes: number; remainingMinutes: number; onClose: () => void }) {
  return (
    <Modal isOpen onClose={onClose} title="Shift Ended Under 8 Hours">
      <div className="space-y-4 font-sans text-xs">
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-sm">Your shift has been ended.</p>
            <p className="text-amber-800 leading-relaxed font-medium">
              It was under the required <strong>8 hours</strong> of total shift time for today — this may affect your pay for today. HR/Admin has also been notified.
            </p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center text-slate-700">
            <span className="font-semibold text-slate-500">Today&apos;s Total Shift Time:</span>
            <span className="font-bold font-mono text-sm text-slate-900">{hoursMinutes(workedMinutes)}</span>
          </div>
          <div className="flex justify-between items-center text-slate-700 pt-2 border-t border-slate-200">
            <span className="font-semibold text-amber-700">Short By:</span>
            <span className="font-bold font-mono text-sm text-amber-700">{hoursMinutes(remainingMinutes)}</span>
          </div>
        </div>

        <p className="text-slate-500 text-caption leading-relaxed">
          If your shift was split into multiple parts due to internet/app disconnections, your total worked time today is combined. If this looks wrong, contact HR.
        </p>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <Button variant="success" size="md" onClick={onClose}>Got it</Button>
        </div>
      </div>
    </Modal>
  );
}
