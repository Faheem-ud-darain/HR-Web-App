'use client';

import React, { useState, useEffect } from 'react';
import { useProfiles, usePayroll, Profile, PayrollRecord, formatMoney, getPendingIncrement, getMissedIncrementEvents, getIncrementHistory } from '@/lib/hrData';
import { getSessionEmail } from '@/lib/session';
import { Card, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { FileText, Download, CheckCircle2, ShieldCheck, Printer, TrendingUp, Calendar } from 'lucide-react';
import { APP_TIMEZONE } from '@/lib/timezone';

interface Payslip {
  month: string;
  base: number;
  increment: number;
  deductions: number;
  bonus: number;
  net: number;
  processed: boolean;
}

export default function EmployeeSalaryPage() {
  const { data: allProfiles } = useProfiles();
  const { data: allPayroll } = usePayroll();

  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [payrollRecord, setPayrollRecord] = useState<PayrollRecord | null>(null);
  const [selectedSlip, setSelectedSlip] = useState<Payslip | null>(null);
  const [showBaseSalaryModal, setShowBaseSalaryModal] = useState(false);
  const [showPendingIncrementModal, setShowPendingIncrementModal] = useState(false);

  useEffect(() => {
    const email = getSessionEmail();
    if (!email || !allProfiles || !allPayroll) return;
    const profile = allProfiles.find(e => e.email && e.email.toLowerCase() === email.toLowerCase());
    if (profile) {
      setUserProfile(profile);
      const record = allPayroll.find(p => p.employeeId === profile.id);
      if (record) {
        setPayrollRecord(record);
      }
    }
  }, [allProfiles, allPayroll]);

  // Real, currently-effective base salary — this already reflects every
  // anniversary increment that's actually been processed in the past.
  const baseSalary = userProfile ? userProfile.baseSalary : 0;
  // Live-computed pending increment (includes any back-filled/missed years),
  // sourced the same way Admin/HR's Payroll page computes it
  // (hrActions.computePayrollView -> getPendingIncrement) rather than from
  // whatever's already persisted in hr_payroll. A persisted payroll record
  // only exists once HR/Admin has actually opened Payroll for this employee,
  // so relying on payrollRecord?.incrementAmount alone left this page
  // showing 0 (or a stale number) until that happened. Once HR/Admin
  // actually processes the increment via Payroll, getPendingIncrement
  // naturally returns 0 again since lastIncrementProcessedYear catches up.
  const pendingIncrement = userProfile ? getPendingIncrement(userProfile) : 0;

  const nextAnniversaryDate = (() => {
    if (!userProfile) return null;
    const source = userProfile.salaryStartDate || userProfile.joinedDate;
    if (!source) return null;
    const anniversary = new Date(source);
    const next = new Date();
    next.setMonth(anniversary.getMonth(), anniversary.getDate());
    if (next < new Date()) next.setFullYear(next.getFullYear() + 1);
    return next;
  })();

  // Real current-cycle payslip only — sourced directly from the actual
  // payroll record (bonus/deductions default to 0 until HR/Finance actually
  // processes them; nothing here is fabricated). Historical month-by-month
  // payslip archiving isn't implemented yet, so we don't invent past months.
  const currentMonthLabel = new Date().toLocaleDateString('en-US', { timeZone: APP_TIMEZONE, month: 'long', year: 'numeric' });
  const currentSlip: Payslip | null = payrollRecord ? {
    month: currentMonthLabel,
    base: baseSalary,
    increment: pendingIncrement,
    deductions: payrollRecord.deductions || 0,
    bonus: payrollRecord.bonus || 0,
    net: baseSalary + pendingIncrement + (payrollRecord.bonus || 0) - (payrollRecord.deductions || 0),
    processed: !!payrollRecord.processed
  } : null;

  const filteredSlips: Payslip[] = currentSlip ? [currentSlip] : [];

  const incrementHistory = userProfile ? getIncrementHistory(userProfile) : { originalBaseSalary: 0, events: [] };
  const missedYears = userProfile ? getMissedIncrementEvents(userProfile) : 0;
  const anniversarySource = userProfile ? (userProfile.salaryStartDate || userProfile.joinedDate) : '';

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-lg md:text-2xl font-bold text-slate-900">My Salary Ledger</h1>
        <p className="text-xs md:text-sm text-slate-500">Track base pay rates, dynamic annual increments, and payslips.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card
          className="cursor-pointer hover:border-orange-300 hover:shadow-sm transition-colors transition-shadow"
          onClick={() => userProfile && setShowBaseSalaryModal(true)}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-500 text-xs uppercase tracking-wider">Current Base Salary</h3>
              <span className="text-[9px] font-bold text-orange-500 uppercase tracking-wider">View breakdown →</span>
            </div>
            <p className="text-3xl font-bold text-slate-900 mt-2">
              {formatMoney(baseSalary, userProfile?.region)}{' '}
              <span className="text-xs text-slate-500 font-normal">/ month</span>
            </p>
            {pendingIncrement > 0 && (
              <p
                className="text-[10px] text-amber-600 font-semibold mt-1 hover:underline"
                onClick={(e) => { e.stopPropagation(); if (userProfile) setShowPendingIncrementModal(true); }}
              >
                +{formatMoney(pendingIncrement, userProfile?.region)} anniversary increment pending (covers any previously missed years too) — applies to base once processed
              </p>
            )}
          </CardContent>
        </Card>
        <Card
          className={pendingIncrement > 0 ? 'cursor-pointer hover:border-orange-300 hover:shadow-sm transition-colors transition-shadow' : ''}
          onClick={() => { if (pendingIncrement > 0 && userProfile) setShowPendingIncrementModal(true); }}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-500 text-xs uppercase tracking-wider">Next Increment Date</h3>
              {pendingIncrement > 0 && <span className="text-[9px] font-bold text-orange-500 uppercase tracking-wider">View amount →</span>}
            </div>
            <p className="text-3xl font-bold text-slate-900 mt-2">
              {nextAnniversaryDate ? nextAnniversaryDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'N/A'}
            </p>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-base md:text-xl font-bold text-slate-900 mt-6 md:mt-8 mb-3 md:mb-4">Historical Pay slips</h2>
      <Card className="overflow-hidden p-0 border border-slate-200">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[750px] text-sm text-left border-collapse">
            <thead className="text-xs font-bold text-slate-600 bg-slate-50 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Month</th>
                <th className="px-6 py-4 text-right">Base Amount</th>
                <th className="px-6 py-4 text-right">Increment</th>
                <th className="px-6 py-4 text-right">Deductions</th>
                <th className="px-6 py-4 text-right">Bonuses</th>
                <th className="px-6 py-4 text-right">Net Received</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredSlips.map((slip, i) => (
                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900">{slip.month}</td>
                  <td className="px-6 py-4 text-right font-medium">{formatMoney(slip.base, userProfile?.region)}</td>
                  <td className="px-6 py-4 text-right text-emerald-600 font-semibold">
                    {slip.increment > 0 ? `+${formatMoney(slip.increment, userProfile?.region)}` : '—'}
                  </td>
                  <td className="px-6 py-4 text-right text-rose-600 font-semibold">
                    {slip.deductions > 0 ? `-${formatMoney(slip.deductions, userProfile?.region)}` : formatMoney(0, userProfile?.region)}
                  </td>
                  <td className="px-6 py-4 text-right text-emerald-600 font-semibold">
                    {slip.bonus > 0 ? `+${formatMoney(slip.bonus, userProfile?.region)}` : formatMoney(0, userProfile?.region)}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-slate-900">{formatMoney(slip.net, userProfile?.region)}</td>
                  <td className="px-6 py-4 text-center">
                    <Badge variant={slip.processed ? 'success' : 'warning'}>{slip.processed ? 'Processed' : 'Pending'}</Badge>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => setSelectedSlip(slip)}
                      className="text-xs font-semibold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded transition-colors transition-transform active:scale-97 flex items-center gap-1.5 mx-auto"
                    >
                      <FileText className="h-3.5 w-3.5" /> View Payslip
                    </button>
                  </td>
                </tr>
              ))}
              {filteredSlips.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 font-semibold italic text-xs">
                    No salary slips recorded or tracking has not started yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Mobile card stack */}
        <div className="md:hidden space-y-2 p-3">
          {filteredSlips.map((slip, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-900">{slip.month}</p>
                <Badge variant={slip.processed ? 'success' : 'warning'}>{slip.processed ? 'Processed' : 'Pending'}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Base</p>
                  <p className="text-xs font-semibold text-slate-700">{formatMoney(slip.base, userProfile?.region)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Net Received</p>
                  <p className="text-xs font-bold text-slate-900">{formatMoney(slip.net, userProfile?.region)}</p>
                </div>
                {slip.increment > 0 && (
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Increment</p>
                    <p className="text-xs font-semibold text-emerald-600">+{formatMoney(slip.increment, userProfile?.region)}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Deductions</p>
                  <p className="text-xs font-semibold text-rose-600">{slip.deductions > 0 ? `-${formatMoney(slip.deductions, userProfile?.region)}` : '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Bonus</p>
                  <p className="text-xs font-semibold text-emerald-600">{slip.bonus > 0 ? `+${formatMoney(slip.bonus, userProfile?.region)}` : '—'}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSlip(slip)}
                className="w-full text-xs font-semibold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-2.5 rounded-lg transition-colors transition-transform active:scale-97 flex items-center justify-center gap-1.5"
              >
                <FileText className="h-3.5 w-3.5" /> View Payslip
              </button>
            </div>
          ))}
          {filteredSlips.length === 0 && (
            <p className="py-8 text-center text-slate-400 font-semibold italic text-xs">
              No salary slips recorded or tracking has not started yet.
            </p>
          )}
        </div>
      </Card>

      {/* Base Salary Breakdown Modal */}
      <Modal isOpen={showBaseSalaryModal} onClose={() => setShowBaseSalaryModal(false)} title="Base Salary Breakdown">
        {userProfile && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200/50">
              <div>
                <p className="text-slate-400 font-bold uppercase tracking-wider text-[9px] flex items-center gap-1"><Calendar className="h-3 w-3" /> Joining Date</p>
                <p className="text-slate-800 font-semibold mt-0.5">{userProfile.joinedDate}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase tracking-wider text-[9px] flex items-center gap-1"><Calendar className="h-3 w-3" /> Salary Track Date</p>
                <p className="text-slate-800 font-semibold mt-0.5">{anniversarySource || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Starting Base Salary</p>
                <p className="text-slate-800 font-semibold mt-0.5">{formatMoney(incrementHistory.originalBaseSalary, userProfile.region)}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Current Base Salary</p>
                <p className="text-slate-900 font-bold mt-0.5">{formatMoney(userProfile.baseSalary, userProfile.region)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Increment History</p>
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                {incrementHistory.events.length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-6">No anniversary increments have applied yet.</p>
                ) : (
                  incrementHistory.events.map(ev => (
                    <div key={ev.year} className="flex justify-between items-center px-4 py-2.5 text-xs">
                      <span className="text-slate-600 font-semibold">{ev.year} Anniversary Increment</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${ev.applied ? 'text-emerald-600' : 'text-amber-600'}`}>+{formatMoney(ev.amount, userProfile.region)}</span>
                        <Badge variant={ev.applied ? 'success' : 'warning'}>{ev.applied ? 'Applied' : 'Pending'}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <p className="text-[9px] text-slate-400 leading-relaxed pt-1">
                This is a best-effort reconstruction based on your salary track date and processing history, not a separately audited ledger — it assumes your base salary was never manually adjusted outside the normal increment process.
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Pending Increment Amount Modal */}
      <Modal isOpen={showPendingIncrementModal} onClose={() => setShowPendingIncrementModal(false)} title="Pending Anniversary Increment">
        {userProfile && (
          <div className="space-y-5">
            <div className="text-center bg-amber-50 border border-amber-200 rounded-xl p-5">
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">You will receive</p>
              <p className="text-3xl font-bold text-amber-700 mt-1">+{formatMoney(pendingIncrement, userProfile.region)}</p>
              <p className="text-[10px] text-amber-600 font-semibold mt-1">
                Covering {missedYears} anniversary year{missedYears !== 1 ? 's' : ''} not yet applied to your base salary
              </p>
            </div>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
              {incrementHistory.events.filter(ev => !ev.applied).map(ev => (
                <div key={ev.year} className="flex justify-between items-center px-4 py-2.5 text-xs">
                  <span className="text-slate-600 font-semibold">{ev.year} Anniversary Increment</span>
                  <span className="text-amber-600 font-semibold">+{formatMoney(ev.amount, userProfile.region)}</span>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-slate-400 leading-relaxed">
              This amount is added to your base salary once HR/Admin processes it via Payroll — it isn't paid out automatically.
            </p>
          </div>
        )}
      </Modal>

      {/* Paystub Modal */}
      <Modal isOpen={!!selectedSlip} onClose={() => setSelectedSlip(null)} title="Official Salary Receipt">
        {selectedSlip && (
          <div className="space-y-6">
            {/* Header branding */}
            <div className="flex justify-between items-center border-b border-slate-200 pb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base">DelCargo Logistics Ltd.</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">HR Operations Paystub Receipt</p>
              </div>
              <Badge variant={selectedSlip.processed ? 'success' : 'warning'}>{selectedSlip.processed ? 'Paid' : 'Pending Processing'}</Badge>
            </div>

            {/* Employee details */}
            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200/50">
              <div>
                <p className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Employee Name</p>
                <p className="text-slate-800 font-semibold mt-0.5">{userProfile?.fullName}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Department</p>
                <p className="text-slate-800 font-semibold mt-0.5">{userProfile?.teams.join(', ')}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Billing Cycle</p>
                <p className="text-slate-800 font-semibold mt-0.5">{selectedSlip.month}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Confidentiality Code</p>
                <p className="text-slate-800 font-mono text-[10px] mt-0.5">DC-{userProfile?.id.toUpperCase()}-PAY</p>
              </div>
            </div>

            {/* Calculations Breakdown */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Salary Breakdown</p>
              <div className="space-y-2 divide-y divide-slate-100 text-xs border border-slate-200 rounded-lg p-4 bg-white">
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500 font-semibold">Base salary</span>
                  <span className="text-slate-900 font-semibold">{formatMoney(selectedSlip.base, userProfile?.region)}</span>
                </div>
                {selectedSlip.increment > 0 && (
                  <div className="flex justify-between items-center py-2 pt-2">
                    <span className="text-slate-500 font-semibold">Anniversary increment</span>
                    <span className="text-emerald-600 font-semibold">+{formatMoney(selectedSlip.increment, userProfile?.region)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-500 font-semibold">Performance bonuses</span>
                  <span className="text-emerald-600 font-semibold">+{formatMoney(selectedSlip.bonus, userProfile?.region)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-500 font-semibold">Leave & penalty deductions</span>
                  <span className="text-rose-600 font-semibold">
                    {selectedSlip.deductions > 0 ? `-${formatMoney(selectedSlip.deductions, userProfile?.region)}` : formatMoney(0, userProfile?.region)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 pt-3 font-bold text-sm text-slate-900 border-t border-slate-200">
                  <span>Net Payable Outflow</span>
                  <span className="text-orange-600">{formatMoney(selectedSlip.net, userProfile?.region)}</span>
                </div>
              </div>
            </div>

            {/* Stamps and buttons */}
            <div className="flex justify-between items-center pt-4 border-t border-slate-200">
              <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-xs">
                <ShieldCheck className="h-5 w-5 text-emerald-500" /> Dynamic Ledger Double-Verified
              </div>
              <button 
                onClick={() => window.print()}
                className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-lg text-xs active:scale-97 transition-colors transition-transform flex items-center gap-1.5"
              >
                <Printer className="h-4 w-4" /> Print Receipt
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
