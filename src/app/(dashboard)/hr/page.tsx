'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { OrgCalendar, TaskModal, MaintenanceNoticeManager, ScheduleMeetModal } from '@/components/ui/lazy';
import { Users, Clock, ClipboardList, PlusCircle, Video } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { hrActions, Profile, Announcement, useProfiles, useLeaves, useTasks, useTeams, useAnnouncements, useWarehouses, useTimesheets, displayName, addEmployeeServer, setTeamLeadAdmin } from '@/lib/hrData';
import { ActiveEmployeesCard } from '@/components/ui/ActiveEmployeesCard';
import { AvgHoursWorkedCard } from '@/components/ui/AvgHoursWorkedCard';
import { Button } from '@/components/ui/Button';
import { ListSkeleton, StatCardSkeletonGrid } from '@/components/ui/Skeleton';
import { AnnouncementsSection } from '@/components/ui/AnnouncementsSection';
import { INACTIVITY_THRESHOLD_SECONDS } from '@/lib/core/absences';

export default function HRDashboard() {
  const router = useRouter();

  // Data
  const { data: employees = [], isLoading: isEmployeesLoading, refetch: refetchProfiles } = useProfiles();
  const { data: leaves = [], isLoading: isLeavesLoading, refetch: refetchLeaves } = useLeaves();
  const { data: tasks = [], refetch: refetchTasks } = useTasks();
  const { data: teamsData = [], refetch: refetchTeams } = useTeams();
  const { data: timesheets = [], isLoading: isTimesheetsLoading } = useTimesheets({ days: 10 });


  // LeaveApplication only snapshots a fullName, not a live Profile reference.
  const nameFor = (employeeName: string): string => {
    const emp = employees.find((e: Profile) => e.fullName === employeeName);
    return emp ? displayName(emp, 'hr') : employeeName;
  };
  const teams = teamsData.map(t => t.name); // extract names
  const { data: announcements = [], isLoading: announcementsLoading, refetch: refetchAnnouncements } = useAnnouncements();
  const { data: warehouses = [], refetch: refetchWarehouses } = useWarehouses();
  
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [isScheduleMeetOpen, setIsScheduleMeetOpen] = useState(false);
  const [isTeamLeadOpen, setIsTeamLeadOpen] = useState(false);
  const [isOnboardOpen, setIsOnboardOpen] = useState(false);
  const [isAnnounceOpen, setIsAnnounceOpen] = useState(false);


  // Team Lead assignment form
  const [leadEmployeeId, setLeadEmployeeId] = useState('');
  const [leadTeamSelections, setLeadTeamSelections] = useState<string[]>([]);
  const [leadSuccess, setLeadSuccess] = useState('');

  // Onboard form
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('employee');
  const [salary, setSalary] = useState('');
  const [team, setTeam] = useState('Engineering');
  const [tempPassword, setTempPassword] = useState('');
  const [onboardError, setOnboardError] = useState('');
  const [onboardSuccess, setOnboardSuccess] = useState('');

  useEffect(() => {
    // Monthly screenshot retention sweep — no-ops if already checked this
    // month or nothing is due; see checkScreenshotRetention in hrData.ts.
    hrActions.checkScreenshotRetention();

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
  }, [employees.length, timesheets.length, leaves.length, isEmployeesLoading, isTimesheetsLoading, isLeavesLoading]);



  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardError('');
    if (!fullName || !email || !salary) { setOnboardError('Please fill in all required fields.'); return; }
    if (isNaN(Number(salary)) || Number(salary) <= 0) { setOnboardError('Please enter a valid base salary.'); return; }

    await addEmployeeServer({ fullName, email, role: role as Profile['role'], joinedDate: new Date().toISOString().split('T')[0], baseSalary: Number(salary), teams: [team], password: tempPassword || undefined });
    await hrActions.addNotification('all', 'hr', `New employee ${fullName} (${role}) registered.`);
    await hrActions.addNotification('all', 'admin', `New employee ${fullName} (${role}) registered.`);
    setOnboardSuccess('Employee registered!');
    refetchProfiles();
    setTimeout(() => { setIsOnboardOpen(false); setFullName(''); setEmail(''); setSalary(''); setTempPassword(''); setOnboardSuccess(''); }, 1200);
  };

  const handleLeadToggle = (teamName: string) => {
    setLeadTeamSelections(prev =>
      prev.includes(teamName) ? prev.filter(t => t !== teamName) : [...prev, teamName]
    );
  };

  const handleSaveTeamLead = async () => {
    if (!leadEmployeeId) return;
    await setTeamLeadAdmin(leadEmployeeId, leadTeamSelections);
    refetchProfiles();
    const emp = employees.find((e: Profile) => e.id === leadEmployeeId);
    setLeadSuccess(`${emp?.fullName} is now team lead of: ${leadTeamSelections.join(', ') || '(none)'}`);
    setTimeout(() => { setIsTeamLeadOpen(false); setLeadSuccess(''); setLeadEmployeeId(''); setLeadTeamSelections([]); }, 1400);
  };

  // Stats
  const pendingLeaves = leaves.filter(l => l.status === 'pending').length;

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-slate-900">HR Dashboard</h1>
          <p className="text-xs md:text-sm text-slate-500">Overview, scheduling calendar, and team operations.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setIsScheduleMeetOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 md:py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform flex items-center gap-1.5 shadow-sm min-h-[44px] md:min-h-0"
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

      {/* Stats */}
      {(isEmployeesLoading || isLeavesLoading) ? (
        <StatCardSkeletonGrid count={4} className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4" />
      ) : (
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card
          onClick={() => router.push('/hr/teams')}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push('/hr/teams'); } }}
          className="cursor-pointer"
        >
          <CardContent className="pt-4 md:pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] md:text-xs font-semibold text-slate-500">Total Employees</p>
                <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">{employees.length}</p>
              </div>
              <div className="h-10 w-10 md:h-11 md:w-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <Users className="h-4 w-4 md:h-5 md:w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card
          onClick={() => router.push('/hr/leaves')}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push('/hr/leaves'); } }}
          className="cursor-pointer"
        >
          <CardContent className="pt-4 md:pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] md:text-xs font-semibold text-slate-500">Pending Leaves</p>
                <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">{pendingLeaves}</p>
              </div>
              <div className="h-10 w-10 md:h-11 md:w-11 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                <Clock className="h-4 w-4 md:h-5 md:w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <AvgHoursWorkedCard employees={employees} timesheets={timesheets} viewerRole="hr" />
        <ActiveEmployeesCard employees={employees} timesheets={timesheets} viewerRole="hr" />
      </div>
      )}

      {/* Pending Leave Requests — the primary actionable item for HR, surfaced
          immediately after stats rather than buried below passive widgets. */}
      <Card className="p-0">
        <div className="px-4 md:px-6 pt-4 md:pt-5 pb-2 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-sm md:text-base font-bold text-slate-900">Pending Leave Requests</h2>
            <p className="text-[10px] md:text-xs text-slate-500 mt-0.5">Requests awaiting your decision.</p>
          </div>
          <button
            onClick={() => router.push('/hr/leaves')}
            className="text-xs font-semibold text-orange-600 hover:text-orange-700 shrink-0"
          >
            Full Kanban board →
          </button>
        </div>
        <CardContent className="p-0 divide-y divide-slate-100">
          {isLeavesLoading && <div className="p-4"><ListSkeleton rows={3} /></div>}
          {!isLeavesLoading && leaves.filter(l => l.status === 'pending').slice(0, 5).map(l => (
            <div key={l.id} className="p-4 md:px-6 flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-slate-900 text-sm">{nameFor(l.employeeName)}</div>
                <div className="text-xs text-slate-500 mt-0.5">{l.type} · {l.duration}</div>
              </div>
              <Badge variant="warning">Pending</Badge>
            </div>
          ))}
          {!isLeavesLoading && leaves.filter(l => l.status === 'pending').length === 0 && (
            <div className="text-xs text-slate-400 font-medium italic text-center py-6">No pending leave requests.</div>
          )}
        </CardContent>
      </Card>

      {/* Dynamic Org Calendar */}
      <Card className="p-0">
        <div className="px-4 md:px-6 pt-4 md:pt-5 pb-2 border-b border-slate-100">
          <h2 className="text-sm md:text-base font-bold text-slate-900">Organisation Calendar</h2>
          <p className="text-[10px] md:text-xs text-slate-500 mt-0.5">Leaves, task deadlines, and schedule conflicts — all teams in one view.</p>
        </div>
        <div className="p-3 md:p-6">
          <OrgCalendar leaves={leaves as any} tasks={tasks as any} employees={employees} />
        </div>
      </Card>

      <AnnouncementsSection role="hr" isCreateOpen={isAnnounceOpen} onCreateClose={() => setIsAnnounceOpen(false)} />

      <MaintenanceNoticeManager createdBy="HR Manager" />

      {/* --- MODALS --- */}


      {/* Task Assignment Modal */}
      <TaskModal
        isOpen={isTaskOpen}
        onClose={() => setIsTaskOpen(false)}
        employees={employees.filter((e: Profile) => e.role === 'employee' || e.isTeamLead)}
        createdBy="hr"
        onTaskAdded={(task) => refetchTasks()}
      />

      {/* Schedule Google Meet Modal */}
      <ScheduleMeetModal
        isOpen={isScheduleMeetOpen}
        onClose={() => setIsScheduleMeetOpen(false)}
      />

    </div>
  );
}
