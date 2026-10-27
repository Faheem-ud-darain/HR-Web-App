'use client';

import { useState } from 'react';
import { hrActions, type InactivityLog, type Profile, type TimesheetEntry } from '@/lib/hrData';
import { computeWindow, getShiftSecondsInRange, groupLogsByDay, localDateString } from '@/lib/core/trackingWindow';

type MouseRange = 'day' | 'week' | 'month';

// The Mouse Activity dialog: the same Daily / Weekly / Monthly filter as the screenshots, but a full view of the
// inactivity data, with shift / active / inactive totals worked out from the timesheets.
export function useMouseActivity({ timesheets }: { timesheets: TimesheetEntry[] }) {
  const [mouseEmp, setMouseEmp] = useState<Profile | null>(null);
  const [mouseRange, setMouseRange] = useState<MouseRange>('day');
  const [mouseDay, setMouseDay] = useState<string>(() => localDateString());
  const [mouseLogs, setMouseLogs] = useState<InactivityLog[]>([]);
  const [mouseLoading, setMouseLoading] = useState(false);

  const loadMouseData = async (email: string, range: MouseRange, day: string) => {
    setMouseLoading(true);
    try {
      const { since, until } = computeWindow(range, day);
      setMouseLogs(await hrActions.getInactivityLogs({ employeeEmail: email, sinceISO: since.toISOString(), untilISO: until.toISOString() }));
    } finally {
      setMouseLoading(false);
    }
  };

  const open = async (emp: Profile) => {
    setMouseEmp(emp);
    setMouseRange('day');
    const today = localDateString();
    setMouseDay(today);
    await loadMouseData(emp.email, 'day', today);
  };

  const handleMouseRangeChange = (range: MouseRange) => {
    setMouseRange(range);
    if (mouseEmp) loadMouseData(mouseEmp.email, range, mouseDay);
  };

  const handleMouseDayChange = (day: string) => {
    if (!day) return; // a cleared date field: keep the day that is showing
    setMouseDay(day);
    if (mouseEmp) loadMouseData(mouseEmp.email, 'day', day);
  };

  const mouseTotalSeconds = mouseLogs.reduce((sum, l) => sum + l.durationSeconds, 0);
  const mouseWindow = mouseEmp ? computeWindow(mouseRange, mouseDay) : null;
  const mouseShiftSeconds = mouseEmp && mouseWindow ? getShiftSecondsInRange(timesheets, mouseEmp.email, mouseWindow.since, mouseWindow.until) : 0;

  return {
    mouseEmp, setMouseEmp, mouseRange, mouseDay, mouseLogs, mouseLoading,
    mouseTotalSeconds,
    mouseLongestSeconds: mouseLogs.reduce((max, l) => Math.max(max, l.durationSeconds), 0),
    mouseAvgSeconds: mouseLogs.length > 0 ? Math.round(mouseTotalSeconds / mouseLogs.length) : 0,
    mouseShiftSeconds,
    // Active time = clocked-in time minus the inactive stretches inside it, floored at 0 in case inactivity data
    // ever exceeds the recorded shift (e.g. a shift edited after capture).
    mouseActiveSeconds: Math.max(0, mouseShiftSeconds - mouseTotalSeconds),
    mouseLogsByDay: () => groupLogsByDay(mouseLogs),
    open, handleMouseRangeChange, handleMouseDayChange,
  };
}
