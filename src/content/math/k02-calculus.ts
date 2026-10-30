import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';

const mod: Module = {
  id: 'calculus',
  course: 'math',
  title: 'Calculus for Engineers: Derivatives, Integrals, Gradients & Newton',
  minutes: 90,
  objectives: [
    'Interpret the derivative as a rate of change and as the slope of the best linear approximation',
    'Differentiate with the product, quotient and chain rules',
    'Approximate derivatives and integrals numerically (and know their error behaviour)',
    'Use gradients and gradient descent; find roots with Newton\'s method',
  ],
  body: `
## The derivative: instantaneous rate of change

For a function $f$, the **derivative** at $x$ is
$$f'(x) = \\lim_{h\\to 0}\\frac{f(x+h)-f(x)}{h}$$
— the slope of the tangent line, i.e. the best **linear approximation** $f(x+h)\\approx f(x)+f'(x)\\,h$. Velocity is the derivative of position; marginal cost the derivative of cost; **backpropagation is calculus** (the chain rule applied cleverly).

**Rules you must know** (derive them once, then memorise):

| Rule | Formula |
|---|---|
| power | $\\dfrac{d}{dx}x^n = nx^{n-1}$ |
| sum, constant | $(af+bg)' = af'+bg'$ |
| product | $(fg)' = f'g + fg'$ |
| quotient | $\\left(\\dfrac{f}{g}\\right)' = \\dfrac{f'g - fg'}{g^2}$ |
| **chain** | $\\dfrac{d}{dx}f(g(x)) = f'(g(x))\\,g'(x)$ |
| exp / log | $(e^x)'=e^x,\\ (\\ln x)' = 1/x$ |
| trig | $(\\sin x)'=\\cos x,\\ (\\cos x)'=-\\sin x$ |

**Optimisation:** at a smooth minimum or maximum $f'(x)=0$; the sign of $f''$ tells which ($>0$ min, $<0$ max). Training a model = minimising a loss.

## Numerical derivatives

You can't always differentiate by hand (or the function is a black box). The **forward difference** $(f(x+h)-f(x))/h$ has error $O(h)$; the **central difference**
$$f'(x)\\approx\\frac{f(x+h)-f(x-h)}{2h}$$
has error $O(h^2)$ — much better. Don't make $h$ *too* small: floating-point **cancellation** destroys accuracy (about $h\\approx\\sqrt[3]{\\varepsilon}\\approx 10^{-5}$ is the sweet spot for central differences in double precision). **Automatic differentiation** (what PyTorch/JAX do) gets exact derivatives by applying the chain rule to the operations of the program — you'll build it in the ML course.

\`\`\`js run
const f = Math.sin, x = 1;
for (const h of [1e-1, 1e-3, 1e-5, 1e-8, 1e-12]) {
  const central = (f(x + h) - f(x - h)) / (2 * h);
  console.log("h =", h, " error =", Math.abs(central - Math.cos(x)).toExponential(2));
}   // error shrinks, then GROWS again once rounding noise dominates
\`\`\`

## Integrals

The **definite integral** $\\int_a^b f(x)\\,dx$ is the (signed) **area under the curve**, the limit of Riemann sums. The **Fundamental Theorem of Calculus** links the two ideas: $\\int_a^b f'(x)\\,dx = f(b)-f(a)$.

**Numerical integration** (quadrature) approximates the area with simple shapes on $n$ subintervals of width $h=(b-a)/n$:
- **Trapezoid rule:** error $O(h^2)$.
- **Simpson's rule** (fit parabolas, $n$ even): $\\displaystyle \\frac{h}{3}\\Big[f_0 + 4f_1 + 2f_2 + 4f_3 + \\dots + 4f_{n-1} + f_n\\Big]$, error $O(h^4)$ — exact for polynomials up to degree 3.
- **Monte Carlo** integration: average $f$ at random points; error $O(1/\\sqrt N)$ regardless of dimension — the only practical method in high dimensions.

## Gradients and gradient descent

For $f:\\mathbb{R}^n\\to\\mathbb{R}$, the **gradient** is the vector of partial derivatives
$$\\nabla f = \\left(\\frac{\\partial f}{\\partial x_1},\\dots,\\frac{\\partial f}{\\partial x_n}\\right)$$
It points in the direction of **steepest ascent**. To minimise $f$, repeatedly step *against* the gradient:
$$\\mathbf{x}_{t+1} = \\mathbf{x}_t - \\eta\\,\\nabla f(\\mathbf{x}_t)$$
where $\\eta$ is the **learning rate**. Too small: slow. Too large: **overshoots and diverges**. On a convex bowl it converges to the global minimum; on non-convex losses it finds a local one (and saddle points). Momentum, RMSProp and Adam are refinements.

\`\`\`js run
// minimise f(x, y) = (x - 3)^2 + 2 (y + 1)^2   — gradient = (2(x-3), 4(y+1))
let p = [0, 0];
const grad = ([x, y]) => [2 * (x - 3), 4 * (y + 1)];
for (let i = 0; i < 50; i++) { const g = grad(p); p = [p[0] - 0.1 * g[0], p[1] - 0.1 * g[1]]; }
console.log(p.map((v) => +v.toFixed(4)));      // → [3, -1]
\`\`\`

## Newton's method

To solve $f(x)=0$, replace $f$ by its tangent line and jump to where *that* hits zero:
$$x_{n+1}=x_n-\\frac{f(x_n)}{f'(x_n)}$$
Near a simple root it converges **quadratically** (the number of correct digits roughly doubles each step) — that's how calculators compute $\\sqrt{2}$. It can fail: derivative near zero, cycling, or divergence from a bad start, so always cap the iterations.

\`\`\`js run
let x = 1;                                   // solve x^2 - 2 = 0
for (let i = 0; i < 5; i++) { x = x - (x * x - 2) / (2 * x); console.log(x); }
\`\`\`

:::interview
"How do you compute a square root without \`Math.sqrt\`?" — Newton: $x \\leftarrow (x + a/x)/2$. Or binary search on $[0, \\max(1,a)]$. Mention convergence speed and the stopping criterion.
:::

:::warn
Don't confuse *differentiable* with *continuous*: $|x|$ is continuous but has no derivative at 0 (ReLU has the same kink — frameworks just pick a sub-gradient). And a zero gradient doesn't guarantee a minimum (saddles).
:::
`,
  quiz: [
    { q: 'Which finite-difference formula is more accurate for the same h?', options: ['Forward: (f(x+h) − f(x))/h', 'Central: (f(x+h) − f(x−h))/(2h)', 'They are identical', 'Neither'], answer: 1, why: 'Central difference error is O(h²) versus O(h) for forward.' },
    { q: 'Why can making h extremely small (like 1e-14) make a numerical derivative WORSE?', options: ['The function becomes discontinuous', 'Subtracting nearly equal floating-point numbers loses most significant digits (cancellation)', 'JavaScript limits h', 'The derivative is undefined'], answer: 1, why: 'Rounding error ~ ε/h grows as h shrinks.' },
    { q: 'The gradient of f at a point points toward…', options: ['The minimum', 'The direction of steepest increase of f', 'The origin', 'Zero'], answer: 1, why: 'To decrease f, step in the *negative* gradient direction.' },
    { q: 'What happens in gradient descent if the learning rate is far too large?', options: ['It converges faster', 'Steps overshoot the minimum and the loss can diverge', 'Nothing', 'It finds a global minimum'], answer: 1, why: 'On f(x)=x², η>1 makes |x| grow every step.' },
    { q: 'Newton\'s method converges quadratically near a simple root. That means…', options: ['It always converges', 'The number of correct digits roughly doubles each iteration', 'It needs no derivative', 'It is linear'], answer: 1, why: 'Error is squared at each step once close enough.' },
  ],
  labs: [
    lab({
      id: 'm2-derivatives',
      title: 'Differentiate by hand',
      kind: 'answer',
      difficulty: 2,
      minutes: 15,
      tags: ['derivatives'],
      prompt: 'Find the derivative with respect to $x$. Any **equivalent** expression is accepted (use `^` for powers, `exp(x)` or `e^x`, `sin`, `cos`, `ln`; implicit multiplication like `3x^2` works).',
      questions: [
        { id: 'a', prompt: '$\\dfrac{d}{dx}\\,(x^3 + 2x)$', type: 'expr', vars: ['x'], answer: '3x^2 + 2' },
        { id: 'b', prompt: '$\\dfrac{d}{dx}\\,\\big(x\\,e^{x}\\big)$ (product rule)', type: 'expr', vars: ['x'], answer: 'exp(x) + x*exp(x)' },
        { id: 'c', prompt: '$\\dfrac{d}{dx}\\,\\sin(3x)$ (chain rule)', type: 'expr', vars: ['x'], answer: '3cos(3x)' },
        { id: 'd', prompt: '$\\dfrac{d}{dx}\\,\\ln(x^2+1)$', type: 'expr', vars: ['x'], answer: '2x/(x^2+1)' },
        { id: 'e', prompt: '$\\dfrac{d}{dx}\\,\\dfrac{x^2}{x+1}$ (quotient rule)', type: 'expr', vars: ['x'], answer: '(2x(x+1) - x^2)/(x+1)^2' },
        { id: 'f', prompt: '$\\dfrac{d}{dx}\\,e^{x^2}$', type: 'expr', vars: ['x'], answer: '2x*exp(x^2)' },
        { id: 'g', prompt: 'The function $f(x)=x^3-3x$ has a local minimum at which $x>0$?', type: 'number', answer: 1, explain: "f'(x) = 3x² − 3 = 0 → x = ±1; f''(1) = 6 > 0 → minimum." },
      ],
      hints: ['Chain rule: differentiate the outside, keep the inside, multiply by the derivative of the inside.', 'Quotient rule: (f′g − fg′)/g².', 'For optimisation set f′(x) = 0 and use f″ to classify.'],
    }),

    lab({
      id: 'm2-numeric-derivative',
      title: 'Numerical differentiation',
      kind: 'code',
      difficulty: 2,
      minutes: 15,
      tags: ['numerical', 'derivatives'],
      prompt: `Implement:

- \`derivative(f, x, h = 1e-5)\` — the **central difference** \`(f(x+h) − f(x−h)) / (2h)\`.
- \`secondDerivative(f, x, h = 1e-4)\` — \`(f(x+h) − 2f(x) + f(x−h)) / h²\`.
- \`gradient(f, point, h = 1e-5)\` — for \`f\` taking an **array**, return the array of partial derivatives (central differences, one coordinate at a time). Don't mutate \`point\`.`,
      expose: ['derivative', 'secondDerivative', 'gradient'],
      files: jsFile(`function derivative(f, x, h = 1e-5) {\n  \n}\n\nfunction secondDerivative(f, x, h = 1e-4) {\n  \n}\n\nfunction gradient(f, point, h = 1e-5) {\n  \n}\n`, `function derivative(f, x, h = 1e-5) {
  return (f(x + h) - f(x - h)) / (2 * h);
}

function secondDerivative(f, x, h = 1e-4) {
  return (f(x + h) - 2 * f(x) + f(x - h)) / (h * h);
}

function gradient(f, point, h = 1e-5) {
  return point.map((_, i) => {
    const plus = [...point];
    const minus = [...point];
    plus[i] += h;
    minus[i] -= h;
    return (f(plus) - f(minus)) / (2 * h);
  });
}
`),
      tests: [
        ex('derivative of x³ at 2 is 12', ({ env, expect }) => expect(env.derivative((x: number) => x ** 3, 2)).toBeNear(12, { abs: 1e-6 })),
        ex('derivative of sin at 1 is cos 1', ({ env, expect }) => expect(env.derivative(Math.sin, 1)).toBeNear(Math.cos(1), { abs: 1e-9 })),
        ex('derivative of exp is exp', ({ env, expect }) => expect(env.derivative(Math.exp, 0.5)).toBeNear(Math.exp(0.5), { abs: 1e-8 })),
        ex('second derivative of x³ at 2 is 12; of sin at 1 is −sin 1', ({ env, expect }) => {
          expect(env.secondDerivative((x: number) => x ** 3, 2)).toBeNear(12, { abs: 1e-4 });
          expect(env.secondDerivative(Math.sin, 1)).toBeNear(-Math.sin(1), { abs: 1e-5 });
        }),
        ex('gradient of f(x,y) = x²y + y³ at (2, 3)', ({ env, expect }) => {
          const g = env.gradient((p: number[]) => p[0] ** 2 * p[1] + p[1] ** 3, [2, 3]);
          expect(g[0]).toBeNear(12, { abs: 1e-5 });
          expect(g[1]).toBeNear(31, { abs: 1e-5 });
        }),
        ex('gradient does not mutate the point', ({ env, expect }) => {
          const p = [1, 2, 3];
          env.gradient((q: number[]) => q[0] + q[1] + q[2], p);
          expect(p).toEqual([1, 2, 3]);
        }),
        prop('property: matches the analytic derivative of random cubics', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(-5, 5), gen.int(-5, 5), gen.int(-5, 5), gen.int(-9, 9)], (a: number, b: number, c: number, x: number) => {
            const f = (t: number) => a * t ** 3 + b * t ** 2 + c * t;
            expect(env.derivative(f, x / 3)).toBeNear(3 * a * (x / 3) ** 2 + 2 * b * (x / 3) + c, { abs: 1e-5, rel: 1e-7 });
          });
        }),
      ],
      hints: ['Central difference: `(f(x + h) - f(x - h)) / (2 * h)`.', 'Second derivative: the three-point formula divided by `h * h`.', 'Gradient: for each coordinate make two copies of the point, nudge coordinate `i` by `+h` and `−h`, and apply the central difference.'],
    }),

    lab({
      id: 'm2-simpson',
      title: 'Numerical integration (trapezoid vs Simpson)',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['numerical', 'integration'],
      prompt: `Implement composite rules over \`[a, b]\` with \`n\` subintervals (a negative-orientation integral, \`a > b\`, returns the negated integral):

- \`trapezoid(f, a, b, n = 1000)\`
- \`simpson(f, a, b, n = 1000)\` — if \`n\` is odd, use \`n + 1\`. Exact for cubics.`,
      expose: ['trapezoid', 'simpson'],
      files: jsFile(`function trapezoid(f, a, b, n = 1000) {\n  \n}\n\nfunction simpson(f, a, b, n = 1000) {\n  \n}\n`, `function trapezoid(f, a, b, n = 1000) {
  const h = (b - a) / n;
  let sum = (f(a) + f(b)) / 2;
  for (let i = 1; i < n; i++) sum += f(a + i * h);
  return sum * h;
}

function simpson(f, a, b, n = 1000) {
  if (n % 2 === 1) n++;
  const h = (b - a) / n;
  let sum = f(a) + f(b);
  for (let i = 1; i < n; i++) sum += f(a + i * h) * (i % 2 === 1 ? 4 : 2);
  return (sum * h) / 3;
}
`),
      tests: [
        ex('∫₀¹ x² dx = 1/3', ({ env, expect }) => {
          expect(env.trapezoid((x: number) => x * x, 0, 1, 1000)).toBeNear(1 / 3, { abs: 1e-6 });
          expect(env.simpson((x: number) => x * x, 0, 1, 10)).toBeNear(1 / 3, { abs: 1e-12 });
        }),
        ex('Simpson is exact for cubics even with n = 2', ({ env, expect }) => expect(env.simpson((x: number) => 4 * x ** 3 - 2 * x + 1, 0, 2, 2)).toBeNear(14, { abs: 1e-10 })),
        ex('∫₀^π sin x dx = 2', ({ env, expect }) => {
          expect(env.simpson(Math.sin, 0, Math.PI, 100)).toBeNear(2, { abs: 1e-7 });
          expect(env.trapezoid(Math.sin, 0, Math.PI, 100)).toBeNear(2, { abs: 2e-3 });
        }),
        ex('Simpson converges faster than the trapezoid rule', ({ env, expect }) => {
          const err = (v: number) => Math.abs(v - (Math.E - 1));
          expect(err(env.simpson(Math.exp, 0, 1, 20))).toBeLessThan(err(env.trapezoid(Math.exp, 0, 1, 20)) / 1000);
        }),
        ex('reversed limits give the negative; odd n is accepted for Simpson', ({ env, expect }) => {
          expect(env.simpson((x: number) => x * x, 1, 0, 10)).toBeNear(-1 / 3, { abs: 1e-9 });
          expect(env.simpson((x: number) => x * x, 0, 1, 7)).toBeNear(1 / 3, { abs: 1e-9 });
        }),
        perf('uses one function evaluation per node (n = 100,000)', async ({ env, expect, measure }) => {
          let calls = 0;
          const { steps } = await measure(() => env.simpson((x: number) => (calls++, x), 0, 1, 100000), { budget: 4_000_000 });
          expect(calls).toBe(100001);
          expect(steps).toBeLessThan(250_000);
        }),
      ],
      hints: ['Trapezoid: `h * ((f(a) + f(b)) / 2 + Σ f(a + i h))` for `i = 1 … n-1`.', 'Simpson weights: ends 1, odd interior nodes 4, even interior nodes 2; multiply the total by `h / 3`.', 'Reversed limits fall out naturally if `h = (b - a) / n` is negative.'],
    }),

    lab({
      id: 'm2-newton-gd',
      title: 'Newton\'s method and gradient descent',
      kind: 'code',
      difficulty: 3,
      minutes: 25,
      tags: ['optimisation', 'numerical'],
      interview: true,
      prompt: `**\`newton(f, df, x0, tol = 1e-12, maxIter = 50)\`** — find a root of \`f\` starting from \`x0\` using \`x ← x − f(x)/df(x)\`. Return \`x\` once \`|f(x)| < tol\`. Return \`null\` if \`df(x)\` is (almost) zero (\`|df| < 1e-14\`) or you run out of iterations.

**\`gradientDescent(grad, x0, { lr = 0.1, steps = 100 })\`** — \`grad\` maps an array point to its gradient array. Start at \`x0\` (don't mutate it) and take \`steps\` steps \`x ← x − lr·grad(x)\`; return the final point.

Also **\`sqrtNewton(a)\`** — \`√a\` for \`a ≥ 0\` using Newton's iteration \`x ← (x + a/x)/2\` (no \`Math.sqrt\`); \`sqrtNewton(0)\` is \`0\`; negative input throws a \`RangeError\`.`,
      expose: ['newton', 'gradientDescent', 'sqrtNewton'],
      files: jsFile(`function newton(f, df, x0, tol = 1e-12, maxIter = 50) {\n  \n}\n\nfunction gradientDescent(grad, x0, { lr = 0.1, steps = 100 } = {}) {\n  \n}\n\nfunction sqrtNewton(a) {\n  \n}\n`, `function newton(f, df, x0, tol = 1e-12, maxIter = 50) {
  let x = x0;
  for (let i = 0; i < maxIter; i++) {
    const fx = f(x);
    if (Math.abs(fx) < tol) return x;
    const d = df(x);
    if (Math.abs(d) < 1e-14) return null;
    x -= fx / d;
  }
  return Math.abs(f(x)) < tol ? x : null;
}

function gradientDescent(grad, x0, { lr = 0.1, steps = 100 } = {}) {
  let x = [...x0];
  for (let i = 0; i < steps; i++) {
    const g = grad(x);
    x = x.map((v, k) => v - lr * g[k]);
  }
  return x;
}

function sqrtNewton(a) {
  if (a < 0) throw new RangeError('square root of a negative number');
  if (a === 0) return 0;
  let x = a >= 1 ? a : 1;
  for (let i = 0; i < 100; i++) {
    const next = (x + a / x) / 2;
    if (Math.abs(next - x) <= 1e-15 * next) return next;
    x = next;
  }
  return x;
}
`),
      tests: [
        ex('newton finds √2', ({ env, expect }) => expect(env.newton((x: number) => x * x - 2, (x: number) => 2 * x, 1)).toBeNear(Math.SQRT2, { abs: 1e-10 })),
        ex('newton finds a root of cos', ({ env, expect }) => expect(env.newton(Math.cos, (x: number) => -Math.sin(x), 1)).toBeNear(Math.PI / 2, { abs: 1e-9 })),
        ex('newton gives up on a zero derivative or too few iterations', ({ env, expect }) => {
          expect(env.newton((x: number) => x * x + 1, (x: number) => 2 * x, 0)).toBe(null);
          expect(env.newton((x: number) => x * x - 2, (x: number) => 2 * x, 1, 1e-12, 2)).toBe(null);
          expect(env.newton((x: number) => x * x + 1, (x: number) => 2 * x, 1, 1e-12, 30)).toBe(null); // no real root
        }),
        ex('gradient descent minimises a bowl', ({ env, expect }) => {
          const g = ([x, y]: number[]) => [2 * (x - 3), 4 * (y + 1)];
          const p = env.gradientDescent(g, [0, 0], { lr: 0.1, steps: 200 });
          expect(p[0]).toBeNear(3, { abs: 1e-6 });
          expect(p[1]).toBeNear(-1, { abs: 1e-6 });
        }),
        ex('gradient descent does not mutate the start point; defaults work', ({ env, expect }) => {
          const x0 = [5];
          const out = env.gradientDescent((x: number[]) => [2 * x[0]], x0);
          expect(x0).toEqual([5]);
          expect(Math.abs(out[0])).toBeLessThan(1e-3);
        }),
        ex('a learning rate that is too large diverges', ({ env, expect }) => {
          const out = env.gradientDescent((x: number[]) => [2 * x[0]], [1], { lr: 1.5, steps: 20 });
          expect(Math.abs(out[0])).toBeGreaterThan(1e5);
        }),
        ex('sqrtNewton', ({ env, expect }) => {
          for (const a of [0, 1, 2, 9, 0.25, 1e-6, 12345.678, 1e10]) expect(env.sqrtNewton(a)).toBeNear(Math.sqrt(a), { rel: 1e-12, abs: 1e-15 });
          expect(() => env.sqrtNewton(-1)).toThrow('negative');
        }),
        prop('property: sqrtNewton(x)² ≈ x', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.float(0, 1000)], (x: number) => expect(env.sqrtNewton(x) ** 2).toBeNear(x, { rel: 1e-10, abs: 1e-12 }));
        }),
        hid('does not use Math.sqrt', ({ code, expect }) => expect(/Math\s*\.\s*sqrt|\*\*\s*0\.5/.test(code)).toBe(false), 'structural'),
      ],
      hints: ['`newton`: loop up to `maxIter` times: if `|f(x)| < tol` return `x`; compute `d = df(x)`; if `|d|` is tiny return `null`; update `x -= f(x) / d`.', '`gradientDescent`: copy the point, then repeat `x = x.map((v, i) => v - lr * g[i])` with `g = grad(x)`.', '`sqrtNewton`: start from a guess like `max(a, 1)`, iterate `(x + a/x) / 2` until it stops changing.'],
    }),
  ],
  references: [
    { title: '3Blue1Brown — Essence of Calculus (video series)', url: 'https://www.3blue1brown.com/topics/calculus' },
    { title: 'What Every Computer Scientist Should Know About Floating-Point Arithmetic — David Goldberg' },
  ],
};
export default mod;
