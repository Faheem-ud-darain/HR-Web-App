import type { CareerApplicationStatus } from '@/lib/hrData';
import type { BadgeVariant } from '@/components/ui/Badge';

export const DEPARTMENTS = ['Engineering', 'Design', 'Marketing', 'Operations', 'HR'];

// The careers page's opening words. Used by the careers view and by the landing page's hero, so they can never differ.
export const CAREERS_HERO = {
  title: 'Work with DelCargo',
  text: 'We are building the future of supply-chain technology. Join our collaborative logistics and product teams in creating beautiful, operational-grade software.',
};

export const APPLICATION_STATUSES: { value: CareerApplicationStatus; label: string; variant: BadgeVariant }[] = [
  { value: 'pending', label: 'Pending', variant: 'default' },
  { value: 'reviewed', label: 'Reviewed', variant: 'indigo' },
  { value: 'shortlisted', label: 'Shortlisted', variant: 'warning' },
  { value: 'rejected', label: 'Rejected', variant: 'danger' },
  { value: 'hired', label: 'Hired', variant: 'success' },
];
