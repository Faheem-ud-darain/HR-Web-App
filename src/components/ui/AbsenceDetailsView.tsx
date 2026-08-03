'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { hrActions, AbsenceRecord, formatMoney } from '@/lib/hrData';
import { UserX, Clock, CalendarX2, CheckCircle2 } from 'lucide-react';

interface AbsenceDetailsViewProps {
  // 'employee' only ever sees their own records (filterEmail required in
  // that case); 'hr'/'admin' see everyone's, with the employee name shown
  // per row instead of being implied by the page itself.
  role: 'employee' | 'hr' | 'admin';
  filterEmail?: string;
}

// Shared list view for the "Absent Details" page across all 3 roles — see
// AbsenceRecord/runAbsenceCheck in hrData.ts for how these records get
// created (no-call-no-show or 35+ min shift inactivity, Pakistan-region
// employees only, 2 days' pay deducted per occurrence). This view is
// read-only; the only mutation an employee can make from their own side is
// acknowledging the AbsentPopup, which already happens there, not here.
export function AbsenceDetailsView({ role, filterEmail }: AbsenceDetailsViewProps) {
  const [records, setRecords] = useState<AbsenceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    hrActions.getAbsenceRecords().then(all => {
      const scoped = role === 'employee' && filterEmail
        ? all.filter(a => a.employeeEmail.toLowerCase() === filterEmail.toLowerCase())
        : all;
      setRecords([...scoped].sort((a, b) => b.date.localeCompare(a.date)));
      setLoading(false);
    });
  }, [role, filterEmail]);

  const totalDeducted = records.reduce((acc, r) => acc + r.deductionAmount, 0);

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-lg md:text-2xl font-bold text-slate-900">Absent Details</h1>
        <p className="text-xs md:text-sm text-slate-500">
          {role === 'employee'
            ? 'Days you were automatically marked absent for not starting a shift, or for excessive inactivity during one.'
            : 'Every employee automatically marked absent — no-call-no-show or excessive shift inactivity — with the specific reason and deduction applied.'}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Absences</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{records.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Deducted</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">{formatMoney(totalDeducted, 'Pakistan')}</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 md:col-span-1">
          <CardContent className="pt-5 pb-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Inactivity vs No-Show</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {records.filter(r => r.reason === 'inactivity').length} / {records.filter(r => r.reason === 'no_clock_in').length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-slate-200 overflow-hidden p-0">
        {loading ? (
          <div className="py-16 text-center text-xs font-semibold text-slate-400">Loading…</div>
        ) : records.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <UserX className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">No absences recorded</p>
            <p className="text-xs text-slate-400">
              {role === 'employee' ? "You haven't been marked absent — keep it up." : 'Nothing to review yet.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="text-left px-5 py-3 font-bold">Date</th>
                    {role !== 'employee' && <th className="text-left px-5 py-3 font-bold">Employee</th>}
                    <th className="text-left px-5 py-3 font-bold">Reason</th>
                    <th className="text-right px-5 py-3 font-bold">Deduction</th>
                    <th className="text-center px-5 py-3 font-bold">Acknowledged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map(r => (
                    <tr key={r.id}>
                      <td className="px-5 py-3 font-mono text-slate-700">{r.date}</td>
                      {role !== 'employee' && <td className="px-5 py-3 font-semibold text-slate-800">{r.employeeName}</td>}
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 text-slate-700">
                          {r.reason === 'inactivity' ? <Clock className="h-3.5 w-3.5 text-amber-500" /> : <CalendarX2 className="h-3.5 w-3.5 text-rose-500" />}
                          {r.reason === 'inactivity' ? `Inactive ${r.inactivityMinutes} min during shift` : 'Did not start a shift'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-rose-600">{formatMoney(r.deductionAmount, 'Pakistan')}</td>
                      <td className="px-5 py-3 text-center">
                        {r.acknowledged
                          ? <Badge variant="success"><span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Seen</span></Badge>
                          : <Badge variant="warning">Pending</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {records.map(r => (
                <div key={r.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-xs font-bold text-slate-800">{r.date}</p>
                    {r.acknowledged
                      ? <Badge variant="success">Seen</Badge>
                      : <Badge variant="warning">Pending</Badge>}
                  </div>
                  {role !== 'employee' && <p className="text-sm font-bold text-slate-900">{r.employeeName}</p>}
                  <p className="text-xs text-slate-600 inline-flex items-center gap-1.5">
                    {r.reason === 'inactivity' ? <Clock className="h-3.5 w-3.5 text-amber-500" /> : <CalendarX2 className="h-3.5 w-3.5 text-rose-500" />}
                    {r.reason === 'inactivity' ? `Inactive ${r.inactivityMinutes} min during shift` : 'Did not start a shift'}
                  </p>
                  <p className="text-xs font-bold text-rose-600">{formatMoney(r.deductionAmount, 'Pakistan')} deducted</p>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
