import type { Module } from '../../core/types';
import { ex, hid, prop, perf, lab, jsFile } from '../helpers';

const mod: Module = {
  id: 'binary-data',
  course: 'adv-js',
  title: 'Binary Data: Typed Arrays, DataView & Bit Manipulation',
  minutes: 40,
  objectives: [
    'Use `ArrayBuffer`, typed arrays and `DataView` to read and write binary formats',
    'Apply bitwise operators for flags, masks, packing and compact data structures',
    'Explain endianness and how JS numbers differ from fixed-width integers',
    'Implement a bitset, LEB128 varints, a binary record codec and a ring buffer',
  ],
  body: `
## Why binary matters

Network protocols, file formats (PNG, MP4, protobuf), WebGL, WebAssembly, audio, crypto and high-performance data structures all work on **bytes**. JavaScript's normal numbers are 64-bit floats and arrays hold boxed values; typed arrays give you flat, fixed-width memory.

## ArrayBuffer, views and endianness

- **\`ArrayBuffer\`** — a fixed-length block of raw bytes. You cannot read it directly.
- **Typed array views** — \`Uint8Array\`, \`Int16Array\`, \`Uint32Array\`, \`Float32Array\`, \`Float64Array\`, \`BigInt64Array\`… interpret the buffer as a sequence of one type. Several views can share one buffer. Elements are **clamped/wrapped** to their width on write.
- **\`DataView\`** — read/write any type at any byte offset with **explicit endianness**.

\`\`\`js run
const buf = new ArrayBuffer(8);
const bytes = new Uint8Array(buf);
const words = new Uint32Array(buf);        // same memory, different view
words[0] = 0x01020304;
console.log(Array.from(bytes.slice(0, 4)));   // [4, 3, 2, 1] on a little-endian CPU!

const dv = new DataView(buf);
dv.setUint16(4, 0xCAFE, false);            // false → big-endian ("network order")
console.log(dv.getUint8(4).toString(16), dv.getUint8(5).toString(16));   // ca fe
console.log(dv.getUint16(4, true).toString(16));   // feca — same bytes, other order

const small = new Uint8Array(1);
small[0] = 300;                             // wraps modulo 256
console.log(small[0]);
\`\`\`

**Endianness**: little-endian stores the *least* significant byte first (x86, ARM in practice); big-endian ("network byte order") stores the most significant first. Typed arrays use the **platform's** order; a \`DataView\` makes it explicit — always use it for file/network formats.

## Bitwise operators

JS converts operands to **32-bit signed integers** for \`& | ^ ~ << >> >>>\`:

| Op | Meaning | Common use |
|---|---|---|
| \`a & b\` | AND | test / clear bits: \`flags & MASK\` |
| \`a | b\` | OR | set bits |
| \`a ^ b\` | XOR | toggle bits, swap, parity |
| \`~a\` | NOT | invert: \`a & ~MASK\` clears |
| \`a << n\` / \`a >> n\` | shifts (\`>>\` keeps sign) | multiply/divide by 2ⁿ, extract fields |
| \`a >>> n\` | unsigned shift | treat as unsigned: \`x >>> 0\` |

\`\`\`js run
const READ = 1 << 0, WRITE = 1 << 1, EXEC = 1 << 2;
let perms = READ | WRITE;
console.log((perms & WRITE) !== 0, (perms & EXEC) !== 0);   // true false
perms |= EXEC;          // set
perms &= ~WRITE;        // clear
perms ^= READ;          // toggle
console.log(perms.toString(2).padStart(3, "0"));

console.log(0xFFFFFFFF | 0, 0xFFFFFFFF >>> 0);   // -1  4294967295  (signed vs unsigned view)
console.log(5 & -5, (7 >>> 1), 1 << 31);          // lowest set bit trick, shift, sign bit
\`\`\`

Handy tricks: \`x & (x - 1)\` clears the lowest set bit (popcount loop); \`x & -x\` isolates it; \`(x & (x - 1)) === 0\` tests power of two; \`x >>> 0\` forces unsigned.

:::warn
Numbers above 2³² lose bits in bitwise ops (they're truncated to 32 bits). For wide values use **BigInt** (\`1n << 40n\`) or split into high/low words. And remember integers are only exact up to 2⁵³ − 1 (\`Number.MAX_SAFE_INTEGER\`).
:::

## Compact structures

A **bitset** stores N booleans in N/32 words (32× smaller than an array of booleans, and set operations are word-wise). **Varints** (LEB128, used by protobuf and WebAssembly) store small integers in 1 byte and large ones in more: 7 data bits per byte, the high bit says "more bytes follow". A **ring buffer** over a typed array gives O(1) fixed-capacity queues with no allocation (audio, logging, metrics).

:::tip
Transfer big binary data between Workers with **transferables** (\`postMessage(buf, [buf])\`) to move instead of copy, and share with \`SharedArrayBuffer\` + \`Atomics\` for real parallelism (requires cross-origin isolation in browsers).
:::
`,
  quiz: [
    { q: 'What does `new Uint8Array([300])[0]` equal?', options: ['300', '255', '44', '0'], answer: 2, why: 'Values wrap modulo 256: 300 − 256 = 44.' },
    { q: 'You are parsing a network protocol that specifies big-endian integers. Which API makes that safe on any machine?', options: ['Uint32Array', 'DataView with littleEndian = false', 'Math.floor', 'Buffer.from'], answer: 1, why: 'DataView lets you choose endianness explicitly; typed arrays use the host\'s order.' },
    { q: 'Which expression clears bit 3 of `x`?', options: ['x | (1 << 3)', 'x & ~(1 << 3)', 'x ^ 3', 'x >> 3'], answer: 1, why: 'AND with the inverted mask zeroes just that bit.' },
    { q: '`0xFFFFFFFF | 0` is…', options: ['4294967295', '-1', '0', 'NaN'], answer: 1, why: 'Bitwise ops produce a *signed* 32-bit result; `>>> 0` would give the unsigned value.' },
  ],
  labs: [
    lab({
      id: 'adv11-bitset',
      title: 'Bitset',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['bits', 'typed-arrays'],
      prompt: `Implement \`class Bitset\` storing \`size\` bits in a **\`Uint32Array\`**:

- \`new Bitset(size)\` — all bits start at 0. \`size\` must be a non-negative integer.
- \`set(i)\`, \`clear(i)\`, \`toggle(i)\`, \`get(i)\` (returns \`true/false\`). Out-of-range indices throw a \`RangeError\`.
- \`count()\` — the number of 1 bits (use a bit trick, not a loop over every bit).
- \`union(other)\` and \`intersection(other)\` — return **new** bitsets of the same size.
- \`toArray()\` — ascending list of set indices.

Use bit operations (\`>>> 5\` to find the word, \`& 31\` for the bit within it); don't use arrays of booleans.`,
      expose: ['Bitset'],
      files: jsFile(
        `class Bitset {
  constructor(size) {
    this.size = size;
    this.words = new Uint32Array(Math.ceil(size / 32));
  }

  set(i) {}
  clear(i) {}
  toggle(i) {}
  get(i) {}
  count() {}
  union(other) {}
  intersection(other) {}
  toArray() {}
}
`,
        `class Bitset {
  constructor(size) {
    if (!Number.isInteger(size) || size < 0) throw new RangeError('size must be a non-negative integer');
    this.size = size;
    this.words = new Uint32Array(Math.ceil(size / 32));
  }

  check(i) {
    if (!Number.isInteger(i) || i < 0 || i >= this.size) throw new RangeError('index out of range: ' + i);
  }

  set(i) {
    this.check(i);
    this.words[i >>> 5] |= 1 << (i & 31);
    return this;
  }

  clear(i) {
    this.check(i);
    this.words[i >>> 5] &= ~(1 << (i & 31));
    return this;
  }

  toggle(i) {
    this.check(i);
    this.words[i >>> 5] ^= 1 << (i & 31);
    return this;
  }

  get(i) {
    this.check(i);
    return (this.words[i >>> 5] & (1 << (i & 31))) !== 0;
  }

  count() {
    let n = 0;
    for (let w of this.words) {
      while (w) {
        w &= w - 1;
        n++;
      }
    }
    return n;
  }

  union(other) {
    const r = new Bitset(this.size);
    for (let k = 0; k < this.words.length; k++) r.words[k] = this.words[k] | other.words[k];
    return r;
  }

  intersection(other) {
    const r = new Bitset(this.size);
    for (let k = 0; k < this.words.length; k++) r.words[k] = this.words[k] & other.words[k];
    return r;
  }

  toArray() {
    const out = [];
    for (let k = 0; k < this.words.length; k++) {
      let w = this.words[k];
      while (w) {
        const low = w & -w;
        out.push(k * 32 + (31 - Math.clz32(low)));
        w ^= low;
      }
    }
    return out;
  }
}
`
      ),
      tests: [
        ex('set / get / clear / toggle', ({ env, expect }) => {
          const b = new env.Bitset(100);
          b.set(0); b.set(31); b.set(32); b.set(99);
          expect([b.get(0), b.get(1), b.get(31), b.get(32), b.get(99)]).toEqual([true, false, true, true, true]);
          b.clear(31); b.toggle(1); b.toggle(0);
          expect([b.get(31), b.get(1), b.get(0)]).toEqual([false, true, false]);
        }),
        ex('count uses popcount over all words (including bit 31 of a word)', ({ env, expect }) => {
          const b = new env.Bitset(70);
          [0, 5, 31, 32, 63, 64, 69].forEach((i) => b.set(i));
          expect(b.count()).toBe(7);
        }),
        ex('toArray is ascending', ({ env, expect }) => {
          const b = new env.Bitset(100);
          [64, 3, 31, 99, 32, 0].forEach((i) => b.set(i));
          expect(b.toArray()).toEqual([0, 3, 31, 32, 64, 99]);
        }),
        ex('union and intersection return new bitsets', ({ env, expect }) => {
          const a = new env.Bitset(64); const c = new env.Bitset(64);
          [1, 2, 3, 40].forEach((i) => a.set(i)); [2, 3, 4, 40, 63].forEach((i) => c.set(i));
          expect(a.union(c).toArray()).toEqual([1, 2, 3, 4, 40, 63]);
          expect(a.intersection(c).toArray()).toEqual([2, 3, 40]);
          expect(a.toArray()).toEqual([1, 2, 3, 40]);
        }),
        ex('out-of-range indices throw RangeError', ({ env, expect }) => {
          const b = new env.Bitset(10);
          expect(() => b.set(10)).toThrow('range');
          expect(() => b.get(-1)).toThrow('range');
        }),
        ex('stored in a Uint32Array', ({ env, expect }) => {
          const b = new env.Bitset(64);
          const typed = Object.values(b).find((v) => v instanceof Uint32Array) as Uint32Array;
          expect(typed.length).toBe(2);
        }),
        hid('handles a million bits efficiently', async ({ env, expect, measure }) => {
          const b = new env.Bitset(1_000_000);
          const { steps } = await measure(() => { for (let i = 0; i < 1_000_000; i += 3) b.set(i); return b.count(); });
          expect(b.count()).toBe(333334);
          expect(steps).toBeLessThan(6_000_000);
        }),
      ],
      hints: ['Word index = `i >>> 5` (i / 32); bit index = `i & 31`.', 'set: `|= 1 << bit`; clear: `&= ~(1 << bit)`; toggle: `^= 1 << bit`; get: `(w & (1 << bit)) !== 0`.', 'popcount: `while (w) { w &= w - 1; n++; }` — each iteration removes the lowest set bit.', '`toArray`: isolate the lowest bit with `w & -w`, find its index with `31 - Math.clz32(low)`.'],
    }),

    lab({
      id: 'adv11-varint',
      title: 'LEB128 varints',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['bits', 'encoding'],
      prompt: `Protocol Buffers and WebAssembly encode integers as **unsigned LEB128 varints**: split the number into 7-bit groups, **least-significant group first**; set the high bit (0x80) on every byte except the last.

Examples: \`1\` → \`[0x01]\`; \`127\` → \`[0x7F]\`; \`128\` → \`[0x80, 0x01]\`; \`300\` → \`[0xAC, 0x02]\`.

Implement:
- \`encodeVarint(n)\` → \`Uint8Array\` (for any safe integer \`0 <= n <= 2^53 - 1\`; throw \`RangeError\` otherwise). *Careful: bitwise operators only work on 32 bits — use \`%\` and \`Math.floor\` for big numbers.*
- \`decodeVarint(bytes, offset = 0)\` → \`{ value, bytesRead }\`. Throw \`RangeError\` if the input ends in the middle of a number.`,
      expose: ['encodeVarint', 'decodeVarint'],
      files: jsFile(
        `function encodeVarint(n) {
  
}

function decodeVarint(bytes, offset = 0) {
  
}
`,
        `function encodeVarint(n) {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('value must be a safe non-negative integer');
  const out = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 0x80;
    out.push(byte);
  } while (n > 0);
  return Uint8Array.from(out);
}

function decodeVarint(bytes, offset = 0) {
  let value = 0;
  let scale = 1;
  let i = offset;
  for (;;) {
    if (i >= bytes.length) throw new RangeError('unexpected end of input');
    const b = bytes[i++];
    value += (b & 0x7f) * scale;
    if ((b & 0x80) === 0) break;
    scale *= 128;
  }
  return { value, bytesRead: i - offset };
}
`
      ),
      tests: [
        ex('encodes the documented examples', ({ env, expect }) => {
          expect(Array.from(env.encodeVarint(0))).toEqual([0]);
          expect(Array.from(env.encodeVarint(1))).toEqual([1]);
          expect(Array.from(env.encodeVarint(127))).toEqual([0x7f]);
          expect(Array.from(env.encodeVarint(128))).toEqual([0x80, 0x01]);
          expect(Array.from(env.encodeVarint(300))).toEqual([0xac, 0x02]);
        }),
        ex('returns a Uint8Array', ({ env, expect }) => expect(env.encodeVarint(5)).toBeInstanceOf(Uint8Array)),
        ex('decodes with value and bytesRead', ({ env, expect }) => {
          expect(env.decodeVarint(Uint8Array.from([0xac, 0x02]))).toEqual({ value: 300, bytesRead: 2 });
        }),
        ex('decodes starting at an offset (several numbers in one buffer)', ({ env, expect }) => {
          const buf = Uint8Array.from([...env.encodeVarint(1), ...env.encodeVarint(70000), ...env.encodeVarint(5)]);
          const a = env.decodeVarint(buf, 0);
          const b = env.decodeVarint(buf, a.bytesRead);
          const c = env.decodeVarint(buf, a.bytesRead + b.bytesRead);
          expect([a.value, b.value, c.value]).toEqual([1, 70000, 5]);
        }),
        ex('handles numbers beyond 32 bits', ({ env, expect }) => {
          const big = 2 ** 40 + 12345;
          expect(env.decodeVarint(env.encodeVarint(big)).value).toBe(big);
          expect(env.decodeVarint(env.encodeVarint(Number.MAX_SAFE_INTEGER)).value).toBe(Number.MAX_SAFE_INTEGER);
        }),
        ex('rejects invalid input', ({ env, expect }) => {
          expect(() => env.encodeVarint(-1)).toThrow('non-negative');
          expect(() => env.encodeVarint(1.5)).toThrow('integer');
          expect(() => env.decodeVarint(Uint8Array.from([0x80, 0x80]))).toThrow('end');
        }),
        prop_roundtrip(),
        hid('uses the minimum number of bytes', ({ env, expect }) => {
          expect(env.encodeVarint(16383).length).toBe(2);
          expect(env.encodeVarint(16384).length).toBe(3);
        }),
      ],
      hints: ['Loop: take `n % 128` as the low 7 bits, then `n = Math.floor(n / 128)`; if more remains, OR in `0x80`.', 'Do-while so that 0 produces one byte.', 'Decoding: `value += (byte & 0x7f) * scale; scale *= 128;` and stop when the high bit is clear. Using multiplication instead of `<<` keeps it correct above 2³¹.'],
    }),

    lab({
      id: 'adv11-record-codec',
      title: 'A binary record codec with DataView',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['dataview', 'endianness'],
      prompt: `A sensor sends 12-byte packets. Layout (offsets in bytes):

| Offset | Size | Field | Type / endianness |
|---|---|---|---|
| 0 | 1 | \`version\` | unsigned 8-bit |
| 1 | 2 | \`id\` | unsigned 16-bit, **big-endian** |
| 3 | 4 | \`temperature\` | 32-bit float, **little-endian** |
| 7 | 4 | \`timestamp\` | unsigned 32-bit, **big-endian** |
| 11 | 1 | \`flags\` | bit 0 = \`active\`, bit 1 = \`error\`, bit 2 = \`lowBattery\` |

Implement \`packRecord({ version, id, temperature, timestamp, active, error, lowBattery })\` → \`ArrayBuffer\` (12 bytes) and \`unpackRecord(buffer)\` → the same object shape (booleans for flags). \`unpackRecord\` must throw a \`RangeError\` if the buffer is not exactly 12 bytes.`,
      expose: ['packRecord', 'unpackRecord'],
      files: jsFile(
        `function packRecord(rec) {
  
}

function unpackRecord(buffer) {
  
}
`,
        `function packRecord(rec) {
  const buf = new ArrayBuffer(12);
  const dv = new DataView(buf);
  dv.setUint8(0, rec.version);
  dv.setUint16(1, rec.id, false);
  dv.setFloat32(3, rec.temperature, true);
  dv.setUint32(7, rec.timestamp, false);
  dv.setUint8(11, (rec.active ? 1 : 0) | (rec.error ? 2 : 0) | (rec.lowBattery ? 4 : 0));
  return buf;
}

function unpackRecord(buffer) {
  if (buffer.byteLength !== 12) throw new RangeError('expected a 12-byte record');
  const dv = new DataView(buffer);
  const flags = dv.getUint8(11);
  return {
    version: dv.getUint8(0),
    id: dv.getUint16(1, false),
    temperature: dv.getFloat32(3, true),
    timestamp: dv.getUint32(7, false),
    active: (flags & 1) !== 0,
    error: (flags & 2) !== 0,
    lowBattery: (flags & 4) !== 0,
  };
}
`
      ),
      tests: [
        ex('produces the exact bytes (endianness check)', ({ env, expect }) => {
          const buf = env.packRecord({ version: 2, id: 0x1234, temperature: 1.5, timestamp: 0xdeadbeef, active: true, error: false, lowBattery: true });
          expect(buf.byteLength).toBe(12);
          const b = Array.from(new Uint8Array(buf));
          expect(b.slice(0, 3)).toEqual([2, 0x12, 0x34]); // id big-endian
          expect(b.slice(3, 7)).toEqual([0x00, 0x00, 0xc0, 0x3f]); // 1.5f little-endian
          expect(b.slice(7, 11)).toEqual([0xde, 0xad, 0xbe, 0xef]);
          expect(b[11]).toBe(0b101);
        }),
        ex('unpacks known bytes', ({ env, expect }) => {
          const bytes = Uint8Array.from([1, 0, 7, 0x00, 0x00, 0x20, 0xc1, 0, 0, 1, 0, 0b010]);
          const r = env.unpackRecord(bytes.buffer);
          expect(r).toEqual({ version: 1, id: 7, temperature: -10, timestamp: 256, active: false, error: true, lowBattery: false });
        }),
        ex('round trip', ({ env, expect }) => {
          const rec = { version: 255, id: 65535, temperature: -273.25, timestamp: 4294967295, active: true, error: true, lowBattery: true };
          expect(env.unpackRecord(env.packRecord(rec))).toEqual(rec);
        }),
        ex('rejects wrong sizes', ({ env, expect }) => {
          expect(() => env.unpackRecord(new ArrayBuffer(11))).toThrow('12');
          expect(() => env.unpackRecord(new ArrayBuffer(13))).toThrow('12');
        }),
        hid('flags are independent bits', ({ env, expect }) => {
          for (const [a, e, l] of [[false, false, false], [true, false, false], [false, true, false], [false, false, true], [true, true, false]]) {
            const rec = { version: 1, id: 1, temperature: 0, timestamp: 1, active: a, error: e, lowBattery: l };
            expect(env.unpackRecord(env.packRecord(rec))).toEqual(rec);
          }
        }),
      ],
      hints: ['Create `new ArrayBuffer(12)` and a `DataView` on it.', '`dv.setUint16(1, id, false)` — the last argument is `littleEndian`; `false` means big-endian.', 'Flags: `(active ? 1 : 0) | (error ? 2 : 0) | (lowBattery ? 4 : 0)`; read them with `& 1`, `& 2`, `& 4`.'],
    }),

    lab({
      id: 'adv11-ring',
      title: 'A fixed-capacity ring buffer',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['typed-arrays', 'data-structures'],
      prompt: `Implement \`class RingBuffer\` backed by a **\`Float64Array\`** of fixed \`capacity\`:

- \`push(x)\` — append. When full, **overwrite the oldest** value.
- \`shift()\` — remove and return the oldest value (\`undefined\` when empty).
- \`peek()\` — oldest value without removing (\`undefined\` when empty).
- \`length\` (getter), \`capacity\`, \`toArray()\` (oldest → newest).
- Every operation must be **O(1)** — no array shifting, no allocation per push. (Keep a \`head\` index and a \`length\`.)`,
      expose: ['RingBuffer'],
      files: jsFile(
        `class RingBuffer {
  constructor(capacity) {
    this.capacity = capacity;
    this.data = new Float64Array(capacity);
  }

  push(x) {}
  shift() {}
  peek() {}
  get length() {
    return 0;
  }
  toArray() {}
}
`,
        `class RingBuffer {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be a positive integer');
    this.capacity = capacity;
    this.data = new Float64Array(capacity);
    this.head = 0;
    this.count = 0;
  }

  push(x) {
    const tail = (this.head + this.count) % this.capacity;
    this.data[tail] = x;
    if (this.count < this.capacity) this.count++;
    else this.head = (this.head + 1) % this.capacity;
  }

  shift() {
    if (this.count === 0) return undefined;
    const v = this.data[this.head];
    this.head = (this.head + 1) % this.capacity;
    this.count--;
    return v;
  }

  peek() {
    return this.count === 0 ? undefined : this.data[this.head];
  }

  get length() {
    return this.count;
  }

  toArray() {
    const out = [];
    for (let i = 0; i < this.count; i++) out.push(this.data[(this.head + i) % this.capacity]);
    return out;
  }
}
`
      ),
      tests: [
        ex('FIFO behaviour', ({ env, expect }) => {
          const r = new env.RingBuffer(3);
          r.push(1); r.push(2); r.push(3);
          expect([r.shift(), r.shift(), r.length]).toEqual([1, 2, 1]);
          expect(r.peek()).toBe(3);
        }),
        ex('overwrites the oldest when full', ({ env, expect }) => {
          const r = new env.RingBuffer(3);
          [1, 2, 3, 4, 5].forEach((x) => r.push(x));
          expect(r.toArray()).toEqual([3, 4, 5]);
          expect(r.length).toBe(3);
        }),
        ex('empty buffer', ({ env, expect }) => {
          const r = new env.RingBuffer(2);
          expect([r.shift(), r.peek(), r.length, r.toArray()]).toEqual([undefined, undefined, 0, []]);
        }),
        ex('wraps around correctly over many cycles', ({ env, expect }) => {
          const r = new env.RingBuffer(4);
          for (let i = 0; i < 100; i++) { r.push(i); if (i % 3 === 0) r.shift(); }
          const arr = r.toArray();
          expect(arr.length).toBe(r.length);
          expect(arr[arr.length - 1]).toBe(99);
          expect([...arr].sort((a, b) => a - b)).toEqual(arr);
        }),
        ex('is backed by a Float64Array', ({ env, expect }) => {
          const r = new env.RingBuffer(5);
          expect(Object.values(r).some((v) => v instanceof Float64Array)).toBe(true);
        }),
        prop_ring(),
        perf('push and shift are O(1)', async ({ env, expect, measure }) => {
          const r = new env.RingBuffer(1000);
          const { steps } = await measure(() => { for (let i = 0; i < 50000; i++) { r.push(i); if (i % 2) r.shift(); } });
          expect(steps).toBeLessThan(50000 * 4);
        }),
      ],
      hints: ['State: `data`, `head` (index of the oldest), `count`.', 'Tail slot for a push = `(head + count) % capacity`. If already full, advance `head` instead of growing `count`.', '`shift` reads `data[head]`, advances `head` modulo capacity and decrements `count`.'],
    }),
  ],
  references: [
    { title: 'MDN — JavaScript typed arrays', url: 'https://developer.mozilla.org/docs/Web/JavaScript/Guide/Typed_arrays' },
    { title: 'Protocol Buffers — Encoding (varints)', url: 'https://protobuf.dev/programming-guides/encoding/' },
  ],
};

import type { TestSpec } from '../../core/types';
function prop_roundtrip(): TestSpec {
  return {
    name: 'property: decode(encode(n)) === n',
    kind: 'property',
    run: async ({ env, forAll, gen, expect }) => {
      await forAll([gen.int(0, 2 ** 31)], (n: number) => {
        expect(env.decodeVarint(env.encodeVarint(n)).value).toBe(n);
        expect(env.decodeVarint(env.encodeVarint(n * 1024 + 7)).value).toBe(n * 1024 + 7);
      }, { runs: 200 });
    },
  };
}
function prop_ring(): TestSpec {
  return {
    name: 'property: behaves like a bounded queue model',
    kind: 'property',
    run: async ({ env, forAll, gen, expect }) => {
      await forAll([gen.array(gen.int(-5, 20), 0, 60)], (ops: number[]) => {
        const r = new env.RingBuffer(4);
        const model: number[] = [];
        for (const op of ops) {
          if (op < 0) expect(r.shift()).toBe(model.shift());
          else { r.push(op); model.push(op); if (model.length > 4) model.shift(); }
          expect(r.toArray()).toEqual(model);
        }
      });
    },
  };
}
export default mod;
