import React from 'react';
import { Tr, Td } from './Table';

// Loading placeholders. Pages used to show an empty state ("No leave requests
// found") or nothing at all while their data was still on the wire, which
// reads as "there is no data". These keep the layout stable and say "loading".
// Pulse is disabled for users who prefer reduced motion.

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse motion-reduce:animate-none rounded-md bg-slate-200/70 ${className}`} />;
}

// Wrap a skeleton group so assistive tech announces one "Loading" instead of
// reading each bar.
export function LoadingRegion({ label = 'Loading', className = '', children }: { label?: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

// Matches StatCard's footprint (label, value, caption).
export function StatCardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`bg-white border border-slate-200 rounded-xl p-5 ${className}`}>
      <Skeleton className="h-2.5 w-24" />
      <Skeleton className="h-7 w-32 mt-3" />
      <Skeleton className="h-2.5 w-40 mt-2.5" />
    </div>
  );
}

export function StatCardSkeletonGrid({ count = 3, className = 'grid grid-cols-1 sm:grid-cols-3 gap-4' }: { count?: number; className?: string }) {
  return (
    <LoadingRegion label="Loading summary" className={className}>
      {Array.from({ length: count }, (_, i) => <StatCardSkeleton key={i} />)}
    </LoadingRegion>
  );
}

// Drop inside <TBody> while rows load. `widths` varies the bars so the table
// reads as real content rather than a uniform stripe.
const WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-1/3', 'w-5/6'];
export function TableSkeletonRows({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <Tr key={r} interactive={false} aria-hidden="true">
          {Array.from({ length: cols }, (_, c) => (
            <Td key={c} align={c === 0 ? 'left' : 'center'}>
              <Skeleton className={`h-3.5 ${c === 0 ? 'w-3/4' : WIDTHS[(r + c) % WIDTHS.length]} ${c === 0 ? '' : 'mx-auto'}`} />
            </Td>
          ))}
        </Tr>
      ))}
    </>
  );
}

// Stacked list rows (cards on mobile, side panels, ticket lists).
export function ListSkeleton({ rows = 4, className = '' }: { rows?: number; className?: string }) {
  return (
    <LoadingRegion label="Loading list" className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-3/4" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  );
}

// App-shell placeholder shown while the dashboard layout resolves the session
// and loads the signed-in profile (replaces the full-screen spinner so the
// page frame appears immediately).
export function DashboardSkeleton() {
  return (
    <LoadingRegion label="Loading dashboard" className="flex h-screen bg-slate-50">
      <aside className="hidden md:flex w-60 shrink-0 flex-col gap-3 border-r border-slate-200 bg-white p-4">
        <Skeleton className="h-8 w-32" />
        <div className="mt-4 space-y-2.5">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 md:h-16 md:px-6">
          <Skeleton className="h-8 w-full max-w-md rounded-full" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>
        <main className="space-y-6 overflow-hidden p-4 md:p-6">
          <div className="space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-3 w-80 max-w-full" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => <StatCardSkeleton key={i} />)}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-5 w-full" />)}
          </div>
        </main>
      </div>
    </LoadingRegion>
  );
}
