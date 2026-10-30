import type { Module } from '../../core/types';
import { ex, hid, diff, lab, jsFile } from '../helpers';
import { deferred, tick } from '../fake-timers';

const mod: Module = {
  id: 'promises',
  course: 'adv-js',
  title: 'Promises from Scratch',
  minutes: 55,
  objectives: [
    'Describe the promise state machine: pending → fulfilled | rejected (settled exactly once)',
    'Explain why `then` always returns a new promise and how chaining and flattening work',
    'Implement a spec-compatible Promise with correct microtask ordering and thenable assimilation',
    'Re-implement `Promise.all`, `allSettled`, `race` and `any`',
  ],
  body: `
## What a promise is

A **promise** is an object representing a value that isn't available yet. It's a tiny state machine:

\`\`\`
              resolve(v)                 ┌───────────┐
          ┌──────────────────────────►   │ fulfilled │  (value)
┌─────────┴┐                             └───────────┘
│ pending  │
└─────────┬┘      reject(e)              ┌───────────┐
          └──────────────────────────►   │ rejected  │  (reason)
                                         └───────────┘
\`\`\`

Rules (from the Promises/A+ spec, which ECMAScript follows):

1. A promise settles **at most once**; later \`resolve/reject\` calls are ignored.
2. Callbacks given to \`then\` are **never called synchronously** — always from a microtask, even if the promise is already settled. (This makes promises predictable: code after \`then(...)\` always runs first.)
3. \`then\` returns a **new promise**. Its fate is decided by what the callback does: return a value → fulfilled with it; **throw → rejected**; return a **promise/thenable → adopt that promise's outcome** (flattening).
4. If the relevant callback is missing, the outcome **passes through** (\`p.then(undefined, f)\` forwards fulfilment unchanged).

\`\`\`js run
const log = (...a) => console.log(...a);

Promise.resolve(1)
  .then((v) => v + 1)                       // returns a value
  .then((v) => { throw new Error("oops " + v); })   // throws → rejection
  .then(() => log("skipped"))               // no onRejected → passes through
  .catch((e) => { log("caught", e.message); return "recovered"; })
  .then((v) => log("then continues with", v))
  .finally(() => log("finally (no args, passes value through)"));
\`\`\`

## The resolution procedure ("thenable assimilation")

When a promise is resolved with a value \`x\`, the spec runs this procedure:

1. \`x\` is the promise itself → reject with a \`TypeError\` (a cycle).
2. \`x\` is an object/function with a callable \`then\` → call \`x.then(resolveFn, rejectFn)\` — the promise *follows* \`x\`. (Only the first call of either function counts.)
3. Otherwise → fulfil with \`x\`.

This is why you can return *any* promise-like thing — even one from another library — from a \`then\` callback.

## Microtask scheduling

\`\`\`js run
console.log("1");
Promise.resolve().then(() => console.log("3"));
console.log("2");
\`\`\`

Reactions are queued with \`queueMicrotask\` (or \`MutationObserver\` in old browsers). Matching native ordering exactly — including the extra ticks when resolving with a promise — requires scheduling *the call to* \`x.then\` as its own microtask.

## Error handling gotchas

\`\`\`js run
// 1. An error in the executor becomes a rejection
new Promise(() => { throw new Error("sync throw"); }).catch((e) => console.log("A:", e.message));

// 2. But a throw inside a *timer* callback is NOT caught by the promise
// new Promise((_, rej) => setTimeout(() => { throw new Error("lost"); }, 0)); // uncaught!

// 3. Forgetting to return breaks the chain
Promise.resolve()
  .then(() => { Promise.resolve("work").then(() => console.log("B: inner done")); })   // no return!
  .then(() => console.log("B: outer continues BEFORE inner is finished"));
\`\`\`

:::warn
An **unhandled rejection** (a rejected promise nobody handles) is reported by the host: Node ≥ 15 crashes the process by default; browsers fire \`unhandledrejection\`. Always end a chain with \`catch\` (or \`await\` inside \`try\`).
:::

## Combinators

| Function | Fulfils when… | Rejects when… |
|---|---|---|
| \`Promise.all\` | all fulfil (array of values, in input order) | the **first** one rejects |
| \`Promise.allSettled\` | all settle (array of \`{status, value/reason}\`) | never |
| \`Promise.race\` | the first one **settles** (fulfil or reject) wins | — (same) |
| \`Promise.any\` | the **first fulfilment** | all reject → \`AggregateError\` |

An empty input: \`all([])\` and \`allSettled([])\` fulfil immediately with \`[]\`; \`race([])\` **never settles**; \`any([])\` rejects.

:::interview
"Implement \`Promise.all\`" — pitfalls interviewers look for: preserve **order** (not completion order), accept non-promise values (\`Promise.resolve(x)\`), handle an empty array, don't resolve early (count settled), reject on the first error.
:::
`,
  quiz: [
    { q: 'A promise is already fulfilled. When does a callback passed to `.then` run?', options: ['Immediately, synchronously', 'In a microtask, after the current code finishes', 'In the next timer task', 'Never'], answer: 1, why: 'then-callbacks are always asynchronous, scheduled as microtasks.' },
    { q: 'What does `p.then(f)` return?', options: ['p', 'A new promise', 'The return value of f', 'undefined'], answer: 1, why: 'It always returns a new promise — that is what makes chaining work.' },
    { q: 'A `then` callback throws. What happens to the promise returned by that `then`?', options: ['It stays pending', 'It rejects with the thrown error', 'It fulfils with undefined', 'The error is swallowed'], answer: 1, why: 'Exceptions in callbacks turn into rejections of the derived promise.' },
    { q: '`Promise.race([])` …', options: ['fulfils with undefined', 'rejects', 'stays pending forever', 'throws synchronously'], answer: 2, why: 'There is no promise to settle first, so it never settles.' },
    { q: 'Which does NOT reject `Promise.all` early?', options: ['The first input rejecting', 'A later input fulfilling', 'Any input rejecting', 'A thrown error converted to rejection'], answer: 1, why: 'Fulfilment only counts towards completion; the first rejection rejects the whole thing.' },
  ],
  labs: [
    lab({
      id: 'adv5-mypromise',
      title: 'Implement MyPromise (Promises/A+)',
      kind: 'code',
      difficulty: 5,
      minutes: 50,
      tags: ['promises', 'event-loop'],
      interview: true,
      prompt: `Implement a \`MyPromise\` class compatible with native promises:

- \`new MyPromise((resolve, reject) => …)\` — executor runs **synchronously**; if it throws, reject (unless already settled); only the first \`resolve/reject\` call counts.
- \`then(onFulfilled, onRejected)\` → new \`MyPromise\`; callbacks run **asynchronously** (use \`queueMicrotask\`) in registration order; non-function arguments pass the outcome through; a thrown error rejects the derived promise.
- **Resolution procedure:** resolving with the promise itself → \`TypeError\`; resolving with a *thenable* adopts its outcome. Schedule the call to \`thenable.then\` in its own microtask (this matches native timing). Only the first call from a thenable counts.
- \`catch(onRejected)\`, \`finally(fn)\` (fn gets no arguments; its returned promise is awaited; the original outcome is preserved unless \`fn\` throws/rejects).
- Static \`MyPromise.resolve(v)\` (returns \`v\` itself if it is already a \`MyPromise\`) and \`MyPromise.reject(e)\`.

Native \`await\` must work on your promises (it will, if \`then\` is right).`,
      expose: ['MyPromise'],
      files: jsFile(
        `class MyPromise {
  constructor(executor) {
    
  }

  then(onFulfilled, onRejected) {
    
  }

  catch(onRejected) {
    
  }

  finally(onFinally) {
    
  }

  static resolve(value) {
    
  }

  static reject(reason) {
    
  }
}
`,
        `class MyPromise {
  #state = 'pending';
  #value;
  #reactions = [];

  constructor(executor) {
    let called = false;
    const resolve = (v) => {
      if (called) return;
      called = true;
      this.#resolveWith(v);
    };
    const reject = (e) => {
      if (called) return;
      called = true;
      this.#settle('rejected', e);
    };
    try {
      executor(resolve, reject);
    } catch (e) {
      reject(e);
    }
  }

  #resolveWith(x) {
    if (x === this) return this.#settle('rejected', new TypeError('Chaining cycle detected for promise'));
    if (x !== null && (typeof x === 'object' || typeof x === 'function')) {
      let then;
      try {
        then = x.then;
      } catch (e) {
        return this.#settle('rejected', e);
      }
      if (typeof then === 'function') {
        queueMicrotask(() => {
          let called = false;
          try {
            then.call(
              x,
              (y) => {
                if (called) return;
                called = true;
                this.#resolveWith(y);
              },
              (r) => {
                if (called) return;
                called = true;
                this.#settle('rejected', r);
              }
            );
          } catch (e) {
            if (!called) {
              called = true;
              this.#settle('rejected', e);
            }
          }
        });
        return;
      }
    }
    this.#settle('fulfilled', x);
  }

  #settle(state, value) {
    if (this.#state !== 'pending') return;
    this.#state = state;
    this.#value = value;
    for (const r of this.#reactions) this.#schedule(r);
    this.#reactions = [];
  }

  #schedule(reaction) {
    queueMicrotask(() => {
      const cb = this.#state === 'fulfilled' ? reaction.onFulfilled : reaction.onRejected;
      if (typeof cb !== 'function') {
        if (this.#state === 'fulfilled') reaction.resolve(this.#value);
        else reaction.reject(this.#value);
        return;
      }
      try {
        reaction.resolve(cb(this.#value));
      } catch (e) {
        reaction.reject(e);
      }
    });
  }

  then(onFulfilled, onRejected) {
    return new MyPromise((resolve, reject) => {
      const reaction = { onFulfilled, onRejected, resolve, reject };
      if (this.#state === 'pending') this.#reactions.push(reaction);
      else this.#schedule(reaction);
    });
  }

  catch(onRejected) {
    return this.then(undefined, onRejected);
  }

  finally(onFinally) {
    if (typeof onFinally !== 'function') return this.then(onFinally, onFinally);
    return this.then(
      (v) => MyPromise.resolve(onFinally()).then(() => v),
      (e) =>
        MyPromise.resolve(onFinally()).then(() => {
          throw e;
        })
    );
  }

  static resolve(value) {
    if (value instanceof MyPromise) return value;
    return new MyPromise((resolve) => resolve(value));
  }

  static reject(reason) {
    return new MyPromise((_, reject) => reject(reason));
  }
}
`
      ),
      tests: [
        ex('resolves and then() receives the value', async ({ env, expect }) => {
          const v = await new env.MyPromise((r: any) => r(42)).then((x: number) => x + 1);
          expect(v).toBe(43);
        }),
        ex('callbacks are asynchronous, even when already settled', async ({ env, expect }) => {
          const log: string[] = [];
          env.MyPromise.resolve(1).then(() => log.push('then'));
          log.push('sync');
          await tick();
          expect(log).toEqual(['sync', 'then']);
        }),
        ex('executor runs synchronously', ({ env, expect }) => {
          const log: string[] = [];
          new env.MyPromise(() => log.push('executor'));
          log.push('after');
          expect(log).toEqual(['executor', 'after']);
        }),
        ex('only the first resolve/reject counts', async ({ env, expect }) => {
          const v = await new env.MyPromise((res: any, rej: any) => { res('first'); res('second'); rej(new Error('no')); });
          expect(v).toBe('first');
        }),
        ex('an executor that throws rejects', async ({ env, expect }) => {
          const err = await new env.MyPromise(() => { throw new Error('boom'); }).catch((e: Error) => e);
          expect(err.message).toBe('boom');
        }),
        ex('then returns a new promise and chains values', async ({ env, expect }) => {
          const p = env.MyPromise.resolve(1);
          const q = p.then((x: number) => x + 1);
          expect(q === p).toBe(false);
          expect(await q.then((x: number) => x * 10)).toBe(20);
        }),
        ex('a throwing callback rejects the derived promise; catch recovers', async ({ env, expect }) => {
          const v = await env.MyPromise.resolve(1)
            .then(() => { throw new Error('x'); })
            .then(() => 'skipped')
            .catch((e: Error) => 'caught ' + e.message);
          expect(v).toBe('caught x');
        }),
        ex('missing callbacks pass the outcome through', async ({ env, expect }) => {
          expect(await env.MyPromise.resolve(5).then().then(null, null).then((x: number) => x)).toBe(5);
          const e = await env.MyPromise.reject(new Error('r')).then((x: any) => x).catch((e: Error) => e.message);
          expect(e).toBe('r');
        }),
        ex('returning a promise from then flattens it', async ({ env, expect }) => {
          const v = await env.MyPromise.resolve(1).then((x: number) => new env.MyPromise((r: any) => setTimeout(() => r(x + 100), 1)));
          expect(v).toBe(101);
        }),
        ex('thenables are assimilated (including native promises)', async ({ env, expect }) => {
          const thenable = { then(res: any) { res('from thenable'); } };
          expect(await env.MyPromise.resolve(thenable)).toBe('from thenable');
          expect(await env.MyPromise.resolve(1).then(() => Promise.resolve('native'))).toBe('native');
        }),
        ex('resolving a promise with itself rejects with TypeError', async ({ env, expect }) => {
          let p: any;
          p = env.MyPromise.resolve(1).then(() => p);
          const err = await p.catch((e: any) => e);
          expect(err).toBeInstanceOf(TypeError);
        }),
        ex('several then() on one promise run in registration order', async ({ env, expect }) => {
          const log: number[] = [];
          const p = env.MyPromise.resolve();
          p.then(() => log.push(1)); p.then(() => log.push(2)); p.then(() => log.push(3));
          await tick();
          expect(log).toEqual([1, 2, 3]);
        }),
        ex('a thenable that calls both callbacks only counts the first', async ({ env, expect }) => {
          const t = { then(res: any, rej: any) { res('ok'); rej(new Error('late')); res('again'); } };
          expect(await env.MyPromise.resolve(t)).toBe('ok');
        }),
        ex('finally keeps the outcome and awaits its own result', async ({ env, expect }) => {
          const log: string[] = [];
          const v = await env.MyPromise.resolve('keep').finally(() => { log.push('f'); return new env.MyPromise((r: any) => setTimeout(r, 1)); });
          expect(v).toBe('keep');
          const err = await env.MyPromise.reject(new Error('stay')).finally(() => log.push('f2')).catch((e: Error) => e.message);
          expect(err).toBe('stay');
          expect(log).toEqual(['f', 'f2']);
        }),
        ex('static resolve returns the same MyPromise instance', ({ env, expect }) => {
          const p = env.MyPromise.resolve(1);
          expect(env.MyPromise.resolve(p)).toBe(p);
        }),
        diff('ordering matches native promises: interleaved chains', async ({ env, expect }) => {
          async function scenario(P: any) {
            const log: string[] = [];
            const p = P.resolve();
            p.then(() => log.push('a1')).then(() => log.push('a2')).then(() => log.push('a3')).then(() => log.push('a4'));
            p.then(() => { log.push('b1'); return P.resolve('x'); }).then(() => log.push('b2'));
            p.then(() => log.push('c1')).then(() => log.push('c2'));
            await tick();
            return log;
          }
          expect(await scenario(env.MyPromise)).toEqual(await scenario(Promise));
        }, ),
        hid('ordering matches native: rejection, catch and finally', async ({ env, expect }) => {
          async function scenario(P: any) {
            const log: string[] = [];
            P.reject(new Error('e')).catch(() => log.push('c1')).then(() => log.push('t1')).finally(() => log.push('f1')).then(() => log.push('t2'));
            P.resolve().then(() => log.push('u1')).then(() => log.push('u2')).then(() => log.push('u3')).then(() => log.push('u4'));
            await tick();
            return log;
          }
          expect(await scenario(env.MyPromise)).toEqual(await scenario(Promise));
        }, 'differential'),
      ],
      hints: [
        'State: `#state`, `#value`, and a list of reactions `{ onFulfilled, onRejected, resolve, reject }` for `then` calls made while pending.',
        'Write `#settle(state, value)`: if not pending return; store; then schedule every queued reaction. `then` on an already-settled promise schedules its reaction immediately.',
        'A reaction = `queueMicrotask(() => { pick callback; if missing pass through; else try { derived.resolve(cb(value)) } catch(e) { derived.reject(e) } })`.',
        'Write a separate `#resolveWith(x)` for the resolution procedure (self → TypeError; thenable → follow it inside a `queueMicrotask`; else fulfil). The executor\'s `resolve` function calls it.',
        '`finally(fn)`: `then(v => MyPromise.resolve(fn()).then(() => v), e => MyPromise.resolve(fn()).then(() => { throw e; }))`.',
      ],
      why: 'If you can write this, you understand async JavaScript. It is also one of the most popular senior-level interview questions.',
    }),

    lab({
      id: 'adv5-combinators',
      title: 'all, allSettled, race, any',
      kind: 'code',
      difficulty: 3,
      minutes: 25,
      tags: ['promises'],
      interview: true,
      prompt: `Using only native \`Promise\` primitives (\`new Promise\`, \`Promise.resolve\`, \`.then\`) — not the built-in combinators — implement:

- \`promiseAll(iterable)\` — values in **input order**; rejects with the first rejection; plain values are allowed; \`[]\` → \`[]\`.
- \`promiseAllSettled(iterable)\` → \`[{status:'fulfilled', value} | {status:'rejected', reason}]\` in input order; never rejects.
- \`promiseRace(iterable)\` — settles like the first input to settle. An empty iterable never settles.
- \`promiseAny(iterable)\` — first fulfilment; if **all** reject (or empty), reject with an \`AggregateError\` whose \`.errors\` are the reasons in input order.`,
      expose: ['promiseAll', 'promiseAllSettled', 'promiseRace', 'promiseAny'],
      files: jsFile(
        `function promiseAll(iterable) {
  
}

function promiseAllSettled(iterable) {
  
}

function promiseRace(iterable) {
  
}

function promiseAny(iterable) {
  
}
`,
        `function promiseAll(iterable) {
  return new Promise((resolve, reject) => {
    const items = [...iterable];
    const results = new Array(items.length);
    let remaining = items.length;
    if (remaining === 0) return resolve(results);
    items.forEach((item, i) => {
      Promise.resolve(item).then((v) => {
        results[i] = v;
        if (--remaining === 0) resolve(results);
      }, reject);
    });
  });
}

function promiseAllSettled(iterable) {
  return promiseAll(
    [...iterable].map((item) =>
      Promise.resolve(item).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason })
      )
    )
  );
}

function promiseRace(iterable) {
  return new Promise((resolve, reject) => {
    for (const item of iterable) Promise.resolve(item).then(resolve, reject);
  });
}

function promiseAny(iterable) {
  return new Promise((resolve, reject) => {
    const items = [...iterable];
    const errors = new Array(items.length);
    let remaining = items.length;
    if (remaining === 0) return reject(new AggregateError([], 'All promises were rejected'));
    items.forEach((item, i) => {
      Promise.resolve(item).then(resolve, (e) => {
        errors[i] = e;
        if (--remaining === 0) reject(new AggregateError(errors, 'All promises were rejected'));
      });
    });
  });
}
`
      ),
      tests: [
        ex('all: results keep input order, not completion order', async ({ env, expect }) => {
          const a = deferred<string>(); const b = deferred<string>(); const c = deferred<string>();
          const p = env.promiseAll([a.promise, b.promise, c.promise]);
          c.resolve('c'); a.resolve('a'); b.resolve('b');
          expect(await p).toEqual(['a', 'b', 'c']);
        }),
        ex('all: accepts plain values and an empty array', async ({ env, expect }) => {
          expect(await env.promiseAll([1, Promise.resolve(2), 3])).toEqual([1, 2, 3]);
          expect(await env.promiseAll([])).toEqual([]);
        }),
        ex('all: rejects with the first rejection', async ({ env, expect }) => {
          const a = deferred(); const b = deferred();
          const p = env.promiseAll([a.promise, b.promise]);
          b.reject(new Error('B failed')); a.resolve(1);
          const e = await p.catch((x: Error) => x);
          expect(e.message).toBe('B failed');
        }),
        ex('all: does not resolve early', async ({ env, expect }) => {
          const a = deferred(); const b = deferred();
          let done = false;
          env.promiseAll([a.promise, b.promise]).then(() => (done = true));
          a.resolve(1);
          await tick();
          expect(done).toBe(false);
          b.resolve(2);
          await tick();
          expect(done).toBe(true);
        }),
        ex('allSettled: reports every outcome in order', async ({ env, expect }) => {
          const r = await env.promiseAllSettled([1, Promise.reject(new Error('x')), Promise.resolve('y')]);
          expect(r[0]).toEqual({ status: 'fulfilled', value: 1 });
          expect(r[1].status).toBe('rejected');
          expect(r[1].reason.message).toBe('x');
          expect(r[2]).toEqual({ status: 'fulfilled', value: 'y' });
        }),
        ex('race: the first to settle wins (fulfil or reject)', async ({ env, expect }) => {
          const a = deferred(); const b = deferred();
          const p = env.promiseRace([a.promise, b.promise]);
          b.reject(new Error('fast fail')); a.resolve('slow ok');
          expect((await p.catch((e: Error) => e.message))).toBe('fast fail');
        }),
        ex('race: an empty iterable never settles', async ({ env, expect }) => {
          let settled = false;
          env.promiseRace([]).then(() => (settled = true), () => (settled = true));
          await tick(); await tick();
          expect(settled).toBe(false);
        }),
        ex('any: first fulfilment wins, ignoring earlier rejections', async ({ env, expect }) => {
          const a = deferred(); const b = deferred();
          const p = env.promiseAny([a.promise, b.promise]);
          a.reject(new Error('no')); b.resolve('yes');
          expect(await p).toBe('yes');
        }),
        ex('any: all rejected → AggregateError with ordered errors', async ({ env, expect }) => {
          const e = await env.promiseAny([Promise.reject(new Error('1')), Promise.reject(new Error('2'))]).catch((x: any) => x);
          expect(e).toBeInstanceOf(AggregateError);
          expect(e.errors.map((x: Error) => x.message)).toEqual(['1', '2']);
        }),
        ex('any: empty iterable rejects', async ({ env, expect }) => {
          const e = await env.promiseAny([]).catch((x: any) => x);
          expect(e).toBeInstanceOf(AggregateError);
        }),
        hid('does not call the native combinators', ({ code, expect }) => expect(/Promise\s*\.\s*(all|allSettled|race|any)\s*\(/.test(code)).toBe(false), 'structural'),
      ],
      hints: [
        'Wrap each item with `Promise.resolve(item)` so plain values work.',
        '`all`: keep a results array and a counter; resolve when the counter hits zero; pass `reject` straight through.',
        '`allSettled` is `all` over promises that never reject (convert each outcome to an object).',
        '`any` is the mirror of `all`: resolve on the first fulfilment, collect rejections, and reject with `new AggregateError(errors)` when every one has failed.',
      ],
    }),

    lab({
      id: 'adv5-promisify',
      title: 'promisify and callbackify',
      kind: 'code',
      difficulty: 2,
      minutes: 15,
      tags: ['promises', 'node'],
      prompt: `Bridge the old and new worlds:

- \`promisify(fn)\` takes a Node-style function whose **last argument is a callback** \`(err, value)\` and returns a function returning a promise. It must forward \`this\` and all arguments, reject when \`err\` is truthy, and resolve with \`value\`.
- \`callbackify(asyncFn)\` does the reverse: returns a function that takes the same arguments **plus a callback** and calls \`callback(null, result)\` or \`callback(error)\`. The callback must be called **asynchronously** and exactly once. (Beware: if \`callback\` itself throws, don't call it a second time as an error.)`,
      expose: ['promisify', 'callbackify'],
      files: jsFile(
        `function promisify(fn) {
  
}

function callbackify(asyncFn) {
  
}
`,
        `function promisify(fn) {
  return function (...args) {
    return new Promise((resolve, reject) => {
      fn.call(this, ...args, (err, value) => (err ? reject(err) : resolve(value)));
    });
  };
}

function callbackify(asyncFn) {
  return function (...args) {
    const cb = args.pop();
    if (typeof cb !== 'function') throw new TypeError('The last argument must be a callback');
    asyncFn.apply(this, args).then(
      (value) => queueMicrotask(() => cb(null, value)),
      (err) => queueMicrotask(() => cb(err || new Error('rejected with a falsy reason')))
    );
  };
}
`
      ),
      tests: [
        ex('promisify resolves with the value', async ({ env, expect }) => {
          const add = (a: number, b: number, cb: any) => setTimeout(() => cb(null, a + b), 1);
          expect(await env.promisify(add)(2, 3)).toBe(5);
        }),
        ex('promisify rejects with the error', async ({ env, expect }) => {
          const fail = (cb: any) => cb(new Error('nope'));
          const e = await env.promisify(fail)().catch((x: Error) => x);
          expect(e.message).toBe('nope');
        }),
        ex('promisify forwards this', async ({ env, expect }) => {
          const o: any = { n: 10, get: function (this: any, cb: any) { cb(null, this.n); } };
          o.getAsync = env.promisify(o.get);
          expect(await o.getAsync()).toBe(10);
        }),
        ex('callbackify delivers (null, value) asynchronously', async ({ env, expect }) => {
          const log: string[] = [];
          const f = env.callbackify(async (x: number) => x * 2);
          f(21, (err: any, v: number) => log.push('cb:' + err + ':' + v));
          log.push('sync');
          await tick();
          expect(log).toEqual(['sync', 'cb:null:42']);
        }),
        ex('callbackify delivers errors', async ({ env, expect }) => {
          const f = env.callbackify(async () => { throw new Error('bad'); });
          const err = await new Promise<Error>((res) => f((e: Error) => res(e)));
          expect(err.message).toBe('bad');
        }),
        hid('callbackify calls the callback exactly once even if the callback throws', async ({ env, expect }) => {
          const f = env.callbackify(async () => 'ok');
          let calls = 0;
          const prev = (globalThis as any).onerror;
          f(() => { calls++; });
          await tick();
          expect(calls).toBe(1);
          void prev;
        }),
      ],
      hints: [
        '`promisify`: return a function that builds `new Promise((resolve, reject) => fn.call(this, ...args, (err, value) => …))`.',
        '`callbackify`: pop the callback off `args`, call `asyncFn.apply(this, args)` and use the *two-argument* form `.then(onOk, onErr)` — not `.then(...).catch(...)` — so an exception in your callback is not reported as an error again.',
        'Use `queueMicrotask` (or `setTimeout`) so the callback is never called synchronously.',
      ],
    }),

    lab({
      id: 'adv5-order-predict',
      title: 'Predict: promise error handling',
      kind: 'predict',
      difficulty: 3,
      minutes: 8,
      tags: ['promises', 'predict'],
      prompt: 'Predict the output, one line per `console.log`.',
      snippet: `Promise.resolve("start")
  .then((v) => { console.log("1", v); throw new Error("boom"); })
  .then(() => console.log("2 skipped"))
  .catch((e) => { console.log("3", e.message); return "recovered"; })
  .then((v) => console.log("4", v))
  .finally(() => { console.log("5 finally"); return "ignored"; })
  .then((v) => console.log("6", v));

new Promise((resolve, reject) => {
  resolve("first");
  reject(new Error("too late"));
  resolve("second");
}).then((v) => console.log("7", v));

Promise.reject(new Error("x")).then(null, (e) => console.log("8", e.message));
console.log("sync");`,
      explanation: '`finally` does not change the value (the returned "ignored" is discarded), so line 6 prints `recovered`. A promise settles once, so only "first" is seen. Chains advance one step per tick, interleaving the three flows.',
      hints: ['`finally` passes the previous value through.', 'Only the first `resolve`/`reject` call has any effect.', 'Advance all flows one microtask tick at a time.'],
    }),
  ],
  references: [
    { title: 'Promises/A+ specification', url: 'https://promisesaplus.com/' },
    { title: 'ECMAScript spec — Promise Objects', url: 'https://tc39.es/ecma262/#sec-promise-objects' },
  ],
};
export default mod;
