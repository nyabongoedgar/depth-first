import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';
import { Rng } from '../../grader/rng';

const mod: Module = {
  id: 'ml-foundations',
  course: 'ai-ml',
  title: 'ML Foundations: Data, Splits, Leakage & Metrics',
  minutes: 80,
  objectives: [
    'Frame a problem as supervised learning and choose a baseline',
    'Split data correctly (train / validation / test, k-fold) and avoid leakage',
    'Compute and interpret precision, recall, F1, accuracy and ROC-AUC',
    'Explain over- and under-fitting through the bias–variance trade-off',
  ],
  body: `
## What machine learning is

Traditional programming: **rules + data → answers**. Machine learning: **data + answers → rules** (a *model*). In **supervised learning** you have examples $(x_i, y_i)$ — features and a known label — and learn a function $f$ so that $f(x)\\approx y$ on **new, unseen** data. That last clause is everything: a model that only memorises its training set is useless.

- **Regression** predicts a number (price, ETA); **classification** predicts a category (spam / not spam; pedestrian / cyclist).
- **Unsupervised** learning finds structure without labels (clustering, embeddings, anomaly detection). **Reinforcement learning** learns from rewards for actions.
- A model has **parameters** (learned: weights) and **hyper-parameters** (chosen by you: learning rate, tree depth). **Loss function** $L$ measures error; training minimises it.

## Always start with a baseline

Before any neural network: what does the **simplest possible predictor** score? Predict the mean (regression), the majority class (classification), yesterday's value (time series), or a hand-written rule. Beating a *strong simple baseline* by a meaningful margin is how you justify complexity — many "ML" projects die here.

## Splitting data (and the sin of leakage)

You estimate real-world performance on data the model **never touched during training or tuning**:

| Set | Used for |
|---|---|
| **Train** | fitting the parameters |
| **Validation** | choosing hyper-parameters / model / early stopping |
| **Test** | one final, honest estimate — look at it **once** |

**Cross-validation (k-fold):** split the data into $k$ folds; train on $k-1$, validate on the remaining one, rotate; average the scores. Uses data efficiently when there isn't much.

**Data leakage** — information from outside the training set sneaking into it — produces fantastic offline numbers and a disaster in production. The classic forms:

1. **Preprocessing on all the data:** computing the mean/std (or a vocabulary, or PCA) on train **and** test together. *Fit transformers on the training set only*, then apply them to validation/test.
2. **Target leakage:** a feature that is only known *after* the outcome (e.g. "discharge code" when predicting hospital readmission).
3. **Duplicates / near-duplicates** across the split (the same user, patient, image, or the same document paraphrased).
4. **Time travel:** randomly splitting time-series data. Split **by time** — train on the past, test on the future.
5. **Group leakage:** several rows per customer/driver; keep each group entirely on one side.

\`\`\`js run
// Standardisation leak: using the TEST data's statistics
const train = [10, 12, 11, 13], test = [100, 101];
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const mTrain = mean(train), mAll = mean([...train, ...test]);
console.log("correct: use the train mean", mTrain, "— leaky: uses", mAll.toFixed(1), "(it has already seen the test set)");
\`\`\`

## Metrics for classification

With a **confusion matrix** (TP, FP, FN, TN) for a positive class:

$$\\text{accuracy}=\\frac{TP+TN}{\\text{all}},\\quad \\text{precision}=\\frac{TP}{TP+FP},\\quad \\text{recall}=\\frac{TP}{TP+FN},\\quad F_1=\\frac{2PR}{P+R}$$

- **Precision**: of the things I flagged, how many were right? (Cost of false alarms.)
- **Recall** (sensitivity): of the real positives, how many did I catch? (Cost of misses.)
- **F1** is their harmonic mean — punishes imbalance between the two.
- **Accuracy is misleading on imbalanced data:** with 1% fraud, "never fraud" is 99% accurate and worthless. Report precision/recall (or PR-AUC).

**Thresholds.** Most models output a **score** or probability; you pick a threshold. Lowering it raises recall and lowers precision. The **ROC curve** plots true-positive rate against false-positive rate for all thresholds; **ROC-AUC** is the probability that a random positive gets a higher score than a random negative (0.5 = coin flip, 1 = perfect ranking). It is threshold-free and equals the Mann–Whitney $U$ statistic.

For **regression**: MAE (robust, in the units of $y$), MSE/RMSE (punishes big errors), $R^2$ (fraction of variance explained; 0 = predicting the mean).

## Over- and under-fitting; bias and variance

- **Underfitting (high bias):** the model is too simple (a line through a curve) — bad on train *and* test.
- **Overfitting (high variance):** it memorises noise — great on train, bad on test.

Expected test error $=\\text{bias}^2+\\text{variance}+\\text{irreducible noise}$. Cures: more data, simpler models, **regularisation** (penalise large weights), early stopping, dropout, ensembling, better features. The **learning curve** (error vs. training-set size) tells you whether more data would help.

:::interview
"Your model has 99% accuracy. Is that good?" — Ask about class balance, the baseline, the cost of each error type, how the test set was built (leakage? time split?), and the confidence interval. Offer precision/recall and a calibration check.
:::

:::warn
Peeking at the test set while tuning silently turns it into a validation set. Keep it locked away; if you must iterate, make a fresh one.
:::
`,
  quiz: [
    { q: 'A fraud dataset is 0.5% positive. A model that always predicts "not fraud" has…', options: ['0.5% accuracy', '99.5% accuracy and 0 recall', '50% accuracy', '100% precision'], answer: 1, why: 'Accuracy hides the failure; recall for the positive class is 0.' },
    { q: 'You compute feature means over the whole dataset and then split into train/test. This is…', options: ['Fine', 'Data leakage — test information influenced the training data', 'Faster', 'Required'], answer: 1, why: 'Fit preprocessing on the training set only.' },
    { q: 'ROC-AUC = 0.5 means…', options: ['Perfect ranking', 'The scores rank positives above negatives no better than chance', 'The model is 50% accurate', 'Precision equals recall'], answer: 1, why: 'AUC is the probability a random positive outscores a random negative.' },
    { q: 'Training error is tiny, validation error is large. This suggests…', options: ['Underfitting', 'Overfitting (high variance)', 'A perfect model', 'Leakage is impossible'], answer: 1, why: 'The model memorised the training data.' },
    { q: 'For time-series forecasting you should split…', options: ['Randomly', 'By time: train on the past, test on the future', 'Alphabetically', 'By feature'], answer: 1, why: 'Random splits leak the future into training.' },
  ],
  labs: [
    lab({
      id: 'ai1-metric-calcs',
      title: 'Read the confusion matrix',
      kind: 'answer',
      difficulty: 1,
      minutes: 10,
      tags: ['metrics'],
      prompt: 'A spam filter is evaluated on 200 emails: **TP = 40**, **FP = 10**, **FN = 20**, **TN = 130** (spam is the positive class). Answer to 4 decimal places.',
      questions: [
        { id: 'acc', prompt: 'Accuracy', type: 'number', answer: 0.85, tolerance: 0.001 },
        { id: 'prec', prompt: 'Precision', type: 'number', answer: 0.8, tolerance: 0.001 },
        { id: 'rec', prompt: 'Recall', type: 'number', answer: 0.6667, tolerance: 0.002 },
        { id: 'f1', prompt: 'F1 score', type: 'number', answer: 0.7273, tolerance: 0.002 },
        { id: 'base', prompt: 'A trivial filter that marks **nothing** as spam: what accuracy does it get on the same 200 emails?', type: 'number', answer: 0.7, tolerance: 0.001, explain: '140 of 200 are not spam.' },
        { id: 'tune', prompt: 'You lower the spam threshold so the filter flags more messages. Which metric most likely goes **up**?', type: 'choice', options: ['Precision', 'Recall', 'Neither', 'Both'], answer: 1 },
      ],
      hints: ['precision = TP / (TP + FP); recall = TP / (TP + FN).', 'F1 = 2PR / (P + R).', 'Lowering the threshold catches more positives (and more false alarms).'],
    }),

    lab({
      id: 'ai1-metrics',
      title: 'Classification metrics',
      kind: 'code',
      difficulty: 2,
      minutes: 20,
      tags: ['metrics'],
      interview: true,
      prompt: `Implement \`classificationMetrics(yTrue, yPred)\` for binary labels (\`0\`/\`1\`) returning \`{ tp, fp, fn, tn, accuracy, precision, recall, f1 }\`.

- **Division by zero:** if a denominator is 0 the metric is \`0\` (e.g. no predicted positives ⇒ precision 0).
- The arrays have equal length (throw an \`Error\` containing \`"length"\` otherwise); an empty input gives accuracy 0.

Then \`mse(yTrue, yPred)\` and \`r2(yTrue, yPred)\` for regression (\`r2 = 1 − SSres/SStot\`; if \`SStot = 0\` return \`0\`).`,
      expose: ['classificationMetrics', 'mse', 'r2'],
      files: jsFile(`function classificationMetrics(yTrue, yPred) {\n  \n}\n\nfunction mse(yTrue, yPred) {\n  \n}\n\nfunction r2(yTrue, yPred) {\n  \n}\n`, `function classificationMetrics(yTrue, yPred) {
  if (yTrue.length !== yPred.length) throw new Error('arrays must have the same length');
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (let i = 0; i < yTrue.length; i++) {
    if (yTrue[i] === 1 && yPred[i] === 1) tp++;
    else if (yTrue[i] === 0 && yPred[i] === 1) fp++;
    else if (yTrue[i] === 1 && yPred[i] === 0) fn++;
    else tn++;
  }
  const div = (a, b) => (b === 0 ? 0 : a / b);
  const precision = div(tp, tp + fp);
  const recall = div(tp, tp + fn);
  return { tp, fp, fn, tn, accuracy: div(tp + tn, yTrue.length), precision, recall, f1: div(2 * precision * recall, precision + recall) };
}

function mse(yTrue, yPred) {
  let s = 0;
  for (let i = 0; i < yTrue.length; i++) s += (yTrue[i] - yPred[i]) ** 2;
  return s / yTrue.length;
}

function r2(yTrue, yPred) {
  const mean = yTrue.reduce((a, b) => a + b, 0) / yTrue.length;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < yTrue.length; i++) {
    ssRes += (yTrue[i] - yPred[i]) ** 2;
    ssTot += (yTrue[i] - mean) ** 2;
  }
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
}
`),
      tests: [
        ex('the worked example (TP 40, FP 10, FN 20, TN 130)', ({ env, expect }) => {
          const yTrue = [...Array(40).fill(1), ...Array(10).fill(0), ...Array(20).fill(1), ...Array(130).fill(0)];
          const yPred = [...Array(40).fill(1), ...Array(10).fill(1), ...Array(20).fill(0), ...Array(130).fill(0)];
          const m = env.classificationMetrics(yTrue, yPred);
          expect([m.tp, m.fp, m.fn, m.tn]).toEqual([40, 10, 20, 130]);
          expect(m.accuracy).toBeNear(0.85);
          expect(m.precision).toBeNear(0.8);
          expect(m.recall).toBeNear(2 / 3, { abs: 1e-12 });
          expect(m.f1).toBeNear(0.727272727, { abs: 1e-8 });
        }),
        ex('degenerate cases return 0, not NaN', ({ env, expect }) => {
          const none = env.classificationMetrics([0, 0, 0], [0, 0, 0]);
          expect([none.precision, none.recall, none.f1, none.accuracy]).toEqual([0, 0, 0, 1]);
          const allWrong = env.classificationMetrics([1, 1], [0, 0]);
          expect([allWrong.precision, allWrong.recall, allWrong.f1]).toEqual([0, 0, 0]);
          expect(env.classificationMetrics([], []).accuracy).toBe(0);
        }),
        ex('length mismatch throws', ({ env, expect }) => expect(() => env.classificationMetrics([1], [1, 0])).toThrow('length')),
        ex('mse and r²', ({ env, expect }) => {
          expect(env.mse([1, 2, 3], [1, 2, 5])).toBeNear(4 / 3, { abs: 1e-12 });
          expect(env.r2([1, 2, 3, 4], [1, 2, 3, 4])).toBeNear(1);
          expect(env.r2([1, 2, 3], [2, 2, 2])).toBeNear(0, { abs: 1e-12 });
          expect(env.r2([5, 5, 5], [1, 2, 3])).toBe(0);
        }),
        prop('property: tp+fp+fn+tn = n; F1 lies between min and max of precision/recall', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(0, 1), 1, 30), gen.array(gen.int(0, 1), 1, 30)], (a: number[], b: number[]) => {
            const n = Math.min(a.length, b.length);
            const m = env.classificationMetrics(a.slice(0, n), b.slice(0, n));
            expect(m.tp + m.fp + m.fn + m.tn).toBe(n);
            if (m.f1 > 0) { expect(m.f1).toBeGreaterThanOrEqual(Math.min(m.precision, m.recall) - 1e-12); expect(m.f1).toBeLessThanOrEqual(Math.max(m.precision, m.recall) + 1e-12); }
          });
        }),
      ],
      hints: ['One pass over both arrays, counting the four cases.', 'Write a `div(a, b)` helper that returns `0` when `b === 0`.', 'r²: `1 − SS_res / SS_tot`, where `SS_tot` is the sum of squared deviations of `yTrue` from its mean.'],
    }),

    lab({
      id: 'ai1-auc',
      title: 'ROC-AUC',
      kind: 'code',
      difficulty: 4,
      minutes: 25,
      tags: ['metrics', 'ranking'],
      interview: true,
      prompt: `\`rocAuc(scores, labels)\` — the area under the ROC curve = the probability that a randomly chosen **positive** (label 1) gets a **higher score** than a randomly chosen **negative**, counting a **tie as ½**.

Compute it in **O(n log n)** by sorting (the Mann–Whitney U / rank-sum method with **average ranks for ties**), not by comparing all pairs. If there are no positives or no negatives return \`0.5\`.`,
      expose: ['rocAuc'],
      files: jsFile(`function rocAuc(scores, labels) {\n  \n}\n`, `function rocAuc(scores, labels) {
  const n = scores.length;
  const order = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  const ranks = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && scores[order[j + 1]] === scores[order[i]]) j++;
    const avg = (i + j) / 2 + 1; // average 1-based rank of the tied block
    for (let k = i; k <= j; k++) ranks[order[k]] = avg;
    i = j + 1;
  }
  let pos = 0;
  let rankSum = 0;
  for (let k = 0; k < n; k++) if (labels[k] === 1) { pos++; rankSum += ranks[k]; }
  const neg = n - pos;
  if (pos === 0 || neg === 0) return 0.5;
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}
`),
      tests: [
        ex('perfect, reversed and random-looking rankings', ({ env, expect }) => {
          expect(env.rocAuc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1])).toBe(1);
          expect(env.rocAuc([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1])).toBe(0);
          expect(env.rocAuc([0.1, 0.4, 0.35, 0.8], [0, 0, 1, 1])).toBeNear(0.75);
        }),
        ex('ties count as one half', ({ env, expect }) => {
          expect(env.rocAuc([0.5, 0.5], [0, 1])).toBe(0.5);
          expect(env.rocAuc([1, 1, 1, 1], [0, 1, 0, 1])).toBe(0.5);
          expect(env.rocAuc([0.1, 0.4, 0.4, 0.8], [0, 0, 1, 1])).toBeNear(0.875);
        }),
        ex('degenerate inputs return 0.5', ({ env, expect }) => {
          expect(env.rocAuc([0.1, 0.2], [1, 1])).toBe(0.5);
          expect(env.rocAuc([0.1, 0.2], [0, 0])).toBe(0.5);
          expect(env.rocAuc([], [])).toBe(0.5);
        }),
        prop('property: matches the all-pairs definition', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(0, 6), 2, 24), gen.array(gen.int(0, 1), 2, 24)], (s: number[], l: number[]) => {
            const n = Math.min(s.length, l.length);
            const sc = s.slice(0, n), lb = l.slice(0, n);
            let num = 0, pairs = 0;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (lb[i] === 1 && lb[j] === 0) { pairs++; num += sc[i] > sc[j] ? 1 : sc[i] === sc[j] ? 0.5 : 0; }
            expect(env.rocAuc(sc, lb)).toBeNear(pairs === 0 ? 0.5 : num / pairs, { abs: 1e-12 });
          }, { runs: 300 });
        }),
        perf('50,000 examples (all-pairs would need 6×10⁸ comparisons)', async ({ env, expect, measure, rng }) => {
          const r = rng(4);
          const scores = Array.from({ length: 50000 }, () => r.float());
          const labels = scores.map((s) => (r.float() < s ? 1 : 0));
          const { value, steps } = await measure(() => env.rocAuc(scores, labels), { budget: 8_000_000 });
          expect(value).toBeGreaterThan(0.6);
          expect(steps).toBeLessThan(1_500_000);
        }),
      ],
      hints: ['Rank all scores from 1..n (smallest = 1). Tied scores share the **average** of their ranks.', 'With `P` positives and `N` negatives: `U = (sum of positive ranks) − P(P+1)/2`, and `AUC = U / (P·N)`.', 'Sorting is the only super-linear step.'],
    }),

    lab({
      id: 'ai1-splits',
      title: 'Splits, folds and a leak-free standardiser',
      kind: 'code',
      difficulty: 3,
      minutes: 25,
      tags: ['evaluation', 'leakage'],
      prompt: `Randomness is injected: \`rand()\` returns floats in \`[0,1)\`.

- \`trainTestSplit(n, testRatio, rand)\` → \`{ train, test }\`: two **disjoint** arrays of indices covering \`0..n-1\`; \`test.length = Math.round(n * testRatio)\`; chosen by a Fisher–Yates shuffle with \`rand\`.
- \`kFold(n, k, rand)\` → an array of \`k\` index arrays (the **test fold** of each round). Folds partition \`0..n-1\` and their sizes differ by at most 1. (A \`TypeError\`/\`RangeError\` for \`k < 2\` or \`k > n\`.)
- \`class Standardizer\` — \`fit(X)\` (X = array of rows; learn each column's mean and population std from **these rows only**; a constant column gets \`std = 1\`), \`transform(X)\` → new standardised rows using the **fitted** statistics. \`transform\` before \`fit\` throws.`,
      expose: ['trainTestSplit', 'kFold', 'Standardizer'],
      files: jsFile(`function trainTestSplit(n, testRatio, rand) {\n  \n}\n\nfunction kFold(n, k, rand) {\n  \n}\n\nclass Standardizer {\n  fit(X) {}\n  transform(X) {}\n}\n`, `function shuffledIndices(n, rand) {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

function trainTestSplit(n, testRatio, rand) {
  const idx = shuffledIndices(n, rand);
  const nTest = Math.round(n * testRatio);
  return { train: idx.slice(nTest), test: idx.slice(0, nTest) };
}

function kFold(n, k, rand) {
  if (!Number.isInteger(k) || k < 2 || k > n) throw new RangeError('k must be an integer in [2, n]');
  const idx = shuffledIndices(n, rand);
  const folds = Array.from({ length: k }, () => []);
  idx.forEach((v, i) => folds[i % k].push(v));
  return folds;
}

class Standardizer {
  fit(X) {
    const d = X[0].length;
    this.mean = new Array(d).fill(0);
    this.std = new Array(d).fill(0);
    for (const row of X) for (let j = 0; j < d; j++) this.mean[j] += row[j] / X.length;
    for (const row of X) for (let j = 0; j < d; j++) this.std[j] += (row[j] - this.mean[j]) ** 2 / X.length;
    this.std = this.std.map((v) => Math.sqrt(v) || 1);
    return this;
  }

  transform(X) {
    if (!this.mean) throw new Error('call fit() before transform()');
    return X.map((row) => row.map((v, j) => (v - this.mean[j]) / this.std[j]));
  }
}
`),
      tests: [
        ex('trainTestSplit: disjoint, complete, correct sizes', ({ env, expect, rng }) => {
          const r = rng(1);
          const { train, test } = env.trainTestSplit(100, 0.2, () => r.float());
          expect(test.length).toBe(20);
          expect(train.length).toBe(80);
          expect([...train, ...test].sort((a, b) => a - b)).toEqual(Array.from({ length: 100 }, (_, i) => i));
        }),
        ex('trainTestSplit actually shuffles (different seeds → different splits)', ({ env, expect, rng }) => {
          const a = rng(1), b = rng(2);
          const s1 = env.trainTestSplit(50, 0.3, () => a.float()).test;
          const s2 = env.trainTestSplit(50, 0.3, () => b.float()).test;
          expect(s1).not.toEqual(s2);
          expect(s1).not.toEqual([...s1].sort((x: number, y: number) => x - y));
        }),
        ex('kFold: folds partition the indices; sizes differ by at most one', ({ env, expect, rng }) => {
          const r = rng(3);
          const folds: number[][] = env.kFold(23, 5, () => r.float());
          expect(folds.length).toBe(5);
          expect(folds.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 23 }, (_, i) => i));
          const sizes = folds.map((f) => f.length);
          expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        }),
        ex('kFold rejects bad k', ({ env, expect }) => {
          expect(() => env.kFold(10, 1, Math.random)).toThrow();
          expect(() => env.kFold(10, 11, Math.random)).toThrow();
        }),
        ex('Standardizer: fitted on train, applied to test (no leakage)', ({ env, expect }) => {
          const s = new env.Standardizer();
          const train = [[1, 10], [2, 10], [3, 10]];
          s.fit(train);
          const t = s.transform(train);
          expect(t[1][0]).toBeNear(0, { abs: 1e-12 });
          expect(t[0][0]).toBeNear(-Math.sqrt(1.5), { abs: 1e-12 });
          expect(t.map((r: number[]) => r[1])).toEqual([0, 0, 0]); // a constant column does not blow up
          const test = s.transform([[100, 10]]);
          expect(test[0][0]).toBeNear((100 - 2) / Math.sqrt(2 / 3), { abs: 1e-9 }); // uses the TRAIN mean/std
        }),
        ex('transform before fit throws; transform does not mutate its input', ({ env, expect }) => {
          const s = new env.Standardizer();
          expect(() => s.transform([[1]])).toThrow('fit');
          s.fit([[1], [3]]);
          const X = [[5]];
          s.transform(X);
          expect(X).toEqual([[5]]);
        }),
        prop('property: standardised training data has mean 0 and (population) std 1', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-50, 50), 2, 20)], (col: number[]) => {
            if (new Set(col).size < 2) return;
            const X = col.map((v) => [v, v * 2 + 1]);
            const t = new env.Standardizer().fit(X).transform(X);
            for (let j = 0; j < 2; j++) {
              const m = t.reduce((s: number, r: number[]) => s + r[j], 0) / t.length;
              const v = t.reduce((s: number, r: number[]) => s + (r[j] - m) ** 2, 0) / t.length;
              expect(m).toBeNear(0, { abs: 1e-9 });
              expect(v).toBeNear(1, { abs: 1e-9 });
            }
          });
        }),
      ],
      hints: ['Shuffle `[0, 1, …, n−1]` with Fisher–Yates using the injected `rand`.', '`trainTestSplit`: the first `round(n·ratio)` shuffled indices are the test set.', '`kFold`: deal the shuffled indices round-robin into `k` folds (`folds[i % k].push(idx[i])`) — sizes then differ by at most one.', '`Standardizer.fit` stores `mean[j]` and `std[j]` from the training rows; `transform` applies `(v − mean) / std` using those stored numbers, never recomputing them.'],
      why: 'Fitting on the whole dataset is the single most common reason a model "works" offline and fails in production.',
    }),
  ],
  references: [
    { title: 'Machine Learning Yearning — Andrew Ng (free)' },
    { title: 'Leakage in data mining: formulation, detection, and avoidance — Kaufman et al., KDD 2011' },
    { title: 'An Introduction to Statistical Learning (ISLR, free PDF)', url: 'https://www.statlearning.com/' },
  ],
};
export default mod;
