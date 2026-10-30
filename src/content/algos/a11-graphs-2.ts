import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';

const HEAP_SRC = `class MinHeap {
  constructor(compare = (a, b) => a - b) {
    this.compare = compare;
    this.data = [];
  }
  get size() {
    return this.data.length;
  }
  peek() {
    return this.data[0];
  }
  push(x) {
    const d = this.data;
    d.push(x);
    let i = d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.compare(d[i], d[p]) >= 0) break;
      [d[i], d[p]] = [d[p], d[i]];
      i = p;
    }
  }
  pop() {
    const d = this.data;
    if (d.length === 0) return undefined;
    const top = d[0];
    const last = d.pop();
    if (d.length) {
      d[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < d.length && this.compare(d[l], d[m]) < 0) m = l;
        if (r < d.length && this.compare(d[r], d[m]) < 0) m = r;
        if (m === i) break;
        [d[i], d[m]] = [d[m], d[i]];
        i = m;
      }
    }
    return top;
  }
}
`;

const UF_SRC = `class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
    this.count = n;
  }
  find(x) {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a, b) {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return false;
    if (this.rank[ra] < this.rank[rb]) [ra, rb] = [rb, ra];
    this.parent[rb] = ra;
    if (this.rank[ra] === this.rank[rb]) this.rank[ra]++;
    this.count--;
    return true;
  }
  connected(a, b) {
    return this.find(a) === this.find(b);
  }
}
`;

const mod: Module = {
  id: 'graphs-weighted',
  course: 'algos',
  title: 'Graphs II: Shortest Paths, Union-Find & Minimum Spanning Trees',
  minutes: 60,
  objectives: [
    'Pick the right shortest-path algorithm: BFS, Dijkstra, Bellman-Ford, Floyd–Warshall',
    'Implement Dijkstra with a heap (and explain why negative weights break it)',
    'Use union-find (disjoint sets) with path compression and union by rank',
    'Build a minimum spanning tree with Kruskal\'s algorithm',
  ],
  body: `
## Choosing a shortest-path algorithm

| Situation | Algorithm | Time |
|---|---|---|
| Unweighted | BFS | O(V + E) |
| Non-negative weights, one source | **Dijkstra** with a binary heap | O((V + E) log V) |
| Negative weights allowed, one source (detects negative cycles) | **Bellman-Ford** | O(V·E) |
| All pairs, small V (≤ ~400) | **Floyd–Warshall** | O(V³) |
| DAG | relax edges in topological order | O(V + E) |
| Weights are 0 or 1 | 0-1 BFS (deque) | O(V + E) |
| Heuristic available (maps, puzzles) | A* | depends on heuristic |

## Dijkstra

**Idea:** repeatedly finalise the unvisited node with the smallest known distance. Because weights are non-negative, nothing found later can make that distance shorter — that is the *greedy* step that fails with negative edges.

1. \`dist[start] = 0\`, all others ∞; push \`(0, start)\` in a min-heap.
2. Pop the smallest \`(d, u)\`. If \`d > dist[u]\` it's a **stale** entry — skip it (lazy deletion).
3. For each edge \`u → v\` with weight \`w\`: if \`d + w < dist[v]\`, update and push \`(d + w, v)\`.

\`\`\`js run
// tiny Dijkstra with an O(n) "heap" for readability — the lab uses a real binary heap
function dijkstra(n, edges, src) {
  const adj = Array.from({ length: n }, () => []);
  for (const [u, v, w] of edges) adj[u].push([v, w]);
  const dist = new Array(n).fill(Infinity);
  dist[src] = 0;
  const pq = [[0, src]];
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, u] = pq.shift();
    if (d > dist[u]) continue;                       // stale
    for (const [v, w] of adj[u]) if (d + w < dist[v]) { dist[v] = d + w; pq.push([dist[v], v]); }
  }
  return dist;
}
console.log(dijkstra(5, [[0, 1, 4], [0, 2, 1], [2, 1, 2], [1, 3, 1], [2, 3, 5]], 0));
\`\`\`

:::warn
Dijkstra is **wrong** with negative edge weights. A "cheap" node finalised early can later be improved through a negative edge. Use Bellman-Ford. And don't treat \`0 + Infinity\` carelessly — keep \`dist\` as \`Infinity\` for unreachable nodes.
:::

## Bellman-Ford

Relax **every edge** V−1 times: after k rounds all shortest paths using ≤ k edges are correct. A V-th round that still improves something proves a **negative cycle** reachable from the source (no shortest path exists). Used in network routing (distance-vector protocols) and currency-arbitrage detection (take −log of exchange rates).

## Union-Find (disjoint set union)

Maintains a partition of elements into groups with two operations:

- \`find(x)\` — the representative (root) of x's group.
- \`union(a, b)\` — merge the groups of a and b.

Represent each group as a tree whose root is the representative. Two optimisations make it effectively constant time:

- **Path compression:** during \`find\`, point nodes directly at the root.
- **Union by rank/size:** attach the shallower tree under the deeper one.

Together the amortised cost per operation is **O(α(n))** — the inverse Ackermann function, < 5 for any input that fits in the universe.

Uses: connected components in a stream of edges, **cycle detection** in undirected graphs (if \`find(u) === find(v)\` before adding edge u–v, it closes a cycle), Kruskal's MST, accounts merging, percolation, grid problems with dynamic connectivity.

## Minimum spanning tree

A **spanning tree** connects all V vertices with V−1 edges and no cycles; the **MST** has minimum total weight. (Networks: cheapest cabling; clustering: cut the heaviest edges.)

**Kruskal:** sort edges by weight; take each edge if it **connects two different components** (union-find says they're not yet connected); stop at V−1 edges. O(E log E). If fewer than V−1 edges are taken the graph is disconnected.
**Prim:** grow one tree from a start vertex using a heap of crossing edges; O(E log V) — better for dense graphs.

Both rely on the **cut property**: the lightest edge crossing any cut belongs to some MST — which is why greedy is correct.

:::interview
When a question says "cheapest way to connect everything" think MST; "are these two connected after adding edges?" think union-find; "shortest/cheapest path with weights" think Dijkstra — and ask whether weights can be negative.
:::
`,
  quiz: [
    { q: 'Why does Dijkstra fail on graphs with negative edge weights?', options: ['It uses too much memory', 'A node finalised early could later be reached more cheaply through a negative edge', 'It cannot handle cycles', 'The heap overflows'], answer: 1, why: 'Its greedy "closest unvisited node is final" argument needs non-negative weights.' },
    { q: 'What does Bellman-Ford\'s V-th relaxation round tell you?', options: ['Nothing', 'If any distance still improves, a negative cycle is reachable', 'The graph is a tree', 'The answer is wrong'], answer: 1, why: 'Shortest paths use at most V−1 edges unless a negative cycle exists.' },
    { q: 'Union by rank + path compression makes union-find operations…', options: ['O(n)', 'O(log n)', 'Nearly O(1) amortised (inverse Ackermann)', 'O(n log n)'], answer: 2, why: 'α(n) grows so slowly that it is effectively constant.' },
    { q: 'In Kruskal\'s algorithm, when do you skip an edge?', options: ['When it is the heaviest', 'When its endpoints are already connected (it would form a cycle)', 'When it is the lightest', 'Never'], answer: 1, why: 'Adding it would create a cycle; union-find detects this in near-O(1).' },
  ],
  labs: [
    lab({
      id: 'algo11-dijkstra',
      title: 'Dijkstra\'s algorithm',
      kind: 'code',
      difficulty: 4,
      minutes: 30,
      tags: ['graph', 'shortest-path', 'heap'],
      interview: true,
      prompt: `\`dijkstra(n, edges, src)\` — a **directed** graph with vertices \`0..n-1\` and \`edges\` as \`[u, v, w]\` (weight \`w >= 0\`). Return an array of the shortest distance from \`src\` to every vertex (\`Infinity\` if unreachable). A \`MinHeap\` is provided — use it. Required: **O((V + E) log V)**.`,
      expose: ['dijkstra'],
      files: jsFile(HEAP_SRC + `
function dijkstra(n, edges, src) {
  
}
`, HEAP_SRC + `
function dijkstra(n, edges, src) {
  const adj = Array.from({ length: n }, () => []);
  for (const [u, v, w] of edges) adj[u].push([v, w]);
  const dist = new Array(n).fill(Infinity);
  dist[src] = 0;
  const heap = new MinHeap((a, b) => a[0] - b[0]);
  heap.push([0, src]);
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist[u]) continue;
    for (const [v, w] of adj[u]) {
      const nd = d + w;
      if (nd < dist[v]) {
        dist[v] = nd;
        heap.push([nd, v]);
      }
    }
  }
  return dist;
}
`),
      tests: [
        ex('classic example', ({ env, expect }) => expect(env.dijkstra(5, [[0, 1, 4], [0, 2, 1], [2, 1, 2], [1, 3, 1], [2, 3, 5]], 0)).toEqual([0, 3, 1, 4, Infinity])),
        ex('single vertex and unreachable vertices', ({ env, expect }) => {
          expect(env.dijkstra(1, [], 0)).toEqual([0]);
          expect(env.dijkstra(3, [[0, 1, 5]], 0)).toEqual([0, 5, Infinity]);
        }),
        ex('edges are directed; zero weights and parallel edges', ({ env, expect }) => {
          expect(env.dijkstra(3, [[1, 0, 1], [0, 2, 0], [0, 2, 7]], 0)).toEqual([0, Infinity, 0]);
        }),
        prop('property: matches Bellman-Ford on random graphs', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 8), gen.array(gen.int(0, 999), 0, 40), gen.int(0, 7)], (n: number, raw: number[], s0: number) => {
            const edges: [number, number, number][] = [];
            for (let i = 0; i + 2 < raw.length; i += 3) edges.push([raw[i] % n, raw[i + 1] % n, raw[i + 2] % 20]);
            const src = s0 % n;
            const ref = new Array(n).fill(Infinity);
            ref[src] = 0;
            for (let k = 0; k < n; k++) for (const [u, v, w] of edges) if (ref[u] + w < ref[v]) ref[v] = ref[u] + w;
            expect(env.dijkstra(n, edges, src)).toEqual(ref);
          }, { runs: 200 });
        }),
        perf('20,000 vertices / 100,000 edges', async ({ env, expect, measure, rng }) => {
          const r = rng(5);
          const n = 20000;
          const edges = Array.from({ length: 100000 }, () => [r.int(0, n - 1), r.int(0, n - 1), r.int(1, 100)]);
          for (let i = 0; i + 1 < n; i++) edges.push([i, i + 1, 50]);
          const { value, steps } = await measure(() => env.dijkstra(n, edges, 0), { budget: 80_000_000 });
          expect(value[0]).toBe(0);
          expect(value.every((d: number) => Number.isFinite(d))).toBe(true);
          expect(steps).toBeLessThan(25_000_000);
        }),
      ],
      hints: ['Build an adjacency list of `[neighbour, weight]`. Keep `dist` initialised to `Infinity`.', 'Heap entries are `[distance, vertex]`; use a comparator on the first item.', 'When you pop `[d, u]` with `d > dist[u]`, that entry is stale — skip it. Otherwise relax each edge and push improved distances.'],
      why: 'This is routing: Google Maps, OSPF, game pathfinding, and the core of most "cheapest path" problems.',
    }),

    lab({
      id: 'algo11-unionfind',
      title: 'Union-Find',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['union-find', 'data-structures'],
      interview: true,
      prompt: `Implement \`class UnionFind\` for elements \`0..n-1\`:

- \`find(x)\` — the representative of x's set, with **path compression**.
- \`union(a, b)\` — merge the sets; return \`true\` if they were separate, \`false\` if already together. Use **union by rank (or size)**.
- \`connected(a, b)\` and the number of sets as \`count\` (property, starts at \`n\`).`,
      expose: ['UnionFind'],
      files: jsFile(`class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.count = n;
  }

  find(x) {}
  union(a, b) {}
  connected(a, b) {}
}
`, UF_SRC),
      tests: [
        ex('union and connected', ({ env, expect }) => {
          const uf = new env.UnionFind(6);
          expect([uf.union(0, 1), uf.union(1, 2), uf.union(3, 4)]).toEqual([true, true, true]);
          expect([uf.connected(0, 2), uf.connected(0, 3), uf.connected(3, 4), uf.connected(5, 5)]).toEqual([true, false, true, true]);
        }),
        ex('union of already-connected returns false; count tracks sets', ({ env, expect }) => {
          const uf = new env.UnionFind(4);
          expect(uf.count).toBe(4);
          uf.union(0, 1); uf.union(2, 3);
          expect(uf.count).toBe(2);
          expect(uf.union(1, 0)).toBe(false);
          uf.union(1, 2);
          expect([uf.count, uf.connected(0, 3)]).toEqual([1, true]);
        }),
        prop('property: matches a naive component labelling', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 12), gen.array(gen.int(0, 200), 0, 30)], (n: number, raw: number[]) => {
            const uf = new env.UnionFind(n);
            const label = Array.from({ length: n }, (_, i) => i);
            for (let i = 0; i + 1 < raw.length; i += 2) {
              const a = raw[i] % n, b = raw[i + 1] % n;
              const merged = label[a] !== label[b];
              expect(uf.union(a, b)).toBe(merged);
              if (merged) { const old = label[b]; for (let k = 0; k < n; k++) if (label[k] === old) label[k] = label[a]; }
            }
            for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) expect(uf.connected(a, b)).toBe(label[a] === label[b]);
            expect(uf.count).toBe(new Set(label).size);
          });
        }),
        perf('near-constant: 200,000 operations on 100,000 elements, adversarial chain', async ({ env, expect, measure }) => {
          const n = 100000;
          const uf = new env.UnionFind(n);
          const { steps } = await measure(() => {
            for (let i = 0; i + 1 < n; i++) uf.union(i, i + 1);
            for (let i = 0; i < n; i++) uf.find(i);
          }, { budget: 40_000_000 });
          expect(uf.count).toBe(1);
          expect(steps).toBeLessThan(200000 * 40);
        }),
      ],
      hints: ['`parent[i] = i` initially. `find` follows parents to the root.', 'Path compression: while walking up, set `parent[x] = parent[parent[x]]` (or re-point everything to the root).', 'Union by rank: attach the root with the smaller rank under the other; bump the rank only if they were equal.'],
    }),

    lab({
      id: 'algo11-kruskal',
      title: 'Minimum spanning tree (Kruskal)',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['graph', 'mst', 'union-find'],
      interview: true,
      prompt: `\`mstWeight(n, edges)\` — an **undirected** weighted graph, \`edges\` as \`[u, v, w]\`. Return the total weight of a minimum spanning tree, or \`-1\` if the graph is not connected. (A single vertex has weight 0.) A \`UnionFind\` class is provided: sort the edges by weight and add an edge only if it connects two components.`,
      expose: ['mstWeight'],
      files: jsFile(UF_SRC + `
function mstWeight(n, edges) {
  
}
`, UF_SRC + `
function mstWeight(n, edges) {
  const sorted = [...edges].sort((a, b) => a[2] - b[2]);
  const uf = new UnionFind(n);
  let total = 0;
  let used = 0;
  for (const [u, v, w] of sorted) {
    if (uf.union(u, v)) {
      total += w;
      used++;
      if (used === n - 1) break;
    }
  }
  return used === n - 1 ? total : -1;
}
`),
      tests: [
        ex('classic example', ({ env, expect }) => expect(env.mstWeight(4, [[0, 1, 10], [0, 2, 6], [0, 3, 5], [1, 3, 15], [2, 3, 4]])).toBe(19)),
        ex('disconnected → -1; trivial graphs', ({ env, expect }) => {
          expect(env.mstWeight(4, [[0, 1, 1], [2, 3, 1]])).toBe(-1);
          expect(env.mstWeight(1, [])).toBe(0);
          expect(env.mstWeight(2, [])).toBe(-1);
        }),
        ex('self-loops and parallel edges do not break it', ({ env, expect }) => expect(env.mstWeight(3, [[0, 0, 1], [0, 1, 5], [0, 1, 2], [1, 2, 3]])).toBe(5)),
        ex('does not mutate the edge list', ({ env, expect }) => {
          const e = [[0, 1, 5], [1, 2, 1]];
          env.mstWeight(3, e);
          expect(e).toEqual([[0, 1, 5], [1, 2, 1]]);
        }),
        prop('property: equals Prim\'s algorithm', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 8), gen.array(gen.int(0, 999), 0, 45)], (n: number, raw: number[]) => {
            const edges: [number, number, number][] = [];
            for (let i = 0; i + 2 < raw.length; i += 3) edges.push([raw[i] % n, raw[i + 1] % n, 1 + (raw[i + 2] % 30)]);
            const inT = new Array(n).fill(false);
            inT[0] = true;
            let total = 0, cnt = 1;
            while (cnt < n) {
              let best = Infinity;
              let pick = -1;
              for (const [u, v, w] of edges) if (inT[u] !== inT[v] && w < best) { best = w; pick = inT[u] ? v : u; }
              if (pick < 0) break;
              inT[pick] = true; total += best; cnt++;
            }
            expect(env.mstWeight(n, edges)).toBe(cnt === n ? total : -1);
          }, { runs: 200 });
        }),
        perf('50,000 edges', async ({ env, expect, measure, rng }) => {
          const r = rng(8);
          const n = 5000;
          const edges = Array.from({ length: 50000 }, () => [r.int(0, n - 1), r.int(0, n - 1), r.int(1, 1000)]);
          for (let i = 0; i + 1 < n; i++) edges.push([i, i + 1, 5000]);
          const { steps } = await measure(() => env.mstWeight(n, edges), { budget: 30_000_000 });
          expect(steps).toBeLessThan(5_000_000);
        }),
      ],
      hints: ['Sort a **copy** of the edges by weight.', 'For each edge, call `uf.union(u, v)`; if it returns `true`, the edge joins two components — add its weight.', 'A spanning tree has exactly `n - 1` edges. If you collected fewer, the graph is disconnected.'],
    }),

    lab({
      id: 'algo11-bellman-ford',
      title: 'Bellman-Ford with negative-cycle detection',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['graph', 'shortest-path'],
      prompt: `\`bellmanFord(n, edges, src)\` — **directed** graph, edges \`[u, v, w]\` where \`w\` may be **negative**. Return the array of shortest distances from \`src\` (\`Infinity\` for unreachable vertices), or \`null\` if a **negative cycle is reachable from \`src\`** (then shortest distances are undefined). O(V·E).`,
      expose: ['bellmanFord'],
      files: jsFile(`function bellmanFord(n, edges, src) {\n  \n}\n`, `function bellmanFord(n, edges, src) {
  const dist = new Array(n).fill(Infinity);
  dist[src] = 0;
  for (let round = 0; round < n - 1; round++) {
    let changed = false;
    for (const [u, v, w] of edges) {
      if (dist[u] !== Infinity && dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        changed = true;
      }
    }
    if (!changed) return dist;
  }
  for (const [u, v, w] of edges) if (dist[u] !== Infinity && dist[u] + w < dist[v]) return null;
  return dist;
}
`),
      tests: [
        ex('negative edges but no negative cycle', ({ env, expect }) => expect(env.bellmanFord(4, [[0, 1, 4], [0, 2, 5], [1, 2, -3], [2, 3, 2]], 0)).toEqual([0, 4, 1, 3])),
        ex('negative cycle reachable → null', ({ env, expect }) => expect(env.bellmanFord(3, [[0, 1, 1], [1, 2, -2], [2, 1, 1]], 0)).toBe(null)),
        ex('a negative cycle that is NOT reachable from the source is ignored', ({ env, expect }) => {
          expect(env.bellmanFord(4, [[0, 1, 1], [2, 3, -5], [3, 2, 1]], 0)).toEqual([0, 1, Infinity, Infinity]);
        }),
        ex('single vertex, unreachable vertices', ({ env, expect }) => {
          expect(env.bellmanFord(1, [], 0)).toEqual([0]);
          expect(env.bellmanFord(3, [[1, 2, 1]], 0)).toEqual([0, Infinity, Infinity]);
        }),
        prop('property: agrees with Dijkstra when all weights are non-negative', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 7), gen.array(gen.int(0, 999), 0, 30)], (n: number, raw: number[]) => {
            const edges: [number, number, number][] = [];
            for (let i = 0; i + 2 < raw.length; i += 3) edges.push([raw[i] % n, raw[i + 1] % n, raw[i + 2] % 15]);
            const ref = new Array(n).fill(Infinity);
            ref[0] = 0;
            for (let k = 0; k < n + 1; k++) for (const [u, v, w] of edges) if (ref[u] + w < ref[v]) ref[v] = ref[u] + w;
            expect(env.bellmanFord(n, edges, 0)).toEqual(ref);
          });
        }),
      ],
      hints: ['Initialise `dist[src] = 0`, everything else `Infinity`. Never relax from an `Infinity` vertex (`Infinity + negative` is still `Infinity`, but be explicit).', 'Repeat `n - 1` rounds: for every edge, `if (dist[u] + w < dist[v]) dist[v] = dist[u] + w`.', 'One more pass: if any edge **still** relaxes, a reachable negative cycle exists → return `null`.'],
    }),
  ],
  references: [{ title: 'Sedgewick & Wayne — Algorithms, 4th ed., Ch. 4 Graphs' }, { title: 'Tarjan — Efficiency of a good but not linear set union algorithm (1975)' }],
};
export default mod;
