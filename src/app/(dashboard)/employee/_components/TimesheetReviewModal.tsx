'use client';

import React from 'react';
import { displayName, localShiftDate, Profile, TimesheetEntry } from '@/lib/hrData';
import { Badge } from '@/components/ui/Badge';
import { TableScroll, Table, THead, Th, TBody, Tr, Td } from '@/components/ui/Table';
import { formatTimeNY } from '@/lib/timezone';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

interface TimesheetReviewModalProps {
  selectedReviewEmp: Profile;
  userProfile: Profile | null;
  reviewEntries: TimesheetEntry[];
  setSelectedReviewEmp: React.Dispatch<React.SetStateAction<Profile | null>>;
}

export function TimesheetReviewModal({ selectedReviewEmp, userProfile, reviewEntries, setSelectedReviewEmp }: TimesheetReviewModalProps) {
  return (
    <div className="space-y-6 pt-1 font-sans">
      <div className="flex justify-between items-start bg-slate-50 p-4 border border-slate-200 rounded-xl">
        <div>
          <p className="text-xs text-slate-500 font-semibold">Reviewing Employee</p>
          <p className="text-sm font-bold text-slate-900">{displayName(selectedReviewEmp, userProfile?.role)}</p>
          <p className="text-[10px] text-slate-500 font-bold">{selectedReviewEmp.email} · {selectedReviewEmp.jobTitle || 'Staff'}</p>
        </div>
        <Badge variant={selectedReviewEmp.region === 'USA' ? 'default' : 'success'}>
          {selectedReviewEmp.region === 'USA' ? 'USA Operations' : 'Pakistan Remote'}
        </Badge>
      </div>
    
      <div className="space-y-3">
        <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Real Shift History (Clock-In / Clock-Out)</h4>
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          {/* Desktop table */}
          <TableScroll hideOnMobile>
            <Table density="compact" size="xs">
              <THead>
                <tr>
                  <Th>Date</Th>
                  <Th>Clock In</Th>
                  <Th>Clock Out</Th>
                  <Th align="right">Duration</Th>
                  <Th align="right">Status</Th>
                </tr>
              </THead>
              <TBody>
                {reviewEntries.map((entry, idx) => (
                  <Tr key={idx}>
                    <Td className="font-bold text-slate-700">{localShiftDate(entry.clockIn, entry.date)}</Td>
                    <Td className="text-slate-600 font-medium font-mono text-[10px]">{entry.clockIn ? formatTimeNY(entry.clockIn) : '—'}</Td>
                    <Td className="text-slate-600 font-medium font-mono text-[10px]">{entry.clockOut ? formatTimeNY(entry.clockOut) : '—'}</Td>
                    <Td align="right" className="font-bold text-slate-900">{entry.duration || '—'}</Td>
                    <Td align="right">
                      <Badge variant={entry.status === 'in_progress' ? 'warning' : 'success'}>
                        {entry.status === 'in_progress' ? 'On Shift' : 'Completed'}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
                {reviewEntries.length === 0 && (
                  <Tr>
                    <EmptyState as="td" colSpan={5} py={6}>No real shift history recorded yet.</EmptyState>
                  </Tr>
                )}
              </TBody>
            </Table>
          </TableScroll>
          {/* Mobile card stack */}
          <div className="md:hidden space-y-2 p-3">
            {reviewEntries.map((entry, idx) => (
              <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-900">{localShiftDate(entry.clockIn, entry.date)}</p>
                  <Badge variant={entry.status === 'in_progress' ? 'warning' : 'success'}>
                    {entry.status === 'in_progress' ? 'On Shift' : 'Completed'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Clock In / Out</p>
                    <p className="text-xs font-semibold text-slate-700 font-mono">
                      {entry.clockIn ? formatTimeNY(entry.clockIn) : '—'}
                      {' → '}
                      {entry.clockOut ? formatTimeNY(entry.clockOut) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Duration</p>
                    <p className="text-xs font-bold text-slate-900">{entry.duration || '—'}</p>
                  </div>
                </div>
              </div>
            ))}
            {reviewEntries.length === 0 && (
              <EmptyState py={6} size="xs">No real shift history recorded yet.</EmptyState>
            )}
          </div>
        </div>
      </div>
      <div className="flex justify-end pt-4 border-t border-slate-200">
        <Button
          variant="secondary"
          size="md"
          onClick={() => setSelectedReviewEmp(null)}
        >
          Close Logs
        </Button>
      </div>
    </div>
  );
}
