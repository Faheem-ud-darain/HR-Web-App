// Keeps real employee names away from the model provider. Every person gets a stable alias for this
// request ("Employee 3"). Names in the user's messages and in tool results are turned into aliases before
// anything is sent; the aliases in the model's answer are turned back into real names on the server, just
// before the answer is shown to HR/Admin. The provider only ever sees "Employee 3".
export interface AliasPerson { id: string; name: string }

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
      for (const t of full.split(' ')) {
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
    return [...this.byAlias.values()].filter(p => words.every(w => p.name.toLowerCase().includes(w)));
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
    const name = (n: string) => this.byAlias.get(`employee ${n}`)?.name;
    // "Employees 10 and 9" / "Employees 16, 4, 9" -> a list of real names.
    const plural = text.replace(/\bEmployees (\d{1,3}(?:(?:,\s*|\s+and\s+|\s*&\s*)\d{1,3})*)\b/g, (m, list: string) => {
      const names = list.split(/,\s*|\s+and\s+|\s*&\s*/).map(n => name(n));
      if (names.some(n => !n)) return m;
      return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    });
    return plural.replace(/\bEmployee (\d{1,3})\b/g, (m, n: string) => name(n) ?? m);
  }
}
