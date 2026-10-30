import { useMemo, useState } from 'preact/hooks';
import type { TraceEvent } from '../sim/dsim';

interface Trace {
  nodes: string[];
  events: TraceEvent[];
  end: number;
  sent: number;
  delivered: number;
  dropped: number;
  errors: string[];
}

const ROLE_COLOR: Record<string, string> = { leader: '#f0b400', candidate: '#ff8a4c', follower: '#6b7399' };

/** A space-time (Lamport) diagram: one column per node, time flowing downwards, messages as diagonals. */
export function SpaceTime({ trace }: { trace: Trace }) {
  const [hide, setHide] = useState<Record<string, boolean>>({ AppendEntries: false, AppendReply: false });
  const [scale, setScale] = useState(0.12); // px per ms
  const [from, setFrom] = useState(0);

  const labels = useMemo(() => [...new Set(trace.events.filter((e) => e.kind === 'deliver' || e.kind === 'drop').map((e) => e.label!))].sort(), [trace]);
  const colW = 110;
  const left = 50;
  const top = 36;
  const x = (n: string) => left + trace.nodes.indexOf(n) * colW + colW / 2;
  const windowMs = Math.max(1000, trace.end - from);
  const height = Math.min(windowMs * scale, 3200) + top + 20;
  const y = (t: number) => top + (t - from) * scale;
  const visible = (t: number) => t >= from && (t - from) * scale <= height;

  const msgs = trace.events.filter((e) => e.kind === 'deliver' && !hide[e.label!] && visible(e.t)).slice(0, 700);
  const drops = trace.events.filter((e) => e.kind === 'drop' && !hide[e.label!] && visible(e.t)).slice(0, 200);
  const ticks = trace.events.filter((e) => ['crash', 'restart'].includes(e.kind) && visible(e.t));
  const roles = trace.events.filter((e) => e.kind === 'state' && visible(e.t));
  const parts = trace.events.filter((e) => ['partition', 'heal'].includes(e.kind) && visible(e.t));

  // crash bands: [crash, restart) per node
  const bands: { node: string; a: number; b: number }[] = [];
  const open = new Map<string, number>();
  for (const e of trace.events) {
    if (e.kind === 'crash') open.set(e.node!, e.t);
    if (e.kind === 'restart' && open.has(e.node!)) { bands.push({ node: e.node!, a: open.get(e.node!)!, b: e.t }); open.delete(e.node!); }
  }
  for (const [node, a] of open) bands.push({ node, a, b: trace.end });

  return (
    <div class="spacetime">
      <div class="st-controls">
        <label>Zoom <input type="range" min="0.03" max="0.5" step="0.01" value={scale} onInput={(e) => setScale(+(e.target as HTMLInputElement).value)} /></label>
        <label>Start at {Math.round(from)} ms <input type="range" min="0" max={Math.max(0, trace.end - 500)} step="100" value={from} onInput={(e) => setFrom(+(e.target as HTMLInputElement).value)} /></label>
        <span class="st-filter">
          {labels.map((l) => (
            <label key={l} class="chip"><input type="checkbox" checked={!hide[l]} onChange={() => setHide({ ...hide, [l]: !hide[l] })} /> {l}</label>
          ))}
        </span>
      </div>
      <div class="st-scroll">
        <svg width={left + trace.nodes.length * colW + 20} height={height} role="img" aria-label="Space-time diagram of the simulated run">
          {trace.nodes.map((n) => (
            <g key={n}>
              <text x={x(n)} y={20} text-anchor="middle" class="st-node">{n}</text>
              <line x1={x(n)} x2={x(n)} y1={top - 6} y2={height - 6} class="st-lifeline" />
            </g>
          ))}
          {bands.filter((b) => b.b >= from).map((b, i) => (
            <rect key={i} x={x(b.node) - 9} width={18} y={y(Math.max(b.a, from))} height={Math.max(2, (b.b - Math.max(b.a, from)) * scale)} class="st-down" />
          ))}
          {roles.map((r, i) => (
            <circle key={i} cx={x(r.node!)} cy={y(r.t)} r={r.info?.role === 'leader' ? 4 : 2.5} fill={ROLE_COLOR[r.info?.role] ?? '#6b7399'}><title>{`${r.node}: ${r.info?.role} (term ${r.info?.term}) @${Math.round(r.t)}ms`}</title></circle>
          ))}
          {msgs.map((m, i) => (
            <line key={'m' + i} x1={x(m.from!)} y1={y(m.sentAt ?? m.t)} x2={x(m.to!)} y2={y(m.t)} class={`st-msg l-${m.label}`}><title>{`${m.label}  ${m.from} → ${m.to}  (${Math.round(m.sentAt ?? m.t)}→${Math.round(m.t)} ms)`}</title></line>
          ))}
          {drops.map((m, i) => (
            <g key={'d' + i}><line x1={x(m.from!)} y1={y(m.t)} x2={x(m.to!)} y2={y(m.t)} class="st-drop" /><title>{`dropped ${m.label} ${m.from} → ${m.to} (${m.info ?? 'lost'})`}</title></g>
          ))}
          {ticks.map((t, i) => (
            <text key={'t' + i} x={x(t.node!)} y={y(t.t)} class="st-event" text-anchor="middle">{t.kind === 'crash' ? '✖' : '↻'}</text>
          ))}
          {parts.map((p, i) => (
            <g key={'p' + i}>
              <line x1={left} x2={left + trace.nodes.length * colW} y1={y(p.t)} y2={y(p.t)} class={p.kind === 'partition' ? 'st-part' : 'st-heal'} />
              <text x={left + 4} y={y(p.t) - 3} class="st-event">{p.kind === 'partition' ? 'partition ' + (p.label ?? '') : 'healed'}</text>
            </g>
          ))}
        </svg>
      </div>
      <div class="st-legend">
        <span><i class="dot" style="background:#f0b400" /> leader</span>
        <span><i class="dot" style="background:#ff8a4c" /> candidate</span>
        <span><i class="dot" style="background:#6b7399" /> follower</span>
        <span>▮ node down</span>
        <span>✖ crash · ↻ restart</span>
        <span>{trace.sent} sent · {trace.delivered} delivered · {trace.dropped} dropped</span>
      </div>
    </div>
  );
}
