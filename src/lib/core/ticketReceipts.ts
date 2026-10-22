// Which message in a ticket thread carries the "Seen / Not seen yet" receipt.
// Pure logic (no I/O) so the rules are unit-tested; used by TicketReplyLog.
import type { TicketReply } from '../hr/types';

interface ReceiptTicket {
  employeeEmail: string;
  employeeName: string;
  replies: TicketReply[];
}

/** True if this reply was written by the ticket's owner (matched by email, or by name for old replies that have no sender email). */
export function isSentByOwner(reply: TicketReply, ticket: Pick<ReceiptTicket, 'employeeEmail' | 'employeeName'>): boolean {
  if (reply.senderEmail) return reply.senderEmail.toLowerCase() === ticket.employeeEmail.toLowerCase();
  return reply.senderName.trim().toLowerCase() === ticket.employeeName.trim().toLowerCase();
}

/**
 * Index of the reply that should carry the receipt, or -1 for none: the newest
 * real message (close/reopen events are skipped) — but only if someone OTHER
 * than the owner sent it. If the owner has answered since, there is nothing
 * left for them to have "not seen".
 */
export function receiptReplyIndex(ticket: ReceiptTicket): number {
  let lastReal = -1;
  ticket.replies.forEach((reply, i) => { if (!reply.event) lastReal = i; });
  if (lastReal === -1) return -1;
  return isSentByOwner(ticket.replies[lastReal], ticket) ? -1 : lastReal;
}

/** Whether the owner's last view (ISO string) is at or after the message's timestamp. */
export function ownerHasSeenMessage(ownerSeenAt: string | null | undefined, messageTimestamp: string): boolean {
  if (!ownerSeenAt) return false;
  const seen = new Date(ownerSeenAt).getTime();
  return !isNaN(seen) && seen >= new Date(messageTimestamp).getTime();
}
