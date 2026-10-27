'use client';

import React from 'react';
import { displayName, type Profile } from '@/lib/hrData';
import { formatDateNY } from '@/lib/timezone';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { TicketRole } from './ticketHelpers';

interface InspectEmployeeModalProps {
  employee: Profile;
  isPrivileged: boolean;
  role: TicketRole;
  onClose: () => void;
  // Opens the photo full size (privileged viewers only).
  onViewPhoto: (src: string, fileName: string) => void;
}

// The small profile card HR / Technical Support open from a ticket to see who filed it.
export function InspectEmployeeModal({ employee, isPrivileged, role, onClose, onViewPhoto }: InspectEmployeeModalProps) {
  const canZoom = isPrivileged && !!employee.profilePicture;
  const rows: [string, string][] = [
    ['Email Address', employee.email],
    ['Department Teams', employee.teams.join(', ') || 'No Team'],
    ['Service Start Date', formatDateNY(employee.joinedDate)],
    ['Gender', employee.gender || 'male'],
  ];

  return (
    <Modal isOpen onClose={onClose} title="Employee Profile Inspector">
      <div className="space-y-4">
        <div className="flex items-center gap-4 bg-slate-50 p-4 border border-slate-200 rounded-xl">
          <button
            type="button"
            onClick={() => canZoom && onViewPhoto(employee.profilePicture!, `${employee.fullName}.jpg`)}
            title={canZoom ? 'View full size' : undefined}
            className={canZoom ? 'cursor-zoom-in' : 'cursor-default'}
          >
            <Avatar src={employee.profilePicture} name={employee.fullName} size={48} />
          </button>
          <div>
            <h4 className="font-bold text-slate-900 text-sm">{isPrivileged ? displayName(employee, role as 'hr' | 'admin') : employee.fullName}</h4>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{employee.jobTitle || employee.role}</p>
          </div>
        </div>

        <div className="space-y-2.5 divide-y divide-slate-100 text-xs font-semibold">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between py-2">
              <span className="text-slate-400 uppercase text-[9px] tracking-wider">{label}</span>
              <span className={`text-slate-800 ${label === 'Gender' ? 'capitalize' : ''}`}>{value}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-200">
          <Button variant="secondary" size="md" onClick={onClose}>Close Inspector</Button>
        </div>
      </div>
    </Modal>
  );
}
