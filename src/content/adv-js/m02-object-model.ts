import type { Module } from '../../core/types';
import { ex, prop, hid, lab, jsFile } from '../helpers';

const mod: Module = {
  id: 'object-model',
  course: 'adv-js',
  title: 'The Object Model: Prototypes, Descriptors & `new`',
  minutes: 45,
  objectives: [
    'Walk the prototype chain by hand and predict property lookups, including shadowing',
    'Explain exactly what the `new` operator does, step by step',
    'Re-implement `instanceof`, `Object.create` and classical inheritance',
    'Use property descriptors (writable / enumerable / configurable, getters and setters)',
  ],
  body: `
## Objects are bags of properties with a hidden link

Every object has an internal slot **[[Prototype]]** pointing to another object (or \`null\`). You can read it with \`Object.getPrototypeOf(obj)\` (or the legacy \`obj.__proto__\`).

When you read \`obj.name\`, the engine does the **[[Get]]** algorithm:

1. Does \`obj\` have its **own** property \`name\`? → return it.
2. Otherwise follow [[Prototype]] and repeat on that object.
3. Reach \`null\` → return \`undefined\`.

\`\`\`js run
const animal = { eats: true, speak() { return "..."; } };
const dog = Object.create(animal);   // dog's [[Prototype]] is animal
dog.name = "Rex";

console.log(dog.name);                // own property → "Rex"
console.log(dog.eats);                // inherited from animal → true
console.log(dog.speak());             // inherited method → "..."
console.log(Object.keys(dog));        // only OWN enumerable keys → ["name"]
console.log("eats" in dog, dog.hasOwnProperty("eats"));   // true false
\`\`\`

**Writes are different from reads.** \`dog.eats = false\` creates an *own* property on \`dog\` that **shadows** the inherited one — it doesn't modify \`animal\`.

\`\`\`js run
const base = { count: 1 };
const child = Object.create(base);
child.count = 2;                // shadows, doesn't touch base
console.log(base.count, child.count);          // 1 2
delete child.count;
console.log(child.count);                      // 1 — the inherited one shows through again
\`\`\`

## Functions, \`prototype\` and constructors

Don't confuse the two similar names:

- **\`obj.__proto__\`** (really \`[[Prototype]]\`): the object *that obj inherits from*.
- **\`Fn.prototype\`**: a plain object that becomes the [[Prototype]] of instances created with \`new Fn()\`.

\`\`\`js run
function Person(name) { this.name = name; }
Person.prototype.hello = function () { return "Hi, I'm " + this.name; };

const p = new Person("Ada");
console.log(Object.getPrototypeOf(p) === Person.prototype);   // true
console.log(p.hello());
console.log(p.constructor === Person);        // true — found via Person.prototype.constructor
\`\`\`

## What \`new\` really does

\`new F(...args)\` is four steps:

1. Create a fresh empty object \`obj\`.
2. Set \`obj\`'s [[Prototype]] to \`F.prototype\`.
3. Call \`F\` with \`this = obj\` and the arguments.
4. If \`F\` returned an **object**, that is the result; otherwise the result is \`obj\`.

Step 4 explains a classic surprise: a constructor that returns an object replaces the instance; returning a primitive is ignored.

## \`class\` is sugar over this

\`\`\`js run
class Animal {
  constructor(name) { this.name = name; }
  speak() { return this.name + " makes a sound"; }
}
class Dog extends Animal {
  speak() { return super.speak() + " (woof)"; }
}
console.log(new Dog("Rex").speak());
console.log(typeof Animal, Object.getPrototypeOf(Dog) === Animal);   // function true
\`\`\`

\`class\` adds real differences too (not callable without \`new\`, methods non-enumerable, strict mode, private fields \`#x\`), but the inheritance mechanism is still prototypes: \`Dog.prototype\`'s [[Prototype]] is \`Animal.prototype\`, and \`Dog\`'s [[Prototype]] is \`Animal\` (so static methods inherit too).

## Property descriptors

Each property has attributes you can inspect and control:

\`\`\`js run
const o = {};
Object.defineProperty(o, "id", { value: 42, writable: false, enumerable: false, configurable: false });
o.id = 7;                                  // silently ignored (throws in strict mode)
console.log(o.id, Object.keys(o));         // 42 []
console.log(Object.getOwnPropertyDescriptor(o, "id"));

const temp = {
  _c: 25,
  get f() { return this._c * 9 / 5 + 32; },   // accessor property
  set f(v) { this._c = (v - 32) * 5 / 9; },
};
temp.f = 212;
console.log(temp._c);                       // 100
\`\`\`

\`Object.freeze\` makes properties non-writable and non-configurable (shallowly!); \`Object.seal\` prevents adding/removing; \`Object.preventExtensions\` prevents adding.

:::warn
**Prototype pollution.** If code copies untrusted keys into an object (\`merge(target, userInput)\`), a key like \`__proto__\` or \`constructor.prototype\` can modify \`Object.prototype\` and affect *every* object in the program. Defences: \`Object.create(null)\` dictionaries, \`Map\`, blocking those keys, or \`Object.freeze(Object.prototype)\` in hardened environments.
:::

:::deep
Performance note: engines implement objects with **hidden classes (shapes)** and **inline caches**. Objects created with the same properties in the same order share a shape, which makes property access fast. Adding properties in different orders, or deleting properties, makes objects "dictionary mode" and slower. Initialise all fields in the constructor, in the same order.
:::
`,
  quiz: [
    { q: 'You run `child.x = 5` where `x` exists only on `child`\'s prototype. What happens?', options: ['The prototype\'s x changes', 'child gets its own x that shadows the prototype\'s', 'A TypeError is thrown', 'Nothing'], answer: 1, why: 'Assignment creates an own property on the receiver; reads then find the own property first.' },
    { q: 'What is `Object.getPrototypeOf(new Person())`?', options: ['Person', 'Person.prototype', 'Object', 'null'], answer: 1, why: '`new` links the instance to the constructor\'s `prototype` object.' },
    { q: 'A constructor ends with `return 42;`. What does `new F()` give?', options: ['42', 'The new object', 'undefined', 'A TypeError'], answer: 1, why: 'Only a returned *object* replaces the instance; primitives are ignored.' },
    { q: 'Which makes a property invisible to `Object.keys` and `for…in`?', options: ['writable: false', 'enumerable: false', 'configurable: false', 'It is impossible'], answer: 1, why: '`enumerable` controls whether it shows up when listing keys.' },
  ],
  labs: [
    lab({
      id: 'adv2-new',
      title: 'Re-implement the `new` operator',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['prototypes'],
      prompt: `Write \`myNew(Ctor, ...args)\` that behaves like \`new Ctor(...args)\` for ordinary constructor **functions** (not classes). Follow the four steps from the lesson. Don't use \`new\` or \`Reflect.construct\` yourself.`,
      expose: ['myNew'],
      files: jsFile(
        `function myNew(Ctor, ...args) {
  
}
`,
        `function myNew(Ctor, ...args) {
  const obj = Object.create(Ctor.prototype);
  const result = Ctor.apply(obj, args);
  return (typeof result === 'object' && result !== null) || typeof result === 'function' ? result : obj;
}
`
      ),
      tests: [
        ex('creates an object linked to Ctor.prototype', ({ env, expect }) => {
          function P(this: any, n: string) { this.n = n; }
          P.prototype.hi = function () { return 'hi ' + this.n; };
          const p = env.myNew(P, 'Ada');
          expect(p.n).toBe('Ada');
          expect(Object.getPrototypeOf(p)).toBe(P.prototype);
          expect(p.hi()).toBe('hi Ada');
          expect(p instanceof P).toBe(true);
        }),
        ex('passes all arguments', ({ env, expect }) => {
          function S(this: any, a: number, b: number, c: number) { this.sum = a + b + c; }
          expect(env.myNew(S, 1, 2, 3).sum).toBe(6);
        }),
        ex('a constructor that returns an object replaces the instance', ({ env, expect }) => {
          const other = { special: true };
          function R(this: any) { this.x = 1; return other; }
          expect(env.myNew(R)).toBe(other);
        }),
        ex('a constructor that returns a primitive is ignored', ({ env, expect }) => {
          function Q(this: any) { this.x = 1; return 42 as any; }
          expect(env.myNew(Q).x).toBe(1);
        }),
        hid('does not call `new` or Reflect.construct itself', ({ code, expect }) => {
          expect(/\bnew\s+Ctor\b|Reflect\s*\.\s*construct/.test(code)).toBe(false);
        }, 'structural'),
      ],
      hints: [
        'Step 1 and 2 together: `Object.create(Ctor.prototype)` makes an empty object linked to the right prototype.',
        'Step 3: `Ctor.apply(obj, args)` calls the constructor with `this = obj`.',
        'Step 4: if the result is an object (or function), return it; otherwise return `obj`. Remember `typeof null === "object"`.',
      ],
    }),

    lab({
      id: 'adv2-instanceof',
      title: 'Re-implement `instanceof`',
      kind: 'code',
      difficulty: 2,
      minutes: 10,
      tags: ['prototypes'],
      prompt: `Write \`myInstanceOf(obj, Ctor)\`: true when \`Ctor.prototype\` appears anywhere in \`obj\`'s prototype chain.

- Primitives (numbers, strings, \`null\`, \`undefined\`…) are never instances → \`false\`.
- Walk the chain with \`Object.getPrototypeOf\` — don't use \`instanceof\`.
- Throw a \`TypeError\` if \`Ctor\` is not a function.`,
      expose: ['myInstanceOf'],
      files: jsFile(
        `function myInstanceOf(obj, Ctor) {
  
}
`,
        `function myInstanceOf(obj, Ctor) {
  if (typeof Ctor !== 'function') throw new TypeError('Right-hand side of instanceof is not callable');
  if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) return false;
  const target = Ctor.prototype;
  let p = Object.getPrototypeOf(obj);
  while (p !== null) {
    if (p === target) return true;
    p = Object.getPrototypeOf(p);
  }
  return false;
}
`
      ),
      tests: [
        ex('direct and inherited instances', ({ env, expect }) => {
          class A {}
          class B extends A {}
          const b = new B();
          expect([env.myInstanceOf(b, B), env.myInstanceOf(b, A), env.myInstanceOf(b, Object)]).toEqual([true, true, true]);
          expect(env.myInstanceOf(new A(), B)).toBe(false);
        }),
        ex('arrays and functions are objects', ({ env, expect }) => {
          expect([env.myInstanceOf([], Array), env.myInstanceOf([], Object), env.myInstanceOf(() => 1, Function)]).toEqual([true, true, true]);
        }),
        ex('primitives are never instances', ({ env, expect }) => {
          expect([env.myInstanceOf(1, Number), env.myInstanceOf('s', String), env.myInstanceOf(null, Object), env.myInstanceOf(undefined, Object)]).toEqual([false, false, false, false]);
        }),
        ex('Object.create(null) objects have no chain', ({ env, expect }) => {
          expect(env.myInstanceOf(Object.create(null), Object)).toBe(false);
        }),
        ex('throws a TypeError when the right side is not callable', ({ env, expect }) => {
          expect(() => env.myInstanceOf({}, {})).toThrow('callable');
        }),
        hid('does not use the instanceof operator', ({ code, expect }) => expect(/\binstanceof\b/.test(code.replace(/'[^']*'|"[^"]*"/g, ''))).toBe(false), 'structural'),
      ],
      hints: ['Start with `let p = Object.getPrototypeOf(obj)` and loop while `p !== null`.', 'Compare each `p` with `Ctor.prototype`.', 'Guard first: non-function `Ctor` throws, primitive `obj` returns false.'],
    }),

    lab({
      id: 'adv2-inherit',
      title: 'Classical inheritance without `class`',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['prototypes'],
      prompt: `Before \`class\`, inheritance was wired by hand. Write \`inherit(Child, Parent)\` that sets things up so that:

- \`new Child()\` instances inherit \`Parent.prototype\` methods (\`instanceof Parent\` is true);
- \`Child.prototype.constructor === Child\`, and that \`constructor\` property is **non-enumerable** (so \`for…in\` over an instance doesn't list it);
- Child **static** properties inherit from Parent too (\`Object.setPrototypeOf(Child, Parent)\`);
- \`Parent.prototype\` itself is **not modified** (adding methods to \`Child.prototype\` must not leak).

Return \`Child\`.`,
      expose: ['inherit'],
      files: jsFile(
        `function inherit(Child, Parent) {
  
}
`,
        `function inherit(Child, Parent) {
  Child.prototype = Object.create(Parent.prototype);
  Object.defineProperty(Child.prototype, 'constructor', { value: Child, writable: true, configurable: true, enumerable: false });
  Object.setPrototypeOf(Child, Parent);
  return Child;
}
`
      ),
      tests: [
        ex('instances inherit parent methods', ({ env, expect }) => {
          function Animal(this: any, name: string) { this.name = name; }
          Animal.prototype.speak = function () { return this.name + ' makes a sound'; };
          function Dog(this: any, name: string) { Animal.call(this, name); }
          env.inherit(Dog, Animal);
          const d = new (Dog as any)('Rex');
          expect(d.speak()).toBe('Rex makes a sound');
          expect(d instanceof Animal).toBe(true);
        }),
        ex('children can override and extend', ({ env, expect }) => {
          function A(this: any) {}
          A.prototype.who = function () { return 'A'; };
          function B(this: any) {}
          env.inherit(B, A);
          B.prototype.who = function () { return 'B>' + A.prototype.who.call(this); };
          expect(new (B as any)().who()).toBe('B>A');
          expect(new (A as any)().who()).toBe('A');
        }),
        ex('constructor points at Child and is not enumerable', ({ env, expect }) => {
          function A(this: any) {}
          function B(this: any) {}
          env.inherit(B, A);
          expect(B.prototype.constructor).toBe(B);
          const keys: string[] = [];
          for (const k in new (B as any)()) keys.push(k);
          expect(keys).toEqual([]);
        }),
        ex('statics are inherited', ({ env, expect }) => {
          function A(this: any) {}
          (A as any).create = function () { return 'made'; };
          function B(this: any) {}
          env.inherit(B, A);
          expect((B as any).create()).toBe('made');
        }),
        ex('Parent.prototype is not polluted', ({ env, expect }) => {
          function A(this: any) {}
          function B(this: any) {}
          env.inherit(B, A);
          B.prototype.only = 1;
          expect('only' in A.prototype).toBe(false);
        }),
        ex('returns Child', ({ env, expect }) => {
          function A(this: any) {}
          function B(this: any) {}
          expect(env.inherit(B, A)).toBe(B);
        }),
      ],
      hints: ['`Child.prototype = Object.create(Parent.prototype)` gives a new object linked to Parent.prototype.', 'Overwriting `prototype` loses `constructor` — re-add it with `Object.defineProperty(..., { enumerable: false, ... })`.', '`Object.setPrototypeOf(Child, Parent)` makes statics inherit.'],
    }),

    lab({
      id: 'adv2-create',
      title: 'Implement Object.create',
      kind: 'code',
      difficulty: 2,
      minutes: 10,
      tags: ['prototypes', 'descriptors'],
      prompt: `Write \`createObject(proto, descriptors)\` — your own \`Object.create(proto, descriptors)\`.

- \`proto\` may be an object or \`null\` (a dictionary with no inherited keys).
- If \`descriptors\` is given (an object of property descriptors) define them on the new object.
- Throw a \`TypeError\` when \`proto\` is neither an object nor \`null\`.
- You may **not** call \`Object.create\`. (Hint: \`Object.setPrototypeOf\` and \`Object.defineProperties\` are fair game.)`,
      expose: ['createObject'],
      files: jsFile(
        `function createObject(proto, descriptors) {
  
}
`,
        `function createObject(proto, descriptors) {
  if (proto !== null && typeof proto !== 'object' && typeof proto !== 'function') {
    throw new TypeError('Object prototype may only be an Object or null');
  }
  const obj = {};
  Object.setPrototypeOf(obj, proto);
  if (descriptors) Object.defineProperties(obj, descriptors);
  return obj;
}
`
      ),
      tests: [
        ex('links the prototype', ({ env, expect }) => {
          const base = { greet() { return 'hi'; } };
          const o = env.createObject(base);
          expect(Object.getPrototypeOf(o)).toBe(base);
          expect(o.greet()).toBe('hi');
          expect(Object.keys(o)).toEqual([]);
        }),
        ex('null prototype → no inherited keys', ({ env, expect }) => {
          const o = env.createObject(null);
          expect(Object.getPrototypeOf(o)).toBe(null);
          expect('toString' in o).toBe(false);
        }),
        ex('defines property descriptors', ({ env, expect }) => {
          const o = env.createObject({}, { a: { value: 1, enumerable: true }, b: { value: 2 } });
          expect(Object.keys(o)).toEqual(['a']);
          expect(o.b).toBe(2);
          expect(Object.getOwnPropertyDescriptor(o, 'b')!.writable).toBe(false);
        }),
        ex('rejects invalid prototypes', ({ env, expect }) => {
          expect(() => env.createObject(42)).toThrow('Object prototype');
          expect(() => env.createObject(undefined)).toThrow('Object prototype');
        }),
        hid('does not call Object.create', ({ code, expect }) => expect(/Object\s*\.\s*create\s*\(/.test(code)).toBe(false), 'structural'),
      ],
      hints: ['Start from `{}` and change its prototype with `Object.setPrototypeOf(obj, proto)`.', 'Validate `proto` first — `typeof null` is `"object"`, so handle null explicitly.', '`Object.defineProperties(obj, descriptors)` handles the second argument.'],
    }),

    lab({
      id: 'adv2-lookup-predict',
      title: 'Predict: lookups, shadowing, deletes',
      kind: 'predict',
      difficulty: 2,
      minutes: 6,
      tags: ['prototypes', 'predict'],
      prompt: 'Predict the output, one line per `console.log`.',
      snippet: `const a = { x: 1, shared: [] };
const b = Object.create(a);
b.x = 2;
b.shared.push("from b");
console.log(a.x, b.x);
console.log(a.shared.length);
delete b.x;
console.log(b.x);
console.log(Object.keys(b).length, "x" in b, b.hasOwnProperty("x"));
a.x = 99;
console.log(b.x);`,
      explanation: '`b.x = 2` shadows `a.x`. `b.shared` is *not* an own property, so `b.shared.push(...)` mutates the array shared via the prototype (a.shared). Deleting b\'s own `x` exposes the inherited one again — and later changes to `a.x` are visible through `b`.',
      hints: ['Reading `b.shared` finds `a.shared` — it is the same array object.', '`delete` only removes own properties.'],
    }),
  ],
  references: [
    { title: 'MDN — Inheritance and the prototype chain', url: 'https://developer.mozilla.org/docs/Web/JavaScript/Inheritance_and_the_prototype_chain' },
    { title: 'ECMAScript spec — Ordinary object internal methods ([[Get]], [[Set]])', url: 'https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots' },
  ],
};
export default mod;
