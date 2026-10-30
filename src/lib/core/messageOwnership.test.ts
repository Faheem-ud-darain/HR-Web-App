import { describe, expect, it } from 'vitest';
import { isOwnChatMessage, isOwnTicketReply, isTicketAuthor, type Viewer } from './messageOwnership';

const emp: Viewer = { email: 'ann@delcargo.us', role: 'employee', fullName: 'Ann Lee' };

describe('isOwnChatMessage', () => {
  it('matches the sender email ignoring case and spaces', () => {
    expect(isOwnChatMessage(' ANN@delcargo.us ', emp)).toBe(true);
    expect(isOwnChatMessage('bob@delcargo.us', emp)).toBe(false);
  });
});

describe('isOwnTicketReply', () => {
  it('is mine when the reply carries my email', () => {
    expect(isOwnTicketReply({ senderEmail: 'ann@delcargo.us', senderRole: 'employee' }, emp)).toBe(true);
  });
  it('treats every HR reply as mine for HR, and every Admin reply as mine for Admin', () => {
    expect(isOwnTicketReply({ senderEmail: 'other@delcargo.us', senderRole: 'hr' }, { email: 'hr@delcargo.us', role: 'hr' })).toBe(true);
    expect(isOwnTicketReply({ senderEmail: 'other@delcargo.us', senderRole: 'admin' }, { email: 'a@delcargo.us', role: 'admin' })).toBe(true);
    expect(isOwnTicketReply({ senderEmail: 'other@delcargo.us', senderRole: 'hr' }, { email: 'a@delcargo.us', role: 'admin' })).toBe(false);
  });
  it('falls back to the sender name for old replies without an email', () => {
    expect(isOwnTicketReply({ senderName: 'ann lee', senderRole: 'employee' }, emp)).toBe(true);
    expect(isOwnTicketReply({ senderName: 'Ann Lee (Tech)', senderRole: 'employee' }, emp)).toBe(true);
    expect(isOwnTicketReply({ senderName: 'Bob Ray', senderRole: 'employee' }, emp)).toBe(false);
  });
  it('is not mine for someone else', () => {
    expect(isOwnTicketReply({ senderEmail: 'bob@delcargo.us', senderName: 'Bob Ray', senderRole: 'employee' }, emp)).toBe(false);
  });
});

describe('isTicketAuthor', () => {
  it('matches by email or by full name', () => {
    expect(isTicketAuthor({ employeeEmail: 'ann@delcargo.us' }, emp)).toBe(true);
    expect(isTicketAuthor({ employeeName: ' Ann Lee ' }, emp)).toBe(true);
    expect(isTicketAuthor({ employeeEmail: 'bob@delcargo.us', employeeName: 'Bob' }, emp)).toBe(false);
  });
});
