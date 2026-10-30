import type { Module } from '../../core/types';
import { ex, prop, perf, hid, struct, lab, jsFile } from '../helpers';

const mod: Module = {
  id: 'hashing',
  course: 'algos',
  title: 'Hashing: Maps, Sets & Hash Table Internals',
  minutes: 45,
  objectives: [
    'Explain how a hash table works: hash function, buckets, collisions, load factor and resizing',
    'Choose between `Map`, `Set`, object and array for counting, grouping and membership',
    'Use canonical keys (sorted strings, count signatures) to group equivalent things',
    'Implement a hash map from scratch and reason about its amortised O(1) behaviour',
  ],
  body: `
## What a hash table gives you

A hash table maps **keys → values** with **O(1) average** insert, lookup and delete. Almost every optimisation in this course starts with: *"can I replace this scan with a lookup?"*

**How it works**

1. A **hash function** turns the key into an integer, e.g. \`hash("cat") = 98262\`.
2. The integer is reduced to a **bucket index**: \`index = hash % capacity\`.
3. Items live in the bucket. Different keys can land in the same bucket — a **collision**. Two main strategies:
   - **Separate chaining:** each bucket holds a small list of entries; lookup scans the list.
   - **Open addressing:** on collision, probe other slots (linear / quadratic / double hashing).
4. The **load factor** \`size / capacity\` measures fullness. When it passes a threshold (≈ 0.75) the table **resizes** (doubles capacity and re-inserts everything). A resize is O(n) but rare → **amortised O(1)**.

\`\`\`js run
// A tiny string hash (djb2) and bucket index
const hash = (s) => { let h = 5381; for (const c of s) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h; };
for (const w of ["cat", "act", "dog"]) console.log(w, hash(w), "bucket", hash(w) % 8);
\`\`\`

**Good hash functions** spread keys uniformly and make small changes flip many bits. With a bad one (everything in one bucket) operations degrade to O(n). Attackers exploit this ("hash flooding"), so production tables randomise the hash seed.

## JavaScript's tools

| Structure | Keys | Notes |
|---|---|---|
| \`Map\` | any value (including objects, NaN) | preserves insertion order; \`size\`; best for counting/lookup |
| \`Set\` | any value | membership, dedupe; O(1) \`has\` |
| plain object \`{}\` | strings/symbols | prototype pitfalls (\`"constructor"\`, \`"__proto__"\`); use \`Object.create(null)\` or a Map |
| array | integers \`0..n\` | when keys are small ints (counting letters: \`new Array(26)\`) |

\`\`\`js run
// Counting with Map
const count = new Map();
for (const w of "the cat and the hat and the bat".split(" ")) count.set(w, (count.get(w) ?? 0) + 1);
console.log([...count]);

// Object keys are strings: 1 and "1" collide, and "__proto__" is special
const o = {}; o[1] = "a"; o["1"] = "b";
console.log(Object.keys(o), o[1]);
const m = new Map(); m.set(1, "a"); m.set("1", "b");
console.log(m.size);
\`\`\`

## Canonical keys: grouping things that are "the same"

To group anagrams you need a key that is *identical for every anagram*: the **sorted letters** (\`"eat" → "aet"\`) or a **count signature** (\`[1,0,0,0,1,...,1]\` → \`"1#0#0…"\`). The pattern: *map each item to a canonical form, then bucket by that form.* Also used for isomorphic strings, duplicate files (hash of contents), de-duplicating records.

## Common patterns

- **Frequency counting** — anagrams, majority element, top-k frequent, first unique character.
- **Seen-before / complement lookup** — two-sum, duplicates, cycle detection with a Set.
- **Index remembering** — last-seen position for sliding windows.
- **Prefix-sum + hash map** — count subarrays (previous module).
- **Hash set for O(1) membership in set-style problems** — longest consecutive sequence: only start counting at numbers that have no predecessor in the set.

\`\`\`js run
// Longest consecutive run in O(n): start only at sequence beginnings
function longestConsecutive(nums) {
  const set = new Set(nums);
  let best = 0;
  for (const x of set) {
    if (set.has(x - 1)) continue;          // not a start
    let len = 1;
    while (set.has(x + len)) len++;
    best = Math.max(best, len);
  }
  return best;
}
console.log(longestConsecutive([100, 4, 200, 1, 3, 2]));
\`\`\`

:::warn
**Keys must be comparable by identity or value as you expect.** \`Map\` compares objects by *reference*: \`map.get([1,2])\` will not find a key stored with a different \`[1,2]\` array. Serialise to a string (\`JSON.stringify\`, \`"1,2"\`) for composite keys.
:::

:::deep
**Beyond hash tables.** When keys need ordering use a balanced BST/skip list/B-tree (O(log n)). For memory-tight approximate membership use a **Bloom filter**; for consistent distribution across servers use **consistent hashing** (Course 2).
:::
`,
  quiz: [
    { q: 'What happens when the load factor of a chained hash table grows large?', options: ['Nothing', 'Chains get long and operations slow towards O(n) unless the table resizes', 'Keys are deleted', 'The hash function changes'], answer: 1, why: 'More entries per bucket means longer scans; resizing restores short chains.' },
    { q: 'Why is a hash table insert "amortised O(1)" even though resizing is O(n)?', options: ['Resizing never happens', 'Resizes are rare and double the capacity, so the cost per insert averages out', 'The table uses a tree internally', 'JS has no resizing'], answer: 1, why: 'Doubling gives a geometric series: total resize work over n inserts is O(n).' },
    { q: 'What is a good canonical key to group anagrams?', options: ['The word length', 'The word\'s letters sorted alphabetically', 'The first letter', 'The word reversed'], answer: 1, why: 'All anagrams share the same sorted letters.' },
    { q: 'Why can `map.get([1, 2])` fail to find a value stored under `[1, 2]`?', options: ['Maps only take strings', 'Object/array keys are compared by reference, not by value', 'Arrays are immutable', 'The map is full'], answer: 1, why: 'Two different array objects are different keys.' },
  ],
  labs: [
    lab({
      id: 'algo3-group-anagrams',
      title: 'Group anagrams',
      kind: 'code',
      difficulty: 2,
      minutes: 12,
      tags: ['hashing', 'strings'],
      interview: true,
      prompt: `\`groupAnagrams(words)\` — return an array of groups; each group holds words that are anagrams of each other. Order: **groups in order of their first member's appearance**, and **words inside a group in input order**. Words are lowercase letters (possibly empty strings).`,
      expose: ['groupAnagrams'],
      files: jsFile(`function groupAnagrams(words) {\n  \n}\n`, `function groupAnagrams(words) {
  const groups = new Map();
  for (const w of words) {
    const key = w.split('').sort().join('');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  }
  return [...groups.values()];
}
`),
      tests: [
        ex('classic example', ({ env, expect }) => {
          expect(env.groupAnagrams(['eat', 'tea', 'tan', 'ate', 'nat', 'bat'])).toEqual([['eat', 'tea', 'ate'], ['tan', 'nat'], ['bat']]);
        }),
        ex('edge cases', ({ env, expect }) => {
          expect(env.groupAnagrams([])).toEqual([]);
          expect(env.groupAnagrams([''])).toEqual([['']]);
          expect(env.groupAnagrams(['a'])).toEqual([['a']]);
          expect(env.groupAnagrams(['', 'b', ''])).toEqual([['', ''], ['b']]);
        }),
        prop('property: every group is internally anagram-equal and groups are disjoint covers', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.string(4, 'abc'), 0, 14)], (ws: string[]) => {
            const groups: string[][] = env.groupAnagrams(ws);
            const flat = groups.flat();
            expect([...flat].sort()).toEqual([...ws].sort());
            for (const g of groups) { const k = g[0].split('').sort().join(''); expect(g.every((w) => w.split('').sort().join('') === k)).toBe(true); }
            const keys = groups.map((g) => g[0].split('').sort().join(''));
            expect(new Set(keys).size).toBe(keys.length);
          });
        }),
        perf('handles 20,000 words', async ({ env, expect, measure, rng }) => {
          const r = rng(9);
          const ws = Array.from({ length: 20000 }, () => Array.from({ length: 6 }, () => String.fromCharCode(97 + r.int(0, 5))).join(''));
          const { steps } = await measure(() => env.groupAnagrams(ws), { budget: 5_000_000 });
          expect(steps).toBeLessThan(500_000);
        }),
      ],
      hints: ['Two words are anagrams exactly when their sorted letters are equal — that is the canonical key.', 'Use a `Map` from key to array of words; a `Map` remembers insertion order, which gives you the required group order for free.'],
    }),

    lab({
      id: 'algo3-hashmap',
      title: 'Build a hash map',
      kind: 'code',
      difficulty: 4,
      minutes: 35,
      tags: ['hashing', 'data-structures'],
      interview: true,
      prompt: `Implement \`class HashMap\` **without using \`Map\`, \`Set\` or object-as-dictionary** — only arrays:

- Keys are **strings or numbers** (\`1\` and \`"1"\` are different keys). Implement your own hash function (\`charCodeAt\`, a multiplicative hash).
- \`put(key, value)\` (insert or update), \`get(key)\` (→ value or \`undefined\`), \`has(key)\`, \`delete(key)\` (→ boolean), \`size\` (getter), \`keys()\` (array, any order).
- Use **separate chaining** (an array of buckets, each a small array of \`[key, value]\` entries).
- **Resize**: start with 8 buckets and double the bucket count when \`size / buckets > 0.75\`, re-inserting entries. Expose the bucket count as \`capacity\` (getter).`,
      expose: ['HashMap'],
      files: jsFile(`class HashMap {
  constructor() {
    this.buckets = new Array(8).fill(null).map(() => []);
    this.count = 0;
  }

  get size() {
    return this.count;
  }

  get capacity() {
    return this.buckets.length;
  }

  hash(key) {}
  put(key, value) {}
  get(key) {}
  has(key) {}
  delete(key) {}
  keys() {}
}
`, `class HashMap {
  constructor() {
    this.buckets = new Array(8).fill(null).map(() => []);
    this.count = 0;
  }

  get size() {
    return this.count;
  }

  get capacity() {
    return this.buckets.length;
  }

  hash(key) {
    const s = (typeof key === 'number' ? 'n:' : 's:') + String(key);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % this.buckets.length;
  }

  find(key) {
    const bucket = this.buckets[this.hash(key)];
    for (let i = 0; i < bucket.length; i++) if (bucket[i][0] === key) return [bucket, i];
    return [bucket, -1];
  }

  put(key, value) {
    const [bucket, i] = this.find(key);
    if (i >= 0) {
      bucket[i][1] = value;
      return;
    }
    bucket.push([key, value]);
    this.count++;
    if (this.count / this.buckets.length > 0.75) this.resize();
  }

  resize() {
    const old = this.buckets;
    this.buckets = new Array(old.length * 2).fill(null).map(() => []);
    for (const bucket of old) for (const [k, v] of bucket) this.buckets[this.hash(k)].push([k, v]);
  }

  get(key) {
    const [bucket, i] = this.find(key);
    return i >= 0 ? bucket[i][1] : undefined;
  }

  has(key) {
    return this.find(key)[1] >= 0;
  }

  delete(key) {
    const [bucket, i] = this.find(key);
    if (i < 0) return false;
    bucket.splice(i, 1);
    this.count--;
    return true;
  }

  keys() {
    const out = [];
    for (const bucket of this.buckets) for (const [k] of bucket) out.push(k);
    return out;
  }
}
`),
      tests: [
        ex('put / get / has', ({ env, expect }) => {
          const m = new env.HashMap();
          m.put('a', 1); m.put('b', 2);
          expect([m.get('a'), m.get('b'), m.get('zzz'), m.has('a'), m.has('zzz'), m.size]).toEqual([1, 2, undefined, true, false, 2]);
        }),
        ex('put updates an existing key without growing', ({ env, expect }) => {
          const m = new env.HashMap();
          m.put('k', 1); m.put('k', 2);
          expect([m.get('k'), m.size]).toEqual([2, 1]);
        }),
        ex('numbers and strings are different keys', ({ env, expect }) => {
          const m = new env.HashMap();
          m.put(1, 'number'); m.put('1', 'string');
          expect([m.get(1), m.get('1'), m.size]).toEqual(['number', 'string', 2]);
        }),
        ex('delete', ({ env, expect }) => {
          const m = new env.HashMap();
          m.put('x', 1);
          expect([m.delete('x'), m.delete('x'), m.has('x'), m.size]).toEqual([true, false, false, 0]);
        }),
        ex('can store undefined and falsy values', ({ env, expect }) => {
          const m = new env.HashMap();
          m.put('u', undefined); m.put('z', 0);
          expect([m.has('u'), m.get('z'), m.size]).toEqual([true, 0, 2]);
        }),
        ex('resizes: capacity doubles when load factor passes 0.75, nothing is lost', ({ env, expect }) => {
          const m = new env.HashMap();
          expect(m.capacity).toBe(8);
          for (let i = 0; i < 6; i++) m.put('k' + i, i);
          expect(m.capacity).toBe(8);
          m.put('k6', 6);
          expect(m.capacity).toBe(16);
          for (let i = 0; i < 100; i++) m.put('k' + i, i);
          expect(m.capacity).toBeGreaterThanOrEqual(128);
          for (let i = 0; i < 100; i++) expect(m.get('k' + i)).toBe(i);
          expect(m.size).toBe(100);
        }),
        prop('property: behaves exactly like a Map', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(0, 40), 0, 80)], (ops: number[]) => {
            const m = new env.HashMap();
            const model = new Map<string, number>();
            ops.forEach((op, i) => {
              const key = 'k' + (op % 10);
              if (op % 3 === 0) { expect(m.delete(key)).toBe(model.delete(key)); }
              else { m.put(key, i); model.set(key, i); }
              expect(m.get(key)).toBe(model.get(key));
              expect(m.size).toBe(model.size);
            });
            expect([...m.keys()].sort()).toEqual([...model.keys()].sort());
          });
        }),
        perf('20,000 inserts and lookups stay near O(1) each', async ({ env, expect, measure }) => {
          const m = new env.HashMap();
          const { steps } = await measure(() => {
            for (let i = 0; i < 20000; i++) m.put('key' + i, i);
            let s = 0;
            for (let i = 0; i < 20000; i++) s += m.get('key' + i);
            return s;
          }, { budget: 40_000_000 });
          expect(steps).toBeLessThan(20000 * 2 * 70);
        }),
        hid('no Map, Set or object dictionary inside', ({ code, expect }) => expect(/new\s+(Map|Set|WeakMap)\b|Object\s*\.\s*(create|keys|entries)/.test(code)).toBe(false), 'structural'),
      ],
      hints: [
        'A hash function: `let h = 0; for each char: h = (h * 31 + code) | 0;` then `Math.abs(h) % buckets.length`. Hash numbers and strings differently (prefix a type tag) so `1` and `"1"` don\'t collide as keys.',
        'Write a `find(key)` helper returning the bucket and the index of the entry in it (or -1) — `put`, `get`, `has`, `delete` all use it.',
        'After inserting a **new** key, if `count / buckets.length > 0.75`, build a new bucket array of double size and re-insert every entry (the bucket index changes because the length changed!).',
      ],
      why: 'Knowing the internals lets you answer "what happens when…" questions: collisions, resizing cost, iteration order, hash-flooding attacks.',
    }),

    lab({
      id: 'algo3-longest-consecutive',
      title: 'Longest consecutive sequence',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['hashing', 'sets'],
      interview: true,
      prompt: `\`longestConsecutive(nums)\` — the length of the longest run of consecutive integers (like \`1,2,3,4\`) that appear anywhere in the unsorted array (order in the array doesn't matter; duplicates are ignored). Required: **O(n)** time — sorting is not allowed.`,
      expose: ['longestConsecutive'],
      files: jsFile(`function longestConsecutive(nums) {\n  \n}\n`, `function longestConsecutive(nums) {
  const set = new Set(nums);
  let best = 0;
  for (const x of set) {
    if (set.has(x - 1)) continue;
    let len = 1;
    while (set.has(x + len)) len++;
    if (len > best) best = len;
  }
  return best;
}
`),
      tests: [
        ex('examples', ({ env, expect }) => {
          expect(env.longestConsecutive([100, 4, 200, 1, 3, 2])).toBe(4);
          expect(env.longestConsecutive([0, 3, 7, 2, 5, 8, 4, 6, 0, 1])).toBe(9);
        }),
        ex('edge cases', ({ env, expect }) => {
          expect(env.longestConsecutive([])).toBe(0);
          expect(env.longestConsecutive([5])).toBe(1);
          expect(env.longestConsecutive([1, 1, 1])).toBe(1);
          expect(env.longestConsecutive([-2, -1, 0, 1])).toBe(4);
        }),
        prop('property: matches the sort-based answer', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-15, 15), 0, 20)], (xs: number[]) => {
            const u = [...new Set(xs)].sort((a, b) => a - b);
            let best = 0, run = 0;
            u.forEach((v, i) => { run = i > 0 && v === u[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); });
            expect(env.longestConsecutive(xs)).toBe(best);
          });
        }),
        perf('linear: 100,000 values, one long run', async ({ env, expect, measure, rng }) => {
          const nums = rng(2).shuffle(Array.from({ length: 100000 }, (_, i) => i));
          const { value, steps } = await measure(() => env.longestConsecutive(nums), { budget: 4_000_000 });
          expect(value).toBe(100000);
          expect(steps).toBeLessThan(600_000);
        }),
        hid('no sorting', ({ code, expect }) => expect(/\.\s*sort\s*\(/.test(code)).toBe(false), 'structural'),
      ],
      hints: ['Put everything in a `Set` so membership is O(1).', 'Only start counting from numbers `x` for which `x - 1` is **not** in the set — those are run starts.', 'From a start, walk `x+1, x+2, …` while they are present. Each number is visited once overall.'],
    }),

    lab({
      id: 'algo3-top-k',
      title: 'Top K frequent elements',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['hashing', 'sorting'],
      interview: true,
      prompt: `\`topKFrequent(nums, k)\` — return the \`k\` most frequent values, ordered by **frequency descending**, ties broken by **smaller value first**. (\`k\` is at most the number of distinct values.) O(n log n) or better is expected.`,
      expose: ['topKFrequent'],
      files: jsFile(`function topKFrequent(nums, k) {\n  \n}\n`, `function topKFrequent(nums, k) {
  const freq = new Map();
  for (const x of nums) freq.set(x, (freq.get(x) ?? 0) + 1);
  const entries = [...freq.entries()];
  entries.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return entries.slice(0, k).map(([v]) => v);
}
`),
      tests: [
        ex('examples', ({ env, expect }) => {
          expect(env.topKFrequent([1, 1, 1, 2, 2, 3], 2)).toEqual([1, 2]);
          expect(env.topKFrequent([1], 1)).toEqual([1]);
        }),
        ex('ties are broken by the smaller value', ({ env, expect }) => {
          expect(env.topKFrequent([4, 4, 3, 3, 9, 9, 1], 3)).toEqual([3, 4, 9]);
          expect(env.topKFrequent([5, 2, 8], 2)).toEqual([2, 5]);
        }),
        ex('negative numbers', ({ env, expect }) => expect(env.topKFrequent([-1, -1, 2, 2, 2, -5], 2)).toEqual([2, -1])),
        prop('property: equals a sort-based reference', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-5, 5), 1, 25), gen.nat(5)], (xs: number[], k0: number) => {
            const f = new Map<number, number>();
            xs.forEach((x) => f.set(x, (f.get(x) ?? 0) + 1));
            const k = 1 + (k0 % f.size);
            const want = [...f].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, k).map((e) => e[0]);
            expect(env.topKFrequent(xs, k)).toEqual(want);
          });
        }),
        perf('100,000 numbers with 5,000 distinct values', async ({ env, expect, measure, rng }) => {
          const r = rng(4);
          const a = Array.from({ length: 100000 }, () => r.int(0, 4999));
          const { steps } = await measure(() => env.topKFrequent(a, 10), { budget: 8_000_000 });
          expect(steps).toBeLessThan(3_000_000);
        }),
      ],
      hints: ['First count frequencies with a `Map`.', 'Then sort the `[value, count]` pairs by `count` descending, then `value` ascending, and take `k`.', '(Follow-up: bucket sort by frequency gives O(n); a size-k min-heap gives O(n log k).)'],
    }),
  ],
  references: [
    { title: 'MIT 6.006 — Hashing lectures', url: 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/' },
    { title: 'Crosby & Wallach — Denial of Service via Algorithmic Complexity Attacks (hash flooding)' },
  ],
};
export default mod;
