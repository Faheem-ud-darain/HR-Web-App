'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Task, hrActions } from '@/lib/hrData';
import { Trash2, CheckCircle2, RotateCcw, Clock, AlertTriangle, Briefcase, Calendar, User, Tag, Flag, ArrowRight, Building2, Loader2 } from 'lucide-react';

interface TaskBoardProps {
  tasks: Task[];
  onUpdate: (tasks?: Task[]) => void;
  filterEmails?: string[];
  canDelete?: boolean;
  readOnly?: boolean;
}

const PRIORITY_STYLES: Record<Task['priority'], string> = {
  high:   'bg-rose-100 text-rose-800 border-rose-200',
  medium: 'bg-orange-100 text-orange-800 border-orange-200',
  low:    'bg-slate-100 text-slate-600 border-slate-200',
};

const STATUS_STYLES: Record<Task['status'], string> = {
  todo:        'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  done:        'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const STATUS_LABELS: Record<Task['status'], string> = {
  todo:        'To Do',
  in_progress: 'In Progress',
  done:        'Done',
};

const PRIORITY_ICON: Record<Task['priority'], React.ReactNode> = {
  high:   <AlertTriangle className="h-3 w-3" />,
  medium: <Clock className="h-3 w-3" />,
  low:    null,
};

const STATUS_SEQUENCE: Task['status'][] = ['todo', 'in_progress', 'done'];

function TaskDetailModal({ task, onClose, onUpdate, canDelete, readOnly }: {
  task: Task;
  onClose: () => void;
  onUpdate: (tasks?: Task[]) => void;
  canDelete: boolean;
  readOnly: boolean;
}) {
  const isOverdue = task.status !== 'done' && new Date(task.dueDate) < new Date();
  const isDueSoon = !isOverdue && task.status !== 'done' &&
    (new Date(task.dueDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24) <= 3;
  const [isWorking, setIsWorking] = useState(false);

  const cycleStatus = async () => {
    if (readOnly || isWorking) return;
    setIsWorking(true);
    try {
      const next = STATUS_SEQUENCE[(STATUS_SEQUENCE.indexOf(task.status) + 1) % STATUS_SEQUENCE.length];
      await hrActions.updateTaskStatus(task.id, next);
      onUpdate();
      onClose();
    } finally {
      setIsWorking(false);
    }
  };

  const handleDelete = async () => {
    if (!canDelete || isWorking) return;
    setIsWorking(true);
    try {
      await hrActions.deleteTask(task.id);
      onUpdate();
      onClose();
    } finally {
      setIsWorking(false);
    }
  };

  const handleReset = async () => {
    if (isWorking) return;
    setIsWorking(true);
    try {
      await hrActions.updateTaskStatus(task.id, 'todo');
      onUpdate();
      onClose();
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Task Details">
      <div className="space-y-5">
        {/* Status + priority badges */}
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${PRIORITY_STYLES[task.priority]}`}>
            {PRIORITY_ICON[task.priority]} {task.priority} priority
          </span>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${STATUS_STYLES[task.status]}`}>
            {STATUS_LABELS[task.status]}
          </span>
          {isOverdue && <span className="text-xs font-bold text-rose-700 bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-full">OVERDUE</span>}
          {isDueSoon && <span className="text-xs font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full">DUE SOON</span>}
        </div>

        {/* Title */}
        <div>
          <h3 className={`text-lg md:text-xl font-bold text-slate-900 leading-snug ${task.status === 'done' ? 'line-through opacity-50' : ''}`}>
            {task.title}
          </h3>
          {task.description && (
            <p className="text-xs md:text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-wrap break-words">{task.description}</p>
          )}
        </div>

        {/* Meta info grid — 1 col on mobile, 2 col on md+ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { icon: User,     label: 'Assigned To', value: task.assignedTo },
            { icon: Briefcase, label: 'Team',        value: task.team },
            { icon: Calendar,  label: 'Due Date',    value: new Date(task.dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }) },
            { icon: Flag,      label: 'Created By',  value: task.createdBy },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-start gap-2.5 bg-slate-50 rounded-lg p-3 border border-slate-100">
              <Icon className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                <p className="text-xs md:text-sm font-semibold text-slate-800 mt-0.5">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Progress indicator — scroll on very small screens */}
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 overflow-x-auto pb-1">
          {STATUS_SEQUENCE.map((s, i) => (
            <React.Fragment key={s}>
              <span className={`px-2.5 py-1 rounded-full border whitespace-nowrap ${task.status === s ? STATUS_STYLES[s] : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                {STATUS_LABELS[s]}
              </span>
              {i < STATUS_SEQUENCE.length - 1 && <ArrowRight className="h-3 w-3 text-slate-300 flex-shrink-0" />}
            </React.Fragment>
          ))}
        </div>

        {/* Actions — full-width on mobile, auto on md+ */}
        <div className="flex flex-col md:flex-row flex-wrap gap-2 pt-4 border-t border-slate-200">
          {!readOnly && task.status !== 'done' && (
            <Button
              variant="primary"
              onClick={cycleStatus}
              disabled={isWorking}
              className="!py-3 md:!py-2 shadow-sm active:scale-97 transition-transform min-h-[44px] md:min-h-0 w-full md:w-auto"
            >
              {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Mark as {STATUS_LABELS[STATUS_SEQUENCE[(STATUS_SEQUENCE.indexOf(task.status) + 1) % STATUS_SEQUENCE.length]]}
            </Button>
          )}
          {!readOnly && task.status !== 'todo' && (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={isWorking}
              className="!py-3 md:!py-2 active:scale-97 transition-transform min-h-[44px] md:min-h-0 w-full md:w-auto"
            >
              {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Reset to To Do
            </Button>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={isWorking}
              className="flex items-center justify-center gap-1.5 bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 font-semibold px-4 py-3 md:py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform md:ml-auto min-h-[44px] md:min-h-0 w-full md:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete Task
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function TaskBoard({ tasks, onUpdate, filterEmails, canDelete = true, readOnly = false }: TaskBoardProps) {
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<Task['priority'] | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<Task['status'] | 'all'>('all');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const isDueSoon = (dueDate: string) => {
    const diff = (new Date(dueDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24);
    return diff <= 3 && diff >= 0;
  };

  const isOverdue = (dueDate: string, status: Task['status']) => {
    if (status === 'done') return false;
    return new Date(dueDate) < new Date();
  };

  const filtered = tasks
    .filter(t => filterEmails ? filterEmails.includes(t.assignedEmail) : true)
    .filter(t =>
      search === '' ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.assignedTo.toLowerCase().includes(search.toLowerCase()) ||
      t.team.toLowerCase().includes(search.toLowerCase())
    )
    .filter(t => filterPriority === 'all' || t.priority === filterPriority)
    .filter(t => filterStatus === 'all' || t.status === filterStatus);

  return (
    <div className="space-y-4">
      {/* Filters — stack on mobile, row on md+ */}
      <div className="flex flex-col md:flex-row gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tasks, employees, teams..."
          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg py-2.5 md:py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900 min-h-[44px] md:min-h-0"
        />
        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value as Task['priority'] | 'all')}
          className="bg-slate-50 border border-slate-200 rounded-lg py-2.5 md:py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900 min-h-[44px] md:min-h-0"
        >
          <option value="all">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as Task['status'] | 'all')}
          className="bg-slate-50 border border-slate-200 rounded-lg py-2.5 md:py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900 min-h-[44px] md:min-h-0"
        >
          <option value="all">All Statuses</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
      </div>

      {/* Summary counts — wrap on mobile */}
      <div className="flex flex-wrap gap-2 md:gap-3 text-xs font-semibold text-slate-500">
        <span>{filtered.filter(t => t.status === 'todo').length} to do</span>
        <span className="text-slate-300">·</span>
        <span className="text-indigo-600">{filtered.filter(t => t.status === 'in_progress').length} in progress</span>
        <span className="text-slate-300">·</span>
        <span className="text-emerald-600">{filtered.filter(t => t.status === 'done').length} done</span>
        <span className="text-slate-300">·</span>
        <span className="text-rose-600">{filtered.filter(t => isOverdue(t.dueDate, t.status)).length} overdue</span>
      </div>

      {/* Task cards */}
      <div className="space-y-3">
        {filtered.map(task => (
          <Card
            key={task.id}
            onClick={() => setSelectedTask(task)}
            className={`p-4 border transition-colors transition-shadow cursor-pointer group ${
              isOverdue(task.dueDate, task.status)
                ? 'border-rose-200 bg-rose-50/30 hover:bg-rose-50/60'
                : task.status === 'done'
                ? 'border-emerald-100 opacity-75 hover:opacity-100'
                : 'border-slate-200 bg-white hover:border-orange-200 hover:shadow-sm'
            }`}
          >
            <div className="flex items-start gap-3 md:gap-4">
              {/* Status circle — slightly larger on mobile for touch */}
              <div className={`flex-shrink-0 mt-0.5 h-6 w-6 md:h-5 md:w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                task.status === 'done'        ? 'bg-emerald-500 border-emerald-500 text-white' :
                task.status === 'in_progress' ? 'border-indigo-400 bg-indigo-50' :
                'border-slate-300 bg-white group-hover:border-orange-400'
              }`}>
                {task.status === 'done'        && <CheckCircle2 className="h-3 w-3" />}
                {task.status === 'in_progress' && <div className="h-2 w-2 rounded-full bg-indigo-400" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-start gap-2 mb-1">
                  <span className={`font-bold text-slate-900 text-xs md:text-sm ${task.status === 'done' ? 'line-through opacity-60' : ''}`}>
                    {task.title}
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${PRIORITY_STYLES[task.priority]}`}>
                    {PRIORITY_ICON[task.priority]}{task.priority}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[task.status]}`}>
                    {STATUS_LABELS[task.status]}
                  </span>
                  {isOverdue(task.dueDate, task.status)  && <span className="text-[10px] font-bold text-rose-700 bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-full">OVERDUE</span>}
                  {isDueSoon(task.dueDate) && task.status !== 'done' && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">DUE SOON</span>}
                </div>

                {task.description && (
                  <p className="text-xs text-slate-500 mb-2 leading-relaxed line-clamp-1">{task.description}</p>
                )}

                <div className="flex flex-wrap gap-2 md:gap-3 text-[10px] text-slate-400 font-semibold">
                  <span className="flex items-center gap-1"><User className="h-3 w-3" /> {task.assignedTo}</span>
                  <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {task.team}</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Due: {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
              </div>

              <span className="hidden sm:block text-[10px] text-slate-400 font-semibold flex-shrink-0 mt-1 group-hover:text-orange-500 transition-colors">Click to open →</span>
            </div>
          </Card>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12 md:py-16 text-slate-400 font-semibold text-xs md:text-sm italic border-2 border-dashed border-slate-200 rounded-xl">
            No tasks match your filters.
          </div>
        )}
      </div>

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={updated => { onUpdate(updated); setSelectedTask(null); }}
          canDelete={canDelete}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}
