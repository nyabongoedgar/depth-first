import type { Module } from '../../core/types';
import { ex, hid, lab, jsFile } from '../helpers';
import { FakeTimers, deferred, tick } from '../fake-timers';

const mod: Module = {
  id: 'async-patterns',
  course: 'adv-js',
  title: 'Async at Scale: Concurrency Limits, Retries, Timeouts, Cancellation',
  minutes: 50,
  objectives: [
    'Control concurrency with a limiter instead of firing thousands of requests at once',
    'Implement retries with exponential backoff and jitter, and know when NOT to retry',
    'Add timeouts without leaking timers, and cancel work with `AbortSignal`',
    'Reason about sequential vs parallel `await` and the cost of getting it wrong',
  ],
  body: `
## Sequential vs parallel

\`await\` in a loop runs things **one after another**. That's right when order matters and wrong when it doesn't:

\`\`\`js run
const sleep = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

async function sequential() {
  const out = [];
  for (const ms of [30, 30, 30]) out.push(await sleep(ms, ms));   // ~90 ms
  return out;
}
async function parallel() {
  return Promise.all([30, 30, 30].map((ms) => sleep(ms, ms)));    // ~30 ms
}
const t0 = performance.now();
await sequential();
console.log("sequential took", Math.round(performance.now() - t0), "ms (virtual)");
const t1 = performance.now();
await parallel();
console.log("parallel took", Math.round(performance.now() - t1), "ms (virtual)");
\`\`\`

(The numbers are in this lesson's *virtual* time — the pattern is what counts.)

But **unbounded parallelism is also a bug**: \`Promise.all(10000 urls.map(fetch))\` can exhaust sockets, trip rate limits and take down the server you call. The fix is a **concurrency limit**.

## A concurrency limiter

\`\`\`js
function pLimit(n) {
  const queue = [];
  let active = 0;
  const next = () => {
    if (active >= n || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}
\`\`\`

The state — a queue and a counter — lives in a closure. Every task start and finish calls \`next()\`, which keeps up to \`n\` running. You will write a polished version in the lab.

## Retries: backoff and jitter

Networks fail transiently. Retrying makes systems resilient — **if done carefully**:

- **Exponential backoff:** wait \`base × 2^attempt\` between tries so you don't hammer a struggling server.
- **Cap** the delay (e.g. 30 s) and the number of attempts.
- **Jitter:** randomise the delay. If 10,000 clients all retry at 1 s, 2 s, 4 s they synchronise into a **thundering herd**. "Full jitter" picks a random value in \`[0, delay]\`.
- **Only retry what is retryable:** timeouts, 5xx, 429, connection resets. Never retry a 400/401/403/404 — it will never succeed.
- **Idempotency:** a retried \`POST /charge\` must not charge twice (use an idempotency key). Course 2 returns to this.

## Timeouts

Without a timeout, one stuck call can hang a whole request path. A naive \`Promise.race([work, timeout])\` has two problems: the work keeps running, and the timer isn't cleared when the work wins (a **timer leak** that keeps Node alive and wastes memory).

\`\`\`js run
const timers = [];
const withTimeout = (p, ms) =>
  new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timed out after " + ms + "ms")), ms);
    timers.push(id);
    p.then((v) => { clearTimeout(id); resolve(v); }, (e) => { clearTimeout(id); reject(e); });
  });

const slow = new Promise((r) => setTimeout(() => r("done"), 500));
try { await withTimeout(slow, 100); } catch (e) { console.log(e.message); }
\`\`\`

## Cancellation with AbortSignal

Promises can't be cancelled, but **operations** can: an \`AbortController\` produces a \`signal\` you pass down (\`fetch(url, { signal })\` supports it). Aborting makes the operation reject with an \`AbortError\` and release its resources.

\`\`\`js run
const controller = new AbortController();
const { signal } = controller;
signal.addEventListener("abort", () => console.log("aborted:", signal.reason.name));
controller.abort();                 // reason defaults to a DOMException "AbortError"
console.log(signal.aborted);
\`\`\`

Good async APIs take a \`signal\` option, check \`signal.aborted\` before starting, listen for \`abort\`, and **remove the listener** when done (otherwise a long-lived signal leaks closures).

:::warn
**Floating promises.** \`doWork()\` without \`await\` or \`.catch\` means failures vanish (or crash the process later). Lint rule: \`@typescript-eslint/no-floating-promises\`.
:::

:::interview
"Fetch 1,000 URLs but only 10 at a time, preserving result order, and don't give up if one fails." (limiter + \`allSettled\`). Follow-ups: backoff, timeouts, cancelling remaining work when one fails, and progress reporting.
:::
`,
  quiz: [
    { q: 'Why add jitter to exponential backoff?', options: ['To make retries faster', 'To avoid many clients retrying in lock-step (thundering herd)', 'To reduce memory use', 'Because the spec requires it'], answer: 1, why: 'Randomised delays spread retry load over time.' },
    { q: 'Which errors are generally safe to retry automatically?', options: ['400 Bad Request', '401 Unauthorized', 'Connection reset / 503 / timeout', '404 Not Found'], answer: 2, why: 'Transient failures may succeed later; client errors will not.' },
    { q: 'What problem does `Promise.race([work, timeout])` leave behind?', options: ['It throws synchronously', 'The timer keeps running (and the work continues) after the race is decided', 'It always rejects', 'Nothing'], answer: 1, why: 'Clear the timer when the work settles, and cancel the work if you can.' },
    { q: 'How do you cancel an in-flight `fetch`?', options: ['promise.cancel()', 'Pass an AbortSignal and call controller.abort()', 'Delete the promise', 'Throw inside then'], answer: 1, why: 'Promises have no cancel; cancellation is cooperative via AbortSignal.' },
  ],
  labs: [
    lab({
      id: 'adv6-plimit',
      title: 'A concurrency limiter',
      kind: 'code',
      difficulty: 4,
      minutes: 25,
      tags: ['async', 'queues'],
      interview: true,
      prompt: `Write \`pLimit(concurrency)\`. It returns a function \`limit(fn, ...args)\` that:

- schedules \`fn(...args)\` (which may be sync or async) and returns a promise of its result;
- never has more than \`concurrency\` tasks **running** at once; extra tasks wait in a **FIFO** queue;
- starts the next waiting task as soon as one finishes — success **or failure** (a failing task must not block the queue and must reject only its own promise);
- exposes \`limit.activeCount\` and \`limit.pendingCount\` (getters).

Throw a \`TypeError\` if \`concurrency\` is not a positive integer.`,
      expose: ['pLimit'],
      files: jsFile(
        `function pLimit(concurrency) {
  
}
`,
        `function pLimit(concurrency) {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new TypeError('concurrency must be a positive integer');
  const queue = [];
  let active = 0;

  function next() {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const { fn, args, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(() => fn(...args))
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  }

  function limit(fn, ...args) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, args, resolve, reject });
      next();
    });
  }
  Object.defineProperties(limit, {
    activeCount: { get: () => active },
    pendingCount: { get: () => queue.length },
  });
  return limit;
}
`
      ),
      tests: [
        ex('returns the results of the tasks', async ({ env, expect }) => {
          const limit = env.pLimit(2);
          const out = await Promise.all([1, 2, 3, 4].map((n) => limit(async (x: number) => x * 10, n)));
          expect(out).toEqual([10, 20, 30, 40]);
        }),
        ex('never runs more than N at once, and starts FIFO', async ({ env, expect }) => {
          const limit = env.pLimit(2);
          const started: number[] = [];
          const gates = [0, 1, 2, 3, 4].map(() => deferred<void>());
          let running = 0;
          let peak = 0;
          const results = [0, 1, 2, 3, 4].map((i) =>
            limit(async () => {
              started.push(i);
              running++;
              peak = Math.max(peak, running);
              await gates[i].promise;
              running--;
              return i;
            })
          );
          await tick();
          expect(started).toEqual([0, 1]);
          gates[1].resolve(); await tick();
          expect(started).toEqual([0, 1, 2]);
          gates[0].resolve(); gates[2].resolve(); await tick();
          expect(started).toEqual([0, 1, 2, 3, 4]);
          gates[3].resolve(); gates[4].resolve();
          expect(await Promise.all(results)).toEqual([0, 1, 2, 3, 4]);
          expect(peak).toBe(2);
        }),
        ex('a failing task rejects only itself and does not block the queue', async ({ env, expect }) => {
          const limit = env.pLimit(1);
          const a = limit(async () => { throw new Error('a failed'); });
          const b = limit(async () => 'b ok');
          const e = await a.catch((x: Error) => x.message);
          expect(e).toBe('a failed');
          expect(await b).toBe('b ok');
        }),
        ex('accepts sync functions and extra arguments', async ({ env, expect }) => {
          const limit = env.pLimit(3);
          expect(await limit((a: number, b: number) => a + b, 2, 3)).toBe(5);
        }),
        ex('activeCount / pendingCount reflect the state', async ({ env, expect }) => {
          const limit = env.pLimit(1);
          const g = deferred<void>();
          const p1 = limit(() => g.promise);
          const p2 = limit(() => 1);
          await tick();
          expect([limit.activeCount, limit.pendingCount]).toEqual([1, 1]);
          g.resolve();
          await Promise.all([p1, p2]);
          await tick();
          expect([limit.activeCount, limit.pendingCount]).toEqual([0, 0]);
        }),
        ex('rejects an invalid concurrency', ({ env, expect }) => {
          expect(() => env.pLimit(0)).toThrow('concurrency');
          expect(() => env.pLimit(1.5)).toThrow('concurrency');
        }),
        hid('handles 2,000 quick tasks with a limit of 5 without exceeding it', async ({ env, expect }) => {
          const limit = env.pLimit(5);
          let running = 0;
          let peak = 0;
          const all = Array.from({ length: 2000 }, (_, i) =>
            limit(async () => {
              running++;
              peak = Math.max(peak, running);
              await Promise.resolve();
              running--;
              return i;
            })
          );
          const r = await Promise.all(all);
          expect(r.length).toBe(2000);
          expect(peak).toBeLessThanOrEqual(5);
        }),
      ],
      hints: [
        'State in the closure: `queue` of `{ fn, args, resolve, reject }` and a counter `active`.',
        'Write `next()`: if `active < concurrency` and the queue is non-empty, shift one task, `active++`, run it, and in a `finally` do `active--; next();`.',
        'Call `next()` right after pushing a new task so it starts immediately if there is capacity.',
        'Use `.then(resolve, reject)` for the result and `.finally(...)` for the bookkeeping — bookkeeping must run on failure too.',
      ],
      why: 'Every serious HTTP client, crawler and build tool has one of these — usually with a bug the first time.',
    }),

    lab({
      id: 'adv6-retry',
      title: 'retry with exponential backoff and jitter',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['async', 'resilience'],
      prompt: `Write \`async retry(fn, options)\`:

- Calls \`fn(attempt)\` (attempt starts at **0**). If it succeeds, return the value.
- On failure, if attempts remain **and** \`shouldRetry(error)\` is true, wait and try again. Otherwise throw the **last error**.
- Options: \`retries\` (default 3 → up to 4 attempts), \`baseDelay\` (default 100), \`factor\` (default 2), \`maxDelay\` (default 10000), \`jitter\` (default false), \`shouldRetry\` (default: always true), \`sleep\` (default: a real \`setTimeout\` promise), \`random\` (default \`Math.random\`).
- The delay before retry number *k* (k = 0 for the first retry) is \`min(maxDelay, baseDelay × factor^k)\`. With \`jitter: true\` ("full jitter") use \`random() × thatValue\`.
- Call \`sleep(ms)\` for each wait (this is how the tests see your delays).`,
      expose: ['retry'],
      files: jsFile(
        `async function retry(fn, options = {}) {
  
}
`,
        `async function retry(fn, options = {}) {
  const {
    retries = 3,
    baseDelay = 100,
    factor = 2,
    maxDelay = 10000,
    jitter = false,
    shouldRetry = () => true,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    random = Math.random,
  } = options;

  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      let delay = Math.min(maxDelay, baseDelay * Math.pow(factor, attempt));
      if (jitter) delay = random() * delay;
      await sleep(delay);
      attempt++;
    }
  }
}
`
      ),
      tests: [
        ex('returns the first success without sleeping', async ({ env, expect }) => {
          const sleeps: number[] = [];
          const v = await env.retry(async () => 'ok', { sleep: async (ms: number) => sleeps.push(ms) });
          expect(v).toBe('ok');
          expect(sleeps).toEqual([]);
        }),
        ex('retries until success, with exponential delays', async ({ env, expect }) => {
          const sleeps: number[] = [];
          const attempts: number[] = [];
          const v = await env.retry(async (n: number) => { attempts.push(n); if (n < 3) throw new Error('flaky'); return 'done'; }, { sleep: async (ms: number) => sleeps.push(ms) });
          expect(v).toBe('done');
          expect(attempts).toEqual([0, 1, 2, 3]);
          expect(sleeps).toEqual([100, 200, 400]);
        }),
        ex('gives up after `retries` retries and throws the last error', async ({ env, expect }) => {
          let calls = 0;
          const e = await env.retry(async () => { throw new Error('fail ' + ++calls); }, { retries: 2, sleep: async () => {} }).catch((x: Error) => x);
          expect(calls).toBe(3);
          expect(e.message).toBe('fail 3');
        }),
        ex('delays are capped by maxDelay', async ({ env, expect }) => {
          const sleeps: number[] = [];
          await env.retry(async (n: number) => { if (n < 5) throw new Error('x'); }, { retries: 5, baseDelay: 100, maxDelay: 500, sleep: async (ms: number) => sleeps.push(ms) });
          expect(sleeps).toEqual([100, 200, 400, 500, 500]);
        }),
        ex('shouldRetry=false stops immediately', async ({ env, expect }) => {
          let calls = 0;
          const e = await env.retry(async () => { calls++; const err: any = new Error('bad request'); err.status = 400; throw err; }, { shouldRetry: (err: any) => err.status >= 500, sleep: async () => {} }).catch((x: Error) => x);
          expect(calls).toBe(1);
          expect(e.message).toBe('bad request');
        }),
        ex('full jitter scales each delay by random()', async ({ env, expect }) => {
          const sleeps: number[] = [];
          const rs = [0.5, 0.25];
          await env.retry(async (n: number) => { if (n < 2) throw new Error('x'); }, { jitter: true, random: () => rs.shift(), sleep: async (ms: number) => sleeps.push(ms) });
          expect(sleeps).toEqual([50, 50]);
        }),
        hid('custom factor and base', async ({ env, expect }) => {
          const sleeps: number[] = [];
          await env.retry(async (n: number) => { if (n < 3) throw new Error('x'); }, { baseDelay: 10, factor: 3, sleep: async (ms: number) => sleeps.push(ms) });
          expect(sleeps).toEqual([10, 30, 90]);
        }),
      ],
      hints: ['Loop forever and `return await fn(attempt)` inside a `try`.', 'In `catch`: if you are out of retries or `shouldRetry(err)` is false, `throw err`.', 'Otherwise compute `Math.min(maxDelay, baseDelay * factor ** attempt)`, apply jitter, `await sleep(delay)`, then `attempt++`.'],
    }),

    lab({
      id: 'adv6-timeout',
      title: 'withTimeout without leaking timers',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['async', 'timers'],
      prompt: `Write \`withTimeout(promise, ms, timers = globalThis)\`.

- Resolves/rejects like \`promise\` if it settles within \`ms\`.
- Otherwise rejects with \`new Error('Timed out after ' + ms + 'ms')\`.
- **Clears the timer** as soon as \`promise\` settles (whether it succeeds or fails) — no timer may be left pending.
- Use \`timers.setTimeout / timers.clearTimeout\`.
- Late settlement of \`promise\` after the timeout must be ignored (no unhandled rejection from your code).`,
      expose: ['withTimeout'],
      files: jsFile(
        `function withTimeout(promise, ms, timers = globalThis) {
  
}
`,
        `function withTimeout(promise, ms, timers = globalThis) {
  return new Promise((resolve, reject) => {
    const id = timers.setTimeout(() => reject(new Error('Timed out after ' + ms + 'ms')), ms);
    promise.then(
      (value) => {
        timers.clearTimeout(id);
        resolve(value);
      },
      (err) => {
        timers.clearTimeout(id);
        reject(err);
      }
    );
  });
}
`
      ),
      tests: [
        ex('resolves with the value when fast enough', async ({ env, expect }) => {
          const ft = new FakeTimers();
          const d = deferred<string>();
          const p = env.withTimeout(d.promise, 100, ft);
          await ft.advance(50);
          d.resolve('ok');
          expect(await p).toBe('ok');
        }),
        ex('propagates rejections', async ({ env, expect }) => {
          const ft = new FakeTimers();
          const d = deferred();
          const p = env.withTimeout(d.promise, 100, ft);
          d.reject(new Error('inner'));
          expect((await p.catch((e: Error) => e)).message).toBe('inner');
        }),
        ex('rejects with a timeout error after ms', async ({ env, expect }) => {
          const ft = new FakeTimers();
          const d = deferred();
          const p = env.withTimeout(d.promise, 100, ft);
          const settled = p.then(() => 'resolved', (e: Error) => e.message);
          await ft.advance(99);
          let early = false;
          settled.then(() => (early = true));
          await tick();
          expect(early).toBe(false);
          await ft.advance(1);
          expect(await settled).toBe('Timed out after 100ms');
        }),
        ex('clears the timer when the promise wins', async ({ env, expect }) => {
          const ft = new FakeTimers();
          const d = deferred<number>();
          const p = env.withTimeout(d.promise, 1000, ft);
          expect(ft.pending).toBe(1);
          d.resolve(1);
          await p;
          expect(ft.pending).toBe(0);
        }),
        ex('clears the timer when the promise fails', async ({ env, expect }) => {
          const ft = new FakeTimers();
          const d = deferred();
          const p = env.withTimeout(d.promise, 1000, ft);
          d.reject(new Error('x'));
          await p.catch(() => {});
          expect(ft.pending).toBe(0);
        }),
        hid('ignores a late settlement after timing out', async ({ env, expect }) => {
          const ft = new FakeTimers();
          const d = deferred<string>();
          const p = env.withTimeout(d.promise, 10, ft);
          const first = p.catch((e: Error) => e.message);
          await ft.advance(10);
          expect(await first).toBe('Timed out after 10ms');
          d.resolve('too late');
          await tick();
          expect(ft.pending).toBe(0);
        }),
      ],
      hints: ['Create the timer first, remember its id.', 'Wrap everything in `new Promise((resolve, reject) => …)`; the timer callback calls `reject`.', 'Attach both handlers to `promise` and call `clearTimeout(id)` in each before resolving/rejecting.'],
    }),

    lab({
      id: 'adv6-abortable-sleep',
      title: 'An abortable sleep',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['async', 'cancellation'],
      prompt: `Write \`abortableSleep(ms, signal, timers = globalThis)\`:

- Resolves (with \`undefined\`) after \`ms\` ms.
- If \`signal\` is **already aborted**, reject immediately with \`signal.reason\` (don't start a timer).
- If the signal aborts while waiting, clear the timer and reject with \`signal.reason\`.
- **Clean up:** when the sleep finishes normally, remove your \`abort\` listener from the signal (a long-lived signal must not accumulate listeners).
- \`signal\` is optional.`,
      expose: ['abortableSleep'],
      files: jsFile(
        `function abortableSleep(ms, signal, timers = globalThis) {
  
}
`,
        `function abortableSleep(ms, signal, timers = globalThis) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(signal.reason);
    let onAbort;
    const id = timers.setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (signal) {
      onAbort = () => {
        timers.clearTimeout(id);
        reject(signal.reason);
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}
`
      ),
      tests: [
        ex('resolves after the delay', async ({ env, expect }) => {
          const ft = new FakeTimers();
          let done = false;
          env.abortableSleep(100, undefined, ft).then(() => (done = true));
          await ft.advance(99);
          expect(done).toBe(false);
          await ft.advance(1);
          expect(done).toBe(true);
        }),
        ex('rejects immediately if already aborted (no timer started)', async ({ env, expect }) => {
          const ft = new FakeTimers();
          const c = new AbortController();
          c.abort();
          const e = await env.abortableSleep(100, c.signal, ft).catch((x: any) => x);
          expect(e.name).toBe('AbortError');
          expect(ft.pending).toBe(0);
        }),
        ex('aborting during the wait rejects with signal.reason and clears the timer', async ({ env, expect }) => {
          const ft = new FakeTimers();
          const c = new AbortController();
          const p = env.abortableSleep(1000, c.signal, ft);
          const result = p.catch((x: any) => x);
          await ft.advance(10);
          const reason = new Error('user cancelled');
          c.abort(reason);
          expect(await result).toBe(reason);
          expect(ft.pending).toBe(0);
        }),
        hid('removes its abort listener after finishing normally', async ({ env, expect }) => {
          const ft = new FakeTimers();
          const c = new AbortController();
          let added = 0;
          let removed = 0;
          const add = c.signal.addEventListener.bind(c.signal);
          const rem = c.signal.removeEventListener.bind(c.signal);
          (c.signal as any).addEventListener = (...a: any[]) => { added++; return (add as any)(...a); };
          (c.signal as any).removeEventListener = (...a: any[]) => { removed++; return (rem as any)(...a); };
          const p = env.abortableSleep(5, c.signal, ft);
          await ft.advance(5);
          await p;
          expect(added).toBe(1);
          expect(removed).toBeGreaterThanOrEqual(1);
        }),
      ],
      hints: ['Check `signal.aborted` first and reject with `signal.reason`.', 'Register `signal.addEventListener("abort", onAbort, { once: true })`; in `onAbort` clear the timer and reject.', 'In the timer callback, `removeEventListener` before resolving.'],
    }),
  ],
  references: [
    { title: 'MDN — AbortController', url: 'https://developer.mozilla.org/docs/Web/API/AbortController' },
    { title: 'AWS Architecture Blog — Exponential Backoff And Jitter', url: 'https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/' },
  ],
};
export default mod;
