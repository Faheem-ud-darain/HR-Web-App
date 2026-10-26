import { describe, it, expect } from 'vitest';
import { groupErrors, compareVersions, newestVersion, explainTrackerError, normalizeError, versionFamily, isBehind } from './trackerErrors';

describe('tracker error groups', () => {
  it('groups the same error with different numbers and counts people', () => {
    const g = groupErrors([
      { who: 'Employee 1', error: 'Upload failed (502)' }, { who: 'Employee 2', error: 'Upload failed (504)' },
      { who: 'Employee 3', error: 'Screen is locked' }, { who: 'Employee 4', error: null }, { who: 'Employee 5', error: '' },
    ]);
    expect(g.map(x => x.count)).toEqual([2, 1]);
    expect(g[0].who).toEqual(['Employee 1', 'Employee 2']);
    expect(normalizeError('Upload failed (502)')).toBe(normalizeError('Upload failed (504)'));
  });
  it('compares versions numerically, not as text', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.4.2', '1.4.2')).toBe(0);
    expect(newestVersion(['1.4.2', '1.10.0', undefined, '1.9.0'])).toBe('1.10.0');
  });
  it('explains the known errors and stays silent on unknown ones', () => {
    expect(explainTrackerError('Setup token not recognized — ask HR/Admin to check your setup.')).toMatch(/setup code/);
    expect(explainTrackerError('Screen is locked')).toMatch(/locked/);
    expect(explainTrackerError('Something odd happened')).toBeNull();
    expect(explainTrackerError(null)).toBeNull();
  });
});

describe('version families', () => {
  it('never compares the desktop agent with the Chromebook extension', () => {
    const all = ['27', '24', '1.0.15'];
    expect(versionFamily('27')).toBe('agent');
    expect(versionFamily('1.0.15')).toBe('extension');
    expect(isBehind('24', all)).toBe(true);
    expect(isBehind('27', all)).toBe(false);
    expect(isBehind('1.0.15', all)).toBe(false); // the only extension: not "behind" a desktop build
    expect(isBehind('1.0.14', [...all, '1.0.15'])).toBe(true);
    expect(isBehind(undefined, all)).toBe(false);
  });
});
