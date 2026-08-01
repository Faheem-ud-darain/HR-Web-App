'use client';

import React, { useState, useEffect } from 'react';
import { useProfiles, useLeaves, hrActions, calculatePTOAccrued, calculateTenure, getPTOAccrualDate, getRemainingPTO, LeaveApplication, Profile, formatMoney, buildNotificationLink } from '@/lib/hrData';
import { getSessionEmail } from '@/lib/session';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Clock, PlusCircle, CheckCircle2, AlertCircle, HelpCircle, BadgeCheck, Loader2 } from 'lucide-react';

export default function EmployeeLeavesPage() {
  const { data: allProfiles } = useProfiles();
  const { data: allLeaves, refetch: refetchLeaves } = useLeaves();

  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [userProfile, setUserProfile] = useState<Profile | null>(null);

  // Modal state
  const [isLeaveOpen, setIsLeaveOpen] = useState(false);
  const [leaveType, setLeaveType] = useState('pto');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);

  // Cashout simulator state
  const [cashoutDays, setCashoutDays] = useState(0);
  const [simRollover, setSimRollover] = useState(0);

  useEffect(() => {
    const email = getSessionEmail();
    if (!email || !allProfiles || !allLeaves) return;
    const profile = allProfiles.find(e => e.email && e.email.toLowerCase() === email.toLowerCase());
    if (profile) {
      setUserProfile(profile);
      setLeaves(allLeaves.filter(l => l.employeeName === profile.fullName) as any);
    }

    const handleSearch = (e: Event) => {
      setSearchQuery((e as CustomEvent).detail || '');
    };
    window.addEventListener('globalSearch', handleSearch);
    return () => window.removeEventListener('globalSearch', handleSearch);
  }, [allProfiles, allLeaves]);

  // Sync cashout days input limit with remaining PTO balance. Uses the
  // shared getRemainingPTO helper (hrData.ts) instead of an inline
  // recomputation — this card is labeled "Remaining Bank (PTO + Sick)", so
  // the subtraction needs to include Sick Leave days taken too, count
  // actual approved days (not a raw count of leave records — a single
  // multi-day Sick Leave request is more than 1 day), and round/floor the
  // result. The previous inline version did none of this, which is why it
  // could render floating-point noise like "-0.17000000000000004 Days".
  const remainingPTO = userProfile && userProfile.joinedDate
    ? getRemainingPTO(allLeaves || [], userProfile.fullName, getPTOAccrualDate(userProfile))
    : 0;
  useEffect(() => {
    if (remainingPTO > 0) {
      setCashoutDays(Math.floor(remainingPTO));
      setSimRollover(Math.max(0, Math.min(5, Math.floor(remainingPTO - Math.floor(remainingPTO)))));
    }
  }, [remainingPTO]);

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (isSubmittingLeave) return;
    if (!startDate || !endDate || !reason) {
      setError('Please fill in all required fields.');
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) {
      setError('End date cannot be before start date.');
      return;
    }

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24)) + 1;

    // 1. Parental Leave Validations
    if (leaveType === 'parental_leave') {
      if (!userProfile) return;
      if (userProfile.gender !== 'female') {
        setError('Parental leave is only available to female employees.');
        return;
      }
      const tenure = calculateTenure(userProfile.joinedDate);
      if (tenure.totalMonths < 12) {
        setError('Parental leave requires at least 1 year (12 months) of continuous service at DelCargo.');
        return;
      }
      if (diffDays !== 30) {
        setError('Parental leave requests must be submitted for exactly 30 days.');
        return;
      }
    }

    // 2. PTO Validations
    if (leaveType === 'pto') {
      // Must be exactly 1 day
      if (diffDays !== 1) {
        setError('PTO requests can only be taken for exactly 1 day.');
        return;
      }

      // Must be submitted at least 14 days (2 weeks) in advance
      const today = new Date();
      today.setHours(0,0,0,0);
      start.setHours(0,0,0,0);
      const differenceInTime = start.getTime() - today.getTime();
      const differenceInDays = differenceInTime / (1000 * 3600 * 24);
      if (differenceInDays < 14) {
        setError('PTO requests must be submitted at least 14 days (2 weeks) in advance.');
        return;
      }

      // Check remaining balance (shared PTO + Sick Leave bank)
      if (remainingPTO < 1) {
        setError('Insufficient leave balance remaining in your combined PTO/Sick bank.');
        return;
      }

      // Only 1 PTO request per calendar month
      const startMonth = start.getMonth();
      const startYear = start.getFullYear();
      const hasExistingPTO = leaves.some(l => {
        if (l.type !== 'PTO') return false;
        const existingStartStr = l.duration.split(' - ')[0];
        const existingStart = new Date(existingStartStr);
        return existingStart.getMonth() === startMonth && existingStart.getFullYear() === startYear;
      });
      if (hasExistingPTO) {
        setError('You can only apply for 1 PTO request per calendar month.');
        return;
      }
    }

    // 3. Sick Leave Validations — drawn from the same combined bank as PTO,
    // but no advance-notice requirement (sick days are, by nature, unplanned)
    // and multi-day requests are allowed.
    if (leaveType === 'sick') {
      if (remainingPTO < diffDays) {
        setError(`Insufficient leave balance remaining. You have ${remainingPTO} day(s) left in your combined PTO/Sick bank.`);
        return;
      }
    }

    const formatDate = (date: Date) =>
      date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    const durationStr = `${formatDate(start)} - ${formatDate(end)}`;

    const newLeaveType: LeaveApplication['type'] = leaveType === 'pto' ? 'PTO' : leaveType === 'parental_leave' ? 'Parental Leave' : 'Urgent';
    const newLeave: Omit<LeaveApplication, 'id'> = {
      employeeName: userProfile?.fullName || 'Employee',
      type: newLeaveType,
      duration: durationStr,
      reason,
      status: 'pending',
    };

    setIsSubmittingLeave(true);
    try {
      const createdLeave = await hrActions.addLeave(newLeave);
      // Both HR and Admin manage leave approvals (see admin/leaves + hr/leaves
      // pages) — this previously only notified 'hr', so Admin never found
      // out a request existed until they happened to open the Leaves page.
      await hrActions.addNotification('all', 'hr', `New ${newLeave.type} leave request from ${userProfile?.fullName || 'an employee'}.`, 'leave_task', `${newLeave.type} Leave Request`, userProfile?.email, buildNotificationLink('hr', 'leave', createdLeave.id));
      await hrActions.addNotification('all', 'admin', `New ${newLeave.type} leave request from ${userProfile?.fullName || 'an employee'}.`, 'leave_task', `${newLeave.type} Leave Request`, userProfile?.email, buildNotificationLink('admin', 'leave', createdLeave.id));
      await refetchLeaves();

      setSuccess('Leave request submitted!');
      setTimeout(() => {
        setIsLeaveOpen(false);
        setSuccess('');
        setStartDate('');
        setEndDate('');
        setReason('');
      }, 1000);
    } catch (err) {
      console.error('[Leaves] Submit error:', err);
      setError('Failed to submit leave. Please try again.');
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge variant="success">Approved</Badge>;
      case 'pending':
        return <Badge variant="warning">Pending</Badge>;
      case 'hr_approved':
        return <Badge variant="default">HR Approved (Pending CEO)</Badge>;
      case 'rejected':
        return <Badge variant="danger">Rejected</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  const filteredLeaves = leaves.filter(l =>
    l.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.duration.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Accurate combined PTO + Sick Leave bank stats
  const accruedPTO = userProfile ? calculatePTOAccrued(getPTOAccrualDate(userProfile)) : 0;
  const takenPTO = userProfile ? ((allLeaves || []).filter(l => l.employeeName === userProfile.fullName && l.status === 'approved' && ['PTO', 'Sick Leave'].includes(l.type)).length) : 0;

  // Settlement computations. Profile.baseSalary already reflects every
  // anniversary increment that has actually been processed, so it IS the
  // current effective salary (mirrors old db.calculateCurrentSalary()).
  const currentBaseSalary = userProfile ? userProfile.baseSalary : 0;
  const ptoDailyRate = Math.round(currentBaseSalary / 22);
  const potentialCashoutVal = Math.max(0, cashoutDays * ptoDailyRate);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-slate-900">My Leave Requests</h1>
          <p className="text-xs md:text-sm text-slate-500">View accrued time-off metrics and submit applications.</p>
        </div>
        <button
          onClick={() => setIsLeaveOpen(true)}
          className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-4 py-2.5 md:py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform flex items-center gap-1.5 shadow-sm"
        >
          <PlusCircle className="h-4.5 w-4.5" /> Apply for Leave
        </button>
      </div>

      {/* Dynamic PTO balances */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-slate-200">
          <CardContent className="pt-5">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Remaining Bank (PTO + Sick)</p>
            <p className="text-3xl font-bold text-orange-600 mt-1">{remainingPTO} Days</p>
            <p className="text-[10px] text-slate-400 mt-1">Capped at 30 days maximum ceiling</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200">
          <CardContent className="pt-5">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Accrued</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">{accruedPTO} Days</p>
            <p className="text-[10px] text-slate-400 mt-1">Accumulated at individual anniversary date</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200">
          <CardContent className="pt-5">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Approved Days Taken</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">{takenPTO} Days</p>
            <p className="text-[10px] text-slate-400 mt-1">PTO + Sick Leave, upon official CEO validation</p>
          </CardContent>
        </Card>
      </div>

      {/* Jan 31 Settlement Simulator */}
      <Card className="border border-slate-200 bg-slate-50/50">
        <div className="px-5 pt-4 pb-1 border-b border-slate-200 bg-white">
          <h3 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
            <BadgeCheck className="h-4 w-4 text-orange-600" />
            January 31st Settlement & Cash Out Simulator
          </h3>
        </div>
        <CardContent className="p-5 space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            Simulate your end-of-cycle options. You can roll over up to <strong>5 unused PTO days</strong> to the next year and cash out the rest.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-semibold">
            <div className="space-y-1">
              <label className="text-slate-500 uppercase tracking-wider text-[10px]">Cash Out Days</label>
              <input
                type="number"
                min={0}
                max={Math.floor(remainingPTO)}
                value={cashoutDays}
                onChange={e => {
                  const val = Math.max(0, Math.min(Math.floor(remainingPTO), Number(e.target.value)));
                  setCashoutDays(val);
                  setSimRollover(Math.max(0, Math.min(5, Math.floor(remainingPTO - val))));
                }}
                className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-slate-800"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-500 uppercase tracking-wider text-[10px]">Rolled Over Days</label>
              <p className="bg-white border border-slate-200 rounded-lg py-2 px-3 text-slate-800 font-mono">
                {simRollover} Days (Max 5)
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-slate-500 uppercase tracking-wider text-[10px]">Calculated Payout</label>
              <p className="bg-white border border-slate-200 rounded-lg py-2 px-3 text-emerald-800 font-mono font-bold">
                {formatMoney(potentialCashoutVal, userProfile?.region)}
              </p>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 font-semibold">
            Based on: Daily rate ({formatMoney(ptoDailyRate, userProfile?.region)}) = Monthly Salary ({formatMoney(currentBaseSalary, userProfile?.region)}) ÷ 22 days.
          </p>
        </CardContent>
      </Card>

      {/* History log */}
      <Card className="overflow-hidden p-0 border border-slate-200">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm text-left border-collapse">
            <thead className="text-xs font-bold text-slate-600 bg-slate-50 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Dates</th>
                <th className="px-6 py-4">Reason</th>
                <th className="px-6 py-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredLeaves.map(leave => (
                <tr key={leave.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900">{leave.type}</td>
                  <td className="px-6 py-4 text-slate-600 font-medium">{leave.duration}</td>
                  <td className="px-6 py-4 text-slate-500">{leave.reason}</td>
                  <td className="px-6 py-4 text-center">{getStatusBadge(leave.status)}</td>
                </tr>
              ))}
              {filteredLeaves.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-12 text-slate-400 font-semibold italic text-xs">
                    No leave requests found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Mobile card stack */}
        <div className="md:hidden space-y-2 p-3">
          {filteredLeaves.map(leave => (
            <div key={leave.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-900">{leave.type}</p>
                {getStatusBadge(leave.status)}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Dates</p>
                  <p className="text-xs font-semibold text-slate-700">{leave.duration}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Reason</p>
                  <p className="text-xs font-semibold text-slate-700">{leave.reason}</p>
                </div>
              </div>
            </div>
          ))}
          {filteredLeaves.length === 0 && (
            <p className="text-center py-12 text-slate-400 font-semibold italic text-xs">No leave requests found</p>
          )}
        </div>
      </Card>

      {/* Apply modal */}
      <Modal isOpen={isLeaveOpen} onClose={() => setIsLeaveOpen(false)} title="Apply for Leave">
        <form onSubmit={handleLeaveSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-50 text-rose-600 border border-rose-100 rounded-lg font-semibold flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 text-xs bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              {success}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Leave Type</label>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900"
            >
              <option value="pto">Paid Time Off (PTO)</option>
              <option value="urgent">Urgent Unpaid Leave</option>
              {userProfile?.gender === 'female' && (
                <option value="parental_leave">Parental Leave (30 Days)</option>
              )}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Start Date *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">End Date *</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Reason *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900 resize-none"
              placeholder="Provide explanation..."
            />
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" disabled={isSubmittingLeave} onClick={() => setIsLeaveOpen(false)} className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-4 py-2.5 md:py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
            <button type="submit" disabled={isSubmittingLeave} className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-4 py-2.5 md:py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
              {isSubmittingLeave && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmittingLeave ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
