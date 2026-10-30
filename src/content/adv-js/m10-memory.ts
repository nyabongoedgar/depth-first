import type { Module } from '../../core/types';
import { ex, hid, perf, struct, lab, jsFile } from '../helpers';
import { FakeTimers } from '../fake-timers';

const mod: Module = {
  id: 'memory-leaks',
  course: 'adv-js',
  title: 'Memory, References & Leak Hunting',
  minutes: 40,
  objectives: [
    'Explain reachability and how garbage collection decides what to free',
    'Recognise the five classic leaks: listeners, timers, closures, caches and detached DOM',
    'Use `WeakMap`, `WeakSet` and `WeakRef` appropriately',
    'Build an event emitter and an O(1) LRU cache that do not leak',
  ],
  body: `
## How memory is managed

JavaScript has **automatic memory management**: you allocate by creating objects and the **garbage collector (GC)** frees what is no longer **reachable**.

> An object is *live* if it can be reached from a **root** (global object, the current call stack's locals, active closures, registered timers/listeners…) by following references. Everything else is garbage.

Engines use **generational** collection: most objects die young, so new objects go to a small, frequently-collected "young generation" (cheap *scavenge*); survivors are promoted to the "old generation", collected by a slower, mostly-concurrent **mark-and-sweep** (+ compaction). GC pauses are short but not zero — allocation-heavy code makes them more frequent.

A **leak** in JS isn't forgotten \`free()\`; it's an **unwanted reference** that keeps something reachable forever.

## The five classic leaks

1. **Forgotten listeners / subscriptions** — \`bus.on('tick', handler)\` keeps \`handler\` (and everything it closes over) alive as long as the bus lives. Fix: \`off\` in a \`dispose()\`/cleanup, or \`AbortSignal\`-based listeners.
2. **Timers** — \`setInterval(() => use(bigThing), 1000)\` keeps \`bigThing\` forever. Always \`clearInterval\`.
3. **Closures capturing more than needed** — a long-lived callback created next to a huge array keeps the array alive (engines optimise unused captured vars, not reliably).
4. **Unbounded caches / maps** — \`cache[key] = value\` with no eviction grows without bound. Use an LRU with a size cap, a TTL, or a **WeakMap** keyed by objects.
5. **Detached DOM nodes** — removed from the page but still referenced from JS.

\`\`\`js run
// The classic: a listener that outlives its owner
class Bus {
  constructor() { this.handlers = []; }
  on(fn) { this.handlers.push(fn); }
  count() { return this.handlers.length; }
}
const bus = new Bus();
function makeWidget() {
  const big = new Array(1000).fill("x");           // pretend this is heavy
  bus.on(() => big.length);                        // bus now keeps "big" alive FOREVER
}
for (let i = 0; i < 5; i++) makeWidget();
console.log("handlers still alive:", bus.count());   // 5 — leaked 5 widgets
\`\`\`

## Weak references

- **\`WeakMap\` / \`WeakSet\`** hold their *keys* weakly: if nothing else references the key object, the entry vanishes. Keys must be objects. They are **not iterable** and have no \`size\` (that would expose GC timing). Perfect for metadata about objects you don't own: \`const meta = new WeakMap(); meta.set(domNode, {clicks: 0})\`.
- **\`WeakRef\`** lets you hold an object *without* keeping it alive: \`ref.deref()\` returns the object or \`undefined\` if it was collected. Use sparingly (caches of expensive objects); never rely on *when* GC happens.
- **\`FinalizationRegistry\`** calls a callback after an object is collected — for cleanup of external resources; callbacks are best-effort and may never run.

\`\`\`js run
const meta = new WeakMap();
let node = { id: 1 };
meta.set(node, { clicks: 3 });
console.log(meta.get(node), meta.has({ id: 1 }));    // {clicks:3} false — identity, not structure
node = null;     // after GC the entry is gone; nobody can observe exactly when
\`\`\`

## Finding leaks in practice

1. **Reproduce** a growth pattern (e.g. open and close a dialog 100×).
2. Take **heap snapshots** (Chrome DevTools → Memory) before and after; compare with the "Comparison" view; look at **retainers** ("Retained by") to see *who* holds an object.
3. Use the **Allocation timeline** to see what survives.
4. In Node: \`node --inspect\`, \`--heapsnapshot-signal\`, or \`process.memoryUsage()\` trends; tools like \`clinic\` and \`memlab\`.

:::warn
Memory graphs growing is not always a leak: caches and pools grow to a steady state. A leak is **unbounded** growth with a constant workload.
:::

:::deep
**LRU cache in O(1).** A \`Map\` iterates in **insertion order**. To "touch" a key, \`delete\` and re-\`set\` it so it moves to the end; the least-recently-used key is always \`map.keys().next().value\`. Classic implementations use a hash map plus a doubly-linked list — a Map gives you both for free.
:::
`,
  quiz: [
    { q: 'What makes an object eligible for garbage collection?', options: ['It has not been used for a while', 'It is unreachable from any root', 'Its variable was set to a primitive', 'It is larger than 1 MB'], answer: 1, why: 'GC works on reachability, not on time since last use.' },
    { q: 'Which of these most commonly causes a leak?', options: ['Calling `Array.map`', 'Adding an event listener and never removing it', 'Using `const`', 'Declaring a class'], answer: 1, why: 'A listener is a strong reference from a long-lived object to your handler and its closure.' },
    { q: 'Why can\'t you iterate a `WeakMap` or read its `size`?', options: ['A spec oversight', 'It would expose when the GC ran, making behaviour non-deterministic', 'They are stored on disk', 'Keys are encrypted'], answer: 1, why: 'The contents depend on GC timing, so the API hides them.' },
    { q: 'What does `weakRef.deref()` return after the target was collected?', options: ['null', 'undefined', 'An empty object', 'It throws'], answer: 1, why: 'You must always handle the `undefined` case.' },
  ],
  labs: [
    lab({
      id: 'adv10-emitter',
      title: 'An EventEmitter that cleans up',
      kind: 'code',
      difficulty: 3,
      minutes: 25,
      tags: ['events', 'leaks'],
      interview: true,
      prompt: `Implement \`class EventEmitter\`:

- \`on(event, fn)\` and \`off(event, fn)\`; both return \`this\` (chainable). The same function registered twice is called twice; \`off\` removes **one** registration.
- \`once(event, fn)\` — calls \`fn\` once, then removes itself. It must also be removable with \`off(event, fn)\` using the *original* \`fn\` before it fires.
- \`emit(event, ...args)\` — calls listeners in registration order with \`this\` = the emitter; returns \`true\` if any listener ran. It must iterate over a **snapshot**: listeners added during an emit don't run in that emit, and removing one doesn't skip a neighbour.
- \`listenerCount(event)\`, \`removeAllListeners(event?)\`.
- **No leaks:** when the last listener of an event is removed, delete the event's entry entirely (so many one-off event names don't pile up).`,
      expose: ['EventEmitter'],
      files: jsFile(
        `class EventEmitter {
  constructor() {
    this.events = new Map();
  }

  on(event, fn) {}
  off(event, fn) {}
  once(event, fn) {}
  emit(event, ...args) {}
  listenerCount(event) {}
  removeAllListeners(event) {}
}
`,
        `class EventEmitter {
  constructor() {
    this.events = new Map();
  }

  on(event, fn) {
    const list = this.events.get(event) ?? [];
    list.push({ fn, original: fn });
    this.events.set(event, list);
    return this;
  }

  off(event, fn) {
    const list = this.events.get(event);
    if (!list) return this;
    const i = list.findLastIndex((l) => l.original === fn);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) this.events.delete(event);
    return this;
  }

  once(event, fn) {
    const wrapper = (...args) => {
      this.off(event, fn);
      return fn.apply(this, args);
    };
    const list = this.events.get(event) ?? [];
    list.push({ fn: wrapper, original: fn });
    this.events.set(event, list);
    return this;
  }

  emit(event, ...args) {
    const list = this.events.get(event);
    if (!list || list.length === 0) return false;
    for (const l of [...list]) l.fn.apply(this, args);
    return true;
  }

  listenerCount(event) {
    return this.events.get(event)?.length ?? 0;
  }

  removeAllListeners(event) {
    if (event === undefined) this.events.clear();
    else this.events.delete(event);
    return this;
  }
}
`
      ),
      tests: [
        ex('on/emit passes arguments and this', ({ env, expect }) => {
          const e = new env.EventEmitter();
          const seen: any[] = [];
          e.on('x', function (this: any, a: number, b: number) { seen.push([a, b, this === e]); });
          expect(e.emit('x', 1, 2)).toBe(true);
          expect(seen).toEqual([[1, 2, true]]);
          expect(e.emit('nobody')).toBe(false);
        }),
        ex('listeners run in registration order, and on() is chainable', ({ env, expect }) => {
          const e = new env.EventEmitter();
          const log: number[] = [];
          e.on('x', () => log.push(1)).on('x', () => log.push(2));
          e.emit('x');
          expect(log).toEqual([1, 2]);
        }),
        ex('off removes one registration', ({ env, expect }) => {
          const e = new env.EventEmitter();
          let n = 0;
          const f = () => n++;
          e.on('x', f); e.on('x', f);
          e.off('x', f);
          e.emit('x');
          expect(n).toBe(1);
          expect(e.listenerCount('x')).toBe(1);
        }),
        ex('once fires a single time', ({ env, expect }) => {
          const e = new env.EventEmitter();
          let n = 0;
          e.once('x', () => n++);
          e.emit('x'); e.emit('x');
          expect(n).toBe(1);
          expect(e.listenerCount('x')).toBe(0);
        }),
        ex('a once listener can be removed with the original function', ({ env, expect }) => {
          const e = new env.EventEmitter();
          let n = 0;
          const f = () => n++;
          e.once('x', f);
          e.off('x', f);
          e.emit('x');
          expect(n).toBe(0);
        }),
        ex('emit iterates a snapshot: adding during emit does not run the new listener this time', ({ env, expect }) => {
          const e = new env.EventEmitter();
          const log: string[] = [];
          e.on('x', () => { log.push('a'); e.on('x', () => log.push('late')); });
          e.emit('x');
          expect(log).toEqual(['a']);
          e.emit('x');
          expect(log).toEqual(['a', 'a', 'late']);
        }),
        ex('removing during emit does not skip the next listener', ({ env, expect }) => {
          const e = new env.EventEmitter();
          const log: string[] = [];
          const first = () => { log.push('first'); e.off('x', first); };
          e.on('x', first);
          e.on('x', () => log.push('second'));
          e.emit('x');
          expect(log).toEqual(['first', 'second']);
        }),
        ex('removeAllListeners (one event / all)', ({ env, expect }) => {
          const e = new env.EventEmitter();
          e.on('a', () => {}); e.on('b', () => {});
          e.removeAllListeners('a');
          expect([e.listenerCount('a'), e.listenerCount('b')]).toEqual([0, 1]);
          e.removeAllListeners();
          expect(e.listenerCount('b')).toBe(0);
        }),
        hid('no leak: event entries disappear when their last listener is removed', ({ env, expect }) => {
          const e = new env.EventEmitter();
          const fns: Array<() => void> = [];
          for (let i = 0; i < 100; i++) { const f = () => {}; fns.push(f); e.on('evt' + i, f); }
          fns.forEach((f, i) => e.off('evt' + i, f));
          const store = Object.values(e).find((v) => v instanceof Map || (v && typeof v === 'object')) as any;
          const size = store instanceof Map ? store.size : Object.keys(store ?? {}).length;
          expect(size).toBe(0);
        }),
      ],
      hints: ['Store listeners as an array of `{ fn, original }` per event in a `Map`. `original` lets `off` match a `once` wrapper.', '`emit`: `for (const l of [...list])` — copying the array gives you the snapshot semantics for free.', '`off`: find the *last* matching registration (or the first — be consistent), `splice` it out, and `delete` the map entry when the array is empty.'],
      why: 'Node\'s `events`, the DOM, and every UI library have this class at their heart — and most leaks start here.',
    }),

    lab({
      id: 'adv10-lru',
      title: 'An O(1) LRU cache',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['caching', 'data-structures'],
      interview: true,
      prompt: `Implement \`class LRUCache\` with fixed capacity:

- \`new LRUCache(capacity)\` (positive integer, otherwise throw a \`RangeError\`)
- \`get(key)\` → the value, or \`undefined\`. A hit makes the key **most recently used**.
- \`set(key, value)\` → inserts or updates (also marks as most recently used). If the size would exceed \`capacity\`, **evict the least recently used** entry.
- \`has(key)\` (does **not** change recency), \`delete(key)\`, \`size\`, \`keys()\` (array, least → most recently used).
- Every operation must be **O(1)** (hint: a \`Map\` remembers insertion order).
- \`undefined\` is a legal stored value (use \`has\`, not truthiness, to detect a hit).`,
      expose: ['LRUCache'],
      files: jsFile(
        `class LRUCache {
  constructor(capacity) {
    
  }

  get(key) {}
  set(key, value) {}
  has(key) {}
  delete(key) {}
  get size() {
    return 0;
  }
  keys() {}
}
`,
        `class LRUCache {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be a positive integer');
    this.capacity = capacity;
    this.map = new Map();
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.capacity) this.map.delete(this.map.keys().next().value);
    this.map.set(key, value);
    return this;
  }

  has(key) {
    return this.map.has(key);
  }

  delete(key) {
    return this.map.delete(key);
  }

  get size() {
    return this.map.size;
  }

  keys() {
    return [...this.map.keys()];
  }
}
`
      ),
      tests: [
        ex('basic get/set', ({ env, expect }) => {
          const c = new env.LRUCache(2);
          c.set('a', 1); c.set('b', 2);
          expect([c.get('a'), c.get('b'), c.get('zzz')]).toEqual([1, 2, undefined]);
        }),
        ex('evicts the least recently used', ({ env, expect }) => {
          const c = new env.LRUCache(2);
          c.set('a', 1); c.set('b', 2); c.set('c', 3);
          expect([c.has('a'), c.has('b'), c.has('c')]).toEqual([false, true, true]);
        }),
        ex('get refreshes recency', ({ env, expect }) => {
          const c = new env.LRUCache(2);
          c.set('a', 1); c.set('b', 2);
          c.get('a');
          c.set('c', 3);
          expect(c.keys()).toEqual(['a', 'c']);
        }),
        ex('updating a key refreshes it and does not grow the cache', ({ env, expect }) => {
          const c = new env.LRUCache(2);
          c.set('a', 1); c.set('b', 2); c.set('a', 10);
          expect(c.size).toBe(2);
          c.set('c', 3);
          expect(c.keys()).toEqual(['a', 'c']);
          expect(c.get('a')).toBe(10);
        }),
        ex('has() does not change recency', ({ env, expect }) => {
          const c = new env.LRUCache(2);
          c.set('a', 1); c.set('b', 2);
          c.has('a');
          c.set('c', 3);
          expect(c.has('a')).toBe(false);
        }),
        ex('undefined is a storable value', ({ env, expect }) => {
          const c = new env.LRUCache(2);
          c.set('u', undefined); c.set('b', 1);
          c.get('u');
          c.set('c', 2);
          expect(c.keys()).toEqual(['u', 'c']);
        }),
        ex('delete and size', ({ env, expect }) => {
          const c = new env.LRUCache(3);
          c.set(1, 'x'); c.set(2, 'y');
          expect(c.delete(1)).toBe(true);
          expect(c.delete(99)).toBe(false);
          expect(c.size).toBe(1);
        }),
        ex('rejects a bad capacity', ({ env, expect }) => {
          expect(() => new env.LRUCache(0)).toThrow('capacity');
          expect(() => new env.LRUCache(2.5)).toThrow('capacity');
        }),
        perf('operations are O(1): 20,000 mixed ops stay within a small constant per op', async ({ env, expect, measure }) => {
          const c = new env.LRUCache(500);
          const { steps } = await measure(() => {
            for (let i = 0; i < 20000; i++) {
              c.set('k' + (i % 900), i);
              c.get('k' + ((i * 7) % 900));
            }
          });
          expect(steps).toBeLessThan(20000 * 2 * 6);
        }),
      ],
      hints: ['A `Map` iterates keys in insertion order — the *first* key is the oldest.', 'To refresh a key: `map.delete(key); map.set(key, value)` moves it to the end.', 'Evict with `map.delete(map.keys().next().value)` before inserting a new key into a full cache.'],
      why: 'LRU caches back CPU caches, databases, CDNs, browsers and your memoization layer. O(1) is the interview bar.',
    }),

    lab({
      id: 'adv10-weak-memo',
      title: 'Memoize by object identity, without leaking',
      kind: 'code',
      difficulty: 2,
      minutes: 10,
      tags: ['weakmap', 'caching'],
      prompt: `Write \`memoizeByObject(fn)\` for single-argument functions whose argument is an **object**. Cache results keyed by the object's **identity** (not structure), so an entry disappears automatically once the object itself is no longer referenced anywhere.

- Same object → cached result (don't call \`fn\` again), including falsy / \`undefined\` results.
- Different objects with equal contents are different keys.
- A non-object argument throws a \`TypeError\`.
- Use a \`WeakMap\` — a \`Map\` would keep every key alive forever.`,
      expose: ['memoizeByObject'],
      files: jsFile(
        `function memoizeByObject(fn) {
  
}
`,
        `function memoizeByObject(fn) {
  const cache = new WeakMap();
  return function (obj) {
    if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) throw new TypeError('Argument must be an object');
    if (cache.has(obj)) return cache.get(obj);
    const result = fn.call(this, obj);
    cache.set(obj, result);
    return result;
  };
}
`
      ),
      tests: [
        ex('caches per object identity', ({ env, expect }) => {
          let calls = 0;
          const f = env.memoizeByObject((o: { n: number }) => (calls++, o.n * 2));
          const a = { n: 4 };
          expect([f(a), f(a)]).toEqual([8, 8]);
          expect(calls).toBe(1);
        }),
        ex('equal-looking objects are separate keys', ({ env, expect }) => {
          let calls = 0;
          const f = env.memoizeByObject((o: { n: number }) => (calls++, o.n));
          f({ n: 1 }); f({ n: 1 });
          expect(calls).toBe(2);
        }),
        ex('caches falsy results', ({ env, expect }) => {
          let calls = 0;
          const f = env.memoizeByObject(() => (calls++, undefined));
          const o = {};
          f(o); f(o);
          expect(calls).toBe(1);
        }),
        ex('rejects non-objects', ({ env, expect }) => {
          const f = env.memoizeByObject((o: object) => o);
          expect(() => f(1)).toThrow('object');
          expect(() => f(null)).toThrow('object');
        }),
        hid('is backed by a WeakMap (not a Map or array)', ({ code, expect }) => {
          expect(/new\s+WeakMap/.test(code)).toBe(true);
          expect(/new\s+Map\b/.test(code)).toBe(false);
        }, 'structural'),
      ],
      hints: ['`const cache = new WeakMap();` inside `memoizeByObject`.', 'Check `cache.has(obj)` rather than the truthiness of `cache.get(obj)`.'],
    }),

    lab({
      id: 'adv10-fix-leak',
      title: 'Fix the leak: a Widget that disposes properly',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['leaks', 'cleanup'],
      prompt: `This \`Widget\` subscribes to an event bus and starts a polling timer, but there is **no way to clean up**. Components that come and go would leak both.

Complete the class:

- the constructor receives \`(bus, timers)\` and must subscribe to \`'data'\` on \`bus\` (using \`bus.on('data', handler)\`) and start a **repeating** poll every \`1000\` ms with \`timers.setInterval(() => this.polls++, 1000)\`;
- \`dispose()\` must **unsubscribe** with \`bus.off('data', handler)\` (the *same* function that was passed to \`on\`) and **clear the interval**;
- after \`dispose()\`, new \`'data'\` events and timer ticks must have **no effect** and the widget must be unreachable from the bus; calling \`dispose()\` twice must be safe.`,
      expose: ['Widget'],
      files: jsFile(
        `class Widget {
  constructor(bus, timers = globalThis) {
    this.received = [];
    this.polls = 0;
    // subscribe to "data" events and start polling
    bus.on('data', (d) => this.received.push(d));
    timers.setInterval(() => this.polls++, 1000);
  }

  dispose() {
    // TODO: undo everything the constructor did
  }
}
`,
        `class Widget {
  constructor(bus, timers = globalThis) {
    this.received = [];
    this.polls = 0;
    this.bus = bus;
    this.timers = timers;
    this.handler = (d) => this.received.push(d);
    bus.on('data', this.handler);
    this.timerId = timers.setInterval(() => this.polls++, 1000);
    this.disposed = false;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.bus.off('data', this.handler);
    this.timers.clearInterval(this.timerId);
    this.bus = null;
    this.timers = null;
    this.handler = null;
  }
}
`
      ),
      tests: [
        ex('works while alive', async ({ env, expect }) => {
          const { bus, timers } = harness();
          const w = new env.Widget(bus, timers);
          bus.emit('data', 1); bus.emit('data', 2);
          await timers.advance(2500);
          expect(w.received).toEqual([1, 2]);
          expect(w.polls).toBe(2);
        }),
        ex('dispose removes the bus listener', ({ env, expect }) => {
          const { bus, timers } = harness();
          const w = new env.Widget(bus, timers);
          expect(bus.count('data')).toBe(1);
          w.dispose();
          expect(bus.count('data')).toBe(0);
        }),
        ex('dispose clears the interval', async ({ env, expect }) => {
          const { bus, timers } = harness();
          const w = new env.Widget(bus, timers);
          w.dispose();
          expect(timers.activeIntervals()).toBe(0);
          await timers.advance(5000);
          expect(w.polls).toBe(0);
        }),
        ex('events after dispose have no effect on the widget', ({ env, expect }) => {
          const { bus, timers } = harness();
          const w = new env.Widget(bus, timers);
          w.dispose();
          bus.emit('data', 99);
          expect(w.received).toEqual([]);
        }),
        ex('dispose twice is safe', ({ env, expect }) => {
          const { bus, timers } = harness();
          const w = new env.Widget(bus, timers);
          w.dispose();
          expect(() => w.dispose()).not.toThrow();
        }),
        hid('many create/dispose cycles leave nothing behind', async ({ env, expect }) => {
          const { bus, timers } = harness();
          for (let i = 0; i < 50; i++) new env.Widget(bus, timers).dispose();
          expect(bus.count('data')).toBe(0);
          expect(timers.activeIntervals()).toBe(0);
        }),
      ],
      hints: ['Save the handler in a variable/property — `off` needs the exact same function object that you gave `on`.', 'Save the id returned by `timers.setInterval` so `dispose()` can pass it to `timers.clearInterval(id)`.', 'Optionally null out references after disposing so the object cannot keep things alive.'],
      why: 'This is the pattern behind `useEffect` cleanup, `removeEventListener`, `AbortController`, and Angular\'s `ngOnDestroy`.',
    }),
  ],
  references: [
    { title: 'MDN — Memory management', url: 'https://developer.mozilla.org/docs/Web/JavaScript/Memory_management' },
    { title: 'V8 blog — Trash talk: the Orinoco garbage collector', url: 'https://v8.dev/blog/trash-talk' },
  ],
};

/** A tiny event bus + interval-capable fake timers for the Widget tests. */
function harness() {
  const handlers = new Map<string, Array<(d: unknown) => void>>();
  const bus = {
    on(e: string, f: (d: unknown) => void) { handlers.set(e, [...(handlers.get(e) ?? []), f]); },
    off(e: string, f: (d: unknown) => void) { handlers.set(e, (handlers.get(e) ?? []).filter((x) => x !== f)); },
    emit(e: string, d: unknown) { [...(handlers.get(e) ?? [])].forEach((f) => f(d)); },
    count(e: string) { return (handlers.get(e) ?? []).length; },
  };
  const intervals = new Map<number, { every: number; next: number; fn: () => void }>();
  let id = 0;
  let now = 0;
  const timers = {
    setInterval(fn: () => void, every: number) { intervals.set(++id, { every, next: now + every, fn }); return id; },
    clearInterval(i: number) { intervals.delete(i); },
    activeIntervals: () => intervals.size,
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        let best: [number, { every: number; next: number; fn: () => void }] | undefined;
        for (const e of intervals) if (e[1].next <= end && (!best || e[1].next < best[1].next)) best = e;
        if (!best) break;
        now = best[1].next;
        best[1].next += best[1].every;
        best[1].fn();
      }
      now = end;
    },
  };
  return { bus, timers };
}
export default mod;
