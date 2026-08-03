'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { Clock } from 'lucide-react';
import { Profile, TimesheetEntry, displayName, localShiftDate } from '@/lib/hrData';
import { smoothLinePath, smoothAreaPath } from '@/lib/sparkline';
import { APP_TIMEZONE } from '@/lib/timezone';

interface AvgHoursWorkedCardProps {
  employees: Profile[];
  timesheets: TimesheetEntry[];
  viewerRole: 'hr' | 'admin';
}

// Replaces the old Tasks-based stat card (Active Tasks on HR, High Priority
// Tasks on Admin) — task assignment isn't a feature employees actually use
// day to day, so that number never meant anything. Attendance is: every
// employee clocks in/out through hr_timesheets, so a real workload signal
// (average completed shift length, last 7 days) lives here instead.
//
// Only *completed* shifts (clockOut present) count toward the average —
// an in-progress shift's duration is still growing and would understate or
// overstate the real average depending on when you happen to look, so it's
// excluded the same way ActiveEmployeesCard keeps "currently on shift" and
// "shift history" as separate concerns.
function minutesBetween(startISO: string, endISO: string): number {
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
  return Math.max(0, Math.round(ms / 60000));
}

function formatHoursShort(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return `${h}h ${m}m`;
}

export function AvgHoursWorkedCard({ employees, timesheets, viewerRole }: AvgHoursWorkedCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  // `date` on a TimesheetEntry is a UTC "YYYY-MM-DD" string fixed at
  // whatever calendar day it happened to be, in UTC, the instant clockIn()
  // wrote the record — it does not re-derive relative to whoever's looking
  // at this card. An employee who clocks in/out during their evening can
  // land on a different UTC calendar day than the HR/Admin viewer's own
  // "today," which would silently drop a real, recent shift out of this
  // 7-day window (or shift it into the wrong daily bucket below). So both
  // the day labels and every per-entry day check use localShiftDate
  // (viewer's own local calendar day, derived from the real clockIn
  // timestamp) instead of trusting the raw `date` field — same reasoning
  // as every other "Date" column in this app.
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
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const completedLast7 = useMemo(
    () => timesheets.filter(t => t.clockOut && days.includes(localShiftDate(t.clockIn, t.date))),
    [timesheets, days]
  );

  const overallAvgMinutes = useMemo(() => {
    if (completedLast7.length === 0) return 0;
    const total = completedLast7.reduce((sum, t) => sum + minutesBetween(t.clockIn, t.clockOut as string), 0);
    return total / completedLast7.length;
  }, [completedLast7]);

  // Daily average (minutes) for the sparkline — a day with no completed
  // shifts renders as a zero-height bar rather than being skipped, so the
  // 7-bar cadence always lines up with `days`.
  const dailyAvgMinutes = useMemo(() => {
    return days.map(day => {
      const shifts = completedLast7.filter(t => localShiftDate(t.clockIn, t.date) === day);
      if (shifts.length === 0) return 0;
      return shifts.reduce((sum, t) => sum + minutesBetween(t.clockIn, t.clockOut as string), 0) / shifts.length;
    });
  }, [days, completedLast7]);
  // Tracked separately from dailyAvgMinutes so the hover tooltip can tell
  // "no completed shifts that day" apart from "a genuinely ~0-minute avg,"
  // both of which would otherwise just show as 0.
  const dailyShiftCounts = useMemo(
    () => days.map(day => completedLast7.filter(t => localShiftDate(t.clockIn, t.date) === day).length),
    [days, completedLast7]
  );

  const maxMinutes = Math.max(1, ...dailyAvgMinutes);

  const chartW = 132;
  const chartH = 40;
  const topPad = 6; // keeps the line's peak off the very top edge — a bit of headroom
  const pointGap = chartW / (dailyAvgMinutes.length - 1);
  const pointX = (i: number) => i * pointGap;
  const pointY = (mins: number) => topPad + (1 - mins / maxMinutes) * (chartH - topPad);
  const linePoints = dailyAvgMinutes.map((m, i) => ({ x: pointX(i), y: pointY(m) }));
  const smoothPath = smoothLinePath(linePoints);
  const areaPath = smoothAreaPath(linePoints, chartH);
  const todayPoint = linePoints[linePoints.length - 1];

  // Per-employee breakdown for the modal — total hours and shift count over
  // the same 7-day window, most hours first. This is the part HR/Admin
  // actually want to click into: who's carrying the most hours, who's
  // barely clocking any.
  const perEmployee = useMemo(() => {
    const byEmail = new Map<string, { minutes: number; shifts: number }>();
    for (const t of completedLast7) {
      const key = t.employeeEmail.toLowerCase();
      const entry = byEmail.get(key) || { minutes: 0, shifts: 0 };
      entry.minutes += minutesBetween(t.clockIn, t.clockOut as string);
      entry.shifts += 1;
      byEmail.set(key, entry);
    }
    return Array.from(byEmail.entries())
      .map(([email, { minutes, shifts }]) => ({
        email,
        minutes,
        shifts,
        avgMinutes: minutes / shifts,
        profile: employees.find(e => e.email.toLowerCase() === email) || null,
      }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [completedLast7, employees]);

  const maxEmployeeMinutes = Math.max(1, ...perEmployee.map(p => p.minutes));

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
              <p className="text-[10px] md:text-xs font-semibold text-slate-500">Avg Hours Worked</p>
              <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">
                {completedLast7.length === 0 ? '—' : formatHoursShort(overallAvgMinutes)}
              </p>
            </div>
            <div className="h-10 w-10 md:h-11 md:w-11 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600 shrink-0">
              <Clock className="h-4 w-4 md:h-5 md:w-5" />
            </div>
          </div>

          <div className="relative mt-2">
            <svg viewBox={`0 0 ${chartW} ${chartH + 2}`} className="w-full h-10" preserveAspectRatio="none">
              <defs>
                <linearGradient id="avgHoursAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#avgHoursAreaFill)" className="chart-area-fill" />
              <path
                d={smoothPath}
                fill="none"
                stroke="#0ea5e9"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                className="chart-line-draw"
              />
              <circle cx={todayPoint.x} cy={todayPoint.y} r={2.75} fill="#0ea5e9" stroke="#fff" strokeWidth={1.25} className="chart-dot-today" />
              {hoveredIndex !== null && hoveredIndex !== linePoints.length - 1 && (
                <circle
                  cx={linePoints[hoveredIndex].x}
                  cy={linePoints[hoveredIndex].y}
                  r={2.75}
                  fill="#0ea5e9"
                  stroke="#fff"
                  strokeWidth={1.25}
                  className="chart-hover-dot"
                />
              )}
              {/* Invisible, generously-sized hit targets — see the matching
                  comment in ActiveEmployeesCard.tsx for why pointer events +
                  a toggling click (with stopPropagation) cover both desktop
                  hover and mobile tap without also opening the roster modal. */}
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
                  {dailyShiftCounts[hoveredIndex] === 0
                    ? 'No completed shifts'
                    : `${formatHoursShort(dailyAvgMinutes[hoveredIndex])} avg · ${dailyShiftCounts[hoveredIndex]} shift${dailyShiftCounts[hoveredIndex] === 1 ? '' : 's'}`}
                </div>
              </div>
            )}
          </div>
          <p className="text-[9px] text-slate-400 font-semibold mt-0.5">Avg shift length per day, last 7 days</p>
        </CardContent>
      </Card>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Hours Worked (Last 7 Days)">
        {perEmployee.length === 0 ? (
          <p className="text-xs text-slate-400 font-semibold italic text-center py-8">No completed shifts in the last 7 days.</p>
        ) : (
          <div className="space-y-1.5">
            {perEmployee.map(({ email, minutes, shifts, avgMinutes, profile }, i) => (
              <div key={email} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50">
                <Avatar src={profile?.profilePicture} name={profile?.fullName || email} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 truncate">
                    {profile ? displayName(profile, viewerRole) : email}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {shifts} shift{shifts === 1 ? '' : 's'} &middot; avg {formatHoursShort(avgMinutes)}/shift
                  </p>
                  <div className="hbar-track mt-1.5">
                    <div
                      className="hbar-fill"
                      style={{
                        width: `${Math.max(3, (minutes / maxEmployeeMinutes) * 100)}%`,
                        animationDelay: `${i * 45}ms`,
                      }}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-sky-700">{formatHoursShort(minutes)}</p>
                  <p className="text-[9px] text-slate-400 font-semibold">total</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
