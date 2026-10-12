'use client';

import { useTickets, Ticket } from '@/lib/hrData';
import { formatDateTimeNY } from '@/lib/timezone';

export function isImageAttachment(name?: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name || '');
}

export function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Shared formatter for every timestamp shown on this screen: Ticket.
// createdAt (PocketBase's raw `created` system field, e.g. "2026-07-24
// 16:18:33.852Z") and TicketReply.timestamp (an ISO string as of the
// addTicketReply fix in hrData.ts — see that comment for why it used to
// be a bare "04:18 PM" with no date, which silently discarded which day
// a reply happened on and made multi-day threads unreadable). Formats
// both the same way — full date + time — so the whole thread reads
// consistently instead of the opening message showing a real date and
// every reply after it showing only a time.
//
// Legacy replies created before that fix are still stored as a bare
// "04:18 PM"-style string with no date at all. Handing that straight to
// `new Date(...)` is a trap: some JS engines will silently parse a
// time-only string as *today's* date at that time, which would display
// a wrong, made-up date rather than the honest "we don't know" — worse
// than the plain time it shows today. The regex below detects that exact
// legacy shape and returns it unchanged instead of risking a fabricated
// date.
export const BARE_TIME_ONLY = /^\d{1,2}:\d{2}\s*[AP]M$/i;

export function formatTicketDate(raw: string): string {
  if (BARE_TIME_ONLY.test(raw.trim())) return raw; // legacy format, no date was ever recorded — don't guess one
  const d = new Date(raw.replace(' ', 'T'));
  if (isNaN(d.getTime())) return raw; // fall back to the raw string rather than showing "Invalid Date"
  return formatDateTimeNY(d);
}

// "Most recent activity" for sort purposes: a fresh reply on an old ticket
// should bump it back to the top of the list, same as any inbox/chat app —
// not just whichever ticket was originally opened most recently (that's
// all useTickets()'s own `sort: '-created'` query gives us, and it never
// changes again once a ticket exists). Takes the later of createdAt and the
// newest reply's timestamp.
//
// Legacy replies predating the addTicketReply timestamp fix (see the
// formatTicketDate comment above) are stored as a bare "04:18 PM" string
// with no date at all. `Date.parse` on a time-only string isn't reliably
// rejected the way `new Date(...)` sometimes is — some engines silently
// resolve it against *today's* date, which would make an old reply look
// like the most recent activity on every single ticket that has one,
// corrupting the whole sort. BARE_TIME_ONLY (already used above) is reused
// here to skip those entries entirely rather than let a bad parse in.
export function ticketActivityMs(ticket: Ticket): number {
  let latest = Date.parse(ticket.createdAt.replace(' ', 'T'));
  if (isNaN(latest)) latest = 0;
  for (const rep of ticket.replies) {
    if (BARE_TIME_ONLY.test(rep.timestamp.trim())) continue;
    const t = Date.parse(rep.timestamp);
    if (!isNaN(t) && t > latest) latest = t;
  }
  return latest;
}
