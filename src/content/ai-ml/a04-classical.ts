import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';
import { Rng } from '../../grader/rng';

const mod: Module = {
  id: 'classical-ml',
  course: 'ai-ml',
  title: 'Classical ML: k-NN, k-Means, Decision Trees',
  minutes: 100,
  objectives: [
    'Implement k-nearest-neighbours and understand the curse of dimensionality',
    'Cluster data with k-means (Lloyd\'s algorithm) and know its failure modes',
    'Grow a decision tree by greedily minimising Gini impurity',
    'Choose between simple models, and know when trees/ensembles beat neural networks',
  ],
  body: `
## Why bother with "classical" methods?

On **tabular data** (spreadsheets, logs, features) gradient-boosted trees (XGBoost, LightGBM) still routinely beat neural networks. They need little tuning, handle mixed feature types and missing values, train in minutes and are partly interpretable. And the ideas — distance, clustering, greedy splitting, ensembling — recur everywhere (embedding search is k-NN; vector quantisation is k-means).

## k-Nearest Neighbours (k-NN)

**Lazy learning:** store the training set; to classify $x$, find the $k$ closest training points and take a **majority vote** (or average for regression).

- **Distance:** Euclidean $\\lVert a-b\\rVert_2$ is the default; Manhattan, cosine, or learned metrics when appropriate. **Standardise features** first or one large-scale feature dominates the distance.
- **Choosing $k$:** small $k$ → low bias, high variance (jagged boundary, sensitive to noise); large $k$ → smooth, but may blur classes. Pick by cross-validation; an odd $k$ avoids ties in 2-class problems.
- **Cost:** prediction is $O(nd)$ naïvely — fast training, slow serving. Use k-d trees (low dimension), or **approximate nearest neighbour** indexes (HNSW, IVF, ScaNN) for embeddings; this is the engine of vector databases.
- **Curse of dimensionality:** in high dimensions all points become nearly equidistant, so "nearest" loses meaning; k-NN needs lots of data or dimensionality reduction.

## k-Means clustering

Unsupervised: partition $n$ points into $k$ clusters minimising the **within-cluster sum of squares** $\\sum_j\\sum_{x\\in C_j}\\lVert x-\\mu_j\\rVert^2$. **Lloyd's algorithm** alternates:

1. **Assign** every point to its nearest centroid.
2. **Update** each centroid to the mean of its assigned points.

repeat until assignments stop changing. Each step cannot increase the objective, so it converges — but only to a **local** minimum that depends on the initial centroids. Mitigations: run many restarts and keep the best; **k-means++** initialisation (pick far-apart seeds). Limits: you must choose $k$ (use the "elbow", silhouette score, or domain knowledge); assumes roughly spherical, similar-size clusters; sensitive to scale and outliers. Uses: customer segmentation, colour quantisation, vector quantisation (compression, product quantisation in ANN search), initialising mixture models.

## Decision trees

A tree of yes/no questions on features ("age < 30?") that ends in leaves with predictions. Trained **greedily, top-down**: at each node try every feature and threshold, pick the **split that most reduces impurity**, then recurse on each side.

**Gini impurity** of a node with class proportions $p_c$: $G=1-\\sum_c p_c^2$ — the chance two random draws from the node have different labels (0 = pure). A split's quality is the **weighted** impurity of its children: $\\frac{n_L}{n}G_L+\\frac{n_R}{n}G_R$ — lower is better. (Entropy $-\\sum p_c\\ln p_c$ works similarly; regression trees minimise variance.)

To find the best threshold for one feature **efficiently**: sort by the feature, sweep once while updating class counts — $O(n\\log n)$ per feature, instead of $O(n^2)$.

**Overfitting:** an unrestricted tree memorises the data (one leaf per example). Limit **max depth**, require a **minimum leaf size**, require a **minimum impurity decrease**, or prune.

**Ensembles fix the variance:**
- **Random forest** — many deep trees on bootstrap samples with random feature subsets; average the votes.
- **Gradient boosting** — add shallow trees sequentially, each fitting the *errors* of the ensemble so far.

\`\`\`js run
// Gini impurity: 0 when pure, 0.5 for a 50/50 binary node
const gini = (labels) => { const n = labels.length; const c = {}; labels.forEach((l) => (c[l] = (c[l] || 0) + 1)); return 1 - Object.values(c).reduce((s, k) => s + (k / n) ** 2, 0); };
console.log(gini([1, 1, 1, 1]), gini([0, 1, 0, 1]), gini([0, 0, 0, 1]).toFixed(3));
\`\`\`

:::interview
"k-NN vs logistic regression vs a decision tree?" — Discuss bias/variance, training vs prediction cost, feature scaling needs, interpretability, handling of non-linearity and categorical features, and what you'd try first on a new tabular problem (a well-regularised gradient-boosted tree).
:::

:::warn
Never evaluate k-NN on its own training points (each point is its own nearest neighbour). And watch for **data leakage through duplicates**: near-duplicates in train and test make k-NN look magical.
:::
`,
  quiz: [
    { q: 'You use k-NN on features "age (0–100)" and "income (0–200,000)" without scaling. What happens?', options: ['Nothing', 'Income dominates the distance so age is effectively ignored', 'Age dominates', 'The algorithm fails'], answer: 1, why: 'Standardise features so each contributes comparably.' },
    { q: 'Why can k-means give different answers on different runs?', options: ['It is non-deterministic by design', 'It converges to a local optimum that depends on the random initial centroids', 'JavaScript Math.random changes', 'It has bugs'], answer: 1, why: 'Use restarts or k-means++ initialisation.' },
    { q: 'A decision tree with unlimited depth on noisy data will…', options: ['Underfit', 'Overfit: it can memorise the training set', 'Be perfect on new data', 'Run out of features'], answer: 1, why: 'Limit depth, leaf size, or use an ensemble.' },
    { q: 'What is the Gini impurity of a node with 50% class A and 50% class B?', options: ['0', '0.5', '1', '0.25'], answer: 1, why: '1 − (0.5² + 0.5²) = 0.5.' },
    { q: 'What does a random forest do to reduce the variance of single trees?', options: ['Uses one huge tree', 'Averages many decorrelated trees trained on bootstrap samples and random feature subsets', 'Removes features', 'Increases depth'], answer: 1, why: 'Averaging decorrelated high-variance models reduces variance.' },
  ],
  labs: [
    lab({
      id: 'ai4-knn',
      title: 'k-nearest neighbours',
      kind: 'code',
      difficulty: 2,
      minutes: 20,
      tags: ['knn'],
      prompt: `Implement:

- \`euclidean(a, b)\` — straight-line distance between equal-length numeric arrays.
- \`knnPredict(trainX, trainY, query, k)\` — classify \`query\` by a **majority vote** among its \`k\` nearest training points. **Ties** in the vote go to the class whose voting neighbours have the **smaller total distance**; if still tied, the smaller label (compare with \`<\`).
- \`knnPredictMany(trainX, trainY, queries, k)\` — classify each query.

Don't mutate the inputs. \`k\` larger than the training set uses every point.`,
      expose: ['euclidean', 'knnPredict', 'knnPredictMany'],
      files: jsFile(`function euclidean(a, b) {\n  \n}\n\nfunction knnPredict(trainX, trainY, query, k) {\n  \n}\n\nfunction knnPredictMany(trainX, trainY, queries, k) {\n  \n}\n`, `function euclidean(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

function knnPredict(trainX, trainY, query, k) {
  const neighbours = trainX.map((x, i) => ({ d: euclidean(x, query), y: trainY[i], i }));
  neighbours.sort((p, q) => p.d - q.d || p.i - q.i);
  const top = neighbours.slice(0, Math.min(k, neighbours.length));
  const votes = new Map();
  for (const n of top) {
    const v = votes.get(n.y) || { count: 0, dist: 0 };
    v.count++;
    v.dist += n.d;
    votes.set(n.y, v);
  }
  let best = null;
  for (const [label, v] of votes) {
    if (best === null || v.count > best.v.count || (v.count === best.v.count && (v.dist < best.v.dist || (v.dist === best.v.dist && label < best.label)))) best = { label, v };
  }
  return best.label;
}

function knnPredictMany(trainX, trainY, queries, k) {
  return queries.map((q) => knnPredict(trainX, trainY, q, k));
}
`),
      tests: [
        ex('euclidean distance', ({ env, expect }) => {
          expect(env.euclidean([0, 0], [3, 4])).toBe(5);
          expect(env.euclidean([1, 2, 3], [1, 2, 3])).toBe(0);
        }),
        ex('classifies two obvious clusters', ({ env, expect }) => {
          const X = [[0, 0], [0, 1], [1, 0], [10, 10], [10, 11], [11, 10]];
          const y = ['a', 'a', 'a', 'b', 'b', 'b'];
          expect(env.knnPredict(X, y, [0.5, 0.5], 3)).toBe('a');
          expect(env.knnPredict(X, y, [10.2, 10.4], 3)).toBe('b');
          expect(env.knnPredictMany(X, y, [[0, 0], [11, 11]], 1)).toEqual(['a', 'b']);
        }),
        ex('k = 1 is the nearest neighbour; larger k smooths out an outlier', ({ env, expect }) => {
          const X = [[0], [1], [2], [3], [1.1]];
          const y = [0, 0, 0, 0, 1]; // the point at 1.1 is a noisy "1"
          expect(env.knnPredict(X, y, [1.12], 1)).toBe(1);
          expect(env.knnPredict(X, y, [1.12], 5)).toBe(0);
        }),
        ex('vote ties are broken by total distance, then by label', ({ env, expect }) => {
          const X = [[0], [3]];
          expect(env.knnPredict(X, ['near', 'far'], [1], 2)).toBe('near'); // 1 vote each; near is closer
          expect(env.knnPredict([[1], [1]], [2, 1], [1], 2)).toBe(1); // exact tie → smaller label
        }),
        ex('k larger than the training set is fine; inputs are not mutated', ({ env, expect }) => {
          const X = [[1], [2]], y = [1, 1];
          expect(env.knnPredict(X, y, [5], 99)).toBe(1);
          expect(X).toEqual([[1], [2]]);
          expect(y).toEqual([1, 1]);
        }),
        prop('property: matches a reference implementation on random blobs', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 9999), gen.int(1, 7)], (seed: number, k: number) => {
            const r = new Rng(seed);
            const X: number[][] = [], y: number[] = [];
            for (let i = 0; i < 30; i++) { const c = i % 3; X.push([r.normal(c * 2, 1), r.normal(c, 1)]); y.push(c); }
            const q = [r.normal(2, 2), r.normal(1, 2)];
            const order = X.map((x, i) => ({ i, d: Math.hypot(x[0] - q[0], x[1] - q[1]) })).sort((a, b) => a.d - b.d || a.i - b.i).slice(0, k);
            const votes = new Map<number, { c: number; d: number }>();
            order.forEach((o) => { const v = votes.get(y[o.i]) ?? { c: 0, d: 0 }; v.c++; v.d += o.d; votes.set(y[o.i], v); });
            const want = [...votes.entries()].sort((a, b) => b[1].c - a[1].c || a[1].d - b[1].d || a[0] - b[0])[0][0];
            expect(env.knnPredict(X, y, q, k)).toBe(want);
          }, { runs: 150 });
        }),
        perf('500 training points × 200 queries', async ({ env, expect, measure, rng }) => {
          const r = rng(3);
          const X = Array.from({ length: 500 }, () => [r.normal(), r.normal(), r.normal()]);
          const y = X.map((x) => (x[0] > 0 ? 1 : 0));
          const Q = Array.from({ length: 200 }, () => [r.normal(), r.normal(), r.normal()]);
          const { steps } = await measure(() => env.knnPredictMany(X, y, Q, 5), { budget: 30_000_000 });
          expect(steps).toBeLessThan(200 * 500 * 20);
        }),
      ],
      hints: ['Compute the distance from `query` to every training point; keep `{ d, label }`.', 'Sort by distance (break equal distances by original index for determinism) and take the first `k`.', 'Tally votes per label together with the sum of distances; pick the label with the most votes, then the smaller total distance, then the smaller label.'],
    }),

    lab({
      id: 'ai4-kmeans',
      title: 'k-means (Lloyd\'s algorithm)',
      kind: 'code',
      difficulty: 3,
      minutes: 30,
      tags: ['clustering'],
      interview: true,
      prompt: `Implement \`kmeans(points, k, { rand, maxIter = 100 })\` → \`{ centroids, assignments, iterations, inertia }\`.

- **Initialisation:** pick \`k\` distinct points as the starting centroids using \`rand\` (a function returning floats in [0,1)): shuffle the indices with Fisher–Yates and take the first \`k\`.
- Repeat up to \`maxIter\`: **assign** each point to its nearest centroid (ties → the lower centroid index); **update** each centroid to the **mean** of its points. An **empty cluster** keeps its previous centroid. Stop when no assignment changes.
- \`iterations\` — number of assignment passes performed; \`inertia\` — Σ squared distance from each point to its centroid.
- \`k > points.length\` or \`k < 1\` throws a \`RangeError\`.`,
      expose: ['kmeans'],
      files: jsFile(`function kmeans(points, k, { rand, maxIter = 100 } = {}) {\n  \n}\n`, `function kmeans(points, k, { rand = Math.random, maxIter = 100 } = {}) {
  if (!(k >= 1) || k > points.length) throw new RangeError('k must be between 1 and the number of points');
  const idx = points.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  let centroids = idx.slice(0, k).map((i) => [...points[i]]);
  const dim = points[0].length;
  const dist2 = (a, b) => {
    let s = 0;
    for (let d = 0; d < dim; d++) s += (a[d] - b[d]) ** 2;
    return s;
  };
  let assignments = new Array(points.length).fill(-1);
  let iterations = 0;
  for (let it = 0; it < maxIter; it++) {
    iterations++;
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist2(points[i], centroids[c]);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed = true;
      }
    }
    if (!changed) break;
    const sums = Array.from({ length: k }, () => new Array(dim).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < points.length; i++) {
      counts[assignments[i]]++;
      for (let d = 0; d < dim; d++) sums[assignments[i]][d] += points[i][d];
    }
    centroids = centroids.map((old, c) => (counts[c] === 0 ? old : sums[c].map((s) => s / counts[c])));
  }
  let inertia = 0;
  for (let i = 0; i < points.length; i++) inertia += dist2(points[i], centroids[assignments[i]]);
  return { centroids, assignments, iterations, inertia };
}
`),
      tests: [
        ex('finds three well-separated blobs', ({ env, expect, rng }) => {
          const r = rng(1);
          const pts: number[][] = [];
          for (const [cx, cy] of [[0, 0], [10, 10], [-10, 10]]) for (let i = 0; i < 30; i++) pts.push([r.normal(cx, 0.6), r.normal(cy, 0.6)]);
          // a few restarts; a poor random start can occasionally merge two blobs
          let best: any = null;
          for (let s = 1; s <= 8; s++) { const rr = rng(s); const res = env.kmeans(pts, 3, { rand: () => rr.float() }); if (!best || res.inertia < best.inertia) best = res; }
          const centres = best.centroids.map((c: number[]) => c.map(Math.round)).sort((a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1]);
          expect(centres).toEqual([[-10, 10], [0, 0], [10, 10]]);
        }),
        ex('assignments are consistent with the centroids (every point is closest to its own)', ({ env, expect, rng }) => {
          const r = rng(4);
          const pts = Array.from({ length: 80 }, () => [r.normal(), r.normal()]);
          const rr = rng(2);
          const { centroids, assignments } = env.kmeans(pts, 4, { rand: () => rr.float() });
          pts.forEach((p, i) => {
            const d = centroids.map((c: number[]) => Math.hypot(p[0] - c[0], p[1] - c[1]));
            expect(d[assignments[i]]).toBeLessThanOrEqual(Math.min(...d) + 1e-9);
          });
        }),
        ex('each centroid is the mean of its cluster, and inertia matches', ({ env, expect, rng }) => {
          const r = rng(6);
          const pts = Array.from({ length: 60 }, () => [r.normal() * 3, r.normal() * 3]);
          const rr = rng(3);
          const { centroids, assignments, inertia } = env.kmeans(pts, 3, { rand: () => rr.float(), maxIter: 200 });
          let total = 0;
          for (let c = 0; c < 3; c++) {
            const mine = pts.filter((_, i) => assignments[i] === c);
            if (!mine.length) continue;
            const mean = [0, 1].map((d) => mine.reduce((s, p) => s + p[d], 0) / mine.length);
            expect(centroids[c][0]).toBeNear(mean[0], { abs: 1e-9 });
            expect(centroids[c][1]).toBeNear(mean[1], { abs: 1e-9 });
            total += mine.reduce((s, p) => s + (p[0] - mean[0]) ** 2 + (p[1] - mean[1]) ** 2, 0);
          }
          expect(inertia).toBeNear(total, { abs: 1e-6, rel: 1e-9 });
        }),
        ex('k = 1 gives the global mean; k = n gives zero inertia', ({ env, expect, rng }) => {
          const rr = rng(1);
          const pts = [[0, 0], [2, 0], [4, 6]];
          expect(env.kmeans(pts, 1, { rand: () => rr.float() }).centroids[0]).toEqual([2, 2]);
          expect(env.kmeans(pts, 3, { rand: () => rr.float() }).inertia).toBeNear(0, { abs: 1e-12 });
        }),
        ex('invalid k throws a RangeError', ({ env, expect }) => {
          expect(() => env.kmeans([[1]], 2, { rand: Math.random })).toThrow();
          expect(() => env.kmeans([[1]], 0, { rand: Math.random })).toThrow();
        }),
        ex('the same seed gives the same result; inputs are not mutated', ({ env, expect, rng }) => {
          const pts = [[0, 0], [1, 1], [9, 9], [10, 10], [5, 5]];
          const copy = JSON.stringify(pts);
          const a = rng(8), b = rng(8);
          const r1 = env.kmeans(pts, 2, { rand: () => a.float() });
          const r2 = env.kmeans(pts, 2, { rand: () => b.float() });
          expect(r1.assignments).toEqual(r2.assignments);
          expect(JSON.stringify(pts)).toBe(copy);
        }),
        hid('converges: stops when assignments stop changing (iterations < maxIter on easy data)', ({ env, expect, rng }) => {
          const r = rng(2);
          const pts = [...Array.from({ length: 20 }, () => [r.normal(0, 0.3)]), ...Array.from({ length: 20 }, () => [r.normal(20, 0.3)])];
          const rr = rng(5);
          expect(env.kmeans(pts, 2, { rand: () => rr.float(), maxIter: 100 }).iterations).toBeLessThan(15);
        }),
      ],
      hints: ['Initial centroids: Fisher–Yates shuffle the indices with `rand`, take the first `k`, and **copy** those points.', 'Assignment step: for each point find the centroid with the smallest squared distance (strict `<` keeps the lower index on ties) and remember whether anything changed.', 'Update step: accumulate sums and counts per cluster; new centroid = sum/count; an empty cluster keeps its old centroid.', 'Compute `inertia` after the loop from the final centroids.'],
    }),

    lab({
      id: 'ai4-tree',
      title: 'A decision tree classifier (Gini)',
      kind: 'code',
      difficulty: 4,
      minutes: 45,
      tags: ['decision-tree'],
      interview: true,
      prompt: `Implement:

- \`gini(labels)\` — Gini impurity \`1 − Σ pᶜ²\` (0 for an empty array).
- \`bestSplit(X, y)\` → \`{ feature, threshold, impurity }\` — over all features and all candidate thresholds (the **midpoint between consecutive distinct sorted values**), the split \`x[feature] <= threshold\` with the **lowest weighted child impurity**; ties → lower feature index, then lower threshold. Return \`null\` if no split separates the data (all rows identical in every feature).
- \`buildTree(X, y, { maxDepth = 3, minLeaf = 1 } = {})\` — grow greedily. A node becomes a **leaf** (\`{ leaf: true, label }\`, majority label, ties → smaller label) when it is pure, \`depth === maxDepth\`, there is no valid split, or a split would leave fewer than \`minLeaf\` rows on a side. Internal nodes: \`{ feature, threshold, left, right }\` (\`left\` = rows with value \`<= threshold\`).
- \`predictTree(tree, x)\`.`,
      expose: ['gini', 'bestSplit', 'buildTree', 'predictTree'],
      files: jsFile(`function gini(labels) {\n  \n}\n\nfunction bestSplit(X, y) {\n  \n}\n\nfunction buildTree(X, y, { maxDepth = 3, minLeaf = 1 } = {}) {\n  \n}\n\nfunction predictTree(tree, x) {\n  \n}\n`, `function gini(labels) {
  if (labels.length === 0) return 0;
  const counts = new Map();
  for (const l of labels) counts.set(l, (counts.get(l) || 0) + 1);
  let s = 0;
  for (const c of counts.values()) s += (c / labels.length) ** 2;
  return 1 - s;
}

function bestSplit(X, y, minLeaf = 1) {
  const n = X.length;
  let best = null;
  for (let f = 0; f < X[0].length; f++) {
    const order = X.map((_, i) => i).sort((a, b) => X[a][f] - X[b][f]);
    const total = new Map();
    for (const l of y) total.set(l, (total.get(l) || 0) + 1);
    const left = new Map();
    for (let i = 0; i < n - 1; i++) {
      const idx = order[i];
      left.set(y[idx], (left.get(y[idx]) || 0) + 1);
      const v = X[idx][f];
      const next = X[order[i + 1]][f];
      if (v === next) continue;
      const nl = i + 1;
      const nr = n - nl;
      if (nl < minLeaf || nr < minLeaf) continue;
      let gl = 1;
      let gr = 1;
      for (const [label, c] of left) gl -= (c / nl) ** 2;
      for (const [label, c] of total) gr -= ((c - (left.get(label) || 0)) / nr) ** 2;
      const impurity = (nl / n) * gl + (nr / n) * gr;
      if (best === null || impurity < best.impurity - 1e-12) best = { feature: f, threshold: (v + next) / 2, impurity };
    }
  }
  return best;
}

function majority(y) {
  const c = new Map();
  for (const l of y) c.set(l, (c.get(l) || 0) + 1);
  let best = null;
  for (const [l, k] of c) if (best === null || k > best.k || (k === best.k && l < best.l)) best = { l, k };
  return best.l;
}

function buildTree(X, y, { maxDepth = 3, minLeaf = 1 } = {}, depth = 0) {
  if (gini(y) === 0 || depth >= maxDepth) return { leaf: true, label: majority(y) };
  const split = bestSplit(X, y, minLeaf);
  if (!split) return { leaf: true, label: majority(y) };
  const li = [];
  const ri = [];
  X.forEach((row, i) => (row[split.feature] <= split.threshold ? li : ri).push(i));
  return {
    feature: split.feature,
    threshold: split.threshold,
    left: buildTree(li.map((i) => X[i]), li.map((i) => y[i]), { maxDepth, minLeaf }, depth + 1),
    right: buildTree(ri.map((i) => X[i]), ri.map((i) => y[i]), { maxDepth, minLeaf }, depth + 1),
  };
}

function predictTree(tree, x) {
  let node = tree;
  while (!node.leaf) node = x[node.feature] <= node.threshold ? node.left : node.right;
  return node.label;
}
`),
      tests: [
        ex('gini impurity', ({ env, expect }) => {
          expect(env.gini([])).toBe(0);
          expect(env.gini([1, 1, 1])).toBe(0);
          expect(env.gini([0, 1, 0, 1])).toBeNear(0.5);
          expect(env.gini(['a', 'a', 'a', 'b'])).toBeNear(0.375);
          expect(env.gini([0, 1, 2])).toBeNear(2 / 3, { abs: 1e-12 });
        }),
        ex('bestSplit finds the separating threshold (midpoint)', ({ env, expect }) => {
          const X = [[1], [2], [3], [10], [11], [12]];
          const y = [0, 0, 0, 1, 1, 1];
          expect(env.bestSplit(X, y)).toEqual({ feature: 0, threshold: 6.5, impurity: 0 });
        }),
        ex('bestSplit chooses the informative feature', ({ env, expect }) => {
          const X = [[5, 1], [3, 2], [8, 3], [1, 4], [9, 5], [2, 6]];
          const y = [0, 0, 0, 1, 1, 1]; // only feature 1 separates the classes
          const s = env.bestSplit(X, y);
          expect(s.feature).toBe(1);
          expect(s.threshold).toBe(3.5);
        }),
        ex('bestSplit returns null when no split is possible', ({ env, expect }) => expect(env.bestSplit([[1, 1], [1, 1]], [0, 1])).toBe(null)),
        ex('a tree fits XOR with depth 2 but not depth 1', ({ env, expect }) => {
          const X = [[0, 0], [0, 1], [1, 0], [1, 1]];
          const y = [0, 1, 1, 0];
          const deep = env.buildTree(X, y, { maxDepth: 2 });
          expect(X.map((x) => env.predictTree(deep, x))).toEqual(y);
          const stump = env.buildTree(X, y, { maxDepth: 1 });
          expect(X.map((x) => env.predictTree(stump, x))).not.toEqual(y);
        }),
        ex('structure: pure data is a single leaf; maxDepth 0 is a majority leaf', ({ env, expect }) => {
          expect(env.buildTree([[1], [2]], [7, 7])).toEqual({ leaf: true, label: 7 });
          expect(env.buildTree([[1], [2], [3]], [0, 1, 1], { maxDepth: 0 })).toEqual({ leaf: true, label: 1 });
        }),
        ex('minLeaf prevents tiny leaves: a lone outlier cannot get its own leaf', ({ env, expect }) => {
          const X = [[1], [2], [3], [4], [100]];
          const y = [0, 0, 0, 0, 1];
          expect(env.predictTree(env.buildTree(X, y, { maxDepth: 5, minLeaf: 1 }), [100])).toBe(1);
          expect(env.predictTree(env.buildTree(X, y, { maxDepth: 5, minLeaf: 2 }), [100])).toBe(0);
        }),
        prop('property: a deep enough tree memorises any consistent training set', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 9999)], (seed: number) => {
            const r = new Rng(seed);
            const X = Array.from({ length: 30 }, () => [r.float(), r.float(), r.float()]);
            const y = X.map((x) => (x[0] + x[1] > 1 ? 1 : 0));
            const t = env.buildTree(X, y, { maxDepth: 30 });
            expect(X.every((x, i) => env.predictTree(t, x) === y[i])).toBe(true);
          }, { runs: 40 });
        }),
        hid('generalises a simple rule on fresh data (axis-aligned threshold)', ({ env, expect, rng }) => {
          const r = rng(9);
          const mk = (n: number) => Array.from({ length: n }, () => [r.float() * 10, r.float() * 10]);
          const Xtr = mk(200), Xte = mk(200);
          const rule = (x: number[]) => (x[0] > 4 ? 1 : 0);
          const tree = env.buildTree(Xtr, Xtr.map(rule), { maxDepth: 2 });
          const acc = Xte.filter((x) => env.predictTree(tree, x) === rule(x)).length / Xte.length;
          expect(acc).toBeGreaterThan(0.97);
        }),
        perf('building a depth-4 tree on 1,000 rows × 4 features sorts once per feature per node', async ({ env, expect, measure, rng }) => {
          const r = rng(5);
          const X = Array.from({ length: 1000 }, () => [r.float(), r.float(), r.float(), r.float()]);
          const y = X.map((x) => (x[0] * 2 + x[2] > 1.2 ? 1 : 0));
          const { steps } = await measure(() => env.buildTree(X, y, { maxDepth: 4 }), { budget: 80_000_000 });
          expect(steps).toBeLessThan(40_000_000);
        }),
      ],
      hints: [
        '`gini`: count each label, then `1 − Σ (count/n)²`.',
        '`bestSplit`: for each feature sort the row indices by that feature. Sweep left→right moving one row at a time from the right side to the left, updating **class counts**; a candidate threshold exists between two **distinct** neighbouring values (use their midpoint).',
        'Weighted impurity = `(nl/n)·gini(left) + (nr/n)·gini(right)`. Keep the best (strictly lower wins, so ties stay with the earlier feature/threshold).',
        '`buildTree`: stop (leaf with the **majority label**) when the node is pure, `depth` has reached `maxDepth`, or `bestSplit` returns `null`; otherwise split the rows into `<= threshold` and `> threshold` and recurse.',
      ],
    }),
  ],
  references: [
    { title: 'Classification and Regression Trees — Breiman, Friedman, Olshen, Stone, 1984' },
    { title: 'XGBoost: A Scalable Tree Boosting System — Chen & Guestrin, KDD 2016' },
    { title: 'k-means++: The Advantages of Careful Seeding — Arthur & Vassilvitskii, 2007' },
  ],
};
export default mod;
