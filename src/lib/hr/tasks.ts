// src/lib/hr/tasks.ts
// Task assignment/tracking (hr_tasks). Extracted from the former hrData.ts
// monolith (plan 014). See plans/014-split-hrdata-monolith.md.

'use client';
import { useQuery } from '@tanstack/react-query';
import type { Task } from './types';
import { pbList, pbListByEmailField, pbCreate, pbUpdate, pbDelete } from './shared';
import { hrActions, buildNotificationLink } from '../hrData';

function toTask(t: any): Task {
  return { id: t.id, title: t.title, description: t.description, assignedTo: t.assigned_to, assignedEmail: t.assigned_email, team: t.team, dueDate: t.due_date, priority: t.priority, status: t.status, createdBy: t.created_by };
}

export function useTasks() {
  return useQuery({ queryKey: ['hr_tasks'], queryFn: async () => (await pbList('hr_tasks', { sort: '-created' })).map(toTask) });
}
// Scoped variant for an employee's OWN dashboard — useTasks() above fetches
// every task assigned to everyone in the company, which the employee
// dashboard then filtered down to "just mine" client-side (every
// employee's browser was downloading every other employee's task rows on
// every page load). Filters server-side by assigned_email instead, same
// pattern useMyAbsenceRecords-style helpers elsewhere in this file already
// use. HR/Admin task-management pages that legitimately need the whole
// roster's tasks should keep using useTasks().
export function useMyTasks(email: string | null | undefined) {
  return useQuery({
    queryKey: ['hr_tasks_mine', (email || '').toLowerCase()],
    queryFn: async () => {
      if (!email) return [];
      return (await pbListByEmailField('hr_tasks', 'assigned_email', email, { sort: '-created' })).map(toTask);
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
