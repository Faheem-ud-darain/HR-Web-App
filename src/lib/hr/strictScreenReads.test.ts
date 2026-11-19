import { afterEach, describe, expect, it, vi } from 'vitest';

const getFullList = vi.fn();
vi.mock('../pocketbase', () => ({ pb: { collection: () => ({ getFullList }) } }));
const { fetchPayrollSelf } = await import('./payroll');
const { fetchMyAbsenceRecords } = await import('./absences');
const { fetchLeavesChecked } = await import('./leaves');

afterEach(() => { vi.unstubAllGlobals(); getFullList.mockReset(); });
const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('the employee pay read', () => {
  it('returns the pay when the server answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(200, { profile: { fullName: 'A', baseSalary: 100 }, pendingIncrement: 5, payrollRecord: null })));
    expect(await fetchPayrollSelf('t')).toMatchObject({ fullName: 'A', baseSalary: 100, pendingIncrement: 5 });
  });
  it('gives null only for a definite no', async () => {
    for (const s of [401, 403, 404]) { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(s, {}))); expect(await fetchPayrollSelf('t')).toBeNull(); }
    expect(await fetchPayrollSelf(null)).toBeNull();
  });
  it('THROWS on a server error or a dropped connection, so the screen never shows a salary of 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(502, {})));
    await expect(fetchPayrollSelf('t')).rejects.toThrow(/502/);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(fetchPayrollSelf('t')).rejects.toThrow();
  });
});

describe('the employee absence read', () => {
  it('returns the records, [] only for an expired login, and throws otherwise', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(200, { items: [{ id: 'a' }] })));
    expect(await fetchMyAbsenceRecords('t')).toEqual([{ id: 'a' }]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(401, {})));
    expect(await fetchMyAbsenceRecords('t')).toEqual([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(500, {})));
    await expect(fetchMyAbsenceRecords('t')).rejects.toThrow(/500/);
  });
});

describe('the leaves read behind the screens', () => {
  it('throws when the database cannot be read (it would otherwise show the full leave allowance)', async () => {
    getFullList.mockRejectedValue(new Error('network'));
    await expect(fetchLeavesChecked({ employeeName: 'Ali Khan' })).rejects.toThrow('network');
    await expect(fetchLeavesChecked({})).rejects.toThrow('network');
  });
});
