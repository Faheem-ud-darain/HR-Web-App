'use client';

import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, Calendar, Briefcase, FileText, X, Palmtree, ClipboardList } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { LeaveApplication, Task, Profile } from '@/lib/hrData';

interface CalendarEvent {
  type: 'leave' | 'task';
  label: string;
  team: string;
  color: string;
  isConflict?: boolean;
  rawTask?: Task;
  rawLeave?: LeaveApplication;
}

interface DayData {
  date: Date;
  events: CalendarEvent[];
  hasConflict: boolean;
}

interface OrgCalendarProps {
  leaves: LeaveApplication[];
  tasks: Task[];
  employees: Profile[];
}

const TEAM_COLORS: Record<string, string> = {
  Engineering: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  Design: 'bg-purple-50 text-purple-800 border-purple-200',
  Marketing: 'bg-pink-50 text-pink-800 border-pink-200',
  Operations: 'bg-teal-50 text-teal-800 border-teal-200',
  Sales: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

const getTeamColor = (team: string) => TEAM_COLORS[team] || 'bg-slate-50 text-slate-700 border-slate-200';

function parseLeaveRange(duration: string): { start: Date; end: Date } | null {
  try {
    const parts = duration.split(' - ');
    const start = new Date(parts[0]);
    const end = parts.length >= 2 ? new Date(parts[1]) : new Date(parts[0]);
    if (isNaN(start.getTime())) return null;
    return { start, end };
  } catch {
    return null;
  }
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isDateInRange(date: Date, start: Date, end: Date) {
  const d = date.getTime();
  return d >= start.setHours(0, 0, 0, 0) && d <= end.setHours(23, 59, 59, 999);
}

export function OrgCalendar({ leaves, tasks, employees }: OrgCalendarProps) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [modalDay, setModalDay] = useState<DayData | null>(null);

  const approvedLeaves = leaves.filter(l => l.status === 'approved' || l.status === 'hr_approved');

  const daysInMonth = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay(); // 0 = Sunday
    const days: (Date | null)[] = [];

    for (let i = 0; i < startPad; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));

    return days;
  }, [viewDate]);

  const getDayData = (date: Date): DayData => {
    const events: CalendarEvent[] = [];

    // Check leaves
    for (const leave of approvedLeaves) {
      const range = parseLeaveRange(leave.duration);
      if (!range) continue;
      if (isDateInRange(new Date(date), new Date(range.start), new Date(range.end))) {
        const emp = employees.find(e => e.fullName === leave.employeeName);
        const team = emp?.teams?.[0] || 'Unknown';
        events.push({
          type: 'leave',
          label: `${leave.employeeName} — ${leave.type}`,
          team,
          color: getTeamColor(team),
          rawLeave: leave,
        });
      }
    }

    // Check tasks
    for (const task of tasks) {
      const taskDate = new Date(task.dueDate);
      if (isSameDay(taskDate, date) && task.status !== 'done') {
        events.push({
          type: 'task',
          label: `${task.assignedTo}: ${task.title}`,
          team: task.team,
          color: 'bg-orange-50 text-orange-800 border-orange-200',
          rawTask: task,
        });
      }
    }

    // Detect conflicts: task assignee is also on leave that day
    const leaveNames = events.filter(e => e.type === 'leave').map(e => e.label.split(' — ')[0]);
    const taskNames = events.filter(e => e.type === 'task').map(e => e.label.split(':')[0]);
    const conflicts = taskNames.filter(name => leaveNames.includes(name));
    if (conflicts.length > 0) {
      events.forEach(e => {
        if (conflicts.some(name => e.label.startsWith(name))) e.isConflict = true;
      });
    }

    return { date, events, hasConflict: conflicts.length > 0 };
  };

  const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));

  const monthLabel = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm sm:text-base">
          <Calendar className="h-4 w-4 text-orange-600" />
          {monthLabel}
        </h3>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="text-[10px] sm:text-xs font-bold px-2 py-1 rounded bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors"
          >
            Today
          </button>
          <button onClick={nextMonth} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px] font-bold">
        <span className="flex items-center gap-1 text-slate-500"><span className="h-2.5 w-2.5 rounded bg-blue-100 border border-blue-300"></span><Palmtree className="h-3 w-3" /> Leave (approved)</span>
        <span className="flex items-center gap-1 text-slate-500"><span className="h-2.5 w-2.5 rounded bg-orange-50 border border-orange-300"></span><ClipboardList className="h-3 w-3" /> Task due</span>
        <span className="flex items-center gap-1 text-slate-500"><span className="h-2.5 w-2.5 rounded bg-amber-50 border border-amber-300"></span><AlertTriangle className="h-3 w-3" /> Conflict: task + leave overlap</span>
      </div>

      {/* Grid */}
      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
          {weekdays.map(d => (
            <div key={d} className="text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider py-2">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
          {daysInMonth.map((date, i) => {
            if (!date) return <div key={`pad-${i}`} className="bg-slate-50/30 h-20 sm:h-24" />;

            const dayData = getDayData(date);
            const isToday = isSameDay(date, today);
            const hasEvents = dayData.events.length > 0;

            return (
              <div
                key={date.toISOString()}
                onClick={() => setModalDay(dayData)}
                className={`h-20 sm:h-24 p-1 cursor-pointer transition-colors flex flex-col group relative ${
                  dayData.hasConflict ? 'bg-amber-50/40 hover:bg-amber-50' :
                  hasEvents ? 'bg-white hover:bg-slate-50/80' :
                  'bg-white hover:bg-slate-50/30'
                }`}
              >
                {/* Date number */}
                <div className={`text-[10px] sm:text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full mb-0.5 ${
                  isToday ? 'bg-orange-600 text-white' : 'text-slate-600 group-hover:text-slate-900'
                }`}>
                  {date.getDate()}
                </div>

                {/* Conflict badge */}
                {dayData.hasConflict && (
                  <div className="flex items-center gap-0.5 text-[8px] font-bold text-amber-700 mb-0.5 bg-amber-50 border border-amber-200 rounded px-1 w-fit">
                    <AlertTriangle className="h-2.5 w-2.5" /> Conflict
                  </div>
                )}

                {/* Event pills — show up to 2 */}
                <div className="space-y-0.5 flex-1 overflow-hidden">
                  {dayData.events.slice(0, 2).map((event, idx) => (
                    <div
                      key={idx}
                      className={`text-[8px] font-semibold px-1 py-0.5 rounded truncate border ${event.isConflict ? 'ring-1 ring-amber-400' : ''} ${
                        event.type === 'leave' ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-orange-50 text-orange-800 border-orange-200'
                      }`}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        {event.type === 'task' ? <ClipboardList className="h-2 w-2" /> : <Palmtree className="h-2 w-2" />}
                        {event.label.split('—')[0].split(':')[0]}
                      </span>
                    </div>
                  ))}
                  {dayData.events.length > 2 && (
                    <div className="text-[8px] text-slate-400 font-semibold pl-1">+{dayData.events.length - 2} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day Details Popup Modal */}
      {modalDay && (
        <Modal 
          isOpen={true} 
          onClose={() => setModalDay(null)} 
          title={`Events on ${modalDay.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`}
        >
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
            {modalDay.hasConflict && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Schedule Conflict Detected</p>
                  <p className="text-[11px] text-amber-800 font-medium mt-0.5">An employee has a task due on a day they are scheduled for leave.</p>
                </div>
              </div>
            )}

            {modalDay.events.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs italic font-medium">
                No events or leaves scheduled on this day.
              </div>
            ) : (
              <div className="space-y-3">
                {modalDay.events.map((event, idx) => (
                  <div 
                    key={idx} 
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      event.isConflict ? 'bg-amber-50/50 border-amber-200' : 
                      event.type === 'leave' ? 'bg-blue-50/30 border-blue-100' : 
                      'bg-orange-50/30 border-orange-100'
                    }`}
                  >
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                      event.type === 'leave' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
                    }`}>
                      {event.type === 'leave' ? <Palmtree className="h-3.5 w-3.5" /> : <ClipboardList className="h-3.5 w-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h5 className="text-xs font-bold text-slate-900">{event.label}</h5>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                          event.type === 'leave' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-orange-50 border-orange-200 text-orange-700'
                        }`}>
                          {event.type}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-semibold mt-1">
                        Department: {event.team}
                        {event.isConflict && <span className="text-amber-700 font-bold ml-2 inline-flex items-center gap-0.5"><AlertTriangle className="h-2.5 w-2.5" /> Conflict</span>}
                      </p>
                      {event.rawLeave && (
                        <p className="text-[10px] text-slate-400 font-medium mt-1 leading-relaxed border-t border-slate-100 pt-1 whitespace-pre-wrap break-words">
                          Reason: {event.rawLeave.reason}
                        </p>
                      )}
                      {event.rawTask && (
                        <p className="text-[10px] text-slate-400 font-medium mt-1 leading-relaxed border-t border-slate-100 pt-1 whitespace-pre-wrap break-words">
                          Description: {event.rawTask.description || 'No description provided'}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <Button
                variant="secondary"
                onClick={() => setModalDay(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
