'use client';

import { StatusDot } from '@/components/ui/StatusDot';
import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Forward, User } from 'lucide-react';
import { formatTicketDate } from '@/components/ui/tickets/ticketHelpers';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Ticket } from '@/lib/hrData';

interface TicketListPanelProps {
  visibleTickets: Ticket[];
  selectedTicket: Ticket | null;
  setSelectedTicket: React.Dispatch<React.SetStateAction<Ticket | null>>;
  isEmp: boolean;
  isTicketLiveWithHR: (ticketId: string) => boolean;
  canForwardToHrAdmin: boolean;
  openForward: (ticket: Ticket) => void;
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
}

export function TicketListPanel({ visibleTickets, selectedTicket, setSelectedTicket, isEmp, isTicketLiveWithHR, canForwardToHrAdmin, openForward, nameFor, currentEmail, ticketsLoading, tickets, setStatusFilter, setSearchQuery, allTickets, ticketLimit, setTicketLimit, isFetchingTickets }: TicketListPanelProps) {
  return (
    <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
      {visibleTickets.map(t => {
        const active = selectedTicket?.id === t.id;
        return (
          <Card
            key={t.id}
            onClick={() => setSelectedTicket(t)}
            className={`border transition-colors cursor-pointer p-4 ${
              active ? 'border-orange-500 bg-orange-50/20' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <span className="font-bold text-slate-900 text-sm line-clamp-1 flex items-center gap-1.5">
                {t.title}
                {isEmp && isTicketLiveWithHR(t.id) && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full shrink-0">
                    <StatusDot tone="emerald" pulse /> LIVE
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border uppercase ${
                  t.department === 'technical'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-purple-50 text-purple-700 border-purple-200'
                }`}>
                  {t.department === 'technical' ? 'Tech' : 'HR'}
                </span>
                <Badge variant={t.status === 'open' ? 'warning' : 'success'}>
                  {t.status === 'open' ? 'Open' : 'Closed'}
                </Badge>
                {canForwardToHrAdmin && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openForward(t); }}
                    title="Forward to HR & Admin"
                    className="h-6 w-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                  >
                    <Forward className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500 line-clamp-1 mb-2">{t.description}</p>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" /> {nameFor(t.employeeName)}
                {t.employeeEmail.toLowerCase() === (currentEmail || '').toLowerCase() && (
                  <span className="text-[9px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-1 rounded">You</span>
                )}
              </span>
              <span>{formatTicketDate(t.createdAt)}</span>
            </div>
          </Card>
        );
      })}
      {ticketsLoading && <ListSkeleton rows={5} />}
      {!ticketsLoading && visibleTickets.length === 0 && tickets.length === 0 && (
        <div className="text-center py-12 text-slate-400 font-semibold italic text-xs border border-dashed border-slate-200 rounded-xl bg-white">
          No tickets listed.
        </div>
      )}
      {!ticketsLoading && visibleTickets.length === 0 && tickets.length > 0 && (
        <div className="text-center py-12 text-slate-400 font-semibold text-xs border border-dashed border-slate-200 rounded-xl bg-white space-y-2">
          <p className="italic">No tickets match your filters.</p>
          <button
            type="button"
            onClick={() => { setStatusFilter('all'); setSearchQuery(''); }}
            className="text-orange-600 hover:text-orange-700 font-bold underline not-italic"
          >
            Clear filters
          </button>
        </div>
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
