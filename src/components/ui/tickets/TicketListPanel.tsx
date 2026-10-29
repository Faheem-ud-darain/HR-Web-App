'use client';

import { StatusDot } from '@/components/ui/StatusDot';
import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { UserIcon as User } from '@/components/ui/icons';
import { formatTicketDate } from '@/components/ui/tickets/ticketHelpers';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Ticket } from '@/lib/hrData';
import { lastReplyPreview } from '@/lib/core/ticketReceipts';

interface TicketListPanelProps {
  visibleTickets: Ticket[];
  selectedTicket: Ticket | null;
  setSelectedTicket: React.Dispatch<React.SetStateAction<Ticket | null>>;
  isEmp: boolean;
  isTicketLiveWithHR: (ticketId: string) => boolean;
  nameFor: (name: string) => string;
  currentEmail: string;
  ticketsLoading: boolean;
  tickets: Ticket[];
  setStatusFilter: React.Dispatch<React.SetStateAction<"all" | "open" | "closed">>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  allTickets: Ticket[] | undefined;
  ticketLimit: number;
  setTicketLimit: React.Dispatch<React.SetStateAction<number>>;
  isFetchingTickets: boolean;
  // Offered in the empty list, for people who can file tickets.
  onNewTicket?: () => void;
}

export function TicketListPanel({ visibleTickets, selectedTicket, setSelectedTicket, isEmp, isTicketLiveWithHR, nameFor, currentEmail, ticketsLoading, tickets, setStatusFilter, setSearchQuery, allTickets, ticketLimit, setTicketLimit, isFetchingTickets, onNewTicket }: TicketListPanelProps) {
  return (
    <div className="space-y-2 lg:max-h-[550px] lg:overflow-y-auto lg:pr-1">
      {visibleTickets.map(t => {
        const active = selectedTicket?.id === t.id;
        return (
          <Card
            key={t.id}
            aria-current={active ? 'true' : undefined}
            onClick={() => setSelectedTicket(t)}
            className={`border transition-colors cursor-pointer p-4 ${
              active ? 'border-orange-500 bg-orange-50/20' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <span className="font-bold text-slate-900 text-sm line-clamp-1 flex items-center gap-1.5">
                {t.title}
                {isEmp && isTicketLiveWithHR(t.id) && (
                  <span className="inline-flex items-center gap-1 text-caption font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full shrink-0">
                    <StatusDot tone="emerald" pulse /> LIVE
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant={t.department === 'technical' ? 'info' : 'indigo'}>{t.department === 'technical' ? 'Tech' : 'HR'}</Badge>
                <Badge variant={t.status === 'open' ? 'warning' : 'success'}>
                  {t.status === 'open' ? 'Open' : 'Closed'}
                </Badge>
              </div>
            </div>
            {(() => {
              const last = lastReplyPreview(t.replies);
              return <p className="text-xs text-slate-500 line-clamp-1 mb-2">{last ? <><span className="font-semibold">{nameFor(last.who)}:</span> {last.text}</> : t.description}</p>;
            })()}
            <div className="flex items-center justify-between text-caption text-slate-500 font-semibold">
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> {nameFor(t.employeeName)}
                {t.employeeEmail.toLowerCase() === (currentEmail || '').toLowerCase() && (
                  <span className="text-caption font-bold text-orange-600 bg-orange-50 border border-orange-200 px-1 rounded">You</span>
                )}
              </span>
              <span>{formatTicketDate(t.createdAt)}</span>
            </div>
          </Card>
        );
      })}
      {ticketsLoading && <ListSkeleton rows={5} />}
      {!ticketsLoading && visibleTickets.length === 0 && tickets.length === 0 && (
        <EmptyState bordered py={12} size="xs" action={onNewTicket && <Button type="button" size="sm" onClick={onNewTicket}>File a ticket</Button>}>
          {onNewTicket ? 'No tickets yet. Need help from HR or Technical Support?' : 'No tickets yet.'}
        </EmptyState>
      )}
      {!ticketsLoading && visibleTickets.length === 0 && tickets.length > 0 && (
        <EmptyState bordered py={12} size="xs" action={<Button type="button" variant="ghost" size="sm" onClick={() => { setStatusFilter('all'); setSearchQuery(''); }}>Clear filters</Button>}>
          No tickets match your filters.
        </EmptyState>
      )}

      {allTickets && allTickets.length >= ticketLimit && (
        <div className="pt-2 pb-1 text-center">
          <Button
            type="button"
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => setTicketLimit(prev => prev + 50)}
            disabled={isFetchingTickets}
            className="border border-slate-200"
          >
            {isFetchingTickets ? (
              <span>Loading more tickets…</span>
            ) : (
              <span>Load More Tickets (+50)</span>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
