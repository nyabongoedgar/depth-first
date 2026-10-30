import type { Module } from '../../core/types';
import { ex, hid, lab, jsFile } from '../helpers';

const mod: Module = {
  id: 'this-binding',
  course: 'adv-js',
  title: '`this`, call/apply/bind & Function Internals',
  minutes: 35,
  objectives: [
    'Apply the four binding rules (default, implicit, explicit, new) and the arrow-function exception',
    'Diagnose the "lost `this`" bug when passing methods as callbacks',
    'Re-implement `call`, `apply` and `bind` (including partial application and `new`)',
  ],
  body: `
## \`this\` is decided at call time

Unlike variables, \`this\` is **not** lexical (except in arrow functions). It is determined by *how a function is called*. Check these in order:

| Rule | Call looks like | \`this\` is |
|---|---|---|
| 1. **\`new\`** | \`new F()\` | the new object |
| 2. **Explicit** | \`f.call(obj)\`, \`f.apply(obj)\`, \`f.bind(obj)()\` | \`obj\` |
| 3. **Implicit** | \`obj.method()\` | \`obj\` (the thing left of the dot) |
| 4. **Default** | \`f()\` | \`undefined\` in strict mode / modules, else the global object |

**Arrow functions have no \`this\` of their own** — they use the \`this\` of the surrounding scope (lexically), and \`call/bind\` cannot change it.

\`\`\`js run
const user = {
  name: "Ada",
  hello() { return "Hi " + this.name; },
  later() { return () => this.name; },        // arrow: inherits hello's this
};
console.log(user.hello());
const loose = user.hello;                      // detach the method…
console.log(loose.call({ name: "Bob" }));      // explicit
try { console.log(loose()); } catch (e) { console.log("lost this:", e.constructor.name); }
console.log(user.later()());
\`\`\`

(The examples run in strict-ish mode here, so a lost \`this\` shows up as a \`TypeError\`; in sloppy-mode browsers it would silently read \`window.name\` — worse!)

## The "lost this" bug

The dot is what sets \`this\`. Anything that takes the method *off* the object loses it:

\`\`\`js run
class Timer {
  constructor() { this.ticks = 0; }
  tick() { this.ticks++; return this.ticks; }
}
const t = new Timer();
const fns = [t.tick, t.tick.bind(t), () => t.tick()];
for (const f of fns) {
  try { console.log(f()); } catch (e) { console.log("error:", e.message); }
}
\`\`\`

Three fixes: \`.bind\`, a wrapping arrow, or a class field arrow (\`tick = () => {...}\`, which creates a per-instance function).

## call, apply, bind

\`\`\`js run
function intro(greeting, punctuation) {
  return greeting + ", I'm " + this.name + punctuation;
}
const me = { name: "Ada" };
console.log(intro.call(me, "Hello", "!"));        // arguments listed
console.log(intro.apply(me, ["Hi", "?"]));        // arguments in an array
const bound = intro.bind(me, "Hey");              // partial application!
console.log(bound("."));                          // remaining args supplied later
console.log(bound.name, bound.length);            // "bound intro", 1
\`\`\`

\`bind\` returns a **new function** with \`this\` (and optionally leading arguments) fixed. A bound function ignores later \`call/apply\` attempts to change \`this\` — but \`new boundFn()\` still works and ignores the bound \`this\`.

## How would you implement \`call\`?

The trick: make the function a **method** of \`thisArg\`, so rule 3 (implicit binding) applies. Use a temporary **Symbol** key so you never overwrite a real property:

\`\`\`js
Function.prototype.myCall = function (thisArg, ...args) {
  const key = Symbol();
  thisArg[key] = this;
  const result = thisArg[key](...args);
  delete thisArg[key];
  return result;
};
\`\`\`

(Real engines don't do this — they set \`this\` directly — but it's a fine model. You'll also need to handle \`null\`/primitive \`thisArg\`.)

:::interview
"Implement \`bind\`." Expected points: returns a function; partial application; \`new\` on the bound function; preserves \`name\`/\`length\` (bonus). It tests your understanding of \`this\`, closures *and* prototypes at once.
:::
`,
  quiz: [
    { q: 'In `obj.method()`, what is `this` inside `method`?', options: ['The global object', 'obj', 'undefined', 'method'], answer: 1, why: 'Implicit binding: the object to the left of the dot.' },
    { q: 'Why does `setTimeout(obj.method, 0)` often break `this`?', options: ['setTimeout is async', 'The function is passed without its object, so it is called as a plain function', 'obj is frozen', 'method is hoisted'], answer: 1, why: 'The detached reference is called with default binding.' },
    { q: 'Which can NOT change an arrow function\'s `this`?', options: ['Wrapping it in another arrow', '`.call()` / `.bind()`', 'Defining it inside a method', 'Defining it inside a class constructor'], answer: 1, why: 'Arrow functions capture `this` lexically; call/apply/bind cannot override it.' },
    { q: 'What does `fn.bind(obj, 1)(2)` do?', options: ['Calls fn with this=obj and arguments (1, 2)', 'Calls fn with arguments (2, 1)', 'Throws', 'Calls fn with this=undefined'], answer: 0, why: 'Bound leading arguments come first, then the arguments supplied at the call.' },
  ],
  labs: [
    lab({
      id: 'adv3-call-apply',
      title: 'Implement call and apply',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['this'],
      prompt: `Write \`myCall(fn, thisArg, ...args)\` and \`myApply(fn, thisArg, argsArray)\` as plain functions (not on the prototype). They must behave like \`fn.call(thisArg, ...args)\` and \`fn.apply(thisArg, argsArray)\`:

- the function runs with \`this === thisArg\` and returns its result;
- a primitive \`thisArg\` is boxed like sloppy-mode \`call\` (use \`Object(thisArg)\`); \`null\`/\`undefined\` → \`globalThis\`;
- the temporary property you use must be **invisible afterwards** (use a \`Symbol\`, and \`delete\` it);
- \`myApply(fn, thisArg, undefined)\` works (no arguments).

You may **not** use \`.call\`, \`.apply\` or \`.bind\`.`,
      expose: ['myCall', 'myApply'],
      files: jsFile(
        `function myCall(fn, thisArg, ...args) {
  
}

function myApply(fn, thisArg, argsArray) {
  
}
`,
        `function myCall(fn, thisArg, ...args) {
  const ctx = thisArg === null || thisArg === undefined ? globalThis : Object(thisArg);
  const key = Symbol('fn');
  ctx[key] = fn;
  try {
    return ctx[key](...args);
  } finally {
    delete ctx[key];
  }
}

function myApply(fn, thisArg, argsArray) {
  return myCall(fn, thisArg, ...(argsArray || []));
}
`
      ),
      tests: [
        ex('myCall sets this and passes arguments', ({ env, expect }) => {
          function f(this: any, a: number, b: number) { return this.k + a + b; }
          expect(env.myCall(f, { k: 10 }, 1, 2)).toBe(13);
        }),
        ex('myApply passes an argument array', ({ env, expect }) => {
          function f(this: any, a: number, b: number) { return this.k * a * b; }
          expect(env.myApply(f, { k: 2 }, [3, 4])).toBe(24);
        }),
        ex('myApply with no arguments array', ({ env, expect }) => {
          function f(this: any) { return this.k; }
          expect(env.myApply(f, { k: 5 })).toBe(5);
        }),
        ex('leaves no trace on thisArg', ({ env, expect }) => {
          const o: any = { a: 1 };
          function f(this: any) { return Object.getOwnPropertySymbols(this).length + Object.keys(this).length; }
          expect(env.myCall(f, o)).toBe(1 + 1); // the temp symbol + "a"
          expect(Object.getOwnPropertySymbols(o).length).toBe(0);
          expect(Object.keys(o)).toEqual(['a']);
        }),
        ex('cleans up even if fn throws', ({ env, expect }) => {
          const o = {};
          expect(() => env.myCall(function () { throw new Error('boom'); }, o)).toThrow('boom');
          expect(Object.getOwnPropertySymbols(o).length).toBe(0);
        }),
        ex('primitive thisArg is boxed, null → global', ({ env, expect }) => {
          function f(this: any) { return this; }
          expect(typeof env.myCall(f, 5)).toBe('object');
          expect(env.myCall(f, null)).toBe(globalThis);
        }),
        hid('does not use native call/apply/bind', ({ code, expect }) => expect(/\.\s*(call|apply|bind)\s*\(/.test(code)).toBe(false), 'structural'),
      ],
      hints: ['Make the function a temporary *method* of the context object, then call it with the dot: implicit binding.', 'Use a `Symbol()` as the key so it cannot collide with real properties; `delete` it in a `finally` block.', '`myApply` can simply spread the array into `myCall`.'],
    }),

    lab({
      id: 'adv3-bind',
      title: 'Implement bind',
      kind: 'code',
      difficulty: 4,
      minutes: 20,
      tags: ['this', 'prototypes'],
      prompt: `Write \`myBind(fn, thisArg, ...preset)\` returning a bound function:

- calling it runs \`fn\` with \`this = thisArg\` and \`preset\` arguments first, then the call's arguments;
- calling it with \`new\` must **ignore** \`thisArg\`, still pass \`preset\` + new args, and the created object must inherit from \`fn.prototype\`;
- the bound function's \`name\` should be \`"bound " + fn.name\`.

You may use \`.apply\`/\`Reflect.apply\` but not \`.bind\`.`,
      expose: ['myBind'],
      files: jsFile(
        `function myBind(fn, thisArg, ...preset) {
  
}
`,
        `function myBind(fn, thisArg, ...preset) {
  function bound(...args) {
    const all = [...preset, ...args];
    if (new.target) return Reflect.construct(fn, all, new.target === bound ? fn : new.target);
    return fn.apply(thisArg, all);
  }
  Object.defineProperty(bound, 'name', { value: 'bound ' + fn.name, configurable: true });
  return bound;
}
`
      ),
      tests: [
        ex('binds this', ({ env, expect }) => {
          function f(this: any) { return this.n; }
          expect(env.myBind(f, { n: 7 })()).toBe(7);
        }),
        ex('partial application: preset args come first', ({ env, expect }) => {
          function f(this: any, a: number, b: number, c: number) { return [a, b, c]; }
          expect(env.myBind(f, null, 1, 2)(3)).toEqual([1, 2, 3]);
        }),
        ex('later call/apply cannot change this', ({ env, expect }) => {
          function f(this: any) { return this.n; }
          const b = env.myBind(f, { n: 1 });
          expect(b.call({ n: 2 })).toBe(1);
        }),
        ex('name is "bound fn"', ({ env, expect }) => {
          function original() {}
          expect(env.myBind(original, null).name).toBe('bound original');
        }),
        ex('works with new: this is ignored, prototype preserved', ({ env, expect }) => {
          function Point(this: any, x: number, y: number) { this.x = x; this.y = y; }
          Point.prototype.sum = function () { return this.x + this.y; };
          const BoundPoint = env.myBind(Point, { ignored: true }, 1);
          const p = new BoundPoint(2);
          expect([p.x, p.y, p.sum()]).toEqual([1, 2, 3]);
          expect(p instanceof Point).toBe(true);
          expect((p as any).ignored).toBe(undefined);
        }),
        hid('does not use native bind', ({ code, expect }) => expect(/\.\s*bind\s*\(/.test(code)).toBe(false), 'structural'),
      ],
      hints: ['Return a function that concatenates `preset` and the new arguments, then calls `fn.apply(thisArg, all)`.', 'Detect a `new` call inside a regular function with `new.target`.', 'For `new`, use `Reflect.construct(fn, all, newTarget)` — mind the case where `new.target` is the bound function itself.'],
    }),

    lab({
      id: 'adv3-this-predict',
      title: 'Predict: which `this`?',
      kind: 'predict',
      difficulty: 3,
      minutes: 8,
      tags: ['this', 'predict'],
      prompt: 'Predict each line. (`undefined` is printed as the text `undefined`; a thrown error is caught and printed as `error`.)',
      snippet: `"use strict";
const obj = {
  name: "obj",
  regular() { return this && this.name; },
  arrow: () => (typeof this),
  nested() {
    const inner = () => this.name;
    function plain() { return this === undefined ? "undefined" : this.name; }
    return [inner(), plain()].join(",");
  },
};
console.log(obj.regular());
const detached = obj.regular;
console.log(detached());
console.log(detached.call({ name: "other" }));
console.log(obj.nested());
console.log(obj.arrow());
const bound = obj.regular.bind({ name: "bound" });
console.log(bound.call({ name: "ignored" }));
try { console.log(new bound().name); } catch (e) { console.log("error"); }`,
      explanation: '`detached()` has no `this` in strict mode, so `this && this.name` is `undefined`. In `nested`, the arrow inherits `this` from `nested` (obj) while `plain` gets `undefined`. The top-level arrow has the script/module `this`, which is `undefined` in the harness (`typeof` → "undefined"). A bound function ignores `call`, so `bound.call(...)` still sees `{ name: "bound" }`. Finally, `regular` is a **method** (shorthand syntax), and methods are not constructors — so `new bound()` throws a TypeError, which the `catch` turns into the line `error`.',
      hints: ['Strict mode: a plain call has `this === undefined`, not the global object.', 'Arrow functions never get their own `this`.'],
    }),
  ],
  references: [{ title: 'MDN — this', url: 'https://developer.mozilla.org/docs/Web/JavaScript/Reference/Operators/this' }],
};
export default mod;
