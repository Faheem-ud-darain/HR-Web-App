import { describe, it, expect } from 'vitest';
import { searchEverything, searchLinks, hasAnyResult, EMPTY_RESULTS, type SearchData, type SearchViewer } from './globalSearch';

// Minimal rows: only the fields the search reads.
const data = {
  profiles: [{ fullName: 'Sara Khan', email: 'sara@x.us', jobTitle: 'Analyst' }, { fullName: 'Bob Roy', email: 'bob@x.us', jobTitle: 'Driver' }],
  tasks: [
    { id: 't1', title: 'Audit report', description: 'quarterly', assignedEmail: 'sara@x.us' },
    { id: 't2', title: 'Audit fleet', description: '', assignedEmail: 'bob@x.us' },
  ],
  tickets: [
    { id: 'k1', title: 'Audit login', description: '', department: 'hr', employeeEmail: 'sara@x.us' },
    { id: 'k2', title: 'Audit laptop', description: '', department: 'technical', employeeEmail: 'bob@x.us' },
    { id: 'k3', title: 'Audit badge', description: '', department: 'technical', employeeEmail: 'sara@x.us' },
  ],
  teams: [{ id: 'm1', name: 'Audit Team' }],
  warehouses: [{ id: 'w1', name: 'Audit Yard' }],
  payroll: [{ id: 'p1', employeeId: 'u-sara', name: 'Sara Khan', role: 'Audit lead' }, { id: 'p2', employeeId: 'u-bob', name: 'Bob Roy', role: 'Audit clerk' }],
  leaves: [{ id: 'l1', employeeName: 'Sara Khan', type: 'Sick', reason: 'audit week', status: 'pending' }, { id: 'l2', employeeName: 'Bob Roy', type: 'Casual', reason: 'audit', status: 'approved' }],
  careers: [{ id: 'c1', title: 'Audit Analyst', department: 'Finance' }],
  announcements: [{ id: 'a1', title: 'Audit notice', content: 'x' }],
} as unknown as SearchData;

const viewer = (over: Partial<SearchViewer>): SearchViewer => ({ role: 'employee', email: 'sara@x.us', profileId: 'u-sara', displayName: 'Sara Khan', isTechnical: false, ...over });
const ids = (list: { id?: string }[]) => list.map(x => x.id);

describe('searchEverything', () => {
  it('returns nothing for a blank query or no role', () => {
    expect(searchEverything('  ', viewer({ role: 'admin' }), data)).toBe(EMPTY_RESULTS);
    expect(searchEverything('audit', viewer({ role: '' }), data)).toBe(EMPTY_RESULTS);
    expect(hasAnyResult(EMPTY_RESULTS)).toBe(false);
  });

  it('matches case-insensitively, including job titles', () => {
    expect(searchEverything('ANALYST', viewer({ role: 'hr' }), data).employees).toHaveLength(1);
  });

  it('lets only HR and Admin search employees', () => {
    expect(searchEverything('khan', viewer({ role: 'hr' }), data).employees).toHaveLength(1);
    expect(searchEverything('khan', viewer({ role: 'admin' }), data).employees).toHaveLength(1);
    expect(searchEverything('khan', viewer({ role: 'employee' }), data).employees).toHaveLength(0);
    expect(searchEverything('khan', viewer({ role: 'team_lead' }), data).employees).toHaveLength(0);
  });

  it('shows teams to HR only and warehouses to Admin only', () => {
    expect(searchEverything('audit', viewer({ role: 'hr' }), data)).toMatchObject({ teams: [{ id: 'm1' }], warehouses: [] });
    expect(searchEverything('audit', viewer({ role: 'admin' }), data)).toMatchObject({ teams: [], warehouses: [{ id: 'w1' }] });
    expect(searchEverything('audit', viewer({ role: 'employee' }), data)).toMatchObject({ teams: [], warehouses: [] });
  });

  it('scopes tasks: everything for HR/Admin, assigned to me otherwise', () => {
    expect(ids(searchEverything('audit', viewer({ role: 'hr' }), data).tasks)).toEqual(['t1', 't2']);
    expect(ids(searchEverything('audit', viewer({ role: 'employee' }), data).tasks)).toEqual(['t1']);
  });

  it('scopes tickets by role', () => {
    expect(ids(searchEverything('audit', viewer({ role: 'hr' }), data).tickets)).toEqual(['k1']); // HR tickets only
    expect(ids(searchEverything('audit', viewer({ role: 'admin' }), data).tickets)).toEqual(['k1', 'k2', 'k3']);
    expect(ids(searchEverything('audit', viewer({}), data).tickets)).toEqual(['k1', 'k3']); // my own
    // Technical Support also sees the technical queue.
    expect(ids(searchEverything('audit', viewer({ isTechnical: true }), data).tickets)).toEqual(['k1', 'k2', 'k3']);
  });

  it('scopes payroll by profile id and leaves by name for non-privileged roles', () => {
    expect(ids(searchEverything('audit', viewer({ role: 'admin' }), data).payroll)).toEqual(['p1', 'p2']);
    expect(ids(searchEverything('audit', viewer({}), data).payroll)).toEqual(['p1']);
    expect(searchEverything('audit', viewer({ profileId: null }), data).payroll).toEqual([]);
    expect(ids(searchEverything('audit', viewer({ role: 'hr' }), data).leaves)).toEqual(['l1', 'l2']);
    expect(ids(searchEverything('audit', viewer({}), data).leaves)).toEqual(['l1']);
    expect(searchEverything('audit', viewer({ displayName: '' }), data).leaves).toEqual([]);
  });

  it('matches leaves on type, reason and status', () => {
    expect(ids(searchEverything('approved', viewer({ role: 'hr' }), data).leaves)).toEqual(['l2']);
    expect(ids(searchEverything('sick', viewer({ role: 'hr' }), data).leaves)).toEqual(['l1']);
  });

  it('shows careers and announcements to every role', () => {
    for (const role of ['employee', 'team_lead', 'hr', 'admin']) {
      const r = searchEverything('audit', viewer({ role }), data);
      expect(r.careers).toHaveLength(1);
      expect(r.announcements).toHaveLength(1);
    }
  });

  it('copes with datasets that have not loaded yet', () => {
    const r = searchEverything('audit', viewer({ role: 'admin' }), {});
    expect(hasAnyResult(r)).toBe(false);
  });
});

describe('searchLinks', () => {
  it('points each result type at a page the role has', () => {
    expect(searchLinks('hr')).toMatchObject({ home: '/hr', tasks: '/hr/tasks', payroll: '/hr/payroll', employees: '/hr/teams' });
    expect(searchLinks('admin')).toMatchObject({ home: '/admin', leaves: '/admin/leaves', payroll: '/admin/payroll', employees: '/admin/payroll' });
    expect(searchLinks('employee')).toMatchObject({ home: '/employee', careers: '/employee/careers', payroll: '/employee/salary' });
    expect(searchLinks('team_lead').payroll).toBe('/employee/salary');
  });
});
