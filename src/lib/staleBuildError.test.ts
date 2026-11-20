import { describe, it, expect } from 'vitest';
import { isStaleBuildError } from './staleBuildError';

describe('isStaleBuildError', () => {
  it('recognises the errors a tab gets after a new release', () => {
    expect(isStaleBuildError(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(true);
    expect(isStaleBuildError(new Error('Loading chunk 123 failed.'))).toBe(true);
    expect(isStaleBuildError(new TypeError('Failed to fetch dynamically imported module: https://hub.delcargo.us/_next/static/chunks/a.js'))).toBe(true);
    expect(isStaleBuildError(new SyntaxError("Unexpected token '<'"))).toBe(true);
  });
  it('leaves ordinary errors alone', () => {
    expect(isStaleBuildError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isStaleBuildError(null)).toBe(false);
    expect(isStaleBuildError('boom')).toBe(false);
  });
});
