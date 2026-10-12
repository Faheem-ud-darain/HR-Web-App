import React from 'react';
import { Badge } from './Badge';
import type { LeaveApplication, Task } from '@/lib/hrData';

// Leave + task status/priority/type styling used by the HR, Admin and
// Employee pages. These maps were copy-pasted per page and had started to
// drift; define them once here.

export const LEAVE_TYPE_COLORS: Record<string, string> = {
  'PTO': 'bg-indigo-100 text-indigo-800',
  'Sick Leave': 'bg-amber-100 text-amber-800',
  'Urgent': 'bg-rose-100 text-rose-800',
  'Normal': 'bg-sky-100 text-sky-800',
  'Parental Leave': 'bg-emerald-100 text-emerald-800',
};

const LEAVE_STATUS: Record<LeaveApplication['status'], { variant: 'success' | 'warning' | 'danger' | 'default'; label: string }> = {
  pending:     { variant: 'warning', label: 'Pending'      },
  hr_approved: { variant: 'default', label: 'HR Approved'  },
  approved:    { variant: 'success', label: 'CEO Approved' },
  rejected:    { variant: 'danger',  label: 'Rejected'     },
};

export function LeaveStatusBadge({ status, className }: { status: LeaveApplication['status']; className?: string }) {
  const { variant, label } = LEAVE_STATUS[status];
  return <Badge variant={variant} className={className}>{label}</Badge>;
}

export const TASK_PRIORITY_STYLES: Record<Task['priority'], string> = {
  high:   'bg-rose-100 text-rose-800 border-rose-200',
  medium: 'bg-orange-100 text-orange-800 border-orange-200',
  low:    'bg-slate-100 text-slate-600 border-slate-200',
};

export const TASK_STATUS_STYLES: Record<Task['status'], string> = {
  todo:        'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  done:        'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export const TASK_STATUS_LABELS: Record<Task['status'], string> = {
  todo:        'To Do',
  in_progress: 'In Progress',
  done:        'Done',
};
