import type { Module } from '../../core/types';
import { ex, prop, hid, lab, jsFile } from '../helpers';
import { Rng } from '../../grader/rng';

/** Run a random schedule of operations and merges on three replicas; return them. */
function simulate(mk: (id: string) => any, apply: (r: any, op: number, rng: Rng) => void, seed: number, steps = 40) {
  const rng = new Rng(seed);
  const reps = ['A', 'B', 'C'].map(mk);
  for (let i = 0; i < steps; i++) {
    const r = rng.int(0, 2);
    if (rng.float() < 0.65) apply(reps[r], rng.int(0, 99), rng);
    else {
      const o = (r + rng.int(1, 2)) % 3;
      reps[r] = reps[r].merge(reps[o]); // one-way gossip; messages may be re-delivered (merge twice) at random
      if (rng.float() < 0.3) reps[r] = reps[r].merge(reps[o]);
    }
  }
  return reps;
}
/** Let everyone merge with everyone (twice) — afterwards all replicas must agree. */
function converge(reps: any[]) {
  for (let round = 0; round < 2; round++) for (let i = 0; i < reps.length; i++) for (let j = 0; j < reps.length; j++) if (i !== j) reps[i] = reps[i].merge(reps[j]);
  return reps;
}

const mod: Module = {
  id: 'crdts',
  course: 'node-dist',
  title: 'CRDTs: Conflict-Free Replicated Data Types',
  minutes: 80,
  objectives: [
    'Explain strong eventual consistency and why CRDTs converge without coordination',
    'State the three merge laws (commutative, associative, idempotent) and test them with properties',
    'Implement a grow-only counter, a PN-counter, an LWW register and an observed-remove set',
    'Choose between CRDTs, consensus and operational transformation',
  ],
  body: `
## The coordination problem

If replicas accept writes independently — for **availability** and **low latency** (offline phones, multi-region databases, collaborative editors) — they will diverge. How do you converge **without locking or consensus**?

A **CRDT** (Conflict-free Replicated Data Type) is a data structure designed so that **concurrent updates never conflict**: any two replicas that have seen the *same set of updates* are in the *same state*, regardless of the order or duplication of deliveries. This property is **strong eventual consistency (SEC)**: replicas that have received the same updates are equal — immediately, no matter how messages were reordered.

CRDTs power Riak, Redis Enterprise, Azure Cosmos DB counters, **Figma**, **Apple Notes**, Automerge/Yjs collaborative editing, and Soundcloud/Phoenix presence.

## State-based CRDTs (CvRDTs)

Replicas exchange their **entire state** and combine with a **merge** function. The state forms a **join semi-lattice**: states have a partial order, and \`merge(a, b)\` is the **least upper bound**. For convergence \`merge\` must be:

- **Commutative:** \`merge(a, b) = merge(b, a)\` — order of arrival doesn't matter.
- **Associative:** \`merge(a, merge(b, c)) = merge(merge(a, b), c)\` — grouping doesn't matter.
- **Idempotent:** \`merge(a, a) = a\` — duplicates are harmless (at-least-once delivery is fine).

and local updates must be **monotonic** (only move up the lattice). (**Operation-based** CRDTs send operations instead of states; they need reliable, causally ordered delivery but are lighter on bandwidth.)

## The classics

**G-Counter** (grow-only): a map \`replicaId → count\`. Each replica only increments its **own** entry; \`value\` = sum; \`merge\` = per-key **max**. (Max is commutative, associative, idempotent.) A plain integer wouldn't work: two replicas each adding 1 concurrently would both write the same number and lose an update.

**PN-Counter:** two G-Counters, **P** (increments) and **N** (decrements); \`value = P − N\`.

**LWW-Register:** value + **timestamp**; \`merge\` keeps the higher timestamp (tie-break deterministically, e.g. by replica id). Simple, but concurrent writes silently lose one — same caveat as last-write-wins databases.

**OR-Set** (observed-remove): add and remove with sensible semantics. Each \`add(x)\` creates a **unique tag**; \`remove(x)\` deletes only the tags it has *observed*. An element is present if it has at least one tag that isn't removed. So a concurrent \`add\` (a new tag nobody removed) survives a \`remove\` — **add-wins**. Merge: union of tags and union of tombstones.

\`\`\`js run
// G-Counter in 12 lines
class G {
  constructor(id, counts = {}) { this.id = id; this.counts = counts; }
  inc(n = 1) { this.counts = { ...this.counts, [this.id]: (this.counts[this.id] || 0) + n }; }
  value() { return Object.values(this.counts).reduce((a, b) => a + b, 0); }
  merge(o) { const c = { ...this.counts }; for (const [k, v] of Object.entries(o.counts)) c[k] = Math.max(c[k] || 0, v); return new G(this.id, c); }
}
const a = new G("A"), b = new G("B");
a.inc(); a.inc(); b.inc(5);                     // concurrent increments on two replicas
console.log(a.merge(b).value(), b.merge(a).value(), a.merge(b).merge(b).value());   // 7 7 7
\`\`\`

## Sequences and text (collaborative editing)

Text is hard: "insert at position 5" means different things after concurrent edits. **Sequence CRDTs** (RGA, Logoot, Treedoc, **Yjs**, **Automerge**) give every character a **unique, ordered identifier** (a position between its neighbours) so inserts commute. **Operational Transformation (OT)** — used by Google Docs — transforms operations against concurrent ones instead, and needs a central server to order them. CRDTs allow peer-to-peer and offline editing at the cost of metadata (tombstones) that must be garbage collected.

## What CRDTs can't do

CRDTs guarantee *convergence*, not that the result satisfies **application invariants** — e.g. a PN-counter can go negative, two replicas can both sell the last ticket. Invariants like "balance ≥ 0" or "unique username" need **coordination** (consensus, escrow/reservations). The **CALM theorem** (Consistency As Logical Monotonicity) says: monotonic programs don't need coordination; non-monotonic ones (needing a "final" answer) do.

:::tip
How do you *test* a CRDT? **Property-based testing**: generate random operation schedules on several replicas, deliver merges in random order with duplicates, and assert that after full exchange all replicas are equal and that the three merge laws hold. That is exactly what the labs below do.
:::

:::interview
"How would you build a shopping-cart / collaborative to-do list that works offline?" — OR-Set (add-wins) per list, LWW registers per field, tombstone GC; explain merge laws, and what you give up (invariants, unbounded metadata).
:::
`,
  quiz: [
    { q: 'Why must a CRDT merge be idempotent?', options: ['For speed', 'Messages may be delivered more than once; merging the same state again must change nothing', 'To save memory', 'Because of JavaScript'], answer: 1, why: 'At-least-once delivery means duplicates are normal.' },
    { q: 'Why can\'t a G-Counter simply be one shared integer?', options: ['Integers overflow', 'Two replicas incrementing concurrently would each write n+1 and one increment would be lost on merge', 'It would be too small', 'Integers are not serialisable'], answer: 1, why: 'Per-replica entries make increments commute; merge takes the max per replica.' },
    { q: 'An OR-Set has x added on replica A. Concurrently replica B (which saw that add) removes x, and replica C adds x again. After merging, is x present?', options: ['Yes — C\'s new add has a tag B never observed, so it survives (add-wins)', 'No — remove always wins', 'Undefined', 'Only on replica C'], answer: 0, why: 'A remove only deletes the tags it observed.' },
    { q: 'What do CRDTs NOT guarantee?', options: ['Convergence', 'That application invariants (e.g. balance ≥ 0, unique usernames) hold', 'Offline operation', 'No coordination'], answer: 1, why: 'Invariants that need a global view require coordination.' },
    { q: 'What does the CALM theorem say?', options: ['Monotonic computations can be made consistent without coordination', 'All distributed systems need consensus', 'Clocks should be calm', 'Use more replicas'], answer: 0, why: 'Coordination is only needed for non-monotonic (retraction/“final answer”) logic.' },
  ],
  labs: [
    lab({
      id: 'nd6-gcounter',
      title: 'G-Counter and PN-Counter',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['crdt'],
      interview: true,
      prompt: `Implement two **state-based** counters. Replicas are identified by an id string.

**\`GCounter\`** — \`new GCounter(id)\`; \`increment(n = 1)\` (adds to **this replica's own** slot; mutates); \`value()\`; \`merge(other)\` → a **new** GCounter (same \`id\` as \`this\`) with the per-replica **maximum**; \`state()\` → a copy of the \`{ replicaId: count }\` map.

**\`PNCounter\`** — \`new PNCounter(id)\`; \`increment(n = 1)\`, \`decrement(n = 1)\`; \`value()\` (increments − decrements, may be negative); \`merge(other)\` → a **new** PNCounter. \`merge\` must **never mutate** either argument.`,
      expose: ['GCounter', 'PNCounter'],
      files: jsFile(`class GCounter {
  constructor(id, counts = {}) {
    this.id = id;
    this.counts = { ...counts };
  }

  increment(n = 1) {}
  value() {}
  merge(other) {}
  state() {}
}

class PNCounter {
  constructor(id) {
    this.id = id;
  }

  increment(n = 1) {}
  decrement(n = 1) {}
  value() {}
  merge(other) {}
}
`, `class GCounter {
  constructor(id, counts = {}) {
    this.id = id;
    this.counts = { ...counts };
  }

  increment(n = 1) {
    this.counts[this.id] = (this.counts[this.id] || 0) + n;
  }

  value() {
    let sum = 0;
    for (const k of Object.keys(this.counts)) sum += this.counts[k];
    return sum;
  }

  merge(other) {
    const merged = { ...this.counts };
    for (const k of Object.keys(other.counts)) merged[k] = Math.max(merged[k] || 0, other.counts[k]);
    return new GCounter(this.id, merged);
  }

  state() {
    return { ...this.counts };
  }
}

class PNCounter {
  constructor(id, p, n) {
    this.id = id;
    this.p = p || new GCounter(id);
    this.n = n || new GCounter(id);
  }

  increment(k = 1) {
    this.p.increment(k);
  }

  decrement(k = 1) {
    this.n.increment(k);
  }

  value() {
    return this.p.value() - this.n.value();
  }

  merge(other) {
    return new PNCounter(this.id, this.p.merge(other.p), this.n.merge(other.n));
  }
}
`),
      tests: [
        ex('G-Counter: concurrent increments are not lost', ({ env, expect }) => {
          const a = new env.GCounter('A'), b = new env.GCounter('B');
          a.increment(); a.increment(); b.increment(5);
          expect(a.merge(b).value()).toBe(7);
          expect(b.merge(a).value()).toBe(7);
        }),
        ex('G-Counter: merge is non-mutating and idempotent', ({ env, expect }) => {
          const a = new env.GCounter('A'), b = new env.GCounter('B');
          a.increment(2); b.increment(3);
          const m = a.merge(b);
          expect([a.value(), b.value()]).toEqual([2, 3]);
          expect(m.merge(b).value()).toBe(5);
          expect(m.merge(m).value()).toBe(5);
          expect(m.state()).toEqual({ A: 2, B: 3 });
        }),
        ex('G-Counter: a replica merged with a stale copy of itself keeps the larger value', ({ env, expect }) => {
          const a = new env.GCounter('A');
          a.increment(2);
          const old = a.merge(new env.GCounter('Z'));
          a.increment(3);
          expect(a.merge(old).value()).toBe(5);
        }),
        ex('PN-Counter: increments and decrements across replicas', ({ env, expect }) => {
          const a = new env.PNCounter('A'), b = new env.PNCounter('B');
          a.increment(10); b.decrement(4); a.decrement(1);
          expect(a.merge(b).value()).toBe(5);
          expect(b.merge(a).value()).toBe(5);
        }),
        ex('PN-Counter can go negative', ({ env, expect }) => {
          const a = new env.PNCounter('A');
          a.decrement(3);
          expect(a.value()).toBe(-3);
        }),
        prop('property: after random operations and gossip every replica converges to the same value (G-Counter)', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 9999)], (seed: number) => {
            const reps = simulate((id) => new env.GCounter(id), (r, op) => r.increment(1 + (op % 3)), seed);
            const total = reps.reduce((s, r) => s + (r.state()[r.id] ?? 0), 0);
            converge(reps);
            expect(reps.map((r) => r.value())).toEqual([total, total, total]);
          }, { runs: 60 });
        }),
        prop('property: PN-Counter converges to the sum of all operations', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 9999)], (seed: number) => {
            let delta = 0;
            const reps = simulate((id) => new env.PNCounter(id), (r, op) => { if (op % 2) { r.increment(op % 5); delta += op % 5; } else { r.decrement(op % 4); delta -= op % 4; } }, seed);
            converge(reps);
            expect(reps.map((r) => r.value())).toEqual([delta, delta, delta]);
          }, { runs: 60 });
        }),
        prop('property: merge is commutative, associative and idempotent (G-Counter)', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(0, 6), 6, 6)], (xs: number[]) => {
            const mk = (id: string, a: number, b: number) => { const c = new env.GCounter(id); c.counts = { A: a, B: b }; return c; };
            const x = mk('A', xs[0], xs[1]), y = mk('B', xs[2], xs[3]), z = mk('C', xs[4], xs[5]);
            expect(x.merge(y).state()).toEqual(y.merge(x).state());
            expect(x.merge(y).merge(z).state()).toEqual(x.merge(y.merge(z)).state());
            expect(x.merge(x).state()).toEqual(x.state());
          });
        }),
      ],
      hints: ['G-Counter state: `counts = { replicaId: n }`. `increment` only touches `counts[this.id]`.', '`merge`: for every key take the **max** of both maps; return a **new** `GCounter` with `this.id`.', 'PN-Counter: hold two G-Counters (`p` and `n`); `value = p.value() - n.value()`; merge each pair.'],
    }),

    lab({
      id: 'nd6-lww',
      title: 'LWW register',
      kind: 'code',
      difficulty: 2,
      minutes: 15,
      tags: ['crdt'],
      prompt: `\`class LWWRegister\` holds one value with a timestamp.

- \`new LWWRegister(id)\` — empty (value \`undefined\`, timestamp \`-Infinity\`).
- \`set(value, timestamp)\` — local write; accepted only if \`(timestamp, id)\` is greater than the current pair.
- \`get()\` → current value.
- \`merge(other)\` → a **new** register holding the entry with the **higher timestamp**; on equal timestamps, the entry written by the **lexicographically larger replica id** wins (a deterministic tie-break so all replicas converge). \`merge\` must be commutative, associative and idempotent and must not mutate its inputs.

Store, for each register, the \`writer\` replica id along with the value.`,
      expose: ['LWWRegister'],
      files: jsFile(`class LWWRegister {
  constructor(id) {
    this.id = id;
    this.value = undefined;
    this.ts = -Infinity;
    this.writer = '';
  }

  set(value, timestamp) {}
  get() {}
  merge(other) {}
}
`, `class LWWRegister {
  constructor(id) {
    this.id = id;
    this.value = undefined;
    this.ts = -Infinity;
    this.writer = '';
  }

  newer(ts, writer) {
    return ts > this.ts || (ts === this.ts && writer > this.writer);
  }

  set(value, timestamp) {
    if (this.newer(timestamp, this.id)) {
      this.value = value;
      this.ts = timestamp;
      this.writer = this.id;
    }
  }

  get() {
    return this.value;
  }

  merge(other) {
    const r = new LWWRegister(this.id);
    r.value = this.value;
    r.ts = this.ts;
    r.writer = this.writer;
    if (r.newer(other.ts, other.writer)) {
      r.value = other.value;
      r.ts = other.ts;
      r.writer = other.writer;
    }
    return r;
  }
}
`),
      tests: [
        ex('the later timestamp wins, in both merge orders', ({ env, expect }) => {
          const a = new env.LWWRegister('A'), b = new env.LWWRegister('B');
          a.set('old', 10); b.set('new', 20);
          expect(a.merge(b).get()).toBe('new');
          expect(b.merge(a).get()).toBe('new');
        }),
        ex('equal timestamps: deterministic tie-break by replica id', ({ env, expect }) => {
          const a = new env.LWWRegister('A'), b = new env.LWWRegister('B');
          a.set('from-A', 5); b.set('from-B', 5);
          expect(a.merge(b).get()).toBe('from-B');
          expect(b.merge(a).get()).toBe('from-B');
        }),
        ex('a stale local write is ignored', ({ env, expect }) => {
          const a = new env.LWWRegister('A');
          a.set('x', 10);
          a.set('older', 3);
          expect(a.get()).toBe('x');
        }),
        ex('empty registers', ({ env, expect }) => {
          const a = new env.LWWRegister('A'), b = new env.LWWRegister('B');
          expect(a.merge(b).get()).toBe(undefined);
          b.set(1, 0);
          expect(a.merge(b).get()).toBe(1);
        }),
        ex('merge does not mutate its inputs', ({ env, expect }) => {
          const a = new env.LWWRegister('A'), b = new env.LWWRegister('B');
          a.set('a', 1); b.set('b', 2);
          a.merge(b);
          expect([a.get(), b.get()]).toEqual(['a', 'b']);
        }),
        prop('property: the three merge laws hold, and replicas converge', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(0, 5), 6, 6)], (xs: number[]) => {
            const mk = (id: string, ts: number, v: number) => { const r = new env.LWWRegister(id); if (ts > 0) r.set('v' + v, ts); return r; };
            const x = mk('A', xs[0], xs[1]), y = mk('B', xs[2], xs[3]), z = mk('C', xs[4], xs[5]);
            expect(x.merge(y).get()).toBe(y.merge(x).get());
            expect(x.merge(y).merge(z).get()).toBe(x.merge(y.merge(z)).get());
            expect(x.merge(x).get()).toBe(x.get());
            const reps = converge([x, y, z]);
            expect(new Set(reps.map((r) => r.get())).size).toBe(1);
          });
        }),
      ],
      hints: ['Compare `(timestamp, replicaId)` pairs: bigger timestamp wins; if equal, the bigger id wins.', 'Write a small helper "is (ts, writer) newer than mine?" and use it in both `set` and `merge`.', '`merge` builds a **new** register, copying `this` and then taking `other` if it is newer.'],
    }),

    lab({
      id: 'nd6-orset',
      title: 'Observed-remove set (add-wins)',
      kind: 'code',
      difficulty: 4,
      minutes: 30,
      tags: ['crdt'],
      interview: true,
      prompt: `Implement \`class ORSet\` (elements are strings/numbers):

- \`new ORSet(id)\`
- \`add(x)\` — create a **unique tag** \`id + ":" + counter\` (the counter increases with every add on this replica) and remember \`(x, tag)\`.
- \`remove(x)\` — tombstone **all tags of x currently observed** on this replica (no effect if x is absent).
- \`has(x)\`, \`values()\` (sorted ascending, using default \`sort()\`... with numbers compared numerically).
- \`merge(other)\` → a **new** ORSet (same \`id\`, and a counter that never reuses a tag) containing the **union** of tags and the **union** of tombstones. \`x\` is present iff it has a tag that is not tombstoned.

Semantics: an add concurrent with a remove **wins** (the remove never saw the new tag).`,
      expose: ['ORSet'],
      files: jsFile(`class ORSet {
  constructor(id) {
    this.id = id;
    this.counter = 0;
    this.tags = new Map(); // element -> Set of tags
    this.tombstones = new Set();
  }

  add(x) {}
  remove(x) {}
  has(x) {}
  values() {}
  merge(other) {}
}
`, `class ORSet {
  constructor(id) {
    this.id = id;
    this.counter = 0;
    this.tags = new Map();
    this.tombstones = new Set();
  }

  add(x) {
    const tag = this.id + ':' + ++this.counter;
    if (!this.tags.has(x)) this.tags.set(x, new Set());
    this.tags.get(x).add(tag);
  }

  remove(x) {
    const ts = this.tags.get(x);
    if (!ts) return;
    for (const t of ts) this.tombstones.add(t);
  }

  has(x) {
    const ts = this.tags.get(x);
    if (!ts) return false;
    for (const t of ts) if (!this.tombstones.has(t)) return true;
    return false;
  }

  values() {
    return [...this.tags.keys()].filter((x) => this.has(x)).sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
  }

  merge(other) {
    const r = new ORSet(this.id);
    r.counter = this.counter;
    for (const src of [this, other]) {
      for (const [x, ts] of src.tags) {
        if (!r.tags.has(x)) r.tags.set(x, new Set());
        for (const t of ts) r.tags.get(x).add(t);
      }
      for (const t of src.tombstones) r.tombstones.add(t);
    }
    return r;
  }
}
`),
      tests: [
        ex('add / has / values / remove', ({ env, expect }) => {
          const s = new env.ORSet('A');
          s.add('x'); s.add('y');
          expect([s.has('x'), s.has('z')]).toEqual([true, false]);
          s.remove('x');
          expect(s.values()).toEqual(['y']);
          s.remove('never-added');
        }),
        ex('an element can be re-added after removal', ({ env, expect }) => {
          const s = new env.ORSet('A');
          s.add('x'); s.remove('x'); s.add('x');
          expect(s.has('x')).toBe(true);
        }),
        ex('merge unions the sets', ({ env, expect }) => {
          const a = new env.ORSet('A'), b = new env.ORSet('B');
          a.add('x'); b.add('y');
          expect(a.merge(b).values()).toEqual(['x', 'y']);
          expect(b.merge(a).values()).toEqual(['x', 'y']);
        }),
        ex('a remove travels with the merge', ({ env, expect }) => {
          const a = new env.ORSet('A');
          a.add('x');
          const b = a.merge(new env.ORSet('B')); // B has seen the add
          b.remove('x');
          expect(a.merge(b).has('x')).toBe(false);
        }),
        ex('ADD WINS: a concurrent add survives a remove', ({ env, expect }) => {
          const a = new env.ORSet('A');
          a.add('x');
          const b = a.merge(new env.ORSet('B'));
          const c = a.merge(new env.ORSet('C'));
          b.remove('x'); // B removes the x it saw …
          c.add('x'); // … while C concurrently adds x again (a tag nobody has seen)
          const merged = b.merge(c);
          expect(merged.has('x')).toBe(true);
          expect(c.merge(b).has('x')).toBe(true);
        }),
        ex('merge does not mutate its inputs and keeps tags unique after a merge', ({ env, expect }) => {
          const a = new env.ORSet('A'), b = new env.ORSet('B');
          a.add('x'); b.add('y');
          a.merge(b);
          expect([a.values(), b.values()]).toEqual([['x'], ['y']]);
          const m = a.merge(b);
          m.add('x');
          expect(m.merge(a).has('x')).toBe(true);
        }),
        prop('property: random add/remove/merge schedules converge to the same set on all replicas', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 9999)], (seed: number) => {
            const reps = simulate((id) => new env.ORSet(id), (r, op) => { const x = 'e' + (op % 4); if (op % 3 === 0) r.remove(x); else r.add(x); }, seed, 50);
            converge(reps);
            const v = reps.map((r) => JSON.stringify(r.values()));
            expect(new Set(v).size).toBe(1);
          }, { runs: 80 });
        }),
        prop('property: merge is commutative, associative and idempotent (observable state)', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 9999)], (seed: number) => {
            const [x, y, z] = simulate((id) => new env.ORSet(id), (r, op) => { const e = 'e' + (op % 3); if (op % 4 === 0) r.remove(e); else r.add(e); }, seed, 30);
            const v = (s: any) => JSON.stringify(s.values());
            expect(v(x.merge(y))).toBe(v(y.merge(x)));
            expect(v(x.merge(y).merge(z))).toBe(v(x.merge(y.merge(z))));
            expect(v(x.merge(x))).toBe(v(x));
          }, { runs: 80 });
        }),
      ],
      hints: ['State: `tags: Map<element, Set<tag>>` and a global `tombstones: Set<tag>`.', '`add`: generate a brand-new tag `id + ":" + ++counter` and add it to the element\'s tag set.', '`remove(x)`: copy **all currently known tags of x** into `tombstones` — that is "observed-remove".', '`has(x)`: some tag of `x` is not in `tombstones`. `merge`: union both maps of tags and both tombstone sets into a fresh set.'],
      why: 'OR-Sets are the building block for CRDT maps, JSON documents (Automerge) and shopping carts.',
    }),
  ],
  references: [
    { title: 'A comprehensive study of Convergent and Commutative Replicated Data Types — Shapiro et al., INRIA 2011' },
    { title: 'Conflict-free Replicated Data Types: an overview (crdt.tech)', url: 'https://crdt.tech/' },
    { title: 'Keeping CALM: when distributed consistency is easy — Hellerstein & Alvaro, CACM 2020' },
  ],
};
export default mod;
