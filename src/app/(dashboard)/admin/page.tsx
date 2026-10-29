'use client';

import { LeaveTypeBadge } from '@/components/ui/StatusBadges';
import { useState, useEffect } from 'react';
import { StatCard } from '@/components/ui/StatCard';
import { Card } from '@/components/ui/Card';
import { SectionCard } from '@/components/ui/SectionCard';
import { StaffDashboardHeader } from '@/components/dashboard/StaffDashboardHeader';
import { OrgCalendar, TaskModal, MaintenanceNoticeManager, ScheduleMeetModal } from '@/components/ui/lazy';
import { CurrencyDollarIcon as DollarSign, UsersIcon as Users, ClockIcon as Clock } from '@/components/ui/icons';
import { useRouter } from 'next/navigation';
import { useProfiles, useLeaves, useTasks, usePayroll, useTimesheets, hrActions, formatMoney, Profile, displayName, buildNotificationLink } from '@/lib/hrData';
import { AvgHoursWorkedCard } from '@/components/ui/AvgHoursWorkedCard';
import { Button } from '@/components/ui/Button';
import { netPay } from '@/lib/core/payrollView';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, TableScroll, THead, TBody, Tr, Th, Td } from '@/components/ui/Table';
import { StatCardSkeletonGrid, TableSkeletonRows } from '@/components/ui/Skeleton';
import { AnnouncementsSection } from '@/components/ui/AnnouncementsSection';
import { useAttendanceSweep } from '@/hooks/useAttendanceSweep';

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

  // The no-call-no-show / inactivity absence sweep (closes stuck shifts, then records new absences, which feed payroll deductions).
  useAttendanceSweep({ employees, timesheets, leaves, loading: isEmployeesLoading || isTimesheetsLoading || isLeavesLoading });


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
    .reduce((acc, emp) => acc + netPay(emp), 0);
  const totalPayrollPKR = compiledPayroll
    .filter(emp => emp.region !== 'USA')
    .reduce((acc, emp) => acc + netPay(emp), 0);
  const hrApprovedLeaves = leaves.filter(l => l.status === 'hr_approved');

  return (
    <div className="space-y-6 px-4 py-4 md:px-0 md:py-0 md:space-y-8">
      <StaffDashboardHeader
        title="Admin Overview" subtitle="High-level metrics, leave approvals, and organisation calendar."
        extra={<Button variant="outline" onClick={() => router.push('/admin/tasks')}>View All Tasks</Button>}
        onMeet={() => setIsScheduleMeetOpen(true)} onAnnounce={() => setIsAnnounceOpen(true)} onTask={() => setIsTaskOpen(true)}
      />

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
                        <Button variant="success" size="sm" onClick={() => handleCEOAction(l.id, 'approve')} disabled={processingLeaveId !== null} loading={processingLeaveId === l.id}>
                          CEO Approve
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => handleCEOAction(l.id, 'reject')} disabled={processingLeaveId !== null} loading={processingLeaveId === l.id}>
                          Reject
                        </Button>
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
                      <Button variant="success" size="sm" onClick={() => handleCEOAction(l.id, 'approve')} disabled={processingLeaveId !== null} loading={processingLeaveId === l.id} className="flex-1">
                        CEO Approve
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleCEOAction(l.id, 'reject')} disabled={processingLeaveId !== null} loading={processingLeaveId === l.id} className="flex-1">
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Org Calendar */}
      <SectionCard title="Organisation Calendar" subtitle="Leave schedules, task deadlines, and conflict indicators across all departments.">
        <div className="p-4 md:p-6"><OrgCalendar leaves={leaves} tasks={tasks} employees={employees} /></div>
      </SectionCard>

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
