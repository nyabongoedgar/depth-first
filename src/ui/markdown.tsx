/**
 * A small markdown renderer for lesson content. Supports: headings, paragraphs, lists, tables,
 * fenced code (with ```js run → runnable), callouts (:::tip/warn/deep/interview ... :::),
 * display math ($$ ... $$), inline `code`, **bold**, *italic*, [links](url) and inline $math$.
 * Content is first-party and rendered into vnodes (no raw HTML), so there is no injection surface.
 */
import { h, type ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Editor } from './Editor';
import { runSnippetInWorker } from '../runner/client';

type Node =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'code'; lang: string; flags: string; code: string }
  | { t: 'list'; ordered: boolean; items: string[] }
  | { t: 'callout'; kind: string; text: string }
  | { t: 'math'; tex: string }
  | { t: 'table'; head: string[]; rows: string[][] };

const isBlank = (l: string) => l.trim() === '';

export function parseBlocks(src: string): Node[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: Node[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }

    const fence = /^```(\S*)\s*(.*)$/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++;
      out.push({ t: 'code', lang: fence[1], flags: fence[2], code: body.join('\n') });
      continue;
    }
    const callout = /^:::(tip|warn|deep|interview)\s*$/.exec(line);
    if (callout) {
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') body.push(lines[i++]);
      i++;
      out.push({ t: 'callout', kind: callout[1], text: body.join('\n') });
      continue;
    }
    if (line.trim().startsWith('$$')) {
      let tex = line.trim().slice(2);
      if (tex.endsWith('$$') && tex.length >= 2) { out.push({ t: 'math', tex: tex.slice(0, -2) }); i++; continue; }
      const body = [tex];
      i++;
      while (i < lines.length && !lines[i].includes('$$')) body.push(lines[i++]);
      if (i < lines.length) body.push(lines[i].slice(0, lines[i].indexOf('$$')));
      i++;
      out.push({ t: 'math', tex: body.join('\n') });
      continue;
    }
    const hm = /^(#{1,4})\s+(.*)$/.exec(line);
    if (hm) { out.push({ t: 'h', level: hm[1].length, text: hm[2] }); i++; continue; }
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      out.push({ t: 'table', head, rows });
      continue;
    }
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      const ordered = !!ol;
      const items: string[] = [];
      while (i < lines.length) {
        const m = ordered ? /^\s*\d+[.)]\s+(.*)$/.exec(lines[i]) : /^\s*[-*]\s+(.*)$/.exec(lines[i]);
        if (m) { items.push(m[1]); i++; }
        else if (/^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1] += ' ' + lines[i].trim(); i++; }
        else break;
      }
      out.push({ t: 'list', ordered, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^(```|:::|#{1,4}\s|\s*[-*]\s|\s*\d+[.)]\s|\$\$|\|)/.test(lines[i])) para.push(lines[i++]);
    if (para.length === 0) { para.push(lines[i++]); }
    out.push({ t: 'p', text: para.join(' ') });
  }
  return out;
}

const INLINE = /(`[^`]+`)|(\$[^\s$`](?:[^$`]*[^\s$`])?\$)|(\*\*[^*]+\*\*)|(\*[^\s*][^*]*\*)|(\[[^\]]+\]\([^)]+\))/g;

export function inline(s: string): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  let last = 0;
  // matchAll clones the regex, so the recursive calls below can't corrupt this loop's position
  for (const m of s.matchAll(INLINE)) {
    const idx = m.index!;
    const t = m[0];
    if (idx > last) out.push(s.slice(last, idx));
    if (m[1]) out.push(<code>{t.slice(1, -1)}</code>);
    else if (m[2]) out.push(<span class="math" dangerouslySetInnerHTML={{ __html: katex.renderToString(t.slice(1, -1), { throwOnError: false }) }} />);
    else if (m[3]) out.push(<strong>{inline(t.slice(2, -2))}</strong>);
    else if (m[4]) out.push(<em>{inline(t.slice(1, -1))}</em>);
    else if (m[5]) {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!;
      const url = lm[2];
      out.push(/^https?:/.test(url) ? <a href={url} target="_blank" rel="noopener noreferrer">{lm[1]}</a> : <a href={url}>{lm[1]}</a>);
    }
    last = idx + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

const CALLOUT_META: Record<string, { icon: string; title: string }> = {
  tip: { icon: '💡', title: 'Tip' },
  warn: { icon: '⚠️', title: 'Watch out' },
  deep: { icon: '🔬', title: 'Deep dive' },
  interview: { icon: '🎯', title: 'Interview angle' },
};

export function RunBlock({ code, expectError }: { code: string; expectError?: boolean }) {
  const [src, setSrc] = useState(code);
  const [out, setOut] = useState<{ logs: string[]; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      setOut(await runSnippetInWorker(src));
    } catch (e: any) {
      setOut({ logs: [], error: String(e.message ?? e) });
    }
    setBusy(false);
  };
  return (
    <div class="runblock">
      <div class="runblock-head">
        <span>▶ Try it — edit, then run</span>
        <span class="spacer" />
        {src !== code && <button class="btn ghost sm" onClick={() => { setSrc(code); setOut(null); }}>Reset</button>}
        <button class="btn primary sm" disabled={busy} onClick={run}>{busy ? 'Running…' : 'Run ▶'}</button>
      </div>
      <Editor value={src} onChange={setSrc} onRun={run} minHeight={48} maxHeight={420} />
      {out && (
        <pre class="output">
          {out.logs.join('\n')}
          {out.error && <span class="err">{(out.logs.length ? '\n' : '') + '✖ ' + out.error}</span>}
          {!out.logs.length && !out.error && <span class="dim">(no console output)</span>}
        </pre>
      )}
    </div>
  );
}

function renderNode(n: Node, key: number): ComponentChildren {
  switch (n.t) {
    case 'h':
      return h(`h${Math.min(n.level + 1, 5)}` as any, { key, id: slug(n.text) }, inline(n.text));
    case 'p':
      return <p key={key}>{inline(n.text)}</p>;
    case 'list': {
      const Tag = n.ordered ? 'ol' : 'ul';
      return <Tag key={key}>{n.items.map((it, i) => <li key={i}>{inline(it)}</li>)}</Tag>;
    }
    case 'code':
      if (/^run/.test(n.flags) && (n.lang === 'js' || n.lang === 'javascript')) return <RunBlock key={key} code={n.code} expectError={n.flags.includes(':error')} />;
      return <pre key={key} class="static"><code>{n.code}</code></pre>;
    case 'callout': {
      const meta = CALLOUT_META[n.kind];
      return (
        <aside key={key} class={`callout ${n.kind}`}>
          <div class="callout-title">{meta.icon} {meta.title}</div>
          <Markdown text={n.text} />
        </aside>
      );
    }
    case 'math':
      return <div key={key} class="math-block" dangerouslySetInnerHTML={{ __html: katex.renderToString(n.tex, { displayMode: true, throwOnError: false }) }} />;
    case 'table':
      return (
        <div key={key} class="table-wrap">
          <table>
            <thead><tr>{n.head.map((c, i) => <th key={i}>{inline(c)}</th>)}</tr></thead>
            <tbody>{n.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function Markdown({ text }: { text: string }) {
  return <div class="md">{parseBlocks(text).map(renderNode)}</div>;
}
