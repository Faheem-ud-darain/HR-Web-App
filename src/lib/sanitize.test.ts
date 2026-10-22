import { describe, it, expect } from 'vitest';
import {
  stripUnsafeChars, cleanText, isValidEmail, cleanEmail, cleanPhone, cleanFileName,
  safeHref, safeInternalPath, escapeHtml, sanitizeForWrite,
} from './sanitize';

describe('stripUnsafeChars', () => {
  it('removes control chars, zero-width space, BOM and bidi overrides', () => {
    expect(stripUnsafeChars('a\u0000b\u0007c​d﻿e‮f⁦g')).toBe('abcdefg');
  });
  it('keeps newlines/tabs, emoji joiners and Urdu text with ZWNJ', () => {
    expect(stripUnsafeChars('line1\n\tline2')).toBe('line1\n\tline2');
    expect(stripUnsafeChars('👨‍👩‍👧')).toBe('👨‍👩‍👧'); // ZWJ sequence
    expect(stripUnsafeChars('می‌خواهم')).toBe('می‌خواهم'); // ZWNJ
    expect(stripUnsafeChars('R&D <team> "q"')).toBe('R&D <team> "q"'); // no HTML-escaping on the way in
  });
});

describe('cleanText', () => {
  it('collapses whitespace on single-line fields and trims', () => {
    expect(cleanText('  Jane \n  Doe\t ')).toBe('Jane Doe');
  });
  it('keeps paragraphs on multiline fields but caps blank runs', () => {
    expect(cleanText('a  \n\n\n\n b', { multiline: true })).toBe('a\n\n b');
  });
  it('enforces the length cap and ignores non-strings', () => {
    expect(cleanText('x'.repeat(500), { max: 50 })).toHaveLength(50);
    expect(cleanText(42 as unknown as string)).toBe('');
    expect(cleanText(null)).toBe('');
  });
  it('normalises Unicode to NFC', () => {
    expect(cleanText('é')).toBe('é');
  });
});

describe('email / phone / file names', () => {
  it('validates and lower-cases emails', () => {
    expect(cleanEmail('  Josh@DelCargo.us ')).toBe('josh@delcargo.us');
    for (const bad of ['', 'a@b', 'a b@c.com', 'a@b.c', '<x@y.com>', 'a@b.com,c@d.com', 'x'.repeat(250) + '@a.com', 42]) {
      expect(cleanEmail(bad as unknown as string)).toBe('');
    }
    expect(isValidEmail('first.last+tag@sub.example.co')).toBe(true);
  });
  it('keeps only phone characters', () => {
    expect(cleanPhone('+92 (300) 123-4567 ext<script>')).toBe('+92 (300) 123-4567');
    expect(cleanPhone('x'.repeat(100))).toBe('');
  });
  it('makes file names safe and keeps the extension when shortening', () => {
    expect(cleanFileName('../../etc/passwd')).toBe('.._.._etc_passwd'.replace(/^\.+/, ''));
    expect(cleanFileName('a/b\\c:d.pdf')).toBe('a_b_c_d.pdf');
    const long = cleanFileName('n'.repeat(300) + '.pdf');
    expect(long).toHaveLength(120);
    expect(long.endsWith('.pdf')).toBe(true);
  });
});

describe('safeHref', () => {
  it.each([
    'https://example.com/a?b=1', 'http://localhost:3000/x', 'mailto:hr@delcargo.us', 'blob:https://hub.delcargo.us/abc',
    '/employee/tasks', 'data:image/png;base64,iVBORw0KGgo=', 'data:application/pdf;base64,JVBERi0=',
  ])('allows %s', url => expect(safeHref(url)).toBe(url));
  it.each([
    'javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'vbscript:x', 'data:text/html;base64,PHNjcmlwdD4=',
    'data:image/svg+xml;base64,PHN2Zz4=', '//evil.example/x', '/\\evil.example', 'file:///etc/passwd', 'https://', '', undefined, 42,
  ])('rejects %s', url => expect(safeHref(url as unknown as string)).toBeUndefined());
});

describe('safeInternalPath', () => {
  it('accepts same-site paths only', () => {
    expect(safeInternalPath('/employee/tickets?id=1')).toBe('/employee/tickets?id=1');
    for (const bad of ['https://evil.example', '//evil.example', 'javascript:alert(1)', 'employee/tasks', '', null]) {
      expect(safeInternalPath(bad as unknown as string)).toBeNull();
    }
  });
});

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml(`<img src=x onerror="a()">&'`)).toBe('&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
    expect(escapeHtml(null)).toBe('');
  });
});

describe('sanitizeForWrite', () => {
  it('cleans nested strings and leaves everything else alone', () => {
    const date = new Date();
    const out = sanitizeForWrite({
      title: 'a‮b', n: 5, ok: true, nothing: null, date,
      replies: [{ message: 'hi\u0000there', attachmentUrl: 'data:image/png;base64,AA\u0000A' }],
      password: 'p\u0007w', agentToken: 'agt_\u0001x',
    });
    expect(out.title).toBe('ab');
    expect(out.replies[0].message).toBe('hithere');
    expect(out.replies[0].attachmentUrl).toBe('data:image/png;base64,AA\u0000A'); // data: left untouched
    expect(out.password).toBe('p\u0007w'); // credentials never rewritten
    expect(out.agentToken).toBe('agt_\u0001x');
    expect(out.date).toBe(date);
    expect(out.n).toBe(5);
  });
  it('does not touch non-plain objects like FormData', () => {
    const fd = new FormData();
    expect(sanitizeForWrite(fd)).toBe(fd);
  });
});
