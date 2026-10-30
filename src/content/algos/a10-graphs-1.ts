import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';

const mod: Module = {
  id: 'graphs-traversal',
  course: 'algos',
  title: 'Graphs I: Representation, BFS, DFS & Topological Sort',
  minutes: 55,
  objectives: [
    'Model a problem as a graph (nodes, edges, directed/undirected, weighted/unweighted, implicit grids)',
    'Choose BFS vs DFS and implement both iteratively and recursively',
    'Find connected components, shortest paths in unweighted graphs and cycles',
    'Produce a topological ordering and detect cycles in a dependency graph',
  ],
  body: `
## Graphs are everywhere

A **graph** is a set of **vertices** (nodes) and **edges** (connections). Maps (cities/roads), social networks, the web, dependency managers (package → package), state machines, game boards, task schedules and type hierarchies are all graphs. **Seeing the graph** in a problem is half the solution.

- **Directed** (one-way edges) vs **undirected**; **weighted** (cost/distance) vs **unweighted**.
- **Degree**, **path**, **cycle**, **connected component**, **DAG** (directed acyclic graph), **tree** (connected + acyclic).
- **V** = number of vertices, **E** = number of edges.

## Representations

| | Adjacency list | Adjacency matrix | Edge list |
|---|---|---|---|
| Space | O(V + E) | O(V²) | O(E) |
| Is (u,v) an edge? | O(deg u) | **O(1)** | O(E) |
| Iterate neighbours | **O(deg u)** | O(V) | O(E) |
| Best for | sparse graphs (most real ones) | dense graphs, tiny graphs, Floyd–Warshall | Kruskal, simple input |

\`\`\`js run
// Build an adjacency list from an edge list (undirected)
const edges = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]];
const n = 5;
const adj = Array.from({ length: n }, () => []);
for (const [u, v] of edges) { adj[u].push(v); adj[v].push(u); }
console.log(adj);
\`\`\`

**Implicit graphs:** a grid is a graph without being stored — the neighbours of cell \`(r, c)\` are \`(r±1, c)\` and \`(r, c±1)\`. A word puzzle's states ("hit" → "hot") are nodes; one-letter changes are edges. Don't build the whole graph if you can generate neighbours on demand.

## BFS — breadth-first search

Explore in expanding rings using a **queue**. In an **unweighted** graph the first time BFS reaches a node is via a **shortest path** (fewest edges). O(V + E).

\`\`\`js run
function bfsDistances(adj, start) {
  const dist = new Array(adj.length).fill(-1);
  dist[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {     // head pointer: no O(n) shift()
    const u = queue[head];
    for (const v of adj[u]) if (dist[v] === -1) { dist[v] = dist[u] + 1; queue.push(v); }
  }
  return dist;
}
console.log(bfsDistances([[1, 2], [0, 3], [0, 3], [1, 2, 4], [3]], 0));
\`\`\`

**Mark nodes visited when you *enqueue* them**, not when you dequeue — otherwise the same node is queued many times (exponential blow-up).

## DFS — depth-first search

Go as deep as possible, then backtrack, using the **call stack** (recursion) or an explicit **stack**. O(V + E). It explores *structure*: connected components, cycle detection, topological sort, bridges/articulation points, flood fill, backtracking.

\`\`\`js run
function components(adj) {
  const seen = new Array(adj.length).fill(false);
  let count = 0;
  const dfs = (u) => { seen[u] = true; for (const v of adj[u]) if (!seen[v]) dfs(v); };
  for (let u = 0; u < adj.length; u++) if (!seen[u]) { count++; dfs(u); }
  return count;
}
console.log(components([[1], [0], [3], [2], []]));
\`\`\`

Which one? **Shortest path / fewest steps / levels → BFS. Exhaustive exploration, components, ordering, cycles → DFS.** Deep graphs can overflow the recursion stack — use an explicit stack.

## Topological sort (DAGs)

A **topological order** lists vertices so every edge \`u → v\` has \`u\` before \`v\` — the order to build packages, take courses, run tasks. It exists **iff the graph has no cycle**.

**Kahn's algorithm** (BFS-flavoured): compute each node's **in-degree**; start with all in-degree-0 nodes in a queue; repeatedly remove one, append it to the order and decrement its neighbours' in-degrees, enqueueing any that reach 0. If the final order has fewer than V nodes, **there is a cycle**.

\`\`\`js run
function topoOrder(n, prereqs) {                  // prereq [a, b]: take b before a
  const adj = Array.from({ length: n }, () => []);
  const indeg = new Array(n).fill(0);
  for (const [a, b] of prereqs) { adj[b].push(a); indeg[a]++; }
  const queue = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue.push(i);
  const order = [];
  for (let h = 0; h < queue.length; h++) {
    const u = queue[h]; order.push(u);
    for (const v of adj[u]) if (--indeg[v] === 0) queue.push(v);
  }
  return order.length === n ? order : null;       // null → cycle
}
console.log(topoOrder(4, [[1, 0], [2, 1], [3, 2]]), topoOrder(2, [[0, 1], [1, 0]]));
\`\`\`

Alternatively run DFS and output nodes in **reverse post-order**; a node seen again while *on the current path* (colour "grey") proves a cycle.

## Grid problems

Number of islands, flood fill, shortest path in a maze, rotting oranges, walls and gates: treat each cell as a node; use BFS for shortest paths (multi-source BFS starts with several sources at distance 0) and DFS/BFS for connected regions. Use a direction array \`[[1,0],[-1,0],[0,1],[0,-1]]\` and check bounds.

:::warn
Forgetting the **visited** set (or marking it too late) turns O(V + E) into an infinite loop or exponential time. Also remember a disconnected graph: loop over *all* start nodes.
:::

:::interview
Say: "I'll model it as a graph — nodes are …, edges are …. Unweighted shortest path, so BFS." Then state V, E and complexity. For dependency questions say "topological sort, and a leftover node means a cycle".
:::
`,
  quiz: [
    { q: 'Why does BFS find shortest paths in an unweighted graph?', options: ['It uses less memory', 'It visits nodes in order of increasing distance from the start', 'It is recursive', 'It sorts the edges'], answer: 1, why: 'The queue holds nodes in order of distance, so the first visit is the shortest route.' },
    { q: 'When should you mark a node visited in BFS?', options: ['When dequeued', 'When enqueued', 'Never', 'After the loop'], answer: 1, why: 'Marking on enqueue prevents the same node being queued multiple times.' },
    { q: 'What is the space complexity of an adjacency list?', options: ['O(V²)', 'O(V + E)', 'O(E²)', 'O(1)'], answer: 1, why: 'One list per vertex plus one entry per edge.' },
    { q: 'In Kahn\'s algorithm, how do you detect a cycle?', options: ['A node has in-degree 0', 'The output order has fewer than V nodes', 'The queue is empty at the start', 'You cannot'], answer: 1, why: 'Nodes on a cycle never reach in-degree 0, so they are never emitted.' },
  ],
  labs: [
    lab({
      id: 'algo10-islands',
      title: 'Number of islands',
      kind: 'code',
      difficulty: 2,
      minutes: 15,
      tags: ['graph', 'grid', 'dfs'],
      interview: true,
      prompt: `\`numIslands(grid)\` — \`grid\` is an array of strings/arrays of \`"1"\` (land) and \`"0"\` (water). An island is a group of land cells connected **horizontally or vertically**. Return the number of islands. Don't modify the input. Use an **explicit stack or queue** (a 300×300 grid would overflow recursion).`,
      expose: ['numIslands'],
      files: jsFile(`function numIslands(grid) {\n  \n}\n`, `function numIslands(grid) {
  const rows = grid.length;
  if (rows === 0) return 0;
  const cols = grid[0].length;
  const seen = Array.from({ length: rows }, () => new Array(cols).fill(false));
  let islands = 0;
  for (let r0 = 0; r0 < rows; r0++) {
    for (let c0 = 0; c0 < cols; c0++) {
      if (grid[r0][c0] !== '1' || seen[r0][c0]) continue;
      islands++;
      seen[r0][c0] = true;
      const stack = [[r0, c0]];
      while (stack.length) {
        const [r, c] = stack.pop();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === '1' && !seen[nr][nc]) {
            seen[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }
    }
  }
  return islands;
}
`),
      tests: [
        ex('examples', ({ env, expect }) => {
          expect(env.numIslands(['11110', '11010', '11000', '00000'])).toBe(1);
          expect(env.numIslands(['11000', '11000', '00100', '00011'])).toBe(3);
        }),
        ex('edge cases', ({ env, expect }) => {
          expect(env.numIslands([])).toBe(0);
          expect(env.numIslands(['0'])).toBe(0);
          expect(env.numIslands(['1'])).toBe(1);
          expect(env.numIslands(['101', '010', '101'])).toBe(5);
        }),
        ex('accepts arrays of arrays and does not mutate the input', ({ env, expect }) => {
          const g = [['1', '0'], ['0', '1']];
          expect(env.numIslands(g)).toBe(2);
          expect(g).toEqual([['1', '0'], ['0', '1']]);
        }),
        prop('property: matches a union-find count', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 7), gen.int(1, 7), gen.int(1, 9999)], (R: number, C: number, seed: number) => {
            const rg = new (class { s = seed; f() { this.s = (this.s * 1103515245 + 12345) & 0x7fffffff; return this.s / 0x7fffffff; } })();
            const grid = Array.from({ length: R }, () => Array.from({ length: C }, () => (rg.f() < 0.5 ? '1' : '0')).join(''));
            const parent = Array.from({ length: R * C }, (_, i) => i);
            const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
            for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (grid[r][c] === '1') {
              if (r + 1 < R && grid[r + 1][c] === '1') parent[find(r * C + c)] = find((r + 1) * C + c);
              if (c + 1 < C && grid[r][c + 1] === '1') parent[find(r * C + c)] = find(r * C + c + 1);
            }
            const roots = new Set<number>();
            for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (grid[r][c] === '1') roots.add(find(r * C + c));
            expect(env.numIslands(grid)).toBe(roots.size);
          });
        }),
        perf('a 300×300 grid, one huge island (no recursion overflow)', async ({ env, expect, measure }) => {
          const grid = Array.from({ length: 300 }, () => '1'.repeat(300));
          const { value, steps } = await measure(() => env.numIslands(grid), { budget: 20_000_000 });
          expect(value).toBe(1);
          expect(steps).toBeLessThan(300 * 300 * 12);
        }),
      ],
      hints: ['Scan every cell. When you find unvisited land, count an island and flood-fill it so you never count it again.', 'Flood fill with a stack: pop a cell, push its unvisited land neighbours (check bounds), marking them seen **when pushed**.', 'Keep a separate `seen` matrix so the input stays unchanged.'],
    }),

    lab({
      id: 'algo10-shortest-grid',
      title: 'Shortest path in a grid (BFS)',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['graph', 'bfs', 'grid'],
      interview: true,
      prompt: `\`shortestPath(grid)\` — \`grid\` is an array of strings of \`.\` (open) and \`#\` (wall). Start at the top-left cell, reach the bottom-right cell, moving **up/down/left/right**. Return the **number of steps** of the shortest route, or \`-1\` if impossible (or if the start or end is a wall). A 1×1 open grid needs 0 steps.`,
      expose: ['shortestPath'],
      files: jsFile(`function shortestPath(grid) {\n  \n}\n`, `function shortestPath(grid) {
  const rows = grid.length;
  const cols = rows ? grid[0].length : 0;
  if (!rows || grid[0][0] === '#' || grid[rows - 1][cols - 1] === '#') return -1;
  const dist = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  dist[0][0] = 0;
  const queue = [[0, 0]];
  for (let head = 0; head < queue.length; head++) {
    const [r, c] = queue[head];
    if (r === rows - 1 && c === cols - 1) return dist[r][c];
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === '.' && dist[nr][nc] === -1) {
        dist[nr][nc] = dist[r][c] + 1;
        queue.push([nr, nc]);
      }
    }
  }
  return -1;
}
`),
      tests: [
        ex('open grid', ({ env, expect }) => {
          expect(env.shortestPath(['...', '...', '...'])).toBe(4);
          expect(env.shortestPath(['.'])).toBe(0);
        }),
        ex('a detour around walls', ({ env, expect }) => expect(env.shortestPath(['.#.', '.#.', '...'])).toBe(4)),
        ex('unreachable or blocked', ({ env, expect }) => {
          expect(env.shortestPath(['.#', '#.'])).toBe(-1);
          expect(env.shortestPath(['#.', '..'])).toBe(-1);
          expect(env.shortestPath(['..', '.#'])).toBe(-1);
          expect(env.shortestPath([])).toBe(-1);
        }),
        prop('property: equals a reference BFS on random mazes', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 8), gen.int(1, 8), gen.int(1, 9999)], (R: number, C: number, seed: number) => {
            let s = seed;
            const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
            const g = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => ((r === 0 && c === 0) || (r === R - 1 && c === C - 1) ? '.' : rnd() < 0.3 ? '#' : '.')).join(''));
            const d = new Map<string, number>([['0,0', 0]]);
            const q: [number, number][] = [[0, 0]];
            for (let i = 0; i < q.length; i++) { const [r, c] = q[i]; for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nr = r + dr, nc = c + dc, k = nr + ',' + nc; if (nr >= 0 && nr < R && nc >= 0 && nc < C && g[nr][nc] === '.' && !d.has(k)) { d.set(k, d.get(r + ',' + c)! + 1); q.push([nr, nc]); } } }
            expect(env.shortestPath(g)).toBe(d.get(`${R - 1},${C - 1}`) ?? -1);
          }, { runs: 150 });
        }),
        perf('300×300 open grid in O(cells)', async ({ env, expect, measure }) => {
          const g = Array.from({ length: 300 }, () => '.'.repeat(300));
          const { value, steps } = await measure(() => env.shortestPath(g), { budget: 20_000_000 });
          expect(value).toBe(598);
          expect(steps).toBeLessThan(300 * 300 * 15);
        }),
      ],
      hints: ['BFS from `(0,0)`: the first time you reach a cell is by a shortest route.', 'Keep a `dist` matrix initialised to `-1` (it doubles as the visited set); mark/assign when you **enqueue**.', 'Use a queue with a head index; return `dist` the moment you dequeue the target.'],
    }),

    lab({
      id: 'algo10-course-order',
      title: 'Course schedule (topological sort)',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['graph', 'topological-sort'],
      interview: true,
      prompt: `There are \`n\` courses numbered \`0..n-1\`. Each prerequisite pair \`[a, b]\` means "take \`b\` before \`a\`".

\`findOrder(n, prerequisites)\` returns a valid order to take **all** courses (any valid order is accepted), or \`[]\` if it is impossible (a cycle). Use Kahn's algorithm (in-degrees + queue): O(n + edges).`,
      expose: ['findOrder'],
      files: jsFile(`function findOrder(n, prerequisites) {\n  \n}\n`, `function findOrder(n, prerequisites) {
  const adj = Array.from({ length: n }, () => []);
  const indegree = new Array(n).fill(0);
  for (const [a, b] of prerequisites) {
    adj[b].push(a);
    indegree[a]++;
  }
  const queue = [];
  for (let i = 0; i < n; i++) if (indegree[i] === 0) queue.push(i);
  const order = [];
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head];
    order.push(u);
    for (const v of adj[u]) if (--indegree[v] === 0) queue.push(v);
  }
  return order.length === n ? order : [];
}
`),
      tests: [
        ex('a simple chain', ({ env, expect }) => expect(env.findOrder(2, [[1, 0]])).toEqual([0, 1])),
        ex('a valid order for a diamond', ({ env, expect }) => {
          const order: number[] = env.findOrder(4, [[1, 0], [2, 0], [3, 1], [3, 2]]);
          const pos = new Map(order.map((c, i) => [c, i]));
          expect(order.length).toBe(4);
          for (const [a, b] of [[1, 0], [2, 0], [3, 1], [3, 2]]) expect(pos.get(b)! < pos.get(a)!).toBe(true);
        }),
        ex('a cycle → []', ({ env, expect }) => {
          expect(env.findOrder(2, [[1, 0], [0, 1]])).toEqual([]);
          expect(env.findOrder(3, [[0, 1], [1, 2], [2, 0]])).toEqual([]);
          expect(env.findOrder(1, [[0, 0]])).toEqual([]);
        }),
        ex('no prerequisites: any permutation of all courses', ({ env, expect }) => {
          expect([...env.findOrder(4, [])].sort()).toEqual([0, 1, 2, 3]);
          expect(env.findOrder(0, [])).toEqual([]);
        }),
        prop('property: order respects every prerequisite (when acyclic)', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 9), gen.array(gen.int(0, 80), 0, 18)], (n: number, raw: number[]) => {
            const pre: [number, number][] = [];
            for (let i = 0; i + 1 < raw.length; i += 2) { const a = raw[i] % n, b = raw[i + 1] % n; if (a > b) pre.push([a, b]); }   // a > b ⇒ acyclic
            const order: number[] = env.findOrder(n, pre);
            expect(order.length).toBe(n);
            const pos = new Map(order.map((c, i) => [c, i]));
            for (const [a, b] of pre) expect(pos.get(b)! < pos.get(a)!).toBe(true);
          });
        }),
        perf('linear on 50,000 courses', async ({ env, expect, measure }) => {
          const n = 50000;
          const pre = Array.from({ length: n - 1 }, (_, i) => [i + 1, i]);
          const { value, steps } = await measure(() => env.findOrder(n, pre), { budget: 10_000_000 });
          expect(value.length).toBe(n);
          expect(steps).toBeLessThan(n * 25);
        }),
      ],
      hints: ['Build an adjacency list `b → [a, …]` (finishing `b` unlocks `a`) and an `indegree[a]` count of unmet prerequisites.', 'Queue every course whose in-degree is 0. Repeatedly dequeue one, append to the order, and decrement the in-degree of the courses it unlocks.', 'If the order ends up shorter than `n`, some courses were stuck in a cycle: return `[]`.'],
    }),

    lab({
      id: 'algo10-word-ladder',
      title: 'Word ladder (BFS on an implicit graph)',
      kind: 'code',
      difficulty: 4,
      minutes: 25,
      tags: ['graph', 'bfs'],
      interview: true,
      prompt: `\`ladderLength(begin, end, wordList)\` — transform \`begin\` into \`end\` by changing **one letter at a time**, where every intermediate word must be in \`wordList\` (\`end\` must be in the list too). Return the **number of words in the shortest sequence** (counting \`begin\` and \`end\`), or \`0\` if impossible. Words are lowercase, same length.

Example: \`hit → hot → dot → dog → cog\` has length **5**. Treat words as graph nodes and "differ by one letter" as edges; generate neighbours **on demand** (try each position × each letter) instead of comparing all pairs.`,
      expose: ['ladderLength'],
      files: jsFile(`function ladderLength(begin, end, wordList) {\n  \n}\n`, `function ladderLength(begin, end, wordList) {
  const words = new Set(wordList);
  if (!words.has(end)) return 0;
  const queue = [[begin, 1]];
  const seen = new Set([begin]);
  for (let head = 0; head < queue.length; head++) {
    const [word, len] = queue[head];
    if (word === end) return len;
    for (let i = 0; i < word.length; i++) {
      for (let c = 97; c <= 122; c++) {
        const next = word.slice(0, i) + String.fromCharCode(c) + word.slice(i + 1);
        if (words.has(next) && !seen.has(next)) {
          seen.add(next);
          queue.push([next, len + 1]);
        }
      }
    }
  }
  return 0;
}
`),
      tests: [
        ex('classic example', ({ env, expect }) => expect(env.ladderLength('hit', 'cog', ['hot', 'dot', 'dog', 'lot', 'log', 'cog'])).toBe(5)),
        ex('unreachable', ({ env, expect }) => {
          expect(env.ladderLength('hit', 'cog', ['hot', 'dot', 'dog', 'lot', 'log'])).toBe(0);
          expect(env.ladderLength('abc', 'xyz', ['abd', 'axd'])).toBe(0);
        }),
        ex('already one step away and trivial cases', ({ env, expect }) => {
          expect(env.ladderLength('a', 'c', ['a', 'b', 'c'])).toBe(2);
          expect(env.ladderLength('hot', 'dot', ['dot'])).toBe(2);
        }),
        ex('begin need not be in the list', ({ env, expect }) => expect(env.ladderLength('red', 'tax', ['ted', 'tex', 'red', 'tax', 'tad', 'den', 'rex', 'pee'])).toBe(4)),
        perf('a 5,000-word dictionary (needs on-demand neighbours, not O(n²) pair checks)', async ({ env, expect, measure, rng }) => {
          const r = rng(77);
          const words = new Set<string>();
          while (words.size < 5000) words.add(Array.from({ length: 6 }, () => String.fromCharCode(97 + r.int(0, 4))).join(''));
          const list = [...words];
          const { steps } = await measure(() => env.ladderLength(list[0], list[1], list), { budget: 25_000_000 });
          expect(steps).toBeLessThan(5000 * 6 * 26 * 4);
        }),
      ],
      hints: ['BFS where a node is a word. The queue holds `[word, lengthSoFar]`.', 'For each word, build every neighbour by replacing each position with each of the 26 letters; keep those in the dictionary `Set` that you have not seen.', 'Return the length when you dequeue `end`. If the queue empties, return 0.'],
    }),
  ],
  references: [{ title: 'Skiena — The Algorithm Design Manual, Ch. 5 Graph Traversal' }],
};
export default mod;
