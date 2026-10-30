import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';
import { Rng } from '../../grader/rng';

const HEAP = `class MinHeap {
  constructor(compare = (a, b) => a - b) {
    this.compare = compare;
    this.data = [];
  }
  get size() {
    return this.data.length;
  }
  push(x) {
    const d = this.data;
    d.push(x);
    let i = d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.compare(d[i], d[p]) >= 0) break;
      [d[i], d[p]] = [d[p], d[i]];
      i = p;
    }
  }
  pop() {
    const d = this.data;
    if (d.length === 0) return undefined;
    const top = d[0];
    const last = d.pop();
    if (d.length) {
      d[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < d.length && this.compare(d[l], d[m]) < 0) m = l;
        if (r < d.length && this.compare(d[r], d[m]) < 0) m = r;
        if (m === i) break;
        [d[i], d[m]] = [d[m], d[i]];
        i = m;
      }
    }
    return top;
  }
}
`;

const mod: Module = {
  id: 'estimation-control',
  course: 'ai-ml',
  title: 'Autonomy Stack: State Estimation (Kalman), Control (PID) & Planning (A*)',
  minutes: 130,
  objectives: [
    'Explain the sense → estimate → plan → control loop used in robots and self-driving systems',
    'Implement a Kalman filter to track position and velocity from noisy measurements',
    'Implement a PID controller with output clamping and anti-windup, and understand its trade-offs',
    'Plan shortest paths with A* and its admissible heuristics',
  ],
  body: `
## The autonomy loop

Robots, drones and self-driving cars all run (at 10–100 Hz) some version of:

\`\`\`
 sensors ─► PERCEPTION ─► STATE ESTIMATION ─► PREDICTION ─► PLANNING ─► CONTROL ─► actuators
 (cameras,   (detect &      (where am I? where  (where will    (choose a   (steer, brake,   (motors,
  radar,      classify)      is everything?)      others go?)    path)       throttle)        wheels)
  lidar, IMU)
\`\`\`

Deep networks dominate **perception** (and increasingly prediction/planning), but the rest is classical engineering — and understanding it is what lets you debug a vehicle that "drifts", jitters or oscillates. Sensors are **noisy**, **delayed** and **sometimes wrong**, so the system must reason about **uncertainty** — the rest of this module is three tools for that.

## State estimation and the Kalman filter

We want the **true state** $x$ (position, velocity, …) but only see noisy measurements $z$. A **Kalman filter** is the optimal recursive estimator for a **linear** system with **Gaussian** noise. It keeps a **belief**: a mean $\\hat x$ and an uncertainty (variance $P$), and alternates:

**1. Predict** — push the belief forward with the motion model; uncertainty **grows** by the process noise $Q$ (the world is unpredictable):
$$\\hat x^{-}=F\\hat x,\\qquad P^{-}=FPF^{\\top}+Q$$

**2. Update** — fuse a new measurement $z=Hx+\\text{noise}(R)$; uncertainty **shrinks**:
$$K=P^{-}H^{\\top}\\big(HP^{-}H^{\\top}+R\\big)^{-1},\\quad \\hat x=\\hat x^{-}+K\\,(z-H\\hat x^{-}),\\quad P=(I-KH)P^{-}$$

The **Kalman gain** $K\\in[0,1]$ (in 1-D) is the key idea: **how much to trust the measurement vs the prediction**. If the sensor is noisy ($R$ large) $K$ is small — mostly believe the prediction; if the model is uncertain ($P^{-}$ large) $K$ is big — mostly believe the sensor. The result is a weighted average that is *better than either* source, with a variance smaller than both.

**1-D scalar form (constant position):** $K=\\dfrac{P^-}{P^-+R}$, $\\hat x=\\hat x^-+K(z-\\hat x^-)$, $P=(1-K)P^-$.

**Constant-velocity model** (state $[p, v]$, time step $\\Delta t$): $F=\\begin{pmatrix}1&\\Delta t\\\\0&1\\end{pmatrix}$, measure position only: $H=(1\\ 0)$. The filter *infers the velocity* it never measures — from how the position changes. This is how a tracker follows a car from radar returns, and it's the backbone of **sensor fusion** (GPS + IMU + wheel odometry): each sensor gets its own $R$.

Extensions: **EKF/UKF** for non-linear models (linearise or sample), **particle filters** for multi-modal beliefs, **data association** (which measurement belongs to which track — Hungarian algorithm, gating), and **SLAM** (build a map while localising).

## Control and the PID controller

Given an estimate of the state and a **setpoint**, the controller chooses the actuator command. **PID** (proportional–integral–derivative) is the workhorse of industry (cruise control, thermostats, drones, motor drives):
$$u(t)=\\underbrace{K_p\\,e(t)}_{\\text{P: present}}+\\underbrace{K_i\\!\\int e\\,dt}_{\\text{I: past}}+\\underbrace{K_d\\,\\frac{de}{dt}}_{\\text{D: future}},\\qquad e=\\text{setpoint}-\\text{measurement}$$

- **P** pushes in proportion to the error. Alone it leaves a **steady-state error** (the push vanishes as $e\\to0$ while a load still needs force).
- **I** accumulates error and removes the steady-state offset — but too much causes **overshoot and oscillation**, and **integral windup**: when the actuator saturates (a car at full throttle), the integral keeps growing and causes a huge overshoot later. **Anti-windup** stops integrating while saturated.
- **D** reacts to the *rate of change*, damping oscillation; but it **amplifies noise** (filter the derivative, or differentiate the measurement instead of the error to avoid a "kick" when the setpoint jumps).

Tuning: start with $K_p$ only, raise it until the response oscillates then back off; add $K_d$ to damp; add a small $K_i$ to remove offset (Ziegler–Nichols and auto-tuners formalise this). Real stacks go further: **feed-forward** terms, gain scheduling, **model predictive control (MPC)** which optimises a trajectory over a horizon under constraints (used in modern autonomous driving and rockets).

\`\`\`js run
// A first-order plant (think: cruise control)  v' = -v + u ;  P-only control leaves a steady-state error
let v = 0;
const Kp = 4, target = 10, dt = 0.05;
for (let t = 0; t < 200; t++) { const u = Kp * (target - v); v += dt * (-v + u); }
console.log("final speed:", v.toFixed(3), "(target 10)  → error", (target - v).toFixed(3));   // 2.000 — P alone cannot reach it
\`\`\`

## Planning: A*

**Path planning** finds a collision-free route. On a **grid** (or a graph of lane segments), **Dijkstra** explores outward in all directions; **A\\*** adds a **heuristic** $h(n)$ — an estimate of the remaining distance to the goal — and always expands the node with the smallest $f(n)=g(n)+h(n)$, where $g$ is the cost so far. If $h$ is **admissible** (never overestimates the true remaining cost) the first time you pop the goal is a **shortest path**, and with a **consistent** heuristic no node is expanded twice. On a 4-connected grid the **Manhattan distance** $|\\Delta r|+|\\Delta c|$ is admissible; on an 8-connected grid use octile/Euclidean. A better heuristic ⇒ fewer expansions; $h=0$ is Dijkstra; an inadmissible (too large) heuristic is faster but may return a longer path (weighted A*).

Production planners add: continuous-space planners (RRT*, lattice planners, hybrid A* for cars respecting turning radius), **cost maps** (obstacle inflation), replanning when the world changes (D* Lite), and **trajectory optimisation**.

:::interview
"How would a self-driving car know where the car ahead is going?" — Detect it (neural net), track it with a Kalman filter (state = position/velocity, with data association between frames), predict its future trajectory (constant-velocity baseline, then learned motion models), feed that to the planner as a moving obstacle. Mention uncertainty at every step.
:::

:::warn
Estimators and controllers fail in characteristic ways: a **diverging Kalman filter** (wrong $Q/R$, unmodelled dynamics, a bad outlier measurement — gate outliers), an **oscillating** PID (gain too high or delay in the loop), **windup**, and **latency** (acting on an old state). Always plot estimate vs truth and the innovation $z-H\\hat x^-$.
:::
`,
  quiz: [
    { q: 'In a 1-D Kalman filter the sensor noise R is very large compared with the prediction uncertainty P. The gain K is…', options: ['Close to 1: trust the measurement', 'Close to 0: mostly ignore the noisy measurement', 'Exactly 0.5', 'Negative'], answer: 1, why: 'K = P/(P+R) → 0 when R ≫ P.' },
    { q: 'What happens to the filter\'s uncertainty P in the predict step?', options: ['It shrinks', 'It grows by the process noise Q', 'It resets to 0', 'It is unchanged'], answer: 1, why: 'The world may have changed since the last update.' },
    { q: 'A pure P controller leaves a steady-state error because…', options: ['Kp is too high', 'As the error shrinks the control effort shrinks too, yet a constant load still needs a non-zero effort', 'The sensor is noisy', 'Of the derivative term'], answer: 1, why: 'The integral term supplies the missing constant effort.' },
    { q: 'What is integral windup?', options: ['A noisy derivative', 'The integral keeps accumulating while the actuator is saturated, causing a large overshoot when the error finally changes sign', 'A tuning method', 'A sensor fault'], answer: 1, why: 'Anti-windup stops (or undoes) integration while saturated.' },
    { q: 'A* is guaranteed to return a shortest path when its heuristic is…', options: ['Zero everywhere only', 'Admissible: it never overestimates the remaining cost', 'Very large', 'Random'], answer: 1, why: 'Overestimating can make A* pop the goal along a non-optimal route.' },
  ],
  labs: [
    lab({
      id: 'ai6-kalman',
      title: 'A Kalman filter: track position and velocity',
      kind: 'code',
      difficulty: 4,
      minutes: 45,
      tags: ['kalman', 'estimation', 'sensor-fusion'],
      interview: true,
      prompt: `Implement two filters.

**\`Kalman1D(x0, p0, q, r)\`** — scalar, constant-position model.
- \`predict()\`: \`P += q\`.
- \`update(z)\`: \`K = P/(P+r)\`; \`x += K(z − x)\`; \`P = (1 − K)P\`. Return the new estimate \`x\`.
- properties \`x\` (estimate), \`p\` (variance), \`gain\` (the last K).

**\`KalmanCV(dt, q, r, { x0 = 0, v0 = 0, p0 = 1000 } = {})\`** — constant-velocity model, state \`[pos, vel]\`, measuring **position only**.
- \`F = [[1, dt],[0, 1]]\`, \`H = [1, 0]\`, covariance \`P\` starts as \`p0·I\`.
- **Process noise** (discrete white-noise acceleration): \`Q = q·[[dt³/3, dt²/2],[dt²/2, dt]]\`.
- \`predict()\`: \`x ← F x\`, \`P ← F P Fᵀ + Q\`.
- \`update(z)\` (scalar measurement variance \`r\`): \`S = P00 + r\`, \`K = [P00/S, P10/S]\`, \`y = z − x0\`, \`x ← x + K·y\`, \`P ← (I − K H) P\` (use the standard form \`P ← P − K·[P00, P01]\` i.e. \`Pij −= Ki·P0j\`).
- \`step(z)\` = \`predict()\` then \`update(z)\`, returning \`{ pos, vel }\`. Also properties \`pos\`, \`vel\`, and \`cov\` (a copy of P).

Write the 2×2 algebra out by hand.`,
      expose: ['Kalman1D', 'KalmanCV'],
      files: jsFile(`class Kalman1D {
  constructor(x0, p0, q, r) {
    this.x = x0;
    this.p = p0;
    this.q = q;
    this.r = r;
    this.gain = 0;
  }

  predict() {}
  update(z) {}
}

class KalmanCV {
  constructor(dt, q, r, { x0 = 0, v0 = 0, p0 = 1000 } = {}) {
    this.dt = dt;
    this.q = q;
    this.r = r;
    // state [pos, vel] and 2×2 covariance P
  }

  predict() {}
  update(z) {}
  step(z) {}
}
`, `class Kalman1D {
  constructor(x0, p0, q, r) {
    this.x = x0;
    this.p = p0;
    this.q = q;
    this.r = r;
    this.gain = 0;
  }

  predict() {
    this.p += this.q;
  }

  update(z) {
    this.gain = this.p / (this.p + this.r);
    this.x += this.gain * (z - this.x);
    this.p = (1 - this.gain) * this.p;
    return this.x;
  }
}

class KalmanCV {
  constructor(dt, q, r, { x0 = 0, v0 = 0, p0 = 1000 } = {}) {
    this.dt = dt;
    this.q = q;
    this.r = r;
    this.s = [x0, v0];
    this.P = [[p0, 0], [0, p0]];
  }

  get pos() {
    return this.s[0];
  }

  get vel() {
    return this.s[1];
  }

  get cov() {
    return this.P.map((row) => [...row]);
  }

  predict() {
    const dt = this.dt;
    const [p, v] = this.s;
    this.s = [p + dt * v, v];
    const [[a, b], [c, d]] = this.P;
    // F P Fᵀ with F = [[1, dt],[0, 1]]
    const n00 = a + dt * (b + c) + dt * dt * d;
    const n01 = b + dt * d;
    const n10 = c + dt * d;
    const n11 = d;
    const q = this.q;
    this.P = [
      [n00 + (q * dt ** 3) / 3, n01 + (q * dt ** 2) / 2],
      [n10 + (q * dt ** 2) / 2, n11 + q * dt],
    ];
  }

  update(z) {
    const [[p00, p01], [p10, p11]] = this.P;
    const S = p00 + this.r;
    const k0 = p00 / S;
    const k1 = p10 / S;
    const y = z - this.s[0];
    this.s = [this.s[0] + k0 * y, this.s[1] + k1 * y];
    this.P = [
      [p00 - k0 * p00, p01 - k0 * p01],
      [p10 - k1 * p00, p11 - k1 * p01],
    ];
  }

  step(z) {
    this.predict();
    this.update(z);
    return { pos: this.pos, vel: this.vel };
  }
}
`),
      tests: [
        ex('Kalman1D: the gain, estimate and variance for one update', ({ env, expect }) => {
          const k = new env.Kalman1D(0, 4, 0, 4);
          expect(k.update(10)).toBe(5);
          expect(k.gain).toBe(0.5);
          expect(k.p).toBe(2);
        }),
        ex('Kalman1D: predict inflates the variance by q', ({ env, expect }) => {
          const k = new env.Kalman1D(0, 1, 0.5, 1);
          k.predict();
          expect(k.p).toBe(1.5);
          expect(k.x).toBe(0);
        }),
        ex('Kalman1D: a perfect sensor (r = 0) jumps to the measurement; an awful sensor is ignored', ({ env, expect }) => {
          const a = new env.Kalman1D(0, 1, 0, 0);
          expect(a.update(7)).toBe(7);
          expect(a.p).toBe(0);
          const b = new env.Kalman1D(3, 1, 0, 1e12);
          b.update(100);
          expect(b.x).toBeNear(3, { abs: 1e-6 });
        }),
        ex('Kalman1D converges to a constant hidden value despite noisy measurements', ({ env, expect, rng }) => {
          const r = rng(1);
          const k = new env.Kalman1D(0, 100, 1e-6, 4);
          let est = 0;
          for (let i = 0; i < 400; i++) { k.predict(); est = k.update(50 + r.normal(0, 2)); }
          expect(est).toBeNear(50, { abs: 0.5 });
          expect(k.p).toBeLessThan(0.1);
          expect(k.gain).toBeLessThan(0.1);
        }),
        ex('KalmanCV: first update from the prior (hand-checked numbers)', ({ env, expect }) => {
          const kf = new env.KalmanCV(1, 0, 1, { x0: 0, v0: 0, p0: 10 });
          kf.update(5); // P = 10 I, S = 11 ; K = [10/11, 0]
          expect(kf.pos).toBeNear(50 / 11, { abs: 1e-12 });
          expect(kf.vel).toBe(0);
          const P = kf.cov;
          expect(P[0][0]).toBeNear(10 - 100 / 11, { abs: 1e-12 });
          expect(P[1][1]).toBe(10);
        }),
        ex('KalmanCV: predict with F and Q', ({ env, expect }) => {
          const kf = new env.KalmanCV(0.5, 2, 1, { x0: 1, v0: 4, p0: 3 });
          kf.predict();
          expect(kf.pos).toBe(3); // 1 + 0.5·4
          const P = kf.cov;
          // F P Fᵀ for P = 3I: [[3 + 0.25·3, 0.5·3],[0.5·3, 3]] ; Q = 2·[[0.125/3, 0.125],[0.125, 0.5]]
          expect(P[0][0]).toBeNear(3.75 + (2 * 0.125) / 3, { abs: 1e-12 });
          expect(P[0][1]).toBeNear(1.5 + 0.25, { abs: 1e-12 });
          expect(P[1][0]).toBeNear(1.5 + 0.25, { abs: 1e-12 });
          expect(P[1][1]).toBeNear(3 + 1, { abs: 1e-12 });
        }),
        ex('KalmanCV infers a velocity it never measures', ({ env, expect, rng }) => {
          const r = rng(7);
          const kf = new env.KalmanCV(0.1, 0.01, 4);
          let out = { pos: 0, vel: 0 };
          for (let t = 1; t <= 150; t++) out = kf.step(5 + 3 * (t * 0.1) + r.normal(0, 2));
          expect(out.vel).toBeNear(3, { abs: 0.5 });
          expect(out.pos).toBeNear(5 + 3 * 15, { abs: 1.5 });
        }),
        ex('the filter beats the raw sensor (RMSE of the estimate < RMSE of the measurements)', ({ env, expect, rng }) => {
          const r = rng(11);
          const kf = new env.KalmanCV(0.1, 0.05, 9);
          let se = 0, sm = 0;
          for (let t = 1; t <= 300; t++) {
            const truth = 2 * t * 0.1;
            const z = truth + r.normal(0, 3);
            const { pos } = kf.step(z);
            if (t > 30) { se += (pos - truth) ** 2; sm += (z - truth) ** 2; }
          }
          expect(Math.sqrt(se)).toBeLessThan(Math.sqrt(sm) * 0.6);
        }),
        prop('property: the covariance stays symmetric, positive and shrinks after an update', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 9999)], (seed: number) => {
            const r = new Rng(seed);
            const kf = new env.KalmanCV(0.2, 0.1, 2);
            for (let t = 0; t < 40; t++) {
              kf.predict();
              const before = kf.cov;
              kf.update(r.normal(t * 0.4, 1.5));
              const P = kf.cov;
              expect(P[0][1]).toBeNear(P[1][0], { abs: 1e-6, rel: 1e-6 });
              expect(P[0][0]).toBeGreaterThan(0);
              expect(P[1][1]).toBeGreaterThan(0);
              expect(P[0][0]).toBeLessThanOrEqual(before[0][0] + 1e-9);
            }
          }, { runs: 30 });
        }),
      ],
      hints: [
        '`Kalman1D.update`: `gain = p / (p + r)`, then `x += gain·(z − x)` and `p = (1 − gain)·p`. `predict` is just `p += q`.',
        'For `KalmanCV.predict` the state moves `[pos + dt·vel, vel]`. Expand `F P Fᵀ` for `F = [[1, dt],[0,1]]`: `P00 + dt(P01 + P10) + dt²P11`, `P01 + dt·P11`, `P10 + dt·P11`, `P11`; then add the `Q` matrix.',
        '`update`: since you measure position only, `S = P00 + r`, the gain is `K = [P00/S, P10/S]`, the innovation is `y = z − pos`, and the covariance becomes `P_ij −= K_i · P_0j`.',
        'Note how a position residual corrects the *velocity* too, through `K[1] = P10/S` — that cross-covariance is built up by the predict step.',
      ],
      why: 'Every GPS receiver, drone, spacecraft and driver-assistance system runs filters like this.',
    }),

    lab({
      id: 'ai6-pid',
      title: 'A PID controller with anti-windup',
      kind: 'code',
      difficulty: 3,
      minutes: 35,
      tags: ['control', 'pid'],
      interview: true,
      prompt: `Implement \`class PID\` with options \`{ kp = 0, ki = 0, kd = 0, dt = 1, min = -Infinity, max = Infinity }\`.

\`update(setpoint, measurement)\` → control output:
1. \`error = setpoint − measurement\`
2. \`P = kp·error\`
3. tentatively \`integral += error·dt\`; \`I = ki·integral\`
4. \`D = kd·(error − prevError)/dt\` (zero on the **first** call)
5. \`raw = P + I + D\`; \`output = clamp(raw, min, max)\`
6. **Anti-windup (conditional integration):** if the output was clamped **and** \`error\` has the same sign as the saturation (positive error while clamped at \`max\`, negative error while clamped at \`min\`), **undo** this step's integration (\`integral −= error·dt\`).
7. remember \`prevError\`; return \`output\`.

\`reset()\` clears the integral and the previous error.`,
      expose: ['PID'],
      files: jsFile(`class PID {
  constructor({ kp = 0, ki = 0, kd = 0, dt = 1, min = -Infinity, max = Infinity } = {}) {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
    this.dt = dt;
    this.min = min;
    this.max = max;
    this.integral = 0;
    this.prevError = null;
  }

  update(setpoint, measurement) {}

  reset() {}
}
`, `class PID {
  constructor({ kp = 0, ki = 0, kd = 0, dt = 1, min = -Infinity, max = Infinity } = {}) {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
    this.dt = dt;
    this.min = min;
    this.max = max;
    this.integral = 0;
    this.prevError = null;
  }

  update(setpoint, measurement) {
    const error = setpoint - measurement;
    const p = this.kp * error;
    this.integral += error * this.dt;
    const i = this.ki * this.integral;
    const d = this.prevError === null ? 0 : (this.kd * (error - this.prevError)) / this.dt;
    const raw = p + i + d;
    const output = Math.min(this.max, Math.max(this.min, raw));
    if (output !== raw && ((output === this.max && error > 0) || (output === this.min && error < 0))) this.integral -= error * this.dt;
    this.prevError = error;
    return output;
  }

  reset() {
    this.integral = 0;
    this.prevError = null;
  }
}
`),
      tests: [
        ex('proportional only', ({ env, expect }) => {
          const pid = new env.PID({ kp: 2 });
          expect(pid.update(10, 4)).toBe(12);
          expect(pid.update(10, 10)).toBe(0);
        }),
        ex('integral accumulates error × dt', ({ env, expect }) => {
          const pid = new env.PID({ ki: 1, dt: 0.5 });
          expect(pid.update(4, 0)).toBe(2); // integral = 4·0.5
          expect(pid.update(4, 0)).toBe(4); // integral = 4
        }),
        ex('derivative is zero on the first call, then (Δerror)/dt', ({ env, expect }) => {
          const pid = new env.PID({ kd: 3, dt: 0.5 });
          expect(pid.update(10, 0)).toBe(0);
          expect(pid.update(10, 4)).toBeNear(3 * ((6 - 10) / 0.5), { abs: 1e-12 }); // error went 10 → 6
        }),
        ex('output is clamped to [min, max]', ({ env, expect }) => {
          const pid = new env.PID({ kp: 10, min: -1, max: 1 });
          expect(pid.update(5, 0)).toBe(1);
          expect(pid.update(-5, 0)).toBe(-1);
          expect(pid.update(0.05, 0)).toBeNear(0.5);
        }),
        ex('anti-windup: the integral stops growing while saturated against the error', ({ env, expect }) => {
          const pid = new env.PID({ kp: 1, ki: 1, dt: 1, min: -5, max: 5 });
          for (let i = 0; i < 100; i++) pid.update(100, 0); // hopelessly saturated
          expect(pid.integral).toBeLessThan(10);
        }),
        ex('anti-windup in practice: after a long saturation the controller recovers quickly when the setpoint flips', ({ env, expect }) => {
          const run = (kiGain: number) => {
            const pid = new env.PID({ kp: 1, ki: kiGain, dt: 1, min: -5, max: 5 });
            for (let i = 0; i < 100; i++) pid.update(100, 0);
            return pid.update(-10, 0); // error flips sign
          };
          expect(run(1)).toBeLessThan(0); // without anti-windup the stored integral (~9,000) would keep the output saturated at +5
        }),
        ex('reset clears the memory', ({ env, expect }) => {
          const pid = new env.PID({ kp: 1, ki: 1, kd: 1 });
          pid.update(5, 0); pid.update(5, 1);
          pid.reset();
          expect(pid.update(2, 0)).toBe(2 + 2 + 0);
        }),
        ex('closed loop: PI removes the steady-state error that P-only leaves (first-order plant)', ({ env, expect }) => {
          const simulate = (cfg: any) => {
            const pid = new env.PID({ dt: 0.05, ...cfg });
            let v = 0;
            for (let t = 0; t < 600; t++) { const u = pid.update(10, v); v += 0.05 * (-v + u); }
            return v;
          };
          const pOnly = simulate({ kp: 4 });
          const pi = simulate({ kp: 4, ki: 2 });
          expect(Math.abs(10 - pOnly)).toBeGreaterThan(1.5);
          expect(Math.abs(10 - pi)).toBeLessThan(0.05);
        }),
        ex('closed loop with a saturating actuator still settles (no runaway windup)', ({ env, expect }) => {
          const pid = new env.PID({ kp: 2, ki: 1.5, dt: 0.05, min: 0, max: 8 });
          let v = 0, maxV = 0;
          for (let t = 0; t < 1500; t++) { const u = pid.update(6, v); v += 0.05 * (-v + u); maxV = Math.max(maxV, v); }
          expect(v).toBeNear(6, { abs: 0.1 });
          expect(maxV).toBeLessThan(6.6);
        }),
      ],
      hints: ['Compute `error`, add `error·dt` to `integral`, and form `P + I + D`.', 'Clamp with `Math.min(max, Math.max(min, raw))`.', 'Anti-windup: if the clamped output differs from `raw` and the error pushes further into the limit (`error > 0` at `max`, `error < 0` at `min`), subtract this step\'s `error·dt` back out of the integral.', 'Store `prevError` at the end; `null` means "first call" (derivative 0).'],
    }),

    lab({
      id: 'ai6-astar',
      title: 'A* path planning on a grid',
      kind: 'code',
      difficulty: 4,
      minutes: 35,
      tags: ['planning', 'search'],
      interview: true,
      prompt: `A \`MinHeap\` (comparator-based) is provided. \`grid[r][c]\` is \`0\` (free) or \`1\` (obstacle). Moves are 4-directional with cost 1.

\`astar(grid, start, goal)\` where \`start\`/\`goal\` are \`[row, col]\` → \`{ path, cost, expanded }\`:
- \`path\`: array of \`[r, c]\` from \`start\` to \`goal\` inclusive, or \`null\` if unreachable (then \`cost\` is \`-1\`);
- \`cost\`: number of moves of the **shortest** path;
- \`expanded\`: how many distinct cells were **popped and expanded** (the goal counts).

Use **f = g + h** with the **Manhattan distance** heuristic. Ties in \`f\` prefer the larger \`g\` (deeper nodes). Start or goal on an obstacle → unreachable.`,
      expose: ['astar'],
      files: jsFile(HEAP + `
function astar(grid, start, goal) {
  
}
`, HEAP + `
function astar(grid, start, goal) {
  const rows = grid.length;
  const cols = rows ? grid[0].length : 0;
  const key = (r, c) => r * cols + c;
  const h = (r, c) => Math.abs(r - goal[0]) + Math.abs(c - goal[1]);
  const ok = ([r, c]) => r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c] === 0;
  if (!rows || !ok(start) || !ok(goal)) return { path: null, cost: -1, expanded: 0 };
  const best = new Map([[key(...start), 0]]);
  const parent = new Map();
  const heap = new MinHeap((a, b) => a.f - b.f || b.g - a.g);
  heap.push({ r: start[0], c: start[1], g: 0, f: h(...start) });
  const closed = new Set();
  let expanded = 0;
  while (heap.size) {
    const cur = heap.pop();
    const k = key(cur.r, cur.c);
    if (closed.has(k)) continue;
    closed.add(k);
    expanded++;
    if (cur.r === goal[0] && cur.c === goal[1]) {
      const path = [[cur.r, cur.c]];
      let p = parent.get(k);
      while (p !== undefined) {
        path.push([Math.floor(p / cols), p % cols]);
        p = parent.get(p);
      }
      return { path: path.reverse(), cost: cur.g, expanded };
    }
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = cur.r + dr;
      const nc = cur.c + dc;
      if (!ok([nr, nc])) continue;
      const nk = key(nr, nc);
      const g = cur.g + 1;
      if (g < (best.get(nk) ?? Infinity)) {
        best.set(nk, g);
        parent.set(nk, k);
        heap.push({ r: nr, c: nc, g, f: g + h(nr, nc) });
      }
    }
  }
  return { path: null, cost: -1, expanded };
}
`),
      tests: [
        ex('an open grid: the cost is the Manhattan distance and the path is valid', ({ env, expect }) => {
          const grid = Array.from({ length: 5 }, () => new Array(6).fill(0));
          const { path, cost } = env.astar(grid, [0, 0], [4, 5]);
          expect(cost).toBe(9);
          expect(path.length).toBe(10);
          expect(path[0]).toEqual([0, 0]);
          expect(path[9]).toEqual([4, 5]);
          for (let i = 1; i < path.length; i++) expect(Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1])).toBe(1);
        }),
        ex('walks around a wall', ({ env, expect }) => {
          const grid = [[0, 1, 0], [0, 1, 0], [0, 0, 0]];
          const { path, cost } = env.astar(grid, [0, 0], [0, 2]);
          expect(cost).toBe(6);
          expect(path.every(([r, c]: number[]) => grid[r][c] === 0)).toBe(true);
        }),
        ex('unreachable goal, blocked endpoints, start = goal', ({ env, expect }) => {
          expect(env.astar([[0, 1, 0]], [0, 0], [0, 2])).toEqual({ path: null, cost: -1, expanded: 1 });
          expect(env.astar([[0, 1]], [0, 0], [0, 1]).path).toBe(null);
          expect(env.astar([[1, 0]], [0, 0], [0, 1]).path).toBe(null);
          const same = env.astar([[0]], [0, 0], [0, 0]);
          expect(same.path).toEqual([[0, 0]]);
          expect(same.cost).toBe(0);
        }),
        prop('property: the cost equals the BFS shortest path on random mazes (optimality)', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 9999), gen.int(2, 9), gen.int(2, 9)], (seed: number, R: number, C: number) => {
            const r = new Rng(seed);
            const grid = Array.from({ length: R }, (_, i) => Array.from({ length: C }, (_, j) => ((i === 0 && j === 0) || (i === R - 1 && j === C - 1) ? 0 : r.float() < 0.3 ? 1 : 0)));
            const dist = new Map<number, number>([[0, 0]]);
            const q = [[0, 0]];
            for (let h = 0; h < q.length; h++) { const [a, b] = q[h]; for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nr = a + dr, nc = b + dc, k = nr * C + nc; if (nr >= 0 && nr < R && nc >= 0 && nc < C && grid[nr][nc] === 0 && !dist.has(k)) { dist.set(k, dist.get(a * C + b)! + 1); q.push([nr, nc]); } } }
            const want = dist.get((R - 1) * C + C - 1);
            const got = env.astar(grid, [0, 0], [R - 1, C - 1]);
            expect(got.cost).toBe(want === undefined ? -1 : want);
            if (want !== undefined) expect(got.path.length).toBe(want + 1);
          }, { runs: 150 });
        }),
        ex('the heuristic helps: far fewer expansions than the whole grid on a 40×40 open map', ({ env, expect }) => {
          const grid = Array.from({ length: 40 }, () => new Array(40).fill(0));
          const { cost, expanded } = env.astar(grid, [0, 0], [39, 39]);
          expect(cost).toBe(78);
          expect(expanded).toBeLessThan(1600);
        }),
        perf('a 120×120 maze with scattered obstacles', async ({ env, expect, measure, rng }) => {
          const r = rng(2);
          const grid = Array.from({ length: 120 }, (_, i) => Array.from({ length: 120 }, (_, j) => ((i === 0 && j === 0) || (i === 119 && j === 119) ? 0 : r.float() < 0.2 ? 1 : 0)));
          const { steps } = await measure(() => env.astar(grid, [0, 0], [119, 119]), { budget: 60_000_000 });
          expect(steps).toBeLessThan(15_000_000);
        }),
      ],
      hints: ['Keep `best[g]` per cell and a heap ordered by `f = g + h` (prefer larger `g` on ties). Push a neighbour only when you found a **cheaper** `g` for it.', 'A cell can be in the heap several times; when popping, **skip it if already closed** (lazy deletion).', 'Store a `parent` map to rebuild the path once you pop the goal: walk back from the goal to the start and reverse.', 'Count `expanded` each time you actually process (not skip) a popped cell.'],
    }),
  ],
  references: [
    { title: 'An Introduction to the Kalman Filter — Welch & Bishop (UNC)', url: 'https://www.cs.unc.edu/~welch/media/pdf/kalman_intro.pdf' },
    { title: 'Kalman and Bayesian Filters in Python — Roger Labbe (free book)', url: 'https://github.com/rlabbe/Kalman-and-Bayesian-Filters-in-Python' },
    { title: 'A Formal Basis for the Heuristic Determination of Minimum Cost Paths (A*) — Hart, Nilsson, Raphael, 1968' },
    { title: 'PID Controllers: Theory, Design, and Tuning — Åström & Hägglund' },
  ],
};
export default mod;
