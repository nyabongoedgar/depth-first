import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';
import { Rng } from '../../grader/rng';

const randMat = (r: Rng, n: number, m: number, lo = -4, hi = 4) => Array.from({ length: n }, () => Array.from({ length: m }, () => r.int(lo, hi)));
const mm = (A: number[][], B: number[][]) => A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));
const near = (a: number[], b: number[], tol = 1e-8) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol * Math.max(1, Math.abs(b[i])));

const mod: Module = {
  id: 'linear-algebra',
  course: 'math',
  title: 'Linear Algebra I: Vectors, Matrices & Solving Systems',
  minutes: 90,
  objectives: [
    'Compute dot products, norms and angles; interpret them geometrically',
    'Multiply matrices and understand them as linear transformations',
    'Solve linear systems with Gaussian elimination (partial pivoting) and detect singular matrices',
    'Compute determinants and understand what they mean',
  ],
  body: `
## Why every engineer needs it

Machine learning (a neural network is mostly matrix multiplication), computer graphics (every rotation, scale and projection is a matrix), search and recommendation (embeddings are vectors; similarity is a dot product), physics simulation, cryptography, compression (SVD/PCA), and graph algorithms (PageRank is an eigenvector problem) all run on **linear algebra**.

## Vectors

A **vector** is an ordered list of numbers $\\mathbf{v} = (v_1, \\dots, v_n)$ — a point in space, an arrow, a row of features, an embedding. You can **add** vectors, **scale** them, and combine: $\\alpha\\mathbf{u} + \\beta\\mathbf{v}$ (a **linear combination**).

**Dot product:**
$$\\mathbf{u}\\cdot\\mathbf{v} = \\sum_i u_i v_i = \\lVert\\mathbf{u}\\rVert\\,\\lVert\\mathbf{v}\\rVert\\cos\\theta$$

It measures **alignment**: positive when the vectors point the same way, zero when **orthogonal**, negative when opposed. **Norm** (length): $\\lVert\\mathbf{v}\\rVert = \\sqrt{\\mathbf{v}\\cdot\\mathbf{v}}$. **Cosine similarity** $=\\dfrac{\\mathbf{u}\\cdot\\mathbf{v}}{\\lVert\\mathbf{u}\\rVert\\lVert\\mathbf{v}\\rVert}$ is how search engines and recommender systems compare embeddings. The **projection** of $\\mathbf{u}$ onto $\\mathbf{v}$ is $\\dfrac{\\mathbf{u}\\cdot\\mathbf{v}}{\\mathbf{v}\\cdot\\mathbf{v}}\\mathbf{v}$.

\`\`\`js run
const dot = (u, v) => u.reduce((s, x, i) => s + x * v[i], 0);
const norm = (v) => Math.sqrt(dot(v, v));
const u = [3, 4], v = [4, -3];
console.log(dot(u, v), norm(u));                       // 0 5   → orthogonal, length 5
const cosSim = (a, b) => dot(a, b) / (norm(a) * norm(b));
console.log(cosSim([1, 2, 3], [2, 4, 6]).toFixed(4));  // 1.0000: same direction
\`\`\`

## Matrices: grids of numbers, machines that transform vectors

An $m \\times n$ matrix $A$ has $m$ rows and $n$ columns. It acts on a vector $\\mathbf{x}\\in\\mathbb{R}^n$ to give $A\\mathbf{x}\\in\\mathbb{R}^m$ — a **linear transformation** (preserves addition and scaling: lines stay lines, the origin stays put). Rotation, scaling, reflection, shear, projection are all matrices.

**Matrix product** $C = AB$ ($A$ is $m\\times k$, $B$ is $k\\times n$, $C$ is $m\\times n$):
$$C_{ij} = \\sum_{t=1}^{k} A_{it}B_{tj}$$
Entry $(i,j)$ is the **dot product of row $i$ of $A$ with column $j$ of $B$**. It composes transformations: $(AB)\\mathbf{x} = A(B\\mathbf{x})$ — apply $B$ first. Matrix multiplication is **associative** and **distributive** but **not commutative** ($AB \\neq BA$ in general). Naive cost is $O(mkn)$; GPUs and BLAS libraries make it blazing fast, which is why deep learning exists.

**Transpose** $A^{\\top}$ swaps rows and columns; $(AB)^{\\top} = B^{\\top}A^{\\top}$. **Identity** $I$ leaves vectors unchanged. The **inverse** $A^{-1}$ undoes $A$ (exists only for square, non-singular $A$).

\`\`\`js run
// Rotating the point (1, 0) by 90° with a matrix
const rot = (t) => [[Math.cos(t), -Math.sin(t)], [Math.sin(t), Math.cos(t)]];
const apply = (A, x) => A.map((row) => row.reduce((s, a, j) => s + a * x[j], 0));
console.log(apply(rot(Math.PI / 2), [1, 0]).map((v) => Math.round(v)));   // [0, 1]
\`\`\`

## Linear systems $A\\mathbf{x} = \\mathbf{b}$

"Find $\\mathbf{x}$ such that…" — circuit currents, least-squares fits, solving for weights. **Gaussian elimination** turns the system into triangular form by **row operations** (swap rows, scale a row, add a multiple of one row to another), then **back-substitutes**:

1. For each column $c$ pick the row at or below $c$ with the **largest absolute value** in that column (**partial pivoting** — essential for numerical stability) and swap it up.
2. If the pivot is (nearly) zero, the matrix is **singular**: no unique solution (either none or infinitely many).
3. Subtract multiples of the pivot row from the rows below to zero the column.
4. Back-substitute from the last row upwards.

Cost $O(n^3)$. **Never invert a matrix to solve a system** — elimination (or LU/QR decomposition) is faster and more accurate.

## Determinant

The **determinant** $\\det A$ of a square matrix is the **signed volume scaling factor** of the transformation: $|\\det A|$ is how much areas (2-D) or volumes (3-D) are multiplied; the sign says whether orientation flips. $\\det A = 0$ ⇔ $A$ collapses space into a lower dimension ⇔ **singular (not invertible)**. Useful facts: $\\det(AB) = \\det A\\det B$; $\\det A^{\\top} = \\det A$; swapping two rows flips the sign; a triangular matrix's determinant is the product of its diagonal. For $2\\times2$: $ad - bc$. Elimination gives $\\det$ in $O(n^3)$ as (product of pivots) × (−1)^(row swaps) — **don't** use the cofactor expansion for big matrices ($O(n!)$).

:::warn
**Floating point:** compare with a tolerance, not \`===\`. A pivot of $10^{-17}$ is "zero" in practice, and a matrix that is *almost* singular (ill-conditioned: huge condition number $\\kappa$) amplifies input noise by up to $\\kappa$ — the reason regularisation exists in ML.
:::

:::tip
Think of $A\\mathbf{x}$ as "a linear combination of the columns of $A$, weighted by $\\mathbf{x}$". Then $A\\mathbf{x}=\\mathbf{b}$ asks: *is $\\mathbf{b}$ in the span of the columns, and with which weights?*
:::
`,
  quiz: [
    { q: 'Two vectors have dot product 0. They are…', options: ['Parallel', 'Orthogonal (perpendicular)', 'Equal', 'Unit vectors'], answer: 1, why: 'u·v = |u||v| cos θ = 0 when θ = 90°.' },
    { q: 'If A is 3×4 and B is 4×2, what is the shape of AB?', options: ['4×4', '3×2', '2×3', 'It is undefined'], answer: 1, why: 'The inner dimensions (4) must match; the result is (rows of A) × (columns of B).' },
    { q: 'det(A) = 0 means…', options: ['A is the identity', 'A is singular: it collapses space and has no inverse', 'A is symmetric', 'A is orthogonal'], answer: 1, why: 'Zero volume scaling ⇒ information is lost ⇒ no inverse.' },
    { q: 'Why does Gaussian elimination use partial pivoting?', options: ['To make the matrix symmetric', 'Dividing by a tiny pivot amplifies rounding errors; choosing the largest pivot keeps the computation stable', 'To compute the determinant', 'It is faster'], answer: 1, why: 'Numerical stability.' },
    { q: 'Which is generally TRUE of matrix multiplication?', options: ['AB = BA', 'A(BC) = (AB)C', '(AB)ᵀ = AᵀBᵀ', 'It costs O(n)'], answer: 1, why: 'It is associative, but neither commutative nor does the transpose keep the order.' },
  ],
  labs: [
    lab({
      id: 'm1-hand-calcs',
      title: 'Compute by hand',
      kind: 'answer',
      difficulty: 1,
      minutes: 12,
      tags: ['vectors', 'matrices'],
      prompt: 'Work these out by hand (then check them with code if you like). Give exact numbers.',
      questions: [
        { id: 'q1', prompt: 'Dot product of $\\mathbf{u}=(2,-1,3)$ and $\\mathbf{v}=(4,0,-2)$.', type: 'number', answer: 2 },
        { id: 'q2', prompt: 'The norm $\\lVert(1,2,2)\\rVert$.', type: 'number', answer: 3 },
        { id: 'q3', prompt: 'Cosine similarity of $(1,0)$ and $(1,1)$, to 4 decimal places.', type: 'number', answer: 0.7071, tolerance: 0.001 },
        { id: 'q4', prompt: 'Entry $C_{12}$ (row 1, column 2) of $C=AB$ with $A=\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$ and $B=\\begin{pmatrix}0&1\\\\5&-1\\end{pmatrix}$.', type: 'number', answer: -1, explain: 'Row 1 of A is (1,2); column 2 of B is (1,−1): 1·1 + 2·(−1) = −1.' },
        { id: 'q5', prompt: 'Determinant of $\\begin{pmatrix}3&1\\\\4&2\\end{pmatrix}$.', type: 'number', answer: 2 },
        { id: 'q6', prompt: 'Determinant of $\\begin{pmatrix}2&0&0\\\\1&3&0\\\\5&7&4\\end{pmatrix}$ (hint: triangular).', type: 'number', answer: 24 },
        { id: 'q7', prompt: 'A transformation has determinant −3. By what factor does it scale **areas** (give the factor, ignoring orientation)?', type: 'number', answer: 3 },
      ],
      hints: ['Dot product: multiply component-wise and add.', 'Triangular matrix: the determinant is the product of the diagonal.', '|det| is the area scaling factor; the sign only says whether orientation flips.'],
    }),

    lab({
      id: 'm1-matmul',
      title: 'Matrix multiplication and transpose',
      kind: 'code',
      difficulty: 2,
      minutes: 15,
      tags: ['matrices'],
      prompt: `Matrices are arrays of row arrays. Implement:

- \`matmul(A, B)\` → \`A × B\`. Throw an \`Error\` containing \`"shape"\` if the inner dimensions don't match.
- \`transpose(A)\`
- \`identity(n)\`

Don't mutate the inputs.`,
      expose: ['matmul', 'transpose', 'identity'],
      files: jsFile(`function matmul(A, B) {\n  \n}\n\nfunction transpose(A) {\n  \n}\n\nfunction identity(n) {\n  \n}\n`, `function matmul(A, B) {
  if (A[0].length !== B.length) throw new Error('incompatible shape: ' + A.length + 'x' + A[0].length + ' times ' + B.length + 'x' + B[0].length);
  const m = A.length;
  const k = B.length;
  const n = B[0].length;
  const C = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++) {
    for (let t = 0; t < k; t++) {
      const a = A[i][t];
      for (let j = 0; j < n; j++) C[i][j] += a * B[t][j];
    }
  }
  return C;
}

function transpose(A) {
  return A[0].map((_, j) => A.map((row) => row[j]));
}

function identity(n) {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}
`),
      tests: [
        ex('a 2×2 example', ({ env, expect }) => expect(env.matmul([[1, 2], [3, 4]], [[0, 1], [5, -1]])).toEqual([[10, -1], [20, -1]])),
        ex('non-square shapes: (2×3)(3×2)', ({ env, expect }) => expect(env.matmul([[1, 2, 3], [4, 5, 6]], [[7, 8], [9, 10], [11, 12]])).toEqual([[58, 64], [139, 154]])),
        ex('identity and transpose', ({ env, expect }) => {
          const A = [[1, 2, 3], [4, 5, 6]];
          expect(env.transpose(A)).toEqual([[1, 4], [2, 5], [3, 6]]);
          expect(env.matmul(A, env.identity(3))).toEqual(A);
          expect(env.matmul(env.identity(2), A)).toEqual(A);
        }),
        ex('mismatched shapes throw', ({ env, expect }) => expect(() => env.matmul([[1, 2]], [[1, 2]])).toThrow('shape')),
        ex('inputs are not mutated', ({ env, expect }) => {
          const A = [[1, 2], [3, 4]], B = [[5, 6], [7, 8]];
          env.matmul(A, B); env.transpose(A);
          expect(A).toEqual([[1, 2], [3, 4]]);
        }),
        prop('property: matches a reference, is associative, and (AB)ᵀ = BᵀAᵀ', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 4), gen.int(1, 4), gen.int(1, 4), gen.int(1, 4), gen.int(1, 9999)], (m: number, k: number, n: number, p: number, seed: number) => {
            const r = new Rng(seed);
            const A = randMat(r, m, k), B = randMat(r, k, n), C = randMat(r, n, p);
            expect(env.matmul(A, B)).toEqual(mm(A, B));
            expect(env.matmul(env.matmul(A, B), C)).toEqual(env.matmul(A, env.matmul(B, C)));
            expect(env.transpose(env.matmul(A, B))).toEqual(env.matmul(env.transpose(B), env.transpose(A)));
          });
        }),
        perf('100×100 times 100×100 uses O(n³) steps', async ({ env, expect, measure, rng }) => {
          const r = rng(2);
          const A = randMat(r, 100, 100), B = randMat(r, 100, 100);
          const { steps } = await measure(() => env.matmul(A, B), { budget: 20_000_000 });
          expect(steps).toBeLessThan(100 * 100 * 100 * 3);
        }),
      ],
      hints: ['`C[i][j] = Σ_k A[i][k] * B[k][j]` — three nested loops.', 'Check `A[0].length === B.length` first.', 'Transpose: `A[0].map((_, j) => A.map(row => row[j]))`.'],
    }),

    lab({
      id: 'm1-solve',
      title: 'Solve a linear system (Gaussian elimination)',
      kind: 'code',
      difficulty: 4,
      minutes: 30,
      tags: ['linear-systems', 'numerical'],
      interview: true,
      prompt: `\`solve(A, b)\` — solve \`A·x = b\` for a square matrix \`A\` (n×n) and vector \`b\` using **Gaussian elimination with partial pivoting** (O(n³)).

- Return \`x\` as an array of numbers.
- If the matrix is **singular** (a pivot with absolute value below \`1e-12\`), return \`null\`.
- Don't mutate \`A\` or \`b\`.
- Do **not** compute an inverse.`,
      expose: ['solve'],
      files: jsFile(`function solve(A, b) {\n  \n}\n`, `function solve(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
    if (Math.abs(M[pivot][c]) < 1e-12) return null;
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
`),
      tests: [
        ex('a 2×2 system', ({ env, expect }) => {
          const x = env.solve([[2, 1], [1, 3]], [5, 10]);
          expect(near(x, [1, 3])).toBe(true);
        }),
        ex('a 3×3 system that needs a row swap (zero in the first pivot)', ({ env, expect }) => {
          const x = env.solve([[0, 2, 1], [1, 1, 1], [2, 1, 0]], [4, 3, 3]);
          expect(near(x, [2 / 3, 5 / 3, 2 / 3])).toBe(true);
        }),
        ex('singular matrices return null', ({ env, expect }) => {
          expect(env.solve([[1, 2], [2, 4]], [1, 2])).toBe(null);
          expect(env.solve([[0, 0], [0, 0]], [0, 0])).toBe(null);
        }),
        ex('a 1×1 system', ({ env, expect }) => expect(near(env.solve([[4]], [2]), [0.5])).toBe(true)),
        ex('inputs are not mutated', ({ env, expect }) => {
          const A = [[2, 1], [1, 3]], b = [5, 10];
          env.solve(A, b);
          expect(A).toEqual([[2, 1], [1, 3]]);
          expect(b).toEqual([5, 10]);
        }),
        prop('property: A·x reproduces b for random non-singular systems', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 5), gen.int(1, 9999)], (n: number, seed: number) => {
            const r = new Rng(seed);
            const A = randMat(r, n, n, -5, 5);
            for (let i = 0; i < n; i++) A[i][i] += 12; // diagonally dominant ⇒ non-singular
            const xTrue = Array.from({ length: n }, () => r.int(-5, 5));
            const b = A.map((row) => row.reduce((s, a, j) => s + a * xTrue[j], 0));
            const x = env.solve(A, b);
            expect(near(x, xTrue, 1e-7)).toBe(true);
          }, { runs: 120 });
        }),
        hid('partial pivoting: a tiny leading pivot must not wreck the answer', ({ env, expect }) => {
          const x = env.solve([[1e-18, 1], [1, 1]], [1, 2]);
          expect(near(x, [1, 1], 1e-9)).toBe(true);
        }),
        perf('100×100 system in O(n³)', async ({ env, expect, measure, rng }) => {
          const r = rng(5);
          const n = 100;
          const A = randMat(r, n, n, -3, 3);
          for (let i = 0; i < n; i++) A[i][i] += 400;
          const b = Array.from({ length: n }, () => r.int(-9, 9));
          const { value, steps } = await measure(() => env.solve(A, b), { budget: 20_000_000 });
          expect(value).not.toBe(null);
          expect(steps).toBeLessThan(n ** 3 * 2);
        }),
      ],
      hints: ['Build the augmented matrix `[A | b]` (a copy!).', 'For each column, find the row at/below with the largest `Math.abs` value, swap it into place and return `null` if it is below `1e-12`.', 'Eliminate below: `factor = M[r][c] / M[c][c]`, then `M[r][k] -= factor * M[c][k]` for `k` from `c` to `n`.', 'Back-substitute from the last row up: `x[i] = (M[i][n] - Σ_{j>i} M[i][j]·x[j]) / M[i][i]`.'],
      why: 'This routine (as LU/QR) underlies least squares, Kalman filters, simulation and circuit solvers.',
    }),

    lab({
      id: 'm1-det',
      title: 'Determinant by elimination',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['determinant'],
      prompt: `\`det(A)\` — the determinant of a square matrix in **O(n³)** (the cofactor expansion is O(n!) and the budget will stop it): eliminate with partial pivoting, multiply the pivots, and flip the sign for every row swap. A singular matrix returns \`0\`. Don't mutate \`A\`.`,
      expose: ['det'],
      files: jsFile(`function det(A) {\n  \n}\n`, `function det(A) {
  const n = A.length;
  const M = A.map((row) => [...row]);
  let sign = 1;
  let d = 1;
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
    if (Math.abs(M[pivot][c]) < 1e-12) return 0;
    if (pivot !== c) {
      [M[c], M[pivot]] = [M[pivot], M[c]];
      sign = -sign;
    }
    d *= M[c][c];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k < n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return sign * d;
}
`),
      tests: [
        ex('2×2 and 3×3', ({ env, expect }) => {
          expect(env.det([[3, 1], [4, 2]])).toBeNear(2, { abs: 1e-9 });
          expect(env.det([[2, 0, 0], [1, 3, 0], [5, 7, 4]])).toBeNear(24, { abs: 1e-9 });
          expect(env.det([[6, 1, 1], [4, -2, 5], [2, 8, 7]])).toBeNear(-306, { abs: 1e-8 });
        }),
        ex('identity and a singular matrix', ({ env, expect }) => {
          expect(env.det([[1, 0], [0, 1]])).toBeNear(1);
          expect(env.det([[1, 2], [2, 4]])).toBe(0);
          expect(env.det([[5]])).toBeNear(5);
        }),
        ex('a row swap flips the sign', ({ env, expect }) => {
          expect(env.det([[0, 1], [1, 0]])).toBeNear(-1, { abs: 1e-9 });
          expect(env.det([[0, 2, 0], [3, 0, 0], [0, 0, 4]])).toBeNear(-24, { abs: 1e-9 });
        }),
        prop('property: det(AB) = det(A)·det(B) and det(Aᵀ) = det(A)', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 4), gen.int(1, 9999)], (n: number, seed: number) => {
            const r = new Rng(seed);
            const A = randMat(r, n, n, -3, 3), B = randMat(r, n, n, -3, 3);
            const tr = A[0].map((_, j) => A.map((row) => row[j]));
            expect(env.det(mm(A, B))).toBeNear(env.det(A) * env.det(B), { abs: 1e-6, rel: 1e-8 });
            expect(env.det(tr)).toBeNear(env.det(A), { abs: 1e-8, rel: 1e-8 });
          }, { runs: 120 });
        }),
        perf('a 60×60 determinant', async ({ env, expect, measure, rng }) => {
          const r = rng(7);
          const A = randMat(r, 60, 60, -2, 2);
          const { steps } = await measure(() => env.det(A), { budget: 8_000_000 });
          expect(steps).toBeLessThan(60 ** 3 * 2);
        }),
      ],
      hints: ['Run the same elimination as `solve`, but just track `d *= pivot`.', 'Every row swap multiplies the determinant by −1.', 'If no usable pivot exists in a column the determinant is 0.'],
    }),
  ],
  references: [
    { title: 'Gilbert Strang — Introduction to Linear Algebra / MIT 18.06 (OpenCourseWare)', url: 'https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/' },
    { title: '3Blue1Brown — Essence of Linear Algebra (video series)', url: 'https://www.3blue1brown.com/topics/linear-algebra' },
  ],
};
export default mod;
