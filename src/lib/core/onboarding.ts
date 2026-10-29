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

// ── The employee's own onboarding wizard ────────────────────────────────────────────────────────────────────────
// Plain rules for what the wizard asks for and accepts, kept out of the screens so they can be tested.

type Region = Profile['region'];
const isUsa = (region: Region): boolean => region === 'USA';

export const ONBOARDING_STEPS = ['Bank details', 'Documents', 'Guide', 'Sign off'] as const;

/** What the bank's second number is called: a routing number in the USA, an IBAN elsewhere. */
export const bankIdLabel = (region: Region): string => (isUsa(region) ? 'Routing Number' : 'IBAN');
/** How many identity scans are needed: one licence or permit in the USA, both sides of a CNIC elsewhere. */
export const identityScansNeeded = (region: Region): number => (isUsa(region) ? 1 : 2);
/** The documents step is split into pages: photo and CV, identity, and (USA only) an optional passport. */
export const documentPages = (region: Region): number => (isUsa(region) ? 3 : 2);

/** All of one person's documents are stored together in a single row whose JSON field holds 2,000,000 bytes, so the files
 *  added in the wizard share this much (the base64 text of the CV, the identity scans and the passport together). */
export const DOCS_BUDGET_BYTES = 1_900_000;
/** The size of some base64 documents added together. */
export const docsBytes = (...parts: (string | null | undefined)[]): number => parts.reduce((sum, p) => sum + (p ? p.length : 0), 0);
/** The message for a file that does not fit what is left of the budget. */
export function overBudgetMessage(leftBytes: number): string {
  const kb = Math.max(0, Math.floor(leftBytes / 1.37 / 1024)); // base64 is about a third bigger than the file
  return `That file is too large: all your documents together can be about 1.4 MB, and about ${kb} KB of that is left. Please use a smaller file or a lower-resolution scan.`;
}

const digitsOnly = (s: string) => s.replace(/[\s-]/g, '');

/** An error message for the bank details, or '' when they are fine. */
export function validateBankDetails(bank: { bankName: string; accountNumber: string; iban: string }, region: Region): string {
  const label = bankIdLabel(region);
  if (!bank.bankName.trim() || !bank.accountNumber.trim() || !bank.iban.trim()) {
    return `Required: all bank details (Bank Name, Account Number, and ${label}) must be filled to proceed.`;
  }
  if (!/^[0-9A-Za-z\- ]{6,34}$/.test(bank.accountNumber.trim())) return 'The account number should be 6 to 34 letters or digits.';
  if (isUsa(region) && !/^\d{9}$/.test(digitsOnly(bank.iban))) return 'A routing number is exactly 9 digits.';
  if (!isUsa(region) && !/^[A-Za-z]{2}\d{2}[A-Za-z0-9]{10,30}$/.test(digitsOnly(bank.iban))) return 'That IBAN does not look right: it starts with two letters and two digits, for example PK36SCBL0000001123456702.';
  return '';
}

/** An error message when the typed signature is not the person's full name (case and extra spaces do not matter). */
export function validateSignature(signed: string, fullName: string): string {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return signed.trim() && norm(signed) === norm(fullName) ? '' : 'Please sign with your exact full name to confirm.';
}

/** True for a PDF (by type, or by name when the browser gives no type). */
export const isPdf = (file: Pick<File, 'type' | 'name'>): boolean => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

/** What the guide step tells a new employee about. Kept next to the app's real sections. */
export const FEATURE_GUIDE = [
  { title: 'My Dashboard', text: 'Check your paid time off (PTO) and sick-leave balances, and see when each month’s salary is due.' },
  { title: 'Leave Management', text: 'Request leave by choosing dates and a reason, and follow the decision as HR or Admin makes it.' },
  { title: 'Salary', text: 'Open your payslips: base pay, bonuses and any leave deductions, month by month.' },
  { title: 'Tickets', text: 'Raise a question or problem with HR or Technical Support and keep the whole conversation in one place.' },
  { title: 'Team Chat', text: 'Message your team and HR, share files and see announcements from one place.' },
] as const;
