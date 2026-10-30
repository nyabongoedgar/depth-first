import type { Module } from '../../core/types';
import { ex, prop, hid, lab, jsFile } from '../helpers';

const mod: Module = {
  id: 'closures-scope',
  course: 'adv-js',
  title: 'Scope, Closures & Execution Contexts',
  minutes: 40,
  objectives: [
    'Explain how a function finds a variable using the scope chain',
    'Describe a closure as "a function + the environment it was created in"',
    'Predict loop-closure behaviour with `var` vs `let`',
    'Use closures for private state, memoization and function factories',
  ],
  body: `
## How JavaScript finds a variable

Every time code runs, the engine creates an **execution context**. Each context has a **lexical environment**: a table mapping names to values, plus a link to the *outer* environment — the one where the code was **written**, not where it is called. That link chain is the **scope chain**.

When you read \`x\`, the engine looks in the current environment, then the outer one, then the next… until it reaches the global environment. If nothing has \`x\`, you get a \`ReferenceError\`.

\`\`\`js run
const level = "global";

function outer() {
  const level = "outer";
  function inner() {
    return level;           // found in outer's environment, not global
  }
  return inner;
}

console.log(outer()());      // "outer"  — decided by where inner was *written*
\`\`\`

:::tip
JavaScript has **lexical** (a.k.a. static) scope. You can answer "what does \`x\` refer to?" by *reading the source*, without running it. Dynamic scope (where it depends on who called you) is what \`this\` does — see the next-but-one module.
:::

## Closures

A **closure** is a function bundled with a reference to the environment it was created in. The environment is kept alive as long as the function can still be called, even after the outer function has returned.

\`\`\`js run
function makeCounter() {
  let count = 0;                 // lives in makeCounter's environment
  return () => ++count;          // closes over \`count\` (the variable, not its value)
}

const a = makeCounter();
const b = makeCounter();         // a *new* environment, so a new \`count\`
console.log(a(), a(), a(), b());   // 1 2 3 1
\`\`\`

The key phrase is *the variable, not its value*. A closure sees later changes:

\`\`\`js run
let greeting = "hello";
const say = () => greeting;
greeting = "goodbye";
console.log(say());            // "goodbye"
\`\`\`

## \`var\`, \`let\` and the loop trap

\`var\` is **function-scoped**: one variable per function. \`let\`/\`const\` are **block-scoped**: and a \`for (let …)\` loop makes a **fresh binding for every iteration**.

\`\`\`js run
const withVar = [];
for (var i = 0; i < 3; i++) withVar.push(() => i);   // all three share ONE i

const withLet = [];
for (let j = 0; j < 3; j++) withLet.push(() => j);   // each iteration has its own j

console.log(withVar.map((f) => f()));   // [3, 3, 3]
console.log(withLet.map((f) => f()));   // [0, 1, 2]
\`\`\`

## Hoisting and the temporal dead zone

Declarations are registered when the environment is created, *before* any code runs ("hoisting"). But they behave differently:

| Declaration | Hoisted? | Usable before its line? |
|---|---|---|
| \`var x\` | yes, initialised to \`undefined\` | yes → \`undefined\` |
| \`function f(){}\` | yes, fully initialised | yes |
| \`let\` / \`const\` / \`class\` | yes, but **uninitialised** | no → \`ReferenceError\` (the *temporal dead zone*) |

\`\`\`js run:error
console.log(typeof later);   // "undefined" — var is hoisted
var later = 1;

console.log(tooSoon);        // ReferenceError: Cannot access 'tooSoon' before initialization
let tooSoon = 2;
\`\`\`

## What closures are used for

1. **Private state** — nothing outside can touch \`count\` above except through the function.
2. **Function factories** — \`makeAdder(5)\` returns a function specialised to 5.
3. **Memoization / caches** — a function that remembers earlier results.
4. **Callbacks and event handlers** — they remember the data they were created with.
5. **Modules (the old way)** — an IIFE returning an object of functions.

:::warn
**Memory:** a closure keeps its *entire* environment alive (engines optimise, but you can't rely on it). A long-lived callback that closes over a huge array keeps that array in memory. Module 10 returns to this.
:::

:::interview
"What is a closure?" — answer with a one-sentence definition, a 5-line example, and one real use (private state or memoization). Mentioning "captures the variable, not the value" and the \`var\` loop gotcha shows depth.
:::
`,
  quiz: [
    { q: 'What decides which variable `x` refers to inside a function?', options: ['Where the function is called from', 'Where the function is written in the source', 'The order functions were defined at runtime', 'The value of `this`'], answer: 1, why: 'JavaScript is lexically scoped: the outer environment is determined by where the function was written.' },
    { q: 'What does `[1,2,3].map(n => () => n)` produce when each function is called later?', options: ['[3, 3, 3]', '[1, 2, 3]', '[undefined × 3]', 'An error'], answer: 1, why: 'Each callback invocation has its own parameter `n`, so each closure captures a different environment.' },
    { q: 'After `for (var i = 0; i < 3; i++) fns.push(() => i)`, what do the functions return?', options: ['0, 1, 2', '3, 3, 3', '2, 2, 2', 'undefined'], answer: 1, why: '`var` creates one shared binding; by the time the functions run the loop has finished with i = 3.' },
    { q: 'Which statement about `let` in the temporal dead zone is true?', options: ['It is `undefined`', 'It throws a ReferenceError if read', 'It is `null`', 'It is hoisted with its value'], answer: 1, why: 'The binding exists but is uninitialised until its declaration line runs.' },
  ],
  labs: [
    lab({
      id: 'adv1-counter',
      title: 'A counter factory with private state',
      kind: 'code',
      difficulty: 1,
      minutes: 10,
      tags: ['closures'],
      prompt: `Write \`makeCounter(start = 0, step = 1)\` returning an object with three methods:

- \`next()\` — adds \`step\`, returns the **new** value
- \`peek()\` — returns the current value without changing it
- \`reset()\` — sets the value back to \`start\`

Each counter must have its **own private** state, and the value must not be reachable as a property (no \`counter.value\`).`,
      expose: ['makeCounter'],
      files: jsFile(
        `function makeCounter(start = 0, step = 1) {
  // keep the state in a variable that only your methods can see
}
`,
        `function makeCounter(start = 0, step = 1) {
  let value = start;
  return {
    next() {
      value += step;
      return value;
    },
    peek: () => value,
    reset() {
      value = start;
    },
  };
}
`
      ),
      tests: [
        ex('counts up from the start value', ({ env, expect }) => {
          const c = env.makeCounter(10, 5);
          expect([c.peek(), c.next(), c.next(), c.peek()]).toEqual([10, 15, 20, 20]);
        }),
        ex('defaults: start 0, step 1', ({ env, expect }) => {
          const c = env.makeCounter();
          expect([c.next(), c.next()]).toEqual([1, 2]);
        }),
        ex('reset() goes back to the start', ({ env, expect }) => {
          const c = env.makeCounter(3);
          c.next();
          c.next();
          c.reset();
          expect(c.peek()).toBe(3);
        }),
        ex('counters do not share state', ({ env, expect }) => {
          const a = env.makeCounter();
          const b = env.makeCounter();
          a.next();
          a.next();
          expect(b.peek()).toBe(0);
        }),
        ex('state is private (no value/count property)', ({ env, expect }) => {
          const c = env.makeCounter(7);
          const exposed = Object.values(c).filter((v) => typeof v !== 'function');
          expect(exposed).toEqual([]);
        }),
      ],
      hints: [
        'Declare `let value = start;` inside the function, outside the returned object.',
        'The methods are closures: they read and write `value` from the environment they were created in.',
        'Return `{ next() {...}, peek() {...}, reset() {...} }` — and nothing else.',
      ],
      why: 'Closures are how JS modules, React hooks and many libraries keep private state.',
    }),

    lab({
      id: 'adv1-memoize',
      title: 'memoize',
      kind: 'code',
      difficulty: 2,
      minutes: 15,
      tags: ['closures', 'caching'],
      prompt: `Write \`memoize(fn, keyFn)\` returning a function that caches results.

- The cache key defaults to \`JSON.stringify(args)\`; if \`keyFn\` is given, use \`keyFn(...args)\`.
- Calling with the same key must **not** call \`fn\` again — including when the result is \`undefined\` or \`0\` (don't use truthiness to detect a hit!).
- The memoized function must forward \`this\` and all arguments.
- Add a \`.clear()\` method on the memoized function that empties the cache.`,
      expose: ['memoize'],
      files: jsFile(
        `function memoize(fn, keyFn) {
  
}
`,
        `function memoize(fn, keyFn) {
  const cache = new Map();
  function memoized(...args) {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  }
  memoized.clear = () => cache.clear();
  return memoized;
}
`
      ),
      tests: [
        ex('returns the same results as the original', ({ env, expect }) => {
          const f = env.memoize((a: number, b: number) => a + b);
          expect([f(1, 2), f(1, 2), f(2, 3)]).toEqual([3, 3, 5]);
        }),
        ex('calls the original only once per distinct arguments', ({ env, expect }) => {
          let calls = 0;
          const f = env.memoize((n: number) => (calls++, n * 2));
          f(4); f(4); f(4); f(5);
          expect(calls).toBe(2);
        }),
        ex('caches falsy results (0, undefined, "")', ({ env, expect }) => {
          let calls = 0;
          const f = env.memoize((x: number) => (calls++, x === 0 ? 0 : x === 1 ? undefined : ''));
          f(0); f(0); f(1); f(1); f(2); f(2);
          expect(calls).toBe(3);
        }),
        ex('custom keyFn decides what counts as "the same"', ({ env, expect }) => {
          let calls = 0;
          const f = env.memoize((o: { id: number }) => (calls++, o.id), (o: { id: number }) => o.id);
          f({ id: 1 }); f({ id: 1 });
          expect(calls).toBe(1);
        }),
        ex('forwards `this`', ({ env, expect }) => {
          const obj = { k: 10, add: env.memoize(function (this: any, n: number) { return this.k + n; }) };
          expect(obj.add(5)).toBe(15);
        }),
        ex('clear() empties the cache', ({ env, expect }) => {
          let calls = 0;
          const f = env.memoize((n: number) => (calls++, n));
          f(1); f.clear(); f(1);
          expect(calls).toBe(2);
        }),
        hid('works as a Fibonacci accelerator', async ({ env, expect, measure }) => {
          const fib: any = env.memoize((n: number): number => (n < 2 ? n : fib(n - 1) + fib(n - 2)));
          const { value, steps } = await measure(() => fib(60));
          expect(value).toBe(1548008755920);
          expect(steps).toBeLessThan(2000);
        }),
      ],
      hints: [
        'Keep a `Map` inside `memoize` (a closure!) and look results up with `cache.has(key)`.',
        'Use `function memoized(...args)` (not an arrow) so `this` works, and `fn.apply(this, args)`.',
        'Attach `memoized.clear = () => cache.clear();` before returning.',
      ],
      why: 'Memoization is the simplest cache; it is also the core trick behind dynamic programming and selector libraries.',
    }),

    lab({
      id: 'adv1-once-after',
      title: 'once and after',
      kind: 'code',
      difficulty: 2,
      minutes: 15,
      tags: ['closures', 'higher-order'],
      prompt: `Implement two higher-order functions:

1. \`once(fn)\` — returns a function that calls \`fn\` **only the first time**; every later call returns the **first result** without calling \`fn\`.
2. \`after(n, fn)\` — returns a function that ignores the first \`n - 1\` calls, and from the \`n\`th call on calls \`fn\` (with that call's arguments, returning its result). Before that it returns \`undefined\`.

Both must forward arguments and \`this\`.`,
      expose: ['once', 'after'],
      files: jsFile(
        `function once(fn) {
  
}

function after(n, fn) {
  
}
`,
        `function once(fn) {
  let called = false;
  let result;
  return function (...args) {
    if (!called) {
      called = true;
      result = fn.apply(this, args);
    }
    return result;
  };
}

function after(n, fn) {
  let calls = 0;
  return function (...args) {
    calls++;
    if (calls >= n) return fn.apply(this, args);
  };
}
`
      ),
      tests: [
        ex('once: runs fn a single time', ({ env, expect }) => {
          let c = 0;
          const f = env.once(() => ++c);
          f(); f(); f();
          expect(c).toBe(1);
        }),
        ex('once: later calls return the first result', ({ env, expect }) => {
          const f = env.once((x: number) => x * 2);
          expect([f(5), f(100)]).toEqual([10, 10]);
        }),
        ex('once: works even if the result is undefined', ({ env, expect }) => {
          let c = 0;
          const f = env.once(() => { c++; });
          f(); f();
          expect(c).toBe(1);
        }),
        ex('after: waits for the nth call', ({ env, expect }) => {
          const seen: number[] = [];
          const f = env.after(3, (x: number) => { seen.push(x); return x; });
          expect([f(1), f(2), f(3), f(4)]).toEqual([undefined, undefined, 3, 4]);
          expect(seen).toEqual([3, 4]);
        }),
        ex('after(1, fn) behaves like fn', ({ env, expect }) => {
          const f = env.after(1, (x: number) => x + 1);
          expect(f(1)).toBe(2);
        }),
        ex('both forward `this`', ({ env, expect }) => {
          const o = { v: 7, a: env.once(function (this: any) { return this.v; }), b: env.after(1, function (this: any) { return this.v; }) };
          expect([o.a(), o.b()]).toEqual([7, 7]);
        }),
      ],
      hints: [
        'Both need a little private state: `once` needs "called yet?" and the result; `after` needs a call counter.',
        '`once`: a `called` flag plus a `result`; set both on the first call.',
        '`after`: increment a counter on every call; only call `fn` once the counter reaches `n`.',
      ],
    }),

    lab({
      id: 'adv1-loop-predict',
      title: 'Predict: closures in loops',
      kind: 'predict',
      difficulty: 2,
      minutes: 8,
      tags: ['closures', 'predict'],
      prompt: `What does this program print? Type the output, **one line per console.log**, in order. (The timers fire in virtual time — only the *order* matters.)`,
      snippet: `for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log("var", i), 0);
}
for (let j = 0; j < 3; j++) {
  setTimeout(() => console.log("let", j), 0);
}
const fns = [];
for (var k = 0; k < 3; k++) {
  fns.push(((n) => () => n)(k));   // IIFE captures the current value
}
console.log("iife", fns.map((f) => f()).join(","));`,
      explanation: `The synchronous \`console.log("iife", …)\` runs first. Then the six timers fire in registration order: the three \`var\` callbacks all see the single shared \`i\`, which is 3 by now; the three \`let\` callbacks each see their own \`j\`.`,
      hints: ['Synchronous code always finishes before any timer callback runs.', 'Timers with the same delay fire in the order they were registered.', 'All the `var` callbacks share a single `i`.'],
    }),
  ],
  references: [
    { title: 'ECMAScript spec — Environment Records', url: 'https://tc39.es/ecma262/#sec-environment-records' },
    { title: 'You Don’t Know JS Yet: Scope & Closures (Kyle Simpson)' },
  ],
};
export default mod;
