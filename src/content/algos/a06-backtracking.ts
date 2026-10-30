import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';

const canon = (rows: number[][]) => rows.map((r) => [...r].sort((a, b) => a - b)).map((r) => r.join(',')).sort();
const canonStr = (rows: string[]) => [...rows].sort();

const mod: Module = {
  id: 'backtracking',
  course: 'algos',
  title: 'Recursion & Backtracking',
  minutes: 50,
  objectives: [
    'Write recursive solutions by defining the state, the choices and the base case',
    'Apply the choose → explore → un-choose template to generate subsets, permutations and combinations',
    'Prune the search tree to turn impossible brute force into feasible search',
    'Estimate the size of the search tree (2ⁿ, n!, branching^depth)',
  ],
  body: `
## Thinking recursively

A recursive solution has three parts:

1. **Base case** — the smallest problem you can answer directly.
2. **Recursive step** — reduce the problem to a *smaller* version of itself.
3. **Combine** — use the smaller answers to build the real one.

If you can say "the answer for n is built from the answer for n−1 (or for the two halves)" and you can state the base case, you can write it. Check three things: *does every call get closer to the base case? what is the maximum depth (stack limit ≈ 10,000 frames in JS)? is work being repeated (then memoise → dynamic programming)?*

## Backtracking = depth-first search over choices

Many problems ask for **all** configurations (all subsets, all orderings, all valid boards). Build a solution **one decision at a time**; after exploring the consequences of a decision, **undo it** and try the next. Draw the *decision tree*: each node is a partial solution, each edge a choice.

\`\`\`
choose → explore → un-choose
\`\`\`

\`\`\`js run
// All subsets of an array: at each element, either skip it or take it
function subsets(nums) {
  const result = [];
  const path = [];
  function go(i) {
    if (i === nums.length) { result.push([...path]); return; }   // copy! path keeps changing
    go(i + 1);                 // choice 1: skip nums[i]
    path.push(nums[i]);        // choose
    go(i + 1);                 // explore
    path.pop();                // un-choose
  }
  go(0);
  return result;
}
console.log(subsets([1, 2, 3]).map((s) => "[" + s + "]").join(" "));
\`\`\`

:::warn
**Copy the path when you record it** (\`[...path]\`). Pushing \`path\` itself stores a reference that later \`pop()\`s will empty — the classic backtracking bug.
:::

## The tree size tells you the cost

| Problem | Tree | Leaves |
|---|---|---|
| Subsets of n | binary: take/skip | 2ⁿ |
| Permutations of n | n, n−1, n−2, … choices | n! |
| N-Queens | up to n choices per row, pruned | far fewer than nⁿ |
| Combination sum | depends on target | bounded by pruning |

Exponential algorithms are fine for n ≤ ~20–25 (subsets) or ~10 (permutations). Beyond that you need pruning, DP or a different idea.

## Pruning

Cut a branch **as soon as it cannot lead to a solution**:

- **Constraint check** while building (N-Queens: skip a column already attacked).
- **Bound** (combination sum: stop when the running total exceeds the target; sort candidates so you can \`break\`).
- **Duplicates:** sort the input and skip equal siblings (\`if (i > start && a[i] === a[i-1]) continue\`).
- **Order** to avoid permutations of the same set (combinations: only choose indices \`>= start\`).

\`\`\`js run
// N-Queens: place one queen per row; track attacked columns and diagonals
function nQueens(n) {
  const cols = new Set(), d1 = new Set(), d2 = new Set();
  let count = 0;
  (function place(r) {
    if (r === n) { count++; return; }
    for (let c = 0; c < n; c++) {
      if (cols.has(c) || d1.has(r - c) || d2.has(r + c)) continue;   // prune
      cols.add(c); d1.add(r - c); d2.add(r + c);                      // choose
      place(r + 1);                                                   // explore
      cols.delete(c); d1.delete(r - c); d2.delete(r + c);             // un-choose
    }
  })(0);
  return count;
}
console.log([4, 5, 6, 7, 8].map(nQueens));
\`\`\`

## Templates to memorise

- **Subsets / combinations**: \`for (let i = start; i < n; i++) { choose a[i]; go(i + 1); un-choose }\` — record at every node (subsets) or when size = k (combinations).
- **Permutations**: \`for each unused element: choose, go(), un-choose\` with a \`used[]\` array (or swap in place).
- **Grid search (word search)**: mark a cell visited, try 4 directions, unmark.

:::interview
Say the decision tree out loud: "At each index I either take it or skip it, so the tree has 2ⁿ leaves; the work per leaf is O(n) to copy, so O(n·2ⁿ)." Interviewers love hearing the size of the search space and what you prune.
:::
`,
  quiz: [
    { q: 'Why must you push `[...path]` rather than `path` into the result?', options: ['Spread is faster', 'path is mutated later; storing the reference would corrupt earlier results', 'Arrays are immutable', 'It avoids recursion'], answer: 1, why: 'All stored references would point at the same array, which ends up empty.' },
    { q: 'How many subsets does a set of 20 elements have?', options: ['40', '400', '1,048,576', '20!'], answer: 2, why: '2²⁰ = 1,048,576.' },
    { q: 'What does pruning do?', options: ['Memoises results', 'Abandons a partial solution as soon as it cannot lead to a valid answer', 'Sorts the input', 'Removes recursion'], answer: 1, why: 'It cuts whole subtrees of the decision tree.' },
    { q: 'How do combinations differ from permutations in the template?', options: ['They don\'t', 'Combinations only choose from indices >= start so order doesn\'t matter', 'Permutations use a heap', 'Combinations use a queue'], answer: 1, why: 'Choosing in increasing index order generates each set once.' },
  ],
  labs: [
    lab({
      id: 'algo6-subsets',
      title: 'Subsets',
      kind: 'code',
      difficulty: 2,
      minutes: 12,
      tags: ['backtracking'],
      interview: true,
      prompt: `\`subsets(nums)\` — \`nums\` has **distinct** integers. Return every subset (the power set), including the empty one, as an array of arrays. Any order of subsets, and any order within a subset, is accepted.`,
      expose: ['subsets'],
      files: jsFile(`function subsets(nums) {\n  \n}\n`, `function subsets(nums) {
  const result = [];
  const path = [];
  function go(i) {
    if (i === nums.length) {
      result.push([...path]);
      return;
    }
    go(i + 1);
    path.push(nums[i]);
    go(i + 1);
    path.pop();
  }
  go(0);
  return result;
}
`),
      tests: [
        ex('three elements', ({ env, expect }) => {
          expect(canon(env.subsets([1, 2, 3]))).toEqual(canon([[], [1], [2], [3], [1, 2], [1, 3], [2, 3], [1, 2, 3]]));
        }),
        ex('empty and single', ({ env, expect }) => {
          expect(env.subsets([])).toEqual([[]]);
          expect(canon(env.subsets([5]))).toEqual(canon([[], [5]]));
        }),
        prop('property: 2^n distinct subsets, each drawn from the input', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.sortedInts(8, -9, 9)], (xs: number[]) => {
            const r: number[][] = env.subsets(xs);
            expect(r.length).toBe(2 ** xs.length);
            expect(new Set(canon(r)).size).toBe(r.length);
            expect(r.every((s) => s.every((v) => xs.includes(v)))).toBe(true);
          });
        }),
        perf('n = 16 (65,536 subsets) within budget', async ({ env, expect, measure }) => {
          const { value, steps } = await measure(() => env.subsets(Array.from({ length: 16 }, (_, i) => i)), { budget: 6_000_000 });
          expect(value.length).toBe(65536);
          expect(steps).toBeLessThan(1_200_000);
        }),
      ],
      hints: ['At each index you have two choices: skip the element or take it.', 'Use a shared `path` array: `push`, recurse, `pop`.', 'Record `[...path]` (a copy!) when `i === nums.length`.'],
    }),

    lab({
      id: 'algo6-permutations',
      title: 'Permutations',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['backtracking'],
      interview: true,
      prompt: `\`permutations(nums)\` — \`nums\` has distinct integers. Return **all orderings**. Any order of results is accepted.`,
      expose: ['permutations'],
      files: jsFile(`function permutations(nums) {\n  \n}\n`, `function permutations(nums) {
  const result = [];
  const used = new Array(nums.length).fill(false);
  const path = [];
  function go() {
    if (path.length === nums.length) {
      result.push([...path]);
      return;
    }
    for (let i = 0; i < nums.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      path.push(nums[i]);
      go();
      path.pop();
      used[i] = false;
    }
  }
  go();
  return result;
}
`),
      tests: [
        ex('three elements', ({ env, expect }) => {
          expect(env.permutations([1, 2, 3]).map((p: number[]) => p.join('')).sort()).toEqual(['123', '132', '213', '231', '312', '321']);
        }),
        ex('edge cases', ({ env, expect }) => {
          expect(env.permutations([])).toEqual([[]]);
          expect(env.permutations([7])).toEqual([[7]]);
        }),
        prop('property: n! distinct permutations of the input', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.sortedInts(6, -9, 9)], (xs: number[]) => {
            const r: number[][] = env.permutations(xs);
            const fact = xs.reduce((f, _, i) => f * (i + 1), 1);
            expect(r.length).toBe(fact);
            expect(new Set(r.map((p) => p.join(','))).size).toBe(fact);
            expect(r.every((p) => [...p].sort((a, b) => a - b).join() === [...xs].sort((a, b) => a - b).join())).toBe(true);
          });
        }),
        perf('n = 8 (40,320 permutations)', async ({ env, expect, measure }) => {
          const { value, steps } = await measure(() => env.permutations([1, 2, 3, 4, 5, 6, 7, 8]), { budget: 12_000_000 });
          expect(value.length).toBe(40320);
          expect(steps).toBeLessThan(4_000_000);
        }),
      ],
      hints: ['Keep a `used` array of booleans and a `path`.', 'In the loop, skip used elements; mark one used, push it, recurse, then undo both.', 'When `path.length === nums.length` record a copy.'],
    }),

    lab({
      id: 'algo6-nqueens',
      title: 'N-Queens (count solutions)',
      kind: 'code',
      difficulty: 4,
      minutes: 20,
      tags: ['backtracking', 'pruning'],
      interview: true,
      prompt: `\`totalNQueens(n)\` — the number of ways to place \`n\` queens on an \`n×n\` board so no two attack each other (same row, column or diagonal). Known counts: n=1 → 1, 4 → 2, 6 → 4, 8 → 92. Place one queen per row, and **prune** as soon as a placement is attacked.`,
      expose: ['totalNQueens'],
      files: jsFile(`function totalNQueens(n) {\n  \n}\n`, `function totalNQueens(n) {
  const cols = new Set();
  const diag1 = new Set();
  const diag2 = new Set();
  let count = 0;
  function place(row) {
    if (row === n) {
      count++;
      return;
    }
    for (let c = 0; c < n; c++) {
      if (cols.has(c) || diag1.has(row - c) || diag2.has(row + c)) continue;
      cols.add(c); diag1.add(row - c); diag2.add(row + c);
      place(row + 1);
      cols.delete(c); diag1.delete(row - c); diag2.delete(row + c);
    }
  }
  place(0);
  return count;
}
`),
      tests: [
        ex('known values for n = 1..6', ({ env, expect }) => {
          expect([1, 2, 3, 4, 5, 6].map((n) => env.totalNQueens(n))).toEqual([1, 0, 0, 2, 10, 4]);
        }),
        ex('n = 8 has 92 solutions', ({ env, expect }) => expect(env.totalNQueens(8)).toBe(92)),
        perf('pruning keeps n = 9 (352 solutions) cheap', async ({ env, expect, measure }) => {
          const { value, steps } = await measure(() => env.totalNQueens(9), { budget: 12_000_000 });
          expect(value).toBe(352);
          expect(steps).toBeLessThan(1_500_000);
        }),
        hid('n = 10 (724 solutions)', ({ env, expect }) => expect(env.totalNQueens(10)).toBe(724)),
      ],
      hints: ['One queen per row, so recurse over rows and loop over columns.', 'A column `c` is attacked if some earlier queen has the same column, the same `row - c` (one diagonal) or the same `row + c` (the other).', 'Track those three with sets (or boolean arrays), add before recursing and remove after.'],
    }),

    lab({
      id: 'algo6-combination-sum',
      title: 'Combination sum',
      kind: 'code',
      difficulty: 3,
      minutes: 18,
      tags: ['backtracking', 'pruning'],
      interview: true,
      prompt: `\`combinationSum(candidates, target)\` — \`candidates\` are **distinct positive integers**; each may be used **any number of times**. Return all **unique combinations** (as arrays) that sum to \`target\`. \`[2,2,3]\` and \`[3,2,2]\` are the same combination. Any order of results is fine.`,
      expose: ['combinationSum'],
      files: jsFile(`function combinationSum(candidates, target) {\n  \n}\n`, `function combinationSum(candidates, target) {
  const nums = [...candidates].sort((a, b) => a - b);
  const result = [];
  const path = [];
  function go(start, remaining) {
    if (remaining === 0) {
      result.push([...path]);
      return;
    }
    for (let i = start; i < nums.length; i++) {
      if (nums[i] > remaining) break;
      path.push(nums[i]);
      go(i, remaining - nums[i]);
      path.pop();
    }
  }
  go(0, target);
  return result;
}
`),
      tests: [
        ex('classic', ({ env, expect }) => expect(canon(env.combinationSum([2, 3, 6, 7], 7))).toEqual(canon([[2, 2, 3], [7]]))),
        ex('another', ({ env, expect }) => expect(canon(env.combinationSum([2, 3, 5], 8))).toEqual(canon([[2, 2, 2, 2], [2, 3, 3], [3, 5]]))),
        ex('no solution / empty', ({ env, expect }) => {
          expect(env.combinationSum([2], 1)).toEqual([]);
          expect(env.combinationSum([], 5)).toEqual([]);
        }),
        ex('a candidate larger than the target is simply unused', ({ env, expect }) => expect(canon(env.combinationSum([5, 100], 10))).toEqual(canon([[5, 5]]))),
        prop('property: every result sums to target, uses only candidates, and results are unique', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.sortedInts(4, 1, 9), gen.int(1, 14)], (cs: number[], t: number) => {
            const r: number[][] = env.combinationSum(cs, t);
            expect(r.every((c) => c.reduce((a, b) => a + b, 0) === t && c.every((v) => cs.includes(v)))).toBe(true);
            expect(new Set(canon(r)).size).toBe(r.length);
          });
        }),
        hid('finds every combination (matches a DP count)', ({ env, expect }) => {
          const cs = [2, 3, 4, 7];
          const t = 14;
          const ways = new Array(t + 1).fill(0);
          ways[0] = 1;
          for (const c of cs) for (let s = c; s <= t; s++) ways[s] += ways[s - c];
          expect(env.combinationSum(cs, t).length).toBe(ways[t]);
        }),
      ],
      hints: ['Sort the candidates so you can stop a loop as soon as one exceeds the remaining target.', 'To avoid permutations of the same combination, pass a `start` index and only choose candidates from `start` onwards.', 'Reuse is allowed, so the recursive call passes `i`, not `i + 1`.'],
    }),

    lab({
      id: 'algo6-parens',
      title: 'Generate parentheses',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['backtracking', 'pruning'],
      interview: true,
      prompt: `\`generateParenthesis(n)\` — return every **well-formed** string made of \`n\` pairs of parentheses. Any order. Hint: build the string left to right, and only add \`(\` while fewer than \`n\` are open, and \`)\` only while it would not exceed the opens.`,
      expose: ['generateParenthesis'],
      files: jsFile(`function generateParenthesis(n) {\n  \n}\n`, `function generateParenthesis(n) {
  const out = [];
  function go(s, open, close) {
    if (s.length === 2 * n) {
      out.push(s);
      return;
    }
    if (open < n) go(s + '(', open + 1, close);
    if (close < open) go(s + ')', open, close + 1);
  }
  go('', 0, 0);
  return out;
}
`),
      tests: [
        ex('n = 3', ({ env, expect }) => expect(canonStr(env.generateParenthesis(3))).toEqual(canonStr(['((()))', '(()())', '(())()', '()(())', '()()()']))),
        ex('n = 1 and n = 0', ({ env, expect }) => {
          expect(env.generateParenthesis(1)).toEqual(['()']);
          expect(env.generateParenthesis(0)).toEqual(['']);
        }),
        ex('counts are the Catalan numbers', ({ env, expect }) => expect([1, 2, 3, 4, 5, 6].map((n) => env.generateParenthesis(n).length)).toEqual([1, 2, 5, 14, 42, 132])),
        prop('property: every string is balanced and unique', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 7)], (n: number) => {
            const r: string[] = env.generateParenthesis(n);
            expect(new Set(r).size).toBe(r.length);
            for (const s of r) {
              let d = 0;
              for (const c of s) { d += c === '(' ? 1 : -1; if (d < 0) throw new Error('not balanced: ' + s); }
              expect(d).toBe(0);
              expect(s.length).toBe(2 * n);
            }
          }, { runs: 20 });
        }),
        perf('does not explore invalid branches: n = 9 stays cheap', async ({ env, expect, measure }) => {
          const { value, steps } = await measure(() => env.generateParenthesis(9), { budget: 8_000_000 });
          expect(value.length).toBe(4862);
          expect(steps).toBeLessThan(150_000);
        }),
      ],
      hints: ['Track how many `(` and `)` you have used so far.', 'You may add `(` if `open < n`; you may add `)` if `close < open`.', 'Stop when the string has length `2n`.'],
    }),
  ],
  references: [{ title: 'Skiena — The Algorithm Design Manual, Ch. 7 Combinatorial Search' }],
};
export default mod;
