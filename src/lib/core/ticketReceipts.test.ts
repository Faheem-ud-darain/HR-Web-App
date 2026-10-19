import { describe, it, expect } from 'vitest';
import { receiptReplyIndex, isSentByOwner, ownerHasSeenMessage } from './ticketReceipts';
import type { TicketReply } from '../hr/types';

const owner = { employeeEmail: 'Jane@delcargo.us', employeeName: 'Jane Doe' };
const reply = (over: Partial<TicketReply>): TicketReply => ({ id: 'r', senderName: 'HR Manager', senderRole: 'hr', message: 'hi', timestamp: '2026-10-19T10:00:00Z', ...over });
const ticket = (replies: TicketReply[]) => ({ ...owner, replies });

describe('receiptReplyIndex', () => {
  it('puts the receipt under the newest message when HR/Admin sent it', () => {
    expect(receiptReplyIndex(ticket([reply({ senderEmail: 'jane@delcargo.us', senderRole: 'employee', senderName: 'Jane Doe' }), reply({ senderEmail: 'hr@delcargo.us' })]))).toBe(1);
  });
  it('shows nothing once the owner has replied since (nothing left to confirm)', () => {
    expect(receiptReplyIndex(ticket([reply({}), reply({ senderEmail: 'JANE@delcargo.us', senderRole: 'employee', senderName: 'Jane Doe' })]))).toBe(-1);
  });
  it('skips a trailing close/reopen event and still uses the last real message', () => {
    expect(receiptReplyIndex(ticket([reply({}), reply({ event: 'closed', message: '' })]))).toBe(0);
  });
  it('shows nothing when the last real message is the owner\'s, even with an event after it', () => {
    expect(receiptReplyIndex(ticket([reply({}), reply({ senderRole: 'employee', senderName: 'Jane Doe' }), reply({ event: 'closed', message: '' })]))).toBe(-1);
  });
  it('shows nothing for an empty thread or one with only events', () => {
    expect(receiptReplyIndex(ticket([]))).toBe(-1);
    expect(receiptReplyIndex(ticket([reply({ event: 'closed', message: '' })]))).toBe(-1);
  });
});

describe('isSentByOwner', () => {
  it('matches by email case-insensitively, and by name for old replies without an email', () => {
    expect(isSentByOwner(reply({ senderEmail: 'jane@DELCARGO.us' }), owner)).toBe(true);
    expect(isSentByOwner(reply({ senderEmail: 'hr@delcargo.us', senderName: 'Jane Doe' }), owner)).toBe(false); // email wins over a look-alike name
    expect(isSentByOwner(reply({ senderName: ' jane doe ' }), owner)).toBe(true);
    expect(isSentByOwner(reply({ senderName: 'HR Manager' }), owner)).toBe(false);
  });
});

describe('ownerHasSeenMessage', () => {
  it('is true only if the owner\'s view is at or after the message', () => {
    expect(ownerHasSeenMessage('2026-10-19T10:00:01Z', '2026-10-19T10:00:00Z')).toBe(true);
    expect(ownerHasSeenMessage('2026-10-19T10:00:00Z', '2026-10-19T10:00:00Z')).toBe(true);
    expect(ownerHasSeenMessage('2026-10-19T09:59:59Z', '2026-10-19T10:00:00Z')).toBe(false);
  });
  it('is false when the owner has never opened it or the value is junk', () => {
    expect(ownerHasSeenMessage(null, '2026-10-19T10:00:00Z')).toBe(false);
    expect(ownerHasSeenMessage(undefined, '2026-10-19T10:00:00Z')).toBe(false);
    expect(ownerHasSeenMessage('not a date', '2026-10-19T10:00:00Z')).toBe(false);
  });
});
