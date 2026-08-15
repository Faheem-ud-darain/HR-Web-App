'use client';

import { useEffect, useRef } from 'react';
import { useKVByPrefix, useTimesheets, useProfiles, hrActions } from '@/lib/hrData';
import { getNYDateString } from '@/lib/timezone';

const HEARTBEAT_STALE_MS = 3 * 60 * 1000; // 3 minutes without heartbeat = inactive

export function SmartInactivityMonitor({ userRole, userEmail }: { userRole: string; userEmail: string }) {
  const { data: timesheets = [] } = useTimesheets();
  const { data: heartbeatRows = [] } = useKVByPrefix('tracker_heartbeat_');
  const { data: allProfiles = [] } = useProfiles();

  const timesheetsRef = useRef(timesheets);
  const heartbeatRowsRef = useRef(heartbeatRows);
  const allProfilesRef = useRef(allProfiles);

  useEffect(() => {
    timesheetsRef.current = timesheets;
    heartbeatRowsRef.current = heartbeatRows;
    allProfilesRef.current = allProfiles;
  }, [timesheets, heartbeatRows, allProfiles]);

  useEffect(() => {
    if (!userEmail) return;

    const interval = setInterval(async () => {
      const currentTimesheets = timesheetsRef.current;
      const currentHeartbeats = heartbeatRowsRef.current;
      const currentProfiles = allProfilesRef.current;

      if (!currentTimesheets.length || !currentHeartbeats.length) return;

      const now = Date.now();
      // localShiftDate() requires a clockIn timestamp (it computes which
      // shift-day a specific punch belongs to) — this just needs "today's
      // date" as a bare key, which is what getNYDateString() is for. The
      // previous localShiftDate() call (0 args) was a TS2554 type error —
      // "Expected 1-2 arguments, but got 0" — which next.config.ts doesn't
      // suppress, so this was very likely failing the production build.
      const todayDate = getNYDateString();
      const heartbeatsMap = new Map<string, number>();

      currentHeartbeats.forEach(row => {
        const hb = row.value;
        const hbEmail = hb?.employeeEmail || hb?.email;
        const hbTime = hb?.lastHeartbeat || hb?.lastSeenAt;
        if (hbEmail && hbTime) {
          const emailKey = hbEmail.toLowerCase();
          const time = new Date(hbTime).getTime();
          const existing = heartbeatsMap.get(emailKey) || 0;
          if (time > existing) heartbeatsMap.set(emailKey, time);
        }
      });

      // Find all currently clocked-in (open) shifts
      const openShifts = currentTimesheets.filter(t => !t.clockOut);

      for (const shift of openShifts) {
        const empEmail = shift.employeeEmail.toLowerCase();
        const lastHb = heartbeatsMap.get(empEmail);
        const shiftStart = new Date(shift.clockIn).getTime();

        // Give a 5-minute grace period after clock-in before alerting
        if (now - shiftStart < 5 * 60 * 1000) continue;

        // If no heartbeat recorded OR heartbeat is older than 3 minutes
        const isStale = !lastHb || (now - lastHb > HEARTBEAT_STALE_MS);

        if (isStale) {
          // Employee gets inactivity warning at most ONCE per calendar day
          const dailyAlertKey = `inactivity_alert_${empEmail}_${todayDate}`;
          const alreadyAlertedToday = localStorage.getItem(dailyAlertKey) || sessionStorage.getItem(dailyAlertKey);

          if (!alreadyAlertedToday) {
            localStorage.setItem(dailyAlertKey, '1');
            sessionStorage.setItem(dailyAlertKey, '1');

            const minsInactive = lastHb ? Math.floor((now - lastHb) / 60000) : '5+';

            // Direct Alert ONLY to the Employee (at most once per day)
            await hrActions.addNotification(
              empEmail,
              'employee',
              `⚠️ Tracker Warning: You are clocked in, but your desktop agent is OFF or inactive (${minsInactive}m). Please launch your desktop tracker agent to avoid absence auto-flagging.`,
              'shift',
              `⚠️ Desktop Tracker Agent Inactive`
            );
          }
        }
      }
    }, 60000); // Check every 60 seconds

    return () => clearInterval(interval);
  }, [userRole, userEmail]);

  return null;
}
