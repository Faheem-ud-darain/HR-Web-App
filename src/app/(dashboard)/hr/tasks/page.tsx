'use client';

import React, { useState } from 'react';
import { TaskBoard, TaskModal } from '@/components/ui/lazy';
import { Button } from '@/components/ui/Button';
import { Profile, useTasks, useProfiles } from '@/lib/hrData';
import { ClipboardList } from 'lucide-react';
import { LoadMoreHistory } from '@/components/ui/LoadMoreHistory';
import { ListSkeleton } from '@/components/ui/Skeleton';

export default function HRTasksPage() {
  const [doneDays, setDoneDays] = useState(30);
  const { data: tasks = [], isLoading: tasksLoading, isFetching: tasksFetching, refetch: refetchTasks } = useTasks({ doneWithinDays: doneDays });
  const { data: employees = [] } = useProfiles();
  const [isTaskOpen, setIsTaskOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Task Management</h1>
          <p className="text-slate-500">Create, assign, and track tasks across all teams.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => setIsTaskOpen(true)}
          className="transition-shadow shadow-sm active:scale-97 transition-transform"
        >
          <ClipboardList className="h-4 w-4" /> Assign New Task
        </Button>
      </div>

      <LoadMoreHistory days={doneDays} maxDays={365} loading={tasksFetching} noun="completed tasks" onLoadMore={() => setDoneDays(d => Math.min(365, d + 60))} />

      {tasksLoading ? <ListSkeleton rows={5} /> : (
      <TaskBoard
          tasks={tasks}
          onUpdate={() => refetchTasks()}
          canDelete={true}
          readOnly={false}
        />
      )}

      <TaskModal
        isOpen={isTaskOpen}
        onClose={() => setIsTaskOpen(false)}
        employees={employees.filter((e: Profile) => e.role === 'employee' || e.isTeamLead)}
        createdBy="hr"
        onTaskAdded={() => refetchTasks()}
      />
    </div>
  );
}
