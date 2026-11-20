// Everything a problem report carries passes through here first, so a report can never leak a login token or password,
// and one runaway error message cannot make a report too big to store.
const SECRET_QUERY = /([?&](?:token|access_token|auth|password|pass|secret|key|code|state|otp)=)[^&#\s]*/gi;
const JWT = /eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g;
const BEARER = /(bearer\s+)[\w.~+/-]+=*/gi;
// "password: x", password=x, {"token":"x"}: the value of any credential-named key, in free text or in JSON.
const SECRET_ASSIGNMENT = /(["']?(?:password|passwd|pwd|secret|token|api[_-]?key|authorization|otp)["']?\s*[:=]\s*)(?!bearer\b)("[^"]*"|'[^']*'|[^\s,&;}\]]+)/gi;

/** Plain text, secrets removed, cut to `max` characters. */
export function scrub(value: unknown, max = 500): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : value instanceof Error ? `${value.name}: ${value.message}` : safeJson(value);
  text = text.replace(JWT, '[token]').replace(BEARER, '$1[token]').replace(SECRET_QUERY, '$1[hidden]').replace(SECRET_ASSIGNMENT, '$1[hidden]');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function safeJson(value: unknown): string {
  try { return JSON.stringify(value) ?? String(value); } catch { return String(value); }
}

/** "host/path" of a URL without its query or fragment (which can hold tokens); anything unparsable is scrubbed text. */
export function hostAndPath(url: string, base = 'https://x.invalid'): string {
  try {
    const u = new URL(url, base);
    return u.host === 'x.invalid' ? u.pathname : `${u.host}${u.pathname}`;
  } catch {
    return scrub(url, 200);
  }
}

/** The host of a URL, resolving a relative one ("/api/me") against the page; '' when it cannot be worked out. */
export function hostOf(url: string, base = typeof window !== 'undefined' ? window.location.origin : 'https://x.invalid'): string {
  try { return new URL(url, base).host; } catch { return ''; }
}

/** A short stable id for "the same problem": the kind, the message with its numbers and long ids removed, and the page. */
export function fingerprintOf(kind: string, message: string, route: string): string {
  const normalised = `${kind}|${message.toLowerCase().replace(/[a-z0-9]{15,}/g, '#').replace(/\d+/g, '0').slice(0, 200)}|${route.replace(/[a-z0-9]{15,}/g, '#')}`;
  let h = 5381;
  for (let i = 0; i < normalised.length; i++) h = ((h << 5) + h + normalised.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Errors that say nothing about this app: browser extensions, harmless browser notices, requests the page itself cancelled. */
export function isNoise(message: string, source = ''): boolean {
  if (/^(chrome|moz|safari)-extension:|^webkit-masked-url:/i.test(source)) return true;
  return /ResizeObserver loop|AbortError|The user aborted a request|The operation was aborted|Non-Error promise rejection|cancelled|canceled/i.test(message);
}
