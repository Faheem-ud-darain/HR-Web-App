import { describe, it, expect } from 'vitest';
import { PayError, payEmployee, planPayment, recordPaid, setBonus, type PayStore, type Raise } from './payrollPay';
import { netPay } from './payrollView';
import type { PayrollRecord, Profile } from '../hr/types';

const NOW = new Date('2026-11-02T16:00:00Z'); // the 2nd of November: HR is paying October
const MONTH = '2026-10';

const person = (over: Partial<Profile> = {}): Profile => ({
  id: 'p1', fullName: 'Ali Example', email: 'ali@x.us', role: 'employee', jobTitle: 'Agent',
  joinedDate: '2026-01-01', onboardingCompleted: true, baseSalary: 44000, teams: [], region: 'Pakistan', ...over,
}) as Profile;

// An in-memory store: the same job as the PocketBase one, with failures that can be switched on.
function fakeStore(initial: Profile, opts: { failRaiseOnce?: boolean; failReserveOnce?: boolean } = {}) {
  const w = {
    profile: { ...initial },
    banked: [] as string[],
    reserveBalance: 0,
    rows: [] as PayrollRecord[],
    saves: [] as PayrollRecord[],
    raises: [] as Raise[],
    failRaise: !!opts.failRaiseOnce,
    failReserve: !!opts.failReserveOnce,
  };
  const store: PayStore = {
    loadEmployee: async id => (id === w.profile.id ? { profile: { ...w.profile }, reservedBankedMonths: [...w.banked] } : null),
    loadInputs: async () => ({ payroll: w.rows.map(r => ({ ...r })), leaves: [], timesheets: [], absences: [] }),
    saveRecord: async record => {
      const id = record.id || `row${w.rows.length + 1}`;
      const saved = { ...record, id };
      w.rows = [...w.rows.filter(r => r.id !== id), saved];
      w.saves.push(saved);
      return { id };
    },
    raiseSalary: async (_p, raise) => {
      if (w.failRaise) { w.failRaise = false; throw new Error('raise failed'); }
      w.raises.push(raise);
      w.profile = { ...w.profile, baseSalary: raise.newBaseSalary, lastIncrementProcessedYear: raise.processedThroughYear };
    },
    bankReserve: async (_p, add, month) => {
      if (w.failReserve) { w.failReserve = false; throw new Error('reserve failed'); }
      w.reserveBalance += add;
      w.banked.push(month);
    },
  };
  return { w, store };
}
const call = (store: PayStore, over: Partial<{ employeeId: string; month: string; now: Date }> = {}) => ({ store, input: { employeeId: 'p1', month: MONTH, now: NOW, ...over } });

describe('planPayment', () => {
  const record = (over: Partial<PayrollRecord>): PayrollRecord => ({ id: 'r', employeeId: 'p1', name: 'x', role: 'x', baseSalary: 44000, unpaidLeaves: 0, bonus: 0, deductions: 0, processed: false, incrementAmount: 0, month: MONTH, reservedThisMonth: 0, deductionBreakdown: [], pendingArrears: 0, ...over }) as PayrollRecord;
  it('adds nothing for an ordinary month', () => {
    expect(planPayment(person(), record({}), [])).toEqual({ raise: null, reserve: 0 });
  });
  it('plans the raise and the marker year when an anniversary is due', () => {
    const p = person({ joinedDate: '2025-08-10', salaryStartDate: '2025-08-10' });
    expect(planPayment(p, record({ incrementAmount: 10000 }), []).raise).toEqual({ newBaseSalary: 54000, processedThroughYear: 2026 });
  });
  it('does not plan the raise again once the marker year is in', () => {
    const p = person({ joinedDate: '2025-08-10', salaryStartDate: '2025-08-10', lastIncrementProcessedYear: 2026, baseSalary: 54000 });
    expect(planPayment(p, record({ incrementAmount: 10000 }), []).raise).toBeNull();
  });
  it('banks the held-back pay once only', () => {
    expect(planPayment(person(), record({ reservedThisMonth: 44000 }), []).reserve).toBe(44000);
    expect(planPayment(person(), record({ reservedThisMonth: 44000 }), [MONTH]).reserve).toBe(0);
  });
});

describe('payEmployee', () => {
  it('works the figures out on the server and marks the month paid and frozen', async () => {
    const { w, store } = fakeStore(person());
    const { status, record } = await payEmployee(store, call(store).input);
    expect(status).toBe('paid');
    expect(record).toMatchObject({ month: MONTH, baseSalary: 44000, processed: true, frozen: true });
    expect(w.rows).toHaveLength(1);
    expect(w.raises).toEqual([]);
    expect(w.reserveBalance).toBe(0);
  });

  it('writes the figures down BEFORE the raise, so the raise cannot change what is paid', async () => {
    const { w, store } = fakeStore(person({ joinedDate: '2025-08-10', salaryStartDate: '2025-08-10' }));
    const { record } = await payEmployee(store, call(store).input);
    expect(w.saves[0]).toMatchObject({ frozen: true, processed: false, baseSalary: 44000, incrementAmount: 10000 }); // frozen first, unpaid
    expect(record).toMatchObject({ processed: true, baseSalary: 44000, incrementAmount: 10000 });                       // paid with the same figures
    expect(netPay(record)).toBe(54000);
    expect(w.profile).toMatchObject({ baseSalary: 54000, lastIncrementProcessedYear: 2026 });                          // and the raise landed once
  });

  it('can be pressed twice without paying or raising twice', async () => {
    const { w, store } = fakeStore(person({ joinedDate: '2025-08-10', salaryStartDate: '2025-08-10' }));
    await payEmployee(store, call(store).input);
    const again = await payEmployee(store, call(store).input);
    expect(again.status).toBe('already_paid');
    expect(w.raises).toHaveLength(1);
    expect(w.rows).toHaveLength(1);
  });

  it('after a failed raise the month stays frozen and unpaid, and pressing Pay again finishes it with the same figures', async () => {
    const { w, store } = fakeStore(person({ joinedDate: '2025-08-10', salaryStartDate: '2025-08-10' }), { failRaiseOnce: true });
    await expect(payEmployee(store, call(store).input)).rejects.toThrow('raise failed');
    expect(w.rows[0]).toMatchObject({ frozen: true, processed: false });
    expect(w.profile.baseSalary).toBe(44000);
    const { status, record } = await payEmployee(store, call(store).input);
    expect(status).toBe('paid');
    expect(record).toMatchObject({ baseSalary: 44000, incrementAmount: 10000, processed: true });
    expect(w.raises).toHaveLength(1);
  });

  it('banks a new joiner\'s held-back first month once, even when the first try fails halfway', async () => {
    const { w, store } = fakeStore(person({ joinedDate: '2026-10-02' }), { failReserveOnce: true });
    await expect(payEmployee(store, call(store).input)).rejects.toThrow('reserve failed');
    expect(w.reserveBalance).toBe(0);
    await payEmployee(store, call(store).input);
    await payEmployee(store, call(store).input);
    expect(w.reserveBalance).toBe(44000);
    expect(w.banked).toEqual([MONTH]);
  });

  it('refuses a month that has not started, a bad month, an unknown person and someone with no pay', async () => {
    const { store } = fakeStore(person());
    await expect(payEmployee(store, call(store, { month: '2026-12' }).input)).rejects.toMatchObject({ status: 400 });
    await expect(payEmployee(store, call(store, { month: 'October' }).input)).rejects.toBeInstanceOf(PayError);
    await expect(payEmployee(store, call(store, { employeeId: 'nobody' }).input)).rejects.toMatchObject({ status: 404 });
    const hr = fakeStore(person({ role: 'hr' }));
    await expect(payEmployee(hr.store, call(hr.store).input)).rejects.toMatchObject({ status: 404 });
  });
});

describe('recordPaid', () => {
  it('only ticks the month off: no raise, no held-back balance', async () => {
    const { w, store } = fakeStore(person({ joinedDate: '2025-08-10', salaryStartDate: '2025-08-10' }));
    const { status } = await recordPaid(store, call(store).input);
    expect(status).toBe('paid');
    expect(w.raises).toEqual([]);
    expect(w.reserveBalance).toBe(0);
    expect(w.rows[0]).toMatchObject({ processed: true, frozen: true });
  });
});

describe('setBonus', () => {
  it('saves HR\'s bonus on an unpaid month and leaves the month open', async () => {
    const { w, store } = fakeStore(person());
    const { record } = await setBonus(store, { ...call(store).input, bonus: 2500.456 });
    expect(record.bonus).toBe(2500.46);
    expect(w.rows[0]).toMatchObject({ bonus: 2500.46, processed: false });
  });
  it('will not change a paid month, and rejects a bad number', async () => {
    const { store } = fakeStore(person());
    await payEmployee(store, call(store).input);
    await expect(setBonus(store, { ...call(store).input, bonus: 100 })).rejects.toMatchObject({ status: 409 });
    const open = fakeStore(person());
    for (const bad of [-1, NaN, Infinity]) await expect(setBonus(open.store, { ...call(open.store).input, bonus: bad })).rejects.toBeInstanceOf(PayError);
  });
});
