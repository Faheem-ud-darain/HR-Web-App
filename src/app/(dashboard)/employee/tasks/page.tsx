'use client';

import React, { useState, useMemo } from 'react';
import { useProfiles, useTasks, displayName } from '@/lib/hrData';
import { TaskBoard } from '@/components/ui/lazy';
import { Badge } from '@/components/ui/Badge';
import { UsersIcon as Users, StarIcon as Star } from '@phosphor-icons/react/dist/ssr';
import { LoadMoreHistory } from '@/components/ui/LoadMoreHistory';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useSessionEmail } from '@/lib/useSession';

export default function TeamLeadTasksPage() {
  const { data: allProfiles = [] } = useProfiles();
  const [doneDays, setDoneDays] = useState(30);
  const { data: allTasks = [], isLoading: tasksLoading, isFetching: tasksFetching, refetch: refetchTasks } = useTasks({ doneWithinDays: doneDays });

  const sessionEmail = useSessionEmail();
  const userProfile = useMemo(
    () => allProfiles.find(e => e.email && sessionEmail && e.email.toLowerCase() === sessionEmail.toLowerCase()) || null,
    [allProfiles, sessionEmail],
  );
  const [teamFilter, setTeamFilter] = useState<'all' | 'my' | string>('all');

  if (!userProfile?.isTeamLead) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
        <Users weight="duotone" className="h-12 w-12 opacity-30" />
        <p className="font-semibold text-sm">You are not designated as a Team Lead.</p>
        <p className="text-xs">Contact HR to update your role.</p>
      </div>
    );
  }

  const leadTeams = userProfile.leadTeams || [];

  // Filter logic based on tab
  const visibleTasks = allTasks.filter(t => {
    if (teamFilter === 'my') return t.assignedEmail === userProfile.email;
    if (teamFilter === 'all') return leadTeams.includes(t.team);
    return t.team === teamFilter; // specific team tab
  });

  // Team Leads only ever see the Alias, never real names — swap the
  // assignedTo/createdBy label before handing tasks to TaskBoard, which
  // just renders whatever string it's given (see displayName in hrData.ts).
  const emailToProfile = new Map(allProfiles.map(p => [p.email.toLowerCase(), p]));
  const displayTasks = visibleTasks.map(t => ({
    ...t,
    assignedTo: displayName(emailToProfile.get((t.assignedEmail || '').toLowerCase()), userProfile.role) || t.assignedTo,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Team Tasks</h1>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <p className="text-slate-500 text-sm">You are Team Lead of:</p>
          {leadTeams.map(t => (
            <Badge key={t} variant="default" className="text-xs flex items-center gap-1"><Star className="h-3.5 w-3.5" /> {t}</Badge>
          ))}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setTeamFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors transition-shadow ${
            teamFilter === 'all' ? 'bg-orange-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          All Teams ({leadTeams.join(', ')})
        </button>
        <button
          onClick={() => setTeamFilter('my')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors transition-shadow ${
            teamFilter === 'my' ? 'bg-orange-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Assigned To Me
        </button>
        {leadTeams.map(t => (
          <button
            key={t}
            onClick={() => setTeamFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors transition-shadow ${
              teamFilter === t ? 'bg-orange-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t} Team
          </button>
        ))}
      </div>

      <LoadMoreHistory days={doneDays} maxDays={365} loading={tasksFetching} noun="completed tasks" onLoadMore={() => setDoneDays(d => Math.min(365, d + 60))} />

      {tasksLoading ? <ListSkeleton rows={5} /> : (
      <TaskBoard
          tasks={displayTasks}
          onUpdate={() => refetchTasks()}
          canDelete={false}
          readOnly={false}
        />
      )}
    </div>
  );
}
