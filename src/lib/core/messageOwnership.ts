// Plain TypeScript. "Is this message mine?": which side of a conversation a message sits on. Chat messages always carry the
// sender's email; ticket replies from before emails were stored only carry a name, so tickets accept looser matches.

type Role = 'admin' | 'hr' | 'employee' | 'team_lead';

export const sameEmail = (a: string | undefined | null, b: string | undefined | null): boolean => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

const norm = (s: string) => s.trim().toLowerCase();

export interface Viewer { email: string; role: Role; fullName?: string }

/** A chat message is mine when I sent it. */
export const isOwnChatMessage = (senderEmail: string, viewer: Pick<Viewer, 'email'>): boolean => sameEmail(senderEmail, viewer.email);

/**
 * A ticket reply is mine when, in this order: it carries my email; or I am HR and an HR member wrote it, or I am Admin and an
 * Admin wrote it (the staff of a role answer as one voice); or, for old replies with no email, its sender name matches mine (equal,
 * or one starts with the other) or contains the start of my email.
 */
export function isOwnTicketReply(reply: { senderEmail?: string; senderName?: string; senderRole: string }, viewer: Viewer): boolean {
  if (sameEmail(reply.senderEmail, viewer.email)) return true;
  if (viewer.role === 'hr' && reply.senderRole === 'hr') return true;
  if (viewer.role === 'admin' && reply.senderRole === 'admin') return true;
  if (viewer.fullName && reply.senderName) {
    const sender = norm(reply.senderName), me = norm(viewer.fullName);
    return sender === me || sender.startsWith(me) || me.startsWith(sender);
  }
  return !!viewer.email && !!reply.senderName && norm(reply.senderName).includes(norm(viewer.email.split('@')[0]));
}

/** The person who opened a ticket is "me" when the ticket carries my email or my full name. */
export const isTicketAuthor = (ticket: { employeeEmail?: string; employeeName?: string }, viewer: Viewer): boolean =>
  sameEmail(ticket.employeeEmail, viewer.email) || (!!viewer.fullName && !!ticket.employeeName && norm(ticket.employeeName) === norm(viewer.fullName));
