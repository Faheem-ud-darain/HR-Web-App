// Removes who-it-is from text before it is sent to a model provider: names, e-mail addresses and phone
// numbers. Used for ticket text, which an employee wrote and which can name them or others.
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?<![\w])\+?\d[\d\s().-]{6,}\d(?![\w])/g;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replaces each given name (and each word of it, 3+ letters) with `placeholder`, plus any e-mail or phone number. */
export function redactText(text: string, names: string[], placeholder = '[EMPLOYEE]'): string {
  let out = text.replace(EMAIL, '[email]').replace(PHONE, '[phone]');
  const words = new Set<string>();
  for (const n of names) {
    const full = n.trim();
    if (full.length >= 3) words.add(full);
    for (const w of full.split(/\s+/)) if (w.length >= 3) words.add(w);
  }
  // Longest first so "Ali Raza" is replaced as one piece before "Ali" on its own.
  for (const w of [...words].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`(?<![\\w])${escape(w)}(?![\\w])`, 'gi'), placeholder);
  }
  return out;
}
