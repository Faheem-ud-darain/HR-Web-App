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

// A sidebar and a few blocks that pop in one after another.
function Layout() {
  const block = (delay: number, cls: string) => <div className={`rounded-lg border border-slate-200 bg-card ${cls}`} style={{ animation: `cl-pop ${LOOP}`, animationDelay: `${delay}s` }} />;
  return (
    <div className="flex h-24 w-full max-w-56 gap-2">
      {block(0, 'w-7')}
      <div className="flex flex-1 flex-col gap-2">{block(0.2, 'h-5')}<div className="flex flex-1 gap-2">{block(0.4, 'flex-1')}{block(0.6, 'flex-1')}</div></div>
    </div>
  );
}

function Dashboard() {
  return (
    <div className="grid h-24 w-full max-w-56 grid-cols-2 gap-2">
      {[0, 0.25, 0.5, 0.75].map(d => <div key={d} className="rounded-xl border border-slate-200 bg-card p-2" style={{ animation: `cl-pop ${LOOP}`, animationDelay: `${d}s` }}><div className="h-1.5 w-8 rounded bg-slate-300" /><div className="mt-2 h-3 w-12 rounded bg-slate-200" /></div>)}
    </div>
  );
}

function Profile() {
  return (
    <div className="w-full max-w-56 space-y-2">
      <div className="flex items-center gap-2"><div className="h-9 w-9 rounded-full bg-slate-300" /><div className="space-y-1.5"><div className="h-2 w-20 rounded bg-slate-300" /><div className="h-2 w-14 rounded bg-slate-200" /></div></div>
      <div className="grid grid-cols-3 gap-1.5">{[0, 1, 2].map(i => <div key={i} className="h-6 rounded-lg border border-slate-200 bg-card" />)}</div>
      <div className="grid grid-cols-3 gap-1.5"><div className="h-1 rounded-full bg-orange-500" style={{ animation: `cl-tab ${LOOP}` }} /></div>
    </div>
  );
}

// A strip of photo cards drifting past, as on the landing page.
function Landing() {
  return (
    <div className="w-full max-w-56 overflow-hidden">
      <div className="mb-2 h-3 w-28 rounded bg-slate-300" />
      <div className="flex w-[200%] gap-2" style={{ animation: `cl-slide 6s linear infinite` }}>
        {Array.from({ length: 10 }, (_, i) => <div key={i} className={`h-14 flex-1 rounded-lg ${i % 2 ? 'bg-slate-300' : 'bg-orange-300'}`} />)}
      </div>
    </div>
  );
}

// A light card that a dark one wipes across, as when the theme switches. Both are always truly white and black (not the theme's
// colours, which would turn the light one grey in dark mode).
function Theme() {
  const lines = <><div className="h-2 w-20 rounded bg-current opacity-30" /><div className="mt-2 h-2 w-32 rounded bg-current opacity-20" /><div className="mt-2 h-5 w-12 rounded-md bg-orange-500" /></>;
  return (
    <div className="relative h-24 w-full max-w-56 overflow-hidden rounded-xl border border-slate-300">
      <div className="absolute inset-0 bg-[white] p-3 text-[black]">{lines}</div>
      <div className="absolute inset-0 bg-[black] p-3 text-[white]" style={{ animation: `cl-wipe ${LOOP}` }}>{lines}</div>
    </div>
  );
}

// A ball that rises and settles with an eased curve, with its shadow.
function Motion() {
  return (
    <div className="flex h-24 w-full max-w-56 flex-col items-center justify-end gap-1 pb-2">
      <div className="h-8 w-8 rounded-full bg-orange-500" style={{ animation: `cl-bounce 1.6s cubic-bezier(0.34, 1.56, 0.64, 1) infinite` }} />
      <div className="h-1.5 w-10 rounded-full bg-slate-300" />
    </div>
  );
}

const PREVIEWS: Record<ChangelogPreviewKind, () => React.JSX.Element> = { stack: Stack, dates: Dates, readmore: ReadMore, layout: Layout, dashboard: Dashboard, profile: Profile, landing: Landing, theme: Theme, motion: Motion };

export function ChangelogPreview({ kind, badge = true }: { kind: ChangelogPreviewKind; badge?: boolean }) {
  const Preview = PREVIEWS[kind];
  return (
    <div className="relative flex h-40 items-center justify-center overflow-hidden bg-slate-100 px-4">
      {badge && <span className="whats-new-badge absolute left-3 top-3 rounded-lg px-2.5 py-1 text-caption font-bold uppercase tracking-wide">What&apos;s new !</span>}
      <div aria-hidden="true" className="flex w-full justify-center"><Preview /></div>
    </div>
  );
}
