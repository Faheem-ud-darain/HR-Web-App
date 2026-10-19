'use client';
import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * false while rendering on the server and during hydration, true in the browser
 * afterwards — without the "set state in an effect after mount" dance. Use it to
 * gate things that only exist in the browser (portals, `window`-dependent UI).
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
