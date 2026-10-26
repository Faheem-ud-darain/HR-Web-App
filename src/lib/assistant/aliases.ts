// Keeps real employee names away from the model provider. Every person gets a stable alias for this
// request ("Employee 3"). Names in the user's messages and in tool results are turned into aliases before
// anything is sent; the aliases in the model's answer are turned back into real names on the server, just
// before the answer is shown to HR/Admin. The provider only ever sees "Employee 3".
/** `alias` is the nickname the person goes by in the app (HR/Admin see it as "Full Name (alias)"). */
export interface AliasPerson { id: string; name: string; alias?: string; email?: string }

/** Edit distance between two short words. */
export function editDistance(a: string, b: string): number {
  const x = a.toLowerCase(); const y = b.toLowerCase();
  const prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    let diag = prev[0]; prev[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (x[i - 1] === y[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[y.length];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class AliasMap {
  private readonly byId = new Map<string, string>();
  private readonly byAlias = new Map<string, AliasPerson>();
  private readonly fullNames: { re: RegExp; alias: string }[] = [];
  private readonly tokens: { re: RegExp; alias: string }[] = [];

  constructor(people: AliasPerson[]) {
    // Stable order (by id) so a person keeps the same alias for the whole request.
    const sorted = [...people].filter(p => p.name && p.name.trim().length >= 3).sort((a, b) => a.id.localeCompare(b.id));
    const tokenOwners = new Map<string, Set<string>>();
    sorted.forEach((p, i) => {
      const alias = `Employee ${i + 1}`;
      this.byId.set(p.id, alias);
      this.byAlias.set(alias.toLowerCase(), p);
      const full = p.name.trim().replace(/\s+/g, ' ');
      this.fullNames.push({ re: new RegExp(`(?<![\\w])${escape(full).replace(/\\ /g, '\\s+')}(?![\\w])`, 'gi'), alias });
      // A typed e-mail address of this person becomes their alias too (longest patterns are applied first).
      const mail = (p.email || '').trim();
      if (mail.length >= 5) this.fullNames.push({ re: new RegExp(`(?<![\\w.+-])${escape(mail)}(?![\\w.-])`, 'gi'), alias });
      const nick = (p.alias || '').trim().replace(/\s+/g, ' ');
      if (nick.length >= 3) this.fullNames.push({ re: new RegExp(`(?<![\\w])${escape(nick).replace(/\\ /g, '\\s+')}(?![\\w])`, 'gi'), alias });
      for (const t of [...full.split(' '), ...nick.split(' ')]) {
        if (t.length < 3) continue;
        const key = t.toLowerCase();
        (tokenOwners.get(key) ?? tokenOwners.set(key, new Set()).get(key)!).add(p.id);
      }
    });
    this.fullNames.sort((a, b) => b.re.source.length - a.re.source.length);
    // A single word (first name or surname) is replaced only when it belongs to exactly one person; a word
    // shared by several people ("Ali") is left alone so the assistant can ask which one was meant.
    for (const [token, owners] of tokenOwners) {
      if (owners.size !== 1) continue;
      const id = [...owners][0];
      this.tokens.push({ re: new RegExp(`(?<![\\w])${escape(token)}(?![\\w])`, 'gi'), alias: this.byId.get(id)! });
    }
  }

  aliasOf(id: string): string { return this.byId.get(id) ?? 'Employee ?'; }

  /** Accepts an alias ("Employee 3"); returns the person, or null. */
  fromAlias(alias: string): AliasPerson | null {
    const m = /^\s*employee\s+(\d{1,3})\s*$/i.exec(alias || '');
    return m ? this.byAlias.get(`employee ${m[1]}`) ?? null : null;
  }

  /** People whose name contains every word of `query` (case-insensitive). */
  search(query: string): AliasPerson[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return [...this.byAlias.values()].filter(p => { const hay = `${p.name} ${p.alias || ''}`.toLowerCase(); return words.every(w => hay.includes(w)); });
  }

  /**
   * Closest people when nothing matches exactly: every word of the query is compared with every word of each
   * name, allowing 1 slip in short words and 2 in longer ones ("Anien" finds "Anain"). Best matches first.
   */
  fuzzySearch(query: string): { person: AliasPerson; distance: number }[] {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
    if (!words.length) return [];
    const out: { person: AliasPerson; distance: number }[] = [];
    for (const p of this.byAlias.values()) {
      const parts = `${p.name} ${p.alias || ''}`.toLowerCase().split(/\s+/).filter(Boolean);
      let total = 0; let ok = true;
      for (const w of words) {
        const best = Math.min(...parts.map(t => editDistance(w, t)));
        const allowed = w.length <= 4 ? 1 : 2;
        if (best > allowed) { ok = false; break; }
        total += best;
      }
      if (ok) out.push({ person: p, distance: total });
    }
    return out.sort((a, b) => a.distance - b.distance).slice(0, 4);
  }

  /** Real names -> aliases. */
  redact(text: string): string {
    let out = text;
    for (const f of this.fullNames) out = out.replace(f.re, f.alias);
    for (const t of this.tokens) out = out.replace(t.re, t.alias);
    return out;
  }

  /** Aliases -> real names (the person's full name). */
  restore(text: string): string {
    const name = (n: string) => { const p = this.byAlias.get(`employee ${n}`); return p ? (p.alias ? `${p.name} (${p.alias})` : p.name) : undefined; };
    // "Employees 10 and 9" / "Employees 16, 4, 9" -> a list of real names.
    const plural = text.replace(/\bEmployees (\d{1,3}(?:(?:,\s*|\s+and\s+|\s*&\s*)\d{1,3})*)\b/g, (m, list: string) => {
      const names = list.split(/,\s*|\s+and\s+|\s*&\s*/).map(n => name(n));
      if (names.some(n => !n)) return m;
      return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    });
    return plural.replace(/\bEmployee (\d{1,3})\b/g, (m, n: string) => name(n) ?? m);
  }
}
