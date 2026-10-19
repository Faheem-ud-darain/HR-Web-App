// src/lib/hr/tasks.ts
// Task assignment/tracking (hr_tasks). Extracted from the former hrData.ts
// monolith (plan 014). See plans/014-split-hrdata-monolith.md.

'use client';
import { useQuery } from '@tanstack/react-query';
import type { Task } from './types';
import { pbList, pbListByEmailField, pbCreate, pbUpdate, pbDelete } from './shared';
import { hrActions, buildNotificationLink } from '../hrData';
import { pbFilter } from '../pbFilter';
import type { PbRow } from '@/lib/pbTypes';

function toTask(t: PbRow): Task {
  return { id: t.id, title: t.title, description: t.description, assignedTo: t.assigned_to, assignedEmail: t.assigned_email, team: t.team, dueDate: t.due_date, priority: t.priority, status: t.status, createdBy: t.created_by };
}

// Columns toTask reads.
const TASK_FIELDS = 'id,title,description,assigned_to,assigned_email,team,due_date,priority,status,created_by';
export const DEFAULT_DONE_TASK_DAYS = 30;

export interface TaskQuery {
  /** Completed tasks are only loaded when created within this many days (open tasks always load). Default 30; 0 = all. */
  doneWithinDays?: number;
}

function openOrRecentFilter(days: number): string | undefined {
  if (days <= 0) return undefined;
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().replace('T', ' ').replace('Z', '');
  return pbFilter('status != "done" || created >= {:cutoff}', { cutoff });
}

export function useTasks(options: { enabled?: boolean } & TaskQuery = {}) {
  const days = options.doneWithinDays ?? DEFAULT_DONE_TASK_DAYS;
  return useQuery({
    enabled: options.enabled ?? true,
    queryKey: ['hr_tasks', days],
    queryFn: async () => (await pbList('hr_tasks', { sort: '-created', filter: openOrRecentFilter(days), fields: TASK_FIELDS })).map(toTask),
  });
}
// Scoped variant for an employee's OWN dashboard — useTasks() above fetches
// every task assigned to everyone in the company, which the employee
// dashboard then filtered down to "just mine" client-side (every
// employee's browser was downloading every other employee's task rows on
// every page load). Filters server-side by assigned_email instead, same
// pattern useMyAbsenceRecords-style helpers elsewhere in this file already
// use. HR/Admin task-management pages that legitimately need the whole
// roster's tasks should keep using useTasks().
export function useMyTasks(email: string | null | undefined, query: TaskQuery = {}) {
  const days = query.doneWithinDays ?? DEFAULT_DONE_TASK_DAYS;
  return useQuery({
    queryKey: ['hr_tasks_mine', (email || '').toLowerCase(), days],
    queryFn: async () => {
      if (!email) return [];
      return (await pbListByEmailField('hr_tasks', 'assigned_email', email, { sort: '-created', extraFilter: openOrRecentFilter(days) ? `(${openOrRecentFilter(days)})` : undefined })).map(toTask);
    },
    enabled: !!email,
  });
}

export const taskActions = {
  // ── Tasks ─────────────────────────────────────────────────────────────
  addTask: async (task: Omit<Task, 'id'>): Promise<void> => {
    const created = await pbCreate('hr_tasks', {
      title: task.title, description: task.description, assigned_to: task.assignedTo, assigned_email: task.assignedEmail,
      team: task.team, due_date: task.dueDate, priority: task.priority, status: task.status, created_by: task.createdBy,
    });
    await hrActions.addNotification(task.assignedEmail, 'employee', `New task assigned: "${task.title}" due ${task.dueDate}.`, 'leave_task', task.title, undefined, buildNotificationLink('employee', 'task', created.id));
  },
  updateTaskStatus: (id: string, status: Task['status']) => pbUpdate('hr_tasks', id, { status }),
  deleteTask: (id: string) => pbDelete('hr_tasks', id),
};
