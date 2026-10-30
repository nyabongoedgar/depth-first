import type { Module } from '../../core/types';
import { ex, prop, perf, hid, lab, jsFile } from '../helpers';

const mod: Module = {
  id: 'stacks-queues',
  course: 'algos',
  title: 'Stacks, Queues & the Monotonic Stack',
  minutes: 40,
  objectives: [
    'Use a stack for matching, nesting, undo and expression evaluation',
    'Recognise the "next greater / smaller element" family and solve it with a monotonic stack in O(n)',
    'Design a stack that answers min() in O(1)',
    'Choose between stack, queue and deque for the problem',
  ],
  body: `
## Stack and queue

| | Stack (LIFO) | Queue (FIFO) |
|---|---|---|
| Add | \`push\` on top | \`enqueue\` at back |
| Remove | \`pop\` from top | \`dequeue\` from front |
| Peek | top | front |
| JS | array \`push/pop\` — O(1) | array \`push\` + index pointer (\`shift\` is O(n)!) or a linked list / ring buffer |
| Typical use | undo, parsing, DFS, call stack, matching brackets | BFS, scheduling, buffering |

A **deque** supports both ends. The call stack itself is a stack — recursion is an implicit stack, and any recursive algorithm can be made iterative with an explicit one.

:::warn
\`array.shift()\` in a loop is **O(n²)** overall in the worst case (it re-indexes). For queues in algorithms, keep a \`head\` index (\`queue[head++]\`) or use two stacks / a linked list.
:::

## Matching and nesting

Whenever something must be closed **in reverse order of opening** (brackets, HTML tags, function calls), push openers and pop on closers.

\`\`\`js run
function balanced(s) {
  const pairs = { ")": "(", "]": "[", "}": "{" };
  const stack = [];
  for (const c of s) {
    if (c === "(" || c === "[" || c === "{") stack.push(c);
    else if (pairs[c]) { if (stack.pop() !== pairs[c]) return false; }
  }
  return stack.length === 0;          // nothing left unclosed
}
console.log(balanced("{[()]}"), balanced("([)]"), balanced("(("));
\`\`\`

## The monotonic stack

For "**the next element to the right that is greater**" a brute force scans right from each element: O(n²). Instead keep a stack of indices whose answers are **still unknown**, with values **decreasing** from bottom to top (a *monotonic* stack). When a new element arrives it resolves every smaller element on top:

\`\`\`js run
function nextGreater(a) {
  const ans = new Array(a.length).fill(-1);
  const stack = [];                       // indices waiting for a greater element
  for (let i = 0; i < a.length; i++) {
    while (stack.length && a[stack[stack.length - 1]] < a[i]) ans[stack.pop()] = a[i];
    stack.push(i);
  }
  return ans;
}
console.log(nextGreater([2, 1, 2, 4, 3]));
\`\`\`

Each index is pushed once and popped once → **O(n)** even though there's a loop inside the loop. (Always count *total pushes and pops*, not the nesting.)

The family: next/previous greater/smaller element, daily temperatures, stock span, largest rectangle in a histogram, trapping rain water, sum of subarray minimums, remove k digits.

## Auxiliary-information stacks

A **min stack** stores, with each element, the minimum of everything beneath it, so \`getMin()\` is O(1):

\`\`\`js run
class MinStack {
  constructor() { this.s = []; }
  push(x) { this.s.push({ x, min: this.s.length ? Math.min(x, this.s[this.s.length - 1].min) : x }); }
  pop() { return this.s.pop().x; }
  min() { return this.s[this.s.length - 1].min; }
}
const m = new MinStack(); [5, 3, 7].forEach((v) => m.push(v));
console.log(m.min()); m.pop(); m.pop(); console.log(m.min());
\`\`\`

## Expression evaluation

**Reverse Polish notation (postfix)** needs only a stack: push numbers; on an operator pop two operands, apply, push the result. Infix → postfix conversion (shunting-yard) uses a stack for operators. Calculators and many parsers work this way.

:::interview
Stack problems are usually recognisable by *nested structure*, *"undo the most recent"*, or *"nearest/next larger"*. State the invariant aloud: "the stack holds indices with decreasing values".
:::
`,
  quiz: [
    { q: 'Why is a loop containing a `while` inside it still O(n) for the monotonic stack?', options: ['The while loop is short', 'Every element is pushed once and popped at most once', 'JS optimises it', 'It is O(n²)'], answer: 1, why: 'Total work = total pushes + pops ≤ 2n.' },
    { q: 'Which structure matches "most recently opened bracket must close first"?', options: ['Queue', 'Stack', 'Heap', 'Hash set'], answer: 1, why: 'LIFO matches nested, reverse-order closing.' },
    { q: 'Why avoid `queue.shift()` inside a hot loop?', options: ['It mutates the array', 'It is O(n) because it re-indexes the array', 'It is deprecated', 'It returns a copy'], answer: 1, why: 'Use a head pointer or a deque.' },
    { q: 'What does a min-stack store per element to answer getMin() in O(1)?', options: ['A sorted copy', 'The minimum of all elements at or below it', 'Its index', 'A hash'], answer: 1, why: 'The top element then always knows the current overall minimum.' },
  ],
  labs: [
    lab({
      id: 'algo4-valid-parens',
      title: 'Valid parentheses',
      kind: 'code',
      difficulty: 1,
      minutes: 8,
      tags: ['stack'],
      interview: true,
      prompt: `\`isValid(s)\` — \`s\` contains only \`()[]{}\`. Return \`true\` if every bracket is closed by the same type, in the correct order, and nothing is left open. The empty string is valid.`,
      expose: ['isValid'],
      files: jsFile(`function isValid(s) {\n  \n}\n`, `function isValid(s) {
  const match = { ')': '(', ']': '[', '}': '{' };
  const stack = [];
  for (const c of s) {
    if (c === '(' || c === '[' || c === '{') stack.push(c);
    else if (stack.pop() !== match[c]) return false;
  }
  return stack.length === 0;
}
`),
      tests: [
        ex('valid strings', ({ env, expect }) => {
          for (const s of ['', '()', '()[]{}', '{[()]}', '([]{})']) expect(env.isValid(s)).toBe(true);
        }),
        ex('invalid strings', ({ env, expect }) => {
          for (const s of ['(', ')', '(]', '([)]', '{[}', '((', '))', '}{']) expect(env.isValid(s)).toBe(false);
        }),
        prop('property: matches a reduction-based reference', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.string(14, '()[]{}')], (s: string) => {
            let t = s;
            for (;;) { const n = t.replace('()', '').replace('[]', '').replace('{}', ''); if (n === t) break; t = n; }
            expect(env.isValid(s)).toBe(t === '');
          }, { runs: 300 });
        }),
        perf('linear on 200,000 brackets', async ({ env, expect, measure }) => {
          const s = '([{'.repeat(33000) + '}])'.repeat(33000);
          const { value, steps } = await measure(() => env.isValid(s), { budget: 3_000_000 });
          expect(value).toBe(true);
          expect(steps).toBeLessThan(600_000);
        }),
      ],
      hints: ['Push each opener; for each closer pop and compare.', 'A closer with an empty stack: `pop()` gives `undefined`, which never matches.', 'At the end the stack must be empty.'],
    }),

    lab({
      id: 'algo4-daily-temps',
      title: 'Daily temperatures (monotonic stack)',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['stack', 'monotonic-stack'],
      interview: true,
      prompt: `\`dailyTemperatures(temps)\` — for each day, how many days until a **strictly warmer** temperature? Use \`0\` if there is none. Required: O(n) — a monotonic stack of indices.`,
      expose: ['dailyTemperatures'],
      files: jsFile(`function dailyTemperatures(temps) {\n  \n}\n`, `function dailyTemperatures(temps) {
  const answer = new Array(temps.length).fill(0);
  const stack = [];
  for (let i = 0; i < temps.length; i++) {
    while (stack.length && temps[stack[stack.length - 1]] < temps[i]) {
      const j = stack.pop();
      answer[j] = i - j;
    }
    stack.push(i);
  }
  return answer;
}
`),
      tests: [
        ex('classic', ({ env, expect }) => expect(env.dailyTemperatures([73, 74, 75, 71, 69, 72, 76, 73])).toEqual([1, 1, 4, 2, 1, 1, 0, 0])),
        ex('edge cases', ({ env, expect }) => {
          expect(env.dailyTemperatures([])).toEqual([]);
          expect(env.dailyTemperatures([50])).toEqual([0]);
          expect(env.dailyTemperatures([30, 30, 30])).toEqual([0, 0, 0]);
          expect(env.dailyTemperatures([30, 40, 50, 60])).toEqual([1, 1, 1, 0]);
          expect(env.dailyTemperatures([60, 50, 40, 30])).toEqual([0, 0, 0, 0]);
        }),
        prop('property: matches the O(n²) brute force', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(30, 40), 0, 18)], (t: number[]) => {
            const want = t.map((x, i) => { for (let j = i + 1; j < t.length; j++) if (t[j] > x) return j - i; return 0; });
            expect(env.dailyTemperatures(t)).toEqual(want);
          }, { runs: 200 });
        }),
        perf('linear on 100,000 days (a worst case for the brute force)', async ({ env, expect, measure }) => {
          const t = Array.from({ length: 100000 }, (_, i) => 100000 - i);
          const { steps } = await measure(() => env.dailyTemperatures(t), { budget: 3_000_000 });
          expect(steps).toBeLessThan(600_000);
        }),
      ],
      hints: ['Keep a stack of **indices** of days still waiting for a warmer day. Temperatures on the stack are non-increasing.', 'For the current day `i`, while the top day is colder than `i`, pop it: its answer is `i - top`.', 'Then push `i`. Whatever stays on the stack at the end has answer 0.'],
    }),

    lab({
      id: 'algo4-minstack',
      title: 'MinStack',
      kind: 'code',
      difficulty: 2,
      minutes: 10,
      tags: ['stack', 'design'],
      interview: true,
      prompt: `Implement \`class MinStack\` with **O(1)** \`push(x)\`, \`pop()\` (returns the removed value), \`top()\`, \`getMin()\` (smallest value currently in the stack) and \`size\` (getter). Calling \`pop\`/\`top\`/\`getMin\` on an empty stack returns \`undefined\`.`,
      expose: ['MinStack'],
      files: jsFile(`class MinStack {
  constructor() {
    
  }

  push(x) {}
  pop() {}
  top() {}
  getMin() {}
  get size() {
    return 0;
  }
}
`, `class MinStack {
  constructor() {
    this.items = [];
    this.mins = [];
  }

  push(x) {
    this.items.push(x);
    this.mins.push(this.mins.length === 0 ? x : Math.min(x, this.mins[this.mins.length - 1]));
  }

  pop() {
    this.mins.pop();
    return this.items.pop();
  }

  top() {
    return this.items[this.items.length - 1];
  }

  getMin() {
    return this.mins[this.mins.length - 1];
  }

  get size() {
    return this.items.length;
  }
}
`),
      tests: [
        ex('push / top / getMin', ({ env, expect }) => {
          const s = new env.MinStack();
          s.push(-2); s.push(0); s.push(-3);
          expect([s.getMin(), s.top(), s.size]).toEqual([-3, -3, 3]);
        }),
        ex('min is restored after pop', ({ env, expect }) => {
          const s = new env.MinStack();
          s.push(-2); s.push(0); s.push(-3);
          expect(s.pop()).toBe(-3);
          expect([s.top(), s.getMin()]).toEqual([0, -2]);
        }),
        ex('duplicates of the minimum', ({ env, expect }) => {
          const s = new env.MinStack();
          s.push(2); s.push(2); s.push(2);
          s.pop(); s.pop();
          expect(s.getMin()).toBe(2);
        }),
        ex('empty stack', ({ env, expect }) => {
          const s = new env.MinStack();
          expect([s.pop(), s.top(), s.getMin(), s.size]).toEqual([undefined, undefined, undefined, 0]);
        }),
        prop('property: always agrees with Math.min over the contents', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.array(gen.int(-9, 20), 0, 40)], (ops: number[]) => {
            const s = new env.MinStack();
            const model: number[] = [];
            for (const op of ops) {
              if (op > 12 && model.length) { expect(s.pop()).toBe(model.pop()); }
              else { s.push(op); model.push(op); }
              expect(s.getMin()).toBe(model.length ? Math.min(...model) : undefined);
              expect(s.size).toBe(model.length);
            }
          });
        }),
        perf('getMin is O(1): 50,000 operations', async ({ env, expect, measure }) => {
          const s = new env.MinStack();
          const { steps } = await measure(() => { for (let i = 0; i < 50000; i++) { s.push(i % 97); s.getMin(); } for (let i = 0; i < 50000; i++) s.pop(); }, { budget: 3_000_000 });
          expect(steps).toBeLessThan(50000 * 12);
        }),
      ],
      hints: ['Keep a second stack (or store pairs) holding the minimum **so far** for each position.', 'On `push(x)` the new running minimum is `min(x, previous running minimum)`.', 'On `pop`, pop both stacks.'],
    }),

    lab({
      id: 'algo4-rpn',
      title: 'Evaluate Reverse Polish Notation',
      kind: 'code',
      difficulty: 2,
      minutes: 12,
      tags: ['stack', 'parsing'],
      prompt: `\`evalRPN(tokens)\` — \`tokens\` is an array of strings: integers and the operators \`+ - * /\`. Evaluate the postfix expression. Division truncates **toward zero** (\`Math.trunc\`). The input is always valid.

Example: \`["2","1","+","3","*"]\` → \`(2 + 1) * 3 = 9\`.`,
      expose: ['evalRPN'],
      files: jsFile(`function evalRPN(tokens) {\n  \n}\n`, `function evalRPN(tokens) {
  const stack = [];
  for (const t of tokens) {
    if (t === '+' || t === '-' || t === '*' || t === '/') {
      const b = stack.pop();
      const a = stack.pop();
      stack.push(t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : Math.trunc(a / b));
    } else stack.push(Number(t));
  }
  return stack.pop();
}
`),
      tests: [
        ex('examples', ({ env, expect }) => {
          expect(env.evalRPN(['2', '1', '+', '3', '*'])).toBe(9);
          expect(env.evalRPN(['4', '13', '5', '/', '+'])).toBe(6);
          expect(env.evalRPN(['10', '6', '9', '3', '+', '-11', '*', '/', '*', '17', '+', '5', '+'])).toBe(22);
        }),
        ex('operand order matters for - and /', ({ env, expect }) => {
          expect(env.evalRPN(['5', '3', '-'])).toBe(2);
          expect(env.evalRPN(['8', '2', '/'])).toBe(4);
        }),
        ex('division truncates toward zero', ({ env, expect }) => {
          expect(env.evalRPN(['7', '-2', '/'])).toBe(-3);
          expect(env.evalRPN(['-7', '2', '/'])).toBe(-3);
        }),
        ex('a single number', ({ env, expect }) => expect(env.evalRPN(['42'])).toBe(42)),
        hid('long expressions', ({ env, expect }) => {
          const tokens = ['1'];
          for (let i = 0; i < 2000; i++) tokens.push('1', '+');
          expect(env.evalRPN(tokens)).toBe(2001);
        }),
      ],
      hints: ['Push numbers. On an operator pop **b** first, then **a**, and push `a op b`.', 'Use `Math.trunc(a / b)` for division; `Number(token)` converts strings (negative numbers like `"-11"` are numbers, not operators).'],
    }),
  ],
  references: [{ title: 'Skiena — The Algorithm Design Manual, §3.2 Stacks and Queues' }],
};
export default mod;
