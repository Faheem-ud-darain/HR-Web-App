import { beforeEach, describe, expect, it, vi } from 'vitest';

// The one shared raise: run against fake database helpers, so it never touches production.
const db = vi.hoisted(() => ({
  baseSalary: 50000, extras: {} as Record<string, unknown>, writes: [] as string[], failRaise: false,
}));

vi.mock('@/lib/pbAdmin', () => ({
  pbAdminFetch: async (_p: string, init?: { method?: string; body?: string }) => {
    if (!init) return { id: 'p1', base_salary: db.baseSalary };
    if (db.failRaise) throw new Error('write failed');
    db.baseSalary = JSON.parse(init.body || '{}').base_salary; db.writes.push(`salary:${db.baseSalary}`); return {};
  },
  adminFindByField: async () => ({ id: 'x1', data: db.extras }),
  adminUpsertByField: async (_c: string, _f: string, _v: string, data: Record<string, unknown>) => { db.extras = data; db.writes.push(`marker:${data.lastIncrementProcessedYear}`); },
  rememberAdminUpsertId: () => {},
}));

import { applyRaise, SalaryChangedError } from './applyRaise';
import { incrementPerEvent, INCREMENT_PER_EVENT } from '../incrementMath';

const plan = { newBaseSalary: 60000, processedThroughYear: 2026 };
const profile = { id: 'p1', baseSalary: 50000 };

beforeEach(() => { db.baseSalary = 50000; db.extras = { lastIncrementProcessedYear: 2025 }; db.writes = []; db.failRaise = false; });

describe('applyRaise', () => {
  it('records the anniversary first, then raises the salary', async () => {
    expect(await applyRaise(profile, plan)).toBe('raised');
    expect(db.writes).toEqual(['marker:2026', 'salary:60000']);
  });

  it('does nothing twice: a second run finds the anniversary recorded', async () => {
    await applyRaise(profile, plan);
    db.baseSalary = 50000; db.writes = [];
    expect(await applyRaise(profile, plan)).toBe('already_done');
    expect(db.writes).toEqual([]);
  });

  it('refuses when the salary is no longer the one the plan was made from', async () => {
    db.baseSalary = 55000;
    await expect(applyRaise(profile, plan)).rejects.toBeInstanceOf(SalaryChangedError);
    expect(db.writes).toEqual([]);
  });

  it('puts the marker back when the raise fails, so the next run can try again', async () => {
    db.failRaise = true;
    await expect(applyRaise(profile, plan)).rejects.toThrow('write failed');
    expect(db.extras).toEqual({ lastIncrementProcessedYear: 2025 });
  });
});

describe('incrementPerEvent', () => {
  it('is one amount per region, and everything else counts as Pakistan', () => {
    expect(incrementPerEvent('USA')).toBe(INCREMENT_PER_EVENT.USA);
    expect(incrementPerEvent('Pakistan')).toBe(INCREMENT_PER_EVENT.Pakistan);
    expect(incrementPerEvent(undefined)).toBe(INCREMENT_PER_EVENT.Pakistan);
  });
});
