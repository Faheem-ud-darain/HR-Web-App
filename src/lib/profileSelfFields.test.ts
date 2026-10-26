import { describe, it, expect } from 'vitest';
import { classifySelfProfilePatch } from './profileSelfFields';

describe('classifySelfProfilePatch', () => {
  it('accepts normal self-service fields', () => {
    const r = classifySelfProfilePatch({ bankName: 'X', iban: 'Y', personalPhone: '1', profilePicture: 'data:' });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(Object.keys(r.fields)).toEqual(['bankName', 'iban', 'personalPhone', 'profilePicture']); expect(r.submitsOnboarding).toBe(false); }
  });
  it('refuses self-approval with 403', () => {
    for (const v of ['approved', 'rejected', 'anything']) {
      const r = classifySelfProfilePatch({ approvalStatus: v });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(403);
    }
  });
  it('allows submitting for review and never passes the status through', () => {
    const r = classifySelfProfilePatch({ onboardingCompleted: true, approvalStatus: 'pending', bankName: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.submitsOnboarding).toBe(true); expect('approvalStatus' in r.fields).toBe(false); }
  });
  it('completing onboarding without a status still goes to review', () => {
    const r = classifySelfProfilePatch({ onboardingCompleted: true });
    expect(r.ok && r.submitsOnboarding).toBe(true);
  });
  it('resubmit reset (onboardingCompleted false) does not submit', () => {
    const r = classifySelfProfilePatch({ onboardingCompleted: false });
    expect(r.ok && r.submitsOnboarding).toBe(false);
  });
  it('refuses every HR-controlled field with 403 naming it', () => {
    for (const k of ['approvalReviewedBy', 'approvalReviewedAt', 'approvalRejectionReason', 'role', 'baseSalary', 'salaryStartDate', 'region',
      'reservedSalaryBalance', 'manualReservedAmount', 'manualReservedNote', 'offboarded', 'offboardDate', 'offboardingStatus',
      'exemptFromAbsenceCheck', 'trackingEnabled']) {
      const r = classifySelfProfilePatch({ bankName: 'ok', [k]: 1 });
      expect(r.ok).toBe(false);
      if (!r.ok) { expect(r.status).toBe(403); expect(r.fields).toContain(k); expect(r.error).toContain(k); }
    }
  });
  it('rejects unknown fields and bad bodies with 400', () => {
    for (const b of [{ nonsense: 1 }, null, [], 'x', { onboardingCompleted: 'yes' }]) {
      const r = classifySelfProfilePatch(b);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(400);
    }
  });
});
