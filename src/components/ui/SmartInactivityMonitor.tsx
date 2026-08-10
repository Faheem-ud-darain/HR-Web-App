'use client';

import { useEffect } from 'react';
import { useKVByPrefix, useTimesheets, useProfiles, hrActions } from '@/lib/hrData';

const HEARTBEAT_STALE_MS = 3 * 60 * 1000; // 3 minutes without heartbeat = inactive
const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // Only alert once every 15 minutes per inactive shift

export function SmartInactivityMonitor({ userRole, userEmail }: { userRole: string; userEmail: string }) {
  const { data: timesheets = [] } = useTimesheets();
  const { data: heartbeatRows = [] } = useKVByPrefix('tracker_heartbeat_');
  const { data: allProfiles = [] } = useProfiles();

  useEffect(() => {
    // Only HR and Admin need real-time tracker inactivity alerts
    if (!['hr', 'admin'].includes(userRole)) return;
    if (!timesheets.length || !heartbeatRows.length) return;

    const interval = setInterval(async () => {
      const now = Date.now();
      const heartbeatsMap = new Map<string, number>();

      heartbeatRows.forEach(row => {
        const hb = row.value;
        if (hb && hb.employeeEmail && hb.lastHeartbeat) {
          const emailKey = hb.employeeEmail.toLowerCase();
          const time = new Date(hb.lastHeartbeat).getTime();
          const existing = heartbeatsMap.get(emailKey) || 0;
          if (time > existing) heartbeatsMap.set(emailKey, time);
        }
      });

      // Find all currently clocked-in (open) shifts
      const openShifts = timesheets.filter(t => !t.clockOut);

      for (const shift of openShifts) {
        const empEmail = shift.employeeEmail.toLowerCase();
        const lastHb = heartbeatsMap.get(empEmail);
        const shiftStart = new Date(shift.clockIn).getTime();

        // Give a 5-minute grace period after clock-in before alerting
        if (now - shiftStart < 5 * 60 * 1000) continue;

        // If no heartbeat recorded OR heartbeat is older than 3 minutes
        const isStale = !lastHb || (now - lastHb > HEARTBEAT_STALE_MS);

        if (isStale) {
          const emp = allProfiles.find(p => p.email.toLowerCase() === empEmail);
          const empName = emp ? emp.fullName : empEmail;

          // Check alert cooldown key in session storage to avoid spam
          const alertKey = `inactivity_alert_${empEmail}`;
          const lastAlertTime = parseInt(sessionStorage.getItem(alertKey) || '0', 10);

          if (now - lastAlertTime > ALERT_COOLDOWN_MS) {
            sessionStorage.setItem(alertKey, now.toString());

            const minsInactive = lastHb ? Math.floor((now - lastHb) / 60000) : '5+';
            const alertMsg = `⚠️ Tracker Alert: ${empName} is currently clocked in but screen tracking has been inactive for ${minsInactive} min(s).`;

            // Broadcast notification to HR/Admin & send Push Notification
            await hrActions.addNotification(
              'all',
              userRole as 'hr' | 'admin',
              alertMsg,
              'shift',
              `Tracker Inactivity Alert: ${empName}`
            );
          }
        }
      }
    }, 60000); // Check every 60 seconds

    return () => clearInterval(interval);
  }, [userRole, userEmail, timesheets, heartbeatRows, allProfiles]);

  return null;
}
