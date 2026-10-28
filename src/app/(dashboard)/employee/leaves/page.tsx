'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useProfiles, useLeaves, hrActions, getAccruedPTOForDisplay, getPTOAccrualDate, getRemainingPTO, LeaveApplication, formatMoney, buildNotificationLink } from '@/lib/hrData';
import { useActionToast } from '@/components/ui/ActionToastHost';
import { getSessionEmail } from '@/lib/session';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { PlusCircleIcon as PlusCircle, WarningCircleIcon as AlertCircle, SealCheckIcon as BadgeCheck, CircleNotchIcon as Loader2, TrashIcon as Trash2 } from '@phosphor-icons/react/dist/ssr';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, TableScroll, THead, TBody, Tr, Th, Td } from '@/components/ui/Table';
import { StatCard } from '@/components/ui/StatCard';
import { TableSkeletonRows } from '@/components/ui/Skeleton';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { useSessionEmail } from '@/lib/useSession';

export default function EmployeeLeavesPage() {
  const { data: allProfiles } = useProfiles();
  const myLeaveName = allProfiles?.find(p => p.email && p.email.toLowerCase() === (getSessionEmail() || '').toLowerCase())?.fullName;
  const { data: allLeaves, isLoading: leavesLoading, refetch: refetchLeaves } = useLeaves({ employeeName: myLeaveName ?? null });

  const [searchQuery, setSearchQuery] = useState('');
  const sessionEmail = useSessionEmail();
  const userProfile = useMemo(
    () => allProfiles?.find(e => e.email && sessionEmail && e.email.toLowerCase() === sessionEmail.toLowerCase()) || null,
    [allProfiles, sessionEmail],
  );
  const leaves: LeaveApplication[] = useMemo(
    () => (userProfile && allLeaves ? allLeaves.filter(l => l.employeeName === userProfile.fullName) : []),
    [allLeaves, userProfile],
  );

  // Modal state
  const [isLeaveOpen, setIsLeaveOpen] = useState(false);
  const [leaveType, setLeaveType] = useState('urgent');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const { showToast } = useActionToast();
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);

  // Withdraw-request state — employees can only delete their own leave
  // requests while they're still 'pending' (see hrActions.deleteLeave in
  // hrData.ts for the actual guard; this modal is just the confirm UI).
  const [deletingLeaveId, setDeletingLeaveId] = useState<string | null>(null);
  const [isDeletingLeave, setIsDeletingLeave] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Cashout simulator state
  const [cashoutDays, setCashoutDays] = useState(0);
  const [simRollover, setSimRollover] = useState(0);

  // The header search box (TopNav) broadcasts what's typed as a window event.
  useEffect(() => {
    const handleSearch = (e: Event) => {
      setSearchQuery((e as CustomEvent).detail || '');
    };
    window.addEventListener('globalSearch', handleSearch);
    return () => window.removeEventListener('globalSearch', handleSearch);
  }, []);

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
  // Start the simulator at the full remaining balance, and again whenever that
  // balance changes (adjusting state while rendering = React's way of resetting
  // state from a changed value).
  const [simulatedFor, setSimulatedFor] = useState(0);
  if (remainingPTO !== simulatedFor) {
    setSimulatedFor(remainingPTO);
    if (remainingPTO > 0) {
      setCashoutDays(Math.floor(remainingPTO));
      setSimRollover(Math.max(0, Math.min(5, Math.floor(remainingPTO - Math.floor(remainingPTO)))));
    }
  }

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isSubmittingLeave) return;
    if (!startDate || !endDate || !reason) {
      setError('Please fill in all required fields.');
      return;
    }

    // startDate/endDate come from <input type="date"> as bare "YYYY-MM-DD"
    // strings. `new Date("2026-08-14")` parses that as 2026-08-14T00:00:00Z
    // (UTC midnight) per spec — NOT local midnight. Anyone in a timezone
    // behind UTC (any US timezone, including this app's own display
    // timezone, America/New_York) then sees it roll back to Aug 13 the
    // moment it's formatted with toLocaleDateString below, since that UTC
    // instant falls on the previous calendar day locally. This is the exact
    // off-by-one-day bug src/lib/timezone.ts's header comment warns about.
    // Fix: build the Date from the y/m/d components directly so it lands on
    // local midnight of the calendar day the employee actually picked,
    // regardless of device/server timezone.
    const parseDateOnly = (dateStr: string) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d);
    };
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);

    if (end < start) {
      setError('End date cannot be before start date.');
      return;
    }

    // 1. PTO / Sick Leave / Parental Leave are all disabled for new requests
    // (Parental Leave joined PTO/Sick as of this policy update — only
    // Urgent and Normal leave remain selectable for now) — history stays
    // visible (existing PTO/Sick/Parental Leave records are never deleted
    // or hidden), but none of the three is offered in the dropdown below,
    // and all three are blocked here too as a hard backstop in case a
    // stale client ever posts one of those values directly.
    if (leaveType === 'pto' || leaveType === 'sick' || leaveType === 'parental_leave') {
      setError('Only Urgent and Normal leave are available for new requests right now.');
      return;
    }

    // 2. Normal Leave Validations — the PTO/Sick-Leave replacement: must be
    // submitted at least 14 days in advance, no other restriction on
    // duration or how many can be taken. Deducts 1 day's pay per day taken
    // (see hrData.ts computePayrollView's Normal-leave deduction comment).
    if (leaveType === 'normal') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      start.setHours(0, 0, 0, 0);
      const differenceInDays = (start.getTime() - today.getTime()) / (1000 * 3600 * 24);
      if (differenceInDays < 14) {
        setError('Normal leave requests must be submitted at least 14 days in advance.');
        return;
      }
    }

    // 3. Urgent Leave — no advance-notice requirement (can be submitted any
    // time), deducts 2 days' pay per day taken. No extra validation needed
    // beyond the shared start/end date checks above.

    const formatDate = (date: Date) =>
      date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    const durationStr = `${formatDate(start)} - ${formatDate(end)}`;

    const newLeaveType: LeaveApplication['type'] = leaveType === 'normal' ? 'Normal' : 'Urgent';
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

      setIsLeaveOpen(false);
      setStartDate('');
      setEndDate('');
      setReason('');
      showToast({ type: 'success', message: 'Leave request submitted!' });
    } catch (err) {
      console.error('[Leaves] Submit error:', err);
      setError('Failed to submit leave. Please try again.');
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  const handleDeleteLeave = async (id: string) => {
    setIsDeletingLeave(true);
    setDeleteError('');
    try {
      const result = await hrActions.deleteLeave(id);
      if (!result.success) {
        // Most likely cause: HR/Admin acted on it in the gap between this
        // list loading and the employee clicking Delete. Refresh so the
        // now-stale row (still showing "Pending" locally) shows its real
        // status instead of leaving the employee confused about why the
        // delete failed.
        setDeleteError(result.reason || 'Could not delete this leave request. Please try again.');
        await refetchLeaves();
        return;
      }
      setDeletingLeaveId(null);
      await refetchLeaves();
    } catch (err) {
      console.error('[Leaves] Delete error:', err);
      setDeleteError('Something went wrong deleting this request. Please try again.');
    } finally {
      setIsDeletingLeave(false);
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
  const accruedPTO = userProfile ? getAccruedPTOForDisplay(getPTOAccrualDate(userProfile)) : 0;
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
        <Button
          variant="primary"
          size="md"
          onClick={() => setIsLeaveOpen(true)}
        >
          <PlusCircle className="h-5 w-5" /> Apply for Leave
        </Button>
      </div>

      {/* Dynamic PTO balances */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Remaining Bank (PTO + Sick)" value={<>{remainingPTO} Days</>} size="xl" valueTone="accent" sub="Capped at 30 days maximum ceiling" />
        <StatCard label="Total Accrued" value={<>{accruedPTO} Days</>} size="xl" sub="Accumulated at individual anniversary date" />
        <StatCard label="Approved Days Taken" value={<>{takenPTO} Days</>} size="xl" sub="PTO + Sick Leave, upon official CEO validation" />
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
              <FieldLabel size="sm">Cash Out Days</FieldLabel>
              <Input
                type="number"
                min={0}
                max={Math.floor(remainingPTO)}
                value={cashoutDays}
                onChange={e => {
                  const val = Math.max(0, Math.min(Math.floor(remainingPTO), Number(e.target.value)));
                  setCashoutDays(val);
                  setSimRollover(Math.max(0, Math.min(5, Math.floor(remainingPTO - val))));
                }}
                fieldSize="md"
              />
            </div>
            <div className="space-y-1">
              <FieldLabel size="sm">Rolled Over Days</FieldLabel>
              <p className="bg-white border border-slate-200 rounded-lg py-2 px-3 text-slate-800 font-mono">
                {simRollover} Days (Max 5)
              </p>
            </div>
            <div className="space-y-1">
              <FieldLabel size="sm">Calculated Payout</FieldLabel>
              <p className="bg-white border border-slate-200 rounded-lg py-2 px-3 text-emerald-800 font-mono font-bold">
                {formatMoney(potentialCashoutVal, userProfile?.region)}
              </p>
            </div>
          </div>
          <p className="text-caption text-slate-400 font-semibold">
            Based on: Daily rate ({formatMoney(ptoDailyRate, userProfile?.region)}) = Monthly Salary ({formatMoney(currentBaseSalary, userProfile?.region)}) ÷ 22 days.
          </p>
        </CardContent>
      </Card>

      {/* History log */}
      <Card className="overflow-hidden p-0 border border-slate-200">
        {/* Desktop table */}
        <TableScroll hideOnMobile>
          <Table minWidth={700}>
            <THead>
              <tr>
                <Th>Type</Th>
                <Th>Dates</Th>
                <Th>Reason</Th>
                <Th align="center">Status</Th>
                <Th align="center">Actions</Th>
              </tr>
            </THead>
            <TBody>
{leavesLoading ? (
  <TableSkeletonRows rows={5} cols={5} />
) : (
<>
              {filteredLeaves.map(leave => (
                <Tr key={leave.id}>
                  <Td className="font-semibold text-slate-900">{leave.type}</Td>
                  <Td className="text-slate-600 font-medium">{leave.duration}</Td>
                  <Td className="text-slate-500">{leave.reason}</Td>
                  <Td align="center">{getStatusBadge(leave.status)}</Td>
                  <Td align="center">
                    {leave.status === 'pending' ? (
                      <button
                        type="button"
                        onClick={() => { setDeletingLeaveId(leave.id); setDeleteError(''); }}
                        title="Withdraw this leave request"
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1.5 rounded-lg hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </Td>
                </Tr>
              ))}
              {filteredLeaves.length === 0 && (
                <Tr>
                  <EmptyState as="td" colSpan={5} py={12} size="xs">
                    No leave requests found
                  </EmptyState>
                </Tr>
              )}
            </>
)}
</TBody>
          </Table>
        </TableScroll>
        {/* Mobile card stack */}
        <div className="md:hidden space-y-2 p-3">
          {filteredLeaves.map(leave => (
            <div key={leave.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-900">{leave.type}</p>
                <div className="flex items-center gap-2">
                  {getStatusBadge(leave.status)}
                  {leave.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => { setDeletingLeaveId(leave.id); setDeleteError(''); }}
                      title="Withdraw this leave request"
                      className="text-slate-400 hover:text-rose-600 transition-colors p-1 rounded-lg hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-caption text-slate-400 font-semibold uppercase">Dates</p>
                  <p className="text-xs font-semibold text-slate-700">{leave.duration}</p>
                </div>
                <div>
                  <p className="text-caption text-slate-400 font-semibold uppercase">Reason</p>
                  <p className="text-xs font-semibold text-slate-700">{leave.reason}</p>
                </div>
              </div>
            </div>
          ))}
          {leavesLoading && <ListSkeleton rows={3} />}
          {!leavesLoading && filteredLeaves.length === 0 && (
            <EmptyState py={12} size="xs">No leave requests found</EmptyState>
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
          <FormField label="Leave Type" size="md">
            <Select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
              fieldSize="md"
            >
              <option value="urgent">Urgent Leave (any time, deducts 2 days pay/day)</option>
              <option value="normal">Normal Leave (14 days notice, deducts 1 day pay/day)</option>
            </Select>
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Start Date *" size="md">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                fieldSize="md"
              />
            </FormField>
            <FormField label="End Date *" size="md">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                fieldSize="md"
              />
            </FormField>
          </div>

          <FormField label="Reason *" size="md">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              fieldSize="md" className="resize-none"
              placeholder="Provide explanation..."
            />
          </FormField>

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" size="md" disabled={isSubmittingLeave} onClick={() => setIsLeaveOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmittingLeave}  size="lg">
              {isSubmittingLeave && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmittingLeave ? 'Submitting…' : 'Submit Request'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Withdraw-request confirm modal — only ever opened for a leave that
          was 'pending' at the moment the trash icon was clicked; the actual
          guard against deleting an already-processed request lives
          server-side in hrActions.deleteLeave (re-checks fresh status). */}
      <Modal
        isOpen={!!deletingLeaveId}
        onClose={() => { if (!isDeletingLeave) { setDeletingLeaveId(null); setDeleteError(''); } }}
        title="Withdraw Leave Request?"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This will permanently withdraw your leave request. This is only possible while it&apos;s
            still pending — once HR or Admin acts on it, it can no longer be deleted.
          </p>
          {deleteError && (
            <div className="p-3 text-xs bg-rose-50 text-rose-600 border border-rose-100 rounded-lg font-semibold flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              {deleteError}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="md"
              disabled={isDeletingLeave}
              onClick={() => { setDeletingLeaveId(null); setDeleteError(''); }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              disabled={isDeletingLeave}
              onClick={() => deletingLeaveId && handleDeleteLeave(deletingLeaveId)}
            >
              {isDeletingLeave && <Loader2 className="h-4 w-4 animate-spin" />}
              {isDeletingLeave ? 'Withdrawing…' : 'Withdraw Request'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
