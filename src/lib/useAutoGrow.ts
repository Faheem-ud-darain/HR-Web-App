'use client';

import { useLayoutEffect, type RefObject } from 'react';

/**
 * Makes a textarea grow while you type and shrink again as you delete (or when it is cleared after sending),
 * up to `maxPx`, after which it scrolls. Re-measures whenever `value` changes and when the window is resized
 * (narrower boxes wrap onto more lines). The box never gets smaller than its `rows` / min-height.
 */
export function fitTextarea(el: HTMLTextAreaElement, maxPx: number): void {
  el.style.height = 'auto';
  const borders = el.offsetHeight - el.clientHeight; // border-box sizing: the border is part of `height`
  const wanted = el.scrollHeight + borders;
  el.style.height = `${Math.min(wanted, maxPx)}px`;
  el.style.overflowY = wanted > maxPx ? 'auto' : 'hidden';
}

export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: unknown, maxPx = 260): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) fitTextarea(el, maxPx);
  }, [ref, value, maxPx]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onResize = () => fitTextarea(el, maxPx);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [ref, maxPx]);
}
