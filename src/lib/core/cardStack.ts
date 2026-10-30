// Plain TypeScript. The rules behind a stack of cards the person swipes through on a phone (components/ui/CardStack.tsx).

/** What a vertical swipe on the top card means: down brings the next card up, up goes back to the one before. */
export function swipeOutcome(dy: number, ms: number): 'next' | 'previous' | 'stay' {
  const far = Math.abs(dy) >= 90;
  const flick = Math.abs(dy) >= 36 && ms <= 250; // a short, quick flick counts too
  if (!far && !flick) return 'stay';
  return dy > 0 ? 'next' : 'previous';
}

/** The position after moving `by` places in a stack of `count` cards, going round at both ends. */
export const stepIndex = (index: number, by: number, count: number): number => (count <= 0 ? 0 : (((index + by) % count) + count) % count);

/** The positions of the cards peeking out beneath the top one, nearest first (at most `max`, never the top card itself). */
export function peekIndexes(index: number, count: number, max = 2): number[] {
  return Array.from({ length: Math.min(max, Math.max(0, count - 1)) }, (_, k) => stepIndex(index, k + 1, count));
}
