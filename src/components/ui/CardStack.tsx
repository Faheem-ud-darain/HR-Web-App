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

// A stack of cards for a phone: the top card is whole, and a strip of the next one or two peeks out ABOVE it, as if they were
// waiting behind it. Swipe the top card down, from anywhere on it, to bring the next one forward (swipe up goes back); the arrow
// buttons do the same without a gesture, and it goes round at both ends. The card itself does not scroll the page (so a swipe can be
// a swipe), but its buttons still tap normally and the rest of the page scrolls as usual. With one card there is no stack.
export function CardStack<T>({ items, keyOf, render, peek, label }: CardStackProps<T>) {
  const [index, setIndex] = useState(0);
  const [dragY, setDragY] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [isDragging, setDragging] = useState(false);
  const start = useRef<{ y: number; t: number } | null>(null);
  const moved = useRef(0);
  const dragging = useRef(false);

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
  // The swipe works from anywhere on the card except its own buttons and fields (those keep working as taps). The distance is kept in a
  // ref as well as in state: the release must see the finger's LAST position, not the last one React happened to draw.
  const onDown = (e: React.PointerEvent) => {
    if (leaving || (e.target as HTMLElement).closest('button, a, input, textarea, select')) return;
    start.current = { y: e.clientY, t: Date.now() };
    moved.current = 0;
    dragging.current = false;
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    moved.current = e.clientY - start.current.y;
    if (!dragging.current && Math.abs(moved.current) > 6) {
      dragging.current = true;
      setDragging(true);
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* not an active pointer: dragging still works while it stays over the card */ }
    }
    if (dragging.current) setDragY(moved.current);
  };
  const onUp = () => {
    const s = start.current;
    start.current = null;
    if (!s || !dragging.current) return; // a tap, not a swipe
    dragging.current = false;
    setDragging(false);
    const outcome = swipeOutcome(moved.current, Date.now() - s.t);
    if (outcome === 'stay') setDragY(null);
    else go(outcome === 'next' ? 1 : -1);
  };
  const onCancel = () => { start.current = null; dragging.current = false; setDragging(false); if (!leaving) setDragY(null); };

  // Beneath the top card, nearest first; drawn above it from the farthest down, so the nearest sits just over the card.
  const behind = peekIndexes(current, count);
  return (
    <section aria-label={label} className="relative">
      {[...behind].reverse().map((i, r) => {
        const k = behind.length - 1 - r; // 0 = the very next card
        return (
          <div
            key={keyOf(items[i])}
            aria-hidden="true"
            className="relative truncate rounded-t-xl border border-b-0 border-slate-200 bg-card px-4 pb-4 pt-2 text-xs font-semibold text-slate-500 shadow-sm"
            style={{ zIndex: 10 + (behind.length - 1 - k), marginLeft: (k + 1) * 10, marginRight: (k + 1) * 10, marginBottom: -12 }}
          >
            {peek(items[i])}
          </div>
        );
      })}
      <div
        className="relative z-30 touch-none select-none"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}
        style={dragY !== null ? { transform: `translateY(${dragY}px)`, opacity: leaving ? 0 : 1 - Math.min(0.4, Math.abs(dragY) / 400), transition: isDragging ? 'none' : `transform ${EXIT_MS}ms ease-out, opacity ${EXIT_MS}ms ease-out` } : { transition: `transform ${EXIT_MS}ms ease-out` }}
      >
        <div className="flex items-center justify-between rounded-t-xl border border-b-0 border-slate-200 bg-slate-50 px-3 py-1.5">
          <div className="flex flex-1 cursor-grab items-center gap-3 py-1">
            <span className="h-1 w-9 rounded-full bg-slate-300" aria-hidden="true" />
            <span className="text-caption font-bold text-slate-600">{current + 1} of {count} · swipe down on the card for the next</span>
          </div>
          <div className="flex items-center">
            <IconButton label="Previous request" size="sm" onClick={() => go(-1)}><CaretUp className="h-4 w-4" aria-hidden="true" /></IconButton>
            <IconButton label="Next request" size="sm" onClick={() => go(1)}><CaretDown className="h-4 w-4" aria-hidden="true" /></IconButton>
          </div>
        </div>
        <div key={keyOf(items[current])} className="[&>*]:rounded-t-none">{render(items[current])}</div>
      </div>
    </section>
  );
}
