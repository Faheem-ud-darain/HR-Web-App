import { describe, it, expect } from 'vitest';
import {
  scopesForPage, hasUnseen, markScopesSeen, ticketEventScopes, mergeActivityRows, chatScope,
  ticketsUserScope, TICKETS_STAFF_SCOPE, TICKETS_TECH_SCOPE, BASELINE_KEY, type ActivityRow, type DotViewer,
} from './activity';

const row = (scope: string, actor: string, at: string): ActivityRow => ({ scope, actor, at });
const rows = (...r: ActivityRow[]) => new Map(r.map(x => [x.scope, x]));
const viewer = (over: Partial<DotViewer> = {}): DotViewer => ({ role: 'employee', email: 'jane@x.us', technical: false, chatTeamIds: ['t1', 't2'], hrAdminTeamId: 'HRA', ...over });
const T = (n: number) => `2026-10-19T10:00:${String(n).padStart(2, '0')}.000Z`;

describe('scopesForPage', () => {
  it('maps tickets per role', () => {
    expect(scopesForPage('tickets', viewer({ role: 'hr' }))).toEqual([TICKETS_STAFF_SCOPE]);
    expect(scopesForPage('tickets', viewer({ role: 'admin' }))).toEqual([TICKETS_STAFF_SCOPE]);
    expect(scopesForPage('tickets', viewer())).toEqual([ticketsUserScope('jane@x.us')]);
    expect(scopesForPage('tickets', viewer({ technical: true }))).toEqual([ticketsUserScope('jane@x.us'), TICKETS_TECH_SCOPE]);
  });
  it('maps chat to the viewer\'s channels, never the private HR-Admin line', () => {
    expect(scopesForPage('chat', viewer())).toEqual([chatScope('t1'), chatScope('t2')]);
    expect(scopesForPage('chat', viewer({ role: 'hr', chatTeamIds: ['t1', 'HRA', 't2'] }))).toEqual([chatScope('t1'), chatScope('t2')]);
  });
  it('gives the HR-Admin line dot to HR and Admin only', () => {
    expect(scopesForPage('hr-admin', viewer({ role: 'hr' }))).toEqual([chatScope('HRA')]);
    expect(scopesForPage('hr-admin', viewer())).toEqual([]);
  });
});

describe('hasUnseen', () => {
  const seen = { [BASELINE_KEY]: T(0) };
  it('lights up for someone else\'s newer event', () => {
    expect(hasUnseen([chatScope('t1')], rows(row('chat:t1', 'bob@x.us', T(5))), seen, 'jane@x.us')).toBe(true);
  });
  it('never lights up for your own event, or when nothing happened', () => {
    expect(hasUnseen([chatScope('t1')], rows(row('chat:t1', 'JANE@x.us', T(5))), seen, 'jane@x.us')).toBe(false);
    expect(hasUnseen([chatScope('t1')], rows(), seen, 'jane@x.us')).toBe(false);
  });
  it('ignores events from before the person started being tracked (no history flood on first use)', () => {
    expect(hasUnseen([chatScope('t1')], rows(row('chat:t1', 'bob@x.us', '2026-10-18T00:00:00.000Z')), seen, 'jane@x.us')).toBe(false);
  });
  it('goes dark once the event has been seen, and returns for a newer one', () => {
    const r1 = rows(row('chat:t1', 'bob@x.us', T(5)));
    const seenAfter = markScopesSeen([chatScope('t1')], r1, seen);
    expect(hasUnseen([chatScope('t1')], r1, seenAfter, 'jane@x.us')).toBe(false);
    const r2 = rows(row('chat:t1', 'carol@x.us', T(9)));            // a newer event REPLACES the old row
    expect(hasUnseen([chatScope('t1')], r2, seenAfter, 'jane@x.us')).toBe(true);
  });
  it('any of several scopes is enough', () => {
    const r = rows(row('chat:t2', 'bob@x.us', T(5)));
    expect(hasUnseen([chatScope('t1'), chatScope('t2')], r, seen, 'jane@x.us')).toBe(true);
  });
});

describe('markScopesSeen', () => {
  it('returns the same object when there is nothing new (so no save is needed)', () => {
    const seen = { [BASELINE_KEY]: T(0), 'chat:t1': T(5) };
    expect(markScopesSeen([chatScope('t1')], rows(row('chat:t1', 'bob@x.us', T(5))), seen)).toBe(seen);
    expect(markScopesSeen([chatScope('zzz')], rows(), seen)).toBe(seen);
  });
  it('records the event time, not "now", and leaves other scopes alone', () => {
    const seen: Record<string, string> = { [BASELINE_KEY]: T(0), 'chat:t2': T(3) };
    const next = markScopesSeen([chatScope('t1')], rows(row('chat:t1', 'bob@x.us', T(7))), seen);
    expect(next).toEqual({ [BASELINE_KEY]: T(0), 'chat:t1': T(7), 'chat:t2': T(3) });
    expect(seen['chat:t1']).toBeUndefined(); // original not mutated
  });
});

describe('ticketEventScopes', () => {
  it('always touches staff + the owner, and the tech queue for technical tickets', () => {
    expect(ticketEventScopes({ employeeEmail: 'Jane@X.us', department: 'hr' })).toEqual([TICKETS_STAFF_SCOPE, 'tickets:user:jane@x.us']);
    expect(ticketEventScopes({ employeeEmail: 'jane@x.us', department: 'technical' })).toEqual([TICKETS_STAFF_SCOPE, 'tickets:user:jane@x.us', TICKETS_TECH_SCOPE]);
  });
});

describe('mergeActivityRows', () => {
  it('keeps the newest row per scope, whatever order they arrive in', () => {
    const merged = mergeActivityRows([row('a', 'x', T(5)), row('b', 'x', T(1))], [row('a', 'y', T(9)), row('b', 'y', T(0)), row('c', 'z', T(2))]);
    const byScope = Object.fromEntries(merged.map(r => [r.scope, r]));
    expect(byScope.a.actor).toBe('y');   // newer replaces older
    expect(byScope.b.actor).toBe('x');   // a late-arriving OLD event doesn't overwrite a newer one
    expect(byScope.c.actor).toBe('z');
    expect(merged).toHaveLength(3);
  });
});
