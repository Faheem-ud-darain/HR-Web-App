'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CheckCircle2, AlertCircle, Download, RefreshCw, Loader2 } from 'lucide-react';
import { formatMoney, hrActions, useLeaves, useProfiles, usePayroll, useTimesheets, AbsenceRecord } from '@/lib/hrData';

export default function HRPayrollPage() {
  const { data: leavesList = [] } = useLeaves();
  const { data: employees = [], isLoading: profilesLoading, refetch: refetchProfiles } = useProfiles();
  const { data: payrollRecords = [], isLoading: payrollLoading, refetch: refetchPayroll } = usePayroll();
  const { data: timesheets = [] } = useTimesheets();
  // No dedicated React Query hook — absence records live in the generic KV
  // store, not their own PocketBase collection (see AbsenceRecord's comment
  // in hrData.ts). Plain one-time fetch is fine for this page.
  const [absenceRecords, setAbsenceRecords] = useState<AbsenceRecord[]>([]);
  useEffect(() => { hrActions.getAbsenceRecords().then(setAbsenceRecords); }, []);

  // Optimistic local overrides while a bonus/deductions edit is in flight,
  // keyed by employeeId — merged over the server-computed view below.
  const [localEdits, setLocalEdits] = useState<Record<string, { bonus?: number; deductions?: number }>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'processed'>('all');
  const [isSyncing, setIsSyncing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchAllData = async () => {
    await Promise.all([refetchProfiles(), refetchPayroll()]);
  };

  useEffect(() => {
    const handleSearch = (e: Event) => {
      setSearchQuery((e as CustomEvent).detail || '');
    };
    window.addEventListener('globalSearch', handleSearch);
    return () => window.removeEventListener('globalSearch', handleSearch);
  }, []);

  const handleProcess = async (employeeId: string) => {
    if (processingId) return; // a payout is already in flight — never let a double-click fire this twice
    const record = compiledPayrollData.find(r => r.employeeId === employeeId);
    if (!record) return;
    setProcessingId(employeeId);
    try {
      // Fold any pending anniversary increment into the employee's real base
      // salary BEFORE marking the record processed — this mirrors Admin's
      // "Release Monthly Funds" flow. Without this, HR's "Complete Payout"
      // only marked the payslip as paid; hr_profiles.base_salary and
      // lastIncrementProcessedYear never actually updated, so the employee's
      // dashboard kept showing the old base salary and the exact same
      // "pending increment" forever, even though their receipt said it was
      // already paid.
      if (record.incrementAmount > 0) {
        const emp = employees.find(e => e.id === employeeId);
        if (emp) await hrActions.applyAnniversaryIncrement(emp, emp.baseSalary, record.incrementAmount);
      }
      await hrActions.upsertPayrollRecord({ ...record, processed: true });
      setLocalEdits(prev => { const next = { ...prev }; delete next[employeeId]; return next; });
      await refetchProfiles();
      refetchPayroll();
    } finally {
      setProcessingId(null);
    }
  };

  const handleUpdateAmount = async (employeeId: string, field: 'bonus' | 'deductions', value: string) => {
    const numericValue = Number(value.replace(/[^0-9.-]/g, '')) || 0;
    setLocalEdits(prev => ({ ...prev, [employeeId]: { ...prev[employeeId], [field]: numericValue } }));
    const record = compiledPayrollData.find(r => r.employeeId === employeeId);
    if (!record) return;
    await hrActions.upsertPayrollRecord({ ...record, [field]: numericValue });
    refetchPayroll();
  };

  // Server-computed payroll view (base salary, increments, onboarding
  // penalties, urgent-leave deductions) with any in-flight local edits
  // for bonus/deductions layered on top.
  const compiledPayrollData = hrActions.computePayrollView(employees, payrollRecords, leavesList, timesheets, absenceRecords).map(r => ({
    ...r,
    bonus: localEdits[r.employeeId]?.bonus ?? r.bonus,
    deductions: localEdits[r.employeeId]?.deductions ?? r.deductions,
  }));

  const filteredData = compiledPayrollData.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          emp.role.toLowerCase().includes(searchQuery.toLowerCase());
                          
    if (!matchesSearch) return false;

    if (activeTab === 'pending') return !emp.processed;
    if (activeTab === 'processed') return emp.processed;
    return true;
  });

  const totalPayrollUSD = compiledPayrollData
    .filter(emp => emp.region === 'USA')
    .reduce((acc, emp) => acc + (emp.baseSalary + emp.bonus - emp.deductions), 0);

  const totalPayrollPKR = compiledPayrollData
    .filter(emp => emp.region !== 'USA')
    .reduce((acc, emp) => acc + (emp.baseSalary + emp.bonus - emp.deductions), 0);

  const totalPending = compiledPayrollData.filter(e => !e.processed).length;

  const exportPayrollCSV = () => {
    const headers = ['Employee', 'Role', 'Region', 'Base Salary', 'Bonus', 'Deductions', 'Net Payable', 'Status'];
    const rows = filteredData.map(emp => {
      const net = emp.baseSalary + emp.bonus - emp.deductions;
      return [
        emp.name,
        emp.role,
        emp.region,
        formatMoney(emp.baseSalary, emp.region),
        formatMoney(emp.bonus, emp.region),
        formatMoney(emp.deductions, emp.region),
        formatMoney(net, emp.region),
        emp.processed ? 'Processed' : 'Pending'
      ];
    });
    const csvContent = 'data:text/csv;charset=utf-8,'
      + [headers.join(','), ...rows.map(r => r.map(val => `"${val}"`).join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `DelCargo_Payroll_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-slate-900">Monthly Payroll Ledger</h1>
          <p className="text-xs md:text-sm text-slate-500">Manage base salaries, bonuses, and calculate monthly net payouts.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <button
            onClick={async () => {
              setIsSyncing(true);
              await fetchAllData();
              setIsSyncing(false);
            }}
            disabled={isSyncing}
            className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold px-3 py-2.5 md:py-1.5 rounded-lg text-xs flex items-center gap-1.5 active:scale-97 transition-colors transition-transform shadow-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} /> 
            Refresh Ledger
          </button>
          
          <button
            onClick={exportPayrollCSV}
            disabled={filteredData.length === 0}
            className="bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-200 text-slate-700 font-semibold px-3 py-2.5 md:py-1.5 rounded-lg text-xs flex items-center gap-1.5 active:scale-97 transition-colors transition-transform"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
          
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab('all')}
              className={`px-3 py-2 md:py-1.5 rounded-md text-xs font-semibold tracking-wide transition-colors transition-shadow ${
                activeTab === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              All
            </button>
            <button 
              onClick={() => setActiveTab('pending')}
              className={`px-3 py-2 md:py-1.5 rounded-md text-xs font-semibold tracking-wide transition-colors transition-shadow ${
                activeTab === 'pending' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Pending ({totalPending})
            </button>
            <button 
              onClick={() => setActiveTab('processed')}
              className={`px-3 py-2 md:py-1.5 rounded-md text-xs font-semibold tracking-wide transition-colors transition-shadow ${
                activeTab === 'processed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Processed
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardContent className="pt-5 md:pt-6">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Projected Payout</p>
            <p className="text-xl md:text-2xl font-bold text-slate-900 mt-2">{formatMoney(totalPayrollUSD, 'USA')}</p>
            <p className="text-xs md:text-sm font-semibold text-slate-500 mt-1">{formatMoney(totalPayrollPKR, 'Pakistan')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 md:pt-6">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Remaining Checklist</p>
            <div className="flex items-center gap-2 mt-2">
              {totalPending > 0 ? (
                <>
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <p className="text-xs md:text-sm font-semibold text-slate-800">{totalPending} employees pending processing</p>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <p className="text-xs md:text-sm font-semibold text-slate-800">All payroll records completed for this month</p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block">
        <Card className="overflow-hidden p-0 border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-sm text-left border-collapse">
              <thead className="text-xs font-bold text-slate-500 bg-slate-50 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Employee Details</th>
                  <th className="px-6 py-4 text-right">Base Salary</th>
                  <th className="px-6 py-4 text-right">Increment</th>
                  <th className="px-6 py-4 text-center">Onboarding Penalty</th>
                  <th className="px-6 py-4 text-right">Bonus ($)</th>
                  <th className="px-6 py-4 text-right">Deductions ($)</th>
                  <th className="px-6 py-4 text-right">Net Payable</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredData.map(emp => {
                  const netPayable = emp.baseSalary + emp.incrementAmount + (Number(emp.bonus) || 0) - (Number(emp.deductions) || 0);
                  return (
                    <tr key={emp.employeeId} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{emp.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{emp.role}</div>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-slate-900">
                        {formatMoney(emp.baseSalary, emp.region)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {emp.incrementAmount > 0 ? (
                          <div>
                            <span className="text-emerald-600 font-bold">+{formatMoney(emp.incrementAmount, emp.region)}</span>
                            <div className="text-[9px] text-emerald-500 font-bold uppercase">Anniversary</div>
                          </div>
                        ) : (
                          <span className="text-slate-300 font-medium">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          emp.unpaidLeaves > 0 ? 'bg-amber-50 text-amber-800 border border-amber-200/60' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {emp.unpaidLeaves > 0 ? `${emp.unpaidLeaves} day(s)` : 'None'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {emp.processed ? (
                          <span className="text-slate-900 font-medium">{formatMoney(emp.bonus || 0, emp.region)}</span>
                        ) : (
                          <input 
                            type="text" 
                            value={emp.bonus || ''} 
                            onChange={(e) => handleUpdateAmount(emp.employeeId, 'bonus', e.target.value)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded-md py-1 px-2 text-right text-xs focus:border-orange-500 outline-none"
                            placeholder="0"
                          />
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {emp.processed ? (
                          <span className="text-slate-900 font-medium">{formatMoney(emp.deductions || 0, emp.region)}</span>
                        ) : (
                          <input
                            type="text"
                            value={emp.deductions || ''}
                            onChange={(e) => handleUpdateAmount(emp.employeeId, 'deductions', e.target.value)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded-md py-1 px-2 text-right text-xs focus:border-orange-500 outline-none"
                            placeholder="0"
                          />
                        )}
                        {(() => {
                          const count = leavesList.filter(l => l.employeeName === emp.name && l.type === 'Urgent' && l.status === 'approved').length;
                          if (count > 0 && count <= 3) {
                            return <div className="text-[10px] text-emerald-600 font-bold mt-1">Rebate Eligible ({count} UL)</div>;
                          } else if (count > 3) {
                            return <div className="text-[10px] text-rose-600 font-bold mt-1">No Rebate ({count} UL)</div>;
                          }
                          return null;
                        })()}
                        {(() => {
                          const monthKey = new Date().toISOString().slice(0, 7);
                          const empProfile = employees.find(e => e.id === emp.employeeId);
                          const records = empProfile ? absenceRecords.filter(a => a.date.slice(0, 7) === monthKey && a.employeeEmail.toLowerCase() === empProfile.email.toLowerCase()) : [];
                          if (records.length === 0) return null;
                          const total = records.reduce((acc, a) => acc + a.deductionAmount, 0);
                          return <div className="text-[10px] text-rose-600 font-bold mt-1">Absent ({records.length}d, {formatMoney(total, emp.region)})</div>;
                        })()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="font-semibold text-slate-900">{formatMoney(netPayable, emp.region)}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {emp.processed ? <Badge variant="success">Completed</Badge> : <Badge variant="warning">Pending</Badge>}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {emp.processed ? (
                          <span className="text-xs text-slate-400 font-semibold">Processed</span>
                        ) : (
                          <button
                            onClick={() => handleProcess(emp.employeeId)}
                            disabled={processingId !== null}
                            className="text-xs font-semibold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded transition-colors transition-transform active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                          >
                            {processingId === emp.employeeId && <Loader2 className="h-3 w-3 animate-spin" />}
                            {processingId === emp.employeeId ? 'Processing…' : 'Complete Payout'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Mobile Card Stack */}
      <div className="md:hidden space-y-3">
        {filteredData.map(emp => {
          const netPayable = emp.baseSalary + emp.incrementAmount + (Number(emp.bonus) || 0) - (Number(emp.deductions) || 0);
          const urgentCount = leavesList.filter(l => l.employeeName === emp.name && l.type === 'Urgent' && l.status === 'approved').length;
          const empProfileMobile = employees.find(e => e.id === emp.employeeId);
          const monthKeyMobile = new Date().toISOString().slice(0, 7);
          const absenceRecordsMobile = empProfileMobile ? absenceRecords.filter(a => a.date.slice(0, 7) === monthKeyMobile && a.employeeEmail.toLowerCase() === empProfileMobile.email.toLowerCase()) : [];
          const absentCountMobile = absenceRecordsMobile.length;
          const absentTotalMobile = absenceRecordsMobile.reduce((acc, a) => acc + a.deductionAmount, 0);
          return (
            <div key={emp.employeeId} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">{emp.name}</p>
                  <p className="text-xs text-slate-500">{emp.role}</p>
                </div>
                {emp.processed ? <Badge variant="success">Completed</Badge> : <Badge variant="warning">Pending</Badge>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Base Salary</p>
                  <p className="text-xs font-bold text-slate-800">{formatMoney(emp.baseSalary, emp.region)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Net Payable</p>
                  <p className="text-xs font-bold text-slate-800">{formatMoney(netPayable, emp.region)}</p>
                </div>
                {emp.incrementAmount > 0 && (
                  <div className="col-span-2">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Anniversary Increment</p>
                    <p className="text-xs font-bold text-emerald-600">+{formatMoney(emp.incrementAmount, emp.region)}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Onboarding Penalty</p>
                  <p className="text-xs font-bold text-slate-800">{emp.unpaidLeaves > 0 ? `${emp.unpaidLeaves} day(s)` : 'None'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Bonus / Deductions</p>
                  <p className="text-xs font-bold text-slate-800">{formatMoney(emp.bonus || 0, emp.region)} / {formatMoney(emp.deductions || 0, emp.region)}</p>
                </div>
              </div>
              {urgentCount > 0 && (
                <p className={`text-[10px] font-bold ${urgentCount <= 3 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {urgentCount <= 3 ? `Rebate Eligible (${urgentCount} UL)` : `No Rebate (${urgentCount} UL)`}
                </p>
              )}
              {absentCountMobile > 0 && (
                <p className="text-[10px] font-bold text-rose-600">
                  Absent ({absentCountMobile}d, {formatMoney(absentTotalMobile, emp.region)})
                </p>
              )}
              {!emp.processed && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase mb-1">Bonus ($)</p>
                    <input 
                      type="text" 
                      value={emp.bonus || ''} 
                      onChange={(e) => handleUpdateAmount(emp.employeeId, 'bonus', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-md py-1.5 px-2 text-xs focus:border-orange-500 outline-none"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase mb-1">Deductions ($)</p>
                    <input
                      type="text"
                      value={emp.deductions || ''}
                      onChange={(e) => handleUpdateAmount(emp.employeeId, 'deductions', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-md py-1.5 px-2 text-xs focus:border-orange-500 outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>
              )}
              {!emp.processed && (
                <button
                  onClick={() => handleProcess(emp.employeeId)}
                  disabled={processingId !== null}
                  className="w-full text-xs font-semibold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-2.5 rounded-lg transition-colors transition-transform active:scale-97 border border-orange-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {processingId === emp.employeeId && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {processingId === emp.employeeId ? 'Processing…' : 'Complete Payout'}
                </button>
              )}
            </div>
          );
        })}
        {filteredData.length === 0 && (
          <p className="text-xs text-slate-400 font-semibold italic text-center py-8">No records found.</p>
        )}
      </div>
    </div>
  );
}