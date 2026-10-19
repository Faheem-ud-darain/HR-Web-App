import { describe, it, expect } from 'vitest';
import { mapProfileRecord, scopeProfileForViewer, PUBLIC_PROFILE_KEYS } from './profiles';
import type { PbRow } from '@/lib/pbTypes';

const record = {
  id: 'p1', full_name: 'Jane Doe', email: 'Jane@delcargo.us', role: 'employee', joined_date: '2026-01-05',
  onboarding_completed: true, base_salary: 90000, teams: ['Ops'], password: 'pbkdf2$1$x$y', is_team_lead: 'true',
  lead_teams: ['Ops'], job_title: 'Analyst', gender: 'female', bank_name: 'SadaPay', account_number: '123', iban: 'PK00',
  region: 'Pakistan', tracking_enabled: true,
};
const extras = { alias: 'JD', personalPhone: '+92 300 1', approvalStatus: 'approved', offboardingStatus: { itClearance: true, financeClearance: true, hrClearance: true } } as PbRow;
const jane = mapProfileRecord(record, extras, 'https://pb/x.webp');

describe('mapProfileRecord', () => {
  it('maps columns, extras and the photo URL', () => {
    expect(jane).toMatchObject({ id: 'p1', fullName: 'Jane Doe', baseSalary: 90000, isTeamLead: true, alias: 'JD', profilePicture: 'https://pb/x.webp', salaryStartDate: '2026-01-05' });
  });
  it('falls back to the legacy picture column', () => {
    expect(mapProfileRecord({ ...record, profile_picture: 'data:image/png;base64,AA' }).profilePicture).toBe('data:image/png;base64,AA');
  });
});

describe('scopeProfileForViewer', () => {
  it('never includes a password hash, for anyone', () => {
    for (const viewer of [{ email: 'hr@x.us', role: 'hr' }, { email: 'jane@delcargo.us', role: 'employee' }, { email: 'bob@x.us', role: 'employee' }, { email: 'a@x.us', role: 'admin' }]) {
      expect('password' in scopeProfileForViewer(jane, viewer)).toBe(false);
    }
  });
  it('gives HR/Admin everything else', () => {
    for (const role of ['hr', 'admin']) {
      const v = scopeProfileForViewer(jane, { email: 'someone@x.us', role });
      expect(v.baseSalary).toBe(90000);
      expect(v.bankName).toBe('SadaPay');
      expect(v.offboardingStatus).toBeDefined();
    }
  });
  it('gives a person their own record in full (email match is case-insensitive)', () => {
    const v = scopeProfileForViewer(jane, { email: 'JANE@delcargo.us', role: 'employee' });
    expect(v.baseSalary).toBe(90000);
    expect(v.iban).toBe('PK00');
    expect((v as PbRow).personalPhone).toBe('+92 300 1');
  });
  it('gives colleagues only the public directory fields', () => {
    const v = scopeProfileForViewer(jane, { email: 'bob@x.us', role: 'employee' }) as PbRow;
    expect(v).toMatchObject({ fullName: 'Jane Doe', jobTitle: 'Analyst', teams: ['Ops'], alias: 'JD', isTeamLead: true, profilePicture: 'https://pb/x.webp' });
    expect(v.baseSalary).toBe(0);
    for (const secret of ['bankName', 'accountNumber', 'iban', 'personalPhone', 'approvalStatus', 'offboardingStatus', 'salaryStartDate', 'password']) {
      expect(v[secret]).toBeUndefined();
    }
    expect(Object.keys(v).every(k => k === 'baseSalary' || (PUBLIC_PROFILE_KEYS as readonly string[]).includes(k))).toBe(true);
  });
  it('treats team leads like any other employee for colleagues\' private data', () => {
    const v = scopeProfileForViewer(jane, { email: 'lead@x.us', role: 'team_lead' }) as PbRow;
    expect(v.baseSalary).toBe(0);
    expect(v.bankName).toBeUndefined();
  });
});
