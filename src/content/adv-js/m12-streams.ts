import type { Module } from '../../core/types';
import { ex, hid, lab, jsFile } from '../helpers';
import { deferred, tick } from '../fake-timers';

const mod: Module = {
  id: 'streams-backpressure',
  course: 'adv-js',
  title: 'Async Iteration, Streams & Backpressure',
  minutes: 45,
  objectives: [
    'Consume and produce data with `for await…of` and async generators',
    'Explain backpressure and why unbounded buffering crashes systems',
    'Write stream-processing stages that handle chunk boundaries correctly',
    'Implement a bounded channel and an ordered, bounded-concurrency `mapAsync`',
  ],
  body: `
## Data that arrives over time

A 4 GB log file, an HTTP response body, a WebSocket, a user's keystrokes: you can't (and shouldn't) hold it all in memory. You process it **chunk by chunk**. JavaScript models this with **async iterables**: objects whose \`[Symbol.asyncIterator]()\` returns an iterator whose \`next()\` returns a **promise** of \`{ value, done }\`.

\`\`\`js run
async function* ticker(n) {                 // async generator = producer
  for (let i = 1; i <= n; i++) {
    await new Promise((r) => setTimeout(r, 10));
    yield i;
  }
}
for await (const x of ticker(3)) console.log("got", x);     // consumer: pulls one at a time
\`\`\`

\`for await\` **pulls**: it asks for the next value only after you finish handling the previous one. That *pull* model is the simplest form of backpressure — a slow consumer automatically slows the producer, because the generator doesn't run past \`yield\` until asked.

## Chunk boundaries: the classic bug

Chunks don't respect your data's structure. A chunk can end in the *middle* of a line, a JSON document, or a UTF-8 character. A parser must **buffer the unfinished tail** and prepend it to the next chunk.

\`\`\`js run
async function* chunks() { yield "alpha\\nbe"; yield "ta\\ngam"; yield "ma\\n"; }

async function* lines(source) {
  let buffer = "";
  for await (const chunk of source) {
    buffer += chunk;
    const parts = buffer.split("\\n");
    buffer = parts.pop();            // last piece may be incomplete: keep it
    yield* parts;
  }
  if (buffer) yield buffer;          // flush the tail at the end
}
for await (const line of lines(chunks())) console.log(JSON.stringify(line));
\`\`\`

(For text decoding use \`TextDecoder\` with \`{ stream: true }\` so multi-byte characters split across chunks decode correctly.)

## Backpressure

If a producer is faster than a consumer, something must give. With no coordination, data piles up in memory (an **unbounded queue**) until the process dies — the most common production failure of naive "fast producer, slow consumer" code.

Backpressure is the signal flowing **upstream**: "I'm full, slow down". Mechanisms:

- **Pull-based iteration** (above): producer waits to be asked.
- **Bounded buffers:** \`send()\` blocks (awaits) when the buffer is full. Go channels, Node streams (\`highWaterMark\` + \`write()\` returning \`false\` + the \`'drain'\` event), Web Streams (\`desiredSize\`, \`ready\` promise).
- **Load shedding:** drop or sample data when full (metrics, video frames).
- **Rate limiting** at the source.

\`\`\`js run
// Without backpressure: a fast producer fills memory
const queue = [];
const producer = setInterval(() => queue.push(new Array(1000)), 1);   // 1000 msgs/s
const consumer = setInterval(() => queue.shift(), 10);                // 100 msgs/s
await new Promise((r) => setTimeout(r, 200));
clearInterval(producer); clearInterval(consumer);
console.log("queue grew to", queue.length);     // unbounded growth
\`\`\`

## Web Streams and Node streams

The **WHATWG Streams API** (\`ReadableStream\`, \`WritableStream\`, \`TransformStream\`, \`pipeTo/pipeThrough\`) is built into browsers, Node, Deno and Bun; a \`ReadableStream\` is async-iterable. Node also has \`stream.Readable/Writable/Transform\` and \`stream.pipeline()\` (which propagates errors and destroys all stages — prefer it to \`.pipe()\`).

\`\`\`js
// Node example (concept)
import { pipeline } from "node:stream/promises";
await pipeline(
  fs.createReadStream("big.log"),
  async function* (source) { for await (const line of lines(source)) if (line.includes("ERROR")) yield line + "\\n"; },
  fs.createWriteStream("errors.log"),
);
\`\`\`

:::tip
**Design checklist for a streaming stage:** (1) never read the whole input; (2) handle partial chunks; (3) bound any buffer; (4) propagate cancellation/errors (and close upstream); (5) flush at the end.
:::

:::interview
"Process a huge file / paginated API without loading it all." Say **async generator + bounded concurrency + backpressure**, then discuss error handling, resuming, and memory.
:::
`,
  quiz: [
    { q: 'What gives `for await` its built-in backpressure?', options: ['It uses threads', 'The loop requests the next item only after the body finishes', 'It buffers everything', 'It drops items'], answer: 1, why: 'Pull-based iteration: the producer only advances when asked.' },
    { q: 'A text chunk ends with "…hel". What must a line parser do?', options: ['Emit "…hel" as a line', 'Keep it in a buffer and prepend it to the next chunk', 'Drop it', 'Throw'], answer: 1, why: 'Chunk boundaries are arbitrary; carry the incomplete tail forward.' },
    { q: 'Which is NOT a backpressure strategy?', options: ['Bounded buffer that makes `send()` wait', 'Pull-based reading', 'Unlimited in-memory queue', 'Dropping data when full'], answer: 2, why: 'An unlimited queue defers the problem until memory runs out.' },
    { q: 'Why prefer `stream.pipeline()` over `a.pipe(b).pipe(c)`?', options: ['It is faster', 'It forwards errors and cleans up all streams', 'It uses less syntax only', 'pipe is removed'], answer: 1, why: '`.pipe()` does not propagate errors or destroy the other streams, causing leaks.' },
  ],
  labs: [
    lab({
      id: 'adv12-split-lines',
      title: 'splitLines across chunk boundaries',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['streams', 'parsing'],
      prompt: `Write the async generator \`splitLines(source)\` where \`source\` is an (async) iterable of **string chunks**. Yield each **line** (without the newline) as soon as it is complete.

- Lines may be split across chunks, and one chunk may contain many lines.
- Handle both \`\\n\` and \`\\r\\n\` line endings (including when the \`\\r\` and \`\\n\` arrive in different chunks).
- Empty lines are preserved. A final line without a trailing newline is still yielded; a trailing newline does **not** create an extra empty line.
- Don't read ahead: yield lines as soon as they're complete.`,
      expose: ['splitLines'],
      files: jsFile(
        `async function* splitLines(source) {
  
}
`,
        `async function* splitLines(source) {
  let buffer = '';
  for await (const chunk of source) {
    buffer += chunk;
    const parts = buffer.split(/\\r?\\n/);
    buffer = parts.pop();
    for (const line of parts) yield line;
  }
  if (buffer !== '') yield buffer;
}
`
      ),
      tests: [
        ex('splits a single chunk', async ({ env, expect }) => {
          const out: string[] = [];
          for await (const l of env.splitLines(['a\nb\nc\n'])) out.push(l);
          expect(out).toEqual(['a', 'b', 'c']);
        }),
        ex('joins lines split across chunks', async ({ env, expect }) => {
          const out: string[] = [];
          for await (const l of env.splitLines(['alpha\nbe', 'ta\ngam', 'ma\n'])) out.push(l);
          expect(out).toEqual(['alpha', 'beta', 'gamma']);
        }),
        ex('yields a final line without trailing newline', async ({ env, expect }) => {
          const out: string[] = [];
          for await (const l of env.splitLines(['one\ntwo'])) out.push(l);
          expect(out).toEqual(['one', 'two']);
        }),
        ex('preserves empty lines but not a phantom one at the end', async ({ env, expect }) => {
          const out: string[] = [];
          for await (const l of env.splitLines(['a\n\nb\n'])) out.push(l);
          expect(out).toEqual(['a', '', 'b']);
        }),
        ex('handles \\r\\n, even split across chunks', async ({ env, expect }) => {
          const out: string[] = [];
          for await (const l of env.splitLines(['a\r', '\nb\r\nc'])) out.push(l);
          expect(out).toEqual(['a', 'b', 'c']);
        }),
        ex('accepts an async iterable', async ({ env, expect }) => {
          async function* src() { yield 'x\ny'; await Promise.resolve(); yield '\nz'; }
          const out: string[] = [];
          for await (const l of env.splitLines(src())) out.push(l);
          expect(out).toEqual(['x', 'y', 'z']);
        }),
        hid('is lazy: yields a line before the next chunk is requested', async ({ env, expect }) => {
          let pulled = 0;
          async function* src() { pulled++; yield 'first\nsec'; pulled++; yield 'ond\n'; }
          const it = env.splitLines(src());
          const a = await it.next();
          expect(a.value).toBe('first');
          expect(pulled).toBe(1);
          await it.return?.();
        }),
        hid('empty input yields nothing', async ({ env, expect }) => {
          const out: string[] = [];
          for await (const l of env.splitLines([])) out.push(l);
          expect(out).toEqual([]);
        }),
      ],
      hints: ['Keep `let buffer = ""`. For each chunk: `buffer += chunk; const parts = buffer.split(/\\r?\\n/); buffer = parts.pop();` then yield the complete `parts`.', 'The popped last element is the unfinished tail — it stays in `buffer`.', 'After the loop, `if (buffer !== "") yield buffer`.'],
    }),

    lab({
      id: 'adv12-batch-map',
      title: 'batch and mapAsync',
      kind: 'code',
      difficulty: 4,
      minutes: 30,
      tags: ['streams', 'concurrency'],
      interview: true,
      prompt: `Write two async generators over any (async) iterable source:

**\`batch(source, size)\`** — yields arrays of up to \`size\` items; the last array may be shorter. Throw a \`RangeError\` for \`size < 1\`.

**\`mapAsync(source, fn, concurrency = 4)\`** — calls \`fn(item, index)\` (may return a promise) with **at most \`concurrency\` calls in progress**, but yields the results **in source order**.
- Pull from the source **lazily**: never have more than \`concurrency\` items pulled-but-not-yet-yielded.
- If \`fn\` rejects, the error is thrown to the consumer, and the source iterator must be **closed** (\`return()\`).
- When the consumer stops early (\`break\`), close the source too.`,
      expose: ['batch', 'mapAsync'],
      files: jsFile(
        `async function* batch(source, size) {
  
}

async function* mapAsync(source, fn, concurrency = 4) {
  
}
`,
        `async function* batch(source, size) {
  if (!(size >= 1)) throw new RangeError('size must be >= 1');
  let current = [];
  for await (const item of source) {
    current.push(item);
    if (current.length >= size) {
      yield current;
      current = [];
    }
  }
  if (current.length > 0) yield current;
}

async function* mapAsync(source, fn, concurrency = 4) {
  const it = source[Symbol.asyncIterator] ? source[Symbol.asyncIterator]() : source[Symbol.iterator]();
  const queue = [];
  let exhausted = false;
  let index = 0;
  try {
    for (;;) {
      while (!exhausted && queue.length < concurrency) {
        const r = await it.next();
        if (r.done) {
          exhausted = true;
          break;
        }
        const i = index++;
        const p = Promise.resolve().then(() => fn(r.value, i));
        p.catch(() => {}); // avoid unhandled-rejection noise; the error is re-thrown when awaited in order
        queue.push(p);
      }
      if (queue.length === 0) return;
      yield await queue.shift();
    }
  } finally {
    if (!exhausted && it.return) await it.return();
  }
}
`
      ),
      tests: [
        ex('batch: groups items', async ({ env, expect }) => {
          const out: number[][] = [];
          for await (const b of env.batch([1, 2, 3, 4, 5], 2)) out.push(b);
          expect(out).toEqual([[1, 2], [3, 4], [5]]);
        }),
        ex('batch: works on async sources and exact multiples', async ({ env, expect }) => {
          async function* s() { for (let i = 0; i < 4; i++) yield i; }
          const out: number[][] = [];
          for await (const b of env.batch(s(), 2)) out.push(b);
          expect(out).toEqual([[0, 1], [2, 3]]);
        }),
        ex('batch: rejects a bad size', async ({ env, expect }) => {
          const e = await (async () => { try { for await (const _ of env.batch([1], 0)) void _; } catch (x: any) { return x; } })();
          expect(e).toBeInstanceOf(RangeError);
        }),
        ex('mapAsync: results arrive in source order even if tasks finish out of order', async ({ env, expect }) => {
          const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
          const out: string[] = [];
          const done = (async () => { for await (const r of env.mapAsync([0, 1, 2], (i: number) => gates[i].promise, 3)) out.push(r); })();
          gates[2].resolve('c'); gates[0].resolve('a'); gates[1].resolve('b');
          await done;
          expect(out).toEqual(['a', 'b', 'c']);
        }),
        ex('mapAsync: never more than `concurrency` calls running; pulls lazily', async ({ env, expect }) => {
          const gates = Array.from({ length: 6 }, () => deferred<number>());
          let running = 0;
          let peak = 0;
          let pulled = 0;
          const started: number[] = [];
          function* src() { for (let i = 0; i < 6; i++) { pulled++; yield i; } }
          const out: number[] = [];
          const done = (async () => {
            for await (const r of env.mapAsync(src(), async (i: number) => { started.push(i); running++; peak = Math.max(peak, running); const v = await gates[i].promise; running--; return v; }, 2)) out.push(r);
          })();
          await tick(); await tick();
          expect(started).toEqual([0, 1]);
          expect(pulled).toBeLessThanOrEqual(2);
          gates[0].resolve(0); await tick(); await tick();
          expect(started.length).toBe(3);
          for (let i = 1; i < 6; i++) { gates[i].resolve(i); await tick(); }
          await done;
          expect(out).toEqual([0, 1, 2, 3, 4, 5]);
          expect(peak).toBeLessThanOrEqual(2);
        }),
        ex('mapAsync: passes the index', async ({ env, expect }) => {
          const out: string[] = [];
          for await (const r of env.mapAsync(['a', 'b'], (x: string, i: number) => x + i, 2)) out.push(r);
          expect(out).toEqual(['a0', 'b1']);
        }),
        ex('mapAsync: a rejection reaches the consumer and the source is closed', async ({ env, expect }) => {
          let closed = false;
          function* src() { try { for (let i = 0; i < 100; i++) yield i; } finally { closed = true; } }
          const e = await (async () => {
            try { for await (const _ of env.mapAsync(src(), async (i: number) => { if (i === 2) throw new Error('bad item'); return i; }, 3)) void _; } catch (x: any) { return x; }
          })();
          expect(e.message).toBe('bad item');
          expect(closed).toBe(true);
        }),
        hid('mapAsync: breaking out early closes the source', async ({ env, expect }) => {
          let closed = false;
          function* src() { try { for (let i = 0; i < 100; i++) yield i; } finally { closed = true; } }
          for await (const r of env.mapAsync(src(), async (i: number) => i, 2)) { if (r === 3) break; }
          expect(closed).toBe(true);
        }),
      ],
      hints: [
        '`batch` is a `for await` loop that pushes into an array and yields it when it reaches `size`.',
        '`mapAsync`: keep a `queue` of promises in source order. Fill it with `await it.next()` up to `concurrency`, then `yield await queue.shift()`.',
        'Wrap in `try { … } finally { if (!exhausted) await it.return?.() }` so errors and early `break` close the source.',
        'Add `p.catch(() => {})` to each task promise: the real error still surfaces when you `await` it in order.',
      ],
      why: 'This is the heart of every ETL job, crawler and file uploader: ordered output, bounded parallelism, lazy input.',
    }),

    lab({
      id: 'adv12-channel',
      title: 'A bounded channel with backpressure',
      kind: 'code',
      difficulty: 5,
      minutes: 35,
      tags: ['streams', 'concurrency', 'queues'],
      interview: true,
      prompt: `Implement \`class Channel\` — a Go-style async queue connecting producers and consumers.

- \`new Channel(capacity = 0)\`. Capacity \`0\` means **rendezvous**: a \`send\` completes only when a receiver takes the value.
- \`send(value)\` → promise that resolves once the value is **accepted** (handed to a waiting receiver, or placed in the buffer). If the buffer is full it waits (**backpressure**). FIFO among waiting senders.
- \`receive()\` → promise of \`{ value, done }\`. Takes the oldest buffered value (then moves one waiting sender's value into the buffer), or waits for a sender. When the channel is closed **and drained**, resolves \`{ value: undefined, done: true }\`.
- \`close()\` — no more sends: later \`send\`s (and senders still waiting) **reject** with an Error. Buffered values can still be received; waiting receivers get \`done\`.
- The channel is async-iterable: \`for await (const v of channel)\`.`,
      expose: ['Channel'],
      files: jsFile(
        `class Channel {
  constructor(capacity = 0) {
    this.capacity = capacity;
  }

  send(value) {}
  receive() {}
  close() {}
  [Symbol.asyncIterator]() {}
}
`,
        `class Channel {
  constructor(capacity = 0) {
    this.capacity = capacity;
    this.buffer = [];
    this.receivers = [];
    this.senders = [];
    this.closed = false;
  }

  send(value) {
    if (this.closed) return Promise.reject(new Error('send on closed channel'));
    if (this.receivers.length > 0) {
      this.receivers.shift()({ value, done: false });
      return Promise.resolve();
    }
    if (this.buffer.length < this.capacity) {
      this.buffer.push(value);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => this.senders.push({ value, resolve, reject }));
  }

  receive() {
    if (this.buffer.length > 0) {
      const value = this.buffer.shift();
      if (this.senders.length > 0) {
        const s = this.senders.shift();
        this.buffer.push(s.value);
        s.resolve();
      }
      return Promise.resolve({ value, done: false });
    }
    if (this.senders.length > 0) {
      const s = this.senders.shift();
      s.resolve();
      return Promise.resolve({ value: s.value, done: false });
    }
    if (this.closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => this.receivers.push(resolve));
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const r of this.receivers.splice(0)) r({ value: undefined, done: true });
    for (const s of this.senders.splice(0)) s.reject(new Error('send on closed channel'));
  }

  [Symbol.asyncIterator]() {
    return { next: () => this.receive() };
  }
}
`
      ),
      tests: [
        ex('buffered: sends up to capacity complete immediately, the next waits', async ({ env, expect }) => {
          const ch = new env.Channel(2);
          const log: string[] = [];
          ch.send('a').then(() => log.push('a'));
          ch.send('b').then(() => log.push('b'));
          ch.send('c').then(() => log.push('c'));
          await tick();
          expect(log).toEqual(['a', 'b']);
          expect((await ch.receive()).value).toBe('a');
          await tick();
          expect(log).toEqual(['a', 'b', 'c']);
        }),
        ex('FIFO delivery', async ({ env, expect }) => {
          const ch = new env.Channel(3);
          await ch.send(1); await ch.send(2); await ch.send(3);
          expect([(await ch.receive()).value, (await ch.receive()).value, (await ch.receive()).value]).toEqual([1, 2, 3]);
        }),
        ex('rendezvous (capacity 0): send waits for a receiver', async ({ env, expect }) => {
          const ch = new env.Channel(0);
          let sent = false;
          ch.send('x').then(() => (sent = true));
          await tick();
          expect(sent).toBe(false);
          const r = await ch.receive();
          expect(r).toEqual({ value: 'x', done: false });
          await tick();
          expect(sent).toBe(true);
        }),
        ex('a waiting receiver gets the next sent value directly', async ({ env, expect }) => {
          const ch = new env.Channel(0);
          const p = ch.receive();
          await ch.send(42);
          expect(await p).toEqual({ value: 42, done: false });
        }),
        ex('close: waiting receivers finish, buffered values are still delivered', async ({ env, expect }) => {
          const ch = new env.Channel(2);
          await ch.send('x');
          ch.close();
          expect(await ch.receive()).toEqual({ value: 'x', done: false });
          expect(await ch.receive()).toEqual({ value: undefined, done: true });
          const ch2 = new env.Channel(0);
          const p = ch2.receive();
          ch2.close();
          expect((await p).done).toBe(true);
        }),
        ex('send after close rejects; blocked senders reject on close', async ({ env, expect }) => {
          const ch = new env.Channel(0);
          const blocked = ch.send('stuck').catch((e: Error) => e.message);
          ch.close();
          expect(await blocked).toContain('closed');
          const e = await ch.send('late').catch((x: Error) => x.message);
          expect(e).toContain('closed');
        }),
        ex('async iteration', async ({ env, expect }) => {
          const ch = new env.Channel(1);
          (async () => { for (let i = 0; i < 5; i++) await ch.send(i); ch.close(); })();
          const out: number[] = [];
          for await (const v of ch) out.push(v);
          expect(out).toEqual([0, 1, 2, 3, 4]);
        }),
        hid('backpressure: a fast producer cannot run far ahead of a slow consumer', async ({ env, expect }) => {
          const ch = new env.Channel(2);
          let sent = 0;
          let received = 0;
          let maxAhead = 0;
          (async () => { for (let i = 0; i < 50; i++) { await ch.send(i); sent++; maxAhead = Math.max(maxAhead, sent - received); } ch.close(); })();
          for await (const _ of ch) { received++; await tick(); }
          expect(received).toBe(50);
          expect(maxAhead).toBeLessThanOrEqual(4);
        }),
      ],
      hints: [
        'Three queues: `buffer` (values), `receivers` (resolve functions of waiting `receive()` calls) and `senders` (`{ value, resolve, reject }` of waiting `send()` calls).',
        '`send`: closed → reject; waiting receiver → hand over; room in buffer → push; else queue yourself in `senders`.',
        '`receive`: buffered value → take it **and refill the buffer from one waiting sender**; else a waiting sender (rendezvous) → take its value; else closed → done; else wait.',
        '`close`: set the flag, resolve all waiting receivers with `done: true`, reject all waiting senders.',
      ],
      why: 'Channels are how Go, Rust (mpsc), Kotlin and Erlang structure concurrent programs. Backpressure in 60 lines.',
    }),
  ],
  references: [
    { title: 'MDN — for await…of', url: 'https://developer.mozilla.org/docs/Web/JavaScript/Reference/Statements/for-await...of' },
    { title: 'Node.js — Backpressuring in Streams', url: 'https://nodejs.org/en/learn/modules/backpressuring-in-streams' },
    { title: 'WHATWG Streams Standard', url: 'https://streams.spec.whatwg.org/' },
  ],
};
export default mod;
