import { describe, it, expect, vi, beforeEach } from 'vitest';

// A plain function (not vi.fn): the runner's call-tracking wraps a returned promise in a
// handler of its own, which would report an unhandled rejection that the real code never has.
const calls: unknown[][] = [];
let behaviour: () => Promise<unknown> = async () => ({});
vi.mock('./shared', () => ({
  pbUpsertByField: (...args: unknown[]) => { calls.push(args); return behaviour(); },
  pbFindByField: vi.fn(),
}));
vi.mock('../pocketbase', () => ({ pb: { collection: () => ({}) } }));

import { touchActivity, pageForPath } from './activity';

beforeEach(() => { calls.length = 0; behaviour = async () => ({}); });

describe('touchActivity', () => {
  it('overwrites each scope\'s single row with the newest actor and time', async () => {
    await touchActivity(['chat:t1', 'tickets:staff'], ' Jane@X.us ');
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call[0]).toBe('hr_activity');
      expect(call[1]).toBe('scope');
      expect((call[3] as { actor: string }).actor).toBe('jane@x.us');
      expect(new Date((call[3] as { at: string }).at).toString()).not.toBe('Invalid Date');
    }
    expect(calls.map(c => c[2])).toEqual(['chat:t1', 'tickets:staff']);
  });
  it('does nothing without an actor or scopes', async () => {
    await touchActivity([], 'jane@x.us');
    await touchActivity(['chat:t1'], '');
    expect(calls).toHaveLength(0);
  });
  it('never throws, even if the write fails', async () => {
    behaviour = () => Promise.reject(new Error('offline'));
    let thrown: unknown = null;
    try { await touchActivity(['chat:t1'], 'jane@x.us'); } catch (e) { thrown = e; }
    expect(calls).toHaveLength(1);
    expect(thrown).toBeNull();
  });
});

describe('pageForPath', () => {
  it('recognises the three dotted pages for every role', () => {
    expect(pageForPath('/employee/tickets')).toBe('tickets');
    expect(pageForPath('/hr/tickets')).toBe('tickets');
    expect(pageForPath('/employee/chat')).toBe('chat');
    expect(pageForPath('/admin/team-chats')).toBe('chat');
    expect(pageForPath('/hr/hr-admin')).toBe('hr-admin');
    expect(pageForPath('/employee')).toBeNull();
    expect(pageForPath('/hr/payroll')).toBeNull();
  });
});
