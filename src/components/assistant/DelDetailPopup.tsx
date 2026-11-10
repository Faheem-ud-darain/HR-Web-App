'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TicketDetailModal } from '@/components/ui/tickets/TicketDetailModal';
import { UserProfileModal } from '@/components/ui/UserProfileModal';
import { useProfiles } from '@/lib/hrData';
import { useSessionEmail } from '@/lib/useSession';
import type { DelTarget } from './Markdown';

// The popup behind a clickable name, ticket id or ticket title in one of Del's answers. It reuses the app's own screens (the employee
// profile card and a read-only ticket view), so what a person sees here is exactly what the rest of the app would show them.
function EmployeePopup({ id, role, onClose }: { id: string; role: 'hr' | 'admin'; onClose: () => void }) {
  const { data: profiles, isLoading } = useProfiles();
  const email = useSessionEmail();
  const person = profiles?.find(p => p.id === id);
  if (isLoading) return null;
  if (!person) return <Modal isOpen onClose={onClose} title="Profile" footer={<div className="flex justify-end"><Button variant="primary" size="sm" onClick={onClose}>Close</Button></div>}><p className="text-sm text-slate-500">This profile could not be found.</p></Modal>;
  return <UserProfileModal isOpen onClose={onClose} employeeEmail={person.email} currentUserRole={role} currentUserEmail={email || ''} />;
}

export function DelDetailPopup({ target, role, onClose }: { target: DelTarget | null; role: 'hr' | 'admin'; onClose: () => void }) {
  const router = useRouter();
  if (!target) return null;
  return target.kind === 'ticket'
    ? <TicketDetailModal ticketId={target.id} onClose={onClose} onOpenTickets={() => { onClose(); router.push(`/${role}/tickets`); }} />
    : <EmployeePopup id={target.id} role={role} onClose={onClose} />;
}
