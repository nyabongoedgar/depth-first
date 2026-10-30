import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';
import { Rng } from '../../grader/rng';

const matClose = (A: number[][], B: number[][], tol = 1e-9) => A.length === B.length && A.every((row, i) => row.length === B[i].length && row.every((v, j) => Math.abs(v - B[i][j]) <= tol * Math.max(1, Math.abs(B[i][j]))));

const mod: Module = {
  id: 'deep-learning-ops',
  course: 'ai-ml',
  title: 'Deep Learning Building Blocks: Softmax, Convolution, Attention',
  minutes: 110,
  objectives: [
    'Compute softmax and cross-entropy in a numerically stable way',
    'Implement 2-D convolution and pooling and reason about output shapes and parameter counts',
    'Implement scaled dot-product attention (with causal masking) and layer normalisation',
    'Explain how CNNs and Transformers use these operations for vision and language',
  ],
  body: `
## Softmax and cross-entropy

A classifier's last layer produces a vector of **logits** $z\\in\\mathbb{R}^C$ (one real number per class). **Softmax** turns them into a probability distribution:
$$\\operatorname{softmax}(z)_i=\\frac{e^{z_i}}{\\sum_j e^{z_j}}$$
The loss for a one-hot target $t$ is the **cross-entropy**: $L=-\\ln p_t$ — large when the model gives the true class a small probability. Combined, the gradient with respect to the logits is the beautifully simple $p-\\text{onehot}(t)$.

**Numerical stability is not optional.** $e^{1000}=\\infty$ in floating point, so the textbook formula produces \`NaN\`. Softmax is invariant to subtracting a constant from every logit, so subtract $\\max(z)$ first:
$$\\operatorname{softmax}(z)_i=\\frac{e^{z_i-m}}{\\sum_j e^{z_j-m}},\\quad m=\\max_j z_j$$
and compute the loss without ever forming probabilities, via the **log-sum-exp** trick: $\\ln\\sum_j e^{z_j}=m+\\ln\\sum_j e^{z_j-m}$, so $L=\\operatorname{logsumexp}(z)-z_t$. (This is what \`nn.CrossEntropyLoss\` does internally.)

\`\`\`js run
const naive = (z) => { const e = z.map(Math.exp); const s = e.reduce((a, b) => a + b); return e.map((v) => v / s); };
const stable = (z) => { const m = Math.max(...z); const e = z.map((v) => Math.exp(v - m)); const s = e.reduce((a, b) => a + b); return e.map((v) => v / s); };
console.log(naive([1000, 1001, 999]));    // [NaN, NaN, NaN]
console.log(stable([1000, 1001, 999]).map((p) => +p.toFixed(4)));
\`\`\`

## Convolution: sharing weights across space

A fully-connected layer on a 224×224×3 image would need ~150k weights **per output unit**. A **convolution** slides a small **kernel** (say 3×3) over the image and computes a dot product at every position:
$$\\text{out}[i,j]=\\sum_{a,b}\\text{kernel}[a,b]\\cdot\\text{in}[i\\,s+a,\\ j\\,s+b]$$
(Deep-learning "convolution" is actually **cross-correlation** — the kernel isn't flipped.) Why it works for images:

- **Locality** — a pixel relates mostly to its neighbours.
- **Translation equivariance** — a cat detector shouldn't care where the cat is, so reuse **the same weights** everywhere.
- **Few parameters** — a 3×3 kernel has 9 weights regardless of image size.

Hyper-parameters: **stride** $s$ (step size; stride 2 halves the resolution), **padding** $p$ (zeros added around the border so edges aren't lost), **kernel size** $k$. **Output size:**
$$\\left\\lfloor\\frac{H+2p-k}{s}\\right\\rfloor+1$$
A conv layer with $C_{\\text{in}}$ input and $C_{\\text{out}}$ output channels has $k\\cdot k\\cdot C_{\\text{in}}\\cdot C_{\\text{out}}+C_{\\text{out}}$ parameters. Early layers learn edges and colours; deeper ones textures, parts and objects. The **receptive field** (how many input pixels influence one output) grows with depth.

**Pooling** (max or average over e.g. 2×2 windows, stride 2) reduces resolution, adds small-shift invariance and lowers compute. Modern CNNs (ResNet, EfficientNet, ConvNeXt) add **batch norm**, **residual connections** (\`y = x + f(x)\`, letting gradients flow through 100+ layers) and strided convs instead of pooling. Vision systems for autonomy use CNN/transformer backbones for detection, segmentation, depth and occupancy.

## Attention and the Transformer

Sequences (text, audio, tokens of an image) need each element to **look at other elements**. **Scaled dot-product attention** does that with three matrices: **queries** $Q$, **keys** $K$, **values** $V$ (each row = one position):
$$\\operatorname{Attention}(Q,K,V)=\\operatorname{softmax}\\!\\left(\\frac{QK^{\\top}}{\\sqrt{d_k}}\\right)V$$
Row $i$ of $QK^\\top$ scores how much position $i$'s query matches every key; softmax makes these **weights** sum to 1; the output is the **weighted average of the values**. The $\\sqrt{d_k}$ keeps dot products from growing with dimension and saturating the softmax.

- **Causal (masked) attention** (language models generating left→right): position $i$ may only attend to positions $\\le i$ — set the scores for $j>i$ to $-\\infty$ before softmax.
- **Multi-head attention** runs several attentions in parallel on different learned projections and concatenates.
- Cost: $O(n^2 d)$ time and $O(n^2)$ memory for sequence length $n$ — the reason long contexts are expensive and why FlashAttention, sparse and linear attention exist.
- **Positional information** must be added (sinusoidal / learned / rotary embeddings) because attention itself is permutation-invariant.

A **Transformer block** = attention + a feed-forward MLP, each wrapped in a **residual connection** and **layer normalisation**; stack dozens. Large language models (GPT-style) are decoder-only Transformers trained to predict the next token with cross-entropy.

**Layer normalisation** normalises each *vector* across its features: $\\operatorname{LN}(x)=\\dfrac{x-\\mu}{\\sqrt{\\sigma^2+\\varepsilon}}\\cdot\\gamma+\\beta$ (here with $\\gamma=1,\\beta=0$) — unlike batch norm it doesn't depend on other examples in the batch, which suits sequences.

:::warn
Shape bugs are the #1 source of deep-learning pain. Write down the shape of every tensor: \`(batch, seq, d_model)\`; check output-size formulas for conv/pool; and unit-test small cases by hand — exactly like these labs.
:::

:::interview
"Why divide by √d in attention?" — If entries of $q,k$ have unit variance, $q\\cdot k$ has variance $d$; large magnitudes push softmax into saturated regions with vanishing gradients. "Cost of self-attention?" — quadratic in sequence length.
:::
`,
  quiz: [
    { q: 'Why subtract max(z) before exponentiating in softmax?', options: ['To make probabilities sum to 1', 'To avoid overflow; softmax is unchanged by subtracting a constant', 'To speed it up', 'To make it differentiable'], answer: 1, why: 'exp of large logits overflows to Infinity and yields NaN.' },
    { q: 'A 32×32 image goes through a 5×5 convolution with stride 1 and padding 0. The output is…', options: ['32×32', '28×28', '27×27', '30×30'], answer: 1, why: '(32 − 5)/1 + 1 = 28.' },
    { q: 'How many parameters does a 3×3 conv layer with 16 input and 32 output channels (with bias) have?', options: ['288', '4,608', '4,640', '9,216'], answer: 2, why: '3·3·16·32 = 4,608 weights + 32 biases = 4,640.' },
    { q: 'In causal self-attention, which positions may token i attend to?', options: ['All positions', 'Only positions j ≤ i', 'Only j > i', 'Only itself'], answer: 1, why: 'Otherwise a language model could peek at the token it must predict.' },
    { q: 'What is the time complexity of self-attention in the sequence length n?', options: ['O(n)', 'O(n log n)', 'O(n²)', 'O(1)'], answer: 2, why: 'Every position scores every other position.' },
  ],
  labs: [
    lab({
      id: 'ai5-shapes',
      title: 'Shapes and parameter counts',
      kind: 'answer',
      difficulty: 2,
      minutes: 12,
      tags: ['cnn', 'shapes'],
      prompt: 'Work out the shapes and sizes. (Formula: output = ⌊(H + 2p − k)/s⌋ + 1.)',
      questions: [
        { id: 'a', prompt: 'Input 64×64, kernel 3×3, stride 1, padding 1. Output height?', type: 'number', answer: 64 },
        { id: 'b', prompt: 'Input 224×224, kernel 7×7, stride 2, padding 3 (ResNet\'s first layer). Output height?', type: 'number', answer: 112 },
        { id: 'c', prompt: 'Input 28×28 after a 2×2 max-pool with stride 2: output height?', type: 'number', answer: 14 },
        { id: 'd', prompt: 'Parameters of a 3×3 conv, 64 input channels → 128 output channels, **with** bias.', type: 'number', answer: 73856 },
        { id: 'e', prompt: 'Parameters of a **fully-connected** layer from a 7×7×64 feature map (flattened) to 10 classes, with bias.', type: 'number', answer: 31370 },
        { id: 'f', prompt: 'A sequence of 1,000 tokens: how many entries are in one attention weight matrix (per head)?', type: 'number', answer: 1000000 },
        { id: 'g', prompt: 'You double the sequence length. By what factor does self-attention memory grow?', type: 'number', answer: 4 },
      ],
      hints: ['Parameters = k·k·C_in·C_out + C_out.', 'Flattened size = 7·7·64 = 3,136; times 10 plus 10 biases.', 'Attention weights are n × n.'],
    }),

    lab({
      id: 'ai5-softmax',
      title: 'Stable softmax and cross-entropy',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['numerics', 'loss'],
      interview: true,
      prompt: `Implement, **numerically stable** for any finite logits:

- \`logSumExp(z)\` — \`ln Σ e^{zᵢ}\` using the max-shift trick (an empty array gives \`-Infinity\`).
- \`softmax(z)\` — probabilities summing to 1.
- \`crossEntropy(logits, target)\` — \`logSumExp(logits) − logits[target]\` (the loss for the true class index \`target\`).
- \`crossEntropyGrad(logits, target)\` — the gradient w.r.t. the logits: \`softmax(logits) − onehot(target)\`.
- \`argmax(z)\` — index of the maximum (first one on ties).`,
      expose: ['logSumExp', 'softmax', 'crossEntropy', 'crossEntropyGrad', 'argmax'],
      files: jsFile(`function logSumExp(z) {\n  \n}\n\nfunction softmax(z) {\n  \n}\n\nfunction crossEntropy(logits, target) {\n  \n}\n\nfunction crossEntropyGrad(logits, target) {\n  \n}\n\nfunction argmax(z) {\n  \n}\n`, `function logSumExp(z) {
  if (z.length === 0) return -Infinity;
  let m = -Infinity;
  for (const v of z) if (v > m) m = v;
  if (m === -Infinity) return -Infinity;
  let s = 0;
  for (const v of z) s += Math.exp(v - m);
  return m + Math.log(s);
}

function softmax(z) {
  const lse = logSumExp(z);
  return z.map((v) => Math.exp(v - lse));
}

function crossEntropy(logits, target) {
  return logSumExp(logits) - logits[target];
}

function crossEntropyGrad(logits, target) {
  const p = softmax(logits);
  p[target] -= 1;
  return p;
}

function argmax(z) {
  let best = 0;
  for (let i = 1; i < z.length; i++) if (z[i] > z[best]) best = i;
  return best;
}
`),
      tests: [
        ex('softmax of simple inputs', ({ env, expect }) => {
          const p = env.softmax([1, 2, 3]);
          expect(p[0]).toBeNear(0.09003057317038046, { abs: 1e-12 });
          expect(p[2]).toBeNear(0.6652409557748219, { abs: 1e-12 });
          expect(p.reduce((a: number, b: number) => a + b, 0)).toBeNear(1, { abs: 1e-12 });
          expect(env.softmax([0, 0, 0, 0])).toEqual([0.25, 0.25, 0.25, 0.25]);
        }),
        ex('huge logits do not overflow (the naive formula gives NaN)', ({ env, expect }) => {
          const p = env.softmax([1000, 1001, 999]);
          expect(p.every((v: number) => Number.isFinite(v))).toBe(true);
          expect(p[1]).toBeNear(0.6652409557748219, { abs: 1e-12 });
          const q = env.softmax([-1000, -1001]);
          expect(q[0]).toBeNear(0.7310585786300049, { abs: 1e-12 });
          expect(env.logSumExp([1000, 1000])).toBeNear(1000 + Math.LN2, { abs: 1e-9 });
        }),
        ex('logSumExp edge cases', ({ env, expect }) => {
          expect(env.logSumExp([])).toBe(-Infinity);
          expect(env.logSumExp([5])).toBe(5);
          expect(env.logSumExp([0, 0])).toBeNear(Math.LN2, { abs: 1e-12 });
        }),
        ex('cross-entropy: confident right, uniform, confident wrong', ({ env, expect }) => {
          expect(env.crossEntropy([10, 0, 0], 0)).toBeLessThan(1e-3);
          expect(env.crossEntropy([0, 0, 0, 0], 2)).toBeNear(Math.log(4), { abs: 1e-12 });
          expect(env.crossEntropy([10, 0, 0], 1)).toBeGreaterThan(9.9);
          expect(Number.isFinite(env.crossEntropy([1e4, -1e4], 1))).toBe(true);
        }),
        ex('gradient = softmax − onehot, and sums to 0', ({ env, expect }) => {
          const g = env.crossEntropyGrad([1, 2, 3], 1);
          const p = env.softmax([1, 2, 3]);
          expect(g[0]).toBeNear(p[0], { abs: 1e-12 });
          expect(g[1]).toBeNear(p[1] - 1, { abs: 1e-12 });
          expect(g.reduce((a: number, b: number) => a + b, 0)).toBeNear(0, { abs: 1e-12 });
        }),
        ex('argmax', ({ env, expect }) => {
          expect([env.argmax([1, 5, 3]), env.argmax([2, 2, 1]), env.argmax([-5, -1, -3])]).toEqual([1, 0, 1]);
        }),
        prop('property: gradient matches finite differences of the loss; softmax is shift-invariant', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-6, 6), 2, 6), gen.nat(10), gen.int(-30, 30)], (zs: number[], t0: number, shift: number) => {
            const t = t0 % zs.length;
            const z = zs.map((v) => v / 2);
            const g = env.crossEntropyGrad(z, t);
            for (let i = 0; i < z.length; i++) {
              const h = 1e-6;
              const zp = [...z]; zp[i] += h;
              const zm = [...z]; zm[i] -= h;
              expect(g[i]).toBeNear((env.crossEntropy(zp, t) - env.crossEntropy(zm, t)) / (2 * h), { abs: 1e-5 });
            }
            const a = env.softmax(z), b = env.softmax(z.map((v) => v + shift));
            a.forEach((v: number, i: number) => expect(v).toBeNear(b[i], { abs: 1e-9 }));
          }, { runs: 150 });
        }),
      ],
      hints: ['`m = max(z)`; `logSumExp = m + ln Σ exp(z − m)`.', '`softmax(z)[i] = exp(z[i] − logSumExp(z))` — one shift, no overflow.', 'The gradient of cross-entropy w.r.t. the logits: copy the softmax vector and subtract 1 at the target index.'],
    }),

    lab({
      id: 'ai5-conv',
      title: '2-D convolution and pooling',
      kind: 'code',
      difficulty: 3,
      minutes: 30,
      tags: ['cnn'],
      interview: true,
      prompt: `Images and kernels are arrays of row arrays of numbers (single channel).

- \`conv2d(image, kernel, { stride = 1, padding = 0 } = {})\` — **cross-correlation** (don't flip the kernel) with **zero padding** on all four sides. Output size \`⌊(H + 2p − kh)/s⌋ + 1\` by \`⌊(W + 2p − kw)/s⌋ + 1\`. If the kernel doesn't fit, return \`[]\`.
- \`maxPool2d(image, size = 2, stride = size)\` — max over each \`size×size\` window; windows that don't fully fit are dropped.
- \`relu2d(image)\` — element-wise \`max(0, x)\`.

Don't mutate the inputs.`,
      expose: ['conv2d', 'maxPool2d', 'relu2d'],
      files: jsFile(`function conv2d(image, kernel, { stride = 1, padding = 0 } = {}) {\n  \n}\n\nfunction maxPool2d(image, size = 2, stride = size) {\n  \n}\n\nfunction relu2d(image) {\n  \n}\n`, `function conv2d(image, kernel, { stride = 1, padding = 0 } = {}) {
  const H = image.length;
  const W = image[0].length;
  const kh = kernel.length;
  const kw = kernel[0].length;
  const outH = Math.floor((H + 2 * padding - kh) / stride) + 1;
  const outW = Math.floor((W + 2 * padding - kw) / stride) + 1;
  if (outH <= 0 || outW <= 0) return [];
  const out = [];
  for (let i = 0; i < outH; i++) {
    const row = [];
    for (let j = 0; j < outW; j++) {
      let s = 0;
      for (let a = 0; a < kh; a++) {
        for (let b = 0; b < kw; b++) {
          const r = i * stride + a - padding;
          const c = j * stride + b - padding;
          if (r >= 0 && r < H && c >= 0 && c < W) s += kernel[a][b] * image[r][c];
        }
      }
      row.push(s);
    }
    out.push(row);
  }
  return out;
}

function maxPool2d(image, size = 2, stride = size) {
  const H = image.length;
  const W = image[0].length;
  const out = [];
  for (let i = 0; i + size <= H; i += stride) {
    const row = [];
    for (let j = 0; j + size <= W; j += stride) {
      let m = -Infinity;
      for (let a = 0; a < size; a++) for (let b = 0; b < size; b++) m = Math.max(m, image[i + a][j + b]);
      row.push(m);
    }
    out.push(row);
  }
  return out;
}

function relu2d(image) {
  return image.map((row) => row.map((v) => (v > 0 ? v : 0)));
}
`),
      tests: [
        ex('a 3×3 image with a 2×2 kernel', ({ env, expect }) => {
          const img = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
          expect(env.conv2d(img, [[1, 0], [0, -1]])).toEqual([[-4, -4], [-4, -4]]);
          expect(env.conv2d(img, [[1, 1], [1, 1]])).toEqual([[12, 16], [24, 28]]);
        }),
        ex('the kernel is NOT flipped (cross-correlation)', ({ env, expect }) => {
          expect(env.conv2d([[1, 2, 3]], [[1, 0, 0]])).toEqual([[1]]);
          expect(env.conv2d([[1, 2, 3]], [[0, 0, 1]])).toEqual([[3]]);
        }),
        ex('padding keeps the size ("same" convolution with a 3×3 kernel)', ({ env, expect }) => {
          const out = env.conv2d([[1, 2], [3, 4]], [[0, 0, 0], [0, 1, 0], [0, 0, 0]], { padding: 1 });
          expect(out).toEqual([[1, 2], [3, 4]]);
          const edge = env.conv2d([[1, 1, 1], [1, 1, 1], [1, 1, 1]], [[1, 1, 1], [1, 1, 1], [1, 1, 1]], { padding: 1 });
          expect(edge).toEqual([[4, 6, 4], [6, 9, 6], [4, 6, 4]]);
        }),
        ex('stride and output-size formula', ({ env, expect }) => {
          const img = Array.from({ length: 7 }, (_, i) => Array.from({ length: 9 }, (_, j) => i + j));
          const out = env.conv2d(img, [[1, 0, 0], [0, 0, 0], [0, 0, 0]], { stride: 2, padding: 1 });
          expect([out.length, out[0].length]).toEqual([4, 5]);
          expect(env.conv2d(img, Array.from({ length: 3 }, () => [1, 1, 1]), { stride: 3 }).length).toBe(2);
        }),
        ex('a kernel larger than the image gives an empty result', ({ env, expect }) => expect(env.conv2d([[1, 2]], [[1, 1], [1, 1]])).toEqual([])),
        ex('detects a vertical edge', ({ env, expect }) => {
          const img = [[0, 0, 9, 9], [0, 0, 9, 9], [0, 0, 9, 9]];
          const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
          expect(env.conv2d(img, sobelX)).toEqual([[36, 36]]);
        }),
        ex('max pooling', ({ env, expect }) => {
          const img = [[1, 3, 2, 4], [5, 6, 1, 0], [7, 2, 9, 8], [0, 1, 3, 5]];
          expect(env.maxPool2d(img)).toEqual([[6, 4], [7, 9]]);
          expect(env.maxPool2d(img, 2, 1)).toEqual([[6, 6, 4], [7, 9, 9], [7, 9, 9]]);
          expect(env.maxPool2d([[1, 2, 3], [4, 5, 6], [7, 8, 9]], 2)).toEqual([[5]]);
        }),
        ex('relu and non-mutation', ({ env, expect }) => {
          const img = [[-1, 2], [3, -4]];
          expect(env.relu2d(img)).toEqual([[0, 2], [3, 0]]);
          env.conv2d(img, [[1]]); env.maxPool2d(img);
          expect(img).toEqual([[-1, 2], [3, -4]]);
        }),
        prop('property: convolution is linear in the image and matches a flat dot-product reference', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 9999), gen.int(0, 2), gen.int(1, 2)], (seed: number, padding: number, stride: number) => {
            const r = new Rng(seed);
            const img = Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => r.int(-3, 3)));
            const img2 = Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => r.int(-3, 3)));
            const k = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => r.int(-2, 2)));
            const a = env.conv2d(img, k, { padding, stride }), b = env.conv2d(img2, k, { padding, stride });
            const sum = env.conv2d(img.map((row, i) => row.map((v, j) => v + img2[i][j])), k, { padding, stride });
            expect(matClose(sum, a.map((row: number[], i: number) => row.map((v, j) => v + b[i][j])))).toBe(true);
          }, { runs: 60 });
        }),
        perf('64×64 image, 3×3 kernel runs in O(H·W·k²)', async ({ env, expect, measure, rng }) => {
          const r = rng(3);
          const img = Array.from({ length: 64 }, () => Array.from({ length: 64 }, () => r.float()));
          const k = [[1, 0, -1], [2, 0, -2], [1, 0, -1]];
          const { steps } = await measure(() => env.conv2d(img, k, { padding: 1 }), { budget: 10_000_000 });
          expect(steps).toBeLessThan(64 * 64 * 9 * 4);
        }),
      ],
      hints: ['Output size: `outH = Math.floor((H + 2p − kh) / s) + 1`. For output `(i, j)` the window starts at `(i·s − p, j·s − p)` in the *unpadded* image.', 'Zero padding: when a window cell falls outside the image just skip it (it contributes 0).', 'Max pool: loop `i` and `j` in steps of `stride` while `i + size <= H` (and the same for the width).'],
    }),

    lab({
      id: 'ai5-attention',
      title: 'Scaled dot-product attention and layer norm',
      kind: 'code',
      difficulty: 4,
      minutes: 35,
      tags: ['transformer', 'attention'],
      interview: true,
      prompt: `Matrices are arrays of rows. Implement:

- \`attention(Q, K, V, { causal = false } = {})\` → \`{ weights, output }\` where \`Q\` is \`n×d\`, \`K\` is \`m×d\`, \`V\` is \`m×dv\`.
  - \`scores = Q·Kᵀ / √d\`
  - if \`causal\` (needs \`n = m\`): set \`scores[i][j] = −Infinity\` for \`j > i\` before the softmax
  - \`weights = row-wise softmax(scores)\` (**stable**; masked entries become exactly 0)
  - \`output = weights · V\`
- \`layerNorm(x, eps = 1e-5)\` — normalise one vector to mean 0 and variance 1: \`(xᵢ − μ) / √(σ² + eps)\` with the **population** variance.`,
      expose: ['attention', 'layerNorm'],
      files: jsFile(`function attention(Q, K, V, { causal = false } = {}) {\n  \n}\n\nfunction layerNorm(x, eps = 1e-5) {\n  \n}\n`, `function softmaxRow(row) {
  let m = -Infinity;
  for (const v of row) if (v > m) m = v;
  const e = row.map((v) => (v === -Infinity ? 0 : Math.exp(v - m)));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

function attention(Q, K, V, { causal = false } = {}) {
  const d = Q[0].length;
  const scale = 1 / Math.sqrt(d);
  const scores = Q.map((q, i) =>
    K.map((k, j) => {
      if (causal && j > i) return -Infinity;
      let s = 0;
      for (let t = 0; t < d; t++) s += q[t] * k[t];
      return s * scale;
    })
  );
  const weights = scores.map(softmaxRow);
  const dv = V[0].length;
  const output = weights.map((w) => {
    const row = new Array(dv).fill(0);
    for (let j = 0; j < w.length; j++) for (let t = 0; t < dv; t++) row[t] += w[j] * V[j][t];
    return row;
  });
  return { weights, output };
}

function layerNorm(x, eps = 1e-5) {
  const n = x.length;
  const mean = x.reduce((a, b) => a + b, 0) / n;
  const variance = x.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const inv = 1 / Math.sqrt(variance + eps);
  return x.map((v) => (v - mean) * inv);
}
`),
      tests: [
        ex('each row of the weights sums to 1 and the output is a weighted average of V', ({ env, expect }) => {
          const Q = [[1, 0], [0, 1]], K = [[1, 0], [0, 1], [1, 1]], V = [[1, 0], [0, 1], [5, 5]];
          const { weights, output } = env.attention(Q, K, V);
          expect([weights.length, weights[0].length]).toEqual([2, 3]);
          weights.forEach((w: number[]) => expect(w.reduce((a, b) => a + b, 0)).toBeNear(1, { abs: 1e-12 }));
          output.forEach((row: number[], i: number) => [0, 1].forEach((t) => expect(row[t]).toBeNear(weights[i].reduce((s: number, wj: number, j: number) => s + wj * V[j][t], 0), { abs: 1e-12 })));
        }),
        ex('hand-computed 2-token example (d = 1)', ({ env, expect }) => {
          // scores = QKᵀ/√1 = [[1·1, 1·0],[0·1, 0·0]] → row 0 = softmax([1,0]) ; row 1 = [0.5, 0.5]
          const { weights } = env.attention([[1], [0]], [[1], [0]], [[10], [20]]);
          expect(weights[0][0]).toBeNear(Math.E / (Math.E + 1), { abs: 1e-12 });
          expect(weights[1]).toEqual([0.5, 0.5]);
        }),
        ex('scaling by 1/√d: with d = 4 the scores are halved', ({ env, expect }) => {
          const { weights } = env.attention([[1, 1, 1, 1]], [[1, 1, 1, 1], [0, 0, 0, 0]], [[0], [0]]);
          // raw dot = 4 → scaled = 2 ; softmax([2, 0])
          expect(weights[0][0]).toBeNear(Math.exp(2) / (Math.exp(2) + 1), { abs: 1e-12 });
        }),
        ex('identical keys give uniform attention', ({ env, expect }) => {
          const { weights, output } = env.attention([[3, -2]], [[1, 1], [1, 1], [1, 1], [1, 1]], [[0], [4], [8], [12]]);
          weights[0].forEach((w: number) => expect(w).toBeNear(0.25, { abs: 1e-12 }));
          expect(output[0][0]).toBeNear(6, { abs: 1e-12 });
        }),
        ex('causal masking: no attention to the future', ({ env, expect }) => {
          const X = [[1, 0], [0, 1], [1, 1], [2, -1]];
          const { weights, output } = env.attention(X, X, X.map((r, i) => [i]), { causal: true });
          for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (j > i) expect(weights[i][j]).toBe(0);
          expect(weights[0]).toEqual([1, 0, 0, 0]);
          expect(output[0][0]).toBe(0);
          weights.forEach((w: number[]) => expect(w.reduce((a, b) => a + b, 0)).toBeNear(1, { abs: 1e-12 }));
        }),
        ex('large scores do not overflow', ({ env, expect }) => {
          const { weights } = env.attention([[1000]], [[1000], [999.5]], [[1], [2]]);
          expect(weights[0].every((v: number) => Number.isFinite(v))).toBe(true);
          expect(weights[0][0] + weights[0][1]).toBeNear(1, { abs: 1e-12 });
        }),
        ex('layerNorm gives mean 0 and variance ≈ 1', ({ env, expect }) => {
          const y = env.layerNorm([2, 4, 4, 4, 5, 5, 7, 9]);
          const mean = y.reduce((a: number, b: number) => a + b, 0) / y.length;
          const variance = y.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / y.length;
          expect(mean).toBeNear(0, { abs: 1e-9 });
          expect(variance).toBeNear(1, { abs: 1e-4 });
          expect(env.layerNorm([5, 5, 5]).every((v: number) => Math.abs(v) < 1e-6)).toBe(true);
        }),
        ex('inputs are not mutated', ({ env, expect }) => {
          const Q = [[1, 2]], K = [[3, 4]], V = [[5]];
          env.attention(Q, K, V); env.layerNorm([1, 2, 3]);
          expect([Q, K, V]).toEqual([[[1, 2]], [[3, 4]], [[5]]]);
        }),
        prop('property: permuting the (key, value) pairs together does not change the output', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 9999)], (seed: number) => {
            const r = new Rng(seed);
            const mk = (n: number, d: number) => Array.from({ length: n }, () => Array.from({ length: d }, () => r.float() * 2 - 1));
            const Q = mk(3, 4), K = mk(5, 4), V = mk(5, 2);
            const perm = r.shuffle([0, 1, 2, 3, 4]);
            const a = env.attention(Q, K, V).output;
            const b = env.attention(Q, perm.map((i) => K[i]), perm.map((i) => V[i])).output;
            expect(matClose(a, b, 1e-9)).toBe(true);
          }, { runs: 50 });
        }),
      ],
      hints: ['`scores[i][j] = (Q[i] · K[j]) / Math.sqrt(d)` where `d` is the length of a query row.', 'For causal attention put `-Infinity` where `j > i`; in your row-softmax treat `-Infinity` entries as `exp = 0` (subtract the row max first, which is finite because `j = i` is never masked).', '`output[i] = Σ_j weights[i][j] · V[j]`.', '`layerNorm`: mean, population variance, then `(x − mean) / sqrt(var + eps)`.'],
      why: 'These ~40 lines are the core of every Transformer — GPT, BERT, vision transformers and the perception stacks that fuse camera streams.',
    }),
  ],
  references: [
    { title: 'Attention Is All You Need — Vaswani et al., 2017', url: 'https://arxiv.org/abs/1706.03762' },
    { title: 'Deep Residual Learning for Image Recognition (ResNet) — He et al., 2015', url: 'https://arxiv.org/abs/1512.03385' },
    { title: 'CS231n: Convolutional Neural Networks for Visual Recognition (Stanford)', url: 'https://cs231n.github.io/' },
    { title: 'The Annotated Transformer — Harvard NLP', url: 'https://nlp.seas.harvard.edu/annotated-transformer/' },
  ],
};
export default mod;
