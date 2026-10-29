'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionCard } from '@/components/ui/SectionCard';
import { CalendarBlankIcon as Calendar, CaretRightIcon as ChevronRight } from '@/components/ui/icons';
import { TASK_PRIORITY_STYLES, TASK_STATUS_LABELS, TASK_STATUS_STYLES } from '@/components/ui/StatusBadges';
import type { Task } from '@/lib/hrData';
import { formatDateNY } from '@/lib/timezone';

const SHOWN_AT_FIRST = 4;
const DAY_MS = 24 * 3600 * 1000;
const PILL = 'text-caption font-bold px-2 py-0.5 rounded-full border';

// The employee's own tasks: open ones first, the soonest due on top, each a button that opens the task.
export function TasksCard({ tasks, now, onOpen }: { tasks: Task[]; now: number; onOpen: (task: Task) => void }) {
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(
    () => [...tasks].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.dueDate.localeCompare(b.dueDate)),
    [tasks],
  );
  const shown = showAll ? sorted : sorted.slice(0, SHOWN_AT_FIRST);
  return (
    <SectionCard title="My Tasks" count={tasks.filter(t => t.status !== 'done').length}>
      {tasks.length === 0 ? <EmptyState py={8} size="xs">No tasks assigned to you.</EmptyState> : (
        <ul className="divide-y divide-slate-100">
          {shown.map(task => {
            const done = task.status === 'done';
            const untilDue = now ? new Date(task.dueDate).getTime() - now : Infinity;
            const overdue = !done && untilDue < 0;
            const dueSoon = !done && !overdue && untilDue / DAY_MS <= 3;
            return (
              <li key={task.id}>
                <button type="button" onClick={() => onOpen(task)} className={`group flex w-full items-center gap-3 px-4 md:px-6 py-3 text-left transition-colors hover:bg-slate-50 ${done ? 'opacity-70' : ''}`}>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={`text-sm font-bold text-slate-900 ${done ? 'line-through opacity-60' : ''}`}>{task.title}</span>
                      <span className={`${PILL} ${TASK_PRIORITY_STYLES[task.priority]}`}>{task.priority}</span>
                      {overdue && <span className={`${PILL} border-rose-200 bg-rose-100 text-rose-700`}>OVERDUE</span>}
                      {dueSoon && <span className={`${PILL} border-amber-200 bg-amber-100 text-amber-700`}>DUE SOON</span>}
                    </span>
                    <span className="mt-1 flex items-center gap-1 text-caption font-semibold text-slate-500"><Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Due {formatDateNY(task.dueDate)} · {task.team}</span>
                  </span>
                  <span className={`${PILL} shrink-0 ${TASK_STATUS_STYLES[task.status]}`}>{TASK_STATUS_LABELS[task.status]}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-orange-500" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {sorted.length > SHOWN_AT_FIRST && (
        <div className="border-t border-slate-100 px-4 py-2 md:px-6"><Button variant="ghost" size="sm" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show fewer' : `Show all ${sorted.length}`}</Button></div>
      )}
    </SectionCard>
  );
}
