import { describe, it, expect } from 'vitest';
import { isChatScreen, isNavActive, navDotKey, navGroups, navRoot, policyItem, quickLinks } from './nav';

const hrefs = (role: Parameters<typeof navGroups>[0], flags = {}) => navGroups(role, flags).flatMap(g => g.items.map(i => i.href));

describe('navGroups', () => {
  it('starts every role with its home page on its own', () => {
    for (const role of ['admin', 'hr', 'employee'] as const) {
      const [first] = navGroups(role);
      expect(first.title).toBeNull();
      expect(first.items.map(i => i.href)).toEqual([navRoot(role)]);
    }
  });
  it('keeps every page under its own role and lists none twice', () => {
    for (const role of ['admin', 'hr', 'employee'] as const) {
      const all = hrefs(role, { trackingEnabled: true, isTeamLead: true });
      expect(new Set(all).size).toBe(all.length);
      expect(all.every(h => h.startsWith(navRoot(role)))).toBe(true);
    }
  });
  it('gives only admins payroll & insights, and only hr onboarding and team management', () => {
    expect(hrefs('admin')).toContain('/admin/insights');
    expect(hrefs('hr')).not.toContain('/hr/insights');
    expect(hrefs('hr')).toEqual(expect.arrayContaining(['/hr/onboarding', '/hr/teams']));
    expect(hrefs('admin')).not.toContain('/admin/onboarding');
  });
  it('adds the tracker and team tasks to an employee only when they apply', () => {
    expect(hrefs('employee')).not.toContain('/employee/tracker');
    expect(hrefs('employee')).not.toContain('/employee/tasks');
    expect(hrefs('employee', { trackingEnabled: true })).toContain('/employee/tracker');
    expect(hrefs('employee', { isTeamLead: true })).toContain('/employee/tasks');
  });
  it('treats a team lead as an employee', () => {
    expect(hrefs('team_lead')).toEqual(hrefs('employee'));
  });
});

describe('quickLinks', () => {
  it('puts four pages on the tab bar, all of which are in the full menu', () => {
    for (const role of ['admin', 'hr', 'employee'] as const) {
      const quick = quickLinks(role);
      expect(quick).toHaveLength(4);
      expect(quick.every(q => hrefs(role, { isTeamLead: true }).includes(q.href))).toBe(true);
    }
  });
  it('shows a team lead Tasks and everyone else Salary in the fourth slot', () => {
    expect(quickLinks('employee').at(-1)?.href).toBe('/employee/salary');
    expect(quickLinks('employee', { isTeamLead: true }).at(-1)?.href).toBe('/employee/tasks');
  });
});

describe('policyItem', () => {
  it('points at the role\'s own policy page', () => {
    expect(policyItem('hr').href).toBe('/hr/policy');
    expect(policyItem('team_lead').href).toBe('/employee/policy');
  });
});

describe('isNavActive', () => {
  it('matches a page and the pages below it', () => {
    expect(isNavActive('/hr/tickets', '/hr/tickets', 'hr')).toBe(true);
    expect(isNavActive('/hr/teams/abc', '/hr/teams', 'hr')).toBe(true);
  });
  it('does not light a page for a similar name, or the home page for every page', () => {
    expect(isNavActive('/hr/team-chats', '/hr/teams', 'hr')).toBe(false);
    expect(isNavActive('/hr/tickets', '/hr', 'hr')).toBe(false);
    expect(isNavActive('/hr', '/hr', 'hr')).toBe(true);
    expect(isNavActive(null, '/hr', 'hr')).toBe(false);
  });
});

describe('navDotKey', () => {
  it('names the three links that can show activity', () => {
    expect(navDotKey('/hr/tickets')).toBe('tickets');
    expect(navDotKey('/employee/chat')).toBe('chat');
    expect(navDotKey('/admin/team-chats')).toBe('chat');
    expect(navDotKey('/hr/hr-admin')).toBe('hrAdmin');
    expect(navDotKey('/hr/tasks')).toBeNull();
  });
});

describe('isChatScreen', () => {
  it('is true for the three chat screens and false elsewhere', () => {
    expect(isChatScreen('/hr/team-chats')).toBe(true);
    expect(isChatScreen('/employee/chat')).toBe(true);
    expect(isChatScreen('/admin/direct-messages')).toBe(true);
    expect(isChatScreen('/hr/tickets')).toBe(false);
    expect(isChatScreen('/hr/team-chats/extra')).toBe(false);
    expect(isChatScreen(null)).toBe(false);
  });
});
