import { dayLabel, deductionLimitedBy, groupDeductions } from '@/lib/core/payrollView';
import type { DeductionItem } from '@/lib/hr/types';

// Why pay was taken off, in plain groups (Short hours, Absences, Leave taken, ...). Each group opens to its reasons; a reason that
// belongs to one day starts with that day ("Tue, Oct 14 · Didn't start a shift"). Shared by the HR/Admin pay slip and the
// employee's own receipt, so both read the same.
export function DeductionBreakdown({ breakdown, deducted, money }: { breakdown: DeductionItem[]; deducted: number; money: (amount: number) => string }) {
  const groups = groupDeductions(breakdown);
  const limitedBy = deductionLimitedBy(breakdown, deducted);
  return (
    <>
      {groups.map(g => (
        <details key={g.key} className="group rounded-lg border border-slate-200 bg-white px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between text-rose-700">
            <span className="font-semibold">{g.label}</span>
            <span className="font-bold">−{money(g.total)}</span>
          </summary>
          <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-slate-600">
            {g.items.map((item, i) => (
              <li key={i} className="flex items-start justify-between gap-3 leading-snug">
                <span>{item.date && <span className="font-bold text-slate-800">{dayLabel(item.date)} · </span>}{item.date ? item.label.replace(/^(Absence|Partial Shifts) — /, '') : item.label}</span>
                <span className="shrink-0 font-semibold">−{money(item.amount)}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
      {limitedBy > 0 && (
        <div className="flex justify-between text-emerald-700"><span className="font-semibold">Limited to the month&apos;s pay (it can go down to zero, not below)</span><span className="shrink-0 font-bold">+{money(limitedBy)}</span></div>
      )}
      {groups.length === 0 && <p className="text-slate-400">Nothing was deducted this month.</p>}
    </>
  );
}
