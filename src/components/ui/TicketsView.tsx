'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useProfiles, useTickets, hrActions, Ticket, Profile, displayName, isTechnicalSupportMember } from '@/lib/hrData';
import { getSessionEmail } from '@/lib/session';
import { useStickToBottom } from '@/lib/useStickToBottom';
import { PlusIcon as Plus } from '@/components/ui/icons';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { pushModal, popModal } from '@/lib/modalStack';
import { useNativeKeyboard } from '@/hooks/useNativeKeyboard';
import { Button } from '@/components/ui/Button';
import { useSessionEmail } from '@/lib/useSession';
import { ticketActivityMs, type TicketRole } from '@/components/ui/tickets/ticketHelpers';
import { TicketListPanel } from '@/components/ui/tickets/TicketListPanel';
import { TicketConversationPanel } from '@/components/ui/tickets/TicketConversationPanel';
import { TicketFilterBar, type DeptFilter, type StatusFilter, type ViewTab } from '@/components/ui/tickets/TicketFilterBar';
import { NewTicketModal } from '@/components/ui/tickets/NewTicketModal';
import { InspectEmployeeModal } from '@/components/ui/tickets/InspectEmployeeModal';
import { ForwardToHrAdminModal } from '@/components/ui/ForwardToHrAdminModal';
import { useTicketLiveState } from '@/components/ui/tickets/useTicketLiveState';
import { canSeeTicket } from '@/lib/core/ticketVisibility';

interface TicketsViewProps {
  role: TicketRole;
}

// The Support Help Desk for every role: a filterable ticket list beside the open conversation. This file loads
// and scopes the tickets and lays the screen out; the pieces live in ./tickets (live presence and typing,
// reply box, filter bar, and the new-ticket / inspect / forward dialogs).
export function TicketsView({ role }: TicketsViewProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const currentEmail = useSessionEmail() || '';
  const [userProfile, setUserProfile] = useState<Profile | null>(null);

  // Native keyboard height, so the ticket panel can pad itself above the keyboard on iOS/Android.
  const { keyboardHeight } = useNativeKeyboard();

  // Dialogs and the full-size image viewer
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [inspectEmployee, setInspectEmployee] = useState<Profile | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; name?: string } | null>(null);
  // "Forward to HR & Admin" is hr/admin only, gated by `role` directly rather than `isPrivileged` (which also
  // covers Technical Team members: this is HR/Admin's private line to each other).
  const canForwardToHrAdmin = role === 'hr' || role === 'admin';
  const [forwardingTicket, setForwardingTicket] = useState<Ticket | null>(null);

  // On mobile an open ticket is a fixed full-screen overlay, so it hides the floating bottom nav like any other
  // modal does (via modalStack).
  const hasSelectedTicket = !!selectedTicket;
  useEffect(() => {
    if (hasSelectedTicket) {
      pushModal();
      return () => popModal();
    }
  }, [hasSelectedTicket]);

  const isTechnicalTeam = isTechnicalSupportMember(userProfile?.teams);
  const isPrivileged = role === 'hr' || role === 'admin' || isTechnicalTeam;
  const isAdmin = role === 'admin';
  const isEmp = role === 'employee' || role === 'team_lead';

  // Ticket/reply records only snapshot a name string, not a live Profile, so HR/Admin aliases are looked up in
  // the employees list (falling back to the raw name for a deleted employee or an "HR Manager" label).
  const nameFor = (name: string): string => {
    if (!isPrivileged) return name;
    const emp = employees.find(e => e.fullName === name);
    return emp ? displayName(emp, role as 'hr' | 'admin') : name;
  };
  // The matched profile itself, so avatars can show the sender's real photo.
  const profileFor = (name: string): Profile | undefined => employees.find(e => e.fullName === name);

  // List filters: privileged viewers start on their open queue.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(isPrivileged ? 'open' : 'all');
  const [deptFilter, setDeptFilter] = useState<DeptFilter>('all');
  const [viewTab, setViewTab] = useState<ViewTab>('assigned');
  const [searchQuery, setSearchQuery] = useState('');
  const [ticketLimit, setTicketLimit] = useState<number>(50);

  // Each status tab gets its own fresh 50 + Load More count, so Load More on Open does not carry an inflated
  // limit over to Closed.
  const [limitFor, setLimitFor] = useState(statusFilter);
  if (statusFilter !== limitFor) {
    setLimitFor(statusFilter);
    setTicketLimit(50);
  }

  const visibleTickets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const myEmailLower = (currentEmail || '').toLowerCase();

    return tickets
      .filter(t => statusFilter === 'all' || t.status === statusFilter)
      .filter(t => deptFilter === 'all' || t.department === deptFilter)
      .filter(t => {
        if (!isTechnicalTeam || role === 'admin') return true;
        if (viewTab === 'my_tickets') return t.employeeEmail.toLowerCase() === myEmailLower;
        // 'assigned': incoming technical tickets from other employees
        return t.department === 'technical' && t.employeeEmail.toLowerCase() !== myEmailLower;
      })
      .filter(t => !q || (
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.employeeName.toLowerCase().includes(q) ||
        nameFor(t.employeeName).toLowerCase().includes(q)
      ))
      .sort((a, b) => ticketActivityMs(b) - ticketActivityMs(a));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- nameFor is a stable lookup over `employees`, which is already a dependency
  }, [tickets, statusFilter, deptFilter, viewTab, searchQuery, employees, isPrivileged, isTechnicalTeam, currentEmail, role]);

  const threadRef = useRef<HTMLDivElement>(null);
  const appliedDeepLinkRef = useRef(false);

  // Scope the fetched tickets to what this role may see, keep the open conversation live, and apply the
  // one-shot ?ticketId= deep link from a notification click.
  const applyTickets = (all: Ticket[], email: string, profile: Profile | null) => {
    const viewer = { role, email, technical: isTechnicalSupportMember(profile?.teams) };
    setTickets(all.filter(t => canSeeTicket(viewer, t)));

    // Incoming replies from other users/devices show up without the viewer reselecting the ticket.
    setSelectedTicket(prev => (prev ? all.find(t => t.id === prev.id) || prev : prev));

    if (!appliedDeepLinkRef.current && typeof window !== 'undefined') {
      const targetId = new URLSearchParams(window.location.search).get('ticketId');
      const target = targetId ? all.find(t => t.id === targetId) : undefined;
      if (target) {
        appliedDeepLinkRef.current = true;
        setSelectedTicket(target);
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  };

  const { data: allProfiles } = useProfiles();
  const { data: allTickets, isLoading: ticketsLoading, refetch: refetchTickets, isFetching: isFetchingTickets } = useTickets(
    ticketLimit,
    statusFilter === 'all' ? undefined : statusFilter,
  );

  useEffect(() => {
    const email = getSessionEmail() || '';

    let currentProfile = userProfile;
    if (allProfiles) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors server query data into the role-scoped local list/selection (applyTickets also keeps the open ticket live and handles the one-shot deep link)
      setEmployees(allProfiles);
      currentProfile = allProfiles.find(e => e.email && email && e.email.toLowerCase() === email.toLowerCase()) || null;
      setUserProfile(currentProfile);
    }

    if (allTickets) applyTickets(allTickets, email, currentProfile);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync only when the fetched profiles/tickets change; applyTickets/userProfile are derived from them
  }, [role, allProfiles, allTickets]);

  // Best-effort sweep for attachments on tickets closed 15+ days ago (see checkTicketAttachmentRetention in
  // hrData.ts). There is no server cron, so it runs once per visit to this page and refetches so a scrubbed
  // attachment disappears at once.
  useEffect(() => {
    hrActions.checkTicketAttachmentRetention().then(() => refetchTickets());
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only attachment retention sweep; refetchTickets is not a trigger
  }, []);

  const { isTicketLiveWithHR, ticketSeenState, typingNames } = useTicketLiveState({ role, currentEmail, selectedTicket, tickets, isPrivileged, isTechnicalTeam });

  // Stay at the newest reply when replies or the typing line change, unless the reader has scrolled up.
  useStickToBottom(threadRef, `${selectedTicket?.replies?.length ?? 0}:${typingNames.length}`, selectedTicket?.id);

  // Close / re-open, confirmed first.
  const [updatingTicketStatusId, setUpdatingTicketStatusId] = useState<string | null>(null);
  const [pendingTicketStatusAction, setPendingTicketStatusAction] = useState<{ id: string; action: 'closed' | 'open' } | null>(null);
  const handleCloseTicket = (id: string) => { if (!updatingTicketStatusId) setPendingTicketStatusAction({ id, action: 'closed' }); };
  const handleReopenTicket = (id: string) => { if (!updatingTicketStatusId) setPendingTicketStatusAction({ id, action: 'open' }); };

  const confirmTicketStatusChange = async () => {
    if (!pendingTicketStatusAction) return;
    const { id, action } = pendingTicketStatusAction;
    setPendingTicketStatusAction(null);
    const ticket = tickets.find(t => t.id === id) || selectedTicket;
    if (!ticket) return;
    setUpdatingTicketStatusId(id);
    try {
      await hrActions.updateTicketStatus(ticket, action, { name: userProfile?.fullName || (role === 'hr' ? 'HR' : role === 'admin' ? 'Admin' : 'Employee'), role, email: currentEmail });
      refetchTickets();
    } finally {
      setUpdatingTicketStatusId(null);
    }
  };

  const handleInspectApplicant = (email: string) => {
    const p = employees.find(e => e.email && email && e.email.toLowerCase() === email.toLowerCase());
    if (p) setInspectEmployee(p);
  };

  const isClosed = selectedTicket?.status === 'closed';
  // An employee can close (but not re-open) a ticket they filed themselves, e.g. once their issue is resolved.
  // Re-opening stays privileged-only: if it was not actually resolved, replying is the expected path.
  const isOwnTicket = !!selectedTicket && !!currentEmail && selectedTicket.employeeEmail.toLowerCase() === currentEmail.toLowerCase();
  const canCloseOwnTicket = isEmp && isOwnTicket && !isPrivileged;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Support Help Desk</h1>
          <p className="text-slate-500 text-sm">Open support cases, seek assistance, and view ticket logs.</p>
        </div>
        {isEmp && (
          <Button variant="primary" size="md" onClick={() => setIsNewOpen(true)}>
            <Plus className="h-5 w-5" /> File a Ticket
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className={`lg:col-span-5 space-y-3 ${selectedTicket ? 'hidden lg:block' : 'block'}`}>
          <TicketFilterBar
            showTechTabs={isTechnicalTeam && role !== 'admin'}
            viewTab={viewTab}
            onViewTab={setViewTab}
            shown={visibleTickets.length}
            total={tickets.length}
            isPrivileged={isPrivileged}
            search={searchQuery}
            onSearch={setSearchQuery}
            status={statusFilter}
            onStatus={setStatusFilter}
            showDept={isAdmin}
            dept={deptFilter}
            onDept={setDeptFilter}
          />
          <TicketListPanel visibleTickets={visibleTickets} selectedTicket={selectedTicket} setSelectedTicket={setSelectedTicket} isEmp={isEmp} isTicketLiveWithHR={isTicketLiveWithHR} nameFor={nameFor} currentEmail={currentEmail} ticketsLoading={ticketsLoading} tickets={tickets} setStatusFilter={setStatusFilter} setSearchQuery={setSearchQuery} allTickets={allTickets} ticketLimit={ticketLimit} setTicketLimit={setTicketLimit} isFetchingTickets={isFetchingTickets} onNewTicket={isEmp ? () => setIsNewOpen(true) : undefined} />
        </div>

        {/* Conversation panel: a fixed full-screen overlay on mobile. `keyboardHeight` lifts its content above the
            native keyboard (the chat log shrinks, the header and reply bar keep their size); layout.tsx switches
            <main> to overflow-hidden while it is open so the page behind does not scroll under it. */}
        <TicketConversationPanel
          selectedTicket={selectedTicket}
          keyboardHeight={keyboardHeight}
          setSelectedTicket={setSelectedTicket}
          isEmp={isEmp}
          isTicketLiveWithHR={isTicketLiveWithHR}
          isPrivileged={isPrivileged}
          onReplySent={refetchTickets}
          canCloseOwnTicket={canCloseOwnTicket}
          isClosed={isClosed}
          handleCloseTicket={handleCloseTicket}
          updatingTicketStatusId={updatingTicketStatusId}
          handleReopenTicket={handleReopenTicket}
          canForwardToHrAdmin={canForwardToHrAdmin}
          openForward={setForwardingTicket}
          handleInspectApplicant={handleInspectApplicant}
          nameFor={nameFor}
          currentEmail={currentEmail}
          userProfile={userProfile}
          profileFor={profileFor}
          role={role}
          ticketSeenState={ticketSeenState}
          onOpenImage={(src, name) => setLightbox({ src, name })}
          typingNames={typingNames}
          scrollRef={threadRef}
          isAdmin={isAdmin}
        />
      </div>

      <NewTicketModal isOpen={isNewOpen} onClose={() => setIsNewOpen(false)} userProfile={userProfile} role={role} currentEmail={currentEmail} onCreated={refetchTickets} />

      {inspectEmployee && (
        <InspectEmployeeModal
          employee={inspectEmployee}
          isPrivileged={isPrivileged}
          role={role}
          onClose={() => setInspectEmployee(null)}
          onViewPhoto={(src, name) => setLightbox({ src, name })}
        />
      )}

      <ImageLightbox src={lightbox?.src ?? null} alt={lightbox?.name} downloadName={lightbox?.name} onClose={() => setLightbox(null)} />

      {forwardingTicket && (
        <ForwardToHrAdminModal
          sender={{ email: currentEmail, name: userProfile?.fullName || (role === 'hr' ? 'HR Manager' : 'System Admin'), role: role === 'admin' ? 'admin' : 'hr' }}
          kind="ticket"
          sourceLabel={forwardingTicket.title}
          sourceId={forwardingTicket.id}
          heading="Ticket"
          title={forwardingTicket.title}
          body={forwardingTicket.description}
          noun="ticket"
          onClose={() => setForwardingTicket(null)}
        />
      )}

      <ConfirmDialog
        isOpen={pendingTicketStatusAction !== null}
        onClose={() => setPendingTicketStatusAction(null)}
        onConfirm={confirmTicketStatusChange}
        title={pendingTicketStatusAction?.action === 'closed' ? 'Close this ticket?' : 'Re-open this ticket?'}
        message={pendingTicketStatusAction?.action === 'closed'
          ? 'Are you sure you want to mark this support ticket as closed?'
          : 'Are you sure you want to re-open this ticket?'}
        confirmLabel={updatingTicketStatusId ? 'Saving…' : (pendingTicketStatusAction?.action === 'closed' ? 'Close Ticket' : 'Re-open')}
        variant="warning"
        loading={!!updatingTicketStatusId}
      />
    </div>
  );
}
