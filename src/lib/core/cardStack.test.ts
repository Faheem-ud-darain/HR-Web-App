import { describe, it, expect } from 'vitest';
import { peekIndexes, stepIndex, swipeOutcome } from './cardStack';

describe('swipeOutcome', () => {
  it('moves on after a long swipe down, back after a long swipe up', () => {
    expect(swipeOutcome(120, 600)).toBe('next');
    expect(swipeOutcome(-120, 600)).toBe('previous');
  });
  it('counts a short quick flick', () => {
    expect(swipeOutcome(50, 150)).toBe('next');
    expect(swipeOutcome(-50, 150)).toBe('previous');
  });
  it('stays put for a small or slow drag', () => {
    expect(swipeOutcome(30, 100)).toBe('stay');
    expect(swipeOutcome(60, 600)).toBe('stay');
    expect(swipeOutcome(0, 10)).toBe('stay');
  });
});

describe('stepIndex', () => {
  it('goes round at both ends', () => {
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(1, 5, 3)).toBe(0);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});

describe('peekIndexes', () => {
  it('shows up to two cards beneath the top one, wrapping, never the top card', () => {
    expect(peekIndexes(0, 5)).toEqual([1, 2]);
    expect(peekIndexes(4, 5)).toEqual([0, 1]);
    expect(peekIndexes(0, 2)).toEqual([1]);
    expect(peekIndexes(0, 1)).toEqual([]);
    expect(peekIndexes(0, 0)).toEqual([]);
  });
});
