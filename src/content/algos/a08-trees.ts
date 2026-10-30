import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';
import { Rng } from '../../grader/rng';
import { isRecursive } from '../../grader/instrument';

interface TN { val: number; left: TN | null; right: TN | null }
/** Build a tree from level-order values (LeetCode style: null = missing child). */
function tree(vals: (number | null)[]): TN | null {
  if (!vals.length || vals[0] == null) return null;
  const root: TN = { val: vals[0], left: null, right: null };
  const q: TN[] = [root];
  let i = 1;
  while (q.length && i < vals.length) {
    const n = q.shift()!;
    const l = vals[i++];
    if (l != null) { n.left = { val: l, left: null, right: null }; q.push(n.left); }
    if (i < vals.length) {
      const r = vals[i++];
      if (r != null) { n.right = { val: r, left: null, right: null }; q.push(n.right); }
    }
  }
  return root;
}
const levels = (root: TN | null): number[][] => {
  const out: number[][] = [];
  let level = root ? [root] : [];
  while (level.length) { out.push(level.map((n) => n.val)); level = level.flatMap((n) => [n.left, n.right].filter(Boolean) as TN[]); }
  return out;
};
/** Structural signature including nulls — for exact equality of shapes. */
const sig = (n: TN | null): string => (n ? `(${n.val} ${sig(n.left)} ${sig(n.right)})` : '#');
function randomTree(r: Rng, size: number, lo = 0, hi = 50): TN | null {
  if (size <= 0) return null;
  const left = r.int(0, size - 1);
  return { val: r.int(lo, hi), left: randomTree(r, left, lo, hi), right: randomTree(r, size - 1 - left, lo, hi) };
}
function allNodes(root: TN | null): TN[] { const out: TN[] = []; (function go(n: TN | null) { if (n) { out.push(n); go(n.left); go(n.right); } })(root); return out; }
function chain(n: number): TN | null { let root: TN | null = null; for (let i = n; i >= 1; i--) root = { val: i, left: null, right: root }; return root; }

const mod: Module = {
  id: 'trees',
  course: 'algos',
  title: 'Binary Trees & BSTs',
  minutes: 55,
  objectives: [
    'Write recursive and iterative traversals (pre-, in-, post-order, level-order)',
    'Solve tree problems by choosing what each recursive call returns',
    'Validate and use binary search trees',
    'Serialise and rebuild a tree',
  ],
  body: `
## Anatomy

A **binary tree** node has a value and up to two children: \`{ val, left, right }\`. Vocabulary: **root**, **leaf**, **height** (edges on the longest root-to-leaf path), **depth** of a node, **balanced** (height O(log n)).

A **binary search tree (BST)**: for every node, *all* values in the left subtree are smaller and *all* in the right subtree are larger. Search, insert and delete are O(height) — O(log n) when balanced, O(n) when it degenerates into a chain (inserting sorted data). Self-balancing trees (AVL, red-black, B-trees) keep the height logarithmic.

\`\`\`js run
const t = (v, l = null, r = null) => ({ val: v, left: l, right: r });
const root = t(4, t(2, t(1), t(3)), t(6, t(5), t(7)));
const inorder = (n) => (n ? [...inorder(n.left), n.val, ...inorder(n.right)] : []);
console.log(inorder(root));   // in-order traversal of a BST is sorted
\`\`\`

## Traversals

| Order | Visit | Use |
|---|---|---|
| **Pre-order** | node, left, right | copy a tree, serialise |
| **In-order** | left, node, right | sorted output of a BST, k-th smallest |
| **Post-order** | left, right, node | delete a tree, compute heights/sizes (children first) |
| **Level-order** | breadth-first with a queue | shortest depth, per-level problems |

Recursive versions are 3 lines. The **iterative in-order** with an explicit stack avoids stack overflow on deep trees (a degenerate tree of 100,000 nodes would overflow the JS call stack):

\`\`\`js run
function inorderIterative(root) {
  const out = [], stack = [];
  let cur = root;
  while (cur || stack.length) {
    while (cur) { stack.push(cur); cur = cur.left; }   // go as far left as possible
    cur = stack.pop();
    out.push(cur.val);
    cur = cur.right;                                   // then explore the right subtree
  }
  return out;
}
const t = (v, l = null, r = null) => ({ val: v, left: l, right: r });
console.log(inorderIterative(t(2, t(1), t(3))));
\`\`\`

**Level-order (BFS)** uses a queue; process the queue in *layers* by capturing \`queue.length\` at the start of each level.

## The key skill: what does each call return?

Most tree problems become easy when you decide **what a recursive call should compute for its subtree**, assuming the recursion handles the children:

- *max depth*: \`1 + max(depth(left), depth(right))\`.
- *is balanced*: return the height, or −1 to signal "unbalanced" (so you compute both in one pass).
- *diameter*: at each node, \`left + right\` height is a candidate; return \`1 + max\` upward.
- *lowest common ancestor*: if the node is p or q return it; if both sides return non-null, this node is the LCA.
- *validate BST*: each node must lie in an open interval \`(lo, hi)\` inherited from its ancestors — checking only the parent is the classic **bug**.

\`\`\`js run
const t = (v, l = null, r = null) => ({ val: v, left: l, right: r });
// BUG: checks only direct children — accepts an invalid BST
const naive = (n) => !n || ((!n.left || n.left.val < n.val) && (!n.right || n.right.val > n.val) && naive(n.left) && naive(n.right));
// CORRECT: carry bounds down
const valid = (n, lo = -Infinity, hi = Infinity) => !n || (n.val > lo && n.val < hi && valid(n.left, lo, n.val) && valid(n.right, n.val, hi));
const bad = t(5, t(1), t(7, t(3), t(9)));         // 3 is in the right subtree of 5 but < 5
console.log(naive(bad), valid(bad));
\`\`\`

## Serialisation

To store/transmit a tree you must record **structure**, not just values. A pre-order walk that writes a marker (\`#\`) for each missing child is enough to rebuild the tree uniquely:
\`1,2,#,#,3,4,#,#,5,#,#\`. (Values alone — even in-order — are ambiguous.)

:::interview
Tree questions: always ask *"is it a BST? balanced? can values repeat? how deep can it get?"* The last one decides between recursion and an explicit stack. State the complexity as O(n) time and O(h) space (h = height: O(log n) balanced, O(n) worst case).
:::
`,
  quiz: [
    { q: 'What does an in-order traversal of a BST produce?', options: ['Level by level', 'Values in sorted order', 'Reverse sorted', 'Random order'], answer: 1, why: 'Left < node < right at every node means left-node-right visits ascending.' },
    { q: 'Why is "left child < node < right child" NOT enough to validate a BST?', options: ['It is enough', 'A deeper node may violate an ancestor\'s bound', 'Duplicates', 'Trees are cyclic'], answer: 1, why: 'Every value in the left subtree must be smaller than the node — you need inherited bounds.' },
    { q: 'What data structure drives level-order traversal?', options: ['Stack', 'Queue', 'Heap', 'Set'], answer: 1, why: 'A FIFO queue visits nodes in breadth-first order.' },
    { q: 'What is the space complexity of recursive DFS on a tree of height h?', options: ['O(1)', 'O(h)', 'O(n log n)', 'O(2^h)'], answer: 1, why: 'The call stack holds one frame per level.' },
  ],
  labs: [
    lab({
      id: 'algo8-inorder',
      title: 'Iterative in-order traversal',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['tree', 'stack'],
      interview: true,
      prompt: `Nodes are \`{ val, left, right }\`. Write \`inorderTraversal(root)\` returning the values in **in-order**, **without recursion** (use an explicit stack) so it works on very deep trees.`,
      expose: ['inorderTraversal'],
      files: jsFile(`function inorderTraversal(root) {\n  \n}\n`, `function inorderTraversal(root) {
  const out = [];
  const stack = [];
  let cur = root;
  while (cur || stack.length) {
    while (cur) {
      stack.push(cur);
      cur = cur.left;
    }
    cur = stack.pop();
    out.push(cur.val);
    cur = cur.right;
  }
  return out;
}
`),
      tests: [
        ex('small trees', ({ env, expect }) => {
          expect(env.inorderTraversal(tree([1, null, 2, 3]))).toEqual([1, 3, 2]);
          expect(env.inorderTraversal(tree([4, 2, 6, 1, 3, 5, 7]))).toEqual([1, 2, 3, 4, 5, 6, 7]);
        }),
        ex('empty and single', ({ env, expect }) => {
          expect(env.inorderTraversal(null)).toEqual([]);
          expect(env.inorderTraversal(tree([9]))).toEqual([9]);
        }),
        prop('property: matches the recursive reference on random trees', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(0, 25), gen.int(1, 9999)], (n: number, seed: number) => {
            const t = randomTree(new Rng(seed), n);
            const ref: number[] = [];
            (function go(x: TN | null) { if (x) { go(x.left); ref.push(x.val); go(x.right); } })(t);
            expect(env.inorderTraversal(t)).toEqual(ref);
          });
        }),
        ex('survives a 50,000-node degenerate tree (recursion would overflow)', ({ env, expect }) => {
          let root: TN | null = null;
          for (let i = 0; i < 50000; i++) root = { val: i, left: root, right: null };
          const r = env.inorderTraversal(root);
          expect(r.length).toBe(50000);
          expect(r[0]).toBe(0);
        }),
        hid('is not recursive', ({ code, expect }) => expect(isRecursive(code, 'inorderTraversal')).toBe(false), 'structural'),
      ],
      hints: ['Use a stack and a `cur` pointer.', 'Push `cur` and go left until null. Then pop, record the value, and move to the right child.', 'Loop while `cur || stack.length`.'],
    }),

    lab({
      id: 'algo8-levelorder',
      title: 'Level-order traversal',
      kind: 'code',
      difficulty: 2,
      minutes: 12,
      tags: ['tree', 'bfs'],
      interview: true,
      prompt: `\`levelOrder(root)\` returns an array of arrays: the values of each depth level from left to right, e.g. \`[[3],[9,20],[15,7]]\`. An empty tree gives \`[]\`.`,
      expose: ['levelOrder'],
      files: jsFile(`function levelOrder(root) {\n  \n}\n`, `function levelOrder(root) {
  const result = [];
  if (!root) return result;
  let queue = [root];
  let head = 0;
  while (head < queue.length) {
    const end = queue.length;
    const level = [];
    while (head < end) {
      const n = queue[head++];
      level.push(n.val);
      if (n.left) queue.push(n.left);
      if (n.right) queue.push(n.right);
    }
    result.push(level);
  }
  return result;
}
`),
      tests: [
        ex('example', ({ env, expect }) => expect(env.levelOrder(tree([3, 9, 20, null, null, 15, 7]))).toEqual([[3], [9, 20], [15, 7]])),
        ex('empty and single', ({ env, expect }) => {
          expect(env.levelOrder(null)).toEqual([]);
          expect(env.levelOrder(tree([1]))).toEqual([[1]]);
        }),
        ex('skewed trees', ({ env, expect }) => expect(env.levelOrder(tree([1, null, 2, null, 3]))).toEqual([[1], [2], [3]])),
        prop('property: matches the reference', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(0, 30), gen.int(1, 9999)], (n: number, seed: number) => {
            const t = randomTree(new Rng(seed), n);
            expect(env.levelOrder(t)).toEqual(levels(t));
          });
        }),
        perf('linear on a 100,000-node tree (queue must not use shift())', async ({ env, expect, measure }) => {
          const t = randomTree(new Rng(3), 20000);
          const { steps } = await measure(() => env.levelOrder(t), { budget: 3_000_000 });
          expect(steps).toBeLessThan(20000 * 12);
        }),
      ],
      hints: ['Use a queue (an array plus a `head` index — `shift()` is O(n)).', 'At the start of each level record `size = queue.length`, then process exactly `size` nodes, enqueueing their children.', 'Push the collected level into the result.'],
    }),

    lab({
      id: 'algo8-valid-bst',
      title: 'Validate a binary search tree',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['tree', 'bst'],
      interview: true,
      prompt: `\`isValidBST(root)\` — true if the tree is a valid BST: for every node, **all** values in its left subtree are strictly smaller and **all** in its right subtree are strictly larger (so duplicates make it invalid). The empty tree is valid.`,
      expose: ['isValidBST'],
      files: jsFile(`function isValidBST(root) {\n  \n}\n`, `function isValidBST(root) {
  function check(node, lo, hi) {
    if (!node) return true;
    if (node.val <= lo || node.val >= hi) return false;
    return check(node.left, lo, node.val) && check(node.right, node.val, hi);
  }
  return check(root, -Infinity, Infinity);
}
`),
      tests: [
        ex('valid trees', ({ env, expect }) => {
          expect(env.isValidBST(tree([2, 1, 3]))).toBe(true);
          expect(env.isValidBST(null)).toBe(true);
          expect(env.isValidBST(tree([5]))).toBe(true);
        }),
        ex('invalid: left child bigger', ({ env, expect }) => expect(env.isValidBST(tree([5, 6, 7]))).toBe(false)),
        ex('invalid: a deep node violates an ancestor (the classic trap)', ({ env, expect }) => {
          expect(env.isValidBST(tree([5, 1, 7, null, null, 3, 9]))).toBe(false);
          expect(env.isValidBST(tree([10, 5, 15, null, null, 6, 20]))).toBe(false);
        }),
        ex('duplicates are invalid', ({ env, expect }) => {
          expect(env.isValidBST(tree([2, 2, 2]))).toBe(false);
          expect(env.isValidBST(tree([1, 1]))).toBe(false);
        }),
        prop('property: matches the in-order-strictly-increasing check', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(0, 12), gen.int(1, 9999)], (n: number, seed: number) => {
            const t = randomTree(new Rng(seed), n, 0, 14);
            const ino: number[] = [];
            (function go(x: TN | null) { if (x) { go(x.left); ino.push(x.val); go(x.right); } })(t);
            const want = ino.every((v, i) => i === 0 || v > ino[i - 1]);
            expect(env.isValidBST(t)).toBe(want);
          }, { runs: 300 });
        }),
        hid('handles extreme values (-Infinity-safe, no sentinel collisions)', ({ env, expect }) => {
          expect(env.isValidBST(tree([Number.MIN_SAFE_INTEGER, null, 0]))).toBe(true);
          expect(env.isValidBST(tree([0, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]))).toBe(true);
        }),
      ],
      hints: ['Checking only parent/child pairs is wrong: pass **bounds** down the recursion.', '`check(node, lo, hi)`: the node must satisfy `lo < node.val < hi`; the left subtree gets `(lo, node.val)`, the right `(node.val, hi)`.', 'Start with `(-Infinity, Infinity)`.'],
    }),

    lab({
      id: 'algo8-lca',
      title: 'Lowest common ancestor',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['tree', 'recursion'],
      interview: true,
      prompt: `\`lowestCommonAncestor(root, p, q)\` — \`p\` and \`q\` are **nodes** of the tree (compare by identity; both exist). Return their lowest common ancestor: the deepest node that has both as descendants (a node counts as a descendant of itself). The tree is a general binary tree, **not** necessarily a BST. O(n).`,
      expose: ['lowestCommonAncestor'],
      files: jsFile(`function lowestCommonAncestor(root, p, q) {\n  \n}\n`, `function lowestCommonAncestor(root, p, q) {
  if (!root || root === p || root === q) return root;
  const left = lowestCommonAncestor(root.left, p, q);
  const right = lowestCommonAncestor(root.right, p, q);
  if (left && right) return root;
  return left || right;
}
`),
      tests: [
        ex('example', ({ env, expect }) => {
          const t = tree([3, 5, 1, 6, 2, 0, 8, null, null, 7, 4])!;
          const n3 = t, n5 = t.left!, n1 = t.right!, n6 = n5.left!, n2 = n5.right!, n7 = n2.left!, n4 = n2.right!, n8 = n1.right!;
          expect(env.lowestCommonAncestor(t, n5, n1)).toBe(n3);
          expect(env.lowestCommonAncestor(t, n5, n4)).toBe(n5);
          expect(env.lowestCommonAncestor(t, n6, n4)).toBe(n5);
          expect(env.lowestCommonAncestor(t, n7, n8)).toBe(n3);
        }),
        ex('p equals q', ({ env, expect }) => {
          const t = tree([1, 2, 3])!;
          expect(env.lowestCommonAncestor(t, t.left, t.left)).toBe(t.left);
        }),
        prop('property: matches a path-based reference', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(1, 20), gen.int(1, 9999), gen.nat(40), gen.nat(40)], (n: number, seed: number, a: number, b: number) => {
            const t = randomTree(new Rng(seed), n)!;
            const ns = allNodes(t);
            const p = ns[a % ns.length], q = ns[b % ns.length];
            const pathTo = (root: TN, target: TN): TN[] | null => { if (root === target) return [root]; for (const c of [root.left, root.right]) { if (c) { const r = pathTo(c, target); if (r) return [root, ...r]; } } return null; };
            const pp = pathTo(t, p)!, pq = pathTo(t, q)!;
            let lca = t;
            for (let i = 0; i < Math.min(pp.length, pq.length) && pp[i] === pq[i]; i++) lca = pp[i];
            expect(env.lowestCommonAncestor(t, p, q)).toBe(lca);
          });
        }),
        perf('visits each node once: 20,000-node tree', async ({ env, expect, measure }) => {
          const t = randomTree(new Rng(12), 20000)!;
          const ns = allNodes(t);
          const { steps } = await measure(() => env.lowestCommonAncestor(t, ns[100], ns[ns.length - 5]), { budget: 3_000_000 });
          expect(steps).toBeLessThan(20000 * 4);
        }),
      ],
      hints: ['Recurse on both children. If the current node is `p` or `q`, return it.', 'If the left call and the right call both return something non-null, the current node is where the paths split: it is the LCA.', 'Otherwise return whichever side is non-null.'],
    }),

    lab({
      id: 'algo8-codec',
      title: 'Serialise and deserialise a tree',
      kind: 'code',
      difficulty: 4,
      minutes: 25,
      tags: ['tree', 'design'],
      interview: true,
      prompt: `Implement \`serialize(root)\` → string and \`deserialize(text)\` → tree such that \`deserialize(serialize(t))\` has **exactly the same structure and values** as \`t\` (including the shape: which side each child is on, and negative or multi-digit numbers). The format is yours. Handle the empty tree.

Prefer a format whose size is **linear** in the number of nodes (a pre-order walk with a marker for missing children works).`,
      expose: ['serialize', 'deserialize'],
      files: jsFile(`function serialize(root) {\n  \n}\n\nfunction deserialize(text) {\n  \n}\n`, `function serialize(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (n === null) out.push('#');
    else {
      out.push(String(n.val));
      stack.push(n.right);
      stack.push(n.left);
    }
  }
  return out.join(',');
}

function deserialize(text) {
  const tokens = text.split(',');
  let i = 0;
  function build() {
    const t = tokens[i++];
    if (t === '#') return null;
    const node = { val: Number(t), left: null, right: null };
    node.left = build();
    node.right = build();
    return node;
  }
  return build();
}
`),
      tests: [
        ex('round trip on a sample tree', ({ env, expect }) => {
          const t = tree([1, 2, 3, null, null, 4, 5]);
          expect(sig(env.deserialize(env.serialize(t)))).toBe(sig(t));
        }),
        ex('empty and single', ({ env, expect }) => {
          expect(env.deserialize(env.serialize(null))).toBe(null);
          expect(sig(env.deserialize(env.serialize(tree([42]))))).toBe(sig(tree([42])));
        }),
        ex('negative and multi-digit values; left vs right children matter', ({ env, expect }) => {
          const left = { val: -12, left: { val: 305, left: null, right: null }, right: null } as TN;
          const right = { val: -12, left: null, right: { val: 305, left: null, right: null } } as TN;
          expect(sig(env.deserialize(env.serialize(left)))).toBe(sig(left));
          expect(sig(env.deserialize(env.serialize(right)))).toBe(sig(right));
          expect(env.serialize(left)).not.toBe(env.serialize(right));
        }),
        ex('serialize returns a string', ({ env, expect }) => expect(env.serialize(tree([1, 2]))).toBeType('string')),
        prop('property: round trip on random trees', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(0, 40), gen.int(1, 9999)], (n: number, seed: number) => {
            const t = randomTree(new Rng(seed), n, -500, 500);
            expect(sig(env.deserialize(env.serialize(t)))).toBe(sig(t));
          }, { runs: 150 });
        }),
        perf('linear size and time: 20,000 nodes', async ({ env, expect, measure }) => {
          const t = randomTree(new Rng(21), 20000);
          const { value, steps } = await measure(() => env.serialize(t), { budget: 8_000_000 });
          expect(value.length).toBeLessThan(20000 * 14);
          expect(steps).toBeLessThan(20000 * 30);
        }),
        hid('a deep chain of 3,000 nodes round-trips', ({ env, expect }) => {
          const t = chain(3000);
          const back = env.deserialize(env.serialize(t));
          let n = back, count = 0;
          while (n) { count++; n = n.right; }
          expect(count).toBe(3000);
        }),
      ],
      hints: ['Pre-order walk: write the value, then the left subtree, then the right; write `#` for `null`.', 'Deserialize with a recursive builder consuming tokens from a shared index: `#` → null, otherwise create a node and build left then right.', 'Joining with commas makes negative and multi-digit numbers unambiguous. (For very deep trees, serialise iteratively.)'],
    }),
  ],
  references: [{ title: 'CLRS — Introduction to Algorithms, Part III: Data Structures (binary search trees)' }],
};
export default mod;
