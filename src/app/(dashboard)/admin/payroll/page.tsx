'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DollarSign, CheckCircle2, TrendingUp } from 'lucide-react';
import { usePayroll, useProfiles, useLeaves, useTimesheets, hrActions, formatMoney, PayrollRecord, AbsenceRecord, applyIncrementServer, upsertPayrollRecordAdmin, updateProfileAdmin } from '@/lib/hrData';
import { NetPayableModal } from '@/components/ui/NetPayableModal';
import { PaginationControls } from '@/components/ui/PaginationControls';
import { usePagination } from '@/hooks/usePagination';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface PayrollSummary {
  department: string;
  headcount: number;
  totalBase: number;
  totalBonuses: number;
  totalDeductions: number;
  totalIncrements: number;
  // Departments can span both regions, so USD and PKR totals must stay
  // separate — they are not the same currency and must never be added.
  totalBaseUSD: number;
  totalBasePKR: number;
  totalIncrementsUSD: number;
  totalIncrementsPKR: number;
  totalBonusesUSD: number;
  totalBonusesPKR: number;
  totalDeductionsUSD: number;
  totalDeductionsPKR: number;
  totalNetUSD: number;
  totalNetPKR: number;
}

export default function AdminPayrollPage() {
  const { data: rawPayroll = [], refetch: refetchPayroll } = usePayroll();
  const { data: employees = [], refetch: refetchProfiles } = useProfiles();
  const { data: leaves = [] } = useLeaves();
  const { data: timesheets = [] } = useTimesheets();
  // No dedicated React Query hook for this — it's stored in the generic KV
  // collection, not its own PocketBase collection (see AbsenceRecord's own
  // comment in hrData.ts). Plain one-time fetch on mount is fine here.
  const [absenceRecords, setAbsenceRecords] = useState<AbsenceRecord[]>([]);
  useEffect(() => { hrActions.getAbsenceRecords().then(setAbsenceRecords); }, []);
  // computePayrollView is a PURE function — it never writes. It recomputes
  // the current view (pending increments, urgent-leave deductions,
  // no-call-no-show/inactivity absence deductions, etc.) on top of whatever
  // payroll records already exist server-side. Memoized so it doesn't
  // produce a fresh array reference (and re-trigger the summary effect) on
  // every render.
  const payroll = useMemo(() => hrActions.computePayrollView(employees, rawPayroll, leaves, timesheets, absenceRecords), [employees, rawPayroll, leaves, timesheets, absenceRecords]);
  const { page, setPage, totalPages, pageItems } = usePagination(payroll, 25);
  const [summaries, setSummaries] = useState<PayrollSummary[]>([]);
  const [isReleasing, setIsReleasing] = useState(false);
  const [showReleaseConfirm, setShowReleaseConfirm] = useState(false);
  const [isNetPayableOpen, setIsNetPayableOpen] = useState(false);
  const [netPayableRecord, setNetPayableRecord] = useState<PayrollRecord | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    // Group dynamically by employee teams/departments
    const depts = Array.from(new Set(employees.flatMap(e => e.teams)));
    const calculatedSummaries = depts.map(dept => {
      const deptEmployees = employees.filter(e => e.teams.includes(dept));
      const deptPayroll = payroll.filter(p => deptEmployees.some(e => e.id === p.employeeId));
      const usdPayroll = deptPayroll.filter(p => p.region === 'USA');
      const pkrPayroll = deptPayroll.filter(p => p.region !== 'USA');
      const netOf = (p: PayrollRecord) => p.baseSalary + p.incrementAmount + p.bonus - p.deductions;

      return {
        department: dept,
        headcount: deptEmployees.length,
        totalBase: deptPayroll.reduce((acc, p) => acc + p.baseSalary, 0),
        totalBonuses: deptPayroll.reduce((acc, p) => acc + p.bonus, 0),
        totalDeductions: deptPayroll.reduce((acc, p) => acc + p.deductions, 0),
        totalIncrements: deptPayroll.reduce((acc, p) => acc + p.incrementAmount, 0),
        totalBaseUSD: usdPayroll.reduce((acc, p) => acc + p.baseSalary, 0),
        totalBasePKR: pkrPayroll.reduce((acc, p) => acc + p.baseSalary, 0),
        totalIncrementsUSD: usdPayroll.reduce((acc, p) => acc + p.incrementAmount, 0),
        totalIncrementsPKR: pkrPayroll.reduce((acc, p) => acc + p.incrementAmount, 0),
        totalBonusesUSD: usdPayroll.reduce((acc, p) => acc + p.bonus, 0),
        totalBonusesPKR: pkrPayroll.reduce((acc, p) => acc + p.bonus, 0),
        totalDeductionsUSD: usdPayroll.reduce((acc, p) => acc + p.deductions, 0),
        totalDeductionsPKR: pkrPayroll.reduce((acc, p) => acc + p.deductions, 0),
        totalNetUSD: usdPayroll.reduce((acc, p) => acc + netOf(p), 0),
        totalNetPKR: pkrPayroll.reduce((acc, p) => acc + netOf(p), 0)
      };
    });

    setSummaries(calculatedSummaries);
  }, [payroll, employees]);

  // Real status — derived from actual payroll records, not a local toggle.
  // "Released" means every current payroll record has genuinely been
  // processed (same `processed` flag HR's per-employee Process button sets).
  const isReleased = payroll.length > 0 && payroll.every(p => p.processed);

  const handleReleaseMonthlyFunds = async () => {
    setShowReleaseConfirm(true);
  };

  const confirmReleaseMonthlyFunds = async () => {
    setShowReleaseConfirm(false);
    const pending = payroll.filter(p => !p.processed);
    setIsReleasing(true);

    // Permanently fold any pending anniversary increments into each
    // employee's real base salary before finalizing the cycle.
    for (const record of pending) {
      if (record.incrementAmount > 0) {
        const emp = employees.find(e => e.id === record.employeeId);
        if (emp) {
          await applyIncrementServer(emp, emp.baseSalary, record.incrementAmount);
        }
      }
      // First-month reserve (item 3) — see hr/payroll's handleProcess for
      // the full explanation; mirrored here for Admin's bulk release path.
      if (record.reservedThisMonth > 0) {
        const emp = employees.find(e => e.id === record.employeeId);
        if (emp) {
          await updateProfileAdmin(record.employeeId, { reservedSalaryBalance: (emp.reservedSalaryBalance || 0) + record.reservedThisMonth });
        }
      }
    }

    // Process all payroll records (persist the current computed view now
    // that the admin has explicitly clicked Release).
    for (const record of payroll) {
      await upsertPayrollRecordAdmin({ ...record, processed: true });
    }

    refetchProfiles();
    refetchPayroll();
    setIsReleasing(false);
  };

  // Single-employee equivalent of handleReleaseMonthlyFunds above, for the
  // Net Payable modal's "Mark as Paid" button — mirrors hr/payroll/page.tsx's
  // handleProcess exactly (increment fold-in, then first-month-reserve
  // bank-in, then the actual processed:true write) so a single employee can
  // be marked paid from here without waiting for a full monthly release.
  const handleProcessOne = async (employeeId: string) => {
    if (processingId) return;
    const record = payroll.find(r => r.employeeId === employeeId);
    if (!record) return;
    setProcessingId(employeeId);
    try {
      const emp = employees.find(e => e.id === employeeId);
      if (record.incrementAmount > 0 && emp) {
        await applyIncrementServer(emp, emp.baseSalary, record.incrementAmount);
      }
      if (record.reservedThisMonth > 0 && emp) {
        await updateProfileAdmin(employeeId, { reservedSalaryBalance: (emp.reservedSalaryBalance || 0) + record.reservedThisMonth });
      }
      await upsertPayrollRecordAdmin({ ...record, processed: true });
      await refetchProfiles();
      await refetchPayroll();
    } finally {
      setProcessingId(null);
    }
  };

  // Net payable and bonuses must stay split by currency — USA (USD) and
  // Pakistan (PKR) amounts are never combined into a single figure.
  //
  // IMPORTANT: these page-level headline totals are computed as a single
  // flat pass over `payroll`, filtered by region only — NOT by summing the
  // per-department `summaries` above. `Profile.teams` is a string array, so
  // an employee can belong to 0, 2, or more teams; summing across
  // department buckets silently dropped anyone on 0 teams and double (or
  // triple-)counted anyone on 2+ teams, which is exactly why this page's
  // "Total Net Outflow" used to disagree with HR's payroll page and with
  // Admin's own dashboard overview card (both of which already did a flat,
  // one-employee-once pass). The per-department `summaries` breakdown below
  // is still team-grouped on purpose — that's a legitimate "cost by
  // department" view — it's only the grand total that must not be derived
  // from it.
  //
  // Formula also matches hr/payroll/page.tsx and admin/page.tsx exactly
  // (baseSalary + bonus - deductions, no incrementAmount) so this figure
  // and the dashboard overview figure agree — increments only affect
  // baseSalary once actually applied via "Release Monthly Funds" above.
  const grandNetUSD = payroll
    .filter(p => p.region === 'USA')
    .reduce((acc, p) => acc + (p.baseSalary + p.bonus - p.deductions), 0);
  const grandNetPKR = payroll
    .filter(p => p.region !== 'USA')
    .reduce((acc, p) => acc + (p.baseSalary + p.bonus - p.deductions), 0);
  const grandBonusesUSD = payroll
    .filter(p => p.region === 'USA')
    .reduce((acc, p) => acc + p.bonus, 0);
  const grandBonusesPKR = payroll
    .filter(p => p.region !== 'USA')
    .reduce((acc, p) => acc + p.bonus, 0);

  return (
    <div className="space-y-6 px-4 py-4 md:px-0 md:py-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-slate-900">Payroll &amp; Financials Overview</h1>
          <p className="text-xs md:text-sm text-slate-500">High-level cost tracking, departmental breakdowns, and global payout releasing.</p>
        </div>
        {!isReleased ? (
          <button
            onClick={handleReleaseMonthlyFunds}
            disabled={isReleasing || payroll.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2.5 md:py-2 rounded-lg font-semibold transition-colors shadow-sm active:scale-97 duration-200 flex items-center gap-1.5 text-sm min-h-[44px] md:min-h-0 self-start md:self-auto"
          >
            <CheckCircle2 className="h-4 w-4" />
            {isReleasing ? 'Releasing…' : 'Release Monthly Funds'}
          </button>
        ) : (
          <Badge variant="success" className="text-sm px-4 py-2 rounded-lg flex items-center gap-1.5 self-start md:self-auto">
            <CheckCircle2 className="h-4 w-4" />
            Monthly Funds Released
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
        <Card>
          <CardContent className="pt-5 md:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm font-semibold text-slate-500">Total Net Outflow</p>
                <p className="text-xl md:text-2xl font-bold text-slate-900 mt-2">{formatMoney(grandNetUSD, 'USA')}</p>
                <p className="text-xs md:text-sm font-semibold text-slate-500 mt-1">{formatMoney(grandNetPKR, 'Pakistan')}</p>
              </div>
              <div className="h-11 w-11 md:h-12 md:w-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <DollarSign className="h-5 w-5 md:h-6 md:w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 md:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm font-semibold text-slate-500">Accumulated Bonuses</p>
                <p className="text-xl md:text-2xl font-bold text-slate-900 mt-2">{formatMoney(grandBonusesUSD, 'USA')}</p>
                <p className="text-xs md:text-sm font-semibold text-slate-500 mt-1">{formatMoney(grandBonusesPKR, 'Pakistan')}</p>
              </div>
              <div className="h-11 w-11 md:h-12 md:w-12 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
                <TrendingUp className="h-5 w-5 md:h-6 md:w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 md:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm font-semibold text-slate-500">Payroll Status</p>
                <div className="mt-3">
                  {isReleased ? (
                    <Badge variant="success">Completed</Badge>
                  ) : (
                    <Badge variant="warning">Awaiting Approval</Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-base md:text-xl font-bold text-slate-900 mt-6 md:mt-8 mb-3 md:mb-4">Employee Payroll</h2>
      <Card className="overflow-hidden p-0 border border-slate-200">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="text-xs font-bold text-slate-500 bg-slate-50 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Employee</th>
                <th className="px-6 py-4 text-right">Net Payable</th>
                <th className="px-6 py-4 text-right">Reserved Salary</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {pageItems.map(p => {
                const netPayable = p.baseSalary + p.bonus - p.deductions + p.incrementAmount;
                const empProfile = employees.find(e => e.id === p.employeeId);
                const reservedBalance = (empProfile?.reservedSalaryBalance || 0) + (empProfile?.manualReservedAmount || 0);
                return (
                  <tr key={p.employeeId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{p.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{p.role}</div>
                      {/* Informational only — see PayrollRecord.pendingArrears's
                          comment. Never folded into this row's own Net
                          Payable; just flags an old unpaid month HR/Admin
                          still needs to process. */}
                      {p.pendingArrears > 0 && (
                        <div className="text-[9px] text-amber-600 font-bold uppercase mt-1">
                          {formatMoney(p.pendingArrears, p.region)} arrears owed (prior month unpaid)
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-900">{formatMoney(netPayable, p.region)}</td>
                    <td className="px-6 py-4 text-right">
                      {reservedBalance > 0 ? (
                        <div>
                          <span className="text-indigo-700 font-bold">{formatMoney(reservedBalance, p.region)}</span>
                          <div className="text-[9px] text-indigo-500 font-bold uppercase">Held, not lost</div>
                        </div>
                      ) : (
                        <span className="text-slate-300 font-medium">—</span>
                      )}
                      {p.reservedThisMonth > 0 && (
                        <div className="text-[9px] text-amber-600 font-bold uppercase mt-0.5">+{formatMoney(p.reservedThisMonth, p.region)} this month</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {p.processed ? <Badge variant="success">Paid</Badge> : <Badge variant="warning">Pending</Badge>}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => { setNetPayableRecord(p); setIsNetPayableOpen(true); }}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded transition-colors transition-transform active:scale-97 inline-flex items-center gap-1.5"
                      >
                        Net Payable
                      </button>
                    </td>
                  </tr>
                );
              })}
              {payroll.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400 font-semibold italic text-xs">No payroll data available.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card stack */}
        <div className="md:hidden space-y-3 p-4">
          {pageItems.map(p => {
            const netPayable = p.baseSalary + p.bonus - p.deductions + p.incrementAmount;
            const empProfileMobile = employees.find(e => e.id === p.employeeId);
            const reservedBalanceMobile = (empProfileMobile?.reservedSalaryBalance || 0) + (empProfileMobile?.manualReservedAmount || 0);
            return (
              <div key={p.employeeId} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.role}</p>
                    {p.pendingArrears > 0 && (
                      <p className="text-[9px] text-amber-600 font-bold uppercase mt-1">
                        {formatMoney(p.pendingArrears, p.region)} arrears owed (prior month unpaid)
                      </p>
                    )}
                  </div>
                  {p.processed ? <Badge variant="success">Paid</Badge> : <Badge variant="warning">Pending</Badge>}
                </div>
                <p className="text-xs font-bold text-slate-800">Net Payable: {formatMoney(netPayable, p.region)}</p>
                {reservedBalanceMobile > 0 && (
                  <p className="text-[10px] font-bold text-indigo-700">
                    Reserved Salary: {formatMoney(reservedBalanceMobile, p.region)} <span className="text-indigo-400 uppercase">(held, not lost)</span>
                  </p>
                )}
                <button
                  onClick={() => { setNetPayableRecord(p); setIsNetPayableOpen(true); }}
                  className="w-full text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-2.5 rounded-lg transition-colors transition-transform active:scale-97 border border-indigo-200 flex items-center justify-center gap-1.5"
                >
                  Net Payable
                </button>
              </div>
            );
          })}
          {payroll.length === 0 && (
            <p className="py-8 text-center text-slate-400 font-semibold italic text-sm">No payroll data available.</p>
          )}
        </div>
      </Card>

      <PaginationControls page={page} setPage={setPage} totalPages={totalPages} totalCount={payroll.length} itemLabel="employees" />

      <h2 className="text-base md:text-xl font-bold text-slate-900 mt-6 md:mt-8 mb-3 md:mb-4">Departmental Breakdowns</h2>
      <Card className="overflow-hidden p-0 border border-slate-200">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="text-xs font-bold text-slate-500 bg-slate-50 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Department</th>
                <th className="px-6 py-4 text-center">Headcount</th>
                <th className="px-6 py-4 text-right">Total Base</th>
                <th className="px-6 py-4 text-right">Increments</th>
                <th className="px-6 py-4 text-right">Total Bonuses</th>
                <th className="px-6 py-4 text-right">Total Deductions</th>
                <th className="px-6 py-4 text-right">Department Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {summaries.map(s => (
                <tr key={s.department} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900">{s.department}</td>
                  <td className="px-6 py-4 text-center font-semibold text-slate-600">{s.headcount}</td>
                  <td className="px-6 py-4 text-right text-slate-900 font-medium">
                    {s.totalBaseUSD > 0 && <div>{formatMoney(s.totalBaseUSD, 'USA')}</div>}
                    {s.totalBasePKR > 0 && <div>{formatMoney(s.totalBasePKR, 'Pakistan')}</div>}
                    {s.totalBaseUSD === 0 && s.totalBasePKR === 0 && '—'}
                  </td>
                  <td className="px-6 py-4 text-right text-emerald-600 font-semibold">
                    {s.totalIncrementsUSD > 0 && <div>+{formatMoney(s.totalIncrementsUSD, 'USA')}</div>}
                    {s.totalIncrementsPKR > 0 && <div>+{formatMoney(s.totalIncrementsPKR, 'Pakistan')}</div>}
                    {s.totalIncrementsUSD === 0 && s.totalIncrementsPKR === 0 && '—'}
                  </td>
                  <td className="px-6 py-4 text-right text-emerald-600 font-semibold">
                    {s.totalBonusesUSD > 0 && <div>+{formatMoney(s.totalBonusesUSD, 'USA')}</div>}
                    {s.totalBonusesPKR > 0 && <div>+{formatMoney(s.totalBonusesPKR, 'Pakistan')}</div>}
                    {s.totalBonusesUSD === 0 && s.totalBonusesPKR === 0 && '—'}
                  </td>
                  <td className="px-6 py-4 text-right text-rose-600 font-semibold">
                    {s.totalDeductionsUSD > 0 && <div>-{formatMoney(s.totalDeductionsUSD, 'USA')}</div>}
                    {s.totalDeductionsPKR > 0 && <div>-{formatMoney(s.totalDeductionsPKR, 'Pakistan')}</div>}
                    {s.totalDeductionsUSD === 0 && s.totalDeductionsPKR === 0 && '—'}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-slate-900">
                    {s.totalNetUSD !== 0 && <div>{formatMoney(s.totalNetUSD, 'USA')}</div>}
                    {s.totalNetPKR !== 0 && <div>{formatMoney(s.totalNetPKR, 'Pakistan')}</div>}
                    {s.totalNetUSD === 0 && s.totalNetPKR === 0 && '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile card stack */}
        <div className="md:hidden space-y-3 p-4">
          {summaries.map(s => {
            return (
              <div key={s.department} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-900">{s.department}</p>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{s.headcount} staff</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Total Base</p>
                    {s.totalBaseUSD > 0 && <p className="text-xs font-bold text-slate-800">{formatMoney(s.totalBaseUSD, 'USA')}</p>}
                    {s.totalBasePKR > 0 && <p className="text-xs font-bold text-slate-800">{formatMoney(s.totalBasePKR, 'Pakistan')}</p>}
                  </div>
                  {(s.totalIncrementsUSD > 0 || s.totalIncrementsPKR > 0) && (
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">Increments</p>
                      {s.totalIncrementsUSD > 0 && <p className="text-xs font-bold text-emerald-600">+{formatMoney(s.totalIncrementsUSD, 'USA')}</p>}
                      {s.totalIncrementsPKR > 0 && <p className="text-xs font-bold text-emerald-600">+{formatMoney(s.totalIncrementsPKR, 'Pakistan')}</p>}
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Bonuses</p>
                    {s.totalBonusesUSD > 0 && <p className="text-xs font-bold text-emerald-600">+{formatMoney(s.totalBonusesUSD, 'USA')}</p>}
                    {s.totalBonusesPKR > 0 && <p className="text-xs font-bold text-emerald-600">+{formatMoney(s.totalBonusesPKR, 'Pakistan')}</p>}
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Deductions</p>
                    {s.totalDeductionsUSD > 0 && <p className="text-xs font-bold text-rose-600">-{formatMoney(s.totalDeductionsUSD, 'USA')}</p>}
                    {s.totalDeductionsPKR > 0 && <p className="text-xs font-bold text-rose-600">-{formatMoney(s.totalDeductionsPKR, 'Pakistan')}</p>}
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Net Payable</p>
                    {s.totalNetUSD !== 0 && <p className="text-xs font-bold text-slate-900">{formatMoney(s.totalNetUSD, 'USA')}</p>}
                    {s.totalNetPKR !== 0 && <p className="text-xs font-bold text-slate-900">{formatMoney(s.totalNetPKR, 'Pakistan')}</p>}
                  </div>
                </div>
              </div>
            );
          })}
          {summaries.length === 0 && (
            <p className="py-8 text-center text-slate-400 font-semibold italic text-sm">No payroll data available.</p>
          )}
        </div>
      </Card>

      <NetPayableModal
        isOpen={isNetPayableOpen}
        onClose={() => setIsNetPayableOpen(false)}
        record={netPayableRecord}
        profile={employees.find(e => e.id === netPayableRecord?.employeeId)}
        onMarkPaid={(employeeId) => handleProcessOne(employeeId)}
        isProcessing={processingId === netPayableRecord?.employeeId}
      />

      <ConfirmDialog
        isOpen={showReleaseConfirm}
        onClose={() => setShowReleaseConfirm(false)}
        onConfirm={confirmReleaseMonthlyFunds}
        title="Release monthly funds?"
        message={`This will mark all ${payroll.filter(p => !p.processed).length} pending payroll record(s) as processed. Continue?`}
        confirmLabel={isReleasing ? 'Releasing…' : 'Release'}
        variant="warning"
        loading={isReleasing}
      />
    </div>
  );
}
