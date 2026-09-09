'use client';

// Admin Analytics Insights — plan 007. Read-only aggregation over data every
// other payroll/absence page already fetches (useProfiles, usePayroll,
// useLeaves, hrActions.getAbsenceRecords) — no new API routes, no schema
// changes, no changes to computePayrollView or any payroll math.
//
// Built per the `dataviz` skill: categorical hues assigned by identity
// (region, leave/absence type) using the skill's validated default palette
// (references/palette.md) rather than the app's ad hoc status colors
// (emerald/amber), since these are series identities, not a status. Charts
// are hand-rolled inline SVG/div bars, matching this codebase's existing
// EmployeeActivityInsights.tsx precedent — no charting dependency added.
//
// IMPORTANT: USA salaries are USD and Pakistan salaries are PKR (see
// formatMoney) — two genuinely different currencies with no conversion
// anywhere in this app. Every money figure on this page is therefore kept
// PER-REGION and never summed across regions into one blended number; only
// counts (headcount, leave days, absence records) are ever combined.

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import {
  useProfiles,
  usePayroll,
  useLeaves,
  hrActions,
  getApprovedLeaveDaysInMonth,
  formatMoney,
  AbsenceRecord,
} from '@/lib/hrData';
import { BarChart3, Users, Wallet, PiggyBank, Table2 } from 'lucide-react';

// Dataviz skill's validated default categorical palette (references/palette.md,
// light-mode column) — slot 1 blue, slot 2 orange, slot 3 aqua. Assigned by
// identity (region / leave-type), fixed order, never cycled or re-assigned
// when a filter changes which series are present.
const SERIES = {
  usa: '#2a78d6',
  pakistan: '#eb6834',
  urgent: '#2a78d6',
  normal: '#eb6834',
  absence: '#1baf7a',
};

function lastNMonthKeys(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

interface HoverState {
  chart: 'payroll' | 'absence' | 'headcount';
  idx: number;
  seriesLabel: string;
  value: string;
}

export default function AdminInsightsPage() {
  const { data: profiles = [] } = useProfiles();
  const { data: payroll = [] } = usePayroll();
  const { data: leaves = [] } = useLeaves();
  // One-time fetch, not a React Query hook — same pattern hr/payroll/page.tsx
  // uses for absence records (see that page's own comment on why).
  const [absenceRecords, setAbsenceRecords] = useState<AbsenceRecord[]>([]);
  useEffect(() => { hrActions.getAbsenceRecords().then(setAbsenceRecords); }, []);

  const [showPayrollTable, setShowPayrollTable] = useState(false);
  const [showAbsenceTable, setShowAbsenceTable] = useState(false);
  const [hover, setHover] = useState<HoverState | null>(null);

  const months = useMemo(() => lastNMonthKeys(6), []);

  const payrollByMonth = useMemo(() => months.map(month => {
    const usa = payroll
      .filter(p => p.month === month && (p.region || 'Pakistan') === 'USA')
      .reduce((s, p) => s + (p.baseSalary + p.bonus - p.deductions + p.incrementAmount), 0);
    const pakistan = payroll
      .filter(p => p.month === month && (p.region || 'Pakistan') === 'Pakistan')
      .reduce((s, p) => s + (p.baseSalary + p.bonus - p.deductions + p.incrementAmount), 0);
    return { month, usa, pakistan };
  }), [months, payroll]);

  const absenceLeaveByMonth = useMemo(() => months.map(month => {
    const urgentDays = profiles.reduce((s, emp) => s + getApprovedLeaveDaysInMonth(leaves, emp.fullName, 'Urgent', month), 0);
    const normalDays = profiles.reduce((s, emp) => s + getApprovedLeaveDaysInMonth(leaves, emp.fullName, 'Normal', month), 0);
    const absenceCount = absenceRecords.filter(a => a.date.startsWith(month)).length;
    return { month, urgentDays, normalDays, absenceCount };
  }), [months, profiles, leaves, absenceRecords]);

  const headcountByRegion = useMemo(() => {
    const usa = profiles.filter(p => (p.region || 'Pakistan') === 'USA').length;
    const pakistan = profiles.filter(p => (p.region || 'Pakistan') === 'Pakistan').length;
    return [
      { label: 'USA', count: usa, color: SERIES.usa },
      { label: 'Pakistan', count: pakistan, color: SERIES.pakistan },
    ];
  }, [profiles]);

  // Stat tiles — pending liability and reserved balance are both kept
  // per-region for the same currency reason as the payroll chart.
  const currentMonth = payrollByMonth[payrollByMonth.length - 1];
  const pendingLiability = useMemo(() => {
    const unprocessed = payroll.filter(p => !p.processed);
    const usa = unprocessed.filter(p => (p.region || 'Pakistan') === 'USA')
      .reduce((s, p) => s + (p.baseSalary + p.bonus - p.deductions + p.incrementAmount), 0);
    const pakistan = unprocessed.filter(p => (p.region || 'Pakistan') === 'Pakistan')
      .reduce((s, p) => s + (p.baseSalary + p.bonus - p.deductions + p.incrementAmount), 0);
    return { usa, pakistan };
  }, [payroll]);
  const reservedHeld = useMemo(() => {
    const usa = profiles.filter(p => (p.region || 'Pakistan') === 'USA')
      .reduce((s, p) => s + (p.reservedSalaryBalance || 0) + (p.manualReservedAmount || 0), 0);
    const pakistan = profiles.filter(p => (p.region || 'Pakistan') === 'Pakistan')
      .reduce((s, p) => s + (p.reservedSalaryBalance || 0) + (p.manualReservedAmount || 0), 0);
    return { usa, pakistan };
  }, [profiles]);

  const maxPayroll = Math.max(1, ...payrollByMonth.flatMap(m => [m.usa, m.pakistan]));
  const maxAbsenceLeave = Math.max(1, ...absenceLeaveByMonth.map(m => m.urgentDays + m.normalDays + m.absenceCount));
  const maxHeadcount = Math.max(1, ...headcountByRegion.map(h => h.count));

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Insights</h1>
        <p className="text-xs md:text-sm text-slate-500">
          Payroll, absence/leave, and headcount trends at a glance — read-only,
          built from the same data as Payroll Records and Attendance.
        </p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-slate-200 bg-white">
          <CardContent className="pt-5 pb-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-slate-400" /> Total Headcount
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{profiles.length}</p>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{headcountByRegion[0].count} USA · {headcountByRegion[1].count} Pakistan</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardContent className="pt-5 pb-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-slate-400" /> Payroll Cost — {currentMonth ? monthLabel(currentMonth.month) : ''}
            </p>
            <p className="text-sm font-bold text-slate-900 mt-1">{formatMoney(currentMonth?.usa || 0, 'USA')}</p>
            <p className="text-sm font-bold text-slate-900">{formatMoney(currentMonth?.pakistan || 0, 'Pakistan')}</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardContent className="pt-5 pb-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-slate-400" /> Pending Payroll Liability
            </p>
            <p className="text-sm font-bold text-slate-900 mt-1">{formatMoney(pendingLiability.usa, 'USA')}</p>
            <p className="text-sm font-bold text-slate-900">{formatMoney(pendingLiability.pakistan, 'Pakistan')}</p>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Not-yet-processed payroll records</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardContent className="pt-5 pb-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <PiggyBank className="h-3.5 w-3.5 text-slate-400" /> Reserved Salary Held
            </p>
            <p className="text-sm font-bold text-slate-900 mt-1">{formatMoney(reservedHeld.usa, 'USA')}</p>
            <p className="text-sm font-bold text-slate-900">{formatMoney(reservedHeld.pakistan, 'Pakistan')}</p>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Paid out only at resignation/termination</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart 1 — Payroll cost over time, one series per region */}
      <Card className="border border-slate-200 bg-white p-0 overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" style={{ color: SERIES.usa }} /> Payroll Cost — Last 6 Months
            </h3>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
              USA (USD) and Pakistan (PKR) shown separately — never summed, since they&apos;re different currencies.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: SERIES.usa }} /> USA</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: SERIES.pakistan }} /> Pakistan</span>
            </div>
            <button
              onClick={() => setShowPayrollTable(v => !v)}
              className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <Table2 className="h-3.5 w-3.5" /> {showPayrollTable ? 'Chart View' : 'Table View'}
            </button>
          </div>
        </div>
        <CardContent className="p-4 md:p-6">
          {showPayrollTable ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="font-bold text-slate-500 bg-slate-50 uppercase tracking-widest border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5">Month</th>
                    <th className="px-3 py-2.5 text-right">USA</th>
                    <th className="px-3 py-2.5 text-right">Pakistan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payrollByMonth.map(m => (
                    <tr key={m.month} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2.5 font-bold text-slate-800">{monthLabel(m.month)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{formatMoney(m.usa, 'USA')}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{formatMoney(m.pakistan, 'Pakistan')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-end justify-between gap-3 md:gap-5 h-48 px-1">
              {payrollByMonth.map((m, idx) => {
                const totalPx = 160;
                const usaH = (m.usa / maxPayroll) * totalPx;
                const pakH = (m.pakistan / maxPayroll) * totalPx;
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-2">
                    <div className="relative w-full flex items-end justify-center gap-1" style={{ height: totalPx }}>
                      {hover?.chart === 'payroll' && hover.idx === idx && (
                        <div className="absolute -top-14 z-10 bg-slate-900 text-white text-[10px] font-semibold rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                          <div>{monthLabel(m.month)}</div>
                          <div>{hover.seriesLabel}: <span className="font-bold">{hover.value}</span></div>
                        </div>
                      )}
                      <div
                        className="w-full max-w-[18px] rounded-t"
                        style={{ height: Math.max(usaH, m.usa > 0 ? 3 : 0), backgroundColor: SERIES.usa }}
                        onMouseEnter={() => setHover({ chart: 'payroll', idx, seriesLabel: 'USA', value: formatMoney(m.usa, 'USA') })}
                        onMouseLeave={() => setHover(null)}
                      />
                      <div
                        className="w-full max-w-[18px] rounded-t"
                        style={{ height: Math.max(pakH, m.pakistan > 0 ? 3 : 0), backgroundColor: SERIES.pakistan }}
                        onMouseEnter={() => setHover({ chart: 'payroll', idx, seriesLabel: 'Pakistan', value: formatMoney(m.pakistan, 'Pakistan') })}
                        onMouseLeave={() => setHover(null)}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500">{monthLabel(m.month)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart 2 — Absence & leave trend, stacked bar */}
      <Card className="border border-slate-200 bg-white p-0 overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" style={{ color: SERIES.absence }} /> Absence &amp; Leave — Last 6 Months
            </h3>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
              Urgent/Normal leave counted in days actually falling in that month; absence is unexplained no-clock-in/inactivity/under-4-hours records.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: SERIES.urgent }} /> Urgent Leave</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: SERIES.normal }} /> Normal Leave</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: SERIES.absence }} /> Absence</span>
            </div>
            <button
              onClick={() => setShowAbsenceTable(v => !v)}
              className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <Table2 className="h-3.5 w-3.5" /> {showAbsenceTable ? 'Chart View' : 'Table View'}
            </button>
          </div>
        </div>
        <CardContent className="p-4 md:p-6">
          {showAbsenceTable ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="font-bold text-slate-500 bg-slate-50 uppercase tracking-widest border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5">Month</th>
                    <th className="px-3 py-2.5 text-right">Urgent Leave (days)</th>
                    <th className="px-3 py-2.5 text-right">Normal Leave (days)</th>
                    <th className="px-3 py-2.5 text-right">Absence (records)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {absenceLeaveByMonth.map(m => (
                    <tr key={m.month} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2.5 font-bold text-slate-800">{monthLabel(m.month)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{m.urgentDays}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{m.normalDays}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{m.absenceCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-end justify-between gap-3 md:gap-5 h-48 px-1">
              {absenceLeaveByMonth.map((m, idx) => {
                const totalPx = 160;
                const urgentH = (m.urgentDays / maxAbsenceLeave) * totalPx;
                const normalH = (m.normalDays / maxAbsenceLeave) * totalPx;
                const absenceH = (m.absenceCount / maxAbsenceLeave) * totalPx;
                const total = m.urgentDays + m.normalDays + m.absenceCount;
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-2">
                    <div
                      className="relative w-full max-w-[28px] flex flex-col items-center justify-end cursor-pointer"
                      style={{ height: totalPx }}
                      onMouseEnter={() => setHover({ chart: 'absence', idx, seriesLabel: 'Total', value: `${total}` })}
                      onMouseLeave={() => setHover(null)}
                    >
                      {hover?.chart === 'absence' && hover.idx === idx && (
                        <div className="absolute -top-20 z-10 bg-slate-900 text-white text-[10px] font-semibold rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                          <div>{monthLabel(m.month)}</div>
                          <div>Urgent: <span className="font-bold">{m.urgentDays}d</span></div>
                          <div>Normal: <span className="font-bold">{m.normalDays}d</span></div>
                          <div>Absence: <span className="font-bold">{m.absenceCount}</span></div>
                        </div>
                      )}
                      {total === 0 ? (
                        <div className="w-full h-1 rounded-full bg-slate-100" />
                      ) : (
                        <div className="w-full rounded-t-md rounded-b-md overflow-hidden flex flex-col justify-end">
                          <div className="w-full" style={{ height: Math.max(urgentH, m.urgentDays > 0 ? 3 : 0), backgroundColor: SERIES.urgent, marginBottom: (m.urgentDays > 0 && (m.normalDays > 0 || m.absenceCount > 0)) ? 2 : 0 }} />
                          <div className="w-full" style={{ height: Math.max(normalH, m.normalDays > 0 ? 3 : 0), backgroundColor: SERIES.normal, marginBottom: (m.normalDays > 0 && m.absenceCount > 0) ? 2 : 0 }} />
                          <div className="w-full rounded-b-md" style={{ height: Math.max(absenceH, m.absenceCount > 0 ? 3 : 0), backgroundColor: SERIES.absence }} />
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-slate-500">{monthLabel(m.month)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart 3 — Headcount by region */}
      <Card className="border border-slate-200 bg-white p-0 overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-slate-500" /> Headcount by Region
          </h3>
          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Current snapshot from active employee profiles.</p>
        </div>
        <CardContent className="p-4 md:p-6 space-y-3">
          {headcountByRegion.map((h, idx) => (
            <div key={h.label} className="flex items-center gap-3">
              <span className="w-20 text-xs font-bold text-slate-700 shrink-0">{h.label}</span>
              <div
                className="relative flex-1 h-6 bg-slate-100 rounded-md overflow-hidden cursor-pointer"
                onMouseEnter={() => setHover({ chart: 'headcount', idx, seriesLabel: h.label, value: `${h.count}` })}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className="h-full rounded-md transition-[width] duration-700 ease-out"
                  style={{ width: `${(h.count / maxHeadcount) * 100}%`, backgroundColor: h.color }}
                />
                {hover?.chart === 'headcount' && hover.idx === idx && (
                  <div className="absolute -top-11 left-0 z-10 bg-slate-900 text-white text-[10px] font-semibold rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                    {h.label}: <span className="font-bold">{h.count}</span>
                  </div>
                )}
              </div>
              <span className="w-10 text-right text-xs font-bold text-slate-900 shrink-0">{h.count}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
