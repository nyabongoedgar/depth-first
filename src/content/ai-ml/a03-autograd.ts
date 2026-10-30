import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';
import { Rng } from '../../grader/rng';

export const VALUE_SRC = `// A scalar autograd engine in the style of micrograd (provided)
class Value {
  constructor(data, children = [], op = '') {
    this.data = data;
    this.grad = 0;
    this._prev = children;
    this._op = op;
    this._backward = () => {};
  }
  static wrap(x) {
    return x instanceof Value ? x : new Value(x);
  }
  add(other) {
    other = Value.wrap(other);
    const out = new Value(this.data + other.data, [this, other], '+');
    out._backward = () => {
      this.grad += out.grad;
      other.grad += out.grad;
    };
    return out;
  }
  mul(other) {
    other = Value.wrap(other);
    const out = new Value(this.data * other.data, [this, other], '*');
    out._backward = () => {
      this.grad += other.data * out.grad;
      other.grad += this.data * out.grad;
    };
    return out;
  }
  pow(k) {
    const out = new Value(Math.pow(this.data, k), [this], '^' + k);
    out._backward = () => {
      this.grad += k * Math.pow(this.data, k - 1) * out.grad;
    };
    return out;
  }
  neg() {
    return this.mul(-1);
  }
  sub(other) {
    return this.add(Value.wrap(other).neg());
  }
  div(other) {
    return this.mul(Value.wrap(other).pow(-1));
  }
  tanh() {
    const t = Math.tanh(this.data);
    const out = new Value(t, [this], 'tanh');
    out._backward = () => {
      this.grad += (1 - t * t) * out.grad;
    };
    return out;
  }
  relu() {
    const out = new Value(this.data > 0 ? this.data : 0, [this], 'relu');
    out._backward = () => {
      this.grad += (out.data > 0 ? 1 : 0) * out.grad;
    };
    return out;
  }
  exp() {
    const e = Math.exp(this.data);
    const out = new Value(e, [this], 'exp');
    out._backward = () => {
      this.grad += e * out.grad;
    };
    return out;
  }
  log() {
    const out = new Value(Math.log(this.data), [this], 'log');
    out._backward = () => {
      this.grad += (1 / this.data) * out.grad;
    };
    return out;
  }
  backward() {
    const topo = [];
    const seen = new Set();
    const stack = [[this, false]];
    while (stack.length) {
      const [node, expanded] = stack.pop();
      if (expanded) {
        topo.push(node);
        continue;
      }
      if (seen.has(node)) continue;
      seen.add(node);
      stack.push([node, true]);
      for (const child of node._prev) if (!seen.has(child)) stack.push([child, false]);
    }
    this.grad = 1;
    for (let i = topo.length - 1; i >= 0; i--) topo[i]._backward();
  }
}
`;

// ---------- numeric helpers shared by the tests ----------
type Fn = (v: any[], Value: any) => any;
/** Gradient check: compare autograd with central finite differences for f(values). */
function gradCheck(env: any, f: (xs: any[]) => any, at: number[], tol = 1e-5) {
  const Value = env.Value;
  const leaves = at.map((x) => new Value(x));
  const out = f(leaves);
  out.backward();
  at.forEach((x, i) => {
    const h = 1e-6;
    const plus = at.map((v, j) => (j === i ? v + h : v));
    const minus = at.map((v, j) => (j === i ? v - h : v));
    const fp = f(plus.map((v) => new Value(v))).data;
    const fm = f(minus.map((v) => new Value(v))).data;
    const numeric = (fp - fm) / (2 * h);
    const got = leaves[i].grad;
    if (!(Math.abs(got - numeric) <= tol * Math.max(1, Math.abs(numeric)))) throw new Error(`d/dx${i}: autograd says ${got} but a finite difference gives ${numeric} (at ${JSON.stringify(at)})`);
  });
}

const mod: Module = {
  id: 'autograd',
  course: 'ai-ml',
  title: 'Autograd & Neural Networks from Scratch',
  minutes: 130,
  objectives: [
    'Explain reverse-mode automatic differentiation and why backpropagation is just the chain rule on a graph',
    'Implement a scalar autograd engine (add, mul, pow, tanh, relu, exp, log) with correct gradient accumulation',
    'Build and train a multilayer perceptron with SGD, and verify gradients numerically',
    'Recognise how this generalises to tensors, GPUs and frameworks like PyTorch',
  ],
  body: `
## The one idea behind deep learning

A neural network is a big composition of simple differentiable functions: $L = f_n(\\dots f_2(f_1(x;\\theta_1);\\theta_2)\\dots)$. To train it we need $\\partial L/\\partial\\theta$ for **every** parameter — millions or billions of them. **Backpropagation** computes *all* of those gradients in time proportional to *one* forward pass, using the **chain rule** on the **computation graph**.

## Computation graphs

Every arithmetic operation creates a node that remembers **its inputs** (children) and **how to push gradients back** to them:

\`\`\`
   x ──┐                       a = x * w
       ├─ (*) ─ a ─┐           z = a + b
   w ──┘           ├─ (+) ─ z ─ (tanh) ─ y
   b ──────────────┘
\`\`\`

- **Forward pass:** compute values from inputs to the output $L$, recording the graph.
- **Backward pass:** set $\\partial L/\\partial L=1$, then visit nodes in **reverse topological order**; each node adds its **local derivative × the gradient flowing in** to its children:
$$\\frac{\\partial L}{\\partial c}\\ \\mathrel{+}=\\ \\frac{\\partial L}{\\partial v}\\cdot\\frac{\\partial v}{\\partial c}$$

Local rules (with $g$ = incoming gradient $\\partial L/\\partial v$):

| Op $v=\\dots$ | gradient added to children |
|---|---|
| $a+b$ | $a\\mathrel{+}=g,\\ \\ b\\mathrel{+}=g$ |
| $a\\cdot b$ | $a\\mathrel{+}=b\\,g,\\ \\ b\\mathrel{+}=a\\,g$ |
| $a^k$ | $a\\mathrel{+}=k a^{k-1}g$ |
| $\\tanh a$ | $a\\mathrel{+}=(1-v^2)\\,g$ |
| $\\max(0,a)$ (ReLU) | $a\\mathrel{+}=\\mathbb{1}[a>0]\\,g$ |
| $e^a$ | $a\\mathrel{+}=v\\,g$ |
| $\\ln a$ | $a\\mathrel{+}=g/a$ |

**Crucial detail — gradients accumulate (\`+=\`).** If a value is used in several places (e.g. \`x*x\` or a weight shared across time steps), the contributions from every use **add up** (the multivariable chain rule). Writing \`=\` instead of \`+=\` is the classic autograd bug, and the lab tests catch it.

**Why *reverse* mode?** A network has millions of inputs (parameters) and **one** scalar output (the loss). Reverse mode gets all input-gradients in one backward sweep (cost ≈ 2–3× the forward pass). Forward mode would need one sweep per parameter. (Jacobian-vector vs vector-Jacobian products.) Memory cost: the forward activations must be **stored** for the backward pass — the reason training uses much more memory than inference, and why **gradient checkpointing** exists.

## From one neuron to a network

A **neuron**: $y=\\phi(\\mathbf w\\cdot\\mathbf x+b)$ with a non-linear **activation** $\\phi$ (tanh, ReLU, sigmoid, GELU). A **layer** is many neurons reading the same inputs; an **MLP** (multilayer perceptron) stacks layers. Without the non-linearity, stacked layers collapse into one linear map. With it, a wide-enough network can approximate any continuous function (the **universal approximation theorem**) — e.g. XOR, which no single neuron can learn.

**Training loop** (stochastic gradient descent):

\`\`\`
repeat for each epoch / mini-batch:
   1. forward:   predictions = model(x);   loss = L(predictions, targets)
   2. zero grad: set every parameter's .grad = 0       (otherwise gradients accumulate across steps!)
   3. backward:  loss.backward()
   4. update:    for p in parameters: p.data -= lr * p.grad
\`\`\`

\`\`\`js run
// Autograd in 20 lines: y = x*x + x  at x = 3  →  dy/dx = 2x + 1 = 7
class V {
  constructor(d, kids = []) { this.data = d; this.grad = 0; this.kids = kids; this.back = () => {}; }
  add(o) { const out = new V(this.data + o.data, [this, o]); out.back = () => { this.grad += out.grad; o.grad += out.grad; }; return out; }
  mul(o) { const out = new V(this.data * o.data, [this, o]); out.back = () => { this.grad += o.data * out.grad; o.grad += this.data * out.grad; }; return out; }
  backward() {
    const order = [], seen = new Set();
    const visit = (n) => { if (!seen.has(n)) { seen.add(n); n.kids.forEach(visit); order.push(n); } };
    visit(this); this.grad = 1; order.reverse().forEach((n) => n.back());
  }
}
const x = new V(3);
const y = x.mul(x).add(x);       // x is used THREE times → gradients must accumulate
y.backward();
console.log(y.data, x.grad);      // 12 7
\`\`\`

## Verifying gradients: the gradient check

Whenever you write backward code, compare against a **numerical derivative**: $\\dfrac{f(x+h)-f(x-h)}{2h}$. If they agree to ~1e-6 your local rules are right. This is the single most useful ML-debugging habit, and it is exactly how this module grades you.

## Scaling up

PyTorch/JAX/TensorFlow do the same thing with **tensors** instead of scalars (one graph node = a whole matrix multiply), run on **GPUs/TPUs**, fuse operations, and use mixed precision. The mechanics — graph, topological order, local derivative rules, accumulation — are identical to your 80-line engine. Understanding it means a surprising training run (NaN loss, vanishing gradients, frozen layers) is something you can *reason about*.

:::warn
**Vanishing / exploding gradients.** Multiplying many local derivatives < 1 (e.g. tanh′ ≤ 1, sigmoid′ ≤ ¼) shrinks the gradient exponentially with depth; > 1 blows it up. Remedies: ReLU-family activations, careful initialisation (Xavier/He), normalisation layers, residual connections, gradient clipping.
:::

:::interview
"Explain backprop." — Forward pass builds a graph; backward pass applies the chain rule in reverse topological order, accumulating (+=) each node's local derivative times the upstream gradient; reverse mode because one loss, many parameters; cost ≈ a few forward passes. Then offer the gradient-check trick.
:::
`,
  quiz: [
    { q: 'Why does autograd use `+=` when propagating gradients to a child?', options: ['It is faster', 'A value used in several places receives a contribution from each use, and those add (multivariable chain rule)', 'To avoid NaN', 'It is a convention only'], answer: 1, why: 'With `=` the gradient of x in x*x + x would be wrong.' },
    { q: 'Why is reverse-mode differentiation used for neural networks?', options: ['It is easier to code', 'One scalar loss and millions of parameters: a single backward pass yields all gradients', 'It needs no memory', 'It avoids the chain rule'], answer: 1, why: 'Cost is O(forward pass) for all parameters instead of one pass per parameter.' },
    { q: 'What happens if you forget to zero the gradients between training steps?', options: ['Nothing', 'Gradients from previous steps accumulate, producing wrong (too large) updates', 'The loss becomes zero', 'The network trains faster'], answer: 1, why: 'Each `backward()` adds into `.grad`.' },
    { q: 'Why can a single neuron not learn XOR?', options: ['Not enough data', 'XOR is not linearly separable; one neuron draws a single straight decision boundary', 'tanh is too weak', 'It can, with more epochs'], answer: 1, why: 'Hidden layers with non-linearities compose several boundaries.' },
    { q: 'A numerical gradient check compares autograd gradients with…', options: ['Random numbers', 'Central finite differences (f(x+h) − f(x−h)) / 2h', 'The loss value', 'The previous epoch'], answer: 1, why: 'Agreement to ~1e-6 verifies the backward rules.' },
  ],
  labs: [
    lab({
      id: 'ai3-value',
      title: 'Build an autograd engine',
      kind: 'code',
      difficulty: 4,
      minutes: 50,
      tags: ['autograd', 'backprop'],
      interview: true,
      prompt: `Implement \`class Value\` — a scalar that remembers how it was computed:

- \`new Value(data)\`; fields \`data\`, \`grad\` (starts 0).
- Operations (each returns a **new** Value; plain numbers on the right-hand side are wrapped automatically): \`add\`, \`mul\`, \`sub\`, \`div\`, \`neg\`, \`pow(k)\` (k is a plain number), \`tanh\`, \`relu\`, \`exp\`, \`log\`.
- \`backward()\` — set \`this.grad = 1\` and propagate gradients to every ancestor in **reverse topological order**, **accumulating** with \`+=\`. Use an iterative topological sort (graphs can be deep).

Hint: give each result a \`_backward\` closure that pushes \`out.grad\` into its children using the local derivative, and record the children in \`_prev\`.`,
      expose: ['Value'],
      files: jsFile(`class Value {
  constructor(data, children = []) {
    this.data = data;
    this.grad = 0;
    this._prev = children;
    this._backward = () => {};
  }

  static wrap(x) {
    return x instanceof Value ? x : new Value(x);
  }

  add(other) {}
  mul(other) {}
  sub(other) {}
  div(other) {}
  neg() {}
  pow(k) {}
  tanh() {}
  relu() {}
  exp() {}
  log() {}
  backward() {}
}
`, VALUE_SRC),
      tests: [
        ex('forward values', ({ env, expect }) => {
          const { Value } = env;
          const a = new Value(2), b = new Value(-3);
          expect(a.add(b).data).toBe(-1);
          expect(a.mul(b).data).toBe(-6);
          expect(a.sub(b).data).toBe(5);
          expect(a.div(4).data).toBe(0.5);
          expect(a.pow(3).data).toBe(8);
          expect(a.neg().data).toBe(-2);
          expect(new Value(0).tanh().data).toBe(0);
          expect([new Value(-1).relu().data, new Value(3).relu().data]).toEqual([0, 3]);
          expect(new Value(0).exp().data).toBe(1);
          expect(new Value(1).log().data).toBe(0);
          expect(a.add(10).data).toBe(12);
        }),
        ex('d(x·y + x) = (y + 1, x)', ({ env, expect }) => {
          const x = new env.Value(3), y = new env.Value(-4);
          x.mul(y).add(x).backward();
          expect([x.grad, y.grad]).toEqual([-3, 3]);
        }),
        ex('a value used several times accumulates: d(x·x·x + x) = 3x² + 1', ({ env, expect }) => {
          const x = new env.Value(2);
          x.mul(x).mul(x).add(x).backward();
          expect(x.grad).toBe(13);
        }),
        ex('chain rule through tanh: d tanh(w·x + b)', ({ env, expect }) => gradCheck(env, ([x, w, b]) => x.mul(w).add(b).tanh(), [0.5, -1.2, 0.3])),
        ex('relu passes gradient only where positive', ({ env, expect }) => {
          const a = new env.Value(2), b = new env.Value(-2);
          a.relu().add(b.relu()).backward();
          expect([a.grad, b.grad]).toEqual([1, 0]);
        }),
        ex('exp / log / pow / div / sub', ({ env, expect }) => {
          gradCheck(env, ([x, y]) => x.exp().div(y.pow(2).add(1)), [0.7, -1.1]);
          gradCheck(env, ([x, y]) => x.log().sub(y.mul(x)), [1.7, 0.4]);
          gradCheck(env, ([x]) => x.neg().exp().log().pow(3), [0.9]);
        }),
        ex('gradients only reach the nodes the output depends on; the root gets 1', ({ env, expect }) => {
          const a = new env.Value(1), b = new env.Value(2), unused = new env.Value(9);
          const out = a.mul(b);
          out.backward();
          expect([out.grad, a.grad, b.grad, unused.grad]).toEqual([1, 2, 1, 0]);
        }),
        prop('property: autograd agrees with finite differences on random expression graphs', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 9999)], (seed: number) => {
            const r = new Rng(seed);
            const ops = Array.from({ length: 8 }, () => [r.int(0, 5), r.int(0, 100), r.int(0, 100)]);
            const f = (xs: any[]) => {
              const nodes: any[] = [...xs];
              for (const [op, i, j] of ops) {
                const a = nodes[i % nodes.length], b = nodes[j % nodes.length];
                nodes.push(op === 0 ? a.add(b) : op === 1 ? a.mul(b) : op === 2 ? a.sub(b) : op === 3 ? a.tanh() : op === 4 ? a.mul(0.5).add(b) : a.mul(a).add(0.1).pow(0.5));
              }
              return nodes[nodes.length - 1];
            };
            gradCheck(env, f, [r.float() * 2 - 1, r.float() * 2 - 1, r.float() * 2 - 1], 1e-4);
          }, { runs: 60 });
        }),
        perf('a deep graph (20,000 chained operations) does not blow the stack', async ({ env, expect, measure }) => {
          const { Value } = env;
          const x = new Value(1.0001);
          let acc = x;
          for (let i = 0; i < 20000; i++) acc = acc.mul(1.00001);
          const { steps } = await measure(() => acc.backward(), { budget: 5_000_000 });
          expect(Number.isFinite(x.grad)).toBe(true);
          expect(steps).toBeLessThan(400_000);
        }),
      ],
      hints: [
        'Every operation: `const out = new Value(<result>, [this, other]);` then set `out._backward = () => { … }` and `return out;`.',
        '`add`: `this.grad += out.grad; other.grad += out.grad`. `mul`: `this.grad += other.data * out.grad; other.grad += this.data * out.grad`. Use `+=` everywhere!',
        '`sub(o)` = `this.add(Value.wrap(o).neg())`, `div(o)` = `this.mul(Value.wrap(o).pow(-1))`, `neg()` = `this.mul(-1)`. `tanh`: local derivative `1 − t²`. `pow(k)`: `k · data^(k−1)`.',
        '`backward()`: build a topological order with an **iterative** depth-first search (a stack of `[node, expanded]` pairs), set `this.grad = 1`, then call `_backward()` on the nodes in reverse order.',
        'If the gradient check says a value is off by exactly a factor, you probably used `=` where you needed `+=` (a node used twice), or forgot to multiply by `out.grad` (the chain rule).',
      ],
      why: 'Every deep-learning framework is a bigger version of this ~80-line file.',
    }),

    lab({
      id: 'ai3-mlp',
      title: 'Train a neural network on XOR',
      kind: 'code',
      difficulty: 4,
      minutes: 40,
      tags: ['mlp', 'sgd'],
      interview: true,
      prompt: `The \`Value\` class from the previous lab is provided. Build an MLP and train it.

- \`class MLP\`: \`new MLP(sizes, rand)\` where \`sizes\` like \`[2, 4, 1]\` = input size, hidden sizes…, output size. Each neuron has weights initialised uniformly in \`[-1, 1]\` (from \`rand()\`, a function returning floats in [0,1)) and a bias of 0. Hidden layers use **tanh**; the **last layer is linear**.
- \`forward(x)\` — \`x\` is an array of numbers; returns a single \`Value\` if the output size is 1, otherwise an array of \`Value\`s.
- \`parameters()\` — a flat array of every weight and bias \`Value\` (count \`= Σ (in+1)·out\`).
- \`train(model, X, y, { epochs = 200, lr = 0.05 } = {})\` — **full-batch** gradient descent on the **sum of squared errors**. Each epoch: forward all samples, build the loss, **zero the gradients**, \`backward()\`, update \`p.data -= lr * p.grad\`. Return the array of per-epoch losses (the loss value *before* the update).`,
      expose: ['MLP', 'train'],
      files: jsFile(VALUE_SRC + `
class MLP {
  constructor(sizes, rand) {
    
  }

  forward(x) {}

  parameters() {}
}

function train(model, X, y, { epochs = 200, lr = 0.05 } = {}) {
  
}
`, VALUE_SRC + `
class Neuron {
  constructor(nin, rand, linear) {
    this.w = Array.from({ length: nin }, () => new Value(rand() * 2 - 1));
    this.b = new Value(0);
    this.linear = linear;
  }

  call(x) {
    let act = this.b;
    for (let i = 0; i < this.w.length; i++) act = act.add(this.w[i].mul(x[i]));
    return this.linear ? act : act.tanh();
  }

  parameters() {
    return [...this.w, this.b];
  }
}

class MLP {
  constructor(sizes, rand) {
    this.layers = [];
    for (let i = 0; i < sizes.length - 1; i++) {
      const last = i === sizes.length - 2;
      this.layers.push(Array.from({ length: sizes[i + 1] }, () => new Neuron(sizes[i], rand, last)));
    }
  }

  forward(x) {
    let out = x;
    for (const layer of this.layers) out = layer.map((n) => n.call(out));
    return out.length === 1 ? out[0] : out;
  }

  parameters() {
    return this.layers.flatMap((layer) => layer.flatMap((n) => n.parameters()));
  }
}

function train(model, X, y, { epochs = 200, lr = 0.05 } = {}) {
  const losses = [];
  const params = model.parameters();
  for (let e = 0; e < epochs; e++) {
    let loss = new Value(0);
    for (let i = 0; i < X.length; i++) loss = loss.add(model.forward(X[i]).sub(y[i]).pow(2));
    for (const p of params) p.grad = 0;
    loss.backward();
    for (const p of params) p.data -= lr * p.grad;
    losses.push(loss.data);
  }
  return losses;
}
`),
      tests: [
        ex('parameter count = Σ (inputs + 1) × outputs per layer', ({ env, expect, rng }) => {
          const r = rng(1);
          expect(new env.MLP([2, 4, 1], () => r.float()).parameters().length).toBe(3 * 4 + 5 * 1);
          expect(new env.MLP([3, 5, 5, 2], () => r.float()).parameters().length).toBe(4 * 5 + 6 * 5 + 6 * 2);
        }),
        ex('forward returns a Value for one output, an array for several; weights lie in [-1, 1], biases start at 0', ({ env, expect, rng }) => {
          const r = rng(2);
          const m = new env.MLP([2, 3, 1], () => r.float());
          const out = m.forward([0.5, -0.5]);
          expect(typeof out.data).toBe('number');
          const m2 = new env.MLP([2, 3, 2], () => r.float());
          expect(m2.forward([1, 1]).length).toBe(2);
          const ps = m.parameters();
          expect(ps.every((p: any) => p.data >= -1 && p.data <= 1)).toBe(true);
          expect(ps.filter((p: any) => p.data === 0).length).toBe(4); // 3 hidden biases + 1 output bias
        }),
        ex('the final layer is linear (output can exceed tanh\'s range)', ({ env, expect }) => {
          const m = new env.MLP([1, 1], () => 1); // weight = 1, bias = 0
          expect(m.forward([5]).data).toBe(5);
        }),
        ex('hidden layers use tanh (output depends non-linearly on the input)', ({ env, expect }) => {
          const m = new env.MLP([1, 1, 1], () => 1);
          expect(m.forward([100]).data).toBeNear(Math.tanh(100) * 1, { abs: 1e-9 });
        }),
        ex('training reduces the loss', ({ env, expect, rng }) => {
          const r = rng(3);
          const m = new env.MLP([2, 4, 1], () => r.float());
          const losses = env.train(m, [[0, 0], [0, 1], [1, 0], [1, 1]], [-1, 1, 1, -1], { epochs: 100, lr: 0.05 });
          expect(losses.length).toBe(100);
          expect(losses[99]).toBeLessThan(losses[0]);
        }),
        ex('learns XOR (a problem a single neuron cannot solve)', ({ env, expect, rng }) => {
          let learned = 0;
          for (const seed of [1, 2, 3]) {
            const r = rng(seed);
            const m = new env.MLP([2, 4, 1], () => r.float());
            const X = [[0, 0], [0, 1], [1, 0], [1, 1]];
            const y = [-1, 1, 1, -1];
            env.train(m, X, y, { epochs: 600, lr: 0.1 });
            if (X.every((x, i) => Math.sign(m.forward(x).data) === y[i])) learned++;
          }
          if (learned < 2) throw new Error(`the network learned XOR for only ${learned} of 3 random initialisations (need ≥ 2). Are you zeroing the gradients every epoch, and using tanh in the hidden layer?`);
        }),
        ex('training is deterministic, and gradients are zeroed each epoch (a second call on a trained model starts clean)', ({ env, expect, rng }) => {
          const run = () => { const r = rng(5); const m = new env.MLP([1, 2, 1], () => r.float()); return env.train(m, [[0], [1]], [0, 1], { epochs: 30, lr: 0.05 }); };
          expect(run()).toEqual(run());
          // if gradients were NOT zeroed, the first update of a second train() call would use stale gradients and differ
          const r = rng(5);
          const m = new env.MLP([1, 2, 1], () => r.float());
          env.train(m, [[0], [1]], [0, 1], { epochs: 3, lr: 0.05 });
          const snap = m.parameters().map((p: any) => p.data);
          const r2 = rng(5);
          const fresh = new env.MLP([1, 2, 1], () => r2.float());
          fresh.parameters().forEach((p: any, i: number) => (p.data = snap[i]));
          const a = env.train(m, [[0], [1]], [0, 1], { epochs: 1, lr: 0.05 });
          const b = env.train(fresh, [[0], [1]], [0, 1], { epochs: 1, lr: 0.05 });
          expect(a[0]).toBeNear(b[0], { abs: 1e-12 });
          expect(m.parameters().map((p: any) => p.data)).toEqual(fresh.parameters().map((p: any) => p.data));
        }),
        ex('lr = 0 leaves the parameters unchanged', ({ env, expect, rng }) => {
          const r = rng(7);
          const m = new env.MLP([2, 3, 1], () => r.float());
          const before = m.parameters().map((p: any) => p.data);
          env.train(m, [[1, 2]], [3], { epochs: 5, lr: 0 });
          expect(m.parameters().map((p: any) => p.data)).toEqual(before);
        }),
      ],
      hints: [
        'A `Neuron` has `w` (array of Values), `b`, and computes `b + Σ w[i]·x[i]`, then `tanh` unless it is in the last layer.',
        '`MLP`: for each consecutive pair of `sizes` create a layer = array of neurons with `nin = sizes[i]`. `forward` feeds the whole layer\'s outputs into the next layer.',
        '`train`: `loss = Σ (forward(x_i) − y_i)²` built with `Value` ops; then **set every `p.grad = 0` before `loss.backward()`**; finally `p.data -= lr * p.grad`.',
        'Initialise with `rand() * 2 - 1`. Use `.flatMap` to collect parameters.',
      ],
      why: 'This is, in miniature, what trains every model from spam filters to large language models.',
    }),

    lab({
      id: 'ai3-concepts',
      title: 'Backprop by hand',
      kind: 'answer',
      difficulty: 2,
      minutes: 15,
      tags: ['backprop'],
      prompt: 'Let $x=3$, $w=-2$, $b=1$, and $y=\\tanh(wx+b)$... but first the simple parts. Use the chain rule by hand and give numbers to 4 decimals.',
      questions: [
        { id: 'a', prompt: '$f(x,y)=xy+x$ at $x=3,\\ y=-4$. What is $\\partial f/\\partial x$?', type: 'number', answer: -3, explain: '∂f/∂x = y + 1.' },
        { id: 'b', prompt: 'Same function: $\\partial f/\\partial y$.', type: 'number', answer: 3 },
        { id: 'c', prompt: '$g(x)=x^3+x$ at $x=2$. $g^{\\prime}(2)$ = ?', type: 'number', answer: 13 },
        { id: 'd', prompt: '$h=\\tanh(z)$ at $z=0$: $\\dfrac{dh}{dz}$ = ?', type: 'number', answer: 1 },
        { id: 'e', prompt: '$L=(w x - t)^2$ with $x=2,\\ t=1,\\ w=0.5$. Compute $\\partial L/\\partial w$.', type: 'number', answer: 0, explain: 'wx − t = 0 → 2(wx − t)x = 0.' },
        { id: 'f', prompt: 'With $w=1$ instead (everything else the same), $\\partial L/\\partial w$ = ?', type: 'number', answer: 4, explain: '2(2−1)·2 = 4.' },
        { id: 'g', prompt: 'A SGD step with learning rate 0.1 from $w=1$ using that gradient gives $w$ = ?', type: 'number', answer: 0.6 },
      ],
      hints: ['Chain rule: ∂L/∂w = ∂L/∂(wx−t) · ∂(wx−t)/∂w.', 'tanh′(z) = 1 − tanh²(z).'],
    }),
  ],
  references: [
    { title: 'The spelled-out intro to neural networks and backpropagation: building micrograd — Andrej Karpathy', url: 'https://www.youtube.com/watch?v=VMj-3S1tku0' },
    { title: 'karpathy/micrograd (the 100-line engine this module is based on)', url: 'https://github.com/karpathy/micrograd' },
    { title: 'Automatic differentiation in machine learning: a survey — Baydin et al., 2018' },
    { title: 'Learning representations by back-propagating errors — Rumelhart, Hinton, Williams, 1986' },
  ],
};
export default mod;
