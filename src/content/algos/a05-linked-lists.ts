import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';

/** Test helpers for singly linked lists: nodes are { val, next }. */
interface N { val: number; next: N | null }
const list = (xs: number[]): N | null => { let head: N | null = null; for (let i = xs.length - 1; i >= 0; i--) head = { val: xs[i], next: head }; return head; };
const arr = (h: N | null, limit = 100000): number[] => { const out: number[] = []; while (h && out.length < limit) { out.push(h.val); h = h.next; } return out; };
const nodes = (h: N | null): N[] => { const out: N[] = []; while (h && out.length < 100000) { out.push(h); h = h.next; } return out; };

const mod: Module = {
  id: 'linked-lists',
  course: 'algos',
  title: 'Linked Lists: Pointers, Fast/Slow & In-Place Surgery',
  minutes: 40,
  objectives: [
    'Manipulate `next` pointers safely (save before you overwrite)',
    'Use a dummy head to remove special cases',
    'Detect and locate cycles with Floyd\'s fast/slow pointers in O(1) space',
    'Reverse and merge lists in place',
  ],
  body: `
## What a linked list is

A **singly linked list** is a chain of nodes \`{ val, next }\`; the list is the reference to the first node (the **head**). Compared with arrays:

| | Array | Linked list |
|---|---|---|
| Access by index | O(1) | O(n) |
| Insert/delete at a known node | O(n) shift | O(1) |
| Insert at front | O(n) | O(1) |
| Memory | contiguous, cache-friendly | scattered, pointer overhead |

In practice arrays win on modern hardware, which is why interviews use lists to test **pointer manipulation**, not because you should use them everywhere (they're the basis of LRU caches, free lists, adjacency lists, queues).

\`\`\`js run
const node = (val, next = null) => ({ val, next });
const head = node(1, node(2, node(3)));
const toArray = (h) => { const out = []; for (; h; h = h.next) out.push(h.val); return out; };
console.log(toArray(head));
\`\`\`

## Rule 1: save, then overwrite

Rewiring a pointer *loses* the old target. Before changing \`node.next\`, store what you'll need:

\`\`\`js run
// Reverse a list in place: O(n) time, O(1) space
function reverse(head) {
  let prev = null, cur = head;
  while (cur) {
    const next = cur.next;     // 1. remember the rest
    cur.next = prev;           // 2. flip this link
    prev = cur;                // 3. advance both pointers
    cur = next;
  }
  return prev;                 // new head
}
const toArray = (h) => { const o = []; for (; h; h = h.next) o.push(h.val); return o; };
const mk = (xs) => xs.reduceRight((n, v) => ({ val: v, next: n }), null);
console.log(toArray(reverse(mk([1, 2, 3, 4]))));
\`\`\`

Draw boxes and arrows. Do three iterations by hand with \`prev\`, \`cur\`, \`next\` labelled. Most list bugs are a missing "save" or forgetting the **tail** / **empty list** cases.

## Rule 2: a dummy head removes special cases

When the head itself might change (delete the first node, merge lists), put a **sentinel node** before it and return \`dummy.next\`:

\`\`\`js run
function removeValue(head, v) {
  const dummy = { val: 0, next: head };
  let cur = dummy;
  while (cur.next) {
    if (cur.next.val === v) cur.next = cur.next.next;   // unlink
    else cur = cur.next;
  }
  return dummy.next;
}
const mk = (xs) => xs.reduceRight((n, x) => ({ val: x, next: n }), null);
const toArray = (h) => { const o = []; for (; h; h = h.next) o.push(h.val); return o; };
console.log(toArray(removeValue(mk([1, 2, 1, 3, 1]), 1)));
\`\`\`

## Rule 3: fast & slow pointers (Floyd's tortoise and hare)

Two pointers moving at different speeds solve problems without extra memory:

- **Middle node:** \`slow\` moves 1, \`fast\` moves 2; when \`fast\` ends, \`slow\` is at the middle.
- **Cycle detection:** if there is a cycle, \`fast\` eventually laps \`slow\` and they meet; if not, \`fast\` reaches \`null\`. (A hash set also works but costs O(n) space.)
- **Cycle start:** after they meet, reset one pointer to the head and move both **one step at a time** — they meet at the node where the cycle begins. (Proof: let the head→start distance be *a*, start→meeting be *b*, and the cycle length *c*; \`2(a+b) = a+b+kc\` ⇒ \`a = kc − b\`.)
- **Nth from the end:** advance \`fast\` n steps ahead, then move both until \`fast\` hits the end.

\`\`\`js run
const mk = (xs) => xs.reduceRight((n, x) => ({ val: x, next: n }), null);
const mid = (h) => { let s = h, f = h; while (f && f.next) { s = s.next; f = f.next.next; } return s.val; };
console.log(mid(mk([1, 2, 3, 4, 5])), mid(mk([1, 2, 3, 4])));
\`\`\`

## Merging sorted lists

Compare the two heads, append the smaller to a tail pointer, advance that list. When one runs out, attach the remainder of the other. This is the merge step of merge sort.

:::tip
In a doubly linked list each node also has \`prev\`. Combined with a hash map from key → node it gives O(1) get/put/delete — the LRU cache.
:::

:::warn
Never "fix" pointer bugs by copying values around when the problem says *rearrange nodes*. Graders (and interviewers) check that you reuse the nodes, not rebuild the list.
:::
`,
  quiz: [
    { q: 'In an in-place reverse, why store `next = cur.next` first?', options: ['To save memory', 'Rewiring cur.next would otherwise lose the rest of the list', 'To avoid recursion', 'JS requires it'], answer: 1, why: 'The old link is the only reference to the remainder.' },
    { q: 'What does a dummy (sentinel) head buy you?', options: ['Speed', 'No special case when the head node is removed or changes', 'Thread safety', 'Nothing'], answer: 1, why: 'Every real node then has a predecessor.' },
    { q: 'In Floyd\'s algorithm the fast pointer moves…', options: ['1 step', '2 steps per slow step', '3 steps', 'Backwards'], answer: 1, why: 'A speed difference of 1 guarantees they meet inside a cycle.' },
    { q: 'How do you find the node where a cycle begins?', options: ['Hash every node', 'After fast/slow meet, restart one pointer at head and advance both 1 step until they meet', 'Reverse the list', 'You cannot'], answer: 1, why: 'The distances work out so both arrive at the cycle entrance together.' },
  ],
  labs: [
    lab({
      id: 'algo5-reverse',
      title: 'Reverse a linked list',
      kind: 'code',
      difficulty: 2,
      minutes: 10,
      tags: ['linked-list', 'pointers'],
      interview: true,
      prompt: `Nodes are plain objects \`{ val, next }\` (\`next\` is \`null\` at the end). Write \`reverseList(head)\` that reverses the list **in place** (reuse the existing nodes; no new nodes, no arrays) and returns the new head. \`reverseList(null)\` is \`null\`.`,
      expose: ['reverseList'],
      files: jsFile(`function reverseList(head) {\n  \n}\n`, `function reverseList(head) {
  let prev = null;
  let cur = head;
  while (cur) {
    const next = cur.next;
    cur.next = prev;
    prev = cur;
    cur = next;
  }
  return prev;
}
`),
      tests: [
        ex('reverses values', ({ env, expect }) => expect(arr(env.reverseList(list([1, 2, 3, 4, 5])))).toEqual([5, 4, 3, 2, 1])),
        ex('empty and single', ({ env, expect }) => {
          expect(env.reverseList(null)).toBe(null);
          expect(arr(env.reverseList(list([7])))).toEqual([7]);
        }),
        ex('reuses the same node objects (in place)', ({ env, expect }) => {
          const h = list([1, 2, 3]);
          const before = nodes(h);
          const r = env.reverseList(h);
          const after = nodes(r);
          expect(after.map((n) => n.val)).toEqual([3, 2, 1]);
          expect(after.every((n) => before.includes(n))).toBe(true);
          expect(before[0].next).toBe(null);
        }),
        prop('property: reversing twice is the identity', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-9, 9), 0, 20)], (xs: number[]) => {
            expect(arr(env.reverseList(env.reverseList(list(xs))))).toEqual(xs);
          });
        }),
        perf('100,000 nodes in linear time', async ({ env, expect, measure }) => {
          const h = list(Array.from({ length: 100000 }, (_, i) => i));
          const { value, steps } = await measure(() => env.reverseList(h), { budget: 3_000_000 });
          expect(value.val).toBe(99999);
          expect(steps).toBeLessThan(400_000);
        }),
      ],
      hints: ['Use three pointers: `prev`, `cur`, and a saved `next`.', 'Loop: save `next = cur.next`; point `cur.next = prev`; then `prev = cur; cur = next`.', 'When `cur` becomes null, `prev` is the new head.'],
    }),

    lab({
      id: 'algo5-cycle',
      title: 'Find where a cycle begins',
      kind: 'code',
      difficulty: 4,
      minutes: 20,
      tags: ['linked-list', 'fast-slow'],
      interview: true,
      prompt: `\`detectCycle(head)\` returns the **node** at which a cycle begins (the first node of the loop), or \`null\` if the list ends. Use Floyd's fast/slow pointers: **O(n) time and O(1) extra space** — no \`Set\`, \`Map\`, arrays or marking nodes.`,
      expose: ['detectCycle'],
      files: jsFile(`function detectCycle(head) {\n  \n}\n`, `function detectCycle(head) {
  let slow = head;
  let fast = head;
  while (fast && fast.next) {
    slow = slow.next;
    fast = fast.next.next;
    if (slow === fast) {
      let a = head;
      while (a !== slow) {
        a = a.next;
        slow = slow.next;
      }
      return a;
    }
  }
  return null;
}
`),
      tests: [
        ex('no cycle → null', ({ env, expect }) => {
          expect(env.detectCycle(list([1, 2, 3, 4]))).toBe(null);
          expect(env.detectCycle(null)).toBe(null);
          expect(env.detectCycle(list([1]))).toBe(null);
        }),
        ex('cycle back to the head', ({ env, expect }) => {
          const h = list([1, 2, 3])!;
          const ns = nodes(h);
          ns[2].next = ns[0];
          expect(env.detectCycle(h)).toBe(ns[0]);
        }),
        ex('cycle starting in the middle', ({ env, expect }) => {
          const h = list([1, 2, 3, 4, 5, 6])!;
          const ns = nodes(h);
          ns[5].next = ns[2];
          expect(env.detectCycle(h)).toBe(ns[2]);
        }),
        ex('self loop', ({ env, expect }) => {
          const h = list([1])!;
          h.next = h;
          expect(env.detectCycle(h)).toBe(h);
        }),
        prop('property: finds the entrance for every tail/cycle length', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.nat(12), gen.nat(12)], (tail: number, cyc: number) => {
            const total = tail + cyc + 1;
            const h = list(Array.from({ length: total }, (_, i) => i))!;
            const ns = nodes(h);
            ns[total - 1].next = ns[tail];
            expect(env.detectCycle(h)).toBe(ns[tail]);
          });
        }),
        perf('a 100,000 node list with a late cycle', async ({ env, expect, measure }) => {
          const h = list(Array.from({ length: 100000 }, (_, i) => i))!;
          const ns = nodes(h);
          ns[99999].next = ns[70000];
          const { value, steps } = await measure(() => env.detectCycle(h), { budget: 3_000_000 });
          expect(value).toBe(ns[70000]);
          expect(steps).toBeLessThan(1_000_000);
        }),
        hid('uses no extra memory structures', ({ code, expect }) => expect(/new\s+(Set|Map|WeakSet|WeakMap|Array)\b|\[\s*\]/.test(code)).toBe(false), 'structural'),
      ],
      hints: ['Phase 1: move `slow` by 1 and `fast` by 2. If `fast` reaches the end there is no cycle; if they meet, there is one.', 'Phase 2: keep one pointer at the meeting point, put another at the head, move **both one step at a time**.', 'They meet exactly at the cycle entrance — return that node.'],
    }),

    lab({
      id: 'algo5-merge',
      title: 'Merge two sorted lists',
      kind: 'code',
      difficulty: 2,
      minutes: 12,
      tags: ['linked-list', 'merge'],
      interview: true,
      prompt: `\`mergeTwoLists(a, b)\` — both lists are sorted ascending. Return the head of one sorted list made by **splicing the existing nodes** together (don't create new nodes). When values are equal, nodes from \`a\` come first (stable).`,
      expose: ['mergeTwoLists'],
      files: jsFile(`function mergeTwoLists(a, b) {\n  \n}\n`, `function mergeTwoLists(a, b) {
  const dummy = { val: 0, next: null };
  let tail = dummy;
  while (a && b) {
    if (b.val < a.val) {
      tail.next = b;
      b = b.next;
    } else {
      tail.next = a;
      a = a.next;
    }
    tail = tail.next;
  }
  tail.next = a || b;
  return dummy.next;
}
`),
      tests: [
        ex('merges two lists', ({ env, expect }) => expect(arr(env.mergeTwoLists(list([1, 2, 4]), list([1, 3, 4])))).toEqual([1, 1, 2, 3, 4, 4])),
        ex('one or both empty', ({ env, expect }) => {
          expect(env.mergeTwoLists(null, null)).toBe(null);
          expect(arr(env.mergeTwoLists(null, list([0])))).toEqual([0]);
          expect(arr(env.mergeTwoLists(list([5, 6]), null))).toEqual([5, 6]);
        }),
        ex('reuses the original nodes and is stable', ({ env, expect }) => {
          const a = list([1, 3])!;
          const b = list([1, 2])!;
          const [a1, a3] = nodes(a);
          const [b1, b2] = nodes(b);
          const out = nodes(env.mergeTwoLists(a, b));
          expect(out).toEqual([a1, b1, b2, a3]);
          expect(out[0]).toBe(a1);
          expect(out[1]).toBe(b1);
        }),
        prop('property: result is sorted and is a permutation of the inputs', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-9, 9), 0, 12), gen.array(gen.int(-9, 9), 0, 12)], (x: number[], y: number[]) => {
            const a = [...x].sort((p, q) => p - q);
            const b = [...y].sort((p, q) => p - q);
            expect(arr(env.mergeTwoLists(list(a), list(b)))).toEqual([...a, ...b].sort((p, q) => p - q));
          });
        }),
        perf('two 50,000-node lists', async ({ env, expect, measure }) => {
          const a = list(Array.from({ length: 50000 }, (_, i) => i * 2));
          const b = list(Array.from({ length: 50000 }, (_, i) => i * 2 + 1));
          const { steps } = await measure(() => env.mergeTwoLists(a, b), { budget: 3_000_000 });
          expect(steps).toBeLessThan(400_000);
        }),
      ],
      hints: ['A dummy head plus a `tail` pointer makes appending uniform.', 'Compare the two current heads; link the smaller to `tail.next`, advance that list and `tail`.', 'When one list is exhausted, link the remainder of the other in one assignment.'],
    }),

    lab({
      id: 'algo5-remove-nth',
      title: 'Remove the Nth node from the end',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['linked-list', 'two-pointers'],
      interview: true,
      prompt: `\`removeNthFromEnd(head, n)\` — remove the n-th node counting from the **end** (n = 1 is the last node) and return the head. \`1 <= n <=\` length. Do it in **one pass** using two pointers with a gap of n.`,
      expose: ['removeNthFromEnd'],
      files: jsFile(`function removeNthFromEnd(head, n) {\n  \n}\n`, `function removeNthFromEnd(head, n) {
  const dummy = { val: 0, next: head };
  let fast = dummy;
  let slow = dummy;
  for (let i = 0; i < n; i++) fast = fast.next;
  while (fast.next) {
    fast = fast.next;
    slow = slow.next;
  }
  slow.next = slow.next.next;
  return dummy.next;
}
`),
      tests: [
        ex('removes from the middle', ({ env, expect }) => expect(arr(env.removeNthFromEnd(list([1, 2, 3, 4, 5]), 2))).toEqual([1, 2, 3, 5])),
        ex('removes the last node', ({ env, expect }) => expect(arr(env.removeNthFromEnd(list([1, 2, 3]), 1))).toEqual([1, 2])),
        ex('removes the head', ({ env, expect }) => {
          expect(arr(env.removeNthFromEnd(list([1, 2, 3]), 3))).toEqual([2, 3]);
          expect(env.removeNthFromEnd(list([9]), 1)).toBe(null);
        }),
        prop('property: matches array splice', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(0, 9), 1, 15), gen.nat(20)], (xs: number[], k0: number) => {
            const n = 1 + (k0 % xs.length);
            const want = [...xs];
            want.splice(xs.length - n, 1);
            expect(arr(env.removeNthFromEnd(list(xs), n))).toEqual(want);
          });
        }),
        hid('traverses the list only once (fast pointer walks at most length + n steps)', async ({ env, expect, measure }) => {
          const h = list(Array.from({ length: 50000 }, (_, i) => i));
          const { steps } = await measure(() => env.removeNthFromEnd(h, 25000), { budget: 3_000_000 });
          expect(steps).toBeLessThan(150_000);
        }),
      ],
      hints: ['Put a dummy node before `head` so removing the head is not a special case.', 'Advance `fast` n steps from the dummy, then move `fast` and `slow` together until `fast.next` is null.', '`slow` now stands just before the node to delete: `slow.next = slow.next.next`.'],
    }),
  ],
  references: [{ title: 'Floyd\'s cycle-finding algorithm (Knuth, TAOCP vol. 2, exercise 3.1-6)' }],
};
export default mod;
