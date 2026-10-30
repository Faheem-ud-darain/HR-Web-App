'use client';

import React, { useRef, useState } from 'react';
import { CaretDownIcon as CaretDown, CaretUpIcon as CaretUp } from '@/components/ui/icons';
import { IconButton } from '@/components/ui/IconButton';
import { peekIndexes, stepIndex, swipeOutcome } from '@/lib/core/cardStack';

interface CardStackProps<T> {
  items: T[];
  keyOf: (item: T) => string;
  /** The full card (the top one). */
  render: (item: T) => React.ReactNode;
  /** One short line for the strip of a card waiting beneath the top one (a name and what it is about). */
  peek: (item: T) => React.ReactNode;
  /** Names the stack for screen readers, e.g. "Date change requests". */
  label: string;
}

const EXIT_MS = 180;

// A stack of cards for a phone: the top card is whole, and a strip of the next one or two shows beneath it. Swipe down on the grip
// at the top of the card to bring the next one up (up goes back); the arrow buttons do the same without a gesture. Only the grip
// captures touches, so the card's own content and the page still scroll normally. With one card there is no stack, just the card.
export function CardStack<T>({ items, keyOf, render, peek, label }: CardStackProps<T>) {
  const [index, setIndex] = useState(0);
  const [dragY, setDragY] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ y: number; t: number } | null>(null);

  const count = items.length;
  const current = Math.min(index, Math.max(0, count - 1)); // the list can shrink while one is being answered
  if (count === 0) return null;
  if (count === 1) return <>{render(items[0])}</>;

  const go = (by: number) => {
    if (leaving) return;
    setLeaving(true);
    setDragY(by > 0 ? 220 : -220);
    window.setTimeout(() => { setIndex(stepIndex(current, by, count)); setDragY(null); setLeaving(false); }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : EXIT_MS);
  };
  const onDown = (e: React.PointerEvent) => {
    if (leaving) return;
    start.current = { y: e.clientY, t: Date.now() };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* not an active pointer: dragging still works while it stays over the grip */ }
    setDragY(0);
    setDragging(true);
  };
  const onMove = (e: React.PointerEvent) => { if (start.current) setDragY(e.clientY - start.current.y); };
  const onUp = () => {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (!s || dragY === null) return;
    const outcome = swipeOutcome(dragY, Date.now() - s.t);
    if (outcome === 'stay') setDragY(null);
    else go(outcome === 'next' ? 1 : -1);
  };
  const onCancel = () => { start.current = null; setDragging(false); if (!leaving) setDragY(null); };

  return (
    <section aria-label={label} className="relative">
      <div
        className="relative z-30"
        style={dragY !== null ? { transform: `translateY(${dragY}px)`, opacity: leaving ? 0 : 1 - Math.min(0.4, Math.abs(dragY) / 400), transition: dragging ? 'none' : `transform ${EXIT_MS}ms ease-out, opacity ${EXIT_MS}ms ease-out` } : { transition: `transform ${EXIT_MS}ms ease-out` }}
      >
        <div className="flex items-center justify-between rounded-t-xl border border-b-0 border-slate-200 bg-slate-50 px-3 py-1.5">
          <div
            role="presentation"
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}
            className="flex flex-1 cursor-grab touch-none select-none items-center gap-3 py-1"
          >
            <span className="h-1 w-9 rounded-full bg-slate-300" aria-hidden="true" />
            <span className="text-caption font-bold text-slate-600">{current + 1} of {count} · swipe down for the next</span>
          </div>
          <div className="flex items-center">
            <IconButton label="Previous request" size="sm" onClick={() => go(-1)}><CaretUp className="h-4 w-4" aria-hidden="true" /></IconButton>
            <IconButton label="Next request" size="sm" onClick={() => go(1)}><CaretDown className="h-4 w-4" aria-hidden="true" /></IconButton>
          </div>
        </div>
        <div key={keyOf(items[current])} className="[&>*]:rounded-t-none">{render(items[current])}</div>
      </div>
      {peekIndexes(current, count).map((i, k) => (
        <div
          key={keyOf(items[i])}
          aria-hidden="true"
          className="relative -mt-3 truncate rounded-b-xl border border-slate-200 bg-card px-4 pb-2 pt-4 text-xs font-semibold text-slate-500 shadow-sm"
          style={{ zIndex: 20 - k, marginLeft: (k + 1) * 10, marginRight: (k + 1) * 10 }}
        >
          {peek(items[i])}
        </div>
      ))}
    </section>
  );
}
