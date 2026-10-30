import type { Module } from '../../core/types';
import { ex, prop, hid, lab, jsFile } from '../helpers';
import { Rng } from '../../grader/rng';

const mod: Module = {
  id: 'time-clocks',
  course: 'node-dist',
  title: 'Time, Ordering & Logical Clocks (Lamport, Vector, Hybrid)',
  minutes: 75,
  objectives: [
    'Explain why wall-clock time cannot order events across machines',
    'Define "happened-before" and implement Lamport clocks, vector clocks and hybrid logical clocks',
    'Detect concurrent updates and resolve (or keep) conflicting versions Dynamo-style',
    'Choose between last-write-wins and conflict-preserving approaches',
  ],
  body: `
## Why physical clocks are not enough

Every machine has its own clock, and they **drift** (typically 10–200 ppm: seconds per day) and **jump** (NTP corrections, leap seconds, VM pauses, an operator setting the time). Even NTP-synchronised clocks differ by milliseconds to hundreds of milliseconds. So "event A has timestamp 10:00:00.003 and B has 10:00:00.001 — therefore B happened first" is **unsafe** across machines. Systems that rely on it silently lose data (last-write-wins with skewed clocks) — a recurring finding in Jepsen tests.

Google Spanner solved it with hardware (GPS + atomic clocks, the **TrueTime** API returning an *uncertainty interval* \`[earliest, latest]\`, and "commit wait" until the interval has passed). Most of us instead use **logical** time.

## Happened-before (Lamport, 1978)

Define a partial order \`a → b\` ("a happened before b") when:

1. \`a\` and \`b\` are on the **same process** and \`a\` comes first;
2. \`a\` is the **send** of a message and \`b\` is its **receive**;
3. transitively: \`a → c\` and \`c → b\` ⇒ \`a → b\`.

Events with neither \`a → b\` nor \`b → a\` are **concurrent** (\`a ∥ b\`): neither could have influenced the other. Concurrent doesn't mean "at the same instant" — it means *causally unrelated*.

## Lamport clocks

Each process keeps an integer counter \`L\`:

- before any local event (including a send): \`L = L + 1\`;
- on **send**: attach \`L\` to the message;
- on **receive** of timestamp \`t\`: \`L = max(L, t) + 1\`.

**Guarantee:** if \`a → b\` then \`L(a) < L(b)\`. **But not the converse:** \`L(a) < L(b)\` does *not* mean \`a → b\` — the events might be concurrent. Lamport clocks give a consistent total order (break ties with the process id) but cannot *detect* concurrency.

## Vector clocks

To detect concurrency, keep **one counter per process**: a vector \`V\`.

- local event / send at process \`i\`: \`V[i]++\`; attach the whole vector to the message;
- receive vector \`W\`: \`V[k] = max(V[k], W[k])\` for every \`k\`, then \`V[i]++\`.

**Comparison:** \`V ≤ W\` if every component is ≤. Then:
- \`V < W\` (≤ and ≠) ⇒ **V happened before W**;
- \`W < V\` ⇒ W before V;
- neither ⇒ **concurrent**; equal ⇒ same event/history.

Now \`a → b ⇔ V(a) < V(b)\` — an exact characterisation. The cost: O(number of processes) space per event (hence **dotted version vectors** and other compact variants in databases).

## Dynamo-style conflict handling

In an AP database (Riak, Dynamo, Cassandra with LWW off) a key may be written on different replicas during a partition. Each version carries a **version vector**:

- if one version's vector **dominates** (is ≥) another's, the older one is **obsolete** — drop it;
- if neither dominates, the writes were **concurrent**: keep **both as "siblings"** and let the application (or a CRDT, next lessons) **merge** them on read.

**Last-write-wins (LWW)** instead keeps the version with the largest *physical* timestamp: simple, always converges, but silently **discards** concurrent writes and breaks under clock skew. Use it only when losing an update is acceptable (caches, "last seen" fields).

## Hybrid logical clocks (HLC)

An HLC timestamp is a pair \`(l, c)\`: \`l\` tracks the **largest physical time seen** (so timestamps stay close to real time and are human-readable), \`c\` is a small **counter** that breaks ties and preserves causality when physical time doesn't advance. It combines the order-preserving property of Lamport clocks with closeness to wall-clock time, in **O(1) space** — used by CockroachDB, YugabyteDB and MongoDB.

\`\`\`
now(pt):                         // before a local event or send; pt = physical clock reading
   if pt > l:  l = pt; c = 0
   else:       c = c + 1
receive(m, pt):                  // m = (lm, cm) from another node
   l' = max(l, lm, pt)
   if l' == l and l' == lm: c = max(c, cm) + 1
   elif l' == l:            c = c + 1
   elif l' == lm:           c = cm + 1
   else:                    c = 0
   l = l'
\`\`\`

\`\`\`js run
// Lamport clocks in action: three processes exchanging messages
class P { constructor(n) { this.n = n; this.t = 0; } tick() { return ++this.t; } recv(ts) { this.t = Math.max(this.t, ts) + 1; return this.t; } }
const a = new P("A"), b = new P("B");
const e1 = a.tick();          // A: local event
const sent = a.tick();        // A: send (timestamp travels with the message)
const e3 = b.recv(sent);      // B: receive → jumps past the sender
console.log(e1, sent, e3);
\`\`\`

:::warn
**Never use the wall clock for ordering decisions across machines** unless the algorithm tolerates skew (or you use TrueTime-style uncertainty). Also never use it to measure *durations*: use a monotonic clock (\`performance.now()\`, \`process.hrtime\`) — the wall clock can go backwards.
:::

:::interview
"How do you order events in a distributed system?" — Physical clocks drift, so use logical clocks. Lamport gives a total order consistent with causality; vector clocks detect concurrency; HLC gives both causality and near-real-time readability in constant space; TrueTime gives real-time with bounded uncertainty. Mention LWW's data-loss risk.
:::
`,
  quiz: [
    { q: 'If Lamport timestamps satisfy L(a) < L(b), what can you conclude?', options: ['a happened before b', 'a and b are concurrent', 'Either a → b, or they are concurrent — b did NOT happen before a', 'Nothing at all'], answer: 2, why: 'a → b implies L(a) < L(b), but not the other way around; b → a is impossible.' },
    { q: 'Vector clocks [2,0,1] and [1,1,1] are…', options: ['Equal', 'The first happened before the second', 'Concurrent', 'Invalid'], answer: 2, why: 'Neither dominates the other: 2>1 in slot 0, but 0<1 in slot 1.' },
    { q: 'Why is last-write-wins dangerous with physical timestamps?', options: ['It is slow', 'Clock skew can make an older write look newer, and concurrent writes are silently dropped', 'It needs a leader', 'It uses too much memory'], answer: 1, why: 'LWW discards data and trusts unsynchronised clocks.' },
    { q: 'What does Google Spanner\'s TrueTime return?', options: ['A single timestamp', 'An interval [earliest, latest] guaranteed to contain the true time', 'A vector clock', 'A random value'], answer: 1, why: 'It exposes clock uncertainty and Spanner waits it out before committing.' },
    { q: 'Which clock should you use to time how long an operation took?', options: ['The wall clock (Date.now)', 'A monotonic clock (performance.now)', 'A Lamport clock', 'A vector clock'], answer: 1, why: 'The wall clock can jump backwards; monotonic clocks cannot.' },
  ],
  labs: [
    lab({
      id: 'nd2-lamport',
      title: 'Lamport clock',
      kind: 'code',
      difficulty: 2,
      minutes: 12,
      tags: ['clocks'],
      prompt: `Implement \`class LamportClock\`:
- \`time\` (property): current counter, starts at 0.
- \`tick()\`: a local event — increment and return the new time.
- \`send()\`: prepare to send a message — increment and return the timestamp to attach.
- \`receive(ts)\`: \`time = max(time, ts) + 1\`, return the new time.

Then \`totalOrder(events)\`: given events \`{ id, process, ts }\`, return the ids sorted by **timestamp, ties broken by process name** (a total order consistent with causality).`,
      expose: ['LamportClock', 'totalOrder'],
      files: jsFile(`class LamportClock {
  constructor() {
    this.time = 0;
  }

  tick() {}
  send() {}
  receive(ts) {}
}

function totalOrder(events) {
  
}
`, `class LamportClock {
  constructor() {
    this.time = 0;
  }

  tick() {
    return ++this.time;
  }

  send() {
    return ++this.time;
  }

  receive(ts) {
    this.time = Math.max(this.time, ts) + 1;
    return this.time;
  }
}

function totalOrder(events) {
  return [...events]
    .sort((a, b) => a.ts - b.ts || (a.process < b.process ? -1 : a.process > b.process ? 1 : 0))
    .map((e) => e.id);
}
`),
      tests: [
        ex('tick, send, receive', ({ env, expect }) => {
          const a = new env.LamportClock();
          const b = new env.LamportClock();
          expect([a.tick(), a.send()]).toEqual([1, 2]);
          expect(b.receive(2)).toBe(3);
          expect(b.receive(1)).toBe(4);
          expect(b.time).toBe(4);
        }),
        ex('receiving a far-future timestamp jumps ahead', ({ env, expect }) => {
          const c = new env.LamportClock();
          c.tick();
          expect(c.receive(100)).toBe(101);
        }),
        ex('totalOrder sorts by timestamp then process', ({ env, expect }) => {
          const ev = [{ id: 'e3', process: 'B', ts: 2 }, { id: 'e1', process: 'A', ts: 1 }, { id: 'e2', process: 'A', ts: 2 }];
          expect(env.totalOrder(ev)).toEqual(['e1', 'e2', 'e3']);
        }),
        prop('property: happened-before implies a smaller Lamport timestamp (random message exchanges)', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 9999)], (seed: number) => {
            const r = new Rng(seed);
            const procs = [new env.LamportClock(), new env.LamportClock(), new env.LamportClock()];
            const inbox: { to: number; ts: number; cause: number }[] = [];
            const lastEvent = [-1, -1, -1];
            const events: { ts: number; p: number; causes: number[] }[] = [];
            const add = (p: number, ts: number, extra: number[]) => {
              events.push({ ts, p, causes: [...(lastEvent[p] >= 0 ? [lastEvent[p]] : []), ...extra] });
              lastEvent[p] = events.length - 1;
            };
            for (let i = 0; i < 40; i++) {
              const p = r.int(0, 2);
              const op = r.int(0, 2);
              if (op === 0) add(p, procs[p].tick(), []);
              else if (op === 1) { const to = (p + r.int(1, 2)) % 3; const ts = procs[p].send(); add(p, ts, []); inbox.push({ to, ts, cause: events.length - 1 }); }
              else { const k = inbox.findIndex((m) => m.to === p); if (k >= 0) { const m = inbox.splice(k, 1)[0]; add(p, procs[p].receive(m.ts), [m.cause]); } }
            }
            // every event must be later than all of its direct causes
            events.forEach((e) => e.causes.forEach((c) => expect(events[c].ts).toBeLessThan(e.ts)));
          });
        }),
      ],
      hints: ['`tick` and `send` both just increment and return `this.time`.', '`receive(ts)`: `this.time = Math.max(this.time, ts) + 1`.', '`totalOrder`: sort a copy by `ts`, break ties by comparing process names, and map to `id`.'],
    }),

    lab({
      id: 'nd2-vector',
      title: 'Vector clocks',
      kind: 'code',
      difficulty: 3,
      minutes: 25,
      tags: ['clocks', 'causality'],
      interview: true,
      prompt: `Vector clocks are plain objects mapping a process id to a counter (missing entries mean 0). Implement these **pure** functions (never mutate their arguments):

- \`vcIncrement(vc, id)\` → a new clock with \`id\`'s counter increased by 1.
- \`vcMerge(a, b)\` → component-wise maximum.
- \`vcCompare(a, b)\` → \`'equal'\`, \`'before'\` (a happened before b), \`'after'\` (b before a) or \`'concurrent'\`.`,
      expose: ['vcIncrement', 'vcMerge', 'vcCompare'],
      files: jsFile(`function vcIncrement(vc, id) {\n  \n}\n\nfunction vcMerge(a, b) {\n  \n}\n\nfunction vcCompare(a, b) {\n  \n}\n`, `function vcIncrement(vc, id) {
  return { ...vc, [id]: (vc[id] || 0) + 1 };
}

function vcMerge(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = Math.max(out[k] || 0, b[k]);
  return out;
}

function vcCompare(a, b) {
  let aLess = false;
  let bLess = false;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] || 0;
    const y = b[k] || 0;
    if (x < y) aLess = true;
    if (y < x) bLess = true;
  }
  if (aLess && bLess) return 'concurrent';
  if (aLess) return 'before';
  if (bLess) return 'after';
  return 'equal';
}
`),
      tests: [
        ex('increment is pure', ({ env, expect }) => {
          const a = { A: 1 };
          expect(env.vcIncrement(a, 'A')).toEqual({ A: 2 });
          expect(env.vcIncrement(a, 'B')).toEqual({ A: 1, B: 1 });
          expect(a).toEqual({ A: 1 });
        }),
        ex('merge takes the component-wise max', ({ env, expect }) => {
          expect(env.vcMerge({ A: 2, B: 1 }, { A: 1, B: 3, C: 1 })).toEqual({ A: 2, B: 3, C: 1 });
        }),
        ex('compare: before / after / equal / concurrent', ({ env, expect }) => {
          expect(env.vcCompare({ A: 1 }, { A: 2 })).toBe('before');
          expect(env.vcCompare({ A: 2, B: 1 }, { A: 1 })).toBe('after');
          expect(env.vcCompare({ A: 1 }, { A: 1 })).toBe('equal');
          expect(env.vcCompare({ A: 2 }, { B: 1 })).toBe('concurrent');
          expect(env.vcCompare({ A: 2, B: 0 }, { A: 2 })).toBe('equal');
        }),
        ex('missing entries count as zero', ({ env, expect }) => {
          expect(env.vcCompare({}, { A: 1 })).toBe('before');
          expect(env.vcCompare({ A: 1 }, {})).toBe('after');
        }),
        prop('property: compare is antisymmetric; merge is commutative, associative and idempotent; merge is an upper bound', async ({ env, forAll, gen, expect }) => {
          const vc = gen.array(gen.int(0, 3), 3, 3);
          const toVC = (xs: number[]) => ({ A: xs[0], B: xs[1], C: xs[2] });
          await forAll([vc, vc, vc], (x: number[], y: number[], z: number[]) => {
            const a = toVC(x), b = toVC(y), c = toVC(z);
            const flip: Record<string, string> = { before: 'after', after: 'before', equal: 'equal', concurrent: 'concurrent' };
            expect(env.vcCompare(a, b)).toBe(flip[env.vcCompare(b, a)]);
            expect(env.vcMerge(a, b)).toEqual(env.vcMerge(b, a));
            expect(env.vcMerge(env.vcMerge(a, b), c)).toEqual(env.vcMerge(a, env.vcMerge(b, c)));
            expect(env.vcMerge(a, a)).toEqual(a);
            const m = env.vcMerge(a, b);
            expect(['before', 'equal']).toContain(env.vcCompare(a, m));
            expect(['before', 'equal']).toContain(env.vcCompare(b, m));
          }, { runs: 200 });
        }),
        hid('a replicated-register scenario: concurrent writes are detected, a later write dominates both', ({ env, expect }) => {
          let a = env.vcIncrement({}, 'A');            // A writes
          let b = env.vcIncrement(a, 'B');             // B reads A's write, then writes
          const c = env.vcIncrement(a, 'C');           // C also read A's write and writes concurrently with B
          expect(env.vcCompare(a, b)).toBe('before');
          expect(env.vcCompare(b, c)).toBe('concurrent');
          const resolved = env.vcIncrement(env.vcMerge(b, c), 'A');   // a client merges both siblings and writes the result
          expect(env.vcCompare(b, resolved)).toBe('before');
          expect(env.vcCompare(c, resolved)).toBe('before');
        }),
      ],
      hints: ['Treat missing keys as `0`: use `(vc[k] || 0)`.', 'Compare by scanning the union of keys; remember whether you saw any component where `a < b` and any where `b < a`.', 'Both seen → concurrent; only the first → before; only the second → after; neither → equal.'],
    }),

    lab({
      id: 'nd2-siblings',
      title: 'Dynamo-style sibling resolution',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['clocks', 'dynamo', 'conflict-resolution'],
      interview: true,
      prompt: `A key has been written on several replicas. Each stored **version** is \`{ value, clock }\` where \`clock\` is a vector clock (object).

\`reconcile(versions)\` returns the versions that must be **kept**: drop every version whose clock is **strictly dominated** (happened-before) by another version's clock, and drop **exact duplicates** (equal clocks keep one). What remains are the **concurrent siblings**; keep them in their original order. (A vector-clock comparison helper is included.)

Also implement \`lastWriteWins(versions)\` → the single version with the highest \`ts\` field (ties: the later one in the array) to show what LWW does with concurrent writes.`,
      expose: ['reconcile', 'lastWriteWins'],
      files: jsFile(`function compare(a, b) {
  let aLess = false;
  let bLess = false;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] || 0;
    const y = b[k] || 0;
    if (x < y) aLess = true;
    if (y < x) bLess = true;
  }
  return aLess && bLess ? 'concurrent' : aLess ? 'before' : bLess ? 'after' : 'equal';
}

function reconcile(versions) {
  
}

function lastWriteWins(versions) {
  
}
`, `function compare(a, b) {
  let aLess = false;
  let bLess = false;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] || 0;
    const y = b[k] || 0;
    if (x < y) aLess = true;
    if (y < x) bLess = true;
  }
  return aLess && bLess ? 'concurrent' : aLess ? 'before' : bLess ? 'after' : 'equal';
}

function reconcile(versions) {
  const kept = [];
  versions.forEach((v, i) => {
    const dominated = versions.some((w, j) => j !== i && compare(v.clock, w.clock) === 'before');
    const duplicate = versions.some((w, j) => j < i && compare(v.clock, w.clock) === 'equal');
    if (!dominated && !duplicate) kept.push(v);
  });
  return kept;
}

function lastWriteWins(versions) {
  let best = versions[0];
  for (const v of versions) if (v.ts >= best.ts) best = v;
  return best;
}
`),
      tests: [
        ex('a newer version replaces the older one', ({ env, expect }) => {
          const r = env.reconcile([{ value: 'old', clock: { A: 1 } }, { value: 'new', clock: { A: 2 } }]);
          expect(r.map((v: any) => v.value)).toEqual(['new']);
        }),
        ex('concurrent versions are both kept (siblings)', ({ env, expect }) => {
          const r = env.reconcile([{ value: 'x', clock: { A: 1, B: 1 } }, { value: 'y', clock: { A: 1, C: 1 } }]);
          expect(r.map((v: any) => v.value)).toEqual(['x', 'y']);
        }),
        ex('a descendant dominates several ancestors; unrelated siblings survive', ({ env, expect }) => {
          const r = env.reconcile([
            { value: 'a', clock: { A: 1 } },
            { value: 'b', clock: { A: 1, B: 1 } },
            { value: 'c', clock: { A: 2 } },
            { value: 'merged', clock: { A: 2, B: 1 } },
            { value: 'other', clock: { Z: 1 } },
          ]);
          expect(r.map((v: any) => v.value)).toEqual(['merged', 'other']);
        }),
        ex('exact duplicates collapse to one', ({ env, expect }) => {
          const r = env.reconcile([{ value: 'v', clock: { A: 1 } }, { value: 'v', clock: { A: 1 } }]);
          expect(r.length).toBe(1);
        }),
        ex('empty input', ({ env, expect }) => expect(env.reconcile([])).toEqual([])),
        ex('LWW silently drops one of two concurrent writes', ({ env, expect }) => {
          const w = env.lastWriteWins([{ value: 'x', ts: 100, clock: { A: 1 } }, { value: 'y', ts: 105, clock: { B: 1 } }]);
          expect(w.value).toBe('y');
        }),
        prop('property: the result has no dominated versions and every input is dominated by (or equal to) something kept', async ({ env, forAll, gen, expect }) => {
          const clock = gen.array(gen.int(0, 2), 3, 3);
          await forAll([gen.array(clock, 1, 6)], (cs: number[][]) => {
            const versions = cs.map((c, i) => ({ value: 'v' + i, clock: { A: c[0], B: c[1], C: c[2] } }));
            const cmp = (a: any, b: any) => {
              let al = false, bl = false;
              for (const k of ['A', 'B', 'C']) { if (a[k] < b[k]) al = true; if (b[k] < a[k]) bl = true; }
              return al && bl ? 'concurrent' : al ? 'before' : bl ? 'after' : 'equal';
            };
            const kept = env.reconcile(versions);
            for (const k of kept) for (const o of kept) if (k !== o) expect(['concurrent']).toContain(cmp(k.clock, o.clock));
            for (const v of versions) expect(kept.some((k: any) => ['equal', 'before'].includes(cmp(v.clock, k.clock)))).toBe(true);
          }, { runs: 200 });
        }),
      ],
      hints: ['A version is obsolete if some *other* version\'s clock is strictly after it (`compare(v.clock, w.clock) === "before"`).', 'Handle duplicates: if an earlier version has an *equal* clock, skip this one.', 'Keep the survivors in the original order.'],
      why: 'Riak, Dynamo, CouchDB and Git itself (a merge commit resolves concurrent branches) all work like this.',
    }),

    lab({
      id: 'nd2-hlc',
      title: 'Hybrid logical clock',
      kind: 'code',
      difficulty: 4,
      minutes: 25,
      tags: ['clocks', 'hlc'],
      interview: true,
      prompt: `Implement \`class HLC\`. The physical clock is **injected** (a function \`physicalNow()\` returning ms) so it can be tested.

- \`new HLC(physicalNow)\` starts with \`l = 0, c = 0\`.
- \`now()\` — timestamp for a **local or send event**; returns \`{ l, c }\`: if \`pt > l\` then \`l = pt, c = 0\` else \`c++\`.
- \`receive(m)\` where \`m = { l, c }\` — merge a remote timestamp (with the current physical time \`pt\`): \`l' = max(l, m.l, pt)\`; the counter follows the rules in the lesson. Return the new \`{ l, c }\`.
- Timestamps compare lexicographically by \`(l, c)\`. They must be **strictly increasing** for every call on one clock, and \`receive\` must return a timestamp **greater than \`m\`**.`,
      expose: ['HLC'],
      files: jsFile(`class HLC {
  constructor(physicalNow) {
    this.physicalNow = physicalNow;
    this.l = 0;
    this.c = 0;
  }

  now() {}

  receive(m) {}
}
`, `class HLC {
  constructor(physicalNow) {
    this.physicalNow = physicalNow;
    this.l = 0;
    this.c = 0;
  }

  now() {
    const pt = this.physicalNow();
    if (pt > this.l) {
      this.l = pt;
      this.c = 0;
    } else {
      this.c++;
    }
    return { l: this.l, c: this.c };
  }

  receive(m) {
    const pt = this.physicalNow();
    const l = Math.max(this.l, m.l, pt);
    if (l === this.l && l === m.l) this.c = Math.max(this.c, m.c) + 1;
    else if (l === this.l) this.c = this.c + 1;
    else if (l === m.l) this.c = m.c + 1;
    else this.c = 0;
    this.l = l;
    return { l: this.l, c: this.c };
  }
}
`),
      tests: [
        ex('follows the physical clock when it advances', ({ env, expect }) => {
          let pt = 100;
          const h = new env.HLC(() => pt);
          expect(h.now()).toEqual({ l: 100, c: 0 });
          pt = 105;
          expect(h.now()).toEqual({ l: 105, c: 0 });
        }),
        ex('the counter breaks ties when physical time stands still or goes backwards', ({ env, expect }) => {
          let pt = 100;
          const h = new env.HLC(() => pt);
          h.now();
          expect(h.now()).toEqual({ l: 100, c: 1 });
          pt = 90; // the wall clock jumped back!
          expect(h.now()).toEqual({ l: 100, c: 2 });
        }),
        ex('receive: remote timestamp ahead of local time', ({ env, expect }) => {
          let pt = 100;
          const h = new env.HLC(() => pt);
          expect(h.receive({ l: 200, c: 5 })).toEqual({ l: 200, c: 6 });
          expect(h.now()).toEqual({ l: 200, c: 7 });
        }),
        ex('receive: physical time ahead of everything resets the counter', ({ env, expect }) => {
          let pt = 300;
          const h = new env.HLC(() => pt);
          expect(h.receive({ l: 100, c: 9 })).toEqual({ l: 300, c: 0 });
        }),
        ex('receive: equal logical times take the larger counter + 1', ({ env, expect }) => {
          const h = new env.HLC(() => 50);
          h.now(); h.now(); // l=50, c=1
          expect(h.receive({ l: 50, c: 7 })).toEqual({ l: 50, c: 8 });
          expect(h.receive({ l: 50, c: 2 })).toEqual({ l: 50, c: 9 });
        }),
        prop('property: timestamps from one clock are strictly increasing and receive() exceeds the received timestamp', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-5, 40), 1, 40)], (ops: number[]) => {
            let pt = 1000;
            const h = new env.HLC(() => pt);
            let prev = { l: 0, c: -1 };
            const gt = (a: any, b: any) => a.l > b.l || (a.l === b.l && a.c > b.c);
            for (const op of ops) {
              pt += op; // may go backwards
              let ts;
              if (op % 3 === 0) { const m = { l: 990 + (op + 5) * 3, c: Math.abs(op) % 4 }; ts = h.receive(m); expect(gt(ts, m)).toBe(true); }
              else ts = h.now();
              expect(gt(ts, prev)).toBe(true);
              prev = ts;
            }
          });
        }),
        hid('l never lags the physical clock by more than the clock has been stalled / stays close to real time', ({ env, expect }) => {
          let pt = 5000;
          const h = new env.HLC(() => pt);
          for (let i = 0; i < 50; i++) { pt += 10; const ts = h.now(); expect(ts.l).toBe(pt); expect(ts.c).toBe(0); }
        }),
      ],
      hints: ['`now()`: read `pt`; if `pt > this.l` take it and reset `c` to 0; otherwise `c++`.', '`receive(m)`: compute `l = max(this.l, m.l, pt)`. Then four cases for `c`: all equal → `max(c, m.c) + 1`; only local equals → `c + 1`; only remote equals → `m.c + 1`; physical time won → `0`.', 'Always store the new `l` and return a **copy** `{ l, c }`.'],
    }),
  ],
  references: [
    { title: 'Time, Clocks, and the Ordering of Events in a Distributed System — Leslie Lamport, 1978' },
    { title: 'Logical Physical Clocks and Consistent Snapshots in Globally Distributed Databases — Kulkarni et al., 2014 (HLC)' },
    { title: 'Spanner: Google\'s Globally-Distributed Database (TrueTime) — Corbett et al., OSDI 2012' },
    { title: 'Dynamo: Amazon\'s Highly Available Key-value Store — DeCandia et al., SOSP 2007' },
  ],
};
export default mod;
