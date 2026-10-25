'use client';

import React from 'react';
import { Button } from './Button';

type LoadMoreHistoryProps = {
  /** How many days of history are currently loaded. */
  days: number;
  /** Called to widen the window (the caller bumps `days`). */
  onLoadMore: () => void;
  /** Stop offering more past this many days. */
  maxDays?: number;
  loading?: boolean;
  noun?: string;
  className?: string;
};

// History pages load a recent window (e.g. the last 60–90 days) instead of the
// whole table. This tells the user what's on screen and lets them reach back.
export function LoadMoreHistory({ days, onLoadMore, maxDays = 365, loading = false, noun = 'records', className = '' }: LoadMoreHistoryProps) {
  const atMax = days >= maxDays;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600 ${className}`.trim()}>
      <span className="font-semibold">
        {days >= 365 * 20 ? `Showing all ${noun}.` : `Showing ${noun} from the last ${days} days${atMax ? ' (maximum range)' : ''}.`}
      </span>
      {!atMax && (
        <Button variant="outline" size="sm" loading={loading} onClick={onLoadMore}>
          Load older {noun}
        </Button>
      )}
    </div>
  );
}
