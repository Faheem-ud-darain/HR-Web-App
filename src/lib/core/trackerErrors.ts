// Plain TypeScript — turns what the trackers themselves report (capture errors, lock state, failure
// counts, versions) into groups a person can act on. No names here: callers pass whatever label they use.

/** Groups similar error texts ("Upload failed (502)" / "Upload failed (504)") so a pattern shows up as one line. */
export function normalizeError(text: string): string {
  return String(text || '').toLowerCase().replace(/\d+/g, 'N').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export interface ErrorGroup { error: string; count: number; who: string[] }

export function groupErrors(entries: { who: string; error?: string | null }[], maxWho = 6): ErrorGroup[] {
  const byKey = new Map<string, ErrorGroup>();
  for (const e of entries) {
    const text = (e.error || '').trim();
    if (!text) continue;
    const key = normalizeError(text);
    const g = byKey.get(key) ?? { error: text.slice(0, 120), count: 0, who: [] };
    g.count++;
    if (g.who.length < maxWho) g.who.push(e.who);
    byKey.set(key, g);
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count);
}

/** Compares dotted versions ("1.4.2" vs "1.10.0"); unknown or malformed versions sort lowest. */
export function compareVersions(a?: string, b?: string): number {
  const parse = (v?: string) => (String(v || '').match(/\d+/g) || []).map(Number);
  const x = parse(a); const y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function newestVersion(versions: (string | undefined)[]): string {
  return versions.filter((v): v is string => !!v).sort(compareVersions).pop() || '';
}

/** What an error text most likely means, in words HR can act on (null when it is not a known pattern). */
export function explainTrackerError(text: string | null | undefined): string | null {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  if (t.includes('token') && (t.includes('not recognized') || t.includes('not recognised'))) return 'The setup code on this computer no longer matches. The employee needs to reconnect the tracker with a current setup code from their Shift Tracker page (HR can also generate one).';
  if (t.includes('locked')) return 'The computer was locked at capture time. Normal if the person is away; a problem only if it stays locked during a shift.';
  if (t.includes('permission') || t.includes('screen recording') || t.includes('not permitted')) return 'The operating system is blocking screen capture. The tracker needs screen-recording permission in the system settings, then a restart.';
  if (/(upload|network|timeout|timed out|connection|502|503|504)/.test(t)) return 'The screenshot could not be uploaded, usually a network problem or the server being slow. It normally clears by itself; if it repeats, check the employee\'s internet.';
  return null;
}

/** The desktop agent numbers its builds with plain integers ("27"); the Chromebook extension uses dotted versions ("1.0.15"). They are never compared with each other. */
export function versionFamily(v?: string): 'agent' | 'extension' | 'unknown' {
  const t = String(v || '').trim();
  if (/^\d+$/.test(t)) return 'agent';
  if (/^\d+(\.\d+)+$/.test(t)) return 'extension';
  return 'unknown';
}

/** True when `version` is older than the newest version seen in its own family. */
export function isBehind(version: string | undefined, allVersions: (string | undefined)[]): boolean {
  const fam = versionFamily(version);
  if (fam === 'unknown' || !version) return false;
  const newest = newestVersion(allVersions.filter(v => versionFamily(v) === fam));
  return !!newest && compareVersions(version, newest) < 0;
}
