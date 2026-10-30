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

const mod: Module = {
  id: 'heaps',
  course: 'algos',
  title: 'Heaps & Priority Queues',
  minutes: 45,
  objectives: [
    'Explain how a binary heap is stored in an array and why push/pop are O(log n)',
    'Implement sift-up / sift-down',
    'Use a size-k heap for top-k problems and k-way merging',
    'Maintain a running median with two heaps',
  ],
  body: `
## The priority queue

A **priority queue** repeatedly gives you the **smallest** (or largest) item among those inserted so far. A sorted array makes \`pop\` cheap but \`push\` O(n); an unsorted array makes \`push\` cheap but \`pop\` O(n). A **binary heap** makes both **O(log n)**, with O(1) peek.

| Operation | Binary heap |
|---|---|
| \`peek\` | O(1) |
| \`push\` | O(log n) |
| \`pop\` | O(log n) |
| build from n items (heapify) | **O(n)** |

JavaScript has no built-in heap — you write one (it's a common interview question).

## Layout: a tree in an array

A binary heap is a **complete binary tree** (all levels full except possibly the last, filled left to right) stored in an array. For the item at index \`i\`: **parent** \`(i-1) >> 1\`, **children** \`2i+1\` and \`2i+2\`. The **heap property** (min-heap): every parent is ≤ its children, so the minimum is always at index 0. (It is *not* fully sorted — only each parent/child relationship.)

\`\`\`js run
// min-heap order is stored as the array [1, 3, 2, 7, 4, 5]
//        1
//      /   \\
//     3     2
//    / \\   /
//   7   4 5
const h = [1, 3, 2, 7, 4, 5];
const parent = (i) => (i - 1) >> 1;
console.log(h.every((v, i) => i === 0 || h[parent(i)] <= v));
\`\`\`

## The two moves

- **sift-up** (after \`push\`): put the new item at the end, then swap it with its parent while it is smaller. At most height = log₂ n swaps.
- **sift-down** (after \`pop\`): move the last item to the root, then swap it with the smaller child while it is larger than that child.

Each move walks one root-to-leaf path: O(log n). **Building** a heap by pushing n items costs O(n log n), but "heapify" (sift-down from the last parent to the root) is O(n) — most nodes are near the bottom and sift very little.

## When to reach for a heap

- **Top-k / k-th largest:** keep a **min-heap of size k** of the largest seen; when it grows past k pop the smallest. O(n log k) and O(k) memory — works on a stream. (Sorting is O(n log n); quickselect O(n) average.)
- **k-way merge:** keep one "cursor" per sorted list in a min-heap keyed by its current value; pop the smallest, push that list's next element. O(N log k).
- **Scheduling / simulation:** next event by time (discrete-event simulators, task schedulers, Dijkstra's algorithm).
- **Running median:** a **max-heap** for the lower half and a **min-heap** for the upper half, kept balanced (sizes differ by ≤ 1). The median is the top of the larger heap, or the mean of both tops. Add is O(log n); median is O(1).
- **Greedy merges:** Huffman coding, merging files, connecting ropes at minimum cost.

\`\`\`js run
// top-3 largest of a stream with a size-3 min-heap (naive array heap for brevity)
const heap = [];
const pushPop = (x) => { heap.push(x); heap.sort((a, b) => a - b); if (heap.length > 3) heap.shift(); };
[5, 1, 9, 3, 7, 8, 2].forEach(pushPop);
console.log(heap);
\`\`\`

:::tip
A **max-heap** is just a min-heap with the comparison reversed (\`(a, b) => b - a\`) — design your heap to take a comparator and you get both, plus heaps of objects/tuples (\`(a, b) => a.dist - b.dist\`).
:::

:::warn
**Updating priorities.** A binary heap can't find an arbitrary item quickly. For "decrease-key" (Dijkstra), the usual trick is **lazy deletion**: push a new entry with the better priority and skip stale entries when you pop them.
:::

:::interview
"Find the k-th largest element" — mention three solutions: sort O(n log n), size-k heap O(n log k), quickselect O(n) average — and when you'd choose each (stream → heap; one-off in memory → quickselect).
:::
`,
  quiz: [
    { q: 'In an array-backed binary heap, where are the children of index i?', options: ['i+1 and i+2', '2i and 2i+1', '2i+1 and 2i+2', 'i/2'], answer: 2, why: 'With 0-based indexing, children of i are 2i+1 and 2i+2; the parent is (i−1)>>1.' },
    { q: 'What is the cost of building a heap from n items with heapify?', options: ['O(n log n)', 'O(n)', 'O(log n)', 'O(n²)'], answer: 1, why: 'Sifting down from the last parent costs O(n) in total.' },
    { q: 'To find the k largest items of a huge stream you keep…', options: ['A max-heap of everything', 'A min-heap of size k', 'A sorted copy', 'A hash set'], answer: 1, why: 'The root of the size-k min-heap is the smallest of the current top-k — easy to evict.' },
    { q: 'How do you track the median of a stream in O(log n) per insertion?', options: ['Sort every time', 'Two heaps: max-heap for the lower half, min-heap for the upper half', 'A BST only', 'A hash map'], answer: 1, why: 'Balanced halves give the median at the heap tops.' },
  ],
  labs: [
    lab({
      id: 'algo9-minheap',
      title: 'Implement a binary heap',
      kind: 'code',
      difficulty: 3,
      minutes: 25,
      tags: ['heap', 'data-structures'],
      interview: true,
      prompt: `Implement \`class MinHeap\` backed by a plain array:

- \`new MinHeap(compare = (a, b) => a - b)\` — a comparator like \`Array.sort\`; the element for which \`compare\` says "comes first" is on top (so \`(a, b) => b - a\` gives a max-heap).
- \`push(x)\`, \`pop()\` (removes and returns the top; \`undefined\` when empty), \`peek()\`, \`size\` (getter).
- \`push\`/\`pop\` must be **O(log n)** (sift-up / sift-down). \`Array.prototype.sort\` is not allowed.`,
      expose: ['MinHeap'],
      files: jsFile(`class MinHeap {
  constructor(compare = (a, b) => a - b) {
    this.compare = compare;
    this.data = [];
  }

  get size() {
    return this.data.length;
  }

  peek() {}
  push(x) {}
  pop() {}
}
`, HEAP_SRC),
      tests: [
        ex('pops in ascending order', ({ env, expect }) => {
          const h = new env.MinHeap();
          [5, 3, 8, 1, 9, 2, 7].forEach((x) => h.push(x));
          const out: number[] = [];
          while (h.size) out.push(h.pop());
          expect(out).toEqual([1, 2, 3, 5, 7, 8, 9]);
        }),
        ex('peek does not remove; empty heap returns undefined', ({ env, expect }) => {
          const h = new env.MinHeap();
          expect([h.peek(), h.pop(), h.size]).toEqual([undefined, undefined, 0]);
          h.push(4); h.push(2);
          expect([h.peek(), h.size]).toEqual([2, 2]);
        }),
        ex('custom comparator: max-heap and objects', ({ env, expect }) => {
          const max = new env.MinHeap((a: number, b: number) => b - a);
          [3, 9, 1].forEach((x) => max.push(x));
          expect([max.pop(), max.pop(), max.pop()]).toEqual([9, 3, 1]);
          const h = new env.MinHeap((a: { d: number }, b: { d: number }) => a.d - b.d);
          h.push({ d: 5 }); h.push({ d: 1 }); h.push({ d: 3 });
          expect(h.pop().d).toBe(1);
        }),
        ex('duplicates are all returned', ({ env, expect }) => {
          const h = new env.MinHeap();
          [2, 2, 1, 1, 2].forEach((x) => h.push(x));
          const out: number[] = [];
          while (h.size) out.push(h.pop());
          expect(out).toEqual([1, 1, 2, 2, 2]);
        }),
        prop('property: interleaved push/pop behaves like a sorted-array model', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-10, 25), 0, 60)], (ops: number[]) => {
            const h = new env.MinHeap();
            const model: number[] = [];
            for (const op of ops) {
              if (op > 15) { expect(h.pop()).toBe(model.shift()); }
              else { h.push(op); model.push(op); model.sort((a, b) => a - b); }
              expect(h.size).toBe(model.length);
              expect(h.peek()).toBe(model[0]);
            }
          });
        }),
        perf('O(log n): 30,000 pushes and pops', async ({ env, expect, measure, rng }) => {
          const r = rng(31);
          const h = new env.MinHeap();
          const { steps } = await measure(() => { for (let i = 0; i < 30000; i++) h.push(r.int(0, 1e6)); let last = -1; while (h.size) { const v = h.pop(); if (v < last) throw new Error('out of order'); last = v; } }, { budget: 30_000_000 });
          expect(steps).toBeLessThan(30000 * 2 * 15 * 8);
        }),
        hid('does not use sort', ({ code, expect }) => expect(/\.\s*sort\s*\(/.test(code)).toBe(false), 'structural'),
      ],
      hints: ['Parent of `i` is `(i - 1) >> 1`; children are `2i + 1` and `2i + 2`.', '`push`: append, then **sift up** — swap with the parent while `compare(item, parent) < 0`.', '`pop`: save the root, move the last element to the root, then **sift down** — swap with the smaller child while that child sorts before the item.'],
    }),

    lab({
      id: 'algo9-kth-largest',
      title: 'Kth largest element (size-k heap)',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['heap', 'top-k'],
      interview: true,
      prompt: `A \`MinHeap\` class is provided (comparator-based, with \`push\`, \`pop\`, \`peek\`, \`size\`). Write \`findKthLargest(nums, k)\` — the k-th largest value (1-based; duplicates count separately) — keeping a **min-heap of at most k elements**: O(n log k) time, O(k) memory. Don't sort \`nums\`.`,
      expose: ['findKthLargest'],
      files: jsFile(HEAP_SRC + `
function findKthLargest(nums, k) {
  const heap = new MinHeap();
  
}
`, HEAP_SRC + `
function findKthLargest(nums, k) {
  const heap = new MinHeap();
  for (const x of nums) {
    heap.push(x);
    if (heap.size > k) heap.pop();
  }
  return heap.peek();
}
`),
      tests: [
        ex('examples', ({ env, expect }) => {
          expect(env.findKthLargest([3, 2, 1, 5, 6, 4], 2)).toBe(5);
          expect(env.findKthLargest([3, 2, 3, 1, 2, 4, 5, 5, 6], 4)).toBe(4);
        }),
        ex('k = 1 and k = n', ({ env, expect }) => {
          expect(env.findKthLargest([7, 2, 9], 1)).toBe(9);
          expect(env.findKthLargest([7, 2, 9], 3)).toBe(2);
        }),
        prop('property: matches sorting', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-9, 9), 1, 25), gen.nat(30)], (xs: number[], k0: number) => {
            const k = 1 + (k0 % xs.length);
            expect(env.findKthLargest(xs, k)).toBe([...xs].sort((a, b) => b - a)[k - 1]);
          });
        }),
        perf('100,000 numbers with k = 10 stays O(n log k)', async ({ env, expect, measure, rng }) => {
          const r = rng(2);
          const a = Array.from({ length: 100000 }, () => r.int(0, 1e9));
          const { value, steps } = await measure(() => env.findKthLargest(a, 10), { budget: 30_000_000 });
          expect(value).toBe([...a].sort((x, y) => y - x)[9]);
          expect(steps).toBeLessThan(100000 * 30);
        }),
        hid('does not sort the input', ({ code, expect }) => expect(/nums\s*\.\s*sort|\.sort\s*\(/.test(code.replace(HEAP_SRC, ''))).toBe(false), 'structural'),
      ],
      hints: ['Push every number into the min-heap.', 'Whenever the heap has more than `k` items, pop the smallest — it can no longer be among the k largest.', 'After the loop the root (`peek()`) is the k-th largest.'],
    }),

    lab({
      id: 'algo9-merge-k',
      title: 'Merge k sorted arrays',
      kind: 'code',
      difficulty: 4,
      minutes: 20,
      tags: ['heap', 'merge'],
      interview: true,
      prompt: `\`mergeKSorted(lists)\` — \`lists\` is an array of ascending arrays (some may be empty). Return one ascending array with all the values. A \`MinHeap\` is provided. Use the heap to keep **one candidate per list**: total time **O(N log k)** (N = total items, k = number of lists). Merging by concatenating and sorting is not allowed.`,
      expose: ['mergeKSorted'],
      files: jsFile(HEAP_SRC + `
function mergeKSorted(lists) {
  
}
`, HEAP_SRC + `
function mergeKSorted(lists) {
  const heap = new MinHeap((a, b) => a.value - b.value);
  lists.forEach((list, i) => {
    if (list.length) heap.push({ value: list[0], list: i, index: 0 });
  });
  const out = [];
  while (heap.size) {
    const { value, list, index } = heap.pop();
    out.push(value);
    if (index + 1 < lists[list].length) heap.push({ value: lists[list][index + 1], list, index: index + 1 });
  }
  return out;
}
`),
      tests: [
        ex('example', ({ env, expect }) => expect(env.mergeKSorted([[1, 4, 5], [1, 3, 4], [2, 6]])).toEqual([1, 1, 2, 3, 4, 4, 5, 6])),
        ex('empty cases', ({ env, expect }) => {
          expect(env.mergeKSorted([])).toEqual([]);
          expect(env.mergeKSorted([[], []])).toEqual([]);
          expect(env.mergeKSorted([[], [2, 3], []])).toEqual([2, 3]);
        }),
        ex('does not mutate the input lists', ({ env, expect }) => {
          const a = [[1, 2], [0, 5]];
          env.mergeKSorted(a);
          expect(a).toEqual([[1, 2], [0, 5]]);
        }),
        prop('property: equals concatenate-and-sort', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.array(gen.int(-9, 9), 0, 8), 0, 6)], (ls: number[][]) => {
            const sorted = ls.map((l) => [...l].sort((a, b) => a - b));
            expect(env.mergeKSorted(sorted)).toEqual(sorted.flat().sort((a, b) => a - b));
          });
        }),
        perf('100 lists × 1,000 items: O(N log k)', async ({ env, expect, measure, rng }) => {
          const r = rng(14);
          const lists = Array.from({ length: 100 }, () => Array.from({ length: 1000 }, () => r.int(0, 1e6)).sort((a, b) => a - b));
          const { value, steps } = await measure(() => env.mergeKSorted(lists), { budget: 40_000_000 });
          expect(value.length).toBe(100000);
          expect(steps).toBeLessThan(100000 * 7 * 12);
        }),
        hid('does not sort the output', ({ code, expect }) => expect(/\.\s*sort\s*\(/.test(code.replace(HEAP_SRC, ''))).toBe(false), 'structural'),
      ],
      hints: ['Seed the heap with the first element of each non-empty list, remembering `{ value, list, index }`.', 'Pop the smallest, append it, and push the **next element of the same list** (if any).', 'Use a comparator on `value`: `new MinHeap((a, b) => a.value - b.value)`.'],
    }),

    lab({
      id: 'algo9-median',
      title: 'Running median',
      kind: 'code',
      difficulty: 4,
      minutes: 25,
      tags: ['heap', 'design'],
      interview: true,
      prompt: `Implement \`class MedianFinder\` with \`addNum(x)\` (O(log n)) and \`findMedian()\` (O(1)): the median of all numbers added so far (the middle value, or the mean of the two middle values when the count is even; \`undefined\` when empty).

A \`MinHeap\` is provided. Use **two heaps**: a max-heap (comparator reversed) for the lower half and a min-heap for the upper half, keeping their sizes within 1 of each other.`,
      expose: ['MedianFinder'],
      files: jsFile(HEAP_SRC + `
class MedianFinder {
  constructor() {
    this.low = new MinHeap((a, b) => b - a); // max-heap: smaller half
    this.high = new MinHeap(); // min-heap: larger half
  }

  addNum(x) {}

  findMedian() {}
}
`, HEAP_SRC + `
class MedianFinder {
  constructor() {
    this.low = new MinHeap((a, b) => b - a);
    this.high = new MinHeap();
  }

  addNum(x) {
    this.low.push(x);
    this.high.push(this.low.pop());
    if (this.high.size > this.low.size) this.low.push(this.high.pop());
  }

  findMedian() {
    if (this.low.size === 0) return undefined;
    if (this.low.size > this.high.size) return this.low.peek();
    return (this.low.peek() + this.high.peek()) / 2;
  }
}
`),
      tests: [
        ex('example', ({ env, expect }) => {
          const m = new env.MedianFinder();
          m.addNum(1); m.addNum(2);
          expect(m.findMedian()).toBe(1.5);
          m.addNum(3);
          expect(m.findMedian()).toBe(2);
        }),
        ex('empty and single', ({ env, expect }) => {
          const m = new env.MedianFinder();
          expect(m.findMedian()).toBe(undefined);
          m.addNum(-5);
          expect(m.findMedian()).toBe(-5);
        }),
        ex('decreasing and duplicate inputs', ({ env, expect }) => {
          const m = new env.MedianFinder();
          const seen: number[] = [];
          for (const x of [9, 7, 7, 3, 3, 3, 1]) { m.addNum(x); seen.push(x); }
          expect(m.findMedian()).toBe(3);
        }),
        prop('property: the median after every insertion matches a sorted array', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-30, 30), 1, 40)], (xs: number[]) => {
            const m = new env.MedianFinder();
            const seen: number[] = [];
            for (const x of xs) {
              m.addNum(x); seen.push(x);
              const s = [...seen].sort((a, b) => a - b);
              const n = s.length;
              expect(m.findMedian()).toBe(n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2);
            }
          });
        }),
        perf('50,000 insertions + queries: O(log n) each', async ({ env, expect, measure, rng }) => {
          const r = rng(19);
          const m = new env.MedianFinder();
          const { steps } = await measure(() => { let s = 0; for (let i = 0; i < 50000; i++) { m.addNum(r.int(0, 1e6)); s += m.findMedian(); } return s; }, { budget: 60_000_000 });
          expect(steps).toBeLessThan(50000 * 4 * 17 * 8);
        }),
        hid('does not sort inside addNum / findMedian', ({ code, expect }) => expect(/\.\s*sort\s*\(/.test(code.replace(HEAP_SRC, ''))).toBe(false), 'structural'),
      ],
      hints: ['Invariant: every number in `low` ≤ every number in `high`, and `low.size` is either equal to `high.size` or one larger.', 'To insert: push into `low`, move `low`\'s top into `high` (so the halves stay ordered), then rebalance if `high` became larger.', 'Median: if sizes differ, the top of `low`; else the mean of both tops.'],
    }),
  ],
  references: [{ title: 'CLRS — Introduction to Algorithms, Ch. 6 Heapsort' }],
};
export default mod;
