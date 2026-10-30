/** Helpers shared by the Raft labs: building clusters from learner code and checking Raft's safety properties. */
import { Sim, NodeId, NodeFactory } from './dsim';
import { AssertionError, deepEqual, show } from '../grader/expect';

export function nodeNames(n: number): NodeId[] {
  return Array.from({ length: n }, (_, i) => 'n' + (i + 1));
}

export function makeCluster(env: Record<string, any>, opts: { seed: number; n?: number; latency?: [number, number]; drop?: number }): Sim {
  if (typeof env.createNode !== 'function') throw new AssertionError('Define a function `createNode(id, peers)` that returns your node object.');
  const sim = new Sim({ seed: opts.seed, nodes: nodeNames(opts.n ?? 5), factory: env.createNode as NodeFactory, latency: opts.latency, drop: opts.drop });
  sim.start();
  return sim;
}

export function statusOf(sim: Sim, id: NodeId): any {
  const n = sim.node(id);
  if (!n) return undefined;
  if (typeof n.status !== 'function') throw new AssertionError('Your node needs a `status()` method returning { role, term, commitIndex, log }.');
  const s = n.status();
  if (!s || typeof s.term !== 'number' || typeof s.role !== 'string') throw new AssertionError('status() must return an object with a numeric `term` and a string `role` ("follower" | "candidate" | "leader"). Got ' + show(s));
  return s;
}

export function leaders(sim: Sim): { id: NodeId; term: number }[] {
  const out: { id: NodeId; term: number }[] = [];
  for (const id of sim.nodes) {
    const s = statusOf(sim, id);
    if (s && s.role === 'leader') out.push({ id, term: s.term });
  }
  return out;
}

/** Checks Raft's key safety properties as the simulation runs. */
export class RaftInvariants {
  private leadersByTerm = new Map<number, Set<string>>();
  private lastTerm = new Map<string, number>();
  private committed = new Map<number, { term: number; cmd: unknown }>();
  maxCommitted = 0;

  constructor(private opts: { checkLog?: boolean } = {}) {}

  attach(sim: Sim, every: number, until: number) {
    for (let t = every; t <= until; t += every) sim.at(t, (s) => this.check(s));
  }

  check(sim: Sim) {
    for (const id of sim.nodes) {
      const s = statusOf(sim, id);
      if (!s) continue;
      // terms never go backwards, even across a crash + restart (currentTerm must be persisted!)
      const prev = this.lastTerm.get(id) ?? 0;
      if (s.term < prev) throw new AssertionError(`${id}'s term went backwards (${prev} → ${s.term}) at t=${Math.round(sim.time)}ms. Persist currentTerm before replying, so a restart cannot forget it.`);
      this.lastTerm.set(id, s.term);

      if (s.role === 'leader') {
        const set = this.leadersByTerm.get(s.term) ?? new Set();
        set.add(id);
        this.leadersByTerm.set(s.term, set);
        if (set.size > 1) throw new AssertionError(`Two leaders in term ${s.term}: ${[...set].join(' and ')} (t=${Math.round(sim.time)}ms). Each node may vote only once per term, and it must persist that vote.`);
      }

      if (this.opts.checkLog && Array.isArray(s.log)) {
        const ci = Number(s.commitIndex ?? 0);
        if (ci > s.log.length) throw new AssertionError(`${id}: commitIndex ${ci} is beyond its log length ${s.log.length}.`);
        for (let i = 1; i <= ci; i++) {
          const e = s.log[i - 1];
          const seen = this.committed.get(i);
          if (!seen) this.committed.set(i, { term: e.term, cmd: e.cmd });
          else if (seen.term !== e.term || !deepEqual(seen.cmd, e.cmd)) {
            throw new AssertionError(`State-machine safety violated: log index ${i} was committed as ${show(seen)} but ${id} now has ${show({ term: e.term, cmd: e.cmd })} there (t=${Math.round(sim.time)}ms).`);
          }
          this.maxCommitted = Math.max(this.maxCommitted, i);
        }
        // log matching: same index & term ⇒ identical prefix
        for (const other of sim.nodes) {
          if (other >= id) continue;
          const o = statusOf(sim, other);
          if (!o || !Array.isArray(o.log)) continue;
          const lim = Math.min(o.log.length, s.log.length);
          for (let i = lim; i >= 1; i--) {
            if (o.log[i - 1].term === s.log[i - 1].term) {
              for (let j = 1; j <= i; j++) {
                if (o.log[j - 1].term !== s.log[j - 1].term) throw new AssertionError(`Log matching violated between ${other} and ${id}: they agree on (index ${i}, term ${s.log[i - 1].term}) but differ earlier at index ${j}.`);
              }
              break;
            }
          }
        }
      }
    }
  }
}
