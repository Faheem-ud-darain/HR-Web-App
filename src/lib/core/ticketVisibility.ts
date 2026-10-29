// Plain TypeScript. WHO SEES WHICH SUPPORT TICKET, in one place. It used to be written three times (the database filter in
// useTickets, a second filter in TicketsView, and the activity-dot scopes), and the copies disagreed about HR.
//   Admin                              every ticket
//   HR                                 the HR department's tickets
//   Technical Support team member      their own tickets and the technical queue
//   everyone else                      their own tickets
export interface TicketViewer { role: string; email: string; technical: boolean }
interface TicketLike { employeeEmail: string; department: string }

const lower = (s: string | undefined | null) => (s || '').trim().toLowerCase();

/** Whether this person may see this ticket. */
export function canSeeTicket(viewer: TicketViewer, ticket: TicketLike): boolean {
  if (viewer.role === 'admin') return true;
  if (viewer.role === 'hr') return ticket.department === 'hr';
  return lower(ticket.employeeEmail) === lower(viewer.email) || (viewer.technical && ticket.department === 'technical');
}

/** HR and Admin download the whole list (the screen then narrows HR to its department); everyone else asks for only what they may see. */
export const fetchesEveryTicket = (viewer: TicketViewer): boolean => viewer.role === 'hr' || viewer.role === 'admin';

/** What a person who does NOT see everything asks the database for: their own tickets, plus the technical queue if they are on that team. */
export function ticketQuery(viewer: TicketViewer): { ownEmail: string; includeTechnical: boolean } | null {
  return fetchesEveryTicket(viewer) ? null : { ownEmail: lower(viewer.email), includeTechnical: viewer.technical };
}
