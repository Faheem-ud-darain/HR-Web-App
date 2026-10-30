import React from 'react';
import type { ChangelogPreviewKind } from '@/lib/core/changelog';

// The small looping animation at the top of a What's New card, drawn with the app's own colours (so it follows dark mode and never
// goes stale like a screenshot). Keyframes live in globals.css.
const LOOP = '3.6s ease-in-out infinite';

function Stack() {
  const card = 'absolute inset-x-6 h-14 rounded-xl border border-slate-200 bg-card p-3 shadow-sm';
  return (
    <div className="relative h-24 w-full max-w-56">
      <div className={`${card} top-9 opacity-60`} style={{ animation: `cl-stack-next ${LOOP}` }} />
      <div className={`${card} top-6`} style={{ animation: `cl-stack-top ${LOOP}` }}>
        <div className="h-2 w-16 rounded bg-slate-300" /><div className="mt-2 h-2 w-24 rounded bg-slate-200" />
      </div>
    </div>
  );
}

function Dates() {
  return (
    <div className="w-full max-w-56 space-y-2">
      <div className="grid grid-cols-5 gap-1.5">
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-9 rounded-lg border border-slate-200 bg-card" />)}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        <div className="col-span-2 h-3 rounded-full bg-orange-500" style={{ animation: `cl-dates-move ${LOOP}` }} />
      </div>
    </div>
  );
}

function ReadMore() {
  return (
    <div className="relative h-24 w-full max-w-56 overflow-hidden rounded-xl border border-slate-200 bg-card p-3">
      <div className="h-2 w-24 rounded bg-slate-300" />
      <div className="mt-2 h-2 w-full rounded bg-slate-200" />
      <div className="mt-1.5 h-2 w-3/4 rounded bg-slate-200" />
      <div className="mt-2 h-2 w-14 rounded bg-orange-400" />
      <div className="absolute inset-x-0 bottom-0 h-16 rounded-t-xl border-t border-slate-200 bg-slate-50 p-3" style={{ animation: `cl-sheet-up ${LOOP}` }}>
        <div className="h-2 w-full rounded bg-slate-300" /><div className="mt-1.5 h-2 w-full rounded bg-slate-300" />
      </div>
    </div>
  );
}

const PREVIEWS: Record<ChangelogPreviewKind, () => React.JSX.Element> = { stack: Stack, dates: Dates, readmore: ReadMore };

export function ChangelogPreview({ kind }: { kind: ChangelogPreviewKind }) {
  const Preview = PREVIEWS[kind];
  return (
    <div aria-hidden="true" className="flex h-40 items-center justify-center overflow-hidden bg-slate-100 px-4">
      <Preview />
    </div>
  );
}
