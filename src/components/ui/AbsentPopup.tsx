'use client';

import React, { useEffect, useState } from 'react';
import { AlertOctagon, CheckCircle2 } from 'lucide-react';
import { hrActions, AbsenceRecord, formatMoney } from '@/lib/hrData';

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
// (not built on the shared <Modal>, which closes on backdrop/Escape/X) —
// the only way out is "I Understand", which calls
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

  useEffect(() => {
    if (!email) return;
    hrActions.getAbsenceRecords().then(all => {
      setRecords(all.filter(r => r.employeeEmail.toLowerCase() === email.toLowerCase()));
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

  const reasonText = current.reason === 'inactivity'
    ? `Our tracker recorded ${current.inactivityMinutes} minute(s) of continuous mouse inactivity during your shift that day, which crosses the 35-minute limit.`
    : `You did not start a shift on this day and there was no approved leave covering it.`;

  return (
    <div
      className="fixed inset-0 z-[var(--z-toast)] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm fade-enter"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="absent-popup-title"
    >
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden dialog-enter">
        <div className="px-5 pt-5 pb-4 bg-rose-50 border-b border-rose-200 flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-rose-100 border border-rose-200 flex items-center justify-center shrink-0">
            <AlertOctagon className="h-5 w-5 text-rose-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">Marked Absent</p>
            <h2 id="absent-popup-title" className="font-bold text-slate-900 text-base leading-tight mt-0.5">
              {current.date}
            </h2>
          </div>
        </div>

        <div className="px-5 py-4 max-h-[45vh] overflow-y-auto space-y-3">
          <p className="text-sm text-slate-700 leading-relaxed">{reasonText}</p>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deduction Applied</p>
            <p className="text-sm font-bold text-rose-600 mt-0.5">{formatMoney(current.deductionAmount, 'Pakistan')} (2 days&apos; pay)</p>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            If you believe this is a mistake, contact HR — this deduction shows up on your Payroll and Absent Details pages.
          </p>
        </div>

        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <p className="text-[10px] text-slate-400 font-semibold">
            {pending.length > 1 ? `${pending.length} absences need your acknowledgment` : ' '}
          </p>
          <button
            onClick={handleAcknowledge}
            disabled={acking}
            className="shrink-0 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-bold px-4 py-2 rounded-lg text-xs active:scale-97 transition-colors transition-transform shadow-sm flex items-center gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4" /> {acking ? 'Saving…' : 'I Understand'}
          </button>
        </div>
      </div>
    </div>
  );
}
