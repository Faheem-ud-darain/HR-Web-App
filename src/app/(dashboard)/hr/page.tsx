'use client';

import React, { useState, useEffect } from 'react';
import { StatCard } from '@/components/ui/StatCard';
import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { StaffDashboardHeader } from '@/components/dashboard/StaffDashboardHeader';
import { Badge } from '@/components/ui/Badge';
import { OrgCalendar, TaskModal, MaintenanceNoticeManager, ScheduleMeetModal } from '@/components/ui/lazy';
import { UsersIcon as Users, ClockIcon as Clock } from '@/components/ui/icons';
import { useRouter } from 'next/navigation';
import { hrActions, Profile, useProfiles, useLeaves, useTasks, useTimesheets, displayName } from '@/lib/hrData';
import { ActiveEmployeesCard } from '@/components/ui/ActiveEmployeesCard';
import { AvgHoursWorkedCard } from '@/components/ui/AvgHoursWorkedCard';
import { ButtonLink } from '@/components/ui/Button';
import { ListSkeleton, StatCardSkeletonGrid } from '@/components/ui/Skeleton';
import { AnnouncementsSection } from '@/components/ui/AnnouncementsSection';
import { INACTIVITY_THRESHOLD_SECONDS } from '@/lib/core/absences';

export default function HRDashboard() {
  const router = useRouter();

  // Data
  const { data: employees = [], isLoading: isEmployeesLoading } = useProfiles();
  const { data: leaves = [], isLoading: isLeavesLoading } = useLeaves();
  const { data: tasks = [], refetch: refetchTasks } = useTasks();
  const { data: timesheets = [], isLoading: isTimesheetsLoading } = useTimesheets({ days: 10 });


  // LeaveApplication only snapshots a fullName, not a live Profile reference.
  const nameFor = (employeeName: string): string => {
    const emp = employees.find((e: Profile) => e.fullName === employeeName);
    return emp ? displayName(emp, 'hr') : employeeName;
  };
  const [, setSearchQuery] = useState('');

  // Modals
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [isScheduleMeetOpen, setIsScheduleMeetOpen] = useState(false);
  const [isAnnounceOpen, setIsAnnounceOpen] = useState(false);


  // Team Lead assignment form
  // Onboard form
  useEffect(() => {

    const handleSearch = (e: Event) => setSearchQuery((e as CustomEvent).detail || '');
    window.addEventListener('globalSearch', handleSearch);
    return () => window.removeEventListener('globalSearch', handleSearch);
  }, []);

  // No-call-no-show / inactivity auto-absence check — Pakistan-region
  // employees who haven't started a shift on a weekday (with no approved
  // leave), or who were inactive 35+ minutes during a shift, get marked
  // absent + a 2-days'-pay deduction that automatically shows up in payroll
  // (see AbsenceRecord/runAbsenceCheck/computePayrollView in hrData.ts).
  // This fires new notifications + creates the persisted AbsenceRecord the
  // moment HR's dashboard loads with real data — no-ops on every subsequent
  // load unless a new absence has actually occurred since the last check.
  useEffect(() => {
    if (isEmployeesLoading || isTimesheetsLoading || isLeavesLoading || employees.length === 0) return;
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    // Orphan-shift cleanup runs first — closing any tracked shift whose
    // desktop agent stopped reporting in (PC shutdown, killed process,
    // etc.) before runAbsenceCheck sees it, so a still-open overnight shift
    // never gets misread as either "still worked" or a multi-hour false
    // inactivity absence (see autoCloseOrphanTrackedShifts in hrData.ts).
    // autoCloseStaleOpenShifts runs right after as a catch-all for anything
    // still open past a hard 16h cap regardless of category (GPS, manual,
    // or untracked) — this is what was behind employees showing 3000+
    // minutes of shift time in a day.
    hrActions.autoCloseOrphanTrackedShifts(timesheets)
      .catch(() => { /* best-effort */ })
      .then(() => hrActions.autoCloseStaleOpenShifts(timesheets, employees))
      .catch(() => { /* best-effort */ })
      .then(() => hrActions.getInactivityLogs({ sinceISO: fiveDaysAgo.toISOString(), minDurationSeconds: INACTIVITY_THRESHOLD_SECONDS }))
      .then(inactivityLogs => hrActions.runAbsenceCheck(employees, timesheets, leaves, inactivityLogs))
      .catch(() => { /* best-effort */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sweep runs when the data finishes loading or its size changes, not on every refetch of identical rows
  }, [employees.length, timesheets.length, leaves.length, isEmployeesLoading, isTimesheetsLoading, isLeavesLoading]);
  // Stats
  const pendingLeaves = leaves.filter(l => l.status === 'pending').length;

  return (
    <div className="space-y-6 md:space-y-8">
      <StaffDashboardHeader title="HR Dashboard" subtitle="Overview, scheduling calendar, and team operations." onMeet={() => setIsScheduleMeetOpen(true)} onAnnounce={() => setIsAnnounceOpen(true)} onTask={() => setIsTaskOpen(true)} />

      {/* Stats */}
      {(isEmployeesLoading || isLeavesLoading) ? (
        <StatCardSkeletonGrid count={4} className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4" />
      ) : (
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="Total Employees" value={employees.length} size="xl" chip={{ icon: Users, tone: 'indigo' }} onClick={() => router.push('/hr/teams')} />
        <StatCard label="Pending Leaves" value={pendingLeaves} size="xl" chip={{ icon: Clock, tone: 'amber' }} onClick={() => router.push('/hr/leaves')} />
        <AvgHoursWorkedCard employees={employees} timesheets={timesheets} viewerRole="hr" />
        <ActiveEmployeesCard employees={employees} timesheets={timesheets} viewerRole="hr" />
      </div>
      )}

      {/* Pending Leave Requests — the primary actionable item for HR, surfaced
          immediately after stats rather than buried below passive widgets. */}
      <SectionCard title="Pending Leave Requests" subtitle="Requests awaiting your decision." count={pendingLeaves} action={<ButtonLink href="/hr/leaves" variant="ghost" size="sm">Full Kanban board →</ButtonLink>}>
        <div className="divide-y divide-slate-100">
          {isLeavesLoading && <div className="p-4"><ListSkeleton rows={3} /></div>}
          {!isLeavesLoading && leaves.filter(l => l.status === 'pending').slice(0, 5).map(l => (
            <div key={l.id} className="px-4 md:px-6 py-3.5 flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-slate-900 text-sm">{nameFor(l.employeeName)}</div>
                <div className="text-xs text-slate-500 mt-0.5">{l.type} · {l.duration}</div>
              </div>
              <Badge variant="warning">Pending</Badge>
            </div>
          ))}
          {!isLeavesLoading && pendingLeaves === 0 && <EmptyState py={6} size="xs">No pending leave requests.</EmptyState>}
        </div>
      </SectionCard>

      {/* Dynamic Org Calendar */}
      <SectionCard title="Organisation Calendar" subtitle="Leaves, task deadlines, and schedule conflicts — all teams in one view.">
        <div className="p-3 md:p-6"><OrgCalendar leaves={leaves} tasks={tasks} employees={employees} /></div>
      </SectionCard>

      <AnnouncementsSection role="hr" isCreateOpen={isAnnounceOpen} onCreateClose={() => setIsAnnounceOpen(false)} />

      <MaintenanceNoticeManager createdBy="HR Manager" />

      {/* --- MODALS --- */}


      {/* Task Assignment Modal */}
      <TaskModal
        isOpen={isTaskOpen}
        onClose={() => setIsTaskOpen(false)}
        employees={employees.filter((e: Profile) => e.role === 'employee' || e.isTeamLead)}
        createdBy="hr"
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
