// Names, ticket ids and ticket titles in Del's answers are clickable: each opens a popup with the details. The links are made on the server
// AFTER the model has answered (so they cost no tokens and the model never sees an id or address it should not): a hidden marker is put
// around each known thing, then turned into a markdown link `[label](del://ticket/<id>)` or `[label](del://employee/<profile id>)`.
// The screen only opens links of this exact shape; any other link in an answer stays plain text.
export type DelKind = 'employee' | 'ticket';

const OPEN = '\u0001'; const MID = '\u0002'; const END = '\u0003';
const MARKER = /\u0001([et])([A-Za-z0-9_-]{1,40})\u0002([^\u0001\u0002\u0003]*)\u0003/g;
const clean = (s: string) => s.replace(/[\u0000-\u001F[\]]/g, ' ').replace(/\s+/g, ' ').trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const marker = (kind: DelKind, id: string, label: string) => `${OPEN}${kind === 'employee' ? 'e' : 't'}${id}${MID}${label}${END}`;

/** Runs `fn` on the parts of the text that are not already inside a marker, so a thing is never linked twice. */
function outsideMarkers(text: string, fn: (part: string) => string): string {
  return text.split(/(\u0001[^\u0003]*\u0003)/).map((part, i) => (i % 2 ? part : fn(part))).join('');
}

/**
 * Puts markers around the tickets Del has read in this answer. An id is linked wherever it appears. A title is linked only when it is a whole table
 * cell, so an ordinary word in a sentence ("salary") is never turned into a link by accident.
 */
export function markTickets(text: string, tickets: Map<string, string>): string {
  let out = text;
  const byLongest = [...tickets.entries()].filter(([, title]) => title.trim().length >= 4).sort((a, b) => b[1].length - a[1].length);
  for (const [id, title] of byLongest) {
    const cell = new RegExp(`(^|\\|)([ \\t]*)${escapeRe(title.trim())}([ \\t]*)(?=\\||$)`, 'gm');
    out = outsideMarkers(out, part => part.replace(cell, (_m, lead: string, before: string, after: string) => `${lead}${before}${marker('ticket', id, title.trim())}${after}`));
  }
  for (const id of tickets.keys()) {
    const re = new RegExp(`\\b${escapeRe(id)}\\b`, 'g');
    out = outsideMarkers(out, part => part.replace(re, marker('ticket', id, id)));
  }
  return out;
}

/** Turns every marker into its markdown link. Anything left over that looks like a marker is removed rather than shown. */
export function markersToLinks(text: string): string {
  return text.replace(MARKER, (_m, k: string, id: string, label: string) => `[${clean(label) || id}](del://${k === 'e' ? 'employee' : 'ticket'}/${id})`).replace(/[\u0001\u0002\u0003]/g, '');
}

export const DEL_LINK = /\[([^\]\n]+)\]\(del:\/\/(employee|ticket)\/([A-Za-z0-9_-]{1,40})\)/;
export const DEL_LINK_SPLIT = /(\[[^\]\n]+\]\(del:\/\/(?:employee|ticket)\/[A-Za-z0-9_-]{1,40}\))/g;

export function parseDelLink(piece: string): { label: string; kind: DelKind; id: string } | null {
  const m = new RegExp(`^${DEL_LINK.source}$`).exec(piece);
  return m ? { label: m[1], kind: m[2] as DelKind, id: m[3] } : null;
}

/** An answer without its links, for copying. */
export const stripDelLinks = (text: string): string => text.replace(new RegExp(DEL_LINK.source, 'g'), '$1');
