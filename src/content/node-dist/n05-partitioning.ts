import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';

const HASH_SRC = `// FNV-1a: a fast, well-distributed 32-bit string hash (provided)
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return h >>> 0;
}
`;

const mod: Module = {
  id: 'partitioning',
  course: 'node-dist',
  title: 'Partitioning & Consistent Hashing',
  minutes: 60,
  objectives: [
    'Explain why and how data is sharded, and the hot-spot and rebalancing problems',
    'Show why `hash(key) % N` is a disaster when N changes',
    'Implement consistent hashing with virtual nodes, and rendezvous (HRW) hashing',
    'Compare hash partitioning with range partitioning',
  ],
  body: `
## Why partition?

One machine can't hold or serve everything: too much **data** (terabytes), too much **traffic** (millions of requests/s), too much **compute**. **Partitioning (sharding)** splits the data into pieces, each owned by a different node. A good scheme gives:

- **Even load** — no node handles disproportionately many keys or requests.
- **Cheap lookup** — any client or router can compute "which node owns key K?" without asking a central server.
- **Cheap rebalancing** — adding or removing a node moves *as little data as possible*.

(Partitioning is distinct from **replication**: real systems do both — each shard is replicated by Raft/Paxos/leaders.)

## Strategy 1: range partitioning

Split the **key space** into contiguous ranges: \`[a–f]\`, \`[g–m]\`, …. Used by Bigtable/HBase, Spanner, CockroachDB, MongoDB (range-sharded), TiKV.

- ✅ **Range scans** are efficient (neighbouring keys live together).
- ✅ Shards can be **split and merged** adaptively (a hot range is cut in two).
- ❌ **Hot spots:** sequential keys (timestamps, auto-increment ids) all land in the last range.
- Needs a **metadata service** mapping ranges → nodes.

## Strategy 2: hash partitioning

Apply a hash and partition the **hash space**: \`node = hash(key) mod N\`. Keys spread uniformly (even load, no sequential hot spots). ❌ Range queries must hit all shards; ❌ ordering is lost.

### The \`mod N\` trap

\`\`\`js run
const hash = (k) => [...k].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const keys = Array.from({ length: 10000 }, (_, i) => "user:" + i);
const before = keys.map((k) => hash(k) % 4);
const after = keys.map((k) => hash(k) % 5);                // add ONE node
const moved = keys.filter((_, i) => before[i] !== after[i]).length;
console.log(Math.round((100 * moved) / keys.length) + "% of keys changed owner");   // ≈ 80 %
\`\`\`

Going from N to N+1 nodes with \`hash % N\` remaps about **N/(N+1)** of all keys — a cache stampede / mass data migration just to add one server.

## Consistent hashing (Karger et al., 1997)

Hash **both nodes and keys onto the same circular space** (0 … 2³²−1, wrapping around). A key belongs to the **first node clockwise** from the key's position.

\`\`\`
        0
     ┌──●A──┐        key k hashes to a point;  walk clockwise to the next node point
   ●C         │       owner(k) = first node point ≥ hash(k)   (wrap to the start if none)
     │        ●B
     └────────┘
\`\`\`

- **Adding** a node takes over only the keys between it and its predecessor — about **1/(N+1)** of the keys, all moving *to the new node*.
- **Removing** a node hands only *its* keys to its successor.

With few nodes the arcs are uneven (one node may own 50%). **Virtual nodes (vnodes)** fix it: each physical node appears at **many** positions (e.g. 100–256, using \`hash(node + "#" + i)\`), so its load is the sum of many small arcs — nearly even, and when a node leaves its load is spread across *many* others. Vnodes also let you give bigger machines more tokens. Used by **Dynamo, Cassandra, Riak, Memcached clients (ketama), Envoy/HAProxy, CDNs**.

Lookup: keep the points in a **sorted array** and **binary search** for the first point ≥ hash(key) — O(log(N·vnodes)).

## Rendezvous hashing (HRW)

For key \`k\`, compute \`score(node, k) = hash(node + k)\` for **every** node and pick the highest. No ring, no vnodes, perfectly even in expectation, and removing a node moves exactly its keys (to each key's second-best node). O(N) per lookup — fine for tens of nodes, and trivially gives the **top-k** nodes for replication. Used by Microsoft's CARP, GitHub's load balancer, and some CDNs.

## Practical problems

- **Hot keys / celebrities:** hashing can't help if *one key* gets all the traffic. Mitigate by splitting the key (\`key#0…#9\`), caching, or request coalescing.
- **Skew:** unequal data sizes — track load, not just key counts.
- **Rebalancing:** moving data must be **throttled** and done in the background; the system must serve reads from the old owner until the move finishes.
- **Fixed number of partitions** (Kafka partitions, Elasticsearch shards, Riak's 64 vnodes): choose many more partitions than nodes up front, then move *whole partitions* between nodes. Changing the partition count later is painful.
- **Routing:** clients cache the map; a stale map leads to a "wrong shard" redirect. ZooKeeper/etcd, gossip or a router tier keep it current.

:::interview
"Design a distributed cache / key-value store": cover partitioning (consistent hashing with vnodes), replication (next k nodes on the ring), failure detection, rebalancing, hot keys. Explain *why* mod-N is bad and quote ≈1/N movement for consistent hashing.
:::
`,
  quiz: [
    { q: 'You grow a cluster from 9 to 10 nodes using `hash(key) % N`. Roughly what fraction of keys change node?', options: ['10%', '50%', '90%', '100%'], answer: 2, why: 'About N/(N+1) = 90% of keys land on a different node.' },
    { q: 'With consistent hashing, adding the 11th node to a 10-node ring moves about…', options: ['All keys', '1/11 of the keys, all to the new node', '50% of keys', 'No keys'], answer: 1, why: 'The new node only takes over arcs between itself and its predecessors.' },
    { q: 'What problem do virtual nodes solve?', options: ['Hot keys', 'Uneven arcs: with few points one node can own a disproportionate share', 'Network latency', 'Replication'], answer: 1, why: 'Many points per node average out the arc lengths and spread a leaving node\'s load.' },
    { q: 'Which strategy makes range scans cheap?', options: ['Hash partitioning', 'Range partitioning', 'Rendezvous hashing', 'mod-N hashing'], answer: 1, why: 'Hashing destroys key order; ranges keep neighbours together.' },
    { q: 'Hash partitioning does not help with…', options: ['Spreading many keys evenly', 'One extremely popular key receiving most of the traffic', 'Avoiding sequential-id hot spots', 'Lookup without a central directory'], answer: 1, why: 'One key always lives on one shard; split or cache it instead.' },
  ],
  labs: [
    lab({
      id: 'nd5-movement',
      title: 'How much data moves?',
      kind: 'answer',
      difficulty: 2,
      minutes: 8,
      tags: ['hashing'],
      prompt: 'Reason about key movement. Express fractions as decimals between 0 and 1 (e.g. 0.25).',
      questions: [
        { id: 'a', prompt: 'You use `hash(key) % N` and grow from N = 4 to N = 5 nodes. What **fraction of keys stay** on the same node? (Compute over one full cycle of h = 0…19.)', type: 'number', answer: 0.2, tolerance: 0.01, explain: 'Only h = 0..3 satisfy h mod 4 == h mod 5.' },
        { id: 'b', prompt: 'A consistent-hashing ring has 9 nodes with plenty of vnodes. A 10th node joins. What **fraction of keys** move (expected)?', type: 'number', answer: 0.1, tolerance: 0.01 },
        { id: 'c', prompt: 'Same ring (10 nodes). One node dies. What fraction of all keys must be reassigned (expected)?', type: 'number', answer: 0.1, tolerance: 0.01 },
        { id: 'd', prompt: 'Rendezvous hashing with 20 nodes: one node is removed. What fraction of keys move (expected)?', type: 'number', answer: 0.05, tolerance: 0.01 },
        { id: 'e', prompt: 'You store 120 TB in total across 12 equal nodes. A new empty node is added and the cluster rebalances evenly (consistent hashing). Roughly how many **TB** are transferred to the new node?', type: 'number', answer: 9.23, tolerance: 0.02, explain: '120 / 13 ≈ 9.23 TB.' },
      ],
      hints: ['Consistent hashing: ideal movement is 1/(N+1) on adding the (N+1)-th node, 1/N when one of N nodes leaves.', 'For the mod-N case, list h = 0…19 and count where h mod 4 equals h mod 5.'],
    }),

    lab({
      id: 'nd5-ring',
      title: 'A consistent-hash ring with virtual nodes',
      kind: 'code',
      difficulty: 4,
      minutes: 30,
      tags: ['hashing', 'sharding'],
      interview: true,
      prompt: `\`hash32(str)\` (a 32-bit unsigned hash) is provided. Implement \`class HashRing\`:

- \`new HashRing(vnodes = 100)\`
- \`addNode(name)\` — put \`vnodes\` points on the ring at \`hash32(name + "#" + i)\`; adding a node twice is a no-op.
- \`removeNode(name)\` — remove all of its points.
- \`getNode(key)\` — the node owning the **first point clockwise** (≥ \`hash32(key)\`, wrapping to the lowest point). \`undefined\` if the ring is empty.
- \`nodes()\` — the current node names (sorted).

Keep the points in a **sorted array** and use **binary search** for lookups. When two points have the same hash keep the one whose node name sorts first.`,
      expose: ['HashRing'],
      files: jsFile(HASH_SRC + `
class HashRing {
  constructor(vnodes = 100) {
    this.vnodes = vnodes;
    this.ring = []; // sorted array of { hash, node }
    this.members = new Set();
  }

  addNode(name) {}
  removeNode(name) {}
  getNode(key) {}
  nodes() {}
}
`, HASH_SRC + `
class HashRing {
  constructor(vnodes = 100) {
    this.vnodes = vnodes;
    this.ring = [];
    this.members = new Set();
  }

  addNode(name) {
    if (this.members.has(name)) return;
    this.members.add(name);
    for (let i = 0; i < this.vnodes; i++) this.ring.push({ hash: hash32(name + '#' + i), node: name });
    this.ring.sort((a, b) => a.hash - b.hash || (a.node < b.node ? -1 : a.node > b.node ? 1 : 0));
  }

  removeNode(name) {
    if (!this.members.delete(name)) return;
    this.ring = this.ring.filter((p) => p.node !== name);
  }

  getNode(key) {
    if (this.ring.length === 0) return undefined;
    const h = hash32(key);
    let lo = 0;
    let hi = this.ring.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.ring[mid].hash < h) lo = mid + 1;
      else hi = mid;
    }
    return this.ring[lo === this.ring.length ? 0 : lo].node;
  }

  nodes() {
    return [...this.members].sort();
  }
}
`),
      tests: [
        ex('empty ring', ({ env, expect }) => expect(new env.HashRing().getNode('x')).toBe(undefined)),
        ex('a single node owns everything; lookups are deterministic', ({ env, expect }) => {
          const r = new env.HashRing(50);
          r.addNode('a');
          expect([r.getNode('k1'), r.getNode('k2'), r.getNode('zzz')]).toEqual(['a', 'a', 'a']);
          expect(r.getNode('k1')).toBe(r.getNode('k1'));
        }),
        ex('nodes() lists members; adding twice and removing unknown nodes are no-ops', ({ env, expect }) => {
          const r = new env.HashRing(10);
          r.addNode('b'); r.addNode('a'); r.addNode('a'); r.removeNode('nope');
          expect(r.nodes()).toEqual(['a', 'b']);
          r.removeNode('a');
          expect(r.nodes()).toEqual(['b']);
        }),
        ex('load is spread fairly evenly across 5 nodes (200 vnodes)', ({ env, expect }) => {
          const r = new env.HashRing(200);
          for (const n of ['n1', 'n2', 'n3', 'n4', 'n5']) r.addNode(n);
          const count: Record<string, number> = {};
          for (let i = 0; i < 20000; i++) { const n = r.getNode('key-' + i); count[n] = (count[n] ?? 0) + 1; }
          const vals = Object.values(count);
          expect(vals.length).toBe(5);
          expect(Math.max(...vals) / Math.min(...vals)).toBeLessThan(1.5);
        }),
        ex('adding a node moves only ~1/(n+1) of the keys, and only TO the new node', ({ env, expect }) => {
          const r = new env.HashRing(200);
          for (const n of ['n1', 'n2', 'n3', 'n4', 'n5']) r.addNode(n);
          const keys = Array.from({ length: 12000 }, (_, i) => 'item:' + i);
          const before = keys.map((k) => r.getNode(k));
          r.addNode('n6');
          let moved = 0;
          keys.forEach((k, i) => {
            const now = r.getNode(k);
            if (now !== before[i]) { moved++; if (now !== 'n6') throw new Error(`key ${k} moved from ${before[i]} to ${now}, but a joining node may only take keys for itself`); }
          });
          const frac = moved / keys.length;
          if (frac < 0.08 || frac > 0.28) throw new Error(`${(frac * 100).toFixed(1)}% of keys moved; expected about 16.7% (1/6)`);
        }),
        ex('removing a node moves only that node\'s keys', ({ env, expect }) => {
          const r = new env.HashRing(150);
          for (const n of ['a', 'b', 'c', 'd']) r.addNode(n);
          const keys = Array.from({ length: 8000 }, (_, i) => 'k' + i);
          const before = keys.map((k) => r.getNode(k));
          r.removeNode('c');
          keys.forEach((k, i) => {
            if (before[i] !== 'c') expect(r.getNode(k)).toBe(before[i]);
            else expect(r.getNode(k)).not.toBe('c');
          });
        }),
        ex('the result does not depend on insertion order', ({ env, expect }) => {
          const a = new env.HashRing(80), b = new env.HashRing(80);
          for (const n of ['x', 'y', 'z']) a.addNode(n);
          for (const n of ['z', 'x', 'y']) b.addNode(n);
          for (let i = 0; i < 500; i++) expect(a.getNode('q' + i)).toBe(b.getNode('q' + i));
        }),
        perf('lookups use binary search: 20,000 lookups on 50 nodes × 200 vnodes', async ({ env, expect, measure }) => {
          const r = new env.HashRing(200);
          for (let i = 0; i < 50; i++) r.addNode('node' + i);
          const { steps } = await measure(() => { for (let i = 0; i < 20000; i++) r.getNode('key' + i); }, { budget: 30_000_000 });
          expect(steps).toBeLessThan(20000 * 60);
        }),
      ],
      hints: ['Ring points: `{ hash, node }` objects kept sorted by `hash` (ties: by node name).', '`getNode`: binary-search the first index whose `hash >= hash32(key)`; if you run off the end, wrap to index 0.', 'Adding a node: push its `vnodes` points then sort once. Removing: `filter` its points out.'],
      why: 'This is the routing layer of Dynamo, Cassandra, Memcached/ketama and many load balancers.',
    }),

    lab({
      id: 'nd5-rendezvous',
      title: 'Rendezvous (HRW) hashing',
      kind: 'code',
      difficulty: 2,
      minutes: 15,
      tags: ['hashing'],
      prompt: `\`hash32\` is provided. Implement:

- \`rendezvous(nodes, key)\` → the node with the **highest** \`hash32(node + ":" + key)\` (ties: the lexicographically smaller name). \`undefined\` for no nodes.
- \`topNodes(nodes, key, k)\` → the \`k\` highest-scoring nodes, best first (for choosing replicas).

The result must not depend on the order of \`nodes\`.`,
      expose: ['rendezvous', 'topNodes'],
      files: jsFile(HASH_SRC + `
function rendezvous(nodes, key) {
  
}

function topNodes(nodes, key, k) {
  
}
`, HASH_SRC + `
function score(node, key) {
  return hash32(node + ':' + key);
}

function ranked(nodes, key) {
  return [...nodes].sort((a, b) => score(b, key) - score(a, key) || (a < b ? -1 : a > b ? 1 : 0));
}

function rendezvous(nodes, key) {
  return ranked(nodes, key)[0];
}

function topNodes(nodes, key, k) {
  return ranked(nodes, key).slice(0, k);
}
`),
      tests: [
        ex('deterministic and independent of node order', ({ env, expect }) => {
          const a = ['a', 'b', 'c', 'd'];
          const b = ['d', 'b', 'a', 'c'];
          for (let i = 0; i < 200; i++) expect(env.rendezvous(a, 'k' + i)).toBe(env.rendezvous(b, 'k' + i));
        }),
        ex('empty and single', ({ env, expect }) => {
          expect(env.rendezvous([], 'k')).toBe(undefined);
          expect(env.rendezvous(['only'], 'k')).toBe('only');
          expect(env.topNodes([], 'k', 2)).toEqual([]);
        }),
        ex('removing a node only moves the keys it owned', ({ env, expect }) => {
          const nodes = ['a', 'b', 'c', 'd', 'e'];
          const keys = Array.from({ length: 3000 }, (_, i) => 'x' + i);
          const before = keys.map((k) => env.rendezvous(nodes, k));
          const rest = nodes.filter((n) => n !== 'c');
          keys.forEach((k, i) => { if (before[i] !== 'c') expect(env.rendezvous(rest, k)).toBe(before[i]); });
        }),
        ex('keys are spread evenly', ({ env, expect }) => {
          const nodes = ['a', 'b', 'c', 'd'];
          const count: Record<string, number> = {};
          for (let i = 0; i < 8000; i++) { const n = env.rendezvous(nodes, 'k' + i); count[n] = (count[n] ?? 0) + 1; }
          const v = Object.values(count);
          expect(Math.max(...v) / Math.min(...v)).toBeLessThan(1.25);
        }),
        ex('topNodes: first element is the rendezvous winner, no duplicates, replication-friendly', ({ env, expect }) => {
          const nodes = ['a', 'b', 'c', 'd', 'e'];
          const t = env.topNodes(nodes, 'user:42', 3);
          expect(t.length).toBe(3);
          expect(new Set(t).size).toBe(3);
          expect(t[0]).toBe(env.rendezvous(nodes, 'user:42'));
          expect(env.topNodes(nodes, 'user:42', 9).length).toBe(5);
        }),
        ex('does not mutate the node list', ({ env, expect }) => {
          const nodes = ['c', 'a', 'b'];
          env.topNodes(nodes, 'k', 2);
          expect(nodes).toEqual(['c', 'a', 'b']);
        }),
      ],
      hints: ['Score each node by `hash32(node + ":" + key)`.', 'Sort a **copy** of the node list by score descending (ties: name ascending); `rendezvous` is the first element, `topNodes` the first `k`.'],
    }),

    lab({
      id: 'nd5-shardmap',
      title: 'Range partitioning: a shard map',
      kind: 'code',
      difficulty: 3,
      minutes: 25,
      tags: ['sharding', 'binary-search'],
      prompt: `A range-partitioned store splits the sorted key space at **split points**. With splits \`["g", "n", "t"]\` there are 4 shards: \`[−∞,"g")\`, \`["g","n")\`, \`["n","t")\`, \`["t",∞)\` (indexes 0..3). Keys compare as strings (\`<\`).

Implement \`class ShardMap\`:
- \`new ShardMap(splits)\` — \`splits\` is sorted ascending.
- \`shardFor(key)\` → shard index (binary search; a key equal to a split point belongs to the shard that **starts** there).
- \`split(point)\` — insert a new split point (keeping order; ignore duplicates). Shard indexes shift accordingly. Return the index of the new shard that starts at \`point\`.
- \`shardsInRange(lo, hi)\` → ascending indexes of every shard overlapping keys \`lo ≤ key ≤ hi\` (a **range query**).
- \`count\` (getter) — number of shards.`,
      expose: ['ShardMap'],
      files: jsFile(`class ShardMap {
  constructor(splits = []) {
    this.splits = [...splits];
  }

  get count() {
    return this.splits.length + 1;
  }

  shardFor(key) {}
  split(point) {}
  shardsInRange(lo, hi) {}
}
`, `class ShardMap {
  constructor(splits = []) {
    this.splits = [...splits];
  }

  get count() {
    return this.splits.length + 1;
  }

  // number of split points that are <= key  ==  the shard index
  shardFor(key) {
    let lo = 0;
    let hi = this.splits.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.splits[mid] <= key) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  split(point) {
    const i = this.shardFor(point);
    if (i > 0 && this.splits[i - 1] === point) return i;
    this.splits.splice(i, 0, point);
    return i + 1;
  }

  shardsInRange(lo, hi) {
    if (lo > hi) return [];
    const a = this.shardFor(lo);
    const b = this.shardFor(hi);
    const out = [];
    for (let i = a; i <= b; i++) out.push(i);
    return out;
  }
}
`),
      tests: [
        ex('shardFor with the documented splits', ({ env, expect }) => {
          const m = new env.ShardMap(['g', 'n', 't']);
          expect(m.count).toBe(4);
          expect(['a', 'f', 'g', 'm', 'n', 's', 't', 'zzz'].map((k) => m.shardFor(k))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
        }),
        ex('no splits → one shard', ({ env, expect }) => {
          const m = new env.ShardMap([]);
          expect([m.count, m.shardFor('anything')]).toEqual([1, 0]);
        }),
        ex('split inserts a boundary and shifts later shards', ({ env, expect }) => {
          const m = new env.ShardMap(['g', 't']);
          expect(m.split('n')).toBe(2);
          expect(m.count).toBe(4);
          expect(['m', 'n', 's', 't'].map((k) => m.shardFor(k))).toEqual([1, 2, 2, 3]);
          expect(m.split('n')).toBe(2); // duplicate split: unchanged
          expect(m.count).toBe(4);
        }),
        ex('shardsInRange returns every overlapped shard', ({ env, expect }) => {
          const m = new env.ShardMap(['g', 'n', 't']);
          expect(m.shardsInRange('h', 'p')).toEqual([1, 2]);
          expect(m.shardsInRange('a', 'z')).toEqual([0, 1, 2, 3]);
          expect(m.shardsInRange('a', 'c')).toEqual([0]);
          expect(m.shardsInRange('n', 'n')).toEqual([2]);
          expect(m.shardsInRange('z', 'a')).toEqual([]);
        }),
        prop('property: shardFor matches a linear scan, and the shards of a range cover exactly the keys inside it', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.sortedInts(8, 0, 90), gen.int(-5, 95), gen.int(-5, 95)], (sp: number[], a: number, b: number) => {
            const splits = sp.map((n) => String(n).padStart(3, '0'));
            const m = new env.ShardMap(splits);
            const lin = (k: string) => splits.filter((s) => s <= k).length;
            const lo = String(Math.min(a, b) + 5).padStart(3, '0');
            const hi = String(Math.max(a, b) + 5).padStart(3, '0');
            expect(m.shardFor(lo)).toBe(lin(lo));
            expect(m.shardsInRange(lo, hi)).toEqual(Array.from({ length: lin(hi) - lin(lo) + 1 }, (_, i) => lin(lo) + i));
          });
        }),
        perf('shardFor is O(log n): 10,000 lookups over 5,000 shards', async ({ env, expect, measure }) => {
          const splits = Array.from({ length: 5000 }, (_, i) => String(i).padStart(5, '0'));
          const m = new env.ShardMap(splits);
          const { steps } = await measure(() => { for (let i = 0; i < 10000; i++) m.shardFor(String((i * 7) % 5000).padStart(5, '0')); }, { budget: 10_000_000 });
          expect(steps).toBeLessThan(10000 * 40);
        }),
      ],
      hints: ['`shardFor(key)` = how many split points are `<= key` — find it with a binary search for the first split `> key`.', '`split(point)`: its position is `shardFor(point)`; if a split equal to `point` already exists, do nothing. The new shard index is that position + 1.', '`shardsInRange(lo, hi)` is every index from `shardFor(lo)` to `shardFor(hi)` inclusive (empty if `lo > hi`).'],
    }),
  ],
  references: [
    { title: 'Consistent Hashing and Random Trees — Karger et al., STOC 1997' },
    { title: 'Dynamo: Amazon\'s Highly Available Key-value Store — DeCandia et al., 2007 (virtual nodes)' },
    { title: 'Using name-based mappings to increase hit rates (HRW/rendezvous hashing) — Thaler & Ravishankar, 1998' },
  ],
};
export default mod;
