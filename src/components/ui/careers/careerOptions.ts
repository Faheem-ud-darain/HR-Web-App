import type { CareerApplicationStatus } from '@/lib/hrData';
import type { BadgeVariant } from '@/components/ui/Badge';

export const DEPARTMENTS = ['Engineering', 'Design', 'Marketing', 'Operations', 'HR'];

export const APPLICATION_STATUSES: { value: CareerApplicationStatus; label: string; variant: BadgeVariant }[] = [
  { value: 'pending', label: 'Pending', variant: 'default' },
  { value: 'reviewed', label: 'Reviewed', variant: 'indigo' },
  { value: 'shortlisted', label: 'Shortlisted', variant: 'warning' },
  { value: 'rejected', label: 'Rejected', variant: 'danger' },
  { value: 'hired', label: 'Hired', variant: 'success' },
];
