import { describe, it, expect } from 'vitest';
import { pageTitle } from './pageTitle';

describe('pageTitle', () => {
  it('names the section after the role', () => {
    expect(pageTitle('/hr/tickets')).toBe('Tickets');
    expect(pageTitle('/employee/leaves')).toBe('Leaves');
    expect(pageTitle('/admin/payroll')).toBe('Payroll');
  });
  it('uses friendly names for the multi-word and special sections', () => {
    expect(pageTitle('/admin/team-chats')).toBe('Team Chats');
    expect(pageTitle('/hr/direct-messages')).toBe('Direct Messages');
    expect(pageTitle('/admin/hr-admin')).toBe('HR & Admin');
    expect(pageTitle('/employee/chat')).toBe('Team Chat');
    expect(pageTitle('/hr/assistant')).toBe('Del');
    expect(pageTitle('/hr/some-new-page')).toBe('Some New Page');
  });
  it('has no title on a home page or without a path', () => {
    expect(pageTitle('/admin')).toBe('');
    expect(pageTitle('/hr/')).toBe('');
    expect(pageTitle(null)).toBe('');
    expect(pageTitle(undefined)).toBe('');
  });
  it('ignores anything deeper than the section', () => {
    expect(pageTitle('/hr/tickets/123')).toBe('Tickets');
  });
});
