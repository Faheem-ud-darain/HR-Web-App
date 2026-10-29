import { describe, expect, it } from 'vitest';
import { DOCS_BUDGET_BYTES, storedDocsBytes, bankIdLabel, canReviewDocuments, docsBytes, documentPages, identityScansNeeded, isPdf, matchesOnboardingTab, onboardingStatus, overBudgetMessage, validateBankDetails, validateSignature } from './onboarding';

const person = (approvalStatus?: 'pending' | 'approved' | 'rejected', onboardingCompleted = false) => ({ approvalStatus, onboardingCompleted });

describe('onboardingStatus', () => {
  it('labels each stage', () => {
    expect(onboardingStatus(person('pending', true))).toEqual({ label: 'Pending Approval', variant: 'warning' });
    expect(onboardingStatus(person('rejected'))).toEqual({ label: 'Rejected', variant: 'danger' });
    expect(onboardingStatus(person('approved'))).toEqual({ label: 'Approved', variant: 'success' });
    expect(onboardingStatus(person(undefined, false))).toEqual({ label: 'Invite Sent', variant: 'warning' });
  });
  it('treats finished onboarding from before approvals existed as approved', () => {
    expect(onboardingStatus(person(undefined, true)).label).toBe('Approved');
  });
});

describe('matchesOnboardingTab', () => {
  it('lists pending only when onboarding is complete', () => {
    expect(matchesOnboardingTab(person('pending', true), 'pending')).toBe(true);
    expect(matchesOnboardingTab(person('pending', false), 'pending')).toBe(false);
  });
  it('puts legacy completed people under approved, rejected under rejected, everyone under all', () => {
    expect(matchesOnboardingTab(person(undefined, true), 'approved')).toBe(true);
    expect(matchesOnboardingTab(person('rejected', true), 'approved')).toBe(false);
    expect(matchesOnboardingTab(person('rejected'), 'rejected')).toBe(true);
    expect(matchesOnboardingTab(person(undefined, false), 'all')).toBe(true);
  });
});

describe('canReviewDocuments', () => {
  it('is false only for someone who was invited but has not submitted anything', () => {
    expect(canReviewDocuments(person(undefined, false))).toBe(false);
    expect(canReviewDocuments(person('pending'))).toBe(true);
    expect(canReviewDocuments(person(undefined, true))).toBe(true);
  });
});

describe('what the wizard asks for, by region', () => {
  it('names the second bank number, the scans and the pages of documents', () => {
    expect(bankIdLabel('USA')).toBe('Routing Number');
    expect(bankIdLabel('Pakistan')).toBe('IBAN');
    expect(identityScansNeeded('USA')).toBe(1);
    expect(identityScansNeeded(undefined)).toBe(2);
    expect(documentPages('USA')).toBe(3);
    expect(documentPages('Pakistan')).toBe(2);
  });
});

describe('validateBankDetails', () => {
  const ok = { bankName: 'Habib Bank', accountNumber: '0123456789012', iban: 'PK36SCBL0000001123456702' };
  it('accepts good details and asks for anything missing', () => {
    expect(validateBankDetails(ok, 'Pakistan')).toBe('');
    expect(validateBankDetails({ ...ok, bankName: ' ' }, 'Pakistan')).toMatch(/Required/);
    expect(validateBankDetails({ ...ok, iban: '' }, 'USA')).toMatch(/Routing Number/);
  });
  it('checks the shape of the account number, the IBAN and the routing number', () => {
    expect(validateBankDetails({ ...ok, accountNumber: '12' }, 'Pakistan')).toMatch(/account number/);
    expect(validateBankDetails({ ...ok, iban: '1234' }, 'Pakistan')).toMatch(/IBAN/);
    expect(validateBankDetails({ ...ok, iban: 'PK36 SCBL 0000 0011 2345 6702' }, 'Pakistan')).toBe('');
    expect(validateBankDetails({ ...ok, iban: '02100002' }, 'USA')).toMatch(/9 digits/);
    expect(validateBankDetails({ ...ok, iban: '021000021' }, 'USA')).toBe('');
  });
  it('lets a mobile wallet outside the USA use its phone number and no IBAN', () => {
    const wallet = { bankName: 'JazzCash', accountNumber: '0300 1234567', iban: '' };
    expect(validateBankDetails(wallet, 'Pakistan')).toBe('');
    expect(validateBankDetails({ ...wallet, bankName: 'Easy Paisa', accountNumber: '+923001234567' }, 'Pakistan')).toBe('');
    expect(validateBankDetails({ ...wallet, accountNumber: '12345' }, 'Pakistan')).toMatch(/mobile number/);
    expect(validateBankDetails({ ...wallet, iban: '1234' }, 'Pakistan')).toMatch(/IBAN/);
    expect(validateBankDetails({ ...wallet, bankName: 'Habib Bank' }, 'Pakistan')).toMatch(/Required/);
  });
});

describe('validateSignature', () => {
  it('ignores case and extra spaces but needs the whole name', () => {
    expect(validateSignature('  jane   DOE ', 'Jane Doe')).toBe('');
    expect(validateSignature('Jane', 'Jane Doe')).not.toBe('');
    expect(validateSignature('', 'Jane Doe')).not.toBe('');
  });
});

describe('documents', () => {
  it('knows a PDF by type or by name', () => {
    expect(isPdf({ type: 'application/pdf', name: 'a' })).toBe(true);
    expect(isPdf({ type: '', name: 'CV.PDF' })).toBe(true);
    expect(isPdf({ type: 'image/png', name: 'a.png' })).toBe(false);
  });
  it('adds up the stored size and says how much room is left', () => {
    expect(docsBytes('abc', null, undefined, 'de')).toBe(5);
    expect(overBudgetMessage(DOCS_BUDGET_BYTES)).toMatch(/about 5 MB/);
    expect(storedDocsBytes(null)).toBe(0);
    expect(storedDocsBytes({ a: 'xyz' })).toBe(JSON.stringify({ a: 'xyz' }).length);
    expect(overBudgetMessage(-5)).toMatch(/about 0 KB/);
  });
});
