import type { Module } from '../../core/types';
import { ex, hid, prop, perf, lab, jsFile } from '../helpers';

const mod: Module = {
  id: 'functional',
  course: 'adv-js',
  title: 'Functional Techniques & Immutable Data',
  minutes: 40,
  objectives: [
    'Compose behaviour from small pure functions: `curry`, `compose`, `pipe`',
    'Update nested data immutably with structural sharing',
    'Replace deep recursion with a trampoline',
    'Know when immutability and purity pay off — and what they cost',
  ],
  body: `
## Pure functions

A **pure function** returns the same output for the same input and has **no side effects** (no mutation of arguments or globals, no I/O, no \`Math.random\`/\`Date.now\`). Pure code is easy to test, cache (memoize), run in parallel, and reason about. Real programs need effects, so the aim is: **push effects to the edges** and keep the core pure.

\`\`\`js run
const impure = (arr) => { arr.push(1); return arr; };      // mutates its input
const pure = (arr) => [...arr, 1];                          // returns a new array
const a = [0];
console.log(pure(a), a);     // [0,1] [0]
console.log(impure(a), a);   // [0,1] [0,1]  ← the caller's data changed behind its back
\`\`\`

## Higher-order functions, currying and composition

Functions are values, so functions can take and return functions.

- **Currying** turns \`f(a, b, c)\` into \`f(a)(b)(c)\`. Each call returns a function waiting for the next argument.
- **Partial application** fixes some arguments up front (\`bind\` does this).
- **Composition** chains functions: \`compose(f, g)(x) === f(g(x))\`. \`pipe\` is the same in reading order: \`pipe(g, f)(x)\`.

\`\`\`js run
const curry = (fn) => function c(...args) {
  return args.length >= fn.length ? fn(...args) : (...more) => c(...args, ...more);
};
const add = curry((a, b, c) => a + b + c);
console.log(add(1)(2)(3), add(1, 2)(3), add(1)(2, 3));

const pipe = (...fns) => (x) => fns.reduce((acc, f) => f(acc), x);
const slugify = pipe((s) => s.trim(), (s) => s.toLowerCase(), (s) => s.replace(/\\s+/g, "-"));
console.log(slugify("  Hello Brave New World "));
\`\`\`

## Immutable updates and structural sharing

Never mutate state you don't own. Instead **copy the path** you change and **reuse everything else**:

\`\`\`js run
const state = { user: { name: "Ada", tags: ["a"] }, settings: { dark: true } };
const next = { ...state, user: { ...state.user, name: "Grace" } };

console.log(next.settings === state.settings);   // true  — untouched branch is *shared*
console.log(next.user === state.user);            // false — changed branch is new
console.log(next.user.tags === state.user.tags);  // true  — untouched leaf is shared
\`\`\`

This is how Redux, React and Immer work: because unchanged parts keep the same identity, "did anything change?" is a cheap \`===\` check. A deep clone would destroy that and be O(size). \`Object.freeze\` (shallow) can enforce immutability in development.

:::tip
Modern JS has non-mutating array methods: \`toSorted\`, \`toReversed\`, \`toSpliced\`, \`with\`. Older code uses \`[...arr].sort()\`, \`slice\`, \`concat\`, \`filter\`, \`map\`. Remember: \`sort\`, \`reverse\`, \`splice\`, \`push\`, \`pop\`, \`shift\`, \`unshift\`, \`fill\` **mutate**.
:::

## Recursion and the stack

JavaScript engines have a limited call stack (~10,000 frames). \`sumTo(100000)\` written recursively throws \`RangeError: Maximum call stack size exceeded\`. (The spec allows tail-call optimisation, but only Safari implements it.) A **trampoline** turns recursion into a loop: the function returns a *thunk* (a function describing the next step) instead of calling itself, and a driver loop keeps calling thunks.

\`\`\`js run
const trampoline = (f) => (...args) => {
  let r = f(...args);
  while (typeof r === "function") r = r();
  return r;
};
const sumTo = trampoline(function go(n, acc = 0) {
  return n === 0 ? acc : () => go(n - 1, acc + n);
});
console.log(sumTo(100000));
\`\`\`

## Costs and judgement

- Copying large arrays on every change is O(n) — use structural-sharing libraries (Immer, Immutable.js) or persistent data structures (tries) when it matters.
- Allocation pressure: many small objects stress the GC (usually fine; measure).
- Don't contort code for purity where a local mutation is invisible to callers (a \`for\` loop building a result array is fine).

:::interview
"Implement curry / compose / debounce / deepClone / flatten." These small functional utilities are interview staples because each tests closures plus one more concept (\`fn.length\`, \`reduce\`, timers, cycles, recursion).
:::
`,
  quiz: [
    { q: 'Which is a pure function?', options: ['`() => Date.now()`', '`(a, b) => a + b`', '`(arr) => arr.sort()`', '`(x) => console.log(x)`'], answer: 1, why: 'Same inputs always give the same result and nothing outside is touched. `sort()` mutates its input.' },
    { q: 'What is structural sharing?', options: ['Deep-cloning an object', 'A new version reuses the unchanged parts of the old version', 'Sharing memory between Workers', 'Freezing objects'], answer: 1, why: 'Only the path to the change is copied; untouched subtrees keep their identity.' },
    { q: '`compose(f, g)(x)` equals…', options: ['g(f(x))', 'f(g(x))', 'f(x) + g(x)', 'f(x)(g)'], answer: 1, why: 'compose applies right to left; pipe applies left to right.' },
    { q: 'Why does a trampoline avoid stack overflow?', options: ['It uses threads', 'Each step returns to the driver loop instead of nesting calls', 'It disables the stack limit', 'It caches results'], answer: 1, why: 'Stack depth stays constant because the loop, not the recursion, drives iteration.' },
  ],
  labs: [
    lab({
      id: 'adv9-curry',
      title: 'curry',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['functional', 'closures'],
      interview: true,
      prompt: `Write \`curry(fn)\` using \`fn.length\` (the arity). The curried function accepts arguments in **any grouping**: \`c(1)(2)(3)\`, \`c(1, 2)(3)\`, \`c(1)(2, 3)\`, \`c(1, 2, 3)\` all call \`fn(1, 2, 3)\`.

- When at least \`fn.length\` arguments have been collected, call \`fn\` with **all** of them (extra arguments are passed through) and return its result.
- Curried functions are reusable: partially applied functions can be called many times without interfering.
- Forward \`this\`.`,
      expose: ['curry'],
      files: jsFile(
        `function curry(fn) {
  
}
`,
        `function curry(fn) {
  return function curried(...args) {
    if (args.length >= fn.length) return fn.apply(this, args);
    return (...more) => curried.apply(this, [...args, ...more]);   // arrow: keeps the first call's \`this\`
  };
}
`
      ),
      tests: [
        ex('works with every grouping of arguments', ({ env, expect }) => {
          const add3 = env.curry((a: number, b: number, c: number) => a + b + c);
          expect([add3(1)(2)(3), add3(1, 2)(3), add3(1)(2, 3), add3(1, 2, 3)]).toEqual([6, 6, 6, 6]);
        }),
        ex('partial applications are reusable', ({ env, expect }) => {
          const mul = env.curry((a: number, b: number) => a * b);
          const double = mul(2);
          expect([double(5), double(6), mul(3)(4)]).toEqual([10, 12, 12]);
        }),
        ex('extra arguments are passed through', ({ env, expect }) => {
          const f = env.curry(function (a: number, b: number) { return Array.prototype.slice.call(arguments); });
          expect(f(1)(2, 3, 4)).toEqual([1, 2, 3, 4]);
        }),
        ex('zero-arity functions run immediately', ({ env, expect }) => expect(env.curry(() => 'now')()).toBe('now')),
        ex('forwards this', ({ env, expect }) => {
          const o: any = { k: 100, add: env.curry(function (this: any, a: number, b: number) { return this.k + a + b; }) };
          expect(o.add(1)(2)).toBe(103);
        }),
        hid('different partial applications do not interfere', ({ env, expect }) => {
          const f = env.curry((a: string, b: string, c: string) => a + b + c);
          const ab = f('a')('b');
          const ax = f('a')('x');
          expect([ab('1'), ax('2'), ab('3')]).toEqual(['ab1', 'ax2', 'ab3']);
        }),
      ],
      hints: ['Return a function `curried(...args)`. If `args.length >= fn.length` call `fn`.', 'Otherwise return a new function that collects `more` arguments and calls `curried(...args, ...more)`.', 'Use `fn.apply(this, args)`, and make the returned continuation an *arrow* function so it keeps the `this` of the first call.'],
    }),

    lab({
      id: 'adv9-compose-pipe',
      title: 'compose, pipe and pipeAsync',
      kind: 'code',
      difficulty: 2,
      minutes: 15,
      tags: ['functional'],
      prompt: `Implement three combinators:

- \`pipe(...fns)\` — returns a function that passes its argument through \`fns\` **left to right**. The first function may take several arguments (pass them all to it); the rest take the previous result.
- \`compose(...fns)\` — the same but **right to left**.
- \`pipeAsync(...fns)\` — like \`pipe\` but each function may return a promise; the result is a promise. A rejection anywhere rejects the whole thing and stops the pipeline.

With no functions, \`pipe()\`/\`compose()\` return the (first) argument unchanged.`,
      expose: ['pipe', 'compose', 'pipeAsync'],
      files: jsFile(
        `function pipe(...fns) {
  
}

function compose(...fns) {
  
}

function pipeAsync(...fns) {
  
}
`,
        `function pipe(...fns) {
  return (...args) => {
    if (fns.length === 0) return args[0];
    const [first, ...rest] = fns;
    return rest.reduce((acc, f) => f(acc), first(...args));
  };
}

function compose(...fns) {
  return pipe(...[...fns].reverse());
}

function pipeAsync(...fns) {
  return async (...args) => {
    if (fns.length === 0) return args[0];
    const [first, ...rest] = fns;
    let acc = await first(...args);
    for (const f of rest) acc = await f(acc);
    return acc;
  };
}
`
      ),
      tests: [
        ex('pipe runs left to right', ({ env, expect }) => expect(env.pipe((x: number) => x + 1, (x: number) => x * 10)(2)).toBe(30)),
        ex('compose runs right to left', ({ env, expect }) => expect(env.compose((x: number) => x + 1, (x: number) => x * 10)(2)).toBe(21)),
        ex('the first function may take several arguments', ({ env, expect }) => expect(env.pipe((a: number, b: number) => a + b, (x: number) => x * 2)(3, 4)).toBe(14)),
        ex('empty pipelines return the argument', ({ env, expect }) => {
          expect(env.pipe()(5)).toBe(5);
          expect(env.compose()('x')).toBe('x');
        }),
        ex('does not mutate the list of functions it was given', ({ env, expect }) => {
          const fns = [(x: number) => x + 1, (x: number) => x * 2];
          env.compose(...fns);
          expect(fns.map((f) => f(5))).toEqual([6, 10]);
          const c = env.compose(...fns);
          expect([c(1), c(1)]).toEqual([3, 3]);
        }),
        ex('pipeAsync awaits promises between steps', async ({ env, expect }) => {
          const r = await env.pipeAsync(async (x: number) => x + 1, (x: number) => new Promise((res) => setTimeout(() => res(x * 2), 1)), (x: number) => x - 1)(4);
          expect(r).toBe(9);
        }),
        ex('pipeAsync rejects and stops at the first failure', async ({ env, expect }) => {
          let ran = false;
          const p = env.pipeAsync(async () => { throw new Error('stop'); }, () => { ran = true; })();
          const e = await p.catch((x: Error) => x);
          expect(e.message).toBe('stop');
          expect(ran).toBe(false);
        }),
      ],
      hints: ['`pipe`: destructure `[first, ...rest]`, call `first(...args)`, then `rest.reduce((acc, f) => f(acc), …)`.', '`compose` is `pipe` with the functions reversed (copy before reversing!).', '`pipeAsync`: an `async` function with a `for` loop that `await`s each step.'],
    }),

    lab({
      id: 'adv9-setin',
      title: 'setIn / updateIn with structural sharing',
      kind: 'code',
      difficulty: 4,
      minutes: 25,
      tags: ['functional', 'immutability'],
      interview: true,
      prompt: `Write immutable update helpers:

- \`setIn(obj, path, value)\` — return a **new** structure with the value at \`path\` (an array of keys) replaced. Never mutate \`obj\` or anything inside it.
- \`updateIn(obj, path, fn)\` — like \`setIn\` but the new value is \`fn(oldValue)\`.

**Structural sharing:** every object/array *not* on the path must be the **same reference** as in the input. Arrays stay arrays (copy with \`slice\`/spread). If part of the path is missing, create it: an **array** if the next key is a number, otherwise an **object**. An empty path returns the value itself (\`setIn(x, [], v)\` → \`v\`).

If the new value is identical (\`Object.is\`) to the old one, return the **original** \`obj\` unchanged (so equality checks stay cheap).`,
      expose: ['setIn', 'updateIn'],
      files: jsFile(
        `function setIn(obj, path, value) {
  
}

function updateIn(obj, path, fn) {
  
}
`,
        `function setIn(obj, path, value) {
  if (path.length === 0) return value;
  const [key, ...rest] = path;
  const current = obj === undefined || obj === null ? undefined : obj[key];
  const next = setIn(current === undefined && rest.length > 0 ? (typeof rest[0] === 'number' ? [] : {}) : current, rest, value);
  if (obj !== undefined && obj !== null && Object.is(obj[key], next)) return obj;
  if (Array.isArray(obj)) {
    const copy = obj.slice();
    copy[key] = next;
    return copy;
  }
  if (obj === undefined || obj === null) {
    const fresh = typeof key === 'number' ? [] : {};
    fresh[key] = next;
    return fresh;
  }
  return { ...obj, [key]: next };
}

function updateIn(obj, path, fn) {
  let old = obj;
  for (const k of path) old = old === undefined || old === null ? undefined : old[k];
  return setIn(obj, path, fn(old));
}
`
      ),
      tests: [
        ex('replaces a deep value without mutating', ({ env, expect }) => {
          const s = { a: { b: { c: 1 } }, x: 1 };
          const frozen = JSON.stringify(s);
          const n = env.setIn(s, ['a', 'b', 'c'], 2);
          expect(n).toEqual({ a: { b: { c: 2 } }, x: 1 });
          expect(JSON.stringify(s)).toBe(frozen);
        }),
        ex('structural sharing: untouched branches keep identity', ({ env, expect }) => {
          const s = { left: { v: 1 }, right: { v: 2, deep: { z: 0 } } };
          const n = env.setIn(s, ['left', 'v'], 9);
          expect(n.right === s.right).toBe(true);
          expect(n.left === s.left).toBe(false);
          expect(n === s).toBe(false);
        }),
        ex('arrays stay arrays; siblings are shared', ({ env, expect }) => {
          const s = { list: [{ id: 1 }, { id: 2 }, { id: 3 }] };
          const n = env.setIn(s, ['list', 1, 'id'], 20);
          expect(Array.isArray(n.list)).toBe(true);
          expect(n.list.map((x: any) => x.id)).toEqual([1, 20, 3]);
          expect(n.list[0] === s.list[0] && n.list[2] === s.list[2]).toBe(true);
        }),
        ex('creates missing containers (array for numeric keys, object otherwise)', ({ env, expect }) => {
          const n = env.setIn({}, ['a', 'b', 0, 'c'], 'x');
          expect(n).toEqual({ a: { b: [{ c: 'x' }] } });
          expect(Array.isArray(n.a.b)).toBe(true);
        }),
        ex('empty path returns the value', ({ env, expect }) => expect(env.setIn({ a: 1 }, [], 5)).toBe(5)),
        ex('same value → same object back', ({ env, expect }) => {
          const s = { a: { b: 1 } };
          expect(env.setIn(s, ['a', 'b'], 1)).toBe(s);
        }),
        ex('updateIn applies a function to the old value', ({ env, expect }) => {
          const s = { counters: { a: 1 } };
          const n = env.updateIn(s, ['counters', 'a'], (x: number) => x + 1);
          expect(n.counters.a).toBe(2);
          expect(s.counters.a).toBe(1);
        }),
        ex('updateIn passes undefined for missing paths', ({ env, expect }) => {
          const n = env.updateIn({}, ['hits'], (x: number | undefined) => (x ?? 0) + 1);
          expect(n).toEqual({ hits: 1 });
        }),
        hid('the input object is never frozen-mutated (works on frozen data)', ({ env, expect }) => {
          const s = Object.freeze({ a: Object.freeze({ b: Object.freeze([1, 2]) }) });
          const n = env.setIn(s, ['a', 'b', 0], 9);
          expect(n.a.b).toEqual([9, 2]);
        }),
      ],
      hints: ['Recursion: `const [key, ...rest] = path;` then `next = setIn(obj[key], rest, value)`, and copy only this level: `{ ...obj, [key]: next }` (or `slice()` for arrays).', 'Base case: `path.length === 0` returns `value`.', 'To create missing containers, look at `typeof rest[0] === "number"`.', 'Add the early-exit: if `Object.is(obj[key], next)` return `obj`.'],
      why: 'This is the core of Redux reducers, React state updates and the Immer library.',
    }),

    lab({
      id: 'adv9-trampoline',
      title: 'trampoline',
      kind: 'code',
      difficulty: 2,
      minutes: 10,
      tags: ['functional', 'recursion'],
      prompt: `Write \`trampoline(fn)\`: returns a function that calls \`fn(...args)\`; **while the result is a function** (a "thunk"), it calls that function; when the result is not a function it returns it.

This lets deeply recursive algorithms run in constant stack space. (A function that *should return a function* as its final answer can't be trampolined — that's the known limitation.)`,
      expose: ['trampoline'],
      files: jsFile(
        `function trampoline(fn) {
  
}
`,
        `function trampoline(fn) {
  return function (...args) {
    let result = fn.apply(this, args);
    while (typeof result === 'function') result = result();
    return result;
  };
}
`
      ),
      tests: [
        ex('returns plain results unchanged', ({ env, expect }) => expect(env.trampoline((a: number, b: number) => a + b)(2, 3)).toBe(5)),
        ex('runs a tail-recursive sum 200,000 levels deep without overflowing the stack', ({ env, expect }) => {
          const sum = env.trampoline(function go(n: number, acc = 0): any { return n === 0 ? acc : () => go(n - 1, acc + n); });
          expect(sum(200000)).toBe((200000 * 200001) / 2);
        }),
        ex('supports mutual recursion', ({ env, expect }) => {
          const isEven: any = env.trampoline((n: number): any => (n === 0 ? true : () => isOdd(n - 1)));
          const isOdd: any = (n: number): any => (n === 0 ? false : () => isEven.raw(n - 1));
          isEven.raw = (n: number): any => (n === 0 ? true : () => isOdd(n - 1));
          expect(isEven(100001)).toBe(false);
          expect(isEven(100000)).toBe(true);
        }),
        ex('forwards this', ({ env, expect }) => {
          const o: any = { k: 7, f: env.trampoline(function (this: any) { return this.k; }) };
          expect(o.f()).toBe(7);
        }),
        hid('the native recursive version really would overflow (so the trampoline matters)', ({ expect }) => {
          const naive = (n: number): number => (n === 0 ? 0 : n + naive(n - 1));
          expect(() => naive(1_000_000)).toThrow();
        }),
      ],
      hints: ['Call `fn(...args)` once, then loop: `while (typeof result === "function") result = result();`.', 'The recursive function must *return* a thunk (`() => go(n - 1, acc + n)`) instead of calling itself.'],
    }),
  ],
  references: [
    { title: 'Immer — immutable updates with mutable syntax', url: 'https://immerjs.github.io/immer/' },
    { title: 'MDN — Closures & higher-order functions', url: 'https://developer.mozilla.org/docs/Web/JavaScript/Closures' },
  ],
};
export default mod;
