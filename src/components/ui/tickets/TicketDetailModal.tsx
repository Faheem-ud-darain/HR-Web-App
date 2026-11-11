'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { formatTicketDate } from '@/components/ui/tickets/ticketHelpers';
import { hrActions } from '@/lib/hrData';

// A read-only look at one ticket and its whole conversation, opened from a link (for example in Del's answers). It changes nothing: replying,
// closing and reopening stay on the Tickets page, one button away.
export function TicketDetailModal({ ticketId, onClose, onOpenTickets }: { ticketId: string; onClose: () => void; onOpenTickets?: () => void }) {
  const { data: ticket, isLoading } = useQuery({ queryKey: ['ticket_detail', ticketId], queryFn: () => hrActions.getTicket(ticketId), staleTime: 30_000 });
  const footer = (
    <div className="flex justify-end gap-2">
      {onOpenTickets && <Button variant="ghost" size="sm" onClick={onOpenTickets}>Open in Tickets</Button>}
      <Button variant="primary" size="sm" onClick={onClose}>Close</Button>
    </div>
  );
  if (isLoading) return <Modal isOpen onClose={onClose} title="Ticket" footer={footer}><p className="text-sm text-slate-500">Loading the ticket…</p></Modal>;
  if (!ticket) return <Modal isOpen onClose={onClose} title="Ticket" footer={footer}><p className="text-sm text-slate-500">This ticket could not be found. It may have been deleted.</p></Modal>;
  return (
    <Modal isOpen onClose={onClose} title={ticket.title || 'Ticket'} footer={footer}>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={ticket.status === 'open' ? 'warning' : 'success'} size="sm">{ticket.status === 'open' ? 'Open' : 'Closed'}</Badge>
          <Badge variant="info" size="sm">{ticket.department === 'technical' ? 'Technical' : 'HR'}</Badge>
          <span className="text-xs text-slate-500">Opened {formatTicketDate(ticket.createdAt)}</span>
        </div>
        <p className="text-xs text-slate-500">From <span className="font-semibold text-slate-800">{ticket.employeeName}</span>{ticket.employeeEmail ? ` · ${ticket.employeeEmail}` : ''}</p>
        {ticket.description && <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-slate-800">{ticket.description}</p>}
        <ol className="space-y-2">
          {ticket.replies.map(r => r.event ? (
            <li key={r.id} className="text-center text-xs text-slate-400">{r.senderName} {r.event === 'closed' ? 'closed' : 'reopened'} this ticket · {formatTicketDate(r.timestamp)}</li>
          ) : (
            <li key={r.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-800">{r.senderName}</span>
                <Badge variant={r.senderRole === 'employee' ? 'default' : 'indigo'} size="sm">{r.senderRole === 'employee' ? 'Employee' : r.senderRole === 'team_lead' ? 'Team lead' : r.senderRole.toUpperCase()}</Badge>
                <span className="text-slate-400">{formatTicketDate(r.timestamp)}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-slate-800">{r.message}</p>
            </li>
          ))}
        </ol>
        {ticket.replies.length === 0 && <p className="text-xs text-slate-400">No replies yet.</p>}
      </div>
    </Modal>
  );
}
