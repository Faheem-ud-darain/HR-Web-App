import { describe, expect, it } from 'vitest';
import { canReviewDocuments, matchesOnboardingTab, onboardingStatus } from './onboarding';

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
