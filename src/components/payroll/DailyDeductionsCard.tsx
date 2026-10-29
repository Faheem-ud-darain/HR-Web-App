'use client';

import { useMemo, useState } from 'react';
import { CalendarCheckIcon as CalendarCheck, WarningIcon as AlertTriangle } from '@/components/ui/icons';
import { EmptyState } from '@/components/ui/EmptyState';
import { InfoNote } from '@/components/ui/InfoNote';
import { SectionCard } from '@/components/ui/SectionCard';
import { StatCard } from '@/components/ui/StatCard';
import { Tabs } from '@/components/ui/Tabs';
import { deductionLines, deductionMonths } from '@/lib/core/absences';
import { monthLabel } from '@/lib/core/payrollView';
import { getApprovedLeaveOnDate, formatMoney, type LeaveApplication, type MyAbsenceRecord, type Profile } from '@/lib/hrData';
import { getNYDateString } from '@/lib/timezone';

// "Tue, Oct 14" from a plain calendar date.
const dayLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

// Pay taken off for missed days, day by day: a switch between the months that have any (this month first), the month's
// total and number of days, and one line per day with what happened and what was charged. A day an approved leave now
// covers stays on the list but is not charged.
export function DailyDeductionsCard({ records, leaves, fullName, region }: { records: MyAbsenceRecord[]; leaves: LeaveApplication[]; fullName?: string; region?: Profile['region'] }) {
  const currentMonth = getNYDateString(new Date()).slice(0, 7);
  const months = useMemo(() => deductionMonths(records, currentMonth), [records, currentMonth]);
  const [picked, setPicked] = useState<string | null>(null);
  const month = picked && months.includes(picked) ? picked : currentMonth;

  const lines = useMemo(
    () => deductionLines(records.filter(r => r.date.startsWith(month)), date => (fullName ? getApprovedLeaveOnDate(leaves, fullName, date) : null)),
    [records, leaves, fullName, month],
  );
  const charged = lines.filter(l => !l.covered);
  const total = charged.reduce((sum, l) => sum + l.amount, 0);

  return (
    <SectionCard title="Daily Deductions" subtitle="Pay taken off for days you missed, shown day by day.">
      <div className="space-y-4 p-4 md:p-6">
        <InfoNote>A day is only judged once it is fully over, and what counts is your total time across all of that day&apos;s shifts. So if you had to start your shift again after an error or a disconnect, don&apos;t worry.</InfoNote>

        {months.length > 1 && <Tabs variant="chips" aria-label="Choose a month" value={month} onChange={setPicked} items={months.map(m => ({ value: m, label: m === currentMonth ? `${monthLabel(m)} (this month)` : monthLabel(m) }))} />}

        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Total deducted" size="md" valueTone={total > 0 ? 'danger' : 'default'} value={total > 0 ? `-${formatMoney(total, region)}` : formatMoney(0, region)} />
          <StatCard label="Days charged" size="md" value={charged.length} />
        </div>

        {lines.length === 0 ? <EmptyState py={6} size="xs">No deductions recorded in {monthLabel(month)}.</EmptyState> : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {lines.map(line => (
              <li key={line.id} className="flex items-center justify-between gap-3 bg-card px-4 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${line.covered ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                    {line.covered ? <CalendarCheck weight="duotone" className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle weight="duotone" className="h-4 w-4" aria-hidden="true" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{dayLabel(line.date)}</p>
                    <p className="text-caption font-semibold leading-snug text-slate-500">{line.label}</p>
                  </div>
                </div>
                <span className={`shrink-0 text-sm font-bold ${line.covered ? 'text-emerald-600' : 'text-rose-600'}`}>{line.covered ? 'Not charged' : `-${formatMoney(line.amount, region)}`}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
