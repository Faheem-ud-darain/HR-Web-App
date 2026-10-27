// Plain TypeScript: where a person stands in onboarding, shared by the HR Onboarding page's tabs, labels and badges.
import type { Profile } from '../hrData';

export type OnboardingTab = 'all' | 'pending' | 'rejected' | 'approved';
type Subject = Pick<Profile, 'onboardingCompleted' | 'approvalStatus'>;

// The label shown on a row. "Approved" also covers anyone who finished onboarding before approvals existed.
export function onboardingStatus(e: Subject): { label: string; variant: 'warning' | 'danger' | 'success' } {
  if (e.approvalStatus === 'pending') return { label: 'Pending Approval', variant: 'warning' };
  if (e.approvalStatus === 'rejected') return { label: 'Rejected', variant: 'danger' };
  if (e.approvalStatus === 'approved' || e.onboardingCompleted) return { label: 'Approved', variant: 'success' };
  return { label: 'Invite Sent', variant: 'warning' };
}

// Which tab a person is listed under.
export function matchesOnboardingTab(e: Subject, tab: OnboardingTab): boolean {
  if (tab === 'pending') return !!e.onboardingCompleted && e.approvalStatus === 'pending';
  if (tab === 'rejected') return e.approvalStatus === 'rejected';
  if (tab === 'approved') return e.approvalStatus === 'approved' || (!e.approvalStatus && !!e.onboardingCompleted);
  return true;
}

// Documents can be reviewed once the person has submitted (or been rejected) or has completed onboarding.
export const canReviewDocuments = (e: Subject): boolean => e.approvalStatus === 'pending' || e.approvalStatus === 'rejected' || !!e.onboardingCompleted;
