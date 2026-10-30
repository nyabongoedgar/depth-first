/**
 * dsim — a deterministic discrete-event simulator for distributed-systems labs.
 *
 * Everything (message delay, loss, timers, crashes) is driven by virtual time and a seeded PRNG,
 * so a failing run replays exactly from its seed. Learners implement a *node factory*:
 *
 *   function createNode(id, peers) {
 *     return { onStart(ctx){}, onMessage(ctx, from, msg){}, onTimer(ctx, name){}, onClient(ctx, req){}, status(){} };
 *   }
 */
import { Rng } from '../grader/rng';

export type NodeId = string;

export interface Ctx {
  id: NodeId;
  peers: NodeId[];
  now(): number;
  send(to: NodeId, body: unknown): void;
  broadcast(body: unknown): void;
  setTimer(name: string, ms: number): void;
  cancelTimer(name: string): void;
  rand(): number;
  storage: { get(key: string): any; set(key: string, value: any): void; delete(key: string): void };
  log(...args: unknown[]): void;
  /** Reply to a client request. */
  respond(opId: string | number, body: unknown): void;
}

export interface NodeImpl {
  onStart?(ctx: Ctx): void;
  onMessage?(ctx: Ctx, from: NodeId, body: any): void;
  onTimer?(ctx: Ctx, name: string): void;
  onClient?(ctx: Ctx, req: any): void;
  status?(): any;
}

export type NodeFactory = (id: NodeId, peers: NodeId[]) => NodeImpl;

export interface SimConfig {
  seed?: number;
  nodes: NodeId[];
  factory: NodeFactory;
  /** [min, max] one-way latency in ms */
  latency?: [number, number];
  drop?: number;
  dup?: number;
  maxTrace?: number;
}

export interface TraceEvent {
  t: number;
  kind: 'send' | 'deliver' | 'drop' | 'timer' | 'crash' | 'restart' | 'partition' | 'heal' | 'client' | 'respond' | 'log' | 'error' | 'state';
  node?: NodeId;
  from?: NodeId;
  to?: NodeId;
  label?: string;
  sentAt?: number;
  info?: any;
}

interface Ev {
  t: number;
  seq: number;
  run: () => void;
}

class Heap {
  private a: Ev[] = [];
  get size() {
    return this.a.length;
  }
  private less(i: number, j: number) {
    const x = this.a[i];
    const y = this.a[j];
    return x.t < y.t || (x.t === y.t && x.seq < y.seq);
  }
  push(e: Ev) {
    this.a.push(e);
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      [this.a[i], this.a[p]] = [this.a[p], this.a[i]];
      i = p;
    }
  }
  peek(): Ev | undefined {
    return this.a[0];
  }
  pop(): Ev | undefined {
    const top = this.a[0];
    const last = this.a.pop()!;
    if (this.a.length) {
      this.a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.a.length && this.less(l, m)) m = l;
        if (r < this.a.length && this.less(r, m)) m = r;
        if (m === i) break;
        [this.a[i], this.a[m]] = [this.a[m], this.a[i]];
        i = m;
      }
    }
    return top;
  }
}

const labelOf = (body: any): string => {
  if (body && typeof body === 'object') return String(body.type ?? body.kind ?? body.t ?? 'msg');
  return String(body);
};

const clone = <T>(v: T): T => (v === undefined ? v : typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

export class Sim {
  time = 0;
  readonly trace: TraceEvent[] = [];
  readonly errors: string[] = [];
  readonly rng: Rng;
  readonly nodes: NodeId[];
  readonly responses: { t: number; node: NodeId; opId: string | number; body: any }[] = [];
  onResponse?: (r: { t: number; node: NodeId; opId: string | number; body: any }) => void;
  /** Observe every message a node sends (for tests). */
  onSend?: (from: NodeId, to: NodeId, body: any, t: number) => void;
  /** Test hook: return true to silently drop a message (targeted fault injection). */
  dropIf?: (from: NodeId, to: NodeId, body: any) => boolean;
  sent = 0;
  delivered = 0;
  dropped = 0;

  private q = new Heap();
  private seq = 0;
  private impl = new Map<NodeId, NodeImpl>();
  private alive = new Map<NodeId, boolean>();
  private epoch = new Map<NodeId, number>();
  private timerGen = new Map<string, number>();
  private disk = new Map<NodeId, Map<string, any>>();
  private group = new Map<NodeId, number>(); // partition group of each node
  private latency: [number, number];
  private drop: number;
  private dup: number;
  private maxTrace: number;
  private ctxs = new Map<NodeId, Ctx>();
  private nextMsg = 1;

  constructor(private cfg: SimConfig) {
    this.rng = new Rng(cfg.seed ?? 1);
    this.nodes = [...cfg.nodes];
    this.latency = cfg.latency ?? [5, 25];
    this.drop = cfg.drop ?? 0;
    this.dup = cfg.dup ?? 0;
    this.maxTrace = cfg.maxTrace ?? 6000;
    for (const id of this.nodes) {
      this.alive.set(id, false);
      this.epoch.set(id, 0);
      this.disk.set(id, new Map());
      this.group.set(id, 0);
    }
  }

  // ---------- scheduling ----------
  at(t: number, run: (sim: Sim) => void) {
    this.q.push({ t: Math.max(t, this.time), seq: this.seq++, run: () => run(this) });
  }

  private rec(e: Omit<TraceEvent, 't'>) {
    if (this.trace.length < this.maxTrace) this.trace.push({ t: this.time, ...e });
  }

  private makeCtx(id: NodeId): Ctx {
    const peers = this.nodes.filter((n) => n !== id);
    const disk = this.disk.get(id)!;
    const sim = this;
    return {
      id,
      peers,
      now: () => sim.time,
      send: (to, body) => sim.send(id, to, body),
      broadcast: (body) => peers.forEach((p) => sim.send(id, p, body)),
      setTimer: (name, ms) => sim.setTimer(id, name, ms),
      cancelTimer: (name) => {
        const k = id + '/' + name;
        sim.timerGen.set(k, (sim.timerGen.get(k) ?? 0) + 1);
      },
      rand: () => sim.rng.float(),
      storage: {
        get: (k) => clone(disk.get(k)),
        set: (k, v) => void disk.set(k, clone(v)),
        delete: (k) => void disk.delete(k),
      },
      log: (...args) => sim.rec({ kind: 'log', node: id, label: args.map(String).join(' ') }),
      respond: (opId, body) => {
        const r = { t: sim.time, node: id, opId, body: clone(body) };
        sim.responses.push(r);
        sim.rec({ kind: 'respond', node: id, label: String(opId) });
        sim.onResponse?.(r);
      },
    };
  }

  private guard(id: NodeId, what: string, fn: () => void) {
    try {
      fn();
    } catch (e: any) {
      if (e && e.name === 'StepBudgetExceeded') throw e;
      const msg = `${id}.${what}: ${e && e.message ? e.message : e}`;
      this.errors.push(msg);
      this.rec({ kind: 'error', node: id, label: msg });
    }
  }

  private setTimer(id: NodeId, name: string, ms: number) {
    const k = id + '/' + name;
    const gen = (this.timerGen.get(k) ?? 0) + 1;
    this.timerGen.set(k, gen);
    const epoch = this.epoch.get(id)!;
    this.at(this.time + Math.max(0, ms), () => {
      if (!this.alive.get(id) || this.epoch.get(id) !== epoch || this.timerGen.get(k) !== gen) return;
      this.rec({ kind: 'timer', node: id, label: name });
      this.guard(id, 'onTimer', () => this.impl.get(id)!.onTimer?.(this.ctxs.get(id)!, name));
    });
  }

  private send(from: NodeId, to: NodeId, body: unknown) {
    if (!this.alive.get(from) || !this.nodes.includes(to)) return;
    this.sent++;
    this.onSend?.(from, to, clone(body), this.time);
    const label = labelOf(body);
    if (this.dropIf?.(from, to, body)) {
      this.dropped++;
      this.rec({ kind: 'drop', from, to, label, info: 'filtered' });
      return;
    }
    const sentAt = this.time;
    const payload = clone(body);
    if (this.rng.float() < this.drop) {
      this.dropped++;
      this.rec({ kind: 'drop', from, to, label });
      return;
    }
    this.rec({ kind: 'send', from, to, label });
    const copies = this.rng.float() < this.dup ? 2 : 1;
    for (let c = 0; c < copies; c++) {
      const [lo, hi] = this.latency;
      const delay = lo + this.rng.float() * (hi - lo);
      this.nextMsg++;
      this.at(this.time + delay, () => {
        if (!this.alive.get(to)) {
          this.dropped++;
          this.rec({ kind: 'drop', from, to, label, info: 'dest down' });
          return;
        }
        if (this.group.get(from) !== this.group.get(to)) {
          this.dropped++;
          this.rec({ kind: 'drop', from, to, label, info: 'partition' });
          return;
        }
        this.delivered++;
        this.rec({ kind: 'deliver', from, to, label, sentAt });
        this.guard(to, 'onMessage', () => this.impl.get(to)!.onMessage?.(this.ctxs.get(to)!, from, clone(payload)));
      });
    }
  }

  // ---------- lifecycle & faults ----------
  private boot(id: NodeId) {
    this.epoch.set(id, this.epoch.get(id)! + 1);
    this.alive.set(id, true);
    const ctx = this.makeCtx(id);
    this.ctxs.set(id, ctx);
    let impl: NodeImpl | undefined;
    this.guard(id, 'factory', () => {
      impl = this.cfg.factory(id, ctx.peers);
    });
    if (!impl) {
      this.alive.set(id, false);
      return;
    }
    this.impl.set(id, impl);
    this.guard(id, 'onStart', () => impl!.onStart?.(ctx));
  }

  start(stagger = 3) {
    this.nodes.forEach((id, i) => this.at(i * stagger, () => this.boot(id)));
  }
  crash(id: NodeId, t = this.time) {
    this.at(t, () => {
      if (!this.alive.get(id)) return;
      this.alive.set(id, false);
      this.rec({ kind: 'crash', node: id });
    });
  }
  restart(id: NodeId, t = this.time) {
    this.at(t, () => {
      if (this.alive.get(id)) return;
      this.rec({ kind: 'restart', node: id });
      this.boot(id);
    });
  }
  /** Split the cluster into disconnected groups, e.g. partition([['n1','n2'],['n3']]). Unlisted nodes join group 0. */
  partition(groups: NodeId[][], t = this.time) {
    this.at(t, () => {
      this.nodes.forEach((n) => this.group.set(n, 0));
      groups.forEach((g, i) => g.forEach((n) => this.group.set(n, i)));
      this.rec({ kind: 'partition', label: groups.map((g) => g.join('+')).join(' | ') });
    });
  }
  heal(t = this.time) {
    this.at(t, () => {
      this.nodes.forEach((n) => this.group.set(n, 0));
      this.rec({ kind: 'heal' });
    });
  }
  /** Test hook: deliver `body` to `to` as if `from` had sent it — bypassing latency, loss and partitions. */
  inject(t: number, to: NodeId, from: NodeId, body: any) {
    this.at(t, () => {
      if (!this.alive.get(to)) return;
      this.rec({ kind: 'deliver', from, to, label: labelOf(body), sentAt: this.time });
      this.guard(to, 'onMessage', () => this.impl.get(to)!.onMessage?.(this.ctxs.get(to)!, from, clone(body)));
    });
  }
  clientRequest(t: number, node: NodeId, req: any) {
    this.at(t, () => {
      if (!this.alive.get(node)) return; // request lost: node is down
      this.rec({ kind: 'client', node, label: String(req?.opId ?? '') });
      this.guard(node, 'onClient', () => this.impl.get(node)!.onClient?.(this.ctxs.get(node)!, clone(req)));
    });
  }

  // ---------- running ----------
  isAlive(id: NodeId) {
    return !!this.alive.get(id);
  }
  node(id: NodeId): NodeImpl | undefined {
    return this.alive.get(id) ? this.impl.get(id) : undefined;
  }
  /** Status of every live node (calls the learner's `status()`), keyed by id. */
  statuses(): Record<NodeId, any> {
    const out: Record<NodeId, any> = {};
    for (const id of this.nodes) {
      const n = this.node(id);
      if (n?.status) {
        try {
          out[id] = n.status();
        } catch (e: any) {
          this.errors.push(`${id}.status: ${e && e.message}`);
        }
      }
    }
    return out;
  }

  /**
   * Run until virtual time `until`. `after` is called after every event with the sim (use it for
   * invariants: throw to fail the test). Events processed are capped to avoid runaway protocols.
   */
  run(until: number, after?: (sim: Sim) => void, maxEvents = 400_000) {
    let n = 0;
    while (this.q.size && this.q.peek()!.t <= until) {
      if (n++ > maxEvents) throw new Error('The simulation produced too many events — is a node sending messages in an endless loop?');
      const ev = this.q.pop()!;
      this.time = ev.t;
      ev.run();
      if (after) after(this);
    }
    this.time = Math.max(this.time, until);
  }

  /** Sample node statuses every `every` ms (for the roles-over-time strip in the visualiser). */
  sampleStatus(every: number, until: number, pick: (status: any) => any = (s) => ({ role: s.role, term: s.term })) {
    for (let t = every; t <= until; t += every) {
      this.at(t, () => {
        for (const [id, s] of Object.entries(this.statuses())) this.rec({ kind: 'state', node: id, info: pick(s) });
      });
    }
  }

  exportTrace() {
    return { nodes: this.nodes, events: this.trace, end: this.time, sent: this.sent, delivered: this.delivered, dropped: this.dropped, errors: this.errors };
  }
}
