import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';
import { Rng } from '../../grader/rng';

const SOLVE_SRC = `// Gaussian elimination with partial pivoting (provided). Returns null if the matrix is singular.
function solve(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
    if (Math.abs(M[pivot][c]) < 1e-10) return null;
    [M[c], M[pivot]] = [M[pivot], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}
`;

const dotp = (w: number[], x: number[]) => w[0] + x.reduce((s, v, i) => s + w[i + 1] * v, 0);

const mod: Module = {
  id: 'regression',
  course: 'ai-ml',
  title: 'Linear & Logistic Regression: Least Squares, Gradient Descent, Regularisation',
  minutes: 100,
  objectives: [
    'Derive and solve the normal equations for linear regression',
    'Train a model with batch gradient descent and relate it to the closed-form solution',
    'Use L2 regularisation (ridge) to tame overfitting and collinearity',
    'Implement logistic regression for classification with a numerically stable sigmoid',
  ],
  body: `
## Linear regression

Model a number as a **weighted sum of features**: $\\hat y = w_0 + w_1 x_1 + \\dots + w_d x_d = \\mathbf{w}^{\\top}\\tilde{\\mathbf{x}}$ (where $\\tilde{\\mathbf x}=(1,x_1,\\dots,x_d)$ includes a constant for the **bias** $w_0$). Training finds $\\mathbf{w}$ minimising the **mean squared error**
$$L(\\mathbf{w})=\\frac1n\\sum_i (\\hat y_i - y_i)^2=\\frac1n\\lVert X\\mathbf w-\\mathbf y\\rVert^2$$
where $X$ is the $n\\times(d+1)$ design matrix (a leading column of ones). It is a convex bowl, so setting the gradient to zero gives the **normal equations**:
$$X^{\\top}X\\,\\mathbf w = X^{\\top}\\mathbf y\\quad\\Rightarrow\\quad \\mathbf w=(X^{\\top}X)^{-1}X^{\\top}\\mathbf y$$
You *solve* the linear system (Gaussian elimination, or better QR/Cholesky) — you never form the inverse. Cost $O(nd^2+d^3)$. If features are **collinear** (a column is a combination of others) $X^\\top X$ is singular and there are infinitely many solutions.

**Why squared error?** It is differentiable, convex, and corresponds to the **maximum-likelihood** estimate when the noise is Gaussian. (L1/absolute error is robust to outliers but not smooth; Huber loss blends both.)

## Gradient descent for the same problem

The gradient is $\\nabla L=\\frac2n X^{\\top}(X\\mathbf w-\\mathbf y)$. Repeat $\\mathbf w\\leftarrow\\mathbf w-\\eta\\nabla L$.

- It scales to millions of features/examples (**stochastic / mini-batch** GD uses a random subset per step) where the normal equations are too costly.
- **Feature scaling matters:** with features on very different scales (age ≈ 40 vs income ≈ 50,000) the bowl becomes a long narrow valley and GD zig-zags. **Standardise** inputs (mean 0, std 1) — using training statistics only.
- Choose $\\eta$ so the loss decreases every epoch. **Plot the loss curve** — it is your first debugging tool.

## Regularisation: ridge (L2)

When there are many features, few examples, or collinearity, weights blow up and the model overfits. Add a **penalty** on weight size (not on the bias):
$$L_{\\text{ridge}}(\\mathbf w)=\\frac1n\\lVert X\\mathbf w-\\mathbf y\\rVert^2+\\lambda\\sum_{j\\ge1}w_j^2 \\quad\\Rightarrow\\quad (X^{\\top}X+n\\lambda I')\\mathbf w = X^{\\top}\\mathbf y$$
($I'$ is the identity with a 0 for the bias). $\\lambda$ trades **bias for variance**: larger $\\lambda$ shrinks weights toward zero. A pleasant side-effect: $X^\\top X+\\lambda I'$ is **always invertible**, fixing collinearity. **L1 (lasso)** adds $\\lambda\\sum|w_j|$ and drives many weights to exactly zero (feature selection). Choose $\\lambda$ by **cross-validation**.

## Logistic regression (classification)

For a yes/no label we want a **probability**. Squash the linear score through the **sigmoid**:
$$p=\\sigma(z)=\\frac1{1+e^{-z}},\\qquad z=\\mathbf w^{\\top}\\tilde{\\mathbf x}$$
$\\sigma$ maps $(-\\infty,\\infty)\\to(0,1)$; $z=0$ gives $p=\\tfrac12$ — the **decision boundary** is the hyperplane $\\mathbf w^\\top\\tilde{\\mathbf x}=0$. Train by minimising the **cross-entropy (log loss)**, the negative log-likelihood of the labels:
$$L=-\\frac1n\\sum_i\\big[y_i\\ln p_i+(1-y_i)\\ln(1-p_i)\\big]$$
and its gradient is delightfully simple:
$$\\nabla L=\\frac1n X^{\\top}(\\mathbf p-\\mathbf y)$$
(the same shape as linear regression, with $\\mathbf p$ replacing $X\\mathbf w$). No closed form: use gradient descent (or Newton/IRLS).

**Numerical stability:** $e^{-z}$ overflows for very negative $z$. Use the two-branch form
\`z >= 0 ? 1 / (1 + exp(-z)) : exp(z) / (1 + exp(z))\` — never overflows. For log loss clip $p$ away from 0 and 1 (or work with logits).

\`\`\`js run
const sigmoid = (z) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));
console.log(sigmoid(0), sigmoid(2).toFixed(4), sigmoid(-1000), sigmoid(1000));   // 0.5 0.8808 0 1  (no NaN!)

// The naive version breaks:
const naive = (z) => 1 / (1 + Math.exp(-z));
console.log(naive(-1000));    // 0 — fine here, but exp(1000) = Infinity → 1/Infinity; softmax-style code gets NaN quickly
\`\`\`

:::tip
Logistic regression is the single-neuron neural network. Everything in the next modules — losses, gradients, regularisation, stable numerics — is introduced here in miniature. It is also a very strong, interpretable, fast **baseline**.
:::

:::warn
**Don't regularise the bias**, and standardise features *before* applying a penalty (otherwise the penalty depends on the units you happened to choose). And remember: a perfect score on a **linearly separable** set pushes logistic weights toward infinity without regularisation.
:::
`,
  quiz: [
    { q: 'Why do we solve the normal equations rather than compute (XᵀX)⁻¹ explicitly?', options: ['It is shorter to type', 'Solving the system is faster and numerically more accurate than forming an inverse', 'The inverse never exists', 'Inverses are not defined in JavaScript'], answer: 1, why: 'Elimination avoids amplifying rounding errors.' },
    { q: 'What does increasing the ridge parameter λ do?', options: ['Shrinks the weights toward zero (more bias, less variance)', 'Makes the model more flexible', 'Adds more features', 'Nothing'], answer: 0, why: 'The penalty discourages large weights.' },
    { q: 'Why standardise features before gradient descent?', options: ['It makes data prettier', 'Features on very different scales create a narrow valley in the loss, forcing a tiny learning rate and slow zig-zag convergence', 'GD only works with positive numbers', 'It is required by the sigmoid'], answer: 1, why: 'Equal scales give a rounder loss surface.' },
    { q: 'Logistic regression outputs 0.5 when…', options: ['wᵀx = 1', 'wᵀx = 0 (the point is on the decision boundary)', 'The label is 1', 'The loss is zero'], answer: 1, why: 'σ(0) = 0.5.' },
    { q: 'The gradient of the mean log loss with respect to w is…', options: ['(2/n)·Xᵀ(Xw − y)', '(1/n)·Xᵀ(p − y) where p = σ(Xw)', 'p − y', 'Xᵀy'], answer: 1, why: 'A strikingly simple form, shared with linear regression up to the link function.' },
  ],
  labs: [
    lab({
      id: 'ai2-fit-linear',
      title: 'Linear regression: the normal equations (with ridge)',
      kind: 'code',
      difficulty: 3,
      minutes: 30,
      tags: ['regression', 'linear-algebra'],
      interview: true,
      prompt: `A \`solve(A, b)\` (Gaussian elimination; returns \`null\` for a singular matrix) is provided. Implement:

- \`fitLinear(X, y, { lambda = 0 } = {})\` — \`X\` is an array of feature rows (**no** bias column). Return the weights \`[w0, w1, …, wd]\` (bias first) from the **normal equations** \`(XᵀX + λ·I′) w = Xᵀy\`, where \`I′\` is the identity but **with 0 for the bias**. Return \`null\` when the system is singular.
- \`predict(w, X)\` — the predicted \`ŷ\` for every row.

(Build the design matrix with a leading column of 1s. Do the products with loops.)`,
      expose: ['fitLinear', 'predict'],
      files: jsFile(SOLVE_SRC + `
function fitLinear(X, y, { lambda = 0 } = {}) {
  
}

function predict(w, X) {
  
}
`, SOLVE_SRC + `
function fitLinear(X, y, { lambda = 0 } = {}) {
  const n = X.length;
  const d = X[0].length + 1;
  const D = X.map((row) => [1, ...row]);
  const A = Array.from({ length: d }, () => new Array(d).fill(0));
  const b = new Array(d).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) {
      b[j] += D[i][j] * y[i];
      for (let k = 0; k < d; k++) A[j][k] += D[i][j] * D[i][k];
    }
  }
  for (let j = 1; j < d; j++) A[j][j] += lambda;
  return solve(A, b);
}

function predict(w, X) {
  return X.map((row) => row.reduce((s, v, i) => s + w[i + 1] * v, w[0]));
}
`),
      tests: [
        ex('recovers an exact line y = 3 + 2x', ({ env, expect }) => {
          const X = [[0], [1], [2], [3], [4]];
          const y = X.map(([x]) => 3 + 2 * x);
          const w = env.fitLinear(X, y);
          expect(w[0]).toBeNear(3, { abs: 1e-9 });
          expect(w[1]).toBeNear(2, { abs: 1e-9 });
        }),
        ex('recovers 3 weights from noiseless data', ({ env, expect, rng }) => {
          const r = rng(1);
          const X = Array.from({ length: 40 }, () => [r.normal(), r.normal(), r.normal()]);
          const truth = [1.5, -2, 0.5, 4];
          const y = X.map((x) => dotp(truth, x));
          const w = env.fitLinear(X, y);
          truth.forEach((t, i) => expect(w[i]).toBeNear(t, { abs: 1e-8 }));
        }),
        ex('with noise the estimate is close', ({ env, expect, rng }) => {
          const r = rng(2);
          const X = Array.from({ length: 400 }, () => [r.normal(), r.normal()]);
          const y = X.map((x) => 1 + 2 * x[0] - 3 * x[1] + r.normal(0, 0.1));
          const w = env.fitLinear(X, y);
          expect(w[0]).toBeNear(1, { abs: 0.05 });
          expect(w[1]).toBeNear(2, { abs: 0.05 });
          expect(w[2]).toBeNear(-3, { abs: 0.05 });
        }),
        ex('predict applies the weights', ({ env, expect }) => expect(env.predict([1, 2, -1], [[0, 0], [1, 1], [2, 5]])).toEqual([1, 2, 0])),
        ex('collinear features: singular without ridge (null), solvable with ridge', ({ env, expect }) => {
          const X = [[1, 2], [2, 4], [3, 6], [4, 8]];
          const y = [1, 2, 3, 4];
          expect(env.fitLinear(X, y)).toBe(null);
          const w = env.fitLinear(X, y, { lambda: 0.1 });
          expect(w).not.toBe(null);
          const pred = env.predict(w, X);
          pred.forEach((p: number, i: number) => expect(p).toBeNear(y[i], { abs: 0.2 }));
        }),
        ex('ridge shrinks the weights and does not penalise the bias', ({ env, expect, rng }) => {
          const r = rng(5);
          const X = Array.from({ length: 30 }, () => [r.normal(), r.normal()]);
          const y = X.map((x) => 10 + 4 * x[0] + 2 * x[1] + r.normal(0, 0.3));
          const w0 = env.fitLinear(X, y, { lambda: 0 });
          const w1 = env.fitLinear(X, y, { lambda: 20 });
          expect(Math.hypot(w1[1], w1[2])).toBeLessThan(Math.hypot(w0[1], w0[2]));
          expect(w1[0]).toBeNear(10, { abs: 0.6 }); // the intercept stays near the mean of y
        }),
        prop('property: the residuals are orthogonal to every column of X (the normal equations hold)', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 9999)], (seed: number) => {
            const r = new Rng(seed);
            const X = Array.from({ length: 25 }, () => [r.normal(), r.normal()]);
            const y = X.map((x) => 2 + x[0] - x[1] + r.normal(0, 0.5));
            const w = env.fitLinear(X, y);
            const res = X.map((x, i) => y[i] - dotp(w, x));
            expect(res.reduce((a: number, b: number) => a + b, 0)).toBeNear(0, { abs: 1e-8 });
            expect(res.reduce((s: number, v: number, i: number) => s + v * X[i][0], 0)).toBeNear(0, { abs: 1e-8 });
          }, { runs: 40 });
        }),
      ],
      hints: ['Design matrix `D`: each row is `[1, ...x]`. Compute `A = DᵀD` and `b = Dᵀy` with loops.', 'Ridge: add `lambda` to the **diagonal** entries `A[j][j]` for `j ≥ 1` (not `j = 0`).', 'Return `solve(A, b)` — it already returns `null` for a singular matrix.', '`predict`: `w[0] + Σ w[i+1]·x[i]` per row.'],
    }),

    lab({
      id: 'ai2-gd-linear',
      title: 'Linear regression by gradient descent',
      kind: 'code',
      difficulty: 3,
      minutes: 25,
      tags: ['regression', 'optimisation'],
      prompt: `Implement \`trainLinearGD(X, y, { lr = 0.1, epochs = 500 } = {})\` → \`{ w, losses }\`:

- \`w = [bias, w1, …]\` starts at all zeros.
- Each epoch is **one batch step** using the **full** data: \`w ← w − lr · (2/n) · Dᵀ(D·w − y)\` (D has a leading column of ones).
- \`losses[e]\` is the **MSE before** the update of epoch \`e\` (so \`losses.length === epochs\`).

The tests standardise the features first, as you should.`,
      expose: ['trainLinearGD'],
      files: jsFile(`function trainLinearGD(X, y, { lr = 0.1, epochs = 500 } = {}) {\n  \n}\n`, `function trainLinearGD(X, y, { lr = 0.1, epochs = 500 } = {}) {
  const n = X.length;
  const d = X[0].length + 1;
  const w = new Array(d).fill(0);
  const losses = [];
  for (let e = 0; e < epochs; e++) {
    const grad = new Array(d).fill(0);
    let loss = 0;
    for (let i = 0; i < n; i++) {
      let pred = w[0];
      for (let j = 1; j < d; j++) pred += w[j] * X[i][j - 1];
      const err = pred - y[i];
      loss += err * err;
      grad[0] += err;
      for (let j = 1; j < d; j++) grad[j] += err * X[i][j - 1];
    }
    losses.push(loss / n);
    for (let j = 0; j < d; j++) w[j] -= (lr * 2 * grad[j]) / n;
  }
  return { w, losses };
}
`),
      tests: [
        ex('converges to the true weights on standardised data', ({ env, expect, rng }) => {
          const r = rng(1);
          const X = Array.from({ length: 200 }, () => [r.normal(), r.normal()]);
          const y = X.map((x) => 5 + 3 * x[0] - 2 * x[1]);
          const { w } = env.trainLinearGD(X, y, { lr: 0.1, epochs: 400 });
          expect(w[0]).toBeNear(5, { abs: 1e-3 });
          expect(w[1]).toBeNear(3, { abs: 1e-3 });
          expect(w[2]).toBeNear(-2, { abs: 1e-3 });
        }),
        ex('the loss decreases at every epoch for a sensible learning rate', ({ env, expect, rng }) => {
          const r = rng(2);
          const X = Array.from({ length: 100 }, () => [r.normal()]);
          const y = X.map((x) => 1 + 2 * x[0] + r.normal(0, 0.3));
          const { losses } = env.trainLinearGD(X, y, { lr: 0.05, epochs: 100 });
          expect(losses.length).toBe(100);
          for (let i = 1; i < losses.length; i++) if (losses[i] > losses[i - 1] + 1e-12) throw new Error(`loss went up at epoch ${i}: ${losses[i - 1]} → ${losses[i]}`);
        }),
        ex('the first recorded loss is the loss of the all-zero model', ({ env, expect }) => {
          const { losses } = env.trainLinearGD([[1], [2]], [3, 5], { lr: 0.01, epochs: 3 });
          expect(losses[0]).toBeNear((9 + 25) / 2);
        }),
        ex('does not mutate its inputs', ({ env, expect }) => {
          const X = [[1], [2], [3]], y = [2, 4, 6];
          env.trainLinearGD(X, y, { epochs: 5 });
          expect(X).toEqual([[1], [2], [3]]);
          expect(y).toEqual([2, 4, 6]);
        }),
        ex('matches the closed-form solution (normal equations) on noisy data', ({ env, expect, rng }) => {
          const r = rng(9);
          const X = Array.from({ length: 150 }, () => [r.normal(), r.normal()]);
          const y = X.map((x) => 0.5 + x[0] + 2 * x[1] + r.normal(0, 0.5));
          const { w } = env.trainLinearGD(X, y, { lr: 0.1, epochs: 1500 });
          // reference: solve (DᵀD)w = Dᵀy
          const D = X.map((x) => [1, ...x]);
          const A = [0, 1, 2].map((a) => [0, 1, 2].map((b) => D.reduce((s, row) => s + row[a] * row[b], 0)));
          const bv = [0, 1, 2].map((a) => D.reduce((s, row, i) => s + row[a] * y[i], 0));
          // 3×3 Cramer-free elimination
          const M = A.map((row, i) => [...row, bv[i]]);
          for (let c = 0; c < 3; c++) { for (let rr = c + 1; rr < 3; rr++) { const f = M[rr][c] / M[c][c]; for (let k = c; k < 4; k++) M[rr][k] -= f * M[c][k]; } }
          const ref = [0, 0, 0];
          for (let i = 2; i >= 0; i--) { let s = M[i][3]; for (let j = i + 1; j < 3; j++) s -= M[i][j] * ref[j]; ref[i] = s / M[i][i]; }
          ref.forEach((v, i) => expect(w[i]).toBeNear(v, { abs: 5e-3 }));
        }),
        perf('300 epochs on 2,000 rows runs in O(epochs · n · d) steps', async ({ env, expect, measure, rng }) => {
          const r = rng(4);
          const X = Array.from({ length: 2000 }, () => [r.normal(), r.normal(), r.normal()]);
          const y = X.map((x) => x[0] + x[1]);
          const { steps } = await measure(() => env.trainLinearGD(X, y, { epochs: 300 }), { budget: 40_000_000 });
          expect(steps).toBeLessThan(300 * 2000 * 12);
        }),
      ],
      hints: ['Per epoch: loop over the rows, compute `pred = w[0] + Σ w[j]·x[j-1]` and `err = pred − y`.', 'Accumulate `loss += err²`, `grad[0] += err`, `grad[j] += err·x[j−1]`; after the loop `w[j] −= lr · 2 · grad[j] / n`.', 'Record `loss / n` **before** applying the update.'],
    }),

    lab({
      id: 'ai2-logistic',
      title: 'Logistic regression',
      kind: 'code',
      difficulty: 4,
      minutes: 30,
      tags: ['classification', 'optimisation'],
      interview: true,
      prompt: `Implement binary logistic regression with labels 0/1:

- \`sigmoid(z)\` — **numerically stable** (no \`NaN\` or overflow for \`z = ±1000\`).
- \`trainLogistic(X, y, { lr = 0.5, epochs = 300, lambda = 0 } = {})\` → weights \`[bias, w1, …]\` by **batch gradient descent** on the mean log loss, with an optional **L2 penalty** \`lambda · Σ wⱼ²\` on the non-bias weights (gradient \`2·lambda·wⱼ\`). Start from zeros.
- \`predictProba(w, X)\` → probabilities; \`predictClass(w, X, threshold = 0.5)\` → 0/1.
- \`logLoss(y, p)\` → mean cross-entropy, clipping \`p\` into \`[1e-12, 1 − 1e-12]\`.`,
      expose: ['sigmoid', 'trainLogistic', 'predictProba', 'predictClass', 'logLoss'],
      files: jsFile(`function sigmoid(z) {\n  \n}\n\nfunction trainLogistic(X, y, { lr = 0.5, epochs = 300, lambda = 0 } = {}) {\n  \n}\n\nfunction predictProba(w, X) {\n  \n}\n\nfunction predictClass(w, X, threshold = 0.5) {\n  \n}\n\nfunction logLoss(y, p) {\n  \n}\n`, `function sigmoid(z) {
  return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
}

function predictProba(w, X) {
  return X.map((row) => sigmoid(row.reduce((s, v, i) => s + w[i + 1] * v, w[0])));
}

function predictClass(w, X, threshold = 0.5) {
  return predictProba(w, X).map((p) => (p >= threshold ? 1 : 0));
}

function logLoss(y, p) {
  let s = 0;
  for (let i = 0; i < y.length; i++) {
    const q = Math.min(1 - 1e-12, Math.max(1e-12, p[i]));
    s -= y[i] * Math.log(q) + (1 - y[i]) * Math.log(1 - q);
  }
  return s / y.length;
}

function trainLogistic(X, y, { lr = 0.5, epochs = 300, lambda = 0 } = {}) {
  const n = X.length;
  const d = X[0].length + 1;
  const w = new Array(d).fill(0);
  for (let e = 0; e < epochs; e++) {
    const grad = new Array(d).fill(0);
    for (let i = 0; i < n; i++) {
      let z = w[0];
      for (let j = 1; j < d; j++) z += w[j] * X[i][j - 1];
      const err = sigmoid(z) - y[i];
      grad[0] += err;
      for (let j = 1; j < d; j++) grad[j] += err * X[i][j - 1];
    }
    for (let j = 0; j < d; j++) w[j] -= lr * (grad[j] / n + (j > 0 ? 2 * lambda * w[j] : 0));
  }
  return w;
}
`),
      tests: [
        ex('sigmoid values and stability', ({ env, expect }) => {
          expect(env.sigmoid(0)).toBe(0.5);
          expect(env.sigmoid(2)).toBeNear(0.8807970779778823, { abs: 1e-12 });
          expect(env.sigmoid(-2)).toBeNear(1 - 0.8807970779778823, { abs: 1e-12 });
          expect(env.sigmoid(1000)).toBe(1);
          expect(env.sigmoid(-1000)).toBe(0);
          expect(Number.isNaN(env.sigmoid(-745))).toBe(false);
        }),
        ex('separates two Gaussian blobs (train accuracy ≥ 95%)', ({ env, expect, rng }) => {
          const r = rng(3);
          const X: number[][] = [], y: number[] = [];
          for (let i = 0; i < 100; i++) { X.push([r.normal(-2, 1), r.normal(-2, 1)]); y.push(0); X.push([r.normal(2, 1), r.normal(2, 1)]); y.push(1); }
          const w = env.trainLogistic(X, y, { lr: 0.5, epochs: 300 });
          const pred: number[] = env.predictClass(w, X);
          const acc = pred.filter((p, i) => p === y[i]).length / y.length;
          expect(acc).toBeGreaterThanOrEqual(0.95);
          expect(w[1]).toBeGreaterThan(0);
          expect(w[2]).toBeGreaterThan(0);
        }),
        ex('probabilities are in (0, 1); class threshold works', ({ env, expect }) => {
          const w = [0, 1];
          const p = env.predictProba(w, [[-3], [0], [3]]);
          expect(p[1]).toBe(0.5);
          expect(p[0]).toBeLessThan(0.5);
          expect(p[2]).toBeGreaterThan(0.5);
          expect(env.predictClass(w, [[-3], [0], [3]])).toEqual([0, 1, 1]);
          expect(env.predictClass(w, [[-3], [0], [3]], 0.9)).toEqual([0, 0, 1]);
        }),
        ex('log loss: perfect, uninformed and confidently wrong', ({ env, expect }) => {
          expect(env.logLoss([1, 0], [1, 0])).toBeNear(0, { abs: 1e-9 });
          expect(env.logLoss([1, 0], [0.5, 0.5])).toBeNear(Math.LN2, { abs: 1e-12 });
          const wrong = env.logLoss([1], [0]);
          expect(Number.isFinite(wrong)).toBe(true);
          expect(wrong).toBeGreaterThan(20);
        }),
        ex('training reduces the log loss', ({ env, expect, rng }) => {
          const r = rng(6);
          const X = Array.from({ length: 80 }, (_, i) => [r.normal(i % 2 ? 1 : -1, 1.2)]);
          const y = X.map((_, i) => i % 2);
          const before = env.logLoss(y, env.predictProba([0, 0], X));
          const after = env.logLoss(y, env.predictProba(env.trainLogistic(X, y, { epochs: 200 }), X));
          expect(after).toBeLessThan(before);
        }),
        ex('L2 regularisation shrinks the weights on separable data', ({ env, expect }) => {
          const X = [[-2], [-1], [1], [2]];
          const y = [0, 0, 1, 1];
          const free = env.trainLogistic(X, y, { epochs: 500, lambda: 0 });
          const reg = env.trainLogistic(X, y, { epochs: 500, lambda: 0.5 });
          expect(Math.abs(reg[1])).toBeLessThan(Math.abs(free[1]) / 2);
        }),
        hid('does not produce NaN on huge unscaled features', ({ env, expect }) => {
          const w = env.trainLogistic([[1000], [-1000], [900], [-800]], [1, 0, 1, 0], { lr: 0.1, epochs: 50 });
          expect(w.every((v: number) => Number.isFinite(v))).toBe(true);
        }),
      ],
      hints: ['`sigmoid(z) = z >= 0 ? 1/(1+e^-z) : e^z/(1+e^z)` — each branch only exponentiates a non-positive number.', 'Gradient for one example: `(σ(z) − y)` times `[1, x1, x2, …]`. Average over `n` and add `2·lambda·w[j]` for `j ≥ 1`.', 'Compute `z = w[0] + Σ w[j]·x[j-1]` with a loop.'],
    }),

    lab({
      id: 'ai2-diagnose',
      title: 'Diagnose the model',
      kind: 'answer',
      difficulty: 2,
      minutes: 10,
      tags: ['bias-variance'],
      prompt: 'For each situation decide what is going on and what to try.',
      questions: [
        { id: 'a', prompt: 'Training RMSE = 0.1, validation RMSE = 5.0.', type: 'choice', options: ['Underfitting (high bias)', 'Overfitting (high variance)', 'A well-fit model', 'Data leakage into validation'], answer: 1 },
        { id: 'b', prompt: 'Training RMSE = 4.8, validation RMSE = 5.0, and a simple baseline scores 5.1.', type: 'choice', options: ['Underfitting (high bias): the model is too simple or under-trained', 'Overfitting', 'Perfect', 'The validation set is too small'], answer: 0 },
        { id: 'c', prompt: 'Which change **reduces overfitting**?', type: 'choice', options: ['Remove regularisation', 'Add more training data or increase the L2 penalty', 'Add more polynomial features', 'Train for more epochs without early stopping'], answer: 1 },
        { id: 'd', prompt: 'Your training loss goes to **NaN** after the first few steps. Most likely cause?', type: 'choice', options: ['Learning rate far too large / unstable numerics (e.g. exp overflow)', 'Too little data', 'Too much regularisation', 'Using standardised features'], answer: 0 },
        { id: 'e', prompt: 'A model scores 0.99 AUC offline but 0.62 in production. What should you suspect first?', type: 'choice', options: ['The learning rate', 'Train/test leakage or a train/serving skew', 'Too many epochs', 'A GPU bug'], answer: 1 },
      ],
      hints: ['Gap between train and validation ⇒ variance. Both bad ⇒ bias.', 'NaN losses are nearly always numerical: step size or overflow.'],
    }),
  ],
  references: [
    { title: 'The Elements of Statistical Learning — Hastie, Tibshirani, Friedman (free PDF)', url: 'https://hastie.su.domains/ElemStatLearn/' },
    { title: 'CS229 lecture notes: linear regression, logistic regression, GLMs (Stanford)', url: 'https://cs229.stanford.edu/' },
  ],
};
export default mod;
