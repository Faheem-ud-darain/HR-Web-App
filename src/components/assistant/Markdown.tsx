import React from 'react';

// A tiny, safe renderer for the assistant's answers: paragraphs, bullet and numbered lists, tables,
// **bold**, *italic* and `code`. Everything becomes React text nodes (never raw HTML), so a reply can
// never inject markup or scripts.
function inline(text: string, keyBase: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g);
  return parts.map((p, i) => {
    const key = `${keyBase}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={key} className="font-semibold">{p.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(p)) return <code key={key} className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em]">{p.slice(1, -1)}</code>;
    if (/^\*[^*\s][^*]*\*$/.test(p)) return <em key={key}>{p.slice(1, -1)}</em>;
    return <React.Fragment key={key}>{p}</React.Fragment>;
  });
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isDivider = (l: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes('-');
const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (isTableRow(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) { rows.push(cells(lines[i])); i++; }
      blocks.push(
        <div key={`t${k++}`} className="my-2 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-slate-50 text-slate-600"><tr>{head.map((h, c) => <th key={c} className="px-2.5 py-1.5 font-semibold">{inline(h, `h${c}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri} className="border-t border-slate-100">{r.map((c, ci) => <td key={ci} className="px-2.5 py-1.5 align-top">{inline(c, `c${ri}-${ci}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*•]\s+/, '')); i++; }
      blocks.push(<ul key={`u${k++}`} className="my-1.5 list-disc space-y-0.5 pl-5">{items.map((it, n) => <li key={n}>{inline(it, `li${n}`)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i++; }
      blocks.push(<ol key={`o${k++}`} className="my-1.5 list-decimal space-y-0.5 pl-5">{items.map((it, n) => <li key={n}>{inline(it, `ol${n}`)}</li>)}</ol>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isTableRow(lines[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) { para.push(lines[i]); i++; }
    blocks.push(<p key={`p${k++}`} className="my-1.5 first:mt-0 last:mb-0">{para.map((p, n) => <React.Fragment key={n}>{n > 0 && <br />}{inline(p, `p${n}`)}</React.Fragment>)}</p>);
  }
  return <div className="text-sm leading-relaxed text-slate-800 break-words">{blocks}</div>;
}
