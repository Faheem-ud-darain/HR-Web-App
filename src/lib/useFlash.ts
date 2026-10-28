'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// A message that clears itself: `flash('Saved')` shows it for `ms`, a newer one replaces it (and restarts the timer),
// and the timer is dropped if the page is left. Replaces the `setX(msg); setTimeout(() => setX(''), ms)` pairs.
export function useFlash(defaultMs = 2000): [string, (message: string, ms?: number) => void] {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = useCallback((next: string, ms = defaultMs) => {
    clearTimeout(timer.current);
    setMessage(next);
    timer.current = setTimeout(() => setMessage(''), ms);
  }, [defaultMs]);
  return [message, flash];
}
