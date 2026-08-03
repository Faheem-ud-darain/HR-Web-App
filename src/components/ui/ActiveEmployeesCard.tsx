'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { Zap, Clock } from 'lucide-react';
import { Profile, TimesheetEntry, displayName, formatDurationBetween, localShiftDate } from '@/lib/hrData';
import { smoothLinePath, smoothAreaPath } from '@/lib/sparkline';
import { formatTimeNY, APP_TIMEZONE } from '@/lib/timezone';

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
  const maxCount = Math.max(1, ...counts);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Chart geometry — small enough to sit inside a stat tile alongside the
  // headcount, big enough the trend is still legible. topPad keeps the
  // line's peak off the very top edge instead of jamming into it.
  const chartW = 132;
  const chartH = 40;
  const topPad = 6;
  const pointGap = chartW / (counts.length - 1);
  const pointX = (i: number) => i * pointGap;
  const pointY = (count: number) => topPad + (1 - count / maxCount) * (chartH - topPad);
  const linePoints = counts.map((c, i) => ({ x: pointX(i), y: pointY(c) }));
  const smoothPath = smoothLinePath(linePoints);
  const areaPath = smoothAreaPath(linePoints, chartH);
  const todayPoint = linePoints[linePoints.length - 1];

  return (
    <>
      <Card
        onClick={() => setIsOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(true); } }}
        className="cursor-pointer"
      >
        <CardContent className="pt-4 md:pt-5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] md:text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                Active Employees Now
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
              </p>
              <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">{activeEntries.length}</p>
            </div>
            <div className="h-10 w-10 md:h-11 md:w-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
              <Zap className="h-4 w-4 md:h-5 md:w-5" />
            </div>
          </div>

          <div className="relative mt-2">
            <svg viewBox={`0 0 ${chartW} ${chartH + 2}`} className="w-full h-10" preserveAspectRatio="none">
              <defs>
                <linearGradient id="activeEmployeesAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#activeEmployeesAreaFill)" className="chart-area-fill" />
              <path
                d={smoothPath}
                fill="none"
                stroke="#f97316"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                className="chart-line-draw"
              />
              <circle cx={todayPoint.x} cy={todayPoint.y} r={2.75} fill="#f97316" stroke="#fff" strokeWidth={1.25} className="chart-dot-today" />
              {hoveredIndex !== null && hoveredIndex !== linePoints.length - 1 && (
                <circle
                  cx={linePoints[hoveredIndex].x}
                  cy={linePoints[hoveredIndex].y}
                  r={2.75}
                  fill="#f97316"
                  stroke="#fff"
                  strokeWidth={1.25}
                  className="chart-hover-dot"
                />
              )}
              {/* Invisible, generously-sized hit targets — the visible dots above
                  are too small to reliably hover/tap on their own. Pointer events
                  cover mouse hover on desktop and tap on touch devices in one
                  handler; the click handler also toggles (so tapping the same
                  point again on mobile dismisses the tooltip) and stops
                  propagation so it doesn't also trigger the card's own onClick
                  (which opens the roster modal). */}
              {linePoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={9}
                  fill="transparent"
                  onPointerEnter={() => setHoveredIndex(i)}
                  onPointerLeave={() => setHoveredIndex(prev => (prev === i ? null : prev))}
                  onClick={e => { e.stopPropagation(); setHoveredIndex(prev => (prev === i ? null : i)); }}
                  style={{ cursor: 'pointer' }}
                />
              ))}
            </svg>
            {hoveredIndex !== null && (
              <div
                className="absolute z-10 pointer-events-none chart-tooltip-in"
                style={{ left: `${(linePoints[hoveredIndex].x / chartW) * 100}%`, top: '50%' }}
              >
                <div className="bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg whitespace-nowrap">
                  <span className="text-slate-300 font-semibold mr-1">{dayInfos[hoveredIndex].label}</span>
                  {counts[hoveredIndex]} shift{counts[hoveredIndex] === 1 ? '' : 's'}
                </div>
              </div>
            )}
          </div>
          <p className="text-[9px] text-slate-400 font-semibold mt-0.5">Shifts started, last 7 days</p>
        </CardContent>
      </Card>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={`Active Employees (${activeRoster.length})`}>
        {activeRoster.length === 0 ? (
          <p className="text-xs text-slate-400 font-semibold italic text-center py-8">No one is currently clocked in.</p>
        ) : (
          <div className="space-y-1.5">
            {activeRoster.map(({ entry, profile }) => (
              <div key={entry.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50">
                <Avatar src={profile?.profilePicture} name={profile?.fullName || entry.employeeEmail} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 truncate">
                    {profile ? displayName(profile, viewerRole) : entry.employeeEmail}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">{profile?.jobTitle || profile?.role || entry.employeeEmail}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-emerald-700 flex items-center gap-1 justify-end">
                    <Clock className="h-3 w-3" /> {formatDurationBetween(entry.clockIn, new Date().toISOString())}
                  </p>
                  <p className="text-[9px] text-slate-400 font-semibold">
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
