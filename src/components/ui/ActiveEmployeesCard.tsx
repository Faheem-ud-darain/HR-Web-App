'use client';

import React, { useMemo, useState } from 'react';
import { StatCard } from '@/components/ui/StatCard';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { LightningIcon as Zap, ClockIcon as Clock } from '@phosphor-icons/react/dist/ssr';
import { Profile, TimesheetEntry, displayName, formatDurationBetween, localShiftDate } from '@/lib/hrData';
import { Sparkline } from '@/components/ui/Sparkline';
import { formatTimeNY, APP_TIMEZONE } from '@/lib/timezone';
import { EmptyState } from '@/components/ui/EmptyState';

interface ActiveEmployeesCardProps {
  employees: Profile[];
  timesheets: TimesheetEntry[];
  viewerRole: 'hr' | 'admin';
}

// Replaces the old "Team Leads" stat tile — a static headcount nobody ever
// clicked into. This one is live (derived from open, not-yet-clocked-out
// hr_timesheets rows — the same `status === 'in_progress'` concept the
// Reports pages already use for their "On Shift" badge, so it can't
// silently disagree with those about who's currently working) and doubles
// as an entry point into the actual roster, not just a number.
//
// The little sparkline is hand-built SVG, not a charting library — this
// app has no chart dependency installed, and a 7-point trend doesn't need
// one. A smoothed curve (src/lib/sparkline.ts) with a soft gradient fill
// underneath, fading in first; then the line draws itself in via a stroke
// animation (same pathLength=1 trick as SplashScreenOverlay.tsx's
// speech-bubble outline); then a single highlighted dot pops in at
// today's point. One shape, not bars-plus-line-plus-a-dot-per-day — that
// combination read as cluttered/busy at this size.
export function ActiveEmployeesCard({ employees, timesheets, viewerRole }: ActiveEmployeesCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeEntries = useMemo(
    () => timesheets.filter(t => t.status === 'in_progress'),
    [timesheets]
  );

  // Longest-running shift first — the people most likely to need a check-in
  // or a reminder to clock out are the most useful ones to see at the top,
  // not an arbitrary/insertion order.
  const activeRoster = useMemo(() => {
    return activeEntries
      .map(entry => ({
        entry,
        profile: employees.find(e => e.email.toLowerCase() === entry.employeeEmail.toLowerCase()) || null,
      }))
      .sort((a, b) => (a.entry.clockIn || '').localeCompare(b.entry.clockIn || ''));
  }, [activeEntries, employees]);

  // Last 7 calendar days' shift-start counts (today included) — a simple,
  // honest activity trend to sit behind the live headcount. `date` on a
  // TimesheetEntry is a UTC "YYYY-MM-DD" string fixed at whatever calendar
  // day it happened to be, in UTC, the instant clockIn() wrote the record —
  // it does NOT re-derive relative to whoever's looking at this chart. An
  // employee who clocks in during their evening can land on a different UTC
  // calendar day than the HR/Admin viewer's own "today," which would bucket
  // real, recent shifts into the wrong bar (or make "today" look empty even
  // with people currently on shift). So both the day labels below and the
  // per-entry bucketing use localShiftDate (viewer's own local calendar day,
  // derived from the real clockIn timestamp) instead of trusting the raw
  // `date` field — same reasoning as every other "Date" column in this app.
  // Label derived from the same local Date used to build the date string —
  // not re-parsed from the string afterward, which would risk a UTC/local
  // round-trip shifting the weekday by one near a timezone boundary.
  const dayInfos = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return {
        dateStr: localShiftDate(d.toISOString()),
        label: i === 6 ? 'Today' : d.toLocaleDateString('en-US', { timeZone: APP_TIMEZONE, weekday: 'short' }),
      };
    });
  }, []);
  const days = useMemo(() => dayInfos.map(d => d.dateStr), [dayInfos]);
  const counts = useMemo(
    () => days.map(day => timesheets.filter(t => localShiftDate(t.clockIn, t.date) === day).length),
    [days, timesheets]
  );


  return (
    <>
      <StatCard
        label="Active Employees Now"
        labelExtra={
          <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
        }
        value={activeEntries.length}
        size="xl"
        chip={{ icon: Zap, tone: 'emerald' }}
        onClick={() => setIsOpen(true)}
        sub="Shifts started, last 7 days"
      >
        <Sparkline
            values={counts}
            label={i => dayInfos[i].label}
            detail={i => `${counts[i]} shift${counts[i] === 1 ? '' : 's'}`}
            colorClass="text-orange-500"
          />
      </StatCard>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={`Active Employees (${activeRoster.length})`}>
        {activeRoster.length === 0 ? (
          <EmptyState py={8} size="xs">No one is currently clocked in.</EmptyState>
        ) : (
          <div className="space-y-1.5">
            {activeRoster.map(({ entry, profile }) => (
              <div key={entry.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50">
                <Avatar src={profile?.profilePicture} name={profile?.fullName || entry.employeeEmail} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 truncate">
                    {profile ? displayName(profile, viewerRole) : entry.employeeEmail}
                  </p>
                  <p className="text-caption text-slate-400 truncate">{profile?.jobTitle || profile?.role || entry.employeeEmail}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-emerald-700 flex items-center gap-1 justify-end">
                    <Clock className="h-3.5 w-3.5" /> {formatDurationBetween(entry.clockIn, new Date().toISOString())}
                  </p>
                  <p className="text-caption text-slate-400 font-semibold">
                    since {formatTimeNY(entry.clockIn)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
