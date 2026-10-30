import type { Module } from '../../core/types';
import { ex, hid, perf, lab, jsFile } from '../helpers';

const mod: Module = {
  id: 'iterators-generators',
  course: 'adv-js',
  title: 'Iterators, Generators & Lazy Evaluation',
  minutes: 45,
  objectives: [
    'Implement the iterator and iterable protocols by hand',
    'Write generators and use `yield*` to compose them',
    'Build lazy pipelines that process only what is needed and clean up after themselves',
    'Explain how `async/await` can be built from generators (the `co` pattern)',
  ],
  body: `
## The two protocols

An **iterator** is any object with a \`next()\` method returning \`{ value, done }\`. An **iterable** is any object with a \`[Symbol.iterator]()\` method returning an iterator. \`for…of\`, spread (\`[...x]\`), destructuring, \`Array.from\`, \`Map\`/\`Set\` constructors and \`Promise.all\` all consume iterables.

\`\`\`js run
const countdown = {
  from: 3,
  [Symbol.iterator]() {
    let n = this.from;
    return {
      next: () => (n > 0 ? { value: n--, done: false } : { value: undefined, done: true }),
      return() { console.log("cleanup!"); return { done: true }; },   // optional: called on early exit
    };
  },
};
console.log([...countdown]);
for (const x of countdown) { console.log(x); if (x === 2) break; }   // break → return() is called
\`\`\`

The optional **\`return()\`** method gives an iterator a chance to release resources (close a file, unlock) when the consumer stops early (\`break\`, \`return\`, an exception, destructuring fewer items).

## Generators: iterators you can write as functions

A \`function*\` returns a generator object (which is both an iterator and iterable). Execution **pauses** at every \`yield\` and resumes on the next \`next()\`. The local variables stay alive between pauses — a closure over a suspended stack frame.

\`\`\`js run
function* fib() {
  let [a, b] = [0, 1];
  while (true) {            // infinite sequence: fine, it's lazy
    yield a;
    [a, b] = [b, a + b];
  }
}
const first8 = [];
for (const n of fib()) {
  if (first8.length === 8) break;
  first8.push(n);
}
console.log(first8);
\`\`\`

Things generators can do:

- \`yield\` pauses and *sends a value out*; \`gen.next(x)\` sends a value *in* (it becomes the result of the \`yield\` expression).
- \`gen.throw(err)\` throws an exception *at the paused yield*, so a \`try/catch\` around it works.
- \`gen.return(v)\` finishes it (running \`finally\` blocks).
- \`yield* other\` **delegates** to another iterable — handy for recursion (tree traversal).

\`\`\`js run
function* walk(tree) {
  if (!tree) return;
  yield* walk(tree.left);
  yield tree.value;
  yield* walk(tree.right);
}
const tree = { value: 2, left: { value: 1 }, right: { value: 3 } };
console.log([...walk(tree)]);
\`\`\`

## Laziness

Arrays are **eager**: \`arr.map(f).filter(g).slice(0, 3)\` runs \`f\` and \`g\` on every element. A chain of generators is **lazy**: each stage pulls one item at a time, and stops as soon as the consumer does.

\`\`\`js run
function* map(it, f) { for (const x of it) yield f(x); }
function* filter(it, p) { for (const x of it) if (p(x)) yield x; }
function* take(it, n) { if (n <= 0) return; let i = 0; for (const x of it) { yield x; if (++i >= n) return; } }
function* naturals() { let n = 1; while (true) yield n++; }

const log = [];
const result = [...take(filter(map(naturals(), (x) => { log.push("map " + x); return x * x; }), (x) => x % 2 === 1), 3)];
console.log(result);          // [1, 9, 25]
console.log(log.length);      // only 5 numbers were ever mapped!
\`\`\`

\`take\` returning triggers \`return()\` on the upstream iterators, so every \`finally\` block in the chain runs. (ES2025 adds built-in iterator helpers: \`iterator.map().filter().take(3).toArray()\`.)

## Generators + promises = async/await

Before \`async/await\`, libraries like **co** let you write \`const user = yield fetchUser()\`: a runner function drives the generator, waits for each yielded promise, and feeds the result back with \`next(value)\` (or the error with \`throw(err)\`). \`async function\` is the same machine built into the language. Writing \`co\` yourself shows there is no magic.

\`\`\`js run
function run(genFn) {
  const gen = genFn();
  function step(method, arg) {
    const r = gen[method](arg);
    if (r.done) return Promise.resolve(r.value);
    return Promise.resolve(r.value).then((v) => step("next", v), (e) => step("throw", e));
  }
  return step("next");
}
const sleep = (ms, v) => new Promise((r) => setTimeout(r, ms, v));
const out = await run(function* () {
  const a = yield sleep(10, 20);
  const b = yield sleep(10, 22);
  return a + b;
});
console.log(out);
\`\`\`

:::tip
Async generators (\`async function*\`) combine both: \`for await (const chunk of stream)\` consumes an **async iterable**. Module 12 builds streaming pipelines with them.
:::

:::warn
Iterators are **single-use**: once exhausted, a generator stays done. Iterating the same generator object twice gives nothing the second time. An *iterable* that returns a fresh iterator from \`[Symbol.iterator]()\` can be looped many times.
:::
`,
  quiz: [
    { q: 'What does `gen.next(5)` do?', options: ['Runs 5 steps', 'Resumes the generator, and 5 becomes the value of the paused `yield` expression', 'Restarts the generator', 'Sets the max length'], answer: 1, why: 'Values can be sent *into* a generator through next(value).' },
    { q: 'When is an iterator\'s `return()` method called?', options: ['After every item', 'When the consumer stops early (break, return, throw)', 'Only on the last item', 'Never automatically'], answer: 1, why: 'It lets iterators clean up when iteration is abandoned.' },
    { q: 'What does `yield*` do?', options: ['Yields twice', 'Delegates to another iterable, yielding all of its values', 'Multiplies', 'Ends the generator'], answer: 1, why: '`yield* it` forwards each value of `it` (and its return value becomes the expression\'s value).' },
    { q: 'Why can `take(naturals(), 3)` finish when `naturals` is infinite?', options: ['Generators are asynchronous', 'Generators are lazy: values are produced only when requested', 'JS caps arrays at 3', 'It cannot finish'], answer: 1, why: 'Nothing runs until a consumer pulls, and the consumer stops after three.' },
  ],
  labs: [
    lab({
      id: 'adv7-range',
      title: 'range() generator',
      kind: 'code',
      difficulty: 2,
      minutes: 10,
      tags: ['generators'],
      prompt: `Write the generator \`range(start, end, step = 1)\`:

- yields \`start, start+step, …\` while the value is **less than** \`end\` (for a positive step) or **greater than** \`end\` (for a negative step);
- if \`end\` is \`undefined\` the sequence is **infinite** (positive step);
- a \`step\` of \`0\` throws a \`RangeError\` when iteration starts.`,
      expose: ['range'],
      files: jsFile(
        `function* range(start, end, step = 1) {
  
}
`,
        `function* range(start, end, step = 1) {
  if (step === 0) throw new RangeError('step must not be 0');
  if (end === undefined) end = step > 0 ? Infinity : -Infinity;
  if (step > 0) for (let i = start; i < end; i += step) yield i;
  else for (let i = start; i > end; i += step) yield i;
}
`
      ),
      tests: [
        ex('counts up', ({ env, expect }) => expect([...env.range(0, 5)]).toEqual([0, 1, 2, 3, 4])),
        ex('custom step', ({ env, expect }) => expect([...env.range(10, 25, 5)]).toEqual([10, 15, 20])),
        ex('counts down with a negative step', ({ env, expect }) => expect([...env.range(5, 0, -2)]).toEqual([5, 3, 1])),
        ex('empty when start is already past the end', ({ env, expect }) => {
          expect([...env.range(5, 5)]).toEqual([]);
          expect([...env.range(5, 0)]).toEqual([]);
        }),
        ex('infinite when end is omitted (take the first few)', ({ env, expect }) => {
          const out: number[] = [];
          for (const n of env.range(1)) { if (out.length === 4) break; out.push(n); }
          expect(out).toEqual([1, 2, 3, 4]);
        }),
        ex('step 0 throws a RangeError', ({ env, expect }) => expect(() => [...env.range(0, 5, 0)]).toThrow('step')),
        hid('is a real generator (lazy: nothing runs until pulled)', ({ env, expect }) => {
          const g = env.range(0, 1e9);
          expect(typeof g.next).toBe('function');
          expect(g.next()).toEqual({ value: 0, done: false });
        }),
      ],
      hints: ['Write a `function*` with a `for` loop that `yield`s `i`.', 'Pick the loop condition by the sign of `step`.', 'Use `Infinity` as the default end.'],
    }),

    lab({
      id: 'adv7-lazy',
      title: 'A lazy collection pipeline',
      kind: 'code',
      difficulty: 4,
      minutes: 25,
      tags: ['generators', 'iterators'],
      interview: true,
      prompt: `Implement \`class Lazy\` wrapping any iterable:

- \`Lazy.from(iterable)\`
- \`.map(fn)\`, \`.filter(fn)\`, \`.take(n)\`, \`.skip(n)\` — each returns a **new** \`Lazy\` and does **no work** until consumed. \`map\`/\`filter\` callbacks receive \`(value, index)\`.
- \`.toArray()\`, \`.first()\` (first element or \`undefined\`, pulling at most one item) and \`.reduce(fn, init)\`.
- A \`Lazy\` is itself iterable (\`for…of\` / spread work, and you can iterate it more than once if the source can).

**Laziness contract:** \`take(n)\` must pull *exactly* \`n\` items from upstream (never n+1), and must **close** the upstream iterator (so its \`finally\` blocks run).`,
      expose: ['Lazy'],
      files: jsFile(
        `class Lazy {
  constructor(iterable) {
    this.iterable = iterable;
  }

  static from(iterable) {
    return new Lazy(iterable);
  }

  [Symbol.iterator]() {
    return this.iterable[Symbol.iterator]();
  }

  map(fn) {}
  filter(fn) {}
  take(n) {}
  skip(n) {}
  toArray() {}
  first() {}
  reduce(fn, init) {}
}
`,
        `class Lazy {
  constructor(iterable) {
    this.iterable = iterable;
  }

  static from(iterable) {
    return new Lazy(iterable);
  }

  [Symbol.iterator]() {
    return this.iterable[Symbol.iterator]();
  }

  map(fn) {
    const src = this.iterable;
    return new Lazy({
      *[Symbol.iterator]() {
        let i = 0;
        for (const x of src) yield fn(x, i++);
      },
    });
  }

  filter(fn) {
    const src = this.iterable;
    return new Lazy({
      *[Symbol.iterator]() {
        let i = 0;
        for (const x of src) if (fn(x, i++)) yield x;
      },
    });
  }

  take(n) {
    const src = this.iterable;
    return new Lazy({
      *[Symbol.iterator]() {
        if (n <= 0) return;
        let i = 0;
        for (const x of src) {
          yield x;
          if (++i >= n) return;
        }
      },
    });
  }

  skip(n) {
    const src = this.iterable;
    return new Lazy({
      *[Symbol.iterator]() {
        let i = 0;
        for (const x of src) if (i++ >= n) yield x;
      },
    });
  }

  toArray() {
    return [...this];
  }

  first() {
    for (const x of this) return x;
    return undefined;
  }

  reduce(fn, init) {
    let acc = init;
    for (const x of this) acc = fn(acc, x);
    return acc;
  }
}
`
      ),
      tests: [
        ex('map / filter / toArray', ({ env, expect }) => {
          const r = env.Lazy.from([1, 2, 3, 4, 5]).map((x: number) => x * 2).filter((x: number) => x > 4).toArray();
          expect(r).toEqual([6, 8, 10]);
        }),
        ex('take and skip', ({ env, expect }) => {
          expect(env.Lazy.from([1, 2, 3, 4, 5]).skip(1).take(3).toArray()).toEqual([2, 3, 4]);
          expect(env.Lazy.from([1, 2]).take(0).toArray()).toEqual([]);
        }),
        ex('callbacks receive the index', ({ env, expect }) => {
          expect(env.Lazy.from(['a', 'b', 'c']).map((x: string, i: number) => x + i).toArray()).toEqual(['a0', 'b1', 'c2']);
          expect(env.Lazy.from(['a', 'b', 'c']).filter((_: string, i: number) => i !== 1).toArray()).toEqual(['a', 'c']);
        }),
        ex('is lazy: nothing runs until consumed', ({ env, expect }) => {
          let calls = 0;
          const pipeline = env.Lazy.from([1, 2, 3]).map((x: number) => (calls++, x));
          expect(calls).toBe(0);
          pipeline.toArray();
          expect(calls).toBe(3);
        }),
        ex('works on infinite sources', ({ env, expect }) => {
          function* naturals() { let n = 1; while (true) yield n++; }
          expect(env.Lazy.from(naturals()).filter((x: number) => x % 3 === 0).map((x: number) => x * x).take(4).toArray()).toEqual([9, 36, 81, 144]);
        }),
        ex('first() pulls at most one item', ({ env, expect }) => {
          let pulled = 0;
          function* src() { while (true) { pulled++; yield pulled; } }
          expect(env.Lazy.from(src()).first()).toBe(1);
          expect(pulled).toBe(1);
          expect(env.Lazy.from([]).first()).toBe(undefined);
        }),
        ex('reduce', ({ env, expect }) => expect(env.Lazy.from([1, 2, 3, 4]).reduce((a: number, b: number) => a + b, 0)).toBe(10)),
        ex('a Lazy over an array can be iterated more than once', ({ env, expect }) => {
          const l = env.Lazy.from([1, 2, 3]).map((x: number) => x + 1);
          expect([...l]).toEqual([2, 3, 4]);
          expect([...l]).toEqual([2, 3, 4]);
        }),
        hid('take(n) pulls exactly n items upstream and closes the source', ({ env, expect }) => {
          let pulled = 0;
          let closed = false;
          function* src() { try { while (true) { pulled++; yield pulled; } } finally { closed = true; } }
          const out = env.Lazy.from(src()).map((x: number) => x * 10).take(3).toArray();
          expect(out).toEqual([10, 20, 30]);
          expect(pulled).toBe(3);
          expect(closed).toBe(true);
        }),
      ],
      hints: [
        'Each operator returns `new Lazy({ *[Symbol.iterator]() { … } })` — an iterable object whose iterator is a generator over the *previous* iterable.',
        '`take(n)`: `yield x` first, **then** check the count and `return` — so you never pull element n+1. Returning from inside `for…of` closes the upstream iterator automatically.',
        '`first()` can be `for (const x of this) return x;`.',
      ],
      why: 'This is the idea behind iterator helpers, RxJS operators, Java streams and Python itertools.',
    }),

    lab({
      id: 'adv7-co',
      title: 'co: async/await from generators',
      kind: 'code',
      difficulty: 4,
      minutes: 20,
      tags: ['generators', 'promises'],
      prompt: `Write \`co(generatorFunction, ...args)\` that runs a generator whose \`yield\`s are promises, like \`async/await\`:

- returns a promise for the generator's **return value**;
- each yielded value is passed through \`Promise.resolve\`; when it fulfils, resume the generator with that value (\`next(value)\`);
- when it **rejects**, throw the error *into* the generator (\`gen.throw(err)\`) so the generator's own \`try/catch\` can handle it;
- if the generator throws (or doesn't catch a thrown rejection), the returned promise rejects.`,
      expose: ['co'],
      files: jsFile(
        `function co(genFn, ...args) {
  
}
`,
        `function co(genFn, ...args) {
  return new Promise((resolve, reject) => {
    const gen = genFn(...args);
    function step(method, arg) {
      let r;
      try {
        r = gen[method](arg);
      } catch (e) {
        return reject(e);
      }
      if (r.done) return resolve(r.value);
      Promise.resolve(r.value).then(
        (v) => step('next', v),
        (e) => step('throw', e)
      );
    }
    step('next');
  });
}
`
      ),
      tests: [
        ex('resumes with resolved values and returns the final value', async ({ env, expect }) => {
          const v = await env.co(function* (a: number) {
            const x: number = yield Promise.resolve(a + 1);
            const y: number = yield new Promise((r) => setTimeout(() => r(x * 2), 2));
            return x + y;
          }, 4);
          expect(v).toBe(5 + 10);
        }),
        ex('plain (non-promise) yields work too', async ({ env, expect }) => {
          expect(await env.co(function* () { const a: number = yield 1; const b: number = yield 2; return a + b; })).toBe(3);
        }),
        ex('rejections are thrown into the generator', async ({ env, expect }) => {
          const v = await env.co(function* () {
            try {
              yield Promise.reject(new Error('nope'));
              return 'unreachable';
            } catch (e: any) {
              return 'caught ' + e.message;
            }
          });
          expect(v).toBe('caught nope');
        }),
        ex('an uncaught rejection rejects the returned promise', async ({ env, expect }) => {
          const e = await env.co(function* () { yield Promise.reject(new Error('fatal')); }).catch((x: Error) => x);
          expect(e.message).toBe('fatal');
        }),
        ex('a synchronous throw inside the generator rejects', async ({ env, expect }) => {
          const e = await env.co(function* () { yield 1; throw new Error('inside'); }).catch((x: Error) => x);
          expect(e.message).toBe('inside');
        }),
        ex('supports yielding Promise.all for parallelism', async ({ env, expect }) => {
          const v = await env.co(function* () {
            const [a, b]: number[] = yield Promise.all([Promise.resolve(1), Promise.resolve(2)]);
            return a + b;
          });
          expect(v).toBe(3);
        }),
        hid('does not recurse deeply on long synchronous-looking chains', async ({ env, expect }) => {
          const v = await env.co(function* () { let s = 0; for (let i = 0; i < 3000; i++) s += (yield i) as number; return s; });
          expect(v).toBe((2999 * 3000) / 2);
        }),
      ],
      hints: ['Create the generator object, then write a `step(method, arg)` function that calls `gen.next(arg)` or `gen.throw(arg)`.', 'If `result.done`, resolve with `result.value`; else `Promise.resolve(result.value).then(v => step("next", v), e => step("throw", e))`.', 'Wrap the `gen[method](arg)` call in try/catch: an exception from the generator means reject.'],
      why: 'This ~15-line function is what async/await is. The language feature just makes it syntax.',
    }),

    lab({
      id: 'adv7-bst',
      title: 'A BST you can iterate',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['generators', 'trees'],
      prompt: `Implement \`class BST\` (a binary search tree of numbers):

- \`insert(v)\` → \`true\` if inserted, \`false\` if the value was already present; \`has(v)\`; \`size\` (property).
- \`[Symbol.iterator]\` yields all values **in ascending order**.
- \`range(lo, hi)\` is a generator yielding the values with \`lo <= v <= hi\` in ascending order. It must **prune**: don't visit subtrees that cannot contain matches. (A range query returning k values in a balanced tree should take about O(log n + k) steps, not O(n).)`,
      expose: ['BST'],
      files: jsFile(
        `class BST {
  constructor() {
    this.root = null;
    this.size = 0;
  }

  insert(v) {}

  has(v) {}

  *[Symbol.iterator]() {}

  *range(lo, hi) {}
}
`,
        `class BST {
  constructor() {
    this.root = null;
    this.size = 0;
  }

  insert(v) {
    const node = { v, l: null, r: null };
    if (!this.root) {
      this.root = node;
      this.size++;
      return true;
    }
    let cur = this.root;
    for (;;) {
      if (v === cur.v) return false;
      const side = v < cur.v ? 'l' : 'r';
      if (!cur[side]) {
        cur[side] = node;
        this.size++;
        return true;
      }
      cur = cur[side];
    }
  }

  has(v) {
    let cur = this.root;
    while (cur) {
      if (v === cur.v) return true;
      cur = v < cur.v ? cur.l : cur.r;
    }
    return false;
  }

  *[Symbol.iterator]() {
    yield* this.range(-Infinity, Infinity);
  }

  *range(lo, hi) {
    function* walk(n) {
      if (!n) return;
      if (lo < n.v) yield* walk(n.l);
      if (n.v >= lo && n.v <= hi) yield n.v;
      if (hi > n.v) yield* walk(n.r);
    }
    yield* walk(this.root);
  }
}
`
      ),
      tests: [
        ex('insert / has / size', ({ env, expect }) => {
          const t = new env.BST();
          expect([t.insert(5), t.insert(3), t.insert(8), t.insert(3)]).toEqual([true, true, true, false]);
          expect([t.has(3), t.has(4)]).toEqual([true, false]);
          expect(t.size).toBe(3);
        }),
        ex('iterates in ascending order', ({ env, expect }) => {
          const t = new env.BST();
          [50, 20, 70, 10, 30, 60, 80, 25].forEach((v) => t.insert(v));
          expect([...t]).toEqual([10, 20, 25, 30, 50, 60, 70, 80]);
        }),
        ex('range returns matching values in order (inclusive)', ({ env, expect }) => {
          const t = new env.BST();
          [50, 20, 70, 10, 30, 60, 80, 25].forEach((v) => t.insert(v));
          expect([...t.range(20, 60)]).toEqual([20, 25, 30, 50, 60]);
          expect([...t.range(61, 69)]).toEqual([]);
        }),
        ex('empty tree', ({ env, expect }) => {
          const t = new env.BST();
          expect([...t]).toEqual([]);
          expect(t.has(1)).toBe(false);
        }),
        prop_sorted(),
        perf('range() prunes: a narrow range is far cheaper than a full scan', async ({ env, expect, measure, rng }) => {
          const t = new env.BST();
          const r = rng(7);
          const vals = r.shuffle(Array.from({ length: 3000 }, (_, i) => i));
          vals.forEach((v) => t.insert(v));
          const full = await measure(() => [...t]);
          const narrow = await measure(() => [...t.range(1000, 1010)]);
          expect(narrow.value).toEqual([1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010]);
          expect(narrow.steps).toBeLessThan(full.steps / 8);
        }),
      ],
      hints: ['An in-order traversal is `walk(left); visit(node); walk(right)` — use `yield*` for the recursive calls.', 'Pruning: only descend left if `lo < node.v`; only descend right if `hi > node.v`.', 'The default iterator can delegate: `yield* this.range(-Infinity, Infinity)`.'],
    }),
  ],
  references: [
    { title: 'MDN — Iteration protocols', url: 'https://developer.mozilla.org/docs/Web/JavaScript/Reference/Iteration_protocols' },
    { title: 'tj/co (the original generator-based coroutine runner)', url: 'https://github.com/tj/co' },
  ],
};

import type { TestSpec } from '../../core/types';
function prop_sorted(): TestSpec {
  return {
    name: 'property: iteration equals the sorted unique inputs',
    kind: 'property',
    run: async ({ env, forAll, gen, expect }) => {
      await forAll([gen.array(gen.int(-30, 30), 0, 40)], (xs: number[]) => {
        const t = new env.BST();
        xs.forEach((v) => t.insert(v));
        const want = [...new Set(xs)].sort((a, b) => a - b);
        expect([...t]).toEqual(want);
        expect(t.size).toBe(want.length);
      });
    },
  };
}
export default mod;
