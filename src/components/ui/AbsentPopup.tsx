'use client';

import React, { useEffect, useState } from 'react';
import { WarningOctagonIcon as AlertOctagon } from '@/components/ui/icons';
import { AcknowledgeModal } from '@/components/ui/AcknowledgeModal';
import { INACTIVITY_THRESHOLD_SECONDS } from '@/lib/core/absences';
import { hrActions, AbsenceRecord, LeaveApplication, formatMoney, useLeaves, getApprovedLeaveOnDate } from '@/lib/hrData';

interface AbsentPopupProps {
  email: string | null;
}

// Blocking-ish explanatory popup shown to an employee the first time they
// see a new AbsenceRecord created for them (see runAbsenceCheck in
// hrData.ts) — tells them exactly which day, which reason (didn't clock in
// vs. inactive too long during a shift), and what was deducted, so getting
// marked absent is never a silent surprise they only discover on payday.
//
// Same non-dismissible-except-its-own-button shape as AnnouncementPopup
// (both use AcknowledgeModal) — the only way out is "I Understand", which calls
// hrActions.acknowledgeAbsence (a real server write). Shown one record at a
// time; acknowledging one immediately reveals the next pending one, if any.
//
// Mounted once in (dashboard)/layout.tsx for employee/team_lead only — HR/
// Admin see every employee's absences on the dedicated Absent Details page
// instead (they're never the subject of this popup).
export function AbsentPopup({ email }: AbsentPopupProps) {
  const [records, setRecords] = useState<AbsenceRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [acking, setAcking] = useState(false);
  // Re-checked here, live, against the record's OWN employeeName/date —
  // runAbsenceCheck only knew whether a leave was approved at the moment it
  // scanned (a 5-day lookback), so a leave approved AFTER that scan leaves
  // this popup explaining a stale no-show/under-4h/inactivity reason for a
  // day that is really now an approved leave day. See
  // getApprovedLeaveOnDate's comment in hrData.ts.
  // Scoped to the absence that is actually shown (the oldest unacknowledged one), not simply the first
  // record: if the employee's name changed between records those can differ, and the leave that covers
  // the shown day would then be missing from the query.
  const shownName = records.filter(r => !r.acknowledged).sort((a, b) => a.date.localeCompare(b.date))[0]?.employeeName ?? null;
  const { data: leaves = [] } = useLeaves({ employeeName: shownName });

  useEffect(() => {
    if (!email) return;
    // Scoped to this employee server-side — not the whole company's records.
    hrActions.getAbsenceRecords({ email }).then(all => {
      setRecords(all);
      setLoaded(true);
    });
  }, [email]);

  if (!email || !loaded) return null;

  // Oldest-first so if someone missed several days in a row, they walk
  // through them in the order they happened rather than newest-first.
  const pending = records.filter(r => !r.acknowledged).sort((a, b) => a.date.localeCompare(b.date));
  if (pending.length === 0) return null;
  const current = pending[0];

  const handleAcknowledge = async () => {
    if (acking) return;
    setAcking(true);
    try {
      await hrActions.acknowledgeAbsence(current.id);
      setRecords(prev => prev.map(r => r.id === current.id ? { ...r, acknowledged: true } : r));
    } finally {
      setAcking(false);
    }
  };

  const coveringLeave: LeaveApplication | null = getApprovedLeaveOnDate(leaves, current.employeeName, current.date);

  const reasonText = coveringLeave
    ? `This day is now covered by your approved ${coveringLeave.type} Leave request (approved after this was originally recorded) — it's no longer treated as an unexplained absence.`
    : current.reason === 'inactivity'
    ? `Our tracker recorded ${current.inactivityMinutes} minute(s) of continuous mouse inactivity during your shift that day, which crosses the ${INACTIVITY_THRESHOLD_SECONDS / 60}-minute limit.`
    : current.reason === 'under_4_hours'
    ? `Your total shift time was under the required 4-hour minimum (${Math.floor((current.workedMinutes || 0) / 60)}h ${(current.workedMinutes || 0) % 60}m recorded) on this day.`
    : `You did not start a shift on this day and there was no approved leave covering it.`;

  return (
    <AcknowledgeModal
      tone="rose" icon={AlertOctagon} eyebrow="Marked Absent" title={current.date}
      note={pending.length > 1 ? `${pending.length} absences need your acknowledgment` : undefined}
      actionLabel="I Understand" busy={acking} onAction={handleAcknowledge}
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-700 leading-relaxed">{reasonText}</p>
        {coveringLeave ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
            <p className="text-caption font-bold text-emerald-600 uppercase tracking-wider">No Absence Deduction</p>
            <p className="text-sm font-bold text-emerald-700 mt-0.5">Charged as {coveringLeave.type} Leave instead — see your Payroll page for that amount.</p>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
            <p className="text-caption font-bold text-slate-400 uppercase tracking-wider">Deduction Applied</p>
            <p className="text-sm font-bold text-rose-600 mt-0.5">{formatMoney(current.deductionAmount, 'Pakistan')} (2 days&apos; pay)</p>
          </div>
        )}
        <p className="text-caption text-slate-400 leading-relaxed">
          If you believe this is a mistake, contact HR — this deduction shows up on your Payroll and Absent Details pages.
        </p>
      </div>
    </AcknowledgeModal>
  );
}
