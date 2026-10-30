'use client';

import { useEffect } from 'react';
import { runAttendanceSweep } from '@/lib/hr/attendanceSweep';
import type { LeaveApplication, Profile, TimesheetEntry } from '@/lib/hrData';

// Runs the absence sweep when an HR or Admin dashboard has its data: once the lists have loaded, and again if their size
// changes (not on every refetch of identical rows). Both dashboards use this one copy; whichever loads first does the work
// and the other finds nothing new to record.
export function useAttendanceSweep({ employees, timesheets, leaves, loading }: { employees: Profile[]; timesheets: TimesheetEntry[]; leaves: LeaveApplication[]; loading: boolean }) {
  useEffect(() => {
    if (loading || employees.length === 0) return;
    void runAttendanceSweep(employees, timesheets, leaves);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the sweep runs when the data finishes loading or its size changes, not on every refetch of identical rows
  }, [employees.length, timesheets.length, leaves.length, loading]);
}
