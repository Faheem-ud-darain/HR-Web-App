'use client';

import React from 'react';
import { Task } from '@/lib/hrData';
import { formatDateNY } from '@/lib/timezone';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TASK_PRIORITY_STYLES, TASK_STATUS_LABELS, TASK_STATUS_STYLES } from '@/components/ui/StatusBadges';

interface TaskDetailModalProps {
  task: Task;
  busy: boolean;
  // Move the task on: todo -> in_progress -> done.
  onStatus: (next: Task['status']) => void;
  onClose: () => void;
}

// One of the employee's own tasks, with the one next step they can take (Start Task / Mark Completed).
export function TaskDetailModal({ task, busy, onStatus, onClose }: TaskDetailModalProps) {
  return (
    <Modal isOpen onClose={onClose} title="Task Details">
      <div className="space-y-4">
        <div className="flex gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${TASK_PRIORITY_STYLES[task.priority]}`}>{task.priority} priority</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${TASK_STATUS_STYLES[task.status]}`}>{TASK_STATUS_LABELS[task.status]}</span>
        </div>

        <div>
          <h3 className="font-bold text-lg text-slate-900">{task.title}</h3>
          {task.description && <p className="text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-wrap break-words">{task.description}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
          <div>
            <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Due Date</p>
            <p className="font-semibold text-slate-800 mt-0.5">{formatDateNY(task.dueDate)}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Department</p>
            <p className="font-semibold text-slate-800 mt-0.5">{task.team}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
          {task.status === 'todo' && <Button variant="indigo" size="md" loading={busy} onClick={() => onStatus('in_progress')}>Start Task</Button>}
          {task.status === 'in_progress' && <Button variant="success" size="md" loading={busy} onClick={() => onStatus('done')}>Mark Completed</Button>}
          <Button variant="outline" size="md" onClick={onClose} disabled={busy}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}
