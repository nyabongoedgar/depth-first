import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';

const mod: Module = {
  id: 'dp-foundations',
  course: 'algos',
  title: 'Dynamic Programming I: State, Transition, Base Case',
  minutes: 65,
  objectives: [
    'Recognise problems with overlapping subproblems and optimal substructure',
    'Define a DP state, write the recurrence and base cases, and pick an evaluation order',
    'Convert between top-down memoisation and bottom-up tabulation',
    'Solve coin change, longest increasing subsequence, edit distance and 0/1 knapsack',
  ],
  body: `
## What dynamic programming is

**DP = recursion + remembering.** If a recursive solution solves the *same subproblem* many times, store each answer the first time and reuse it. Two properties signal DP:

1. **Overlapping subproblems** — the recursion revisits the same inputs (naive Fibonacci recomputes \`fib(30)\` thousands of times).
2. **Optimal substructure** — the best answer for the whole is built from best answers for the parts.

\`\`\`js run
let calls = 0;
const slow = (n) => { calls++; return n < 2 ? n : slow(n - 1) + slow(n - 2); };
slow(25);
const naiveCalls = calls;

calls = 0;
const memo = new Map();
const fast = (n) => { calls++; if (n < 2) return n; if (memo.has(n)) return memo.get(n); const v = fast(n - 1) + fast(n - 2); memo.set(n, v); return v; };
fast(25);
console.log("naive calls:", naiveCalls, " memoised calls:", calls);   // exponential → linear
\`\`\`

## The 5-step recipe

1. **State** — what do you need to know to continue? *"\`dp[i]\` = best answer using the first i items / ending at i / for amount i."* The most important step.
2. **Recurrence** — express \`dp[state]\` through smaller states ("either I take the item or I don't").
3. **Base cases** — the smallest states (\`dp[0]\`).
4. **Order** — compute smaller states first (increasing i), or recurse with memo.
5. **Answer** — which state is the result? (\`dp[n]\`, or \`max(dp[i])\`.)

**Top-down** (memoised recursion) is easiest to write — you transcribe the recurrence and add a cache. **Bottom-up** (tabulation) fills a table iteratively; it avoids recursion limits and often allows **space optimisation** (keep only the previous row).

Complexity = (number of states) × (work per state).

## Worked example 1: coin change (1-D)

*Fewest coins to make amount \`a\` (unlimited coins).* State: \`dp[x]\` = min coins for amount \`x\`. Transition: try each coin \`c\`: \`dp[x] = 1 + min(dp[x - c])\`. Base: \`dp[0] = 0\`; unreachable = ∞.

\`\`\`js run
function coinChange(coins, amount) {
  const dp = new Array(amount + 1).fill(Infinity);
  dp[0] = 0;
  for (let x = 1; x <= amount; x++)
    for (const c of coins) if (c <= x && dp[x - c] + 1 < dp[x]) dp[x] = dp[x - c] + 1;
  return dp[amount] === Infinity ? -1 : dp[amount];
}
console.log(coinChange([1, 5, 10, 25], 63), coinChange([2], 3));
\`\`\`

**Greedy fails here** ("take the largest coin") for coin systems like \`[1, 3, 4]\` and amount 6 (greedy: 4+1+1 = 3 coins; best: 3+3 = 2). If you can't prove greedy, suspect DP.

## Worked example 2: 2-D DP — edit distance

*Minimum insert/delete/replace operations to turn string \`a\` into \`b\`.* State: \`dp[i][j]\` = edit distance between the first \`i\` chars of \`a\` and first \`j\` of \`b\`. If the characters match, \`dp[i][j] = dp[i-1][j-1]\`; else \`1 + min(dp[i-1][j]\` (delete), \`dp[i][j-1]\` (insert), \`dp[i-1][j-1]\` (replace)\`)\`. Base: \`dp[i][0] = i\`, \`dp[0][j] = j\`. O(|a|·|b|) time; only the previous row is needed → O(min) space.

## Choosing the state — common shapes

| Shape | State | Examples |
|---|---|---|
| prefix | \`dp[i]\` over the first i elements | climbing stairs, house robber, coin change |
| two sequences | \`dp[i][j]\` | LCS, edit distance |
| ending at i | \`dp[i]\` = best that **ends** at i | LIS, Kadane |
| knapsack | \`dp[i][w]\` items × capacity | subset sum, partition, 0/1 knapsack |
| interval | \`dp[l][r]\` | matrix chain, burst balloons, palindromes |
| grid | \`dp[r][c]\` | unique paths, min path sum |
| bitmask | \`dp[mask][last]\` | travelling salesman (n ≤ 20) |

:::tip
**When stuck:** (1) write the brute-force recursion; (2) identify its parameters — that's your state; (3) add memoisation; (4) convert to a table if needed. Never try to guess the table first.
:::

:::warn
Typical bugs: wrong base case (empty prefix!), reading a state not yet computed (wrong loop order), 0/1 knapsack loop direction (iterate capacity **downwards** when compressing to 1-D so an item isn't reused), and returning \`Infinity\` instead of \`-1\`.
:::

## Longest increasing subsequence — O(n²) then O(n log n)

\`dp[i]\` = length of the LIS **ending at i** → \`1 + max(dp[j])\` over \`j < i\` with \`a[j] < a[i]\`: O(n²). The classic improvement keeps \`tails[k]\` = the smallest possible tail of an increasing subsequence of length \`k+1\`; for each new number **binary search** the first tail ≥ x and replace it (or append) — O(n log n). (\`tails\` is not itself an LIS, but its *length* is.)

:::interview
Name the **state**, the **transition**, the **base case**, the **order**, and the **complexity** (states × transition cost) — in that order. Then mention space optimisation. That structure alone separates strong DP answers from rambling ones.
:::
`,
  quiz: [
    { q: 'What makes a problem suitable for DP?', options: ['It has a loop', 'Overlapping subproblems and optimal substructure', 'It uses arrays', 'It is recursive'], answer: 1, why: 'Reusing answers to repeated subproblems is the entire point.' },
    { q: 'What is the time complexity of tabulated coin change with C coin types and amount A?', options: ['O(A)', 'O(C·A)', 'O(2^A)', 'O(C^A)'], answer: 1, why: 'A states, each trying C coins.' },
    { q: 'Why does greedy fail for coins [1, 3, 4] and amount 6?', options: ['It does not', 'Taking the largest coin first gives 4+1+1 (3 coins) but 3+3 uses only 2', 'Greedy is slow', 'It overflows'], answer: 1, why: 'Local best choice isn\'t globally optimal for arbitrary coin systems.' },
    { q: 'When compressing 0/1 knapsack to a 1-D array, in which direction must you loop over capacity?', options: ['Upwards', 'Downwards, so an item is not used twice', 'Either', 'Randomly'], answer: 1, why: 'Iterating down ensures dp[w - weight] still refers to the previous item\'s row.' },
  ],
  labs: [
    lab({
      id: 'algo12-coin-change',
      title: 'Coin change (fewest coins)',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['dp', '1d'],
      interview: true,
      prompt: `\`coinChange(coins, amount)\` — the **fewest coins** (unlimited supply of each denomination) that sum to \`amount\`, or \`-1\` if impossible. \`amount = 0\` needs 0 coins. Coins are positive integers. (Greedy is wrong — use DP.)`,
      expose: ['coinChange'],
      files: jsFile(`function coinChange(coins, amount) {\n  \n}\n`, `function coinChange(coins, amount) {
  const dp = new Array(amount + 1).fill(Infinity);
  dp[0] = 0;
  for (let x = 1; x <= amount; x++) {
    for (const c of coins) {
      if (c <= x && dp[x - c] + 1 < dp[x]) dp[x] = dp[x - c] + 1;
    }
  }
  return dp[amount] === Infinity ? -1 : dp[amount];
}
`),
      tests: [
        ex('examples', ({ env, expect }) => {
          expect(env.coinChange([1, 2, 5], 11)).toBe(3);
          expect(env.coinChange([2], 3)).toBe(-1);
          expect(env.coinChange([1], 0)).toBe(0);
        }),
        ex('greedy fails here: [1,3,4] and 6', ({ env, expect }) => expect(env.coinChange([1, 3, 4], 6)).toBe(2)),
        ex('edge cases', ({ env, expect }) => {
          expect(env.coinChange([], 5)).toBe(-1);
          expect(env.coinChange([], 0)).toBe(0);
          expect(env.coinChange([7], 49)).toBe(7);
        }),
        prop('property: matches brute-force recursion', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.sortedInts(4, 1, 9), gen.int(0, 25)], (coins: number[], amt: number) => {
            const memo = new Map<number, number>();
            const best = (a: number): number => { if (a === 0) return 0; if (memo.has(a)) return memo.get(a)!; let r = Infinity; for (const c of coins) if (c <= a) r = Math.min(r, 1 + best(a - c)); memo.set(a, r); return r; };
            const want = best(amt);
            expect(env.coinChange(coins, amt)).toBe(want === Infinity ? -1 : want);
          });
        }),
        perf('amount 10,000 with 8 denominations', async ({ env, expect, measure }) => {
          const { value, steps } = await measure(() => env.coinChange([1, 5, 10, 25, 50, 100, 137, 211], 10000), { budget: 8_000_000 });
          expect(value).toBeGreaterThan(0);
          expect(steps).toBeLessThan(10000 * 8 * 6);
        }),
      ],
      hints: ['`dp[x]` = fewest coins to make `x`. `dp[0] = 0`; start everything else at `Infinity`.', 'For each `x` from 1 to `amount`, try every coin `c <= x`: `dp[x] = min(dp[x], dp[x - c] + 1)`.', 'The answer is `dp[amount]`, or `-1` if it is still `Infinity`.'],
    }),

    lab({
      id: 'algo12-lis',
      title: 'Longest increasing subsequence',
      kind: 'code',
      difficulty: 4,
      minutes: 25,
      tags: ['dp', 'binary-search'],
      interview: true,
      prompt: `\`lengthOfLIS(nums)\` — the length of the longest **strictly increasing subsequence** (not necessarily contiguous). The O(n²) DP is fine to start with, but the hidden performance test uses 100,000 numbers: you need the **O(n log n)** "tails + binary search" method.`,
      expose: ['lengthOfLIS'],
      files: jsFile(`function lengthOfLIS(nums) {\n  \n}\n`, `function lengthOfLIS(nums) {
  const tails = [];
  for (const x of nums) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = x;
  }
  return tails.length;
}
`),
      tests: [
        ex('examples', ({ env, expect }) => {
          expect(env.lengthOfLIS([10, 9, 2, 5, 3, 7, 101, 18])).toBe(4);
          expect(env.lengthOfLIS([0, 1, 0, 3, 2, 3])).toBe(4);
          expect(env.lengthOfLIS([7, 7, 7, 7])).toBe(1);
        }),
        ex('edge cases', ({ env, expect }) => {
          expect(env.lengthOfLIS([])).toBe(0);
          expect(env.lengthOfLIS([5])).toBe(1);
          expect(env.lengthOfLIS([5, 4, 3, 2, 1])).toBe(1);
          expect(env.lengthOfLIS([1, 2, 3, 4, 5])).toBe(5);
        }),
        prop('property: matches the O(n²) DP', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-9, 9), 0, 25)], (a: number[]) => {
            const dp = a.map(() => 1);
            for (let i = 0; i < a.length; i++) for (let j = 0; j < i; j++) if (a[j] < a[i]) dp[i] = Math.max(dp[i], dp[j] + 1);
            expect(env.lengthOfLIS(a)).toBe(Math.max(0, ...dp));
          }, { runs: 300 });
        }),
        perf('100,000 numbers in O(n log n)', async ({ env, expect, measure, rng }) => {
          const r = rng(10);
          const a = Array.from({ length: 100000 }, () => r.int(0, 1_000_000));
          const { steps } = await measure(() => env.lengthOfLIS(a), { budget: 20_000_000 });
          expect(steps).toBeLessThan(100000 * 40);
        }),
      ],
      hints: ['Keep `tails`: `tails[k]` = smallest tail value of any increasing subsequence of length `k + 1`. It is always sorted.', 'For each `x` binary-search the first index with `tails[i] >= x`; set `tails[i] = x` (this extends the array when `i === tails.length`).', 'The answer is `tails.length`.'],
    }),

    lab({
      id: 'algo12-edit-distance',
      title: 'Edit distance',
      kind: 'code',
      difficulty: 4,
      minutes: 25,
      tags: ['dp', '2d', 'strings'],
      interview: true,
      prompt: `\`minDistance(a, b)\` — the minimum number of single-character **insertions, deletions or replacements** needed to turn \`a\` into \`b\` (the Levenshtein distance).

State \`dp[i][j]\` = distance between \`a[0..i)\` and \`b[0..j)\`. Required: O(|a|·|b|) time.`,
      expose: ['minDistance'],
      files: jsFile(`function minDistance(a, b) {\n  \n}\n`, `function minDistance(a, b) {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) cur[j] = prev[j - 1];
      else cur[j] = 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
}
`),
      tests: [
        ex('classic examples', ({ env, expect }) => {
          expect(env.minDistance('horse', 'ros')).toBe(3);
          expect(env.minDistance('intention', 'execution')).toBe(5);
          expect(env.minDistance('kitten', 'sitting')).toBe(3);
        }),
        ex('empty strings and equality', ({ env, expect }) => {
          expect(env.minDistance('', '')).toBe(0);
          expect(env.minDistance('abc', '')).toBe(3);
          expect(env.minDistance('', 'abc')).toBe(3);
          expect(env.minDistance('same', 'same')).toBe(0);
        }),
        prop('property: symmetric, bounded and matches memoised recursion', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.string(7, 'abc'), gen.string(7, 'abc')], (a: string, b: string) => {
            const memo = new Map<string, number>();
            const f = (i: number, j: number): number => {
              if (i === 0) return j; if (j === 0) return i;
              const k = i + ',' + j; if (memo.has(k)) return memo.get(k)!;
              const r = a[i - 1] === b[j - 1] ? f(i - 1, j - 1) : 1 + Math.min(f(i - 1, j), f(i, j - 1), f(i - 1, j - 1));
              memo.set(k, r); return r;
            };
            const d = env.minDistance(a, b);
            expect(d).toBe(f(a.length, b.length));
            expect(d).toBe(env.minDistance(b, a));
            expect(d).toBeLessThanOrEqual(Math.max(a.length, b.length));
          }, { runs: 200 });
        }),
        perf('two 1,000-character strings (10⁶ states)', async ({ env, expect, measure, rng }) => {
          const r = rng(17);
          const mk = () => Array.from({ length: 1000 }, () => String.fromCharCode(97 + r.int(0, 3))).join('');
          const { steps } = await measure(() => env.minDistance(mk(), mk()), { budget: 20_000_000 });
          expect(steps).toBeLessThan(1_400_000);
        }),
      ],
      hints: ['Base cases: `dp[i][0] = i` (delete everything) and `dp[0][j] = j` (insert everything).', 'If `a[i-1] === b[j-1]` the last characters match: `dp[i][j] = dp[i-1][j-1]`.', 'Otherwise `1 + min(delete: dp[i-1][j], insert: dp[i][j-1], replace: dp[i-1][j-1])`. You only need the previous row.'],
    }),

    lab({
      id: 'algo12-knapsack',
      title: '0/1 knapsack',
      kind: 'code',
      difficulty: 4,
      minutes: 25,
      tags: ['dp', 'knapsack'],
      interview: true,
      prompt: `\`knapsack(weights, values, capacity)\` — each item may be used **at most once**; the total weight must not exceed \`capacity\`. Return the **maximum total value**. Weights are positive integers. O(n · capacity) time; use O(capacity) memory by iterating the capacity loop **downwards**.`,
      expose: ['knapsack'],
      files: jsFile(`function knapsack(weights, values, capacity) {\n  \n}\n`, `function knapsack(weights, values, capacity) {
  const dp = new Array(capacity + 1).fill(0);
  for (let i = 0; i < weights.length; i++) {
    for (let w = capacity; w >= weights[i]; w--) {
      const take = dp[w - weights[i]] + values[i];
      if (take > dp[w]) dp[w] = take;
    }
  }
  return dp[capacity];
}
`),
      tests: [
        ex('classic example', ({ env, expect }) => expect(env.knapsack([1, 3, 4, 5], [1, 4, 5, 7], 7)).toBe(9)),
        ex('each item is used at most once', ({ env, expect }) => expect(env.knapsack([2], [10], 10)).toBe(10)),
        ex('edge cases', ({ env, expect }) => {
          expect(env.knapsack([], [], 10)).toBe(0);
          expect(env.knapsack([5], [9], 4)).toBe(0);
          expect(env.knapsack([1, 2], [3, 4], 0)).toBe(0);
        }),
        prop('property: matches brute force over all subsets', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(1, 9), 0, 8), gen.array(gen.int(0, 20), 0, 8), gen.int(0, 25)], (w: number[], v: number[], cap: number) => {
            const n = Math.min(w.length, v.length);
            let best = 0;
            for (let mask = 0; mask < 1 << n; mask++) { let tw = 0, tv = 0; for (let i = 0; i < n; i++) if (mask >> i & 1) { tw += w[i]; tv += v[i]; } if (tw <= cap) best = Math.max(best, tv); }
            expect(env.knapsack(w.slice(0, n), v.slice(0, n), cap)).toBe(best);
          }, { runs: 200 });
        }),
        perf('200 items × capacity 5,000', async ({ env, expect, measure, rng }) => {
          const r = rng(23);
          const w = Array.from({ length: 200 }, () => r.int(1, 100));
          const v = Array.from({ length: 200 }, () => r.int(1, 500));
          const { steps } = await measure(() => env.knapsack(w, v, 5000), { budget: 25_000_000 });
          expect(steps).toBeLessThan(200 * 5000 * 4);
        }),
      ],
      hints: ['`dp[w]` = best value using the items considered so far with total weight ≤ `w`.', 'For each item, update `dp[w] = max(dp[w], dp[w - weight] + value)`.', 'Loop `w` from `capacity` **down to** `weight`: going downwards guarantees `dp[w - weight]` still comes from before this item was added.'],
    }),
  ],
  references: [{ title: 'Erickson — Algorithms (free book), Ch. 3 Dynamic Programming' }, { title: 'MIT 6.006 — Dynamic Programming lectures' }],
};
export default mod;
