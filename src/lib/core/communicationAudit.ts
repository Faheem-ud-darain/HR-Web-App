// The permanent trail of who sent what, from where. Every ticket, chat message and announcement is stamped on the server with the
// signed-in account, the visitor's address and the device, and kept in an append-only table that only HR and Admin can read.
// This file is the one rule for what an entry holds and how a device is described. Pure, so it is tested.
export const COMMUNICATION_KINDS = ['ticket_create', 'ticket_reply', 'ticket_closed', 'ticket_reopened', 'team_chat', 'announcement'] as const;
export type CommunicationKind = (typeof COMMUNICATION_KINDS)[number];

export const KIND_LABEL: Record<CommunicationKind, string> = {
  ticket_create: 'Ticket opened', ticket_reply: 'Ticket reply', ticket_closed: 'Ticket closed', ticket_reopened: 'Ticket reopened',
  team_chat: 'Chat message', announcement: 'Announcement',
};

/** "Safari on iOS", "Chrome on Windows", or "Delcargo app on iOS" for the phone app (its web view does not say Safari). */
export function describeDevice(userAgent: string): string {
  const ua = userAgent || '';
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : '';
  const nativeApp = /; wv\)/.test(ua) || (/iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua));
  const browser = nativeApp ? 'Delcargo app' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
  return [browser, os].filter(Boolean).join(' on ') || 'another device';
}

const ID = /^[A-Za-z0-9_:-]{1,80}$/;
const DEVICE_ID = /^[A-Za-z0-9_-]{6,64}$/;

export interface AuditEntry {
  kind: CommunicationKind; ref_id: string; message_id: string; actor: string; actor_role: string; claimed_sender: string;
  ip: string; country: string; device: string; user_agent: string; device_id: string; occurred_at: string;
}

/**
 * The entry to store for one communication. `actor` is the account the SERVER verified from the session; `claimed_sender` is what the
 * message itself says (the two differ if someone posts under another name). The address and device come from the request, never from the body.
 */
export function buildAuditEntry(
  input: { kind?: unknown; refId?: unknown; messageId?: unknown; claimedSender?: unknown; deviceId?: unknown },
  who: { email: string; role: string; ip: string | null; country: string | null; userAgent: string; now: number },
): { ok: true; entry: AuditEntry } | { ok: false; error: string } {
  if (!COMMUNICATION_KINDS.includes(input.kind as CommunicationKind)) return { ok: false, error: 'Unknown kind.' };
  if (typeof input.refId !== 'string' || !ID.test(input.refId)) return { ok: false, error: 'A valid reference is required.' };
  const optional = (v: unknown, test: RegExp) => (typeof v === 'string' && test.test(v) ? v : '');
  const claimed = typeof input.claimedSender === 'string' ? input.claimedSender.trim().toLowerCase().slice(0, 120) : '';
  return {
    ok: true,
    entry: {
      kind: input.kind as CommunicationKind, ref_id: input.refId, message_id: optional(input.messageId, ID),
      actor: who.email.toLowerCase(), actor_role: who.role, claimed_sender: claimed,
      ip: who.ip || '', country: (who.country || '').toUpperCase().slice(0, 2), device: describeDevice(who.userAgent), user_agent: who.userAgent.slice(0, 240),
      device_id: optional(input.deviceId, DEVICE_ID), occurred_at: new Date(who.now).toISOString(),
    },
  };
}

/** The message says one account sent it but a different account was signed in. */
export const isNameMismatch = (e: { actor: string; claimed_sender: string }): boolean => !!e.claimed_sender && e.claimed_sender !== e.actor;
