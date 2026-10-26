import { describe, it, expect } from 'vitest';
import { AliasMap, editDistance } from './aliases';
import { explainPay, reservedFacts, money } from '../core/payrollExplain';
import type { Profile, AbsenceRecord } from '../hr/types';

const people = [
  { id: 'a1', name: 'Ali Raza' }, { id: 'a2', name: 'Sara Ali' }, { id: 'a3', name: 'Sara Khan' }, { id: 'a4', name: 'Hamza Tariq' },
];

describe('aliases keep names from the provider and put them back for the reader', () => {
  const m = new AliasMap(people);
  it('hides full names and unique single names', () => {
    const out = m.redact('Why does Ali Raza have deductions, and is hamza paid? Sara Khan too.');
    expect(out).not.toMatch(/Raza|Hamza|Tariq|Khan/i);
    expect(out).toMatch(/Employee \d/);
  });
  it('leaves a name shared by several people alone, so the assistant can ask which one', () => {
    expect(m.redact('why does ali have deductions')).toBe('why does ali have deductions');
    expect(m.redact('and sara?')).toBe('and sara?');
  });
  it('puts real names back in an answer', () => {
    const alias = m.aliasOf('a4');
    expect(m.restore(`${alias} was paid.`)).toBe('Hamza Tariq was paid.');
    expect(m.restore('Employee 99 is unknown')).toBe('Employee 99 is unknown');
  });
  it('finds people by partial name, and by alias', () => {
    expect(m.search('sara').map(p => p.id).sort()).toEqual(['a2', 'a3']);
    expect(m.fromAlias(m.aliasOf('a3'))?.id).toBe('a3');
    expect(m.fromAlias('Employee 0')).toBeNull();
  });
  it('turns "Employees 4 and 1" style lists back into names', () => {
    const a = m.aliasOf('a1'); const b = m.aliasOf('a4');
    const n1 = a.replace('Employee ', ''); const n2 = b.replace('Employee ', '');
    expect(m.restore(`Check Employees ${n1} and ${n2}.`)).toBe('Check Ali Raza and Hamza Tariq.');
    expect(m.restore(`Employees ${n1}, ${n2}, 99`)).toContain('Employees');
  });
  it('does not confuse Employee 1 with Employee 10', () => {
    const many = new AliasMap(Array.from({ length: 12 }, (_, i) => ({ id: `p${String(i).padStart(2, '0')}`, name: `Person Number${i}x` })));
    expect(many.restore('Employee 1 and Employee 10')).toContain('Person Number0x');
    expect(many.restore('Employee 1 and Employee 10')).toContain('Person Number9x');
  });
});

const emp = (o: Partial<Profile> = {}): Profile => ({ id: 'p1', fullName: 'Ali Raza', email: 'ali@x.us', role: 'employee', jobTitle: 'Agent', joinedDate: '2026-01-01', onboardingCompleted: true, baseSalary: 44000, teams: [], region: 'Pakistan', bankName: 'HBL', accountNumber: '1', ...o } as Profile);
const absence = (date: string): AbsenceRecord => ({ id: `a${date}`, employeeEmail: 'ali@x.us', employeeName: 'Ali Raza', date, reason: 'no_clock_in', deductionAmount: 0, createdAt: '', acknowledged: false } as AbsenceRecord);

describe('pay facts', () => {
  const now = new Date('2026-11-05T16:00:00Z');
  it('lists the absent days with the amounts the engine charges', () => {
    const p = emp();
    const facts = explainPay(p, '2026-10', { profiles: [p], payroll: [], leaves: [], timesheets: [], absences: [absence('2026-10-06'), absence('2026-10-13')], now });
    expect(facts.status).toBe('not paid yet');
    expect(facts.total_deductions).toBe('PKR 8,000');
    expect(facts.net_pay).toBe('PKR 36,000');
    expect((facts.dates as { absent_days: string[] }).absent_days).toEqual(['Oct 6', 'Oct 13']);
  });
  it('says plainly when there is no row for that month', () => {
    const p = emp({ joinedDate: '2026-12-01' });
    expect(explainPay(p, '2026-10', { profiles: [p], payroll: [], leaves: [], timesheets: [], absences: [], now })).toHaveProperty('note');
  });
  it('lists reserved salary by alias, never by name, and never any bank detail', () => {
    const p = emp({ reservedSalaryBalance: 35000 } as Partial<Profile>);
    const out = JSON.stringify(reservedFacts({ profiles: [p], payroll: [], leaves: [], timesheets: [], absences: [], now }, () => 'Employee 1'));
    expect(out).toContain('Employee 1');
    expect(out).toContain('PKR 35,000');
    expect(out).not.toMatch(/Ali|Raza|HBL|account/i);
  });
  it('formats money by region', () => {
    expect(money(2100, 'USA')).toBe('USD 2,100');
    expect(money(52000)).toBe('PKR 52,000');
  });
});

describe('spelling-tolerant name search', () => {
  const m = new AliasMap([{ id: 'p1', name: 'Anain Malik' }, { id: 'p2', name: 'Sara Khan' }, { id: 'p3', name: 'Arneeb Komal' }]);
  it('measures edit distance', () => {
    expect(editDistance('anien', 'anain')).toBe(2);
    expect(editDistance('sara', 'sara')).toBe(0);
  });
  it('finds a close spelling and ranks the best first', () => {
    const near = m.fuzzySearch('Anien');
    expect(near[0].person.id).toBe('p1');
  });
  it('does not match unrelated names, and exact search still wins', () => {
    expect(m.fuzzySearch('Zebediah')).toEqual([]);
    expect(m.search('anain').map(p => p.id)).toEqual(['p1']);
  });
});

describe('nicknames (the alias field)', () => {
  const m = new AliasMap([{ id: 'p1', name: 'Anain Malik', alias: 'Anien' }, { id: 'p2', name: 'Sara Khan' }]);
  it('recognises a nickname when typed, and hides it from the provider like a real name', () => {
    expect(m.search('anien').map(p => p.id)).toEqual(['p1']);
    const out = m.redact('is Anien active right now?');
    expect(out).not.toMatch(/Anien/i);
    expect(out).toContain(m.aliasOf('p1'));
  });
  it('shows the person the way the app does for HR and Admin: full name with the nickname', () => {
    expect(m.restore(`${m.aliasOf('p1')} is on shift.`)).toBe('Anain Malik (Anien) is on shift.');
    expect(m.restore(`${m.aliasOf('p2')} is on shift.`)).toBe('Sara Khan is on shift.');
  });
  it('finds a near spelling of a nickname too', () => {
    expect(m.fuzzySearch('Anein')[0]?.person.id).toBe('p1');
  });
});

describe('e-mail addresses typed into a question', () => {
  const m = new AliasMap([{ id: 'p1', name: 'Anain Malik', alias: 'Anien', email: 'anain@delcargo.us' }, { id: 'p2', name: 'Sara Khan', email: 'sara@delcargo.us' }]);
  it('a known person\'s address becomes their alias, as a whole', () => {
    const out = m.redact('check anain@delcargo.us and Sara@Delcargo.us please');
    expect(out).not.toMatch(/@|delcargo|anain|sara/i);
    expect(out).toContain(m.aliasOf('p1')); expect(out).toContain(m.aliasOf('p2'));
  });
});
