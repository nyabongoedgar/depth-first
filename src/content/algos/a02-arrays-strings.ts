import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';

const mod: Module = {
  id: 'arrays-strings',
  course: 'algos',
  title: 'Arrays & Strings: Two Pointers, Sliding Window, Prefix Sums',
  minutes: 50,
  objectives: [
    'Recognise when two pointers, a sliding window or prefix sums turn O(n²) into O(n)',
    'Maintain a window invariant correctly (expand, shrink, record)',
    'Combine prefix sums with a hash map to count subarrays',
    'Avoid off-by-one errors with explicit loop invariants',
  ],
  body: `
## Pattern 1 — Two pointers

When a sorted array (or a structure you can walk from both ends) is involved, two indices that move **toward each other** (or in the same direction at different speeds) replace nested loops.

\`\`\`js run
// Is there a pair summing to target in a SORTED array?  O(n), O(1) space
function pairSum(a, target) {
  let lo = 0, hi = a.length - 1;
  while (lo < hi) {
    const s = a[lo] + a[hi];
    if (s === target) return [lo, hi];
    if (s < target) lo++;      // need a bigger sum → move the left pointer right
    else hi--;                 // need a smaller sum → move the right pointer left
  }
  return null;
}
console.log(pairSum([1, 3, 4, 6, 9, 11], 15));
\`\`\`

**Why it works:** each step provably discards at least one candidate — if \`a[lo] + a[hi]\` is too small, \`a[lo]\` can't pair with *any* index ≤ hi, so it's safe to drop it. Always be able to say why a pointer move is safe.

Other uses: reverse in place, palindromes, remove duplicates from a sorted array (slow/fast pointers), partitioning (Dutch national flag), merging sorted arrays, "container with most water".

## Pattern 2 — Sliding window

For **contiguous** subarrays/substrings, keep a window \`[left, right]\` and an **invariant** (e.g. "all characters distinct", "sum ≥ target"). Expand \`right\` each step; while the invariant breaks, shrink \`left\`. Every index enters and leaves the window at most once → O(n).

\`\`\`js run
// Longest substring without repeating characters
function longestUnique(s) {
  const last = new Map();         // char -> most recent index
  let left = 0, best = 0;
  for (let right = 0; right < s.length; right++) {
    const c = s[right];
    if (last.has(c) && last.get(c) >= left) left = last.get(c) + 1;   // jump past the duplicate
    last.set(c, right);
    best = Math.max(best, right - left + 1);
  }
  return best;
}
console.log(longestUnique("abcabcbb"), longestUnique("pwwkew"));
\`\`\`

Two shapes: **fixed-size** window (slide by one, update the sum incrementally) and **variable-size** window (grow/shrink with the invariant). Variants: smallest window with sum ≥ k, at most k distinct characters, minimum window substring, permutation in string.

## Pattern 3 — Prefix sums

Precompute \`prefix[i] = a[0] + … + a[i-1]\`. Then any range sum is \`prefix[r+1] - prefix[l]\` in **O(1)** after O(n) preprocessing.

\`\`\`js run
const a = [3, -1, 4, 1, 5, 9];
const prefix = [0];
for (const x of a) prefix.push(prefix[prefix.length - 1] + x);
const rangeSum = (l, r) => prefix[r + 1] - prefix[l];   // inclusive
console.log(prefix, rangeSum(1, 3));
\`\`\`

**Prefix sums + hash map** counts subarrays with a given sum in one pass: a subarray \`(i, j]\` sums to \`k\` when \`prefix[j] - prefix[i] = k\`, i.e. \`prefix[i] = prefix[j] - k\`. Keep a map of how many times each prefix value occurred so far.

The same idea works for 2-D grids (summed-area tables) and for XOR/product/frequency prefixes. **Difference arrays** are the inverse: add a value to a whole range in O(1).

## Kadane's algorithm (a DP in disguise)

Maximum sum of a contiguous subarray: at each position the best subarray *ending here* is either the element alone or the element added to the best subarray ending at the previous position.

\`\`\`js run
function maxSubarray(a) {
  let best = a[0], endingHere = a[0];
  for (let i = 1; i < a.length; i++) {
    endingHere = Math.max(a[i], endingHere + a[i]);
    best = Math.max(best, endingHere);
  }
  return best;
}
console.log(maxSubarray([-2, 1, -3, 4, -1, 2, 1, -5, 4]));
\`\`\`

:::warn
**Off-by-one checklist:** Is the range inclusive or exclusive? Does an empty window/array crash? What if all numbers are negative (don't initialise \`best = 0\` for "non-empty subarray")? What if \`left\` can pass \`right\`?
:::

:::tip
Strings in JS are **immutable**: \`s += c\` in a loop is O(n²) in the worst case and \`s.slice\` copies. Collect characters in an array and \`join("")\` at the end; work with indices instead of substrings.
:::
`,
  quiz: [
    { q: 'Why can two pointers solve "pair with target sum" in a sorted array in O(n)?', options: ['Sorting is free', 'Every pointer move discards candidates that cannot be part of an answer', 'It uses a hash set', 'It tries all pairs quickly'], answer: 1, why: 'If the sum is too small, the left element cannot pair with anything ≤ right, so we move it.' },
    { q: 'A variable-size sliding window runs in O(n) because…', options: ['The window is always size 1', 'Each element enters and leaves the window at most once', 'It uses recursion', 'It skips every other element'], answer: 1, why: '`right` only moves forward; `left` only moves forward — total moves ≤ 2n.' },
    { q: 'With prefix sums, the sum of a[l..r] (inclusive) is…', options: ['prefix[r] - prefix[l]', 'prefix[r + 1] - prefix[l]', 'prefix[l] - prefix[r]', 'prefix[r + 1] + prefix[l]'], answer: 1, why: 'prefix[i] sums the first i elements, so the range is prefix[r+1] − prefix[l].' },
    { q: 'In Kadane\'s algorithm, why not initialise `best = 0` for an all-negative array?', options: ['It would be slower', 'The answer would be 0 (an empty subarray) instead of the largest negative number', 'It overflows', 'It is fine to do so'], answer: 1, why: 'A non-empty subarray is required, so start from the first element.' },
  ],
  labs: [
    lab({
      id: 'algo2-two-sum-sorted',
      title: 'Two Sum in a sorted array',
      kind: 'code',
      difficulty: 2,
      minutes: 10,
      tags: ['two-pointers'],
      prompt: `\`twoSumSorted(nums, target)\` — \`nums\` is sorted ascending. Return \`[i, j]\` with \`i < j\` and \`nums[i] + nums[j] === target\`, or \`null\`. Use **two pointers**: O(n) time, **O(1) extra space** (no Map/Set).`,
      expose: ['twoSumSorted'],
      files: jsFile(`function twoSumSorted(nums, target) {\n  \n}\n`, `function twoSumSorted(nums, target) {
  let lo = 0;
  let hi = nums.length - 1;
  while (lo < hi) {
    const s = nums[lo] + nums[hi];
    if (s === target) return [lo, hi];
    if (s < target) lo++;
    else hi--;
  }
  return null;
}
`),
      tests: [
        ex('finds the pair', ({ env, expect }) => expect(env.twoSumSorted([1, 3, 4, 6, 9, 11], 15)).toEqual([2, 5])),
        ex('no pair → null', ({ env, expect }) => {
          expect(env.twoSumSorted([1, 2, 3], 10)).toBe(null);
          expect(env.twoSumSorted([], 1)).toBe(null);
          expect(env.twoSumSorted([4], 8)).toBe(null);
        }),
        ex('handles duplicates and negatives', ({ env, expect }) => {
          const a = [-5, -2, 0, 3, 3, 8];
          const r = env.twoSumSorted(a, 6);
          expect(r[0] < r[1] && a[r[0]] + a[r[1]] === 6).toBe(true);
          const b = [-4, -1, 1, 4];
          const r2 = env.twoSumSorted(b, 0);
          expect(r2[0] < r2[1] && b[r2[0]] + b[r2[1]] === 0).toBe(true);
        }),
        prop('property: valid pair iff one exists', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-12, 12), 0, 14), gen.int(-24, 24)], (xs: number[], t: number) => {
            const a = [...xs].sort((p, q) => p - q);
            let exists = false;
            for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i] + a[j] === t) exists = true;
            const r = env.twoSumSorted(a, t);
            if (!exists) return expect(r).toBe(null);
            expect(a[r[0]] + a[r[1]]).toBe(t);
            expect(r[0] < r[1]).toBe(true);
          });
        }),
        perf('linear on 200,000 elements', async ({ env, expect, measure }) => {
          const a = Array.from({ length: 200000 }, (_, i) => i);
          const { steps } = await measure(() => env.twoSumSorted(a, 399997), { budget: 3_000_000 });
          expect(steps).toBeLessThan(400_000);
        }),
        hid('uses O(1) extra space (no Map / Set / object lookups)', ({ code, expect }) => expect(/new\s+(Map|Set)\b|\{\s*\}\s*;?\s*$/m.test(code)).toBe(false), 'structural'),
      ],
      hints: ['Start with `lo = 0` and `hi = n - 1`.', 'If the sum is too small, only a bigger left value can help: move `lo` right.', 'If the sum is too big, move `hi` left. Stop when the pointers meet.'],
    }),

    lab({
      id: 'algo2-longest-unique',
      title: 'Longest substring without repeating characters',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['sliding-window', 'strings'],
      interview: true,
      prompt: `\`lengthOfLongestSubstring(s)\` — the length of the longest substring of \`s\` in which **all characters are distinct**. O(n) time using a sliding window.`,
      expose: ['lengthOfLongestSubstring'],
      files: jsFile(`function lengthOfLongestSubstring(s) {\n  \n}\n`, `function lengthOfLongestSubstring(s) {
  const last = new Map();
  let left = 0;
  let best = 0;
  for (let right = 0; right < s.length; right++) {
    const c = s[right];
    if (last.has(c) && last.get(c) >= left) left = last.get(c) + 1;
    last.set(c, right);
    best = Math.max(best, right - left + 1);
  }
  return best;
}
`),
      tests: [
        ex('examples', ({ env, expect }) => {
          expect(env.lengthOfLongestSubstring('abcabcbb')).toBe(3);
          expect(env.lengthOfLongestSubstring('bbbbb')).toBe(1);
          expect(env.lengthOfLongestSubstring('pwwkew')).toBe(3);
        }),
        ex('edge cases', ({ env, expect }) => {
          expect(env.lengthOfLongestSubstring('')).toBe(0);
          expect(env.lengthOfLongestSubstring('a')).toBe(1);
          expect(env.lengthOfLongestSubstring('abba')).toBe(2);
          expect(env.lengthOfLongestSubstring('tmmzuxt')).toBe(5);
        }),
        prop('property: matches brute force', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.string(14, 'abcde')], (s: string) => {
            let best = 0;
            for (let i = 0; i < s.length; i++) {
              const seen = new Set<string>();
              for (let j = i; j < s.length && !seen.has(s[j]); j++) { seen.add(s[j]); best = Math.max(best, j - i + 1); }
            }
            expect(env.lengthOfLongestSubstring(s)).toBe(best);
          }, { runs: 150 });
        }),
        perf('linear on 100,000 characters', async ({ env, expect, measure, rng }) => {
          const r = rng(5);
          const s = Array.from({ length: 100000 }, () => String.fromCharCode(97 + r.int(0, 25))).join('');
          const { steps } = await measure(() => env.lengthOfLongestSubstring(s), { budget: 4_000_000 });
          expect(steps).toBeLessThan(800_000);
        }),
      ],
      hints: ['Maintain a window `[left, right]` where all characters are distinct.', 'Store the most recent index of each character in a `Map`. When `s[right]` was seen at an index `>= left`, jump `left` to one past it.', 'Update the best length after each step: `right - left + 1`.'],
    }),

    lab({
      id: 'algo2-kadane',
      title: 'Maximum subarray (Kadane)',
      kind: 'code',
      difficulty: 2,
      minutes: 10,
      tags: ['dp', 'arrays'],
      interview: true,
      prompt: `\`maxSubarray(nums)\` — the largest sum of a **non-empty contiguous** subarray (nums has at least one element). O(n) time, O(1) space.`,
      expose: ['maxSubarray'],
      files: jsFile(`function maxSubarray(nums) {\n  \n}\n`, `function maxSubarray(nums) {
  let best = nums[0];
  let endingHere = nums[0];
  for (let i = 1; i < nums.length; i++) {
    endingHere = Math.max(nums[i], endingHere + nums[i]);
    best = Math.max(best, endingHere);
  }
  return best;
}
`),
      tests: [
        ex('classic', ({ env, expect }) => expect(env.maxSubarray([-2, 1, -3, 4, -1, 2, 1, -5, 4])).toBe(6)),
        ex('single element and all negative', ({ env, expect }) => {
          expect(env.maxSubarray([5])).toBe(5);
          expect(env.maxSubarray([-3, -1, -2])).toBe(-1);
        }),
        ex('all positive sums everything', ({ env, expect }) => expect(env.maxSubarray([1, 2, 3, 4])).toBe(10)),
        prop('property: matches brute force', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-9, 9), 1, 16)], (xs: number[]) => {
            let best = -Infinity;
            for (let i = 0; i < xs.length; i++) { let s = 0; for (let j = i; j < xs.length; j++) { s += xs[j]; best = Math.max(best, s); } }
            expect(env.maxSubarray(xs)).toBe(best);
          });
        }),
        perf('linear on 300,000 numbers', async ({ env, expect, measure, rng }) => {
          const r = rng(3);
          const a = Array.from({ length: 300000 }, () => r.int(-50, 50));
          const { steps } = await measure(() => env.maxSubarray(a), { budget: 4_000_000 });
          expect(steps).toBeLessThan(1_000_000);
        }),
      ],
      hints: ['Track the best sum of a subarray **ending at the current index**.', 'Either start fresh at `nums[i]` or extend the previous run: `max(nums[i], endingHere + nums[i])`.', 'Initialise from `nums[0]`, not 0 — the subarray must be non-empty.'],
    }),

    lab({
      id: 'algo2-numarray',
      title: 'Range sums with prefix sums',
      kind: 'code',
      difficulty: 2,
      minutes: 10,
      tags: ['prefix-sums', 'design'],
      prompt: `Implement \`class NumArray\`: \`new NumArray(nums)\` and \`sumRange(left, right)\` (inclusive) returning the sum of \`nums[left..right]\`. The constructor may take O(n); **each query must be O(1)** (no loop over the range). \`nums\` must not be modified.`,
      expose: ['NumArray'],
      files: jsFile(`class NumArray {
  constructor(nums) {
    
  }

  sumRange(left, right) {
    
  }
}
`, `class NumArray {
  constructor(nums) {
    this.prefix = [0];
    for (const x of nums) this.prefix.push(this.prefix[this.prefix.length - 1] + x);
  }

  sumRange(left, right) {
    return this.prefix[right + 1] - this.prefix[left];
  }
}
`),
      tests: [
        ex('range sums', ({ env, expect }) => {
          const a = new env.NumArray([-2, 0, 3, -5, 2, -1]);
          expect([a.sumRange(0, 2), a.sumRange(2, 5), a.sumRange(0, 5)]).toEqual([1, -1, -3]);
        }),
        ex('single-element ranges', ({ env, expect }) => {
          const a = new env.NumArray([4, 5, 6]);
          expect([a.sumRange(0, 0), a.sumRange(1, 1), a.sumRange(2, 2)]).toEqual([4, 5, 6]);
        }),
        ex('does not mutate the input', ({ env, expect }) => {
          const src = [1, 2, 3];
          new env.NumArray(src).sumRange(0, 2);
          expect(src).toEqual([1, 2, 3]);
        }),
        prop('property: equals the direct sum', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-9, 9), 1, 20), gen.nat(30), gen.nat(30)], (xs: number[], p: number, q: number) => {
            const l = Math.min(p, q) % xs.length;
            const r = Math.max(l, Math.max(p, q) % xs.length);
            let want = 0;
            for (let i = l; i <= r; i++) want += xs[i];
            expect(new env.NumArray(xs).sumRange(l, r)).toBe(want);
          });
        }),
        perf('each query is O(1): 50,000 queries over 100,000 numbers', async ({ env, expect, measure }) => {
          const a = new env.NumArray(Array.from({ length: 100000 }, (_, i) => i));
          const { steps } = await measure(() => { let s = 0; for (let k = 0; k < 50000; k++) s += a.sumRange(k, k + 40000); return s; }, { budget: 3_000_000 });
          expect(steps).toBeLessThan(150_000);
        }),
      ],
      hints: ['Store `prefix[i]` = sum of the first `i` numbers, with `prefix[0] = 0`.', 'The answer is `prefix[right + 1] - prefix[left]`.'],
    }),

    lab({
      id: 'algo2-subarray-sum-k',
      title: 'Subarray sum equals K',
      kind: 'code',
      difficulty: 4,
      minutes: 20,
      tags: ['prefix-sums', 'hashing'],
      interview: true,
      prompt: `\`subarraySum(nums, k)\` — count the **contiguous subarrays** whose sum equals \`k\`. \`nums\` may contain negatives (so a sliding window will **not** work). Aim for O(n) using prefix sums and a hash map of prefix-sum frequencies.`,
      expose: ['subarraySum'],
      files: jsFile(`function subarraySum(nums, k) {\n  \n}\n`, `function subarraySum(nums, k) {
  const seen = new Map([[0, 1]]); // prefix sum -> how many times it occurred
  let prefix = 0;
  let count = 0;
  for (const x of nums) {
    prefix += x;
    count += seen.get(prefix - k) ?? 0;
    seen.set(prefix, (seen.get(prefix) ?? 0) + 1);
  }
  return count;
}
`),
      tests: [
        ex('examples', ({ env, expect }) => {
          expect(env.subarraySum([1, 1, 1], 2)).toBe(2);
          expect(env.subarraySum([1, 2, 3], 3)).toBe(2);
        }),
        ex('negatives and zeros', ({ env, expect }) => {
          expect(env.subarraySum([1, -1, 0], 0)).toBe(3);
          expect(env.subarraySum([0, 0, 0], 0)).toBe(6);
          expect(env.subarraySum([-1, -1, 1], 0)).toBe(1);
        }),
        ex('empty and no match', ({ env, expect }) => {
          expect(env.subarraySum([], 0)).toBe(0);
          expect(env.subarraySum([1, 2, 3], 100)).toBe(0);
        }),
        prop('property: matches brute force', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-4, 4), 0, 16), gen.int(-6, 6)], (xs: number[], k: number) => {
            let c = 0;
            for (let i = 0; i < xs.length; i++) { let s = 0; for (let j = i; j < xs.length; j++) { s += xs[j]; if (s === k) c++; } }
            expect(env.subarraySum(xs, k)).toBe(c);
          }, { runs: 200 });
        }),
        perf('linear on 100,000 numbers', async ({ env, expect, measure, rng }) => {
          const r = rng(11);
          const a = Array.from({ length: 100000 }, () => r.int(-3, 3));
          const { steps } = await measure(() => env.subarraySum(a, 5), { budget: 3_000_000 });
          expect(steps).toBeLessThan(600_000);
        }),
      ],
      hints: ['A subarray `(i, j]` sums to `k` when `prefix[j] - prefix[i] = k`.', 'While scanning, keep a map `prefixValue → count`. At each prefix `p`, add `map.get(p - k)` to the answer.', 'Seed the map with `{0: 1}` so subarrays starting at index 0 are counted.'],
      why: 'This is the template for "count subarrays with property X" — remainders mod k, balanced 0/1 counts, XOR targets…',
    }),
  ],
  references: [{ title: 'LeetCode patterns: sliding window & two pointers (concept guide)' }],
};
export default mod;
