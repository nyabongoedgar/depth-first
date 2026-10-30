import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';

const mod: Module = {
  id: 'complexity-method',
  course: 'algos',
  title: 'Problem-Solving Method & Complexity',
  minutes: 40,
  objectives: [
    'Apply a repeatable method to unfamiliar problems: clarify → examples → brute force → bottleneck → pattern → code → test → complexity',
    'Read and write Big-O for loops, recursion and data-structure operations',
    'Use input size constraints to choose a target complexity',
    'Trade time for space with hash tables',
  ],
  body: `
## The method

Strong candidates are not people who "know the answer" — they have a **process** that finds one under pressure. Use it every time:

1. **Clarify** — restate the problem; ask about input size, value ranges, duplicates, empty input, negative numbers, sorted-ness, memory limits. Ask what to return when there is no answer.
2. **Examples** — write a small normal case, an edge case (empty, one element, all equal) and a tricky case. Work one by hand.
3. **Brute force** — say the obvious approach and its cost (even if it is O(n²) or O(2ⁿ)). It proves you understand the problem and gives you a correctness oracle.
4. **Find the bottleneck** — which step repeats work or searches linearly? ("I look up the complement by scanning — that's the O(n) I need to remove.")
5. **Pick a pattern/structure** — hash map, two pointers, sliding window, sort + binary search, stack, heap, BFS/DFS, DP, union-find…
6. **Code** it cleanly (small helper functions, good names).
7. **Test by hand** on your examples and the edge cases; fix off-by-one errors *before* running.
8. **State the complexity** — time **and** space — and mention trade-offs and follow-ups.

:::interview
Interviewers grade **communication and reasoning** as much as the final code. Silence while you think is fine for 30 seconds; after that, think aloud. If you're stuck, say what you've tried and what you'd try next.
:::

## Big-O in one page

**Big-O** describes how the cost grows with input size *n*, ignoring constants and lower-order terms: \`3n² + 10n + 7\` is O(n²). We usually count the **worst case** and also the **memory** used.

| Growth | Name | Typical source | n = 10⁶ takes… |
|---|---|---|---|
| O(1) | constant | array index, hash lookup, push/pop | 1 op |
| O(log n) | logarithmic | binary search, balanced tree, heap push | ~20 ops |
| O(n) | linear | one pass, scan | 10⁶ |
| O(n log n) | linearithmic | good sorts, divide & conquer | ~2·10⁷ |
| O(n²) | quadratic | nested loops over the input | 10¹² ✗ too slow |
| O(2ⁿ) | exponential | all subsets, naive recursion | impossible beyond n≈25–30 |
| O(n!) | factorial | all permutations | impossible beyond n≈10–11 |

**Reading code:**

\`\`\`js run
function a(n) { for (let i = 0; i < n; i++) {} }                       // O(n)
function b(n) { for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {} }   // O(n²)
function c(n) { for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) {} }   // n(n-1)/2 → still O(n²)
function d(n) { for (let i = 1; i < n; i *= 2) {} }                    // doubles each time → O(log n)
function e(n) { return n <= 1 ? 1 : e(n - 1) + e(n - 1); }             // T(n)=2T(n-1) → O(2ⁿ)
const count = (f, n) => { let steps = 0; const orig = f; return n; };
console.log([8, 16, 32].map((n) => { let s = 0; for (let i = 1; i < n; i *= 2) s++; return s; }));   // log₂ grows by 1 each doubling
\`\`\`

**Rules of thumb:** sequential steps *add* (O(n) + O(n²) = O(n²)); nested loops *multiply*; halving the problem each step gives a **log**; recursion: write the recurrence (\`T(n) = 2T(n/2) + n\` → O(n log n) by the Master theorem).

### Amortised cost

\`array.push\` is O(1) *amortised*: occasionally it must reallocate and copy (O(n)), but over n pushes the average per push is constant. Similarly, \`Map.set\`, dynamic arrays and union-find.

## Constraints tell you the answer

The input limit hints at the intended complexity (assume ~10⁸ simple operations per second in compiled languages; ~10⁷–10⁸ in JS):

| n ≤ | Aim for |
|---|---|
| 10–12 | O(n!) or O(2ⁿ·n) brute force / backtracking |
| 20–25 | O(2ⁿ) subsets, meet in the middle |
| 500 | O(n³) (Floyd–Warshall, 3 nested loops) |
| 5,000 | O(n²) |
| 10⁵–10⁶ | O(n log n) or O(n) |
| 10⁹+ | O(log n) or O(1) (math, binary search) |

## Space for time: hash tables

A hash map gives O(1) average insert/lookup. The classic trade: replace an inner loop with a lookup of "what do I need to have seen?":

\`\`\`js run
// O(n²): for each x, scan for target - x
const slow = (a, t) => { for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i] + a[j] === t) return [i, j]; return null; };
// O(n) time, O(n) space: remember what we've seen
const fast = (a, t) => { const seen = new Map(); for (let i = 0; i < a.length; i++) { if (seen.has(t - a[i])) return [seen.get(t - a[i]), i]; seen.set(a[i], i); } return null; };
console.log(slow([2, 7, 11, 15], 9), fast([2, 7, 11, 15], 9));
\`\`\`

:::warn
A hash lookup is O(1) *on average*. A hostile input can force collisions (O(n) per op), and keys that must be **hashed** (long strings) cost O(length). Also: \`arr.includes\`, \`indexOf\`, \`slice\`, \`concat\`, spread and \`string +=\` in a loop are **O(n) each** — hidden quadratics hide there.
:::

:::tip
In these labs complexity is **graded by counting steps**, not wall-clock time: a quadratic solution on 100,000 elements fails deterministically, on any machine. Native helpers like \`includes\` aren't counted, so labs ban them when they'd hide the cost.
:::
`,
  quiz: [
    { q: 'What is the time complexity of `for (let i = 1; i < n; i *= 2) {}`?', options: ['O(n)', 'O(log n)', 'O(n log n)', 'O(√n)'], answer: 1, why: 'i doubles each iteration, so it takes about log₂ n iterations.' },
    { q: 'n = 200,000 and you have ~1 second. Which complexity is safe?', options: ['O(n²)', 'O(n log n)', 'O(2ⁿ)', 'O(n³)'], answer: 1, why: 'n log n ≈ 3.5 million operations; n² would be 4·10¹⁰.' },
    { q: '`array.push` is described as O(1) amortised because…', options: ['It never copies', 'Rare O(n) resizes are averaged over many cheap pushes', 'It uses a linked list', 'It is O(log n)'], answer: 1, why: 'Doubling capacity makes the total copy cost over n pushes O(n).' },
    { q: 'Which line hides an O(n) cost inside a loop?', options: ['`set.add(x)`', '`if (arr.includes(x))`', '`map.get(k)`', '`i++`'], answer: 1, why: '`includes` scans the array — the loop becomes O(n²).' },
    { q: 'What should you do BEFORE optimising in an interview?', options: ['Write the optimal solution immediately', 'State a brute-force solution and its cost, then find the bottleneck', 'Ask for a hint', 'Start coding the edge cases'], answer: 1, why: 'Brute force proves understanding and shows which step to remove.' },
  ],
  labs: [
    lab({
      id: 'algo1-classify',
      title: 'Classify the growth',
      kind: 'answer',
      difficulty: 1,
      minutes: 8,
      tags: ['big-o'],
      prompt: 'Give the **time complexity** of each snippet in Big-O (e.g. `O(n)`, `O(n^2)`, `O(log n)`, `O(n log n)`, `O(2^n)`, `O(1)`).',
      questions: [
        { id: 'q1', prompt: '```\nfor (let i = 0; i < n; i++)\n  for (let j = 0; j < n; j++) work();\n```', type: 'text', answer: ['o(n^2)', 'o(n²)', 'o(n*n)', 'o(n2)'] },
        { id: 'q2', prompt: '```\nfor (let i = 1; i < n; i *= 2) work();\n```', type: 'text', answer: ['o(log n)', 'o(logn)', 'o(log2 n)', 'o(log(n))', 'o(lg n)'] },
        { id: 'q3', prompt: '```\nfor (let i = 0; i < n; i++)\n  for (let j = 0; j < i; j++) work();\n```\n(inner loop runs 0+1+2+…+(n−1) times)', type: 'text', answer: ['o(n^2)', 'o(n²)', 'o(n*n)', 'o(n2)'] },
        { id: 'q4', prompt: 'Binary search in a sorted array of n items.', type: 'text', answer: ['o(log n)', 'o(logn)', 'o(log2 n)', 'o(log(n))', 'o(lg n)'] },
        { id: 'q5', prompt: '```\nfunction f(n) { return n < 2 ? n : f(n - 1) + f(n - 2); }\n```\n(naive recursion, each call makes two calls)', type: 'text', answer: ['o(2^n)', 'o(2ⁿ)', 'o(phi^n)', 'o(1.618^n)', 'o(φ^n)', 'o(fib(n))'] },
        { id: 'q6', prompt: 'Sorting n numbers with a good comparison sort (merge sort).', type: 'text', answer: ['o(n log n)', 'o(nlogn)', 'o(n*log n)', 'o(n log(n))', 'o(n lg n)'] },
        { id: 'q7', prompt: 'Merging two already-sorted arrays of sizes n and m into one.', type: 'text', answer: ['o(n+m)', 'o(n + m)', 'o(m+n)', 'o(m + n)'] },
      ],
      hints: ['Count how many times the innermost statement runs as a function of n.', 'Halving or doubling per step ⇒ logarithm.', 'The naive Fibonacci call tree roughly doubles at every level.'],
    }),

    lab({
      id: 'algo1-budget',
      title: 'Estimate the work',
      kind: 'answer',
      difficulty: 2,
      minutes: 8,
      tags: ['big-o'],
      prompt: 'Use rough operation counts to decide what is feasible. Assume log is base 2. Give plain numbers (scientific notation like `3.5e6` is fine).',
      questions: [
        { id: 'b1', prompt: 'How many operations does an O(n log n) algorithm perform for n = 1,000,000? (n × log₂ n, nearest 0.1 million)', type: 'number', answer: 19931568, tolerance: 0.05, explain: 'log₂(10⁶) ≈ 19.93.' },
        { id: 'b2', prompt: 'How many operations does an O(n²) algorithm perform for n = 100,000?', type: 'number', answer: 1e10, tolerance: 0.001, explain: '10⁵ × 10⁵ = 10¹⁰ — about 100× too slow for a one-second limit at 10⁸ ops/s.' },
        { id: 'b3', prompt: 'What is the **largest n** (power of ten) for which an O(n²) algorithm stays within 10⁸ operations?', type: 'number', answer: 10000, tolerance: 0.001 },
        { id: 'b4', prompt: 'An algorithm that tries all subsets of n items does 2ⁿ steps. For n = 30, how many steps? (give the number)', type: 'number', answer: 1073741824, tolerance: 0.001 },
        { id: 'b5', prompt: 'How many comparisons does binary search need, **at most**, for a sorted array of 1,000,000 items? (⌈log₂(n+1)⌉)', type: 'number', answer: 20, tolerance: 0.001 },
        { id: 'b6', prompt: 'You process queries on n = 5·10⁵ items, q = 5·10⁵ queries, each answered in O(log n). Roughly how many operations in total (millions, 1 d.p.)? (q × log₂ n with log₂(5·10⁵) ≈ 18.9)', type: 'number', answer: 9.45e6, tolerance: 0.03 },
      ],
      hints: ['log₂(10⁶) ≈ 20, log₂(10⁵) ≈ 17, log₂(10³) ≈ 10.', '10⁸ operations is the usual "about one second" budget.', '2¹⁰ = 1024 ≈ 10³, so 2³⁰ ≈ 10⁹.'],
    }),

    lab({
      id: 'algo1-has-duplicate',
      title: 'hasDuplicate in O(n)',
      kind: 'code',
      difficulty: 1,
      minutes: 8,
      tags: ['hashing', 'big-o'],
      prompt: `Write \`hasDuplicate(nums)\` returning \`true\` if any value appears at least twice. The brute-force answer is O(n²); aim for **O(n)** time using a hash set.

\`Array.prototype.includes\`, \`indexOf\` and \`sort\` are not allowed (they hide cost).`,
      expose: ['hasDuplicate'],
      files: jsFile(
        `function hasDuplicate(nums) {
  
}
`,
        `function hasDuplicate(nums) {
  const seen = new Set();
  for (const x of nums) {
    if (seen.has(x)) return true;
    seen.add(x);
  }
  return false;
}
`
      ),
      tests: [
        ex('basic cases', ({ env, expect }) => {
          expect(env.hasDuplicate([1, 2, 3, 1])).toBe(true);
          expect(env.hasDuplicate([1, 2, 3, 4])).toBe(false);
          expect(env.hasDuplicate([])).toBe(false);
          expect(env.hasDuplicate([7])).toBe(false);
          expect(env.hasDuplicate([5, 5])).toBe(true);
        }),
        ex('negative numbers and zero', ({ env, expect }) => {
          expect(env.hasDuplicate([0, -1, -2, 0])).toBe(true);
          expect(env.hasDuplicate([-1, 1])).toBe(false);
        }),
        prop('property: agrees with a brute-force check', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-8, 8), 0, 14)], (xs: number[]) => {
            const want = new Set(xs).size !== xs.length;
            expect(env.hasDuplicate(xs)).toBe(want);
          });
        }),
        perf('linear time: 100,000 distinct values', async ({ env, expect, measure }) => {
          const big = Array.from({ length: 100000 }, (_, i) => i * 3);
          const { value, steps } = await measure(() => env.hasDuplicate(big), { budget: 2_000_000 });
          expect(value).toBe(false);
          expect(steps).toBeLessThan(500_000);
        }),
        hid('does not use includes / indexOf / sort', ({ code, expect }) => {
          expect(/\.\s*(includes|indexOf|sort|lastIndexOf)\s*\(/.test(code)).toBe(false);
        }, 'structural'),
      ],
      hints: ['A `Set` remembers what you have seen in O(1) per operation.', 'Walk the array once: if the value is already in the set, return true; otherwise add it.'],
    }),

    lab({
      id: 'algo1-two-sum',
      title: 'Two Sum',
      kind: 'code',
      difficulty: 2,
      minutes: 12,
      tags: ['hashing', 'arrays'],
      interview: true,
      prompt: `Write \`twoSum(nums, target)\`: return **two different indices** \`[i, j]\` (with \`i < j\`) such that \`nums[i] + nums[j] === target\`, or \`null\` if there is no such pair. If several pairs exist, any valid one is accepted.

Brute force is O(n²). Aim for **O(n)** time.`,
      expose: ['twoSum'],
      files: jsFile(
        `function twoSum(nums, target) {
  
}
`,
        `function twoSum(nums, target) {
  const seen = new Map(); // value -> index
  for (let j = 0; j < nums.length; j++) {
    const need = target - nums[j];
    if (seen.has(need)) return [seen.get(need), j];
    seen.set(nums[j], j);
  }
  return null;
}
`
      ),
      tests: [
        ex('classic example', ({ env, expect }) => {
          const r = env.twoSum([2, 7, 11, 15], 9);
          expect(r).toEqual([0, 1]);
        }),
        ex('duplicates may form the pair', ({ env, expect }) => expect(env.twoSum([3, 3], 6)).toEqual([0, 1])),
        ex('the same element cannot be used twice', ({ env, expect }) => expect(env.twoSum([3, 2, 4], 6)).toEqual([1, 2])),
        ex('no pair → null', ({ env, expect }) => {
          expect(env.twoSum([1, 2, 3], 100)).toBe(null);
          expect(env.twoSum([5], 10)).toBe(null);
          expect(env.twoSum([], 0)).toBe(null);
        }),
        ex('negatives and zero', ({ env, expect }) => {
          const r = env.twoSum([-3, 4, 3, 90], 0);
          expect(r).toEqual([0, 2]);
        }),
        prop('property: result is a valid pair whenever one exists', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-10, 10), 0, 12), gen.int(-20, 20)], (xs: number[], t: number) => {
            let exists = false;
            for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) if (xs[i] + xs[j] === t) exists = true;
            const r = env.twoSum(xs, t);
            if (!exists) return expect(r).toBe(null);
            expect(Array.isArray(r) && r.length === 2).toBe(true);
            const [i, j] = r;
            expect(i < j && i >= 0 && j < xs.length).toBe(true);
            expect(xs[i] + xs[j]).toBe(t);
          });
        }),
        perf('linear time on 100,000 numbers (pair at the very end)', async ({ env, expect, measure }) => {
          const n = 100000;
          const nums = Array.from({ length: n }, (_, i) => i * 2);
          nums.push(1, 3);
          const { value, steps } = await measure(() => env.twoSum(nums, 4), { budget: 3_000_000 });
          expect(value && nums[value[0]] + nums[value[1]]).toBe(4);
          expect(steps).toBeLessThan(600_000);
        }),
      ],
      hints: ['For each `x`, the partner you need is `target - x`. Have you seen it already?', 'Keep a `Map` from value to its index as you scan once.', 'Check the map **before** inserting the current element, so an element is never paired with itself.'],
    }),
  ],
  references: [
    { title: 'Cracking the Coding Interview — Gayle Laakmann McDowell (problem-solving method)' },
    { title: 'MIT 6.006 Introduction to Algorithms (OpenCourseWare)', url: 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/' },
  ],
};
export default mod;
