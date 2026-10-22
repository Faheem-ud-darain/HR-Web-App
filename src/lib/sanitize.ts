// Input sanitising / validation helpers shared by the browser and the Edge
// API routes (plain TypeScript, no Node or DOM APIs).
//
// What this is for: React already escapes text it renders, so the real risks
// in this app are (a) invisible/control characters used to spoof or break
// things, (b) URLs from stored data used as link targets or redirects
// (`javascript:` and friends), (c) unbounded input, and (d) malformed emails/
// phones reaching the database or an outgoing message. It is NOT a place to
// HTML-escape data on the way in — escape on the way OUT (escapeHtml below),
// otherwise "R&D" gets stored as "R&amp;D".

// Control characters except tab/newline/CR, plus the invisible characters used
// for text spoofing: zero-width space, word joiner & invisible operators,
// the BOM, and the bidi embedding/override/isolate controls ("Trojan Source").
// Deliberately KEEPS U+200C/U+200D (zero-width non-joiner/joiner — required by
// Urdu/Persian text and emoji sequences) and U+200E/U+200F (LRM/RLM).
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​⁠-⁤⁦-⁩‪-‮﻿]/g;

/** Removes control and spoofing characters. Never trims or reflows text. */
export function stripUnsafeChars(input: string): string {
  return input.replace(UNSAFE_CHARS, '');
}

export interface CleanTextOptions {
  /** Hard length cap (counted in UTF-16 units, like maxLength). Default 200. */
  max?: number;
  /** Keep line breaks (textareas). Single-line fields collapse all whitespace. */
  multiline?: boolean;
}

/**
 * Normalises one user-typed text value: coerces to a string, applies Unicode
 * NFC, strips unsafe characters, trims, collapses whitespace and enforces a
 * length cap. Non-strings become ''.
 */
export function cleanText(value: unknown, opts: CleanTextOptions = {}): string {
  const { max = 200, multiline = false } = opts;
  if (typeof value !== 'string') return '';
  let s = stripUnsafeChars(value.normalize('NFC')).replace(/\r\n?/g, '\n');
  if (multiline) {
    s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  } else {
    s = s.replace(/\s+/g, ' ').trim();
  }
  return s.length > max ? s.slice(0, max).trimEnd() : s;
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

export function isValidEmail(value: unknown): boolean {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value.trim());
}

/** Lower-cased, trimmed email, or '' when it isn't a plausible address. */
export function cleanEmail(value: unknown): string {
  if (typeof value !== 'string') return '';
  const s = stripUnsafeChars(value).trim().toLowerCase();
  return isValidEmail(s) ? s : '';
}

/** Digits plus the usual phone punctuation only ("+92 300-1234567"), max 25. */
export function cleanPhone(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[^\d+\-() .]/g, '').replace(/\s+/g, ' ').trim().slice(0, 25);
}

/** A file name safe to store/display: no path separators or control characters. */
export function cleanFileName(value: unknown, max = 120): string {
  // Generous pre-cap so the extension survives; the real cap is applied below.
  const s = cleanText(value, { max: 1000 }).replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+/, '');
  if (s.length <= max) return s;
  const dot = s.lastIndexOf('.');
  const ext = dot > 0 && s.length - dot <= 10 ? s.slice(dot) : '';
  return s.slice(0, max - ext.length) + ext;
}

const SAFE_DATA_URL = /^data:(?:image\/(?:png|jpe?g|gif|webp|avif|bmp|heic|heif)|application\/pdf|text\/plain|application\/(?:msword|vnd\.[\w.+-]+))(?:;[\w=.+-]+)*;base64,/i;

/**
 * Returns `url` only if it is safe to use as a link/`window.open` target:
 * http(s), mailto, a blob: URL, or a base64 data: URL of an image/PDF/document
 * type. Anything else (`javascript:`, `data:text/html`, `vbscript:`, ...) gives
 * undefined, so callers can drop the link instead of rendering it.
 */
export function safeHref(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  const s = stripUnsafeChars(url).trim();
  if (!s) return undefined;
  if (/^(?:https?:\/\/|mailto:|blob:)/i.test(s)) {
    try {
      if (/^https?:/i.test(s)) new URL(s); // must actually parse
      return s;
    } catch {
      return undefined;
    }
  }
  if (SAFE_DATA_URL.test(s)) return s;
  // Same-site relative paths are fine ("/employee/tasks"), protocol-relative ("//host") is not.
  if (s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\')) return s;
  return undefined;
}

/**
 * For redirects driven by data (e.g. a push notification's deep link): only a
 * same-site path is accepted, never an absolute or scheme-relative URL.
 */
export function safeInternalPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = stripUnsafeChars(value).trim();
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : null;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape for interpolation into HTML (e.g. an outgoing email body). */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

const SKIP_KEY = /pass(word)?|token|secret|hash/i;
const SKIP_LENGTH = 200_000; // base64 blobs and similar — never rewritten

/**
 * Deep-copies a record about to be written to the database with unsafe
 * characters stripped from every string. Deliberately conservative: it does not
 * trim or truncate (field limits are enforced where each form/route knows the
 * field), leaves data: URLs and huge blobs alone, and never touches fields that
 * look like passwords/tokens/hashes.
 */
export function sanitizeForWrite<T>(value: T, key = ''): T {
  if (typeof value === 'string') {
    if (SKIP_KEY.test(key) || value.length > SKIP_LENGTH || value.startsWith('data:')) return value;
    return stripUnsafeChars(value) as unknown as T;
  }
  if (Array.isArray(value)) return value.map(v => sanitizeForWrite(v, key)) as unknown as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = sanitizeForWrite(v, k);
    return out as T;
  }
  return value; // numbers, booleans, null, Date, FormData, File, ...
}
