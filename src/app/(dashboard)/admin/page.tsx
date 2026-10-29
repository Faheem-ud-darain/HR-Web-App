'use client';

import { LeaveTypeBadge } from '@/components/ui/StatusBadges';
import { useState, useEffect } from 'react';
import { StatCard } from '@/components/ui/StatCard';
import { Card } from '@/components/ui/Card';
import { OrgCalendar, TaskModal, MaintenanceNoticeManager, ScheduleMeetModal } from '@/components/ui/lazy';
import { CurrencyDollarIcon as DollarSign, UsersIcon as Users, ClockIcon as Clock, ClipboardTextIcon as ClipboardList, PlusCircleIcon as PlusCircle, CircleNotchIcon as Loader2, VideoCameraIcon as Video } from '@/components/ui/icons';
import { useRouter } from 'next/navigation';
import { useProfiles, useLeaves, useTasks, usePayroll, useTimesheets, hrActions, formatMoney, Profile, displayName, buildNotificationLink } from '@/lib/hrData';
import { AvgHoursWorkedCard } from '@/components/ui/AvgHoursWorkedCard';
import { Button } from '@/components/ui/Button';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, TableScroll, THead, TBody, Tr, Th, Td } from '@/components/ui/Table';
import { StatCardSkeletonGrid, TableSkeletonRows } from '@/components/ui/Skeleton';
import { AnnouncementsSection } from '@/components/ui/AnnouncementsSection';
import { INACTIVITY_THRESHOLD_SECONDS } from '@/lib/core/absences';

export default function AdminDashboard() {
  const router = useRouter();
  const { data: employees = [], isLoading: isEmployeesLoading } = useProfiles();
  const { data: leaves = [], isLoading: isLeavesLoading, refetch: refetchLeaves } = useLeaves();
  const { data: payrollRecords = [] } = usePayroll();
  const { data: tasks = [], refetch: refetchTasks } = useTasks();
  const { data: timesheets = [], isLoading: isTimesheetsLoading } = useTimesheets({ days: 10 });

  // LeaveApplication only snapshots a fullName, not a live Profile reference.
  const nameFor = (employeeName: string): string => {
    const emp = employees.find((e: Profile) => e.fullName === employeeName);
    return emp ? displayName(emp, 'admin') : employeeName;
  };
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [isScheduleMeetOpen, setIsScheduleMeetOpen] = useState(false);
  const [isAnnounceOpen, setIsAnnounceOpen] = useState(false);

  const [processingLeaveId, setProcessingLeaveId] = useState<string | null>(null);

  useEffect(() => {
  }, []);

  // Same no-call-no-show / inactivity auto-absence check as hr/page.tsx —
  // safe to run from both HR's and Admin's dashboards (whichever loads with
  // real data first "wins"; runAbsenceCheck only ever creates NEW records
  // for employee+date combinations not already decided, so calling it from
  // both pages is a no-op the second time).
  useEffect(() => {
    if (isEmployeesLoading || isTimesheetsLoading || isLeavesLoading || employees.length === 0) return;
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    // Orphan-shift cleanup runs first — see the matching comment in
    // hr/page.tsx and autoCloseOrphanTrackedShifts in hrData.ts.
    // autoCloseStaleOpenShifts is the catch-all hard cap that runs right
    // after (see its comment in hrData.ts) — fixes the 3000+ minute shifts.
    hrActions.autoCloseOrphanTrackedShifts(timesheets)
      .catch(() => { /* best-effort */ })
      .then(() => hrActions.autoCloseStaleOpenShifts(timesheets, employees))
      .catch(() => { /* best-effort */ })
      .then(() => hrActions.getInactivityLogs({ sinceISO: fiveDaysAgo.toISOString(), minDurationSeconds: INACTIVITY_THRESHOLD_SECONDS }))
      .then(inactivityLogs => hrActions.runAbsenceCheck(employees, timesheets, leaves, inactivityLogs))
      .catch(() => { /* best-effort */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sweep runs when the data finishes loading or its size changes, not on every refetch of identical rows
  }, [employees.length, timesheets.length, leaves.length, isEmployeesLoading, isTimesheetsLoading, isLeavesLoading]);


  const handleCEOAction = async (id: string, action: 'approve' | 'reject') => {
    if (processingLeaveId) return;
    setProcessingLeaveId(id);
    try {
      const nextStatus = action === 'approve' ? 'approved' : 'rejected';

      await hrActions.updateLeaveStatus(id, nextStatus);

      const l = leaves.find(lv => lv.id === id);
      if (l) {
        const emp = employees.find(e => e.fullName === l.employeeName);
        if (emp) {
          await hrActions.addNotification(emp.email, 'employee', `Your leave (${l.duration.split(' - ')[0]}) was ${action === 'approve' ? 'approved' : 'rejected'} by CEO.`, 'leave_task', action === 'approve' ? 'Leave Approved' : 'Leave Rejected', undefined, buildNotificationLink('employee', 'leave', l.id));
        }
        await hrActions.addNotification('all', 'hr', `CEO ${action === 'approve' ? 'approved' : 'rejected'} leave for ${l.employeeName}.`, 'leave_task', `${l.employeeName}'s Leave`, undefined, buildNotificationLink('hr', 'leave', l.id));
      }

      refetchLeaves();
    } finally {
      setProcessingLeaveId(null);
    }
  };

  // Derived stats — USA (USD) and Pakistan (PKR) salaries must never be
  // summed into a single number, so this stays split by currency.
  // Uses the exact same computation as the Payroll & Salary page (base
  // salary + bonus - deductions, employee/team_lead roles only) so the two
  // pages never disagree — previously this summed raw baseSalary across
  // every profile (including HR/Admin) with no bonus/deduction adjustment,
  // which didn't match the real payroll totals.
  const compiledPayroll = hrActions.computePayrollView(employees, payrollRecords, leaves);
  const totalPayrollUSD = compiledPayroll
    .filter(emp => emp.region === 'USA')
    .reduce((acc, emp) => acc + (emp.baseSalary + emp.bonus - emp.deductions), 0);
  const totalPayrollPKR = compiledPayroll
    .filter(emp => emp.region !== 'USA')
    .reduce((acc, emp) => acc + (emp.baseSalary + emp.bonus - emp.deductions), 0);
  const hrApprovedLeaves = leaves.filter(l => l.status === 'hr_approved');

  return (
    <div className="space-y-6 px-4 py-4 md:px-0 md:py-0 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-slate-900">Admin Overview</h1>
          <p className="text-xs md:text-sm text-slate-500">High-level metrics, leave approvals, and organisation calendar.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="md"
            onClick={() => router.push('/admin/tasks')}
            className="min-h-[44px] md:min-h-0"
          >
            View All Tasks
          </Button>
          <button
            onClick={() => setIsScheduleMeetOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 md:py-2 rounded-lg text-xs md:text-sm active:scale-97 transition-colors transition-transform transition-shadow flex items-center gap-1.5 shadow-sm min-h-[44px] md:min-h-0"
          >
            <Video className="h-4 w-4" /> Schedule Google Meet
          </button>
          <Button
            variant="outline"
            size="md"
            onClick={() => setIsAnnounceOpen(true)}
            className="min-h-[44px] md:min-h-0"
          >
            <PlusCircle className="h-4 w-4" /> Post Announcement
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => setIsTaskOpen(true)}
            className="min-h-[44px] md:min-h-0"
          >
            <ClipboardList className="h-4 w-4" /> Assign Task
          </Button>
        </div>
      </div>

      {/* Stats — icon colors now semantically consistent: emerald=money,
          indigo=people, amber=time-sensitive, rose=risk. The "Total
          Employees" tile used to be an arbitrary Tailwind blue that matched
          nothing else in the system; indigo is DESIGN.md's actual
          documented secondary accent. */}
      {(isEmployeesLoading || isLeavesLoading) ? (
        <StatCardSkeletonGrid count={4} className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4" />
      ) : (
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="Monthly Payroll" value={formatMoney(totalPayrollUSD, 'USA')} size="md" sub={formatMoney(totalPayrollPKR, 'Pakistan')} chip={{ icon: DollarSign, tone: 'emerald' }} />
        <StatCard label="Total Employees" value={employees.length} size="xl" chip={{ icon: Users, tone: 'indigo' }} onClick={() => router.push('/hr/teams')} />
        <StatCard label="Awaiting CEO Approval" value={hrApprovedLeaves.length} size="xl" chip={{ icon: Clock, tone: 'amber' }} onClick={() => router.push('/admin/leaves')} />
        <AvgHoursWorkedCard employees={employees} timesheets={timesheets} viewerRole="admin" />
      </div>
      )}

      {/* CEO Leave Approval Queue — moved up to directly follow the stats.
          This is the one thing on this page that actually requires the
          CEO/Admin to DO something; it used to be the last section on the
          page, below two purely informational widgets (calendar,
          announcements), which buries the actionable item under passive
          content — the same "primary action demoted below status noise"
          problem fixed on the Employee dashboard. */}
      <div className="space-y-3">
        <h2 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
          Pending CEO Approval
          {hrApprovedLeaves.length > 0 && (
            <span className="bg-amber-100 text-amber-800 font-bold text-caption px-2 py-0.5 rounded-full">{hrApprovedLeaves.length} pending</span>
          )}
        </h2>

        <Card className="overflow-hidden p-0 border border-slate-200">
          {/* Desktop table */}
          <TableScroll hideOnMobile>
            <Table>
              <THead>
                <tr>
                  <Th>Employee</Th>
                  <Th>Type</Th>
                  <Th>Dates</Th>
                  <Th>Reason</Th>
                  <Th align="center">Actions</Th>
                </tr>
              </THead>
              <TBody>
{isLeavesLoading ? (
  <TableSkeletonRows rows={4} cols={5} />
) : (
<>
                {hrApprovedLeaves.map(l => (
                  <Tr key={l.id}>
                    <Td className="font-semibold text-slate-900">{nameFor(l.employeeName)}</Td>
                    <Td>{l.type}</Td>
                    <Td className="text-slate-600 font-medium">{l.duration}</Td>
                    <Td className="text-slate-500 max-w-xs truncate">{l.reason}</Td>
                    <Td align="center">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => handleCEOAction(l.id, 'approve')} disabled={processingLeaveId !== null} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded transition-colors transition-transform transition-shadow active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1">
                          {processingLeaveId === l.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />} CEO Approve
                        </button>
                        <button onClick={() => handleCEOAction(l.id, 'reject')} disabled={processingLeaveId !== null} className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded transition-colors transition-transform transition-shadow active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1">
                          {processingLeaveId === l.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Reject
                        </button>
                      </div>
                    </Td>
                  </Tr>
                ))}
                {hrApprovedLeaves.length === 0 && (
                  <Tr>
                    <EmptyState as="td" colSpan={5} py={12} size="sm">
                      No pending approvals — all leaves are processed.
                    </EmptyState>
                  </Tr>
                )}
              </>
)}
</TBody>
            </Table>
          </TableScroll>

          {/* Mobile card stack */}
          <div className="md:hidden">
            {isLeavesLoading ? (
              <div className="p-4"><ListSkeleton rows={3} /></div>
            ) : hrApprovedLeaves.length === 0 ? (
              <EmptyState py={10} size="sm">No pending approvals — all leaves are processed.</EmptyState>
            ) : (
              <div className="space-y-3 p-4">
                {hrApprovedLeaves.map(l => (
                  <div key={l.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-900">{nameFor(l.employeeName)}</p>
                      <LeaveTypeBadge type={l.type} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-caption text-slate-400 font-semibold uppercase">Dates</p>
                        <p className="text-xs font-bold text-slate-800">{l.duration}</p>
                      </div>
                      <div>
                        <p className="text-caption text-slate-400 font-semibold uppercase">Reason</p>
                        <p className="text-xs font-bold text-slate-800 truncate">{l.reason}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => handleCEOAction(l.id, 'approve')} disabled={processingLeaveId !== null} className="flex-1 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 py-2.5 rounded-lg transition-colors transition-transform transition-shadow active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1">
                        {processingLeaveId === l.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />} CEO Approve
                      </button>
                      <button onClick={() => handleCEOAction(l.id, 'reject')} disabled={processingLeaveId !== null} className="flex-1 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 py-2.5 rounded-lg transition-colors transition-transform transition-shadow active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1">
                        {processingLeaveId === l.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Org Calendar */}
      <Card className="p-0">
        <div className="px-4 md:px-6 pt-5 pb-2 border-b border-slate-100">
          <h2 className="text-sm md:text-base font-bold text-slate-900">Organisation Calendar</h2>
          <p className="text-xs text-slate-500 mt-0.5">Leave schedules, task deadlines, and conflict indicators across all departments.</p>
        </div>
        <div className="p-4 md:p-6">
          <OrgCalendar leaves={leaves} tasks={tasks} employees={employees} />
        </div>
      </Card>

      <AnnouncementsSection role="admin" isCreateOpen={isAnnounceOpen} onCreateClose={() => setIsAnnounceOpen(false)} />

      <MaintenanceNoticeManager createdBy="CEO Admin" />


      {/* Task Modal */}
      <TaskModal
        isOpen={isTaskOpen}
        onClose={() => setIsTaskOpen(false)}
        employees={employees.filter(e => e.role === 'employee' || e.isTeamLead)}
        createdBy="admin"
        onTaskAdded={() => refetchTasks()}
      />

      {/* Schedule Google Meet Modal */}
      <ScheduleMeetModal
        isOpen={isScheduleMeetOpen}
        onClose={() => setIsScheduleMeetOpen(false)}
      />

    </div>
  );
}
