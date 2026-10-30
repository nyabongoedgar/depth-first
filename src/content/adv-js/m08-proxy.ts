import type { Module } from '../../core/types';
import { ex, hid, lab, jsFile } from '../helpers';

const mod: Module = {
  id: 'proxy-reflect',
  course: 'adv-js',
  title: 'Metaprogramming: Proxy, Reflect & Symbols',
  minutes: 45,
  objectives: [
    'Intercept property access, assignment, deletion and calls with `Proxy` traps',
    'Use `Reflect` to forward operations correctly (receivers, return values)',
    'Build a reactive state store, a validator, a default-dictionary and a read-only view',
    'Know the limits: invariants, internal slots (`Map`, `Set`) and performance',
  ],
  body: `
## Proxy: a programmable object

\`new Proxy(target, handler)\` creates an object that behaves like \`target\` unless the **handler** defines a **trap** for an operation. Operations you can intercept include:

| Trap | Triggered by |
|---|---|
| \`get(t, key, receiver)\` | \`p.x\`, \`p[x]\` |
| \`set(t, key, value, receiver)\` | \`p.x = v\` (**must return true** or strict mode throws) |
| \`has(t, key)\` | \`key in p\` |
| \`deleteProperty(t, key)\` | \`delete p.x\` |
| \`ownKeys(t)\` | \`Object.keys(p)\`, \`for…in\`, \`JSON.stringify\` |
| \`apply(t, thisArg, args)\` | \`p(...)\` when target is a function |
| \`construct(t, args)\` | \`new p(...)\` |
| \`getOwnPropertyDescriptor\`, \`defineProperty\`, \`getPrototypeOf\`… | the matching \`Object\`/\`Reflect\` methods |

\`\`\`js run
const log = [];
const user = new Proxy({ name: "Ada", age: 36 }, {
  get(target, key, receiver) {
    log.push("get " + String(key));
    return Reflect.get(target, key, receiver);     // forward the default behaviour
  },
  set(target, key, value, receiver) {
    log.push("set " + String(key) + "=" + value);
    return Reflect.set(target, key, value, receiver);
  },
});
user.age = 37;
console.log(user.name, user.age);
console.log(log);
\`\`\`

## Reflect: the "default behaviour" toolkit

\`Reflect\` has one function per trap (\`Reflect.get\`, \`Reflect.set\`, \`Reflect.has\`, \`Reflect.ownKeys\`, \`Reflect.apply\`, \`Reflect.construct\`…) with the exact default semantics. Inside traps, **forward with Reflect** instead of re-implementing — and pass the **receiver** so getters and inherited setters see the right \`this\`. Unlike the \`Object.*\` versions, \`Reflect\` methods return booleans (\`Reflect.set\`, \`defineProperty\`, \`deleteProperty\`) instead of throwing, which is what traps need.

## What people build with Proxies

- **Reactivity** — Vue 3's \`reactive()\` is a Proxy that records which effects read each property (\`get\`) and re-runs them on \`set\`.
- **Validation / schemas**, **default values**, **negative array indices**, **ORMs** (\`user.posts\` lazily loads), **API clients** (\`api.users.get(1)\` building URLs from property chains), **mocks and spies** in tests, **access logging**, **immutable views**.

\`\`\`js run
// An API client built from property chains
const api = (path = []) => new Proxy(() => {}, {
  get: (_, key) => api([...path, String(key)]),
  apply: (_, __, args) => "/" + path.join("/") + "(" + args.join(",") + ")",
});
console.log(api().users.get(42));          // "/users/get(42)"
console.log(api().orders.byUser(7).items); // property after call is still chained
\`\`\`

## Symbols: hooks into the language

Well-known Symbols let your objects take part in language features: \`Symbol.iterator\` (iteration), \`Symbol.asyncIterator\`, \`Symbol.toPrimitive\` (conversion), \`Symbol.hasInstance\` (\`instanceof\`), \`Symbol.toStringTag\`, \`Symbol.species\`. Symbols are also collision-free property keys.

\`\`\`js run
const money = {
  amount: 12.5,
  [Symbol.toPrimitive](hint) { return hint === "string" ? "$" + this.amount.toFixed(2) : this.amount; },
};
console.log(\`\${money}\`, money + 1, money * 2);
\`\`\`

## Rules and limits

:::warn
**Invariants.** A Proxy cannot lie about a *non-configurable, non-writable* property: if the target has one, \`get\` must return its real value, or the engine throws a \`TypeError\`. (This is why proxying a frozen object and returning wrapped children fails.)
:::

:::warn
**Internal slots.** \`Map\`, \`Set\`, \`Date\`, \`Promise\`, typed arrays… keep data in internal slots that a Proxy doesn't have. \`new Proxy(new Map(), {}).get(1)\` throws "incompatible receiver". Solutions: bind methods to the target (\`value.bind(target)\`) or special-case collections (Vue does).
:::

- **Identity:** \`proxy !== target\`. Cache proxies in a \`WeakMap\` so \`proxy.child === proxy.child\`.
- **Performance:** every access through a proxy goes through a function call and is slower and harder to optimise. Don't proxy hot inner loops.
- **Debugging:** devtools show the proxy and handler; use \`console.log({...proxy})\` for a plain snapshot.
`,
  quiz: [
    { q: 'A `set` trap must return…', options: ['The new value', 'undefined', 'true if the assignment succeeded', 'The old value'], answer: 2, why: 'Returning a falsy value makes the assignment fail (a TypeError in strict mode).' },
    { q: 'Why forward operations with `Reflect.get(target, key, receiver)`?', options: ['It is faster', 'It performs the default behaviour with the correct `this` (receiver) for getters', 'Proxies require it', 'It makes a copy'], answer: 1, why: 'Reflect mirrors the engine\'s default internal methods, including receiver handling.' },
    { q: 'What goes wrong with `new Proxy(new Map(), {}).get("a")`?', options: ['Nothing', 'TypeError: incompatible receiver — Map methods need the real Map\'s internal slots', 'It returns a Proxy', 'It deletes the Map'], answer: 1, why: 'Built-ins with internal slots can\'t be driven through a Proxy as `this`.' },
    { q: 'Vue 3\'s reactivity works by…', options: ['Polling the object', 'Wrapping state in a Proxy that tracks reads and triggers effects on writes', 'Using Object.observe', 'Compiling templates to getters only'], answer: 1, why: 'get traps record dependencies; set traps trigger updates.' },
  ],
  labs: [
    lab({
      id: 'adv8-reactive',
      title: 'A deep reactive store',
      kind: 'code',
      difficulty: 4,
      minutes: 25,
      tags: ['proxy'],
      interview: true,
      prompt: `Write \`reactive(target, onChange)\` returning a **deep** Proxy that reports mutations:

- Whenever a property is **set to a different value** (or newly added) call \`onChange(path, newValue, oldValue)\` where \`path\` is an array of keys from the root, e.g. \`['user', 'address', 'city']\` (keys as strings).
- \`delete\` of an existing property calls \`onChange(path, undefined, oldValue)\`.
- Setting a property to the **same value** (\`Object.is\`) must not notify.
- Nested objects/arrays are wrapped **lazily on access**; the same nested object must always give the **same proxy** (\`state.user === state.user\`).
- Reads must behave normally (\`Object.keys\`, array methods like \`push\`/\`map\` work). Forward operations with \`Reflect\`.`,
      expose: ['reactive'],
      files: jsFile(
        `function reactive(target, onChange) {
  
}
`,
        `function reactive(target, onChange) {
  const cache = new WeakMap();

  function wrap(obj, path) {
    if (obj === null || typeof obj !== 'object') return obj;
    const hit = cache.get(obj);
    if (hit) return hit;
    const proxy = new Proxy(obj, {
      get(t, key, receiver) {
        const value = Reflect.get(t, key, receiver);
        return typeof key === 'symbol' ? value : wrap(value, [...path, String(key)]);
      },
      set(t, key, value, receiver) {
        const had = Object.prototype.hasOwnProperty.call(t, key);
        const old = t[key];
        const ok = Reflect.set(t, key, value, receiver);
        if (ok && (!had || !Object.is(old, value))) onChange([...path, String(key)], value, old);
        return ok;
      },
      deleteProperty(t, key) {
        const had = Object.prototype.hasOwnProperty.call(t, key);
        const old = t[key];
        const ok = Reflect.deleteProperty(t, key);
        if (ok && had) onChange([...path, String(key)], undefined, old);
        return ok;
      },
    });
    cache.set(obj, proxy);
    return proxy;
  }
  return wrap(target, []);
}
`
      ),
      tests: [
        ex('reports top-level sets with path, new and old value', ({ env, expect }) => {
          const calls: any[] = [];
          const s = env.reactive({ count: 1 }, (...a: any[]) => calls.push(a));
          s.count = 2;
          expect(calls).toEqual([[['count'], 2, 1]]);
        }),
        ex('reports nested paths', ({ env, expect }) => {
          const calls: any[] = [];
          const s = env.reactive({ user: { address: { city: 'Paris' } } }, (p: string[], v: any) => calls.push(p.join('.') + '=' + v));
          s.user.address.city = 'Rome';
          expect(calls).toEqual(['user.address.city=Rome']);
        }),
        ex('does not notify when the value is unchanged', ({ env, expect }) => {
          const calls: any[] = [];
          const s = env.reactive({ a: 1 }, (...a: any[]) => calls.push(a));
          s.a = 1;
          expect(calls).toEqual([]);
        }),
        ex('new properties notify with oldValue undefined', ({ env, expect }) => {
          const calls: any[] = [];
          const s: any = env.reactive({}, (p: string[], v: any, old: any) => calls.push([p.join('.'), v, old]));
          s.fresh = 'x';
          expect(calls).toEqual([['fresh', 'x', undefined]]);
        }),
        ex('delete notifies once for existing keys only', ({ env, expect }) => {
          const calls: any[] = [];
          const s: any = env.reactive({ a: 1 }, (p: string[], v: any, old: any) => calls.push([p.join('.'), v, old]));
          delete s.a;
          delete s.missing;
          expect(calls).toEqual([['a', undefined, 1]]);
        }),
        ex('array mutation through push is observed and works', ({ env, expect }) => {
          const calls: string[] = [];
          const s = env.reactive({ items: [1] }, (p: string[]) => calls.push(p.join('.')));
          s.items.push(2);
          expect(calls[0]).toBe('items.1');
          expect([...s.items]).toEqual([1, 2]);
          expect(s.items.length).toBe(2);
          expect(Array.isArray(s.items)).toBe(true);
          expect(s.items.map((x: number) => x * 2)).toEqual([2, 4]);
        }),
        ex('the same nested object always yields the same proxy', ({ env, expect }) => {
          const s = env.reactive({ user: { name: 'a' } }, () => {});
          expect(s.user === s.user).toBe(true);
        }),
        ex('Object.keys and JSON.stringify see the real data', ({ env, expect }) => {
          const s = env.reactive({ a: 1, b: { c: 2 } }, () => {});
          expect(Object.keys(s)).toEqual(['a', 'b']);
          expect(JSON.stringify(s)).toBe('{"a":1,"b":{"c":2}}');
        }),
        hid('does not mutate-notify when only reading', ({ env, expect }) => {
          let n = 0;
          const s = env.reactive({ a: { b: [1, 2, 3] } }, () => n++);
          void s.a.b.length; void s.a.b[0]; void Object.keys(s.a);
          expect(n).toBe(0);
        }),
      ],
      hints: [
        'Write an inner `wrap(obj, path)` and a `WeakMap` cache from raw object → proxy.',
        '`get`: call `Reflect.get`; if the value is an object, return `wrap(value, [...path, String(key)])`; pass symbols through untouched.',
        '`set`: remember whether the key existed and the old value, call `Reflect.set`, then notify if it changed. Return the boolean from Reflect.',
      ],
      why: 'This is the heart of Vue 3 / MobX-style reactivity.',
    }),

    lab({
      id: 'adv8-validated-default',
      title: 'validated() and defaultDict()',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['proxy'],
      prompt: `Two small Proxy utilities:

**\`validated(target, validators)\`** — \`validators\` maps keys to predicate functions. Assigning a value for which the predicate returns \`false\` must throw a \`TypeError\` with the message \`Invalid value for "key"\` and leave the object unchanged. Keys without a validator accept anything. (A \`set\` trap must return \`true\` on success.)

**\`defaultDict(factory)\`** — returns an object where reading a **missing string key** creates it with \`factory(key)\`, stores it, and returns it (so \`d.tags.push(...)\` works on a fresh key). Existing keys and symbols behave normally.`,
      expose: ['validated', 'defaultDict'],
      files: jsFile(
        `function validated(target, validators) {
  
}

function defaultDict(factory) {
  
}
`,
        `function validated(target, validators) {
  return new Proxy(target, {
    set(t, key, value, receiver) {
      const check = validators[key];
      if (check && !check(value)) throw new TypeError('Invalid value for "' + String(key) + '"');
      return Reflect.set(t, key, value, receiver);
    },
  });
}

function defaultDict(factory) {
  return new Proxy(
    {},
    {
      get(t, key, receiver) {
        if (typeof key === 'symbol' || key in t) return Reflect.get(t, key, receiver);
        t[key] = factory(key);
        return t[key];
      },
    }
  );
}
`
      ),
      tests: [
        ex('validated: accepts valid values', ({ env, expect }) => {
          const p = env.validated({}, { age: (v: unknown) => Number.isInteger(v) && (v as number) >= 0 });
          p.age = 30;
          p.name = 'free key';
          expect([p.age, p.name]).toEqual([30, 'free key']);
        }),
        ex('validated: throws a TypeError with the key name and keeps the old value', ({ env, expect }) => {
          const p = env.validated({ age: 1 }, { age: (v: unknown) => typeof v === 'number' });
          expect(() => { p.age = 'old'; }).toThrow('Invalid value for "age"');
          expect(p.age).toBe(1);
        }),
        ex('defaultDict: creates missing keys with the factory', ({ env, expect }) => {
          const d = env.defaultDict(() => []);
          d.fruits.push('apple');
          d.fruits.push('pear');
          d.veg.push('kale');
          expect(d.fruits).toEqual(['apple', 'pear']);
          expect(Object.keys(d)).toEqual(['fruits', 'veg']);
        }),
        ex('defaultDict: the factory receives the key, and runs once per key', ({ env, expect }) => {
          const seen: string[] = [];
          const d = env.defaultDict((k: string) => { seen.push(k); return k.toUpperCase(); });
          expect([d.a, d.a, d.b]).toEqual(['A', 'A', 'B']);
          expect(seen).toEqual(['a', 'b']);
        }),
        ex('defaultDict: existing keys are untouched, counters work', ({ env, expect }) => {
          const d = env.defaultDict(() => 0);
          d.x = 5;
          d.y += 1;
          d.y += 1;
          expect([d.x, d.y]).toEqual([5, 2]);
        }),
        hid('defaultDict: symbols and inherited members do not trigger the factory', ({ env, expect }) => {
          let calls = 0;
          const d = env.defaultDict(() => (calls++, 1));
          void d[Symbol.iterator]; void d.toString; void d.hasOwnProperty;
          expect(calls).toBe(0);
        }),
      ],
      hints: ['`validated`: in the `set` trap look up `validators[key]`; throw if it exists and returns false; else `return Reflect.set(...)`.', '`defaultDict`: in the `get` trap, if `key in t` (or it is a symbol) return `Reflect.get`; otherwise create it with `factory(key)` and store it on the target.'],
    }),

    lab({
      id: 'adv8-negative-index',
      title: 'Negative array indices',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['proxy', 'arrays'],
      prompt: `Write \`negativeIndex(array)\` returning a Proxy so that \`a[-1]\` is the last element, \`a[-2]\` the one before, and assignment works too (\`a[-1] = 'x'\`). Also support the \`in\` operator (\`-1 in a\` is \`true\` for a non-empty array).

Everything else — \`length\`, \`push\`, \`map\`, \`Array.isArray\`, normal indices — must still work. Property keys arrive as **strings**, so check with a regular expression such as \`/^-\\d+$/\`.`,
      expose: ['negativeIndex'],
      files: jsFile(
        `function negativeIndex(array) {
  
}
`,
        `function negativeIndex(array) {
  const fix = (t, key) => (typeof key === 'string' && /^-\\d+$/.test(key) ? String(t.length + Number(key)) : key);
  return new Proxy(array, {
    get: (t, key, receiver) => Reflect.get(t, fix(t, key), receiver),
    set: (t, key, value, receiver) => Reflect.set(t, fix(t, key), value, receiver),
    has: (t, key) => Reflect.has(t, fix(t, key)),
  });
}
`
      ),
      tests: [
        ex('reads from the end', ({ env, expect }) => {
          const a = env.negativeIndex([10, 20, 30]);
          expect([a[-1], a[-2], a[-3]]).toEqual([30, 20, 10]);
        }),
        ex('out-of-range negative reads are undefined', ({ env, expect }) => expect(env.negativeIndex([1, 2])[-5]).toBe(undefined)),
        ex('writes from the end', ({ env, expect }) => {
          const base = [1, 2, 3];
          const a = env.negativeIndex(base);
          a[-1] = 99;
          a[-3] = 0;
          expect(base).toEqual([0, 2, 99]);
        }),
        ex('normal arrays behaviour is preserved', ({ env, expect }) => {
          const a = env.negativeIndex([1, 2, 3]);
          a.push(4);
          expect([a.length, a[0], a[3]]).toEqual([4, 1, 4]);
          expect(a.map((x: number) => x * 2)).toEqual([2, 4, 6, 8]);
          expect(Array.isArray(a)).toBe(true);
          expect([...a]).toEqual([1, 2, 3, 4]);
        }),
        ex('the in operator understands negative indices', ({ env, expect }) => {
          const a = env.negativeIndex([1, 2, 3]);
          expect([-1 in a, -3 in a, -4 in a, 0 in a, 3 in a]).toEqual([true, true, false, true, false]);
        }),
      ],
      hints: ['Write a helper that converts a string key like `"-1"` into `String(target.length + -1)`; leave all other keys (including symbols) alone.', 'Install the helper in `get`, `set` and `has` traps and forward to `Reflect`.', 'Remember: all keys except symbols reach the trap as strings.'],
    }),

    lab({
      id: 'adv8-readonly',
      title: 'A deep read-only view',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['proxy', 'immutability'],
      prompt: `Write \`readonlyDeep(obj)\` returning a view of \`obj\` that **throws a \`TypeError\`** (message containing \`read-only\`) on any attempt to modify it — \`set\`, \`delete\`, \`defineProperty\` — at any depth (nested objects and arrays are wrapped lazily). Reading, \`Object.keys\`, \`JSON.stringify\` and non-mutating array methods must keep working. The original object stays mutable and changes to it show through the view.`,
      expose: ['readonlyDeep'],
      files: jsFile(
        `function readonlyDeep(obj) {
  
}
`,
        `function readonlyDeep(obj) {
  const cache = new WeakMap();
  const deny = () => {
    throw new TypeError('This object is read-only');
  };
  function wrap(o) {
    if (o === null || typeof o !== 'object') return o;
    const hit = cache.get(o);
    if (hit) return hit;
    const proxy = new Proxy(o, {
      get: (t, key, receiver) => wrap(Reflect.get(t, key, receiver)),
      set: deny,
      deleteProperty: deny,
      defineProperty: deny,
      setPrototypeOf: deny,
    });
    cache.set(o, proxy);
    return proxy;
  }
  return wrap(obj);
}
`
      ),
      tests: [
        ex('reads work', ({ env, expect }) => {
          const v = env.readonlyDeep({ a: 1, b: { c: [1, 2, 3] } });
          expect([v.a, v.b.c[1], v.b.c.length]).toEqual([1, 2, 3]);
          expect(Object.keys(v)).toEqual(['a', 'b']);
          expect(JSON.stringify(v)).toBe('{"a":1,"b":{"c":[1,2,3]}}');
        }),
        ex('top-level writes and deletes throw', ({ env, expect }) => {
          const v = env.readonlyDeep({ a: 1 });
          expect(() => { v.a = 2; }).toThrow('read-only');
          expect(() => { v.z = 2; }).toThrow('read-only');
          expect(() => { delete v.a; }).toThrow('read-only');
          expect(v.a).toBe(1);
        }),
        ex('nested writes throw (objects and arrays)', ({ env, expect }) => {
          const v = env.readonlyDeep({ b: { c: [1] } });
          expect(() => { v.b.x = 1; }).toThrow('read-only');
          expect(() => v.b.c.push(2)).toThrow('read-only');
          expect(() => { v.b.c[0] = 9; }).toThrow('read-only');
        }),
        ex('non-mutating array methods work', ({ env, expect }) => {
          const v = env.readonlyDeep({ list: [3, 1, 2] });
          expect(v.list.map((x: number) => x + 1)).toEqual([4, 2, 3]);
          expect([...v.list].sort()).toEqual([1, 2, 3]);
        }),
        ex('defineProperty is blocked too', ({ env, expect }) => {
          const v = env.readonlyDeep({});
          expect(() => Object.defineProperty(v, 'x', { value: 1 })).toThrow('read-only');
        }),
        ex('the original stays mutable and shows through', ({ env, expect }) => {
          const base = { n: { k: 1 } };
          const v = env.readonlyDeep(base);
          base.n.k = 5;
          expect(v.n.k).toBe(5);
        }),
      ],
      hints: ['Wrap on `get` (return `wrap(Reflect.get(...))`) so the protection is deep.', 'Use one `deny` function that throws a `TypeError` for the traps `set`, `deleteProperty`, `defineProperty` and `setPrototypeOf`.', 'Cache wrapped objects in a `WeakMap` so identity stays stable.'],
    }),
  ],
  references: [
    { title: 'MDN — Proxy', url: 'https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Proxy' },
    { title: 'Vue 3 — Reactivity in Depth', url: 'https://vuejs.org/guide/extras/reactivity-in-depth.html' },
  ],
};
export default mod;
