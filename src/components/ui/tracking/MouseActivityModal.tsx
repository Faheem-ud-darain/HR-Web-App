'use client';

import { StatusDot } from '@/components/ui/StatusDot';
import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { displayName, Profile, InactivityLog } from '@/lib/hrData';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, THead, Th, TBody, Tr, Td } from '@/components/ui/Table';
import { formatTimeNY } from '@/lib/timezone';
import { formatDuration, localDateString } from '@/lib/core/trackingWindow';

interface MouseActivityModalProps {
  mouseEmp: Profile | null;
  setMouseEmp: React.Dispatch<React.SetStateAction<Profile | null>>;
  role: "admin" | "hr" | "team_lead";
  handleMouseRangeChange: (range: "day" | "week" | "month") => void;
  mouseRange: "day" | "week" | "month";
  mouseDay: string;
  handleMouseDayChange: (day: string) => void;
  mouseLoading: boolean;
  mouseShiftSeconds: number;
  mouseTotalSeconds: number;
  mouseActiveSeconds: number;
  mouseLogs: InactivityLog[];
  mouseLongestSeconds: number;
  mouseAvgSeconds: number;
  mouseLogsByDay: () => { day: string; logs: InactivityLog[]; totalSeconds: number; }[];
}

export function MouseActivityModal({ mouseEmp, setMouseEmp, role, handleMouseRangeChange, mouseRange, mouseDay, handleMouseDayChange, mouseLoading, mouseShiftSeconds, mouseTotalSeconds, mouseActiveSeconds, mouseLogs, mouseLongestSeconds, mouseAvgSeconds, mouseLogsByDay }: MouseActivityModalProps) {
  return (
    <Modal isOpen={!!mouseEmp} onClose={() => setMouseEmp(null)} title={mouseEmp ? `Mouse Activity — ${displayName(mouseEmp, role)}` : 'Mouse Activity'}>
      {mouseEmp && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => handleMouseRangeChange('day')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors transition-shadow ${mouseRange === 'day' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                >
                  Daily
                </button>
                <button
                  onClick={() => handleMouseRangeChange('week')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors transition-shadow ${mouseRange === 'week' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                >
                  Weekly
                </button>
                <button
                  onClick={() => handleMouseRangeChange('month')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors transition-shadow ${mouseRange === 'month' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                >
                  Monthly
                </button>
              </div>
              {mouseRange === 'day' && (
                <Input
                  type="date"
                  value={mouseDay}
                  max={localDateString()}
                  onChange={e => handleMouseDayChange(e.target.value)}
                  fieldSize="md"
                />
              )}
            </div>
          </div>
    
          {mouseLoading ? (
            <p className="text-center text-slate-400 text-xs font-semibold py-10">Loading mouse activity…</p>
          ) : (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-slate-800">{mouseShiftSeconds > 0 ? formatDuration(mouseShiftSeconds) : '—'}</p>
                  <p className="text-caption text-slate-500 font-bold uppercase tracking-wider mt-0.5">Shift Time</p>
                </div>
                <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-amber-800">{formatDuration(mouseTotalSeconds)}</p>
                  <p className="text-caption text-amber-600 font-bold uppercase tracking-wider mt-0.5">Total Inactive</p>
                </div>
                <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3 text-center" title="Shift Time minus Total Inactive">
                  <p className="text-sm font-bold text-emerald-800">{mouseShiftSeconds > 0 ? formatDuration(mouseActiveSeconds) : '—'}</p>
                  <p className="text-caption text-emerald-600 font-bold uppercase tracking-wider mt-0.5">Active Time</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-slate-800">{mouseLogs.length}</p>
                  <p className="text-caption text-slate-500 font-bold uppercase tracking-wider mt-0.5">Events</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-slate-800">{mouseLogs.length ? formatDuration(mouseLongestSeconds) : '—'}</p>
                  <p className="text-caption text-slate-500 font-bold uppercase tracking-wider mt-0.5">Longest Stretch</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-slate-800">{mouseLogs.length ? formatDuration(mouseAvgSeconds) : '—'}</p>
                  <p className="text-caption text-slate-500 font-bold uppercase tracking-wider mt-0.5">Average / Event</p>
                </div>
              </div>
    
              {/* Active vs Inactive proportion — simple stacked bar, no
                  charting library needed (this app has none installed;
                  plain divs keep it dependency-free). */}
              {mouseShiftSeconds > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-caption font-bold uppercase tracking-wider text-slate-400">
                    <span>Active vs Inactive (this period)</span>
                    <span>{Math.round((mouseActiveSeconds / mouseShiftSeconds) * 100)}% active</span>
                  </div>
                  <div className="w-full h-4 rounded-full overflow-hidden flex bg-slate-100 border border-slate-200">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${Math.max(0, Math.min(100, (mouseActiveSeconds / mouseShiftSeconds) * 100))}%` }}
                      title={`Active: ${formatDuration(mouseActiveSeconds)}`}
                    />
                    <div
                      className="h-full bg-amber-400"
                      style={{ width: `${Math.max(0, Math.min(100, (mouseTotalSeconds / mouseShiftSeconds) * 100))}%` }}
                      title={`Inactive: ${formatDuration(mouseTotalSeconds)}`}
                    />
                  </div>
                  <div className="flex items-center gap-4 text-caption font-semibold text-slate-500">
                    <span className="flex items-center gap-1"><StatusDot tone="emerald" size="sm" /> Active</span>
                    <span className="flex items-center gap-1"><StatusDot tone="amber" size="sm" /> Inactive</span>
                  </div>
                </div>
              )}
    
              {/* Inactive time per day — bar chart, oldest to newest left to
                  right. On the Daily view this is a single bar; on
                  Weekly/Monthly it makes patterns (e.g. always sluggish on
                  a particular day) easy to spot at a glance. */}
              {mouseLogs.length > 0 && (() => {
                const chronological = [...mouseLogsByDay()].reverse();
                const maxSeconds = Math.max(...chronological.map(g => g.totalSeconds), 1);
                return (
                  <div className="space-y-1.5">
                    <p className="text-caption font-bold uppercase tracking-wider text-slate-400">Inactive Time by Day</p>
                    <div className="flex items-end gap-2 h-28 border-b border-slate-200 pb-1 overflow-x-auto">
                      {chronological.map(group => (
                        <div key={group.day} className="flex flex-col items-center gap-1 min-w-[2.5rem] shrink-0" title={`${group.day}: ${formatDuration(group.totalSeconds)}`}>
                          <span className="text-caption font-bold text-amber-700">{formatDuration(group.totalSeconds)}</span>
                          <div
                            className="w-6 bg-amber-400 rounded-t-sm"
                            style={{ height: `${Math.max(4, (group.totalSeconds / maxSeconds) * 80)}px` }}
                          />
                          <span className="text-caption font-semibold text-slate-400 whitespace-nowrap">{group.day.replace(/, \d{4}$/, '')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
    
              {/* Detailed breakdown — grouped by day so Weekly/Monthly still
                  show clearly "when" each stretch happened, not just a flat
                  list. On the Daily view this collapses to a single group. */}
              {mouseLogs.length === 0 ? (
                <EmptyState py={10} size="xs">
                  No mouse inactivity of 3+ minutes recorded in this period.
                </EmptyState>
              ) : (
                <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                  {mouseLogsByDay().map(group => (
                    <div key={group.day} className="space-y-1.5">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                        <p className="text-caption font-bold text-slate-700 uppercase tracking-wider">{group.day}</p>
                        <p className="text-caption font-bold text-amber-700">{formatDuration(group.totalSeconds)} total</p>
                      </div>
                      <Table size="xs" density="tight">
                        <THead className="text-caption text-slate-400">
                          <tr>
                            <Th>Start</Th>
                            <Th>End</Th>
                            <Th align="right">Duration</Th>
                            <Th align="right">Device</Th>
                          </tr>
                        </THead>
                        <TBody>
                          {group.logs.map(log => (
                            <Tr key={log.id}>
                              <Td className="font-semibold text-slate-700">{formatTimeNY(log.startAt)}</Td>
                              <Td className="font-semibold text-slate-700">{formatTimeNY(log.endAt)}</Td>
                              <Td align="right" className="font-bold text-amber-700">{formatDuration(log.durationSeconds)}</Td>
                              <Td align="right" className="text-slate-400 text-caption">{log.deviceLabel || '—'}</Td>
                            </Tr>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
