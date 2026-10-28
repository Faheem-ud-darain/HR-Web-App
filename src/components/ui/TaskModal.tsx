'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Task, Profile, hrActions, displayName } from '@/lib/hrData';
import { useActionToast } from '@/components/ui/ActionToastHost';
import { CircleNotchIcon as Loader2 } from '@phosphor-icons/react/dist/ssr';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Profile[];
  createdBy: string;
  onTaskAdded?: (task: Task) => void;
}

export function TaskModal({ isOpen, onClose, employees, createdBy, onTaskAdded }: TaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedEmail, setAssignedEmail] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [error, setError] = useState('');
  const { showToast } = useActionToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (isSubmitting) return;
    if (!title || !assignedEmail || !dueDate) {
      setError('Please fill in all required fields.');
      return;
    }

    const emp = employees.find(e => e.email === assignedEmail);
    if (!emp) {
      setError('Employee not found.');
      return;
    }

    setIsSubmitting(true);
    try {
      const newTask: Omit<Task, 'id'> = {
        title,
        description,
        assignedTo: emp.fullName,
        assignedEmail: emp.email,
        team: emp.teams[0] || 'General',
        dueDate,
        priority,
        status: 'todo',
        createdBy,
      };
      // hrActions.addTask persists the task and fires the assignment
      // notification internally (it does not return the created record).
      await hrActions.addTask(newTask);

      onTaskAdded?.({ id: '', ...newTask });
      setTitle('');
      setDescription('');
      setAssignedEmail('');
      setDueDate('');
      setPriority('medium');
      onClose();
      showToast({ type: 'success', message: `Task "${title}" assigned to ${displayName(emp, createdBy as 'hr' | 'admin')}!` });
    } catch (err) {
      console.error('Task assignment failed:', err);
      setError('Could not assign that task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Assign New Task">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 text-xs bg-rose-50 text-rose-600 border border-rose-100 rounded-lg font-semibold">{error}</div>
        )}
        <FormField label="Task Title *" size="md">
          <Input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            fieldSize="md"
            placeholder="e.g. Prepare Q3 Report"
          />
        </FormField>

        <FormField label="Description" size="md">
          <Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            fieldSize="md" className="resize-none"
            placeholder="Brief description of the task..."
          />
        </FormField>

        <FormField label="Assign To *" size="md">
          <Select
            value={assignedEmail}
            onChange={e => setAssignedEmail(e.target.value)}
            fieldSize="md"
          >
            <option value="">— Select employee —</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.email}>
                {displayName(emp, createdBy as 'hr' | 'admin')} ({emp.teams.join(', ')})
              </option>
            ))}
          </Select>
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Due Date *" size="md">
            <Input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              fieldSize="md"
            />
          </FormField>
          <FormField label="Priority" size="md">
            <Select
              value={priority}
              onChange={e => setPriority(e.target.value as Task['priority'])}
              fieldSize="md"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </FormField>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="active:scale-97 transition-transform"
          >
            Cancel
          </Button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-4 py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Assigning…' : 'Assign Task'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
