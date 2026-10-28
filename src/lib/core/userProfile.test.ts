import { describe, it, expect } from 'vitest';
import { companyNumberBlocksOffboard, editFormFrom, isHashedPassword, offboardFormFrom, parseReserveAmount, profileAccess } from './userProfile';
import type { Profile } from '../hr/types';

const person = (extra: Partial<Profile>) => ({ id: 'p', email: 'a@x.us', fullName: 'Ann Lee', role: 'employee', teams: [], baseSalary: 1000, ...extra }) as Profile;

describe('isHashedPassword', () => {
  it('recognises the stored hash format only', () => {
    expect(isHashedPassword('pbkdf2$100000$c2FsdA==$aGFzaA==')).toBe(true);
    expect(isHashedPassword('hunter2')).toBe(false);
    expect(isHashedPassword('pbkdf2$x$y$z')).toBe(false);
    expect(isHashedPassword(undefined)).toBe(false);
  });
});

describe('profileAccess', () => {
  const emp = person({ role: 'employee', teams: ['Ops'] });
  it('lets HR and Admin open any profile', () => {
    expect(profileAccess('hr', emp, null).hasAccess).toBe(true);
    expect(profileAccess('admin', emp, null).hasAccess).toBe(true);
  });
  it('lets Admin manage everyone, and HR manage only people below HR', () => {
    expect(profileAccess('admin', person({ role: 'hr' }), null).canManage).toBe(true);
    expect(profileAccess('hr', emp, null).canManage).toBe(true);
    expect(profileAccess('hr', person({ role: 'hr' }), null).canManage).toBe(false);
    expect(profileAccess('hr', person({ role: 'admin' }), null).canManage).toBe(false);
    expect(profileAccess('employee', emp, { teams: ['Ops'] }).canManage).toBe(false);
  });
  it('limits everyone else to their own team', () => {
    expect(profileAccess('employee', emp, { teams: ['Ops'] }).hasAccess).toBe(true);
    expect(profileAccess('employee', emp, { teams: ['QA'] }).hasAccess).toBe(false);
    expect(profileAccess('employee', emp, null).hasAccess).toBe(false);
  });
  it('lets a person open the profile of their own team lead, and a lead open their members', () => {
    const lead = person({ role: 'team_lead', isTeamLead: true, leadTeams: ['Ops'], teams: [] });
    expect(profileAccess('employee', lead, { teams: ['Ops'] }).hasAccess).toBe(true);
    expect(profileAccess('team_lead', emp, { teams: [], leadTeams: ['Ops'] }).hasAccess).toBe(true);
    expect(profileAccess('team_lead', emp, { teams: [], leadTeams: ['QA'] }).hasAccess).toBe(false);
  });
});

describe('form seeds', () => {
  it('never prefills a stored password hash', () => {
    expect(editFormFrom(person({ password: 'pbkdf2$1$c2E=$aGE=' }), '2026-01-01').password).toBe('');
    expect(editFormFrom(person({ password: 'plain1' }), '2026-01-01').password).toBe('plain1');
  });
  it('falls back from joining date to the other dates, and to today', () => {
    const f = editFormFrom(person({ joinedDate: '2025-03-04' }), '2026-01-01');
    expect(f).toMatchObject({ joinedDate: '2025-03-04', salaryStartDate: '2025-03-04', accountCreationDate: '2025-03-04', jobTitle: 'Staff', region: 'Pakistan', gender: 'male', baseSalary: '1000' });
    expect(editFormFrom(person({}), '2026-01-01').joinedDate).toBe('2026-01-01');
    expect(editFormFrom(person({ joinedDate: '2025-03-04', salaryStartDate: '2025-06-01' }), 'x').salaryStartDate).toBe('2025-06-01');
  });
  it('seeds the offboarding checklist from what was saved', () => {
    expect(offboardFormFrom(person({}))).toEqual({ itClearance: false, financeClearance: false, hrClearance: false, companyNumberReturned: false, notes: '' });
    const saved = person({ offboardingStatus: { itClearance: true, financeClearance: false, hrClearance: true, companyNumberReturned: true, notes: 'moved' } as Profile['offboardingStatus'] });
    expect(offboardFormFrom(saved)).toEqual({ itClearance: true, financeClearance: false, hrClearance: true, companyNumberReturned: true, notes: 'moved' });
  });
});

describe('offboarding rules', () => {
  it('blocks only while a company number on file has not been returned', () => {
    expect(companyNumberBlocksOffboard({ companyPhone: '+1 555' }, { companyNumberReturned: false })).toBe(true);
    expect(companyNumberBlocksOffboard({ companyPhone: '+1 555' }, { companyNumberReturned: true })).toBe(false);
    expect(companyNumberBlocksOffboard({ companyPhone: undefined }, { companyNumberReturned: false })).toBe(false);
  });
  it('reads a reserved amount typed with symbols', () => {
    expect(parseReserveAmount('$1,200.50')).toBe(1200.5);
    expect(parseReserveAmount('abc')).toBe(0);
    expect(parseReserveAmount('')).toBe(0);
  });
});
