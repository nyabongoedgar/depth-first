/** Seeded random fault schedules for simulator tests. */
import { Rng } from '../grader/rng';
import { Sim, NodeId } from './dsim';

export interface FaultOpts {
  /** time window in which faults may start */
  from?: number;
  until?: number;
  crashes?: number;
  partitions?: number;
  /** keep a majority alive/connected at all times (for liveness tests) */
  keepMajority?: boolean;
}

/** Schedule crashes (each followed by a restart) and partitions (each followed by a heal). */
export function randomFaults(sim: Sim, seed: number, opts: FaultOpts = {}) {
  const r = new Rng(seed * 7919 + 13);
  const from = opts.from ?? 600;
  const until = opts.until ?? 5000;
  const nodes = sim.nodes;
  const crashes = opts.crashes ?? 3;
  const partitions = opts.partitions ?? 2;
  for (let i = 0; i < crashes; i++) {
    const id = r.pick(nodes);
    const t = from + r.float() * (until - from);
    sim.crash(id, t);
    sim.restart(id, t + 200 + r.float() * 900);
  }
  for (let i = 0; i < partitions; i++) {
    const t = from + r.float() * (until - from);
    const shuffled = r.shuffle([...nodes]);
    const k = opts.keepMajority ? Math.floor((nodes.length - 1) / 2) : r.int(1, nodes.length - 1);
    const minority: NodeId[] = shuffled.slice(0, Math.max(1, k));
    const rest = shuffled.slice(minority.length);
    sim.partition([rest, minority], t);
    sim.heal(t + 300 + r.float() * 1000);
  }
}
