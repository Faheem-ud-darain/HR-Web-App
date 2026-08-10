'use client';

import { useEffect, useRef } from 'react';
import { useKVByPrefix, useTimesheets, useProfiles, hrActions } from '@/lib/hrData';

const HEARTBEAT_STALE_MS = 3 * 60 * 1000; // 3 minutes without heartbeat = inactive
const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // Only alert once every 15 minutes per inactive shift

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
          const alertKey = `inactivity_alert_${empEmail}`;
          const lastAlertTime = parseInt(sessionStorage.getItem(alertKey) || '0', 10);

          if (now - lastAlertTime > ALERT_COOLDOWN_MS) {
            sessionStorage.setItem(alertKey, now.toString());

            const emp = currentProfiles.find(p => p.email.toLowerCase() === empEmail);
            const empName = emp ? emp.fullName : empEmail;
            const minsInactive = lastHb ? Math.floor((now - lastHb) / 60000) : '5+';

            // 1. Direct Alert to the Employee
            await hrActions.addNotification(
              empEmail,
              'employee',
              `⚠️ Tracker Warning: You are clocked in, but your desktop agent is OFF or inactive (${minsInactive}m). Please launch your desktop tracker agent to avoid absence auto-flagging.`,
              'shift',
              `⚠️ Desktop Tracker Agent Inactive`
            );

            // 2. Alert HR/Admin (if manager is running the monitor)
            if (['hr', 'admin'].includes(userRole)) {
              await hrActions.addNotification(
                'all',
                userRole as 'hr' | 'admin',
                `⚠️ Tracker Alert: ${empName} is currently clocked in but screen tracking has been inactive for ${minsInactive} min(s).`,
                'shift',
                `Tracker Inactivity Alert: ${empName}`
              );
            }
          }
        }
      }
    }, 60000); // Check every 60 seconds

    return () => clearInterval(interval);
  }, [userRole, userEmail]);

  return null;
}
