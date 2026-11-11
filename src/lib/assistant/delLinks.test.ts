import { describe, expect, it } from 'vitest';
import { AliasMap } from './aliases';
import { cleanChatForSave } from './history';
import { marker, markersToLinks, markTickets, parseDelLink, stripDelLinks } from './delLinks';

const ID = 'rrv51zg01i5mw3k';
const tickets = new Map([[ID, 'Registration number required'], ['ic6natzp8pkavi0', 'Tracker issue']]);
const table = `| Ticket ID | From | Title | Age |\n|---|---|---|---|\n| ${ID} | Eman Jabbar | Registration number required | 91 |\n| ic6natzp8pkavi0 | Josh | Tracker issue | 55 |`;

describe('names, ticket ids and titles become links', () => {
  it('links a ticket id and a title that is a whole table cell', () => {
    const out = markersToLinks(markTickets(table, tickets));
    expect(out).toContain(`| [${ID}](del://ticket/${ID}) |`);
    expect(out).toContain(`| [Registration number required](del://ticket/${ID}) |`);
    expect(out).toContain('| [Tracker issue](del://ticket/ic6natzp8pkavi0) |');
  });
  it('never turns an ordinary word in a sentence into a link', () => {
    const out = markersToLinks(markTickets('Several people raised a tracker issue this week, and a registration number required form.', tickets));
    expect(out).not.toContain('del://');
  });
  it('does not link inside a link that is already there, and removes stray markers', () => {
    const once = markTickets(`${marker('employee', 'p1', 'Eman Jabbar')} wrote ${ID}`, tickets);
    expect(markersToLinks(once)).toBe(`[Eman Jabbar](del://employee/p1) wrote [${ID}](del://ticket/${ID})`);
    expect(markersToLinks('text \u0001 broken \u0003')).toBe('text  broken ');
  });
  it('keeps a label from breaking the link', () => {
    expect(markersToLinks(marker('employee', 'p1', 'Name [x] (nick)\n'))).toBe('[Name x (nick)](del://employee/p1)');
  });
  it('only reads a link of exactly this shape, and strips them for copying', () => {
    expect(parseDelLink('[Ali](del://employee/abc123)')).toEqual({ label: 'Ali', kind: 'employee', id: 'abc123' });
    expect(parseDelLink('[Ali](https://evil.example/x)')).toBeNull();
    expect(parseDelLink('[Ali](del://admin/abc123)')).toBeNull();
    expect(parseDelLink('[Ali](del://employee/abc/../x)')).toBeNull();
    expect(stripDelLinks(`See [${ID}](del://ticket/${ID}) and [Ali](del://employee/abc)`)).toBe(`See ${ID} and Ali`);
  });
});

describe('aliases become person links in the answer', () => {
  const m = new AliasMap([{ id: 'a1', name: 'Eman Jabbar', alias: 'Emily' }, { id: 'a2', name: 'Hamza Tariq' }]);
  it('wraps each restored name', () => {
    const e1 = m.aliasOf('a1'); const e2 = m.aliasOf('a2');
    const out = markersToLinks(m.restoreWith(`${e1} and ${e2} replied.`, (p, label) => marker('employee', p.id, label)));
    expect(out).toBe('[Eman Jabbar (Emily)](del://employee/a1) and [Hamza Tariq](del://employee/a2) replied.');
    expect(m.restore(`${e1} replied.`)).toBe('Eman Jabbar (Emily) replied.');
  });
});

describe('saved chats keep what the screen needs', () => {
  it('keeps the time and the repeat marker, and drops anything odd', () => {
    const out = cleanChatForSave([{ id: 'a', role: 'user', content: 'q', at: 1_700_000_000_000, repeatOf: 'x'.repeat(50) }, { id: 'b', role: 'assistant', content: 'a', at: 'soon', usage: { promptTokens: 10, completionTokens: -5, totalTokens: 5, steps: 1 } }])!;
    expect(out[0]).toMatchObject({ at: 1_700_000_000_000, repeatOf: 'x'.repeat(20) });
    expect(out[1].at).toBeUndefined();
    expect(out[1].usage).toMatchObject({ completionTokens: 0, steps: 1 });
  });
});
