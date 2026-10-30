import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';

const mod: Module = {
  id: 'sorting-searching',
  course: 'algos',
  title: 'Sorting & Binary Search (including Search on the Answer)',
  minutes: 55,
  objectives: [
    'Explain merge sort, quicksort and heapsort, their complexities and trade-offs (stability, in-place)',
    'Write a bug-free binary search using a loop invariant (lower bound / upper bound)',
    'Search a rotated sorted array in O(log n)',
    'Apply binary search to a *monotonic yes/no question about the answer*',
  ],
  body: `
## Sorting in one table

| Algorithm | Time (avg / worst) | Space | Stable? | Notes |
|---|---|---|---|---|
| Insertion | O(n²) / O(n²) | O(1) | yes | fastest for tiny or nearly sorted input |
| Merge sort | O(n log n) / O(n log n) | O(n) | **yes** | predictable; good for linked lists and external sorting |
| Quicksort | O(n log n) / O(n²) | O(log n) | no | fastest in practice; random pivot avoids the bad case |
| Heapsort | O(n log n) / O(n log n) | O(1) | no | in-place, worst-case guarantee |
| Counting / radix | O(n + k) | O(k) | yes | integers in a small range |

**Lower bound:** any **comparison** sort needs Ω(n log n) comparisons (a decision tree with n! leaves has height ≥ log₂ n!). Beating it needs non-comparison tricks (counting, radix).

A sort is **stable** if equal elements keep their input order — essential when sorting by several keys in sequence. JavaScript's \`Array.prototype.sort\` is stable (ES2019) and sorts as **strings** unless you pass a comparator:

\`\`\`js run
console.log([10, 9, 1, 100].sort());                 // [1, 10, 100, 9]  (lexicographic!)
console.log([10, 9, 1, 100].sort((a, b) => a - b));  // [1, 9, 10, 100]
\`\`\`

### Merge sort (divide & conquer)

Split in half, sort each half recursively, **merge** the two sorted halves in linear time. T(n) = 2T(n/2) + O(n) = O(n log n).

\`\`\`js run
function mergeSort(a) {
  if (a.length <= 1) return a;
  const mid = a.length >> 1;
  const left = mergeSort(a.slice(0, mid));
  const right = mergeSort(a.slice(mid));
  const out = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) out.push(right[j] < left[i] ? right[j++] : left[i++]);   // ties take left → stable
  return out.concat(left.slice(i), right.slice(j));
}
console.log(mergeSort([5, 2, 9, 1, 5, 6]));
\`\`\`

## Binary search — and why everyone gets it wrong

Binary search halves the candidate range each step: O(log n). The famous bug: it is easy to write an off-by-one or an infinite loop. The robust method is a **loop invariant**:

> "The answer, if it exists, lies in the half-open range \`[lo, hi)\`."

\`\`\`js run
// lowerBound: first index i with a[i] >= x  (== a.length if none)
function lowerBound(a, x) {
  let lo = 0, hi = a.length;            // search space [lo, hi)
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);  // avoids overflow in other languages
    if (a[mid] < x) lo = mid + 1;       // everything <= mid is too small
    else hi = mid;                      // mid might be the answer — keep it
  }
  return lo;
}
const a = [1, 2, 2, 2, 5, 8];
console.log(lowerBound(a, 2), lowerBound(a, 3), lowerBound(a, 9));
\`\`\`

Once you have \`lowerBound\` everything follows: \`binarySearch\` = check \`a[lb] === x\`; \`upperBound(x) = lowerBound(x + 1)\` for integers; count of \`x\` = \`upper - lower\`; insertion point = \`lowerBound\`.

## Binary search on the answer

Binary search works on **any monotonic predicate** — not just sorted arrays. If the answers can be ordered so that \`feasible(k)\` is "false, false, …, true, true, …", search for the first true.

*"Koko eats bananas: piles, h hours, minimum speed k so she finishes in time?"* — \`feasible(k) = Σ ceil(pile / k) ≤ h\` is monotonic in k, and k ∈ [1, max pile].

\`\`\`js run
function minSpeed(piles, h) {
  const hours = (k) => piles.reduce((t, p) => t + Math.ceil(p / k), 0);
  let lo = 1, hi = Math.max(...piles);
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (hours(mid) <= h) hi = mid; else lo = mid + 1;
  }
  return lo;
}
console.log(minSpeed([3, 6, 7, 11], 8));
\`\`\`

Recognise it by wording: "**minimise the maximum**", "**maximise the minimum**", "smallest/largest value such that…", "ship packages within D days", "split array into k parts to minimise the largest sum". Cost: O(log(range) × cost of checking one candidate).

## Rotated sorted array

A sorted array rotated at an unknown pivot (\`[4,5,6,7,0,1,2]\`) still has structure: at any \`mid\`, **at least one half is sorted**. Decide which half is sorted, check if the target lies in it, and discard the other half — still O(log n).

:::warn
**Binary search checklist:** (1) Is the predicate really monotonic? (2) Half-open or closed range — be consistent. (3) \`mid\` rounding: with \`lo = mid\` you can loop forever unless \`mid\` rounds up. (4) Return value when nothing is found. (5) Duplicates: which one do you want (first/last)?
:::

:::interview
"Can we do better than O(n)?" on any sorted/monotone structure → **binary search**. Say the invariant out loud; mention the half-open interval; test an empty array, one element, target smaller than all, larger than all.
:::
`,
  quiz: [
    { q: 'Why is merge sort stable?', options: ['It uses recursion', 'When elements are equal the merge step takes the left one first, preserving input order', 'It is in-place', 'It uses a heap'], answer: 1, why: 'The tie-breaking rule in the merge keeps equal items in their original order.' },
    { q: '`[10, 9, 1, 100].sort()` returns…', options: ['[1, 9, 10, 100]', '[1, 10, 100, 9]', '[100, 10, 9, 1]', 'It throws'], answer: 1, why: 'Without a comparator, elements are compared as strings.' },
    { q: 'What is the minimum number of comparisons any comparison sort needs in the worst case (asymptotically)?', options: ['Ω(n)', 'Ω(n log n)', 'Ω(n²)', 'Ω(log n)'], answer: 1, why: 'A decision tree distinguishing n! orderings has height at least log₂(n!) = Θ(n log n).' },
    { q: 'Binary search on the answer requires the feasibility predicate to be…', options: ['Random', 'Monotonic (false…false, true…true)', 'Differentiable', 'Prime'], answer: 1, why: 'Monotonicity is what lets you discard half the candidates.' },
  ],
  labs: [
    lab({
      id: 'algo7-mergesort',
      title: 'Merge sort with a comparator',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['sorting', 'divide-and-conquer'],
      interview: true,
      prompt: `\`mergeSort(arr, cmp = (a, b) => a - b)\` — return a **new** sorted array (don't mutate the input). Requirements:

- **Stable**: elements that compare equal keep their input order.
- All ordering decisions go through \`cmp(a, b)\` (negative = a first).
- At most \`n × ⌈log₂ n⌉\` calls to \`cmp\`.
- Don't use \`Array.prototype.sort\`.`,
      expose: ['mergeSort'],
      files: jsFile(`function mergeSort(arr, cmp = (a, b) => a - b) {\n  \n}\n`, `function mergeSort(arr, cmp = (a, b) => a - b) {
  if (arr.length <= 1) return arr.slice();
  const mid = arr.length >> 1;
  const left = mergeSort(arr.slice(0, mid), cmp);
  const right = mergeSort(arr.slice(mid), cmp);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (cmp(right[j], left[i]) < 0) out.push(right[j++]);
    else out.push(left[i++]);
  }
  while (i < left.length) out.push(left[i++]);
  while (j < right.length) out.push(right[j++]);
  return out;
}
`),
      tests: [
        ex('sorts numbers', ({ env, expect }) => expect(env.mergeSort([5, 2, 9, 1, 5, 6, -3])).toEqual([-3, 1, 2, 5, 5, 6, 9])),
        ex('empty, single, already sorted, reversed', ({ env, expect }) => {
          expect(env.mergeSort([])).toEqual([]);
          expect(env.mergeSort([1])).toEqual([1]);
          expect(env.mergeSort([1, 2, 3])).toEqual([1, 2, 3]);
          expect(env.mergeSort([3, 2, 1])).toEqual([1, 2, 3]);
        }),
        ex('does not mutate the input', ({ env, expect }) => {
          const a = [3, 1, 2];
          const r = env.mergeSort(a);
          expect(a).toEqual([3, 1, 2]);
          expect(r).not.toBe(a);
        }),
        ex('uses the comparator (descending, by key)', ({ env, expect }) => {
          expect(env.mergeSort([1, 3, 2], (a: number, b: number) => b - a)).toEqual([3, 2, 1]);
          const people = [{ n: 'b', a: 2 }, { n: 'a', a: 1 }];
          expect(env.mergeSort(people, (x: any, y: any) => x.a - y.a).map((p: any) => p.n)).toEqual(['a', 'b']);
        }),
        ex('is stable', ({ env, expect }) => {
          const items = [[1, 'a'], [0, 'b'], [1, 'c'], [0, 'd'], [1, 'e']] as [number, string][];
          const r = env.mergeSort(items, (x: [number, string], y: [number, string]) => x[0] - y[0]);
          expect(r.map((p: [number, string]) => p[1]).join('')).toBe('bdace');
        }),
        prop('property: result equals the built-in sort', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-20, 20), 0, 40)], (xs: number[]) => expect(env.mergeSort(xs)).toEqual([...xs].sort((a, b) => a - b)));
        }),
        perf('at most n·⌈log₂ n⌉ comparisons for n = 5,000', async ({ env, expect, measure, rng }) => {
          const r = rng(8);
          const a = Array.from({ length: 5000 }, () => r.int(0, 100000));
          let cmps = 0;
          const { value } = await measure(() => env.mergeSort(a, (x: number, y: number) => (cmps++, x - y)), { budget: 20_000_000 });
          expect(value).toEqual([...a].sort((x, y) => x - y));
          expect(cmps).toBeLessThanOrEqual(5000 * Math.ceil(Math.log2(5000)));
        }),
        hid('does not call Array.prototype.sort', ({ code, expect }) => expect(/\.\s*sort\s*\(/.test(code)).toBe(false), 'structural'),
      ],
      hints: ['Base case: arrays of length 0 or 1 are already sorted (return a copy).', 'Split in half with `slice`, sort each half recursively, then merge.', 'Merge: while both have items, take the right item only if `cmp(right, left) < 0` — taking the **left** on ties makes it stable.'],
    }),

    lab({
      id: 'algo7-bounds',
      title: 'lowerBound and upperBound',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['binary-search'],
      interview: true,
      prompt: `For a sorted (ascending, possibly duplicated) array:

- \`lowerBound(a, x)\` — the first index \`i\` with \`a[i] >= x\` (or \`a.length\` if none).
- \`upperBound(a, x)\` — the first index \`i\` with \`a[i] > x\` (or \`a.length\`).

Both must run in O(log n). Use a half-open search range \`[lo, hi)\`. (Then \`upperBound - lowerBound\` is the count of \`x\`.)`,
      expose: ['lowerBound', 'upperBound'],
      files: jsFile(`function lowerBound(a, x) {\n  \n}\n\nfunction upperBound(a, x) {\n  \n}\n`, `function lowerBound(a, x) {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (a[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBound(a, x) {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (a[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
`),
      tests: [
        ex('with duplicates', ({ env, expect }) => {
          const a = [1, 2, 2, 2, 5, 8];
          expect([env.lowerBound(a, 2), env.upperBound(a, 2)]).toEqual([1, 4]);
          expect([env.lowerBound(a, 3), env.upperBound(a, 3)]).toEqual([4, 4]);
        }),
        ex('out of range', ({ env, expect }) => {
          const a = [1, 2, 3];
          expect([env.lowerBound(a, 0), env.upperBound(a, 0)]).toEqual([0, 0]);
          expect([env.lowerBound(a, 9), env.upperBound(a, 9)]).toEqual([3, 3]);
        }),
        ex('empty array', ({ env, expect }) => expect([env.lowerBound([], 5), env.upperBound([], 5)]).toEqual([0, 0])),
        prop('property: matches a linear scan', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-6, 6), 0, 20), gen.int(-8, 8)], (xs: number[], x: number) => {
            const a = [...xs].sort((p, q) => p - q);
            let lb = a.length, ub = a.length;
            for (let i = 0; i < a.length; i++) { if (a[i] >= x) { lb = i; break; } }
            for (let i = 0; i < a.length; i++) { if (a[i] > x) { ub = i; break; } }
            expect([env.lowerBound(a, x), env.upperBound(a, x)]).toEqual([lb, ub]);
          }, { runs: 300 });
        }),
        perf('logarithmic: 2,000 queries on a million elements', async ({ env, expect, measure }) => {
          const a = Array.from({ length: 1_000_000 }, (_, i) => i >> 1);
          const { steps } = await measure(() => { let s = 0; for (let q = 0; q < 2000; q++) s += env.lowerBound(a, q * 250); return s; }, { budget: 2_000_000 });
          expect(steps).toBeLessThan(2000 * 60);
        }),
      ],
      hints: ['Loop invariant: the answer is in `[lo, hi)`. Start with `lo = 0`, `hi = a.length`.', '`lowerBound`: if `a[mid] < x` the answer is to the right (`lo = mid + 1`), otherwise `mid` might be it (`hi = mid`).', '`upperBound` is the same with `<=` instead of `<`.'],
    }),

    lab({
      id: 'algo7-rotated',
      title: 'Search in a rotated sorted array',
      kind: 'code',
      difficulty: 4,
      minutes: 20,
      tags: ['binary-search'],
      interview: true,
      prompt: `\`searchRotated(nums, target)\` — \`nums\` was sorted ascending (all values **distinct**) and then rotated at an unknown pivot, e.g. \`[4,5,6,7,0,1,2]\`. Return the index of \`target\` or \`-1\`. **O(log n)**.`,
      expose: ['searchRotated'],
      files: jsFile(`function searchRotated(nums, target) {\n  \n}\n`, `function searchRotated(nums, target) {
  let lo = 0;
  let hi = nums.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (nums[mid] === target) return mid;
    if (nums[lo] <= nums[mid]) {
      if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;
      else lo = mid + 1;
    } else {
      if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;
      else hi = mid - 1;
    }
  }
  return -1;
}
`),
      tests: [
        ex('examples', ({ env, expect }) => {
          const a = [4, 5, 6, 7, 0, 1, 2];
          expect([env.searchRotated(a, 0), env.searchRotated(a, 4), env.searchRotated(a, 2), env.searchRotated(a, 3)]).toEqual([4, 0, 6, -1]);
        }),
        ex('edge cases', ({ env, expect }) => {
          expect(env.searchRotated([], 1)).toBe(-1);
          expect(env.searchRotated([1], 1)).toBe(0);
          expect(env.searchRotated([1], 0)).toBe(-1);
          expect(env.searchRotated([3, 1], 1)).toBe(1);
          expect(env.searchRotated([1, 3], 3)).toBe(1);
        }),
        prop('property: finds every element for every rotation', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.sortedInts(14, -30, 30), gen.nat(40)], (base: number[], rot: number) => {
            if (base.length === 0) return;
            const k = rot % base.length;
            const a = [...base.slice(k), ...base.slice(0, k)];
            for (let i = 0; i < a.length; i++) expect(env.searchRotated(a, a[i])).toBe(i);
            expect(env.searchRotated(a, 1000)).toBe(-1);
          });
        }),
        perf('logarithmic on a million elements', async ({ env, expect, measure }) => {
          const n = 1_000_000;
          const a = Array.from({ length: n }, (_, i) => (i + 777_777) % n);
          const { value, steps } = await measure(() => env.searchRotated(a, 5), { budget: 1_000_000 });
          expect(a[value]).toBe(5);
          expect(steps).toBeLessThan(200);
        }),
      ],
      hints: ['At any `mid`, at least one of `[lo, mid]` and `[mid, hi]` is sorted. Test with `nums[lo] <= nums[mid]`.', 'If the left half is sorted, check whether the target falls in `[nums[lo], nums[mid])`; if so go left, otherwise go right.', 'Mirror the logic for the case where the right half is sorted.'],
    }),

    lab({
      id: 'algo7-koko',
      title: 'Binary search on the answer: Koko eats bananas',
      kind: 'code',
      difficulty: 4,
      minutes: 20,
      tags: ['binary-search', 'search-on-answer'],
      interview: true,
      prompt: `Koko has piles of bananas (\`piles[i]\` bananas). Each hour she picks **one pile** and eats up to \`k\` bananas from it (if the pile has fewer, she finishes it and wastes the rest of the hour). She must finish all piles within \`h\` hours (\`h >= piles.length\`).

\`minEatingSpeed(piles, h)\` — the **smallest integer k** that lets her finish in time. Binary search over \`k\` (the number of hours needed is monotonically non-increasing in k).`,
      expose: ['minEatingSpeed'],
      files: jsFile(`function minEatingSpeed(piles, h) {\n  \n}\n`, `function minEatingSpeed(piles, h) {
  let lo = 1;
  let hi = 1;
  for (const p of piles) if (p > hi) hi = p;
  const hours = (k) => {
    let t = 0;
    for (const p of piles) t += Math.ceil(p / k);
    return t;
  };
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (hours(mid) <= h) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
`),
      tests: [
        ex('examples', ({ env, expect }) => {
          expect(env.minEatingSpeed([3, 6, 7, 11], 8)).toBe(4);
          expect(env.minEatingSpeed([30, 11, 23, 4, 20], 5)).toBe(30);
          expect(env.minEatingSpeed([30, 11, 23, 4, 20], 6)).toBe(23);
        }),
        ex('one pile', ({ env, expect }) => {
          expect(env.minEatingSpeed([10], 5)).toBe(2);
          expect(env.minEatingSpeed([1], 1)).toBe(1);
        }),
        prop('property: k is feasible and k-1 is not', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(1, 40), 1, 8), gen.nat(60)], (piles: number[], extra: number) => {
            const h = piles.length + (extra % 40);
            const k = env.minEatingSpeed(piles, h);
            const need = (s: number) => piles.reduce((t, p) => t + Math.ceil(p / s), 0);
            expect(need(k)).toBeLessThanOrEqual(h);
            if (k > 1) expect(need(k - 1)).toBeGreaterThan(h);
          }, { runs: 200 });
        }),
        perf('50,000 piles with huge values still finishes quickly (≈ log(range) × n)', async ({ env, expect, measure, rng }) => {
          const r = rng(6);
          const piles = Array.from({ length: 50000 }, () => r.int(1, 1_000_000_000));
          const { steps } = await measure(() => env.minEatingSpeed(piles, 60000), { budget: 8_000_000 });
          expect(steps).toBeLessThan(40 * 50000 * 3);
        }),
      ],
      hints: ['The answer `k` lies in `[1, max(piles)]`.', 'Write `hours(k) = Σ ceil(pile / k)`. It never increases when `k` grows — so the predicate `hours(k) <= h` is false…false, true…true.', 'Find the first `k` where it is true: `while (lo < hi) { mid = (lo+hi)>>1; if (hours(mid) <= h) hi = mid; else lo = mid + 1; }`.'],
      why: '"Minimise the maximum" and "maximise the minimum" problems — capacity planning, scheduling, load balancing — are all this one trick.',
    }),
  ],
  references: [{ title: 'Jon Bentley — Programming Pearls: binary search is hard to get right' }],
};
export default mod;
