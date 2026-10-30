import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';
import { Rng } from '../../grader/rng';

const mod: Module = {
  id: 'probability',
  course: 'math',
  title: 'Probability: Counting, Bayes, Distributions & Monte Carlo',
  minutes: 100,
  objectives: [
    'Count outcomes with permutations and combinations',
    'Apply conditional probability and Bayes\' theorem (and avoid the base-rate fallacy)',
    'Compute expectation and variance, and use the binomial, geometric and normal distributions',
    'Estimate quantities by Monte Carlo simulation and shuffle without bias',
  ],
  body: `
## Why engineers need probability

Randomised algorithms (hashing, quicksort, skip lists, load balancing), **A/B testing**, spam filters, recommendation, reliability ("what is the chance 3 of 5 replicas fail?"), cryptography, anomaly detection, and all of machine learning (models output probabilities; training maximises likelihood) rest on probability.

## Sample spaces and events

An **experiment** has a **sample space** $\\Omega$ of outcomes; an **event** $A\\subseteq\\Omega$. The axioms: $0\\le P(A)\\le 1$, $P(\\Omega)=1$, and for disjoint events $P(A\\cup B)=P(A)+P(B)$. Consequences: $P(\\bar A) = 1-P(A)$; $P(A\\cup B)=P(A)+P(B)-P(A\\cap B)$. With equally likely outcomes, $P(A)=|A|/|\\Omega|$ — so probability often reduces to **counting**.

## Counting

- **Permutations** (order matters): $n!$ orderings of $n$ items; choosing and ordering $k$ of $n$: $\\dfrac{n!}{(n-k)!}$.
- **Combinations** (order doesn't): $\\dbinom{n}{k}=\\dfrac{n!}{k!(n-k)!}$. Symmetry $\\binom nk=\\binom n{n-k}$; Pascal $\\binom nk=\\binom{n-1}{k-1}+\\binom{n-1}{k}$.
- **Complement trick:** count the opposite. *Birthday problem:* $P(\\text{some shared birthday among } n)=1-\\dfrac{365\\cdot364\\cdots(365-n+1)}{365^{\\,n}}$ — only 23 people give $\\approx 50.7\\%$. It is why hash collisions arrive far earlier than $N$ items: **birthday bound ≈ $\\sqrt N$**.

## Conditional probability, independence, Bayes

$$P(A\\mid B)=\\frac{P(A\\cap B)}{P(B)}\\qquad A,B\\text{ independent}\\iff P(A\\cap B)=P(A)P(B)$$

**Law of total probability:** $P(B)=\\sum_i P(B\\mid A_i)P(A_i)$ over a partition $A_i$.

**Bayes' theorem** flips a conditional:
$$P(A\\mid B)=\\frac{P(B\\mid A)\\,P(A)}{P(B)}$$

**The base-rate fallacy.** A disease affects 1% of people. A test has 99% sensitivity and a 5% false-positive rate. You test positive — how worried should you be?
$$P(\\text{disease}\\mid +)=\\frac{0.99\\times0.01}{0.99\\times0.01+0.05\\times0.99}\\approx 16.7\\%$$
Intuition: out of 10,000 people, 100 are sick (99 test positive) and 9,900 are healthy (495 false positives). Only 99 of 594 positives are real. **Always weigh the prior.** Naive Bayes spam filters, Bayesian A/B tests and diagnostic systems all use this.

\`\`\`js run
const prior = 0.01, sens = 0.99, fpr = 0.05;
const pPositive = sens * prior + fpr * (1 - prior);
console.log("P(disease | +) =", ((sens * prior) / pPositive).toFixed(4));
\`\`\`

## Random variables, expectation, variance

A **random variable** $X$ maps outcomes to numbers. For a discrete $X$:
$$\\mathbb{E}[X]=\\sum_x x\\,P(X=x),\\qquad \\operatorname{Var}(X)=\\mathbb{E}[(X-\\mu)^2]=\\mathbb{E}[X^2]-\\mu^2,\\quad \\sigma=\\sqrt{\\operatorname{Var}X}$$
**Linearity of expectation** (the most useful fact): $\\mathbb{E}[X+Y]=\\mathbb{E}[X]+\\mathbb{E}[Y]$ **even if dependent**. Variances add only for independent variables: $\\operatorname{Var}(X+Y)=\\operatorname{Var}X+\\operatorname{Var}Y$.

*Example:* the expected number of fixed points of a random permutation is exactly 1 (for any $n$) — sum $n$ indicator variables each with probability $1/n$.

## Distributions you will meet

| Distribution | Models | Mean | Variance |
|---|---|---|---|
| **Bernoulli**($p$) | one yes/no trial | $p$ | $p(1-p)$ |
| **Binomial**($n,p$) | successes in $n$ independent trials: $P(k)=\\binom nk p^k(1-p)^{n-k}$ | $np$ | $np(1-p)$ |
| **Geometric**($p$) | trials until first success | $1/p$ | $(1-p)/p^2$ |
| **Poisson**($\\lambda$) | events per interval (arrivals, errors) | $\\lambda$ | $\\lambda$ |
| **Uniform** | equally likely | midpoint | $(b-a)^2/12$ |
| **Normal**($\\mu,\\sigma^2$) | sums of many small effects | $\\mu$ | $\\sigma^2$ |

**Central Limit Theorem:** the average of many independent samples is approximately **normal**, whatever the original distribution — why error bars, confidence intervals and the 68–95–99.7 rule work. **Law of large numbers:** sample averages converge to the true mean.

## Monte Carlo

When the maths is hard, **simulate**: draw many random samples and average. The error shrinks like $1/\\sqrt N$ — quadrupling the samples halves the error, in *any* dimension.

\`\`\`js run
// Estimate π: the fraction of random points in the unit square that land inside the quarter circle is π/4
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);   // a tiny LCG
let inside = 0;
const N = 200000;
for (let i = 0; i < N; i++) { const x = rand(), y = rand(); if (x * x + y * y <= 1) inside++; }
console.log((4 * inside) / N);
\`\`\`

### Shuffling: a classic bug

\`array.sort(() => Math.random() - 0.5)\` is **not** a uniform shuffle (comparison sorts assume a consistent comparator). The correct algorithm is the **Fisher–Yates shuffle**: for $i$ from $n-1$ down to 1, swap element $i$ with a uniformly random element at index $0\\ldots i$. It produces each of the $n!$ permutations with equal probability in $O(n)$.

:::warn
**Gambler's fallacy:** independent trials have no memory — after five heads a fair coin is still 50/50. **Prosecutor's fallacy:** confusing $P(\\text{evidence}\\mid\\text{innocent})$ with $P(\\text{innocent}\\mid\\text{evidence})$ — Bayes fixes it.
:::
`,
  quiz: [
    { q: 'A disease affects 1 in 1000 people. A test is 99% accurate (99% sensitivity, 1% false-positive rate). You test positive. What is the chance you are sick?', options: ['99%', 'about 9%', 'about 50%', '1%'], answer: 1, why: 'Per 100,000 people: 100 sick (99 positive) and 99,900 healthy (999 false positives). 99/(99+999) ≈ 9%.' },
    { q: 'Linearity of expectation E[X+Y] = E[X] + E[Y] holds…', options: ['Only for independent variables', 'Always, even if X and Y are dependent', 'Only for identical distributions', 'Never'], answer: 1, why: 'Dependence affects variance, not the mean of a sum.' },
    { q: 'You quadruple the number of Monte Carlo samples. The typical error becomes…', options: ['Four times smaller', 'Half as large', 'Unchanged', 'Four times larger'], answer: 1, why: 'Error scales like 1/√N.' },
    { q: 'Why is `arr.sort(() => Math.random() - 0.5)` a bad shuffle?', options: ['It is slow only', 'The comparator is inconsistent, so the resulting permutations are not uniformly distributed', 'It mutates the array', 'Math.random is predictable'], answer: 1, why: 'Use Fisher–Yates.' },
    { q: 'Roughly how many random 32-bit hashes before a collision becomes likely (≈50%)?', options: ['About 2³²', 'About 2¹⁶ (65,536)', 'About 100', 'About 2⁶⁴'], answer: 1, why: 'The birthday bound is ≈ √N for N possible values.' },
  ],
  labs: [
    lab({
      id: 'm3-prob-calcs',
      title: 'Counting and Bayes by hand',
      kind: 'answer',
      difficulty: 2,
      minutes: 15,
      tags: ['counting', 'bayes'],
      prompt: 'Compute each answer. Give probabilities as decimals (tolerance ±1%).',
      questions: [
        { id: 'a', prompt: 'How many different 3-person committees can be chosen from 10 people? ($\\binom{10}{3}$)', type: 'number', answer: 120 },
        { id: 'b', prompt: 'How many ways can 5 distinct books be arranged on a shelf?', type: 'number', answer: 120 },
        { id: 'c', prompt: 'You draw 2 cards from a 52-card deck without replacement. What is the probability that **both are aces**?', type: 'number', answer: 0.004525, tolerance: 0.01, explain: '(4/52)(3/51) = 12/2652.' },
        { id: 'd', prompt: 'You roll two fair dice. What is the probability that the **sum is 7**?', type: 'number', answer: 0.16667, tolerance: 0.01 },
        { id: 'e', prompt: 'A bag holds 3 red and 2 blue balls. You draw 2 without replacement. What is the probability that **at least one is red**?', type: 'number', answer: 0.9, tolerance: 0.01, explain: '1 − P(both blue) = 1 − (2/5)(1/4) = 0.9.' },
        { id: 'f', prompt: '1% of emails are spam. A filter flags 95% of spam and also 2% of genuine mail. An email is flagged. **What is the probability it is really spam?**', type: 'number', answer: 0.3242, tolerance: 0.01, explain: '0.95·0.01 / (0.95·0.01 + 0.02·0.99) = 0.0095 / 0.0293.' },
        { id: 'g', prompt: 'The expected value of one roll of a fair six-sided die.', type: 'number', answer: 3.5 },
        { id: 'h', prompt: 'The **variance** of one roll of a fair six-sided die (35/12 as a decimal).', type: 'number', answer: 2.9167, tolerance: 0.005 },
      ],
      hints: ['Combinations: n! / (k!(n−k)!).', 'Without replacement multiply successive conditional probabilities.', 'Bayes: P(spam | flag) = P(flag | spam)·P(spam) / P(flag), with P(flag) from the law of total probability.'],
    }),

    lab({
      id: 'm3-binomial',
      title: 'Combinations, binomial and the birthday problem',
      kind: 'code',
      difficulty: 3,
      minutes: 25,
      tags: ['counting', 'distributions'],
      interview: true,
      prompt: `Implement:

- \`nCr(n, k)\` — the binomial coefficient, **exact** for results below 2⁵³ (use the multiplicative formula with the smaller of \`k\` and \`n−k\`; don't compute full factorials). \`0\` if \`k < 0\` or \`k > n\`.
- \`binomialPmf(n, k, p)\` — \`P(X = k)\` for \`X ~ Binomial(n, p)\`. It must work for **large n** (e.g. \`n = 1000\`): compute in **log space** (sum of logs) so nothing overflows or underflows.
- \`birthdayProbability(n, days = 365)\` — probability that at least two of \`n\` people share a birthday. \`n = 0, 1\` → \`0\`; \`n > days\` → \`1\`.`,
      expose: ['nCr', 'binomialPmf', 'birthdayProbability'],
      files: jsFile(`function nCr(n, k) {\n  \n}\n\nfunction binomialPmf(n, k, p) {\n  \n}\n\nfunction birthdayProbability(n, days = 365) {\n  \n}\n`, `function nCr(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = (result * (n - k + i)) / i;
  }
  return Math.round(result);
}

function logChoose(n, k) {
  k = Math.min(k, n - k);
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}

function binomialPmf(n, k, p) {
  if (k < 0 || k > n) return 0;
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

function birthdayProbability(n, days = 365) {
  if (n <= 1) return 0;
  if (n > days) return 1;
  let noMatch = 1;
  for (let i = 0; i < n; i++) noMatch *= (days - i) / days;
  return 1 - noMatch;
}
`),
      tests: [
        ex('nCr small values and symmetry', ({ env, expect }) => {
          expect([env.nCr(5, 2), env.nCr(10, 3), env.nCr(6, 0), env.nCr(6, 6), env.nCr(0, 0)]).toEqual([10, 120, 1, 1, 1]);
          expect(env.nCr(30, 12)).toBe(env.nCr(30, 18));
          expect([env.nCr(5, -1), env.nCr(5, 6)]).toEqual([0, 0]);
        }),
        ex('nCr is exact for large results (C(52,5) = 2,598,960; C(60,30))', ({ env, expect }) => {
          expect(env.nCr(52, 5)).toBe(2598960);
          expect(env.nCr(60, 30)).toBe(118264581564861424);
        }),
        ex('Pascal\'s rule holds', ({ env, expect }) => {
          for (let n = 2; n < 25; n++) for (let k = 1; k < n; k++) expect(env.nCr(n, k)).toBe(env.nCr(n - 1, k - 1) + env.nCr(n - 1, k));
        }),
        ex('binomialPmf: fair coin', ({ env, expect }) => {
          expect(env.binomialPmf(10, 5, 0.5)).toBeNear(252 / 1024, { abs: 1e-12 });
          expect(env.binomialPmf(3, 0, 0.5)).toBeNear(0.125, { abs: 1e-12 });
        }),
        ex('binomialPmf works for n = 1000 without overflow', ({ env, expect }) => {
          expect(env.binomialPmf(1000, 500, 0.5)).toBeNear(0.0252250181783608, { rel: 1e-9 });
          expect(env.binomialPmf(1000, 0, 0.5)).toBeNear(Math.pow(0.5, 1000), { rel: 1e-9 });
        }),
        ex('binomialPmf edge cases and normalisation', ({ env, expect }) => {
          expect([env.binomialPmf(5, 0, 0), env.binomialPmf(5, 5, 1), env.binomialPmf(5, 2, 0), env.binomialPmf(5, 9, 0.5)]).toEqual([1, 1, 0, 0]);
          let sum = 0;
          for (let k = 0; k <= 40; k++) sum += env.binomialPmf(40, k, 0.3);
          expect(sum).toBeNear(1, { abs: 1e-10 });
        }),
        ex('birthday problem', ({ env, expect }) => {
          expect(env.birthdayProbability(23)).toBeNear(0.5072972, { abs: 1e-6 });
          expect(env.birthdayProbability(70)).toBeGreaterThan(0.999);
          expect([env.birthdayProbability(0), env.birthdayProbability(1), env.birthdayProbability(366)]).toEqual([0, 0, 1]);
          expect(env.birthdayProbability(2, 2)).toBeNear(0.5);
        }),
        prop('property: the binomial mean is np', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 60), gen.int(1, 9)], (n: number, p10: number) => {
            const p = p10 / 10;
            let mean = 0;
            for (let k = 0; k <= n; k++) mean += k * env.binomialPmf(n, k, p);
            expect(mean).toBeNear(n * p, { abs: 1e-8, rel: 1e-8 });
          });
        }),
      ],
      hints: ['`nCr`: `result = result * (n - k + i) / i` for `i = 1..k` stays an integer at every step (after multiplying, it is divisible by `i`).', '`binomialPmf`: `log C(n,k) + k·log p + (n−k)·log(1−p)`, then `Math.exp`. Compute `log C(n, k)` as `Σ (log(n−k+i) − log i)`.', 'Birthday: multiply `(days − i) / days` for `i = 0 … n−1` to get the no-match probability, then subtract from 1.'],
    }),

    lab({
      id: 'm3-bayes',
      title: 'Expectation, variance and Bayes',
      kind: 'code',
      difficulty: 2,
      minutes: 15,
      tags: ['bayes', 'expectation'],
      prompt: `A discrete distribution is an object mapping a numeric value (as a string key) to its probability, e.g. \`{ "1": 0.5, "2": 0.5 }\`.

- \`expectation(dist)\`, \`variance(dist)\` (population variance \`E[X²] − E[X]²\`).
- \`bayes(prior, likelihood, falsePositiveRate)\` → \`P(H | evidence)\` where \`likelihood = P(evidence | H)\` and \`falsePositiveRate = P(evidence | not H)\`.
- \`normalize(weights)\` — scale an array of non-negative numbers so they sum to 1 (a **posterior** from unnormalised scores). If all weights are 0 return an array of equal values \`1/n\`.`,
      expose: ['expectation', 'variance', 'bayes', 'normalize'],
      files: jsFile(`function expectation(dist) {\n  \n}\n\nfunction variance(dist) {\n  \n}\n\nfunction bayes(prior, likelihood, falsePositiveRate) {\n  \n}\n\nfunction normalize(weights) {\n  \n}\n`, `function expectation(dist) {
  let e = 0;
  for (const k of Object.keys(dist)) e += Number(k) * dist[k];
  return e;
}

function variance(dist) {
  let e2 = 0;
  for (const k of Object.keys(dist)) e2 += Number(k) ** 2 * dist[k];
  return e2 - expectation(dist) ** 2;
}

function bayes(prior, likelihood, falsePositiveRate) {
  const evidence = likelihood * prior + falsePositiveRate * (1 - prior);
  return (likelihood * prior) / evidence;
}

function normalize(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return weights.map(() => 1 / weights.length);
  return weights.map((w) => w / total);
}
`),
      tests: [
        ex('a fair die', ({ env, expect }) => {
          const die = Object.fromEntries([1, 2, 3, 4, 5, 6].map((v) => [String(v), 1 / 6]));
          expect(env.expectation(die)).toBeNear(3.5, { abs: 1e-12 });
          expect(env.variance(die)).toBeNear(35 / 12, { abs: 1e-12 });
        }),
        ex('a biased coin paying +10 / −5', ({ env, expect }) => {
          const d = { '10': 0.3, '-5': 0.7 };
          expect(env.expectation(d)).toBeNear(-0.5, { abs: 1e-12 });
          expect(env.variance(d)).toBeNear(0.3 * 100 + 0.7 * 25 - 0.25, { abs: 1e-12 });
        }),
        ex('Bayes: the base-rate fallacy', ({ env, expect }) => {
          expect(env.bayes(0.01, 0.99, 0.05)).toBeNear(1 / 6, { abs: 1e-4 });
          expect(env.bayes(0.5, 0.9, 0.1)).toBeNear(0.9, { abs: 1e-12 });
          expect(env.bayes(0.01, 0.95, 0.02)).toBeNear(0.3242, { abs: 1e-4 });
        }),
        ex('normalize', ({ env, expect }) => {
          expect(env.normalize([1, 1, 2])).toEqual([0.25, 0.25, 0.5]);
          expect(env.normalize([0, 0])).toEqual([0.5, 0.5]);
          expect(env.normalize([5])).toEqual([1]);
        }),
        prop('property: normalised weights sum to 1; a 100%-certain test with no false positives gives posterior 1', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(0, 9), 1, 8)], (w: number[]) => {
            const n = env.normalize(w);
            expect(n.reduce((a: number, b: number) => a + b, 0)).toBeNear(1, { abs: 1e-12 });
          });
          await forAll([gen.int(1, 99)], (p: number) => expect(env.bayes(p / 100, 1, 0)).toBeNear(1, { abs: 1e-12 }));
        }),
      ],
      hints: ['`E[X] = Σ x·P(x)`; `Var = E[X²] − E[X]²`. Keys are strings: convert with `Number(k)`.', 'Total probability of the evidence: `P(E) = P(E|H)·P(H) + P(E|¬H)·(1 − P(H))`.', 'Posterior = `P(E|H)·P(H) / P(E)`.'],
    }),

    lab({
      id: 'm3-monte-carlo',
      title: 'Monte Carlo and the Fisher–Yates shuffle',
      kind: 'code',
      difficulty: 3,
      minutes: 25,
      tags: ['monte-carlo', 'random'],
      interview: true,
      prompt: `Randomness is **injected**: \`rand()\` returns a uniform float in \`[0, 1)\`.

- \`estimatePi(rand, n)\` — Monte Carlo estimate of π from \`n\` random points in the unit square.
- \`shuffle(array, rand)\` — return a **new** array with the elements in uniformly random order using **Fisher–Yates** (every permutation equally likely; don't mutate the input, don't use \`sort\`).
- \`sampleK(array, k, rand)\` — \`k\` distinct elements chosen uniformly at random (a partial Fisher–Yates; \`k > length\` returns a shuffled copy of everything).
- \`randomInt(lo, hi, rand)\` — a uniform integer in \`[lo, hi]\` inclusive.`,
      expose: ['estimatePi', 'shuffle', 'sampleK', 'randomInt'],
      files: jsFile(`function estimatePi(rand, n) {\n  \n}\n\nfunction shuffle(array, rand) {\n  \n}\n\nfunction sampleK(array, k, rand) {\n  \n}\n\nfunction randomInt(lo, hi, rand) {\n  \n}\n`, `function estimatePi(rand, n) {
  let inside = 0;
  for (let i = 0; i < n; i++) {
    const x = rand();
    const y = rand();
    if (x * x + y * y <= 1) inside++;
  }
  return (4 * inside) / n;
}

function shuffle(array, rand) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sampleK(array, k, rand) {
  const a = [...array];
  const m = Math.min(k, a.length);
  for (let i = 0; i < m; i++) {
    const j = i + Math.floor(rand() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, m);
}

function randomInt(lo, hi, rand) {
  return lo + Math.floor(rand() * (hi - lo + 1));
}
`),
      tests: [
        ex('estimatePi is within 0.02 of π for 200,000 samples', ({ env, expect, rng }) => {
          const r = rng(2024);
          expect(env.estimatePi(() => r.float(), 200000)).toBeNear(Math.PI, { abs: 0.02 });
        }),
        ex('shuffle returns a permutation and leaves the input alone', ({ env, expect, rng }) => {
          const r = rng(1);
          const input = [1, 2, 3, 4, 5, 6, 7];
          const out = env.shuffle(input, () => r.float());
          expect(input).toEqual([1, 2, 3, 4, 5, 6, 7]);
          expect([...out].sort()).toEqual(input);
        }),
        ex('shuffle is uniform: all 6 permutations of 3 items appear about equally often', ({ env, expect, rng }) => {
          const r = rng(77);
          const counts = new Map<string, number>();
          const N = 60000;
          for (let i = 0; i < N; i++) { const k = env.shuffle([1, 2, 3], () => r.float()).join(''); counts.set(k, (counts.get(k) ?? 0) + 1); }
          expect(counts.size).toBe(6);
          for (const c of counts.values()) expect(Math.abs(c - N / 6)).toBeLessThan(N / 6 * 0.05);
        }),
        ex('sampleK picks k distinct elements, uniformly', ({ env, expect, rng }) => {
          const r = rng(5);
          const hits: Record<number, number> = {};
          for (let t = 0; t < 20000; t++) {
            const s = env.sampleK([0, 1, 2, 3, 4], 2, () => r.float());
            expect(new Set(s).size).toBe(2);
            for (const v of s) hits[v] = (hits[v] ?? 0) + 1;
          }
          for (let v = 0; v < 5; v++) expect(Math.abs(hits[v] - 8000)).toBeLessThan(400);
          expect(env.sampleK([1, 2], 5, () => r.float()).length).toBe(2);
        }),
        ex('randomInt covers the whole inclusive range, and nothing else', ({ env, expect, rng }) => {
          const r = rng(3);
          const seen = new Set<number>();
          for (let i = 0; i < 2000; i++) seen.add(env.randomInt(3, 7, () => r.float()));
          expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
          expect(env.randomInt(5, 5, () => 0.999999)).toBe(5);
        }),
        hid('does not use Array.prototype.sort to shuffle', ({ code, expect }) => expect(/shuffle[\s\S]{0,200}\.sort\s*\(/.test(code)).toBe(false), 'structural'),
      ],
      hints: ['`estimatePi`: draw `x`, `y`; count `x² + y² ≤ 1`; the answer is `4 · inside / n`.', 'Fisher–Yates: for `i` from `length − 1` down to `1`: `j = Math.floor(rand() * (i + 1))`; swap `a[i]` and `a[j]`.', '`randomInt`: `lo + Math.floor(rand() * (hi - lo + 1))`.', '`sampleK`: do only the first `k` steps of Fisher–Yates (choosing from the not-yet-fixed tail), then `slice(0, k)`.'],
    }),
  ],
  references: [
    { title: 'Introduction to Probability — Blitzstein & Hwang (Harvard Stat 110, free)', url: 'https://projects.iq.harvard.edu/stat110' },
    { title: 'A Programmer\'s Introduction to Probability (CS109, Stanford)' },
  ],
};
export default mod;
