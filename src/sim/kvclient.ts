/** A retrying key-value client driver that records an operation history for the linearizability checker. */
import { Sim, NodeId } from './dsim';
import type { HistOp } from './lin';

export interface ClientOpts {
  /** how long to wait for a response before retrying elsewhere */
  timeout?: number;
  maxAttempts?: number;
}

export class KvDriver {
  readonly history: HistOp[] = [];
  private nextId = 1;
  private pending = new Map<string, { op: HistOp; attempts: number; target: number; pin?: NodeId }>();
  private timeout: number;
  private maxAttempts: number;
  private hint: NodeId | null = null;

  constructor(private sim: Sim, opts: ClientOpts = {}) {
    this.timeout = opts.timeout ?? 350;
    this.maxAttempts = opts.maxAttempts ?? 14;
    const prev = sim.onResponse;
    sim.onResponse = (r) => {
      prev?.(r);
      this.onResponse(r);
    };
  }

  private onResponse(r: { t: number; node: NodeId; opId: string | number; body: any }) {
    const p = this.pending.get(String(r.opId));
    if (!p) return;
    const b = r.body;
    if (b && b.ok === false) {
      if (b.leader && this.sim.nodes.includes(b.leader)) this.hint = b.leader;
      this.retry(String(r.opId), 10);
      return;
    }
    p.op.ret = r.t;
    if (p.op.type === 'get') p.op.result = b ? b.value : undefined;
    this.pending.delete(String(r.opId));
    this.hint = r.node;
  }

  private attempt(opId: string, delay = 0) {
    const p = this.pending.get(opId);
    if (!p) return;
    p.attempts++;
    const nodes = this.sim.nodes;
    const target = p.pin ?? (this.hint && p.attempts % 3 !== 0 ? this.hint : nodes[(p.target + p.attempts) % nodes.length]);
    this.sim.clientRequest(this.sim.time + delay, target, {
      opId,
      clientId: p.op.client,
      op: p.op.type === 'put' ? { type: 'put', key: p.op.key, value: p.op.value } : { type: 'get', key: p.op.key },
    });
    this.sim.at(this.sim.time + delay + this.timeout, () => {
      if (this.pending.has(opId)) this.retry(opId, 0);
    });
  }

  private retry(opId: string, delay: number) {
    const p = this.pending.get(opId);
    if (!p || p.attempts >= this.maxAttempts) return;
    this.attempt(opId, delay);
  }

  private issue(t: number, client: string, op: Omit<HistOp, 'id' | 'client' | 'invoke'>, pin?: NodeId) {
    this.sim.at(t, () => {
      const id = this.nextId++;
      const full: HistOp = { id, client, invoke: this.sim.time, ...op };
      this.history.push(full);
      const opId = `${client}-${id}`;
      this.pending.set(opId, { op: full, attempts: 0, target: id, pin });
      this.attempt(opId);
    });
  }

  /** `pin` forces every attempt to go to one specific node. */
  put(t: number, client: string, key: string, value: unknown, pin?: NodeId) {
    this.issue(t, client, { type: 'put', key, value }, pin);
  }
  get(t: number, client: string, key: string, pin?: NodeId) {
    this.issue(t, client, { type: 'get', key }, pin);
  }
  completed() {
    return this.history.filter((o) => o.ret !== undefined).length;
  }
}
