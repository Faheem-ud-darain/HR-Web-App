import { beforeEach, describe, expect, it, vi } from 'vitest';
import { liveRole } from './core/sessionStatus';

// The role in a token is a copy from sign-in time. These run the real lookup with the database replaced.
const db = vi.hoisted(() => ({
  profile: { id: 'p1', role: 'hr' } as Record<string, unknown> | null,
  extras: null as { data: Record<string, unknown> } | null,
  fail: false,
  lookups: 0,
}));

vi.mock('@/lib/pbAdmin', () => ({
  adminFindProfileByEmail: async () => { db.lookups++; if (db.fail) throw new Error('database down'); return db.profile; },
  adminFindByField: async () => db.extras,
}));
vi.mock('./pbAdmin', () => ({
  adminFindProfileByEmail: async () => { db.lookups++; if (db.fail) throw new Error('database down'); return db.profile; },
  adminFindByField: async () => db.extras,
}));

import { currentRole, forgetLiveSessions } from './server/liveSession';

beforeEach(() => { db.profile = { id: 'p1', role: 'hr' }; db.extras = null; db.fail = false; db.lookups = 0; forgetLiveSessions(); vi.spyOn(console, 'error').mockImplementation(() => undefined); });

describe('liveRole', () => {
  it('takes the current role, and refuses a missing, offboarded or role-less account', () => {
    expect(liveRole({ role: 'employee' })).toBe('employee');
    expect(liveRole(null)).toBeNull();
    expect(liveRole({ role: 'hr', offboarded: true })).toBeNull();
    expect(liveRole({ role: 'boss' })).toBeNull();
    expect(liveRole({})).toBeNull();
  });
});

describe('currentRole', () => {
  it('a person demoted since sign-in gets their current role, not the one in the token', async () => {
    db.profile = { id: 'p1', role: 'employee' };
    expect(await currentRole('a@x.com', 'admin')).toBe('employee');
  });

  it('an offboarded or removed account is refused', async () => {
    db.extras = { data: { offboarded: true } };
    expect(await currentRole('a@x.com', 'hr')).toBeNull();
    forgetLiveSessions(); db.extras = null; db.profile = null;
    expect(await currentRole('a@x.com', 'hr')).toBeNull();
  });

  it('looks the account up once a minute, then again, so a change takes effect within a minute', async () => {
    const t = Date.UTC(2026, 10, 4, 12);
    await currentRole('a@x.com', 'hr', t);
    await currentRole('A@x.com ', 'hr', t + 30_000);
    expect(db.lookups).toBe(1);
    db.profile = { id: 'p1', role: 'employee' };
    expect(await currentRole('a@x.com', 'hr', t + 61_000)).toBe('employee');
  });

  it('if the check cannot run, the token is kept (like login) and nothing is remembered', async () => {
    db.fail = true;
    expect(await currentRole('a@x.com', 'hr')).toBe('hr');
    db.fail = false; db.profile = { id: 'p1', role: 'employee' };
    expect(await currentRole('a@x.com', 'hr')).toBe('employee');
  });
});
