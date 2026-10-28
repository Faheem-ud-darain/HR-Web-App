import { describe, it, expect } from 'vitest';
import { formatBytes, isImageAttachment } from './attachments';

describe('isImageAttachment', () => {
  it('accepts picture extensions in any case', () => {
    for (const n of ['a.png', 'b.JPG', 'c.jpeg', 'd.gif', 'e.webp', 'f.bmp']) expect(isImageAttachment(n)).toBe(true);
  });
  it('rejects other files and missing names', () => {
    for (const n of ['a.pdf', 'b.png.exe', 'png', '']) expect(isImageAttachment(n)).toBe(false);
    expect(isImageAttachment(undefined)).toBe(false);
  });
});

describe('formatBytes', () => {
  it('formats bytes, kilobytes and megabytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(812)).toBe('812 B');
    expect(formatBytes(34 * 1024)).toBe('34 KB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
  it('is empty when the size is unknown', () => {
    expect(formatBytes(undefined)).toBe('');
  });
});
