import { useEffect, useRef, type RefObject } from 'react';

const NEAR_BOTTOM_PX = 120;

// Keeps a message thread scrolled to its newest message, but only while the reader is already at (or near)
// the bottom, so a poll that brings in a reply never drags someone away from the older message they are
// reading. `change` is whatever changes when the thread gets new content; `resetKey` identifies which thread
// is open (switching thread always jumps to the bottom). Smooth scrolling is skipped for people who ask their
// device for reduced motion.
export function useStickToBottom(ref: RefObject<HTMLElement | null>, change: unknown, resetKey: unknown) {
  const pinned = useRef(true);
  const lastReset = useRef(resetKey);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => { pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX; };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [ref, resetKey]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reset = lastReset.current !== resetKey;
    lastReset.current = resetKey;
    if (!reset && !pinned.current) return;
    const calm = reset || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: calm ? 'auto' : 'smooth' });
    pinned.current = true;
  }, [ref, change, resetKey]);
}
