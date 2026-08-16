'use client';

// Employee-facing "My Activity" tab (Tracker page) — daily inactivity vs.
// active time, an animated week-view chart, and a per-day breakdown of
// individual idle stretches. Scoped strictly to the logged-in employee's own
// email; this is a read-only self-service view, no HR/Admin data crosses
// into it.
//
// Deliberately NOT fetched on login/page mount — this component only exists
// in the tree (and only fires its data fetch) once the employee actually
// clicks into the "My Activity" tab on the Tracker page (see
// employee/tracker/page.tsx's activeTab state). The one 7-day
// getInactivityLogs() call this makes is the only genuinely new network
// request this feature adds; shift/timesheet data is passed in as a prop
// from data the Tracker page already loads for its existing Shift History
// tab, so no second timesheet fetch is introduced here.
//
// Chart follows this app's existing status-color language rather than
// inventing a new palette: emerald for "active" (already used for
// Active/Present/On Shift badges everywhere else in the app) and amber for
// "inactivity" (already used for Paused/Pending). Bars animate from 0 to
// their real height on mount/data-load, a table view is available as a
// non-visual fallback, and a legend + per-bar hover tooltip are always
// present since this chart has two series.

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { hrActions, InactivityLog, TimesheetEntry } from '@/lib/hrData';
import { getNYDateString, getNYMidnight, formatShortDateNY, formatTimeNY } from '@/lib/timezone';
import { Activity, MousePointerClick, Table2, BarChart3, Clock } from 'lucide-react';

interface EmployeeActivityInsightsProps {
  employeeEmail: string;
  timesheets: TimesheetEntry[];
}

interface DayBucket {
  date: string; // YYYY-MM-DD (NY calendar day)
  label: string; // "Mon 11"
  shiftSeconds: number;
  inactiveSeconds: number;
  activeSeconds: number;
  logs: InactivityLog[];
}

const HISTORY_DAYS = 7; // hard cap — "employee can see only one week of history"

function secondsToHM(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Seconds of shift overlap between a single NY calendar day and this
// employee's timesheet entries — same overlap-based approach TrackingView.tsx
// uses for its HR-facing range totals, just narrowed to exactly one day so a
// shift that crosses midnight only counts the portion actually inside it.
function shiftSecondsForDay(timesheets: TimesheetEntry[], dateStr: string): number {
  const dayStart = getNYMidnight(dateStr).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const now = Date.now();
  return timesheets.reduce((sum, t) => {
    if (!t.clockIn) return sum;
    const start = new Date(t.clockIn).getTime();
    const end = t.clockOut ? new Date(t.clockOut).getTime() : now;
    const overlapStart = Math.max(start, dayStart);
    const overlapEnd = Math.min(end, dayEnd);
    return sum + Math.max(0, overlapEnd - overlapStart) / 1000;
  }, 0);
}

export function EmployeeActivityInsights({ employeeEmail, timesheets }: EmployeeActivityInsightsProps) {
  const [logs, setLogs] = useState<InactivityLog[] | null>(null); // null = not fetched yet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDay, setSelectedDay] = useState<string>(() => getNYDateString());
  const [showTable, setShowTable] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Fires exactly once, the first time this component is actually mounted
  // (i.e. the employee clicked the "My Activity" tab) — never on page load.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const until = new Date();
    // Bug fix: this used to compute `since` as a flat "now minus 7*24h"
    // instant, which doesn't line up with NY calendar-day boundaries — if
    // the tab is opened any time other than exactly midnight NY, that
    // instant lands partway through what should be the oldest of the 7
    // included days, silently dropping that day's earliest inactivity
    // logs from the total. Anchoring `since` to the actual NY midnight of
    // the oldest included calendar day (today - (HISTORY_DAYS - 1)) makes
    // the fetch window match the 7 calendar days `days` below actually
    // buckets logs into.
    const oldestDay = new Date();
    oldestDay.setDate(oldestDay.getDate() - (HISTORY_DAYS - 1));
    const since = getNYMidnight(getNYDateString(oldestDay));
    hrActions.getInactivityLogs({ employeeEmail, sinceISO: since.toISOString(), untilISO: until.toISOString() })
      .then(result => { if (!cancelled) setLogs(result); })
      .catch(() => { if (!cancelled) setError("Couldn't load your activity data right now. Try again shortly."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeEmail]);

  // Trigger the bar-grow animation one tick after data actually lands, so
  // bars visibly grow from 0 instead of just appearing at full height.
  useEffect(() => {
    if (logs === null) return;
    setAnimateIn(false);
    const t = setTimeout(() => setAnimateIn(true), 30);
    return () => clearTimeout(t);
  }, [logs]);

  const days: DayBucket[] = useMemo(() => {
    const todayStr = getNYDateString();
    const out: DayBucket[] = [];
    for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = getNYDateString(d);
      const dayLogs = (logs || []).filter(l => getNYDateString(l.startAt) === dateStr);
      const inactiveSeconds = dayLogs.reduce((s, l) => s + l.durationSeconds, 0);
      const shiftSeconds = shiftSecondsForDay(timesheets, dateStr);
      out.push({
        date: dateStr,
        label: dateStr === todayStr ? 'Today' : formatShortDateNY(getNYMidnight(dateStr)),
        shiftSeconds,
        // Bug fix: this used to be `Math.min(inactiveSeconds, shiftSeconds)
        // || inactiveSeconds`, meant to cap idle time at the shift length —
        // but whenever shiftSeconds was 0 (no shift that day) and
        // inactiveSeconds was somehow > 0, Math.min(...) correctly clamped
        // to 0, and then `0 || inactiveSeconds` immediately undid that
        // clamp, since 0 is falsy in JS — silently reverting to the
        // uncapped raw value in exactly the case the cap existed for.
        // InactivityLog is only ever recorded during an active shift (see
        // its doc comment in hrData.ts), so inactiveSeconds should never
        // legitimately exceed shiftSeconds anyway — activeSeconds below
        // already handles the difference safely via Math.max(0, ...), so
        // no extra clamping is needed here at all.
        inactiveSeconds,
        activeSeconds: Math.max(0, shiftSeconds - inactiveSeconds),
        logs: dayLogs.sort((a, b) => a.startAt.localeCompare(b.startAt)),
      });
    }
    return out;
  }, [logs, timesheets]);

  const selectedBucket = days.find(d => d.date === selectedDay) || days[days.length - 1];
  const maxDayTotal = Math.max(1, ...days.map(d => d.shiftSeconds));

  if (loading) {
    return (
      <Card className="border border-slate-200 bg-white">
        <CardContent className="py-16 text-center space-y-2">
          <Activity className="h-8 w-8 text-slate-300 mx-auto animate-pulse" />
          <p className="text-xs font-semibold text-slate-400">Loading your activity history…</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border border-rose-200 bg-rose-50">
        <CardContent className="py-10 text-center text-xs font-semibold text-rose-700">{error}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Today snapshot */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <Card className="border border-slate-200 bg-white">
          <CardContent className="pt-5 pb-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" /> Active Today
            </p>
            <p className="text-xl md:text-2xl font-bold text-slate-900 mt-1">{secondsToHM(selectedBucket?.activeSeconds || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white">
          <CardContent className="pt-5 pb-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" /> Inactive Today
            </p>
            <p className="text-xl md:text-2xl font-bold text-slate-900 mt-1">{secondsToHM(selectedBucket?.inactiveSeconds || 0)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Week chart */}
      <Card className="border border-slate-200 bg-white p-0 overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-orange-500" /> Last 7 Days
            </h3>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Tap a day to see its breakdown below. Only your own last week is shown.</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Legend — two series, always shown */}
            <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Active</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Inactivity</span>
            </div>
            <button
              onClick={() => setShowTable(v => !v)}
              className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <Table2 className="h-3.5 w-3.5" /> {showTable ? 'Chart View' : 'Table View'}
            </button>
          </div>
        </div>

        <CardContent className="p-4 md:p-6">
          {showTable ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="font-bold text-slate-500 bg-slate-50 uppercase tracking-widest border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5">Day</th>
                    <th className="px-3 py-2.5 text-right">Active</th>
                    <th className="px-3 py-2.5 text-right">Inactive</th>
                    <th className="px-3 py-2.5 text-right">Idle Stretches</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {days.map(d => (
                    <tr key={d.date} className={`hover:bg-slate-50/50 transition-colors cursor-pointer ${d.date === selectedDay ? 'bg-orange-50/60' : ''}`} onClick={() => setSelectedDay(d.date)}>
                      <td className="px-3 py-2.5 font-bold text-slate-800">{d.label}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">{secondsToHM(d.activeSeconds)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-amber-700">{secondsToHM(d.inactiveSeconds)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-500">{d.logs.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-end justify-between gap-2 md:gap-4 h-48 px-1">
              {days.map((d, idx) => {
                const totalPx = 160; // chart plot height in px
                const activeH = d.shiftSeconds > 0 ? (d.activeSeconds / maxDayTotal) * totalPx : 0;
                const inactiveH = d.shiftSeconds > 0 ? (d.inactiveSeconds / maxDayTotal) * totalPx : 0;
                const isSelected = d.date === selectedDay;
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-2 group">
                    <div
                      className="relative w-full max-w-[36px] flex flex-col items-center justify-end cursor-pointer"
                      style={{ height: totalPx }}
                      onClick={() => setSelectedDay(d.date)}
                      onMouseEnter={() => setHoverIdx(idx)}
                      onMouseLeave={() => setHoverIdx(null)}
                    >
                      {hoverIdx === idx && (
                        <div className="absolute -top-14 z-10 bg-slate-900 text-white text-[10px] font-semibold rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                          <div>{d.label}</div>
                          <div className="text-emerald-300">Active {secondsToHM(d.activeSeconds)}</div>
                          <div className="text-amber-300">Inactive {secondsToHM(d.inactiveSeconds)}</div>
                        </div>
                      )}
                      {d.shiftSeconds === 0 ? (
                        <div className="w-full h-1 rounded-full bg-slate-100" />
                      ) : (
                        <div className={`w-full rounded-t-md rounded-b-md overflow-hidden flex flex-col justify-end ring-2 ${isSelected ? 'ring-orange-400' : 'ring-transparent'} transition-all`}>
                          {/* Inactivity segment on top, 2px gap from active segment below */}
                          <div
                            className="w-full bg-amber-500 transition-[height] duration-700 ease-out rounded-t-md"
                            style={{ height: animateIn ? Math.max(inactiveH, inactiveH > 0 ? 3 : 0) : 0, marginBottom: inactiveH > 0 && activeH > 0 ? 2 : 0 }}
                          />
                          <div
                            className="w-full bg-emerald-500 transition-[height] duration-700 ease-out rounded-b-md"
                            style={{ height: animateIn ? Math.max(activeH, activeH > 0 ? 3 : 0) : 0 }}
                          />
                        </div>
                      )}
                    </div>
                    <span className={`text-[10px] font-bold ${isSelected ? 'text-orange-600' : 'text-slate-500'}`}>{d.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected-day breakdown */}
      <Card className="border border-slate-200 bg-white p-0 overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
            <MousePointerClick className="h-3.5 w-3.5 text-orange-500" /> Breakdown — {selectedBucket?.label}
          </h3>
          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Every continuous stretch (3+ min) of no mouse activity during a tracked shift that day.</p>
        </div>
        <CardContent className="p-0">
          {(!selectedBucket || selectedBucket.logs.length === 0) ? (
            <div className="py-10 text-center space-y-1.5">
              <Clock className="h-7 w-7 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-500">No inactivity recorded on this day.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {selectedBucket.logs.map(l => (
                <div key={l.id} className="px-4 md:px-6 py-3 flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-600">{formatTimeNY(l.startAt)} → {formatTimeNY(l.endAt)}</span>
                  <span className="font-bold text-amber-700">{secondsToHM(l.durationSeconds)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
