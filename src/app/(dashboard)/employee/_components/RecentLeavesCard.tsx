import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionCard } from '@/components/ui/SectionCard';
import { LeaveStatusBadge } from '@/components/ui/StatusBadges';
import { PlusCircleIcon as PlusCircle } from '@/components/ui/icons';
import type { LeaveApplication } from '@/lib/hrData';

const SHOWN = 5;

// The employee's latest leave requests (narrowed by the top-bar search), with a shortcut to ask for more leave.
export function RecentLeavesCard({ leaves, query }: { leaves: LeaveApplication[]; query: string }) {
  const q = query.toLowerCase();
  const matching = leaves.filter(l => l.type.toLowerCase().includes(q) || l.reason.toLowerCase().includes(q)).slice(0, SHOWN);
  return (
    <SectionCard title="Recent Leave Requests" action={<ButtonLink href="/employee/leaves" variant="outline" size="sm"><PlusCircle className="h-3.5 w-3.5" aria-hidden="true" /> Request leave</ButtonLink>}>
      {matching.length === 0 ? <EmptyState py={8} size="xs">No leave history found.</EmptyState> : (
        <ul className="divide-y divide-slate-100">
          {matching.map(leave => (
            <li key={leave.id} className="flex items-center justify-between gap-3 px-4 md:px-6 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">{leave.type} <span className="font-semibold text-slate-500">· {leave.duration}</span></p>
                {leave.reason && <p className="mt-0.5 truncate text-caption font-semibold text-slate-500">{leave.reason}</p>}
              </div>
              <LeaveStatusBadge status={leave.status} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
