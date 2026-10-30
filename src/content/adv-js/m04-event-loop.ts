import type { Module } from '../../core/types';
import { ex, hid, lab, jsFile } from '../helpers';
import { FakeTimers } from '../fake-timers';

const mod: Module = {
  id: 'event-loop',
  course: 'adv-js',
  title: 'The Event Loop, Tasks & Microtasks',
  minutes: 45,
  objectives: [
    'Describe the call stack, task queue and microtask queue and how they interact',
    'Predict the exact output order of programs mixing sync code, timers, promises and `await`',
    'Explain starvation and why long tasks freeze a page or a server',
    'Implement a small event loop (timers + microtasks) yourself',
  ],
  body: `
## One thread, one stack

JavaScript runs your code on a **single thread**. The **call stack** holds the function currently running. Anything slow or waiting (timers, network, disk, user input) is handled by the environment (browser or Node), which later puts a **callback** into a queue. The **event loop** is the mechanism that moves callbacks from queues onto the empty stack.

\`\`\`
   ┌───────────────┐        ┌────────────────────┐   ┌────────────────────┐
   │  Call stack   │ ◄───── │  Microtask queue   │   │  Task (macrotask)  │
   │ (running now) │        │ promise reactions, │   │  queue: timers, UI │
   └──────┬────────┘        │ queueMicrotask,    │   │  events, I/O…      │
          │ empty?          │ MutationObserver   │   └─────────┬──────────┘
          ▼                 └────────────────────┘             │
   event loop: run ONE task → then drain ALL microtasks → (render) → next task
\`\`\`

The loop in pseudocode:

\`\`\`
while (true) {
  task = taskQueue.next()        // setTimeout callback, click handler, message…
  run(task)                      // runs to completion — nothing interrupts it
  while (microtasks.length) run(microtasks.shift())   // ALL of them, including new ones
  maybeRender()                  // browsers only
}
\`\`\`

Two consequences worth tattooing on your arm:

1. **Run-to-completion:** a task is never interrupted. A 2-second loop blocks *everything*: clicks, timers, rendering.
2. **Microtasks run before the next task** — and they run until the queue is *empty*, so microtasks can starve the loop.

## Predicting order

\`\`\`js run
console.log("1 sync");
setTimeout(() => console.log("5 timeout"), 0);
Promise.resolve().then(() => console.log("3 promise"));
queueMicrotask(() => console.log("4 microtask"));
console.log("2 sync");
\`\`\`

Sync code first (it *is* the current task). Then all microtasks in the order they were queued. Only then the next task (the timer).

## \`async\`/\`await\` is promises in disguise

\`await x\` splits a function in two: everything after it becomes a **microtask** that runs when \`x\` settles.

\`\`\`js run
async function f() {
  console.log("f start");
  await null;                    // like: Promise.resolve(null).then(rest)
  console.log("f after await");
}
console.log("before");
f();
console.log("after");
\`\`\`

## Timers are not exact

\`setTimeout(fn, 100)\` means "**no earlier than** 100 ms, once the stack is clear and it's this timer's turn". Browsers clamp nested timers to ≥ 4 ms, and \`setTimeout(fn, 0)\` is really 1 ms. If the thread is busy, callbacks wait.

\`\`\`js run
// Starvation: microtasks that keep queueing microtasks block timers forever
let n = 0;
function again() { if (++n < 5) queueMicrotask(again); }
setTimeout(() => console.log("timer runs after ALL", n, "microtasks"), 0);
queueMicrotask(again);
\`\`\`

(Replace \`5\` with \`Infinity\` in a real page and the tab freezes — rendering is also a task.)

## Node.js has more phases

Node's loop (libuv) cycles through phases: **timers → pending callbacks → poll (I/O) → check (\`setImmediate\`) → close callbacks**. Between callbacks Node drains \`process.nextTick\` first, then the promise microtask queue. The browser model above is the one you'll be asked about most; Node specifics come in Course 2.

:::tip
**Never block the loop.** Chunk long work (\`await\` yields to microtasks only, not to rendering!). To really yield, use a macrotask: \`await new Promise(r => setTimeout(r))\`, \`scheduler.yield()\`, \`requestIdleCallback\`, or move work to a Worker.
:::

:::interview
Classic: "What order does this print?" with a mix of \`setTimeout\`, promises, \`async\` functions and sync logs. Method: (1) run sync code top to bottom; (2) every \`then\`/\`await\` continuation → microtask queue in order; (3) drain microtasks; (4) next timer. Say your reasoning aloud.
:::
`,
  quiz: [
    { q: 'Which runs first: a `setTimeout(fn, 0)` callback or a `Promise.resolve().then(fn2)` callback, both registered in the same task?', options: ['The timeout', 'The promise callback', 'Whichever was registered first', 'It is random'], answer: 1, why: 'Microtasks drain completely before the next task (the timer).' },
    { q: 'What code after `await x` is, in effect…', options: ['A new thread', 'A microtask queued when x settles', 'A timer of 0 ms', 'Run synchronously'], answer: 1, why: '`await` suspends the function; its continuation resumes as a microtask.' },
    { q: 'Why can a never-ending chain of `queueMicrotask` calls freeze a page?', options: ['It uses too much memory', 'Microtasks must be fully drained before rendering or the next task', 'It blocks the network', 'It deadlocks the GC'], answer: 1, why: 'The loop will not move on until the microtask queue is empty.' },
    { q: '`setTimeout(f, 100)` guarantees…', options: ['f runs after exactly 100 ms', 'f runs at least 100 ms later, when the thread is free', 'f runs on another thread', 'f runs before microtasks'], answer: 1, why: 'The delay is a minimum, not a promise.' },
  ],
  labs: [
    lab({
      id: 'adv4-predict-basic',
      title: 'Predict: sync, microtasks, timers',
      kind: 'predict',
      difficulty: 2,
      minutes: 6,
      tags: ['event-loop', 'predict'],
      prompt: 'Predict the output, one line per `console.log`.',
      snippet: `console.log("1 sync");
setTimeout(() => console.log("2 timeout 0"), 0);
Promise.resolve().then(() => console.log("3 promise"));
queueMicrotask(() => console.log("4 microtask"));
(async () => {
  console.log("5 async start");
  await null;
  console.log("6 after await");
})();
console.log("7 sync end");`,
      explanation: 'Synchronous lines run first, including the body of the async function up to its first `await` (1, 5, 7). Then the microtask queue drains in registration order: the `.then` (3), `queueMicrotask` (4), then the continuation after `await` (6). The timer is a later task (2).',
      hints: ['The async function runs synchronously until its first `await`.', 'Microtasks run in the order they were *queued*.', 'Timers are tasks: they wait until the microtask queue is empty.'],
    }),
    lab({
      id: 'adv4-predict-async',
      title: 'Predict: async functions and promise chains',
      kind: 'predict',
      difficulty: 3,
      minutes: 8,
      tags: ['event-loop', 'predict'],
      prompt: 'Predict the output, one line per `console.log`. Count microtask "ticks" carefully.',
      snippet: `async function a() {
  console.log("a1");
  await b();
  console.log("a2");
}
async function b() {
  console.log("b1");
}
console.log("start");
a();
new Promise((resolve) => {
  console.log("p1");
  resolve();
})
  .then(() => console.log("p2"))
  .then(() => console.log("p3"));
console.log("end");`,
      explanation: '`a()` runs synchronously: prints a1, calls `b()` (prints b1) which returns an already-resolved promise; `await` queues the continuation. The `new Promise` executor runs synchronously (p1). Then the first microtask is `a`\'s continuation (a2), followed by p2, whose callback queues p3.',
      hints: ['The Promise executor is synchronous.', 'The continuation after `await b()` was queued *before* the `.then(p2)` callback.'],
    }),
    lab({
      id: 'adv4-predict-flatten',
      title: 'Predict: returning a promise from then()',
      kind: 'predict',
      difficulty: 4,
      minutes: 10,
      tags: ['event-loop', 'promises', 'predict'],
      prompt: 'Interleaving chains is how interviewers catch people out. Predict the order of all lines.',
      snippet: `const p = Promise.resolve();

p.then(() => console.log("A1"))
  .then(() => console.log("A2"))
  .then(() => console.log("A3"))
  .then(() => console.log("A4"));

p.then(() => {
  console.log("B1");
  return Promise.resolve("inner");     // returning a promise costs extra ticks
}).then((v) => console.log("B2", v));

console.log("sync");`,
      explanation: 'Both chains advance one `then` per tick. Tick 1: A1 and B1. Because B1 *returns a promise*, the outer promise cannot just take its value: tick 2 runs a job that calls `inner.then(…)`, and tick 3 runs the reaction that finally resolves the outer promise — so the callback `B2` only becomes ready for tick 4. Meanwhile A2 (tick 2), A3 (tick 3) and A4 (tick 4, queued before B2) march on. Result: A1, B1, A2, A3, A4, B2.',
      hints: ['Draw ticks 1, 2, 3… and write what runs in each.', 'Returning a promise from `then` adds two ticks before the next `then` runs.'],
    }),

    lab({
      id: 'adv4-eventloop',
      title: 'Build an event loop',
      kind: 'code',
      difficulty: 4,
      minutes: 25,
      tags: ['event-loop'],
      prompt: `Implement a deterministic **\`EventLoop\`** class with *virtual time*:

- \`setTimeout(fn, delay = 0)\` → returns an id; \`clearTimeout(id)\`
- \`queueMicrotask(fn)\`
- \`now()\` → current virtual time in ms (starts at 0)
- \`run(script)\` → run \`script(loop)\` as the first task, then keep processing until nothing is left:
  - after **every task** (including the first script) **drain all microtasks**, including ones queued by microtasks;
  - the next task is the timer with the earliest due time; ties go to the one registered first;
  - when a timer fires, \`now()\` equals its due time (due time = registration time + delay);
- if a callback throws, store the error in \`loop.errors\` (array) and **carry on**.`,
      expose: ['EventLoop'],
      files: jsFile(
        `class EventLoop {
  constructor() {
    this.errors = [];
  }

  now() {}

  setTimeout(fn, delay = 0) {}

  clearTimeout(id) {}

  queueMicrotask(fn) {}

  run(script) {}
}
`,
        `class EventLoop {
  constructor() {
    this.time = 0;
    this.seq = 0;
    this.timers = [];
    this.micro = [];
    this.errors = [];
  }

  now() {
    return this.time;
  }

  setTimeout(fn, delay = 0) {
    const id = ++this.seq;
    this.timers.push({ id, at: this.time + Math.max(0, delay), fn });
    return id;
  }

  clearTimeout(id) {
    this.timers = this.timers.filter((t) => t.id !== id);
  }

  queueMicrotask(fn) {
    this.micro.push(fn);
  }

  safe(fn) {
    try {
      fn();
    } catch (e) {
      this.errors.push(e);
    }
  }

  drain() {
    while (this.micro.length) this.safe(this.micro.shift());
  }

  run(script) {
    this.safe(() => script(this));
    this.drain();
    while (this.timers.length) {
      this.timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const t = this.timers.shift();
      this.time = Math.max(this.time, t.at);
      this.safe(t.fn);
      this.drain();
    }
  }
}
`
      ),
      tests: [
        ex('sync script first, then microtasks, then timers', ({ env, expect }) => {
          const log: string[] = [];
          const loop = new env.EventLoop();
          loop.run((l: any) => {
            l.setTimeout(() => log.push('timeout'), 0);
            l.queueMicrotask(() => log.push('micro'));
            log.push('sync');
          });
          expect(log).toEqual(['sync', 'micro', 'timeout']);
        }),
        ex('timers fire by due time, ties by registration order', ({ env, expect }) => {
          const log: string[] = [];
          const loop = new env.EventLoop();
          loop.run((l: any) => {
            l.setTimeout(() => log.push('c'), 30);
            l.setTimeout(() => log.push('a1'), 10);
            l.setTimeout(() => log.push('a2'), 10);
            l.setTimeout(() => log.push('b'), 20);
          });
          expect(log).toEqual(['a1', 'a2', 'b', 'c']);
        }),
        ex('now() equals the due time when a timer fires', ({ env, expect }) => {
          const times: number[] = [];
          const loop = new env.EventLoop();
          loop.run((l: any) => {
            l.setTimeout(() => times.push(l.now()), 50);
            l.setTimeout(() => times.push(l.now()), 20);
          });
          expect(times).toEqual([20, 50]);
          expect(loop.now()).toBe(50);
        }),
        ex('a task\'s microtasks drain before the next task, even new ones', ({ env, expect }) => {
          const log: string[] = [];
          const loop = new env.EventLoop();
          loop.run((l: any) => {
            l.setTimeout(() => {
              log.push('t1');
              l.queueMicrotask(() => {
                log.push('m1');
                l.queueMicrotask(() => log.push('m2'));
              });
            }, 0);
            l.setTimeout(() => log.push('t2'), 0);
          });
          expect(log).toEqual(['t1', 'm1', 'm2', 't2']);
        }),
        ex('timers registered inside a task are relative to now()', ({ env, expect }) => {
          const times: number[] = [];
          const loop = new env.EventLoop();
          loop.run((l: any) => {
            l.setTimeout(() => {
              times.push(l.now());
              l.setTimeout(() => times.push(l.now()), 25);
            }, 100);
          });
          expect(times).toEqual([100, 125]);
        }),
        ex('clearTimeout cancels a pending timer', ({ env, expect }) => {
          const log: string[] = [];
          const loop = new env.EventLoop();
          loop.run((l: any) => {
            const id = l.setTimeout(() => log.push('never'), 10);
            l.setTimeout(() => log.push('yes'), 20);
            l.clearTimeout(id);
          });
          expect(log).toEqual(['yes']);
        }),
        ex('errors are collected and the loop carries on', ({ env, expect }) => {
          const log: string[] = [];
          const loop = new env.EventLoop();
          loop.run((l: any) => {
            l.queueMicrotask(() => { throw new Error('micro boom'); });
            l.setTimeout(() => { throw new Error('timer boom'); }, 1);
            l.setTimeout(() => log.push('still running'), 2);
          });
          expect(log).toEqual(['still running']);
          expect(loop.errors.map((e: Error) => e.message)).toEqual(['micro boom', 'timer boom']);
        }),
        hid('microtask starvation: 1000 chained microtasks all run before the timer', ({ env, expect }) => {
          const log: string[] = [];
          const loop = new env.EventLoop();
          let n = 0;
          loop.run((l: any) => {
            const again = () => { if (++n < 1000) l.queueMicrotask(again); };
            l.setTimeout(() => log.push('timer@' + n), 0);
            l.queueMicrotask(again);
          });
          expect(log).toEqual(['timer@1000']);
        }),
        hid('a timer with delay 0 registered inside a microtask runs after current microtasks', ({ env, expect }) => {
          const log: string[] = [];
          const loop = new env.EventLoop();
          loop.run((l: any) => {
            l.queueMicrotask(() => {
              l.setTimeout(() => log.push('timer'), 0);
              l.queueMicrotask(() => log.push('micro2'));
            });
          });
          expect(log).toEqual(['micro2', 'timer']);
        }),
      ],
      hints: [
        'Keep two arrays: `timers` (objects with id, due time, fn) and `micro` (functions).',
        'Write a helper `drain()` that loops `while (micro.length)` — it must also handle microtasks queued *during* draining.',
        'To pick the next timer, sort by `(at, id)` and `shift()`; set `this.time = max(this.time, timer.at)` before calling it.',
        'Wrap every callback in try/catch and push errors to `this.errors`.',
      ],
      why: 'Every runtime — browsers, Node, Deno — is this loop plus real I/O. Writing it once makes ordering puzzles obvious.',
    }),

    lab({
      id: 'adv4-debounce-throttle',
      title: 'debounce and throttle',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['event-loop', 'timers', 'closures'],
      prompt: `Implement both rate-limiters. They take an injectable \`timers\` object (\`{ setTimeout, clearTimeout }\`, default \`globalThis\`) so they can be tested with fake time.

**\`debounce(fn, wait, timers)\`** — *trailing edge*: \`fn\` runs once, \`wait\` ms after the **last** call, with the **last** call's arguments and \`this\`. The returned function has \`.cancel()\`.

**\`throttle(fn, wait, timers)\`** — *leading + trailing*: the first call runs \`fn\` immediately and opens a \`wait\`-ms window. Calls during the window are remembered (only the latest). When the window ends, if there was a remembered call, run it and open a new window; otherwise the throttle resets.`,
      expose: ['debounce', 'throttle'],
      files: jsFile(
        `function debounce(fn, wait, timers = globalThis) {
  
}

function throttle(fn, wait, timers = globalThis) {
  
}
`,
        `function debounce(fn, wait, timers = globalThis) {
  let id = null;
  let lastArgs;
  let lastThis;
  function debounced(...args) {
    lastArgs = args;
    lastThis = this;
    if (id !== null) timers.clearTimeout(id);
    id = timers.setTimeout(() => {
      id = null;
      fn.apply(lastThis, lastArgs);
    }, wait);
  }
  debounced.cancel = () => {
    if (id !== null) timers.clearTimeout(id);
    id = null;
  };
  return debounced;
}

function throttle(fn, wait, timers = globalThis) {
  let id = null;
  let pendingArgs = null;
  let pendingThis;
  function startWindow() {
    id = timers.setTimeout(() => {
      id = null;
      if (pendingArgs) {
        const a = pendingArgs;
        const t = pendingThis;
        pendingArgs = null;
        fn.apply(t, a);
        startWindow();
      }
    }, wait);
  }
  function throttled(...args) {
    if (id === null) {
      fn.apply(this, args);
      startWindow();
    } else {
      pendingArgs = args;
      pendingThis = this;
    }
  }
  return throttled;
}
`
      ),
      tests: [
        ex('debounce: runs once after the quiet period with the last args', async ({ env, expect }) => {
          const ft = new FakeTimers();
          const calls: any[] = [];
          const d = env.debounce((x: number) => calls.push(x), 100, ft);
          d(1); await ft.advance(50);
          d(2); await ft.advance(50);
          d(3);
          await ft.advance(99);
          expect(calls).toEqual([]);
          await ft.advance(1);
          expect(calls).toEqual([3]);
        }),
        ex('debounce: fires again for a later burst', async ({ env, expect }) => {
          const ft = new FakeTimers();
          const calls: any[] = [];
          const d = env.debounce((x: number) => calls.push(x), 10, ft);
          d('a'); await ft.advance(20);
          d('b'); await ft.advance(20);
          expect(calls).toEqual(['a', 'b']);
        }),
        ex('debounce: cancel() prevents the pending call', async ({ env, expect }) => {
          const ft = new FakeTimers();
          const calls: any[] = [];
          const d = env.debounce(() => calls.push(1), 10, ft);
          d(); d.cancel(); await ft.advance(50);
          expect(calls).toEqual([]);
          expect(ft.pending).toBe(0);
        }),
        ex('debounce: forwards this', async ({ env, expect }) => {
          const ft = new FakeTimers();
          const o: any = { v: 9, f: env.debounce(function (this: any) { return (o.out = this.v); }, 5, ft) };
          o.f();
          await ft.advance(10);
          expect(o.out).toBe(9);
        }),
        ex('throttle: first call is immediate, the rest are coalesced into one trailing call', async ({ env, expect }) => {
          const ft = new FakeTimers();
          const calls: any[] = [];
          const t = env.throttle((x: number) => calls.push([x, ft.now()]), 100, ft);
          t(1);
          expect(calls).toEqual([[1, 0]]);
          await ft.advance(10); t(2);
          await ft.advance(10); t(3);
          await ft.advance(100);
          expect(calls).toEqual([[1, 0], [3, 100]]);
        }),
        ex('throttle: resets after a quiet window', async ({ env, expect }) => {
          const ft = new FakeTimers();
          const calls: any[] = [];
          const t = env.throttle((x: number) => calls.push(x), 50, ft);
          t('a');
          await ft.advance(200);
          t('b');
          expect(calls).toEqual(['a', 'b']);
        }),
        hid('throttle: keeps going while calls keep arriving (a new window opens after each trailing call)', async ({ env, expect }) => {
          const ft = new FakeTimers();
          const calls: number[] = [];
          const t = env.throttle((x: number) => calls.push(x), 100, ft);
          for (let i = 0; i < 10; i++) { t(i); await ft.advance(30); }
          await ft.advance(200);
          expect(calls[0]).toBe(0);
          expect(calls[calls.length - 1]).toBe(9);
          expect(calls.length).toBeGreaterThan(2);
          expect(calls.length).toBeLessThan(6);
        }),
      ],
      hints: [
        'Both are closures holding a timer id. `debounce`: clear the previous timer and set a new one on every call.',
        '`throttle`: if no window is open (`id === null`) call `fn` and start a window; otherwise remember the latest arguments.',
        'When the throttle window ends: if something was remembered, call it **and open another window**.',
      ],
    }),
  ],
  references: [
    { title: 'HTML Standard — Event loops', url: 'https://html.spec.whatwg.org/multipage/webappapis.html#event-loops' },
    { title: 'Jake Archibald — Tasks, microtasks, queues and schedules', url: 'https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/' },
  ],
};
export default mod;
