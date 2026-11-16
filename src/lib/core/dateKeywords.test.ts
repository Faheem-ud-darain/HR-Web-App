import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDateText } from './dateKeywords';

const TODAY = '2026-11-16';

describe('resolveDateText (a typed date filter)', () => {
  it('turns yesterday, today and tomorrow into that day\'s date', () => {
    expect(resolveDateText('today', TODAY)).toBe('2026-11-16');
    expect(resolveDateText('Tomorrow', TODAY)).toBe('2026-11-17');
    expect(resolveDateText('  YESTERDAY ', TODAY)).toBe('2026-11-15');
  });
  it('works across a month and a year boundary', () => {
    expect(resolveDateText('tomorrow', '2026-11-30')).toBe('2026-12-01');
    expect(resolveDateText('yesterday', '2026-01-01')).toBe('2025-12-31');
  });
  it('accepts the first three letters or more while typing', () => {
    expect(resolveDateText('tod', TODAY)).toBe('2026-11-16');
    expect(resolveDateText('tom', TODAY)).toBe('2026-11-17');
    expect(resolveDateText('yes', TODAY)).toBe('2026-11-15');
  });
  it('keeps anything else as typed, so a full or partial date still matches', () => {
    expect(resolveDateText('2026-07-06', TODAY)).toBe('2026-07-06');
    expect(resolveDateText('2026-07', TODAY)).toBe('2026-07');
    expect(resolveDateText('to', TODAY)).toBe('to'); // too short to be a word
    expect(resolveDateText('', TODAY)).toBe('');
  });
});

describe('every date in the app uses the shared date field', () => {
  it('has no raw type="date" input outside DateInput.tsx', () => {
    const root = path.resolve(__dirname, '../..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx$/.test(entry.name) && entry.name !== 'DateInput.tsx' && /type=["']date["']/.test(fs.readFileSync(full, 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n'))) offenders.push(path.relative(root, full));
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
