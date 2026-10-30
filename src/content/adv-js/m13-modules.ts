import type { Module } from '../../core/types';
import { ex, hid, lab, jsFile } from '../helpers';

const RESOLVE_SRC = `function dirname(p) {
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i);
}

function normalize(path) {
  const out = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return '/' + out.join('/');
}

function resolveModule(files, fromPath, request) {
  const base = request.startsWith('.') || request.startsWith('/') ? normalize(request.startsWith('/') ? request : dirname(fromPath) + '/' + request) : '/node_modules/' + request;
  const candidates = [base, base + '.js', base + '/index.js'];
  for (const c of candidates) if (Object.prototype.hasOwnProperty.call(files, c)) return c;
  throw new Error("Cannot find module '" + request + "' from '" + fromPath + "'");
}
`;

const mod: Module = {
  id: 'modules-bundlers',
  course: 'adv-js',
  title: 'Modules, Module Resolution & Bundlers',
  minutes: 45,
  objectives: [
    'Compare CommonJS and ES modules (live bindings, static analysis, cycles)',
    'Implement Node-style module resolution and a CommonJS loader with caching and cycles',
    'Order a dependency graph (topological sort) and detect circular dependencies',
    'Explain tree shaking as reachability analysis',
  ],
  body: `
## Why modules

Without modules every script shares one global namespace. Modules give each file its own scope plus explicit **imports/exports**, which lets tools understand the **dependency graph** — the foundation for bundlers, tree shaking, code splitting and caching.

## CommonJS (Node's original system)

\`\`\`js
// math.js
exports.add = (a, b) => a + b;        // or: module.exports = { add }
// app.js
const { add } = require("./math");
\`\`\`

- \`require()\` is a **function call**, so it is **dynamic** (can sit in an \`if\`, take a computed string) and **synchronous**.
- Each file is wrapped: \`(function (exports, require, module, __filename, __dirname) { … })\`. That wrapper is why top-level variables aren't global.
- Modules are **cached** by resolved path; the code runs once, later \`require\`s return the same \`module.exports\`.
- It exports a **copy/reference of the value at the time**, not a live view.
- **Cycles:** if A requires B and B requires A, B receives A's *partially filled* \`exports\` at that moment.

## ES modules (the standard)

\`\`\`js
export const x = 1;                   // named
export default function () {}         // default
import { x } from "./a.js";           // static: must be at top level, string literal
const m = await import("./b.js");     // dynamic import() is a promise
\`\`\`

- **Static structure** → tools can analyse imports **without running code** (enables tree shaking).
- **Live bindings:** an import is a read-only *view* of the exporter's variable — if the exporter changes it, importers see the change.
- Loaded **asynchronously**, in strict mode, with top-level \`await\`; cycles are handled by instantiating all modules first, then evaluating (so you may hit the TDZ instead of a half-empty object).
- Resolution in browsers uses URLs; in Node it follows package.json \`exports\`/\`type\` fields.

| | CommonJS | ES modules |
|---|---|---|
| Syntax | \`require\` / \`module.exports\` | \`import\` / \`export\` |
| Loading | synchronous | asynchronous |
| Bindings | value snapshot | live read-only view |
| Static analysis | hard | easy (tree shaking) |
| Top-level \`await\` | no | yes |

## Node-style resolution

\`require("./util")\` from \`/src/app.js\` tries, in order: \`/src/util\`, \`/src/util.js\`, \`/src/util/index.js\` (and \`.json\`, \`.node\`, and package.json \`main\`). A **bare** specifier like \`"lodash"\` walks up the tree looking in \`node_modules\` folders: \`/src/node_modules/lodash\`, \`/node_modules/lodash\`, …

## What a bundler does

1. **Start at the entry**, parse it, find its imports.
2. **Resolve** each specifier to a file; recurse → a **dependency graph**.
3. **Transform** (TypeScript, JSX, minify…).
4. **Order and wrap** modules into scopes and emit one (or several, for code splitting) files with a tiny runtime like the loader you will write.
5. **Tree shake:** keep only exports that are *reachable* from the entry. This is a mark phase: start from live exports, follow "this code uses that symbol" edges, drop everything unmarked. It only works when imports are static and modules have **no side effects** (\`"sideEffects": false\`).

:::tip
Circular imports are a code smell: they work by accident of evaluation order. Break the cycle by extracting the shared part into a third module.
:::

:::warn
**Supply chain.** \`node_modules\` is code you didn't write running with your permissions. Pin versions with a lockfile, audit, and prefer fewer, well-maintained dependencies.
:::
`,
  quiz: [
    { q: 'Why can bundlers tree-shake ES modules more reliably than CommonJS?', options: ['ESM is faster', 'import/export are static, so the graph can be analysed without running code', 'CommonJS has no exports', 'ESM files are smaller'], answer: 1, why: '`require()` can be called dynamically; static syntax can be analysed up front.' },
    { q: 'In a circular CommonJS dependency, what does the second module get when it `require`s the first (still loading) module?', options: ['An error', 'The first module\'s partially-populated `exports` object', 'undefined', 'A fresh copy'], answer: 1, why: 'The cache entry exists from the start of loading, so you receive whatever has been exported so far.' },
    { q: 'What is a "live binding"?', options: ['A binding that updates over the network', 'An imported name that always reflects the exporter\'s current value', 'A Proxy', 'A deprecated feature'], answer: 1, why: 'ESM imports are read-only views of the exporting module\'s variables.' },
    { q: 'Where does `require("left-pad")` look first for the package?', options: ['The current directory\'s node_modules, then parent directories\' node_modules', 'The internet', 'The global object', 'package.json "name"'], answer: 0, why: 'It walks up the directory tree through `node_modules` folders.' },
  ],
  labs: [
    lab({
      id: 'adv13-resolve',
      title: 'Module resolution',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['modules', 'paths'],
      prompt: `You are given a virtual file system \`files\` (an object mapping absolute paths like \`"/src/app.js"\` to source text). Implement \`resolveModule(files, fromPath, request)\` returning the **absolute path** of the module that \`request\` refers to, as seen from the file \`fromPath\`.

- **Relative/absolute requests** (starting with \`.\` or \`/\`): join with the directory of \`fromPath\`, normalise \`.\` and \`..\` segments, then try in order: the path as given, \`path + ".js"\`, \`path + "/index.js"\`.
- **Bare requests** (\`"lodash"\`): look for \`/node_modules/<request>.js\`, then \`/node_modules/<request>/index.js\`.
- If nothing matches, throw \`Error("Cannot find module '<request>' from '<fromPath>'")\`.
- \`..\` must never climb above the root.`,
      expose: ['resolveModule'],
      files: jsFile(
        `function resolveModule(files, fromPath, request) {
  
}
`,
        RESOLVE_SRC
      ),
      tests: [
        ex('resolves siblings with and without extension', ({ env, expect }) => {
          const files = { '/src/app.js': '', '/src/util.js': '', '/src/data.json.js': '' };
          expect(env.resolveModule(files, '/src/app.js', './util')).toBe('/src/util.js');
          expect(env.resolveModule(files, '/src/app.js', './util.js')).toBe('/src/util.js');
        }),
        ex('directories resolve to index.js', ({ env, expect }) => {
          const files = { '/src/app.js': '', '/src/lib/index.js': '' };
          expect(env.resolveModule(files, '/src/app.js', './lib')).toBe('/src/lib/index.js');
        }),
        ex('parent directories with ..', ({ env, expect }) => {
          const files = { '/src/deep/a.js': '', '/src/shared.js': '' };
          expect(env.resolveModule(files, '/src/deep/a.js', '../shared')).toBe('/src/shared.js');
          expect(env.resolveModule(files, '/src/deep/a.js', './../shared.js')).toBe('/src/shared.js');
        }),
        ex('absolute requests', ({ env, expect }) => {
          const files = { '/a/b.js': '', '/x.js': '' };
          expect(env.resolveModule(files, '/a/b.js', '/x')).toBe('/x.js');
        }),
        ex('bare specifiers come from /node_modules', ({ env, expect }) => {
          const files = { '/src/app.js': '', '/node_modules/lodash/index.js': '', '/node_modules/chalk.js': '' };
          expect(env.resolveModule(files, '/src/app.js', 'lodash')).toBe('/node_modules/lodash/index.js');
          expect(env.resolveModule(files, '/src/app.js', 'chalk')).toBe('/node_modules/chalk.js');
        }),
        ex('exact file wins over .js and index.js', ({ env, expect }) => {
          const files = { '/a.js': '', '/x': '', '/x.js': '', '/x/index.js': '' };
          expect(env.resolveModule(files, '/a.js', './x')).toBe('/x');
        }),
        ex('throws a helpful error for missing modules', ({ env, expect }) => {
          expect(() => env.resolveModule({ '/a.js': '' }, '/a.js', './nope')).toThrow("Cannot find module './nope' from '/a.js'");
        }),
        hid('.. cannot climb above the root', ({ env, expect }) => {
          expect(env.resolveModule({ '/a.js': '', '/x.js': '' }, '/a.js', '../../x')).toBe('/x.js');
        }),
      ],
      hints: ['`dirname("/src/app.js")` is `"/src"`; join with the request and then normalise by walking the segments.', 'Normalise with a stack: skip `""` and `"."`, pop on `".."`, push everything else.', 'Check candidates in order: exact, `+ ".js"`, `+ "/index.js"`; use `Object.prototype.hasOwnProperty.call(files, path)`.'],
    }),

    lab({
      id: 'adv13-commonjs',
      title: 'A CommonJS loader',
      kind: 'code',
      difficulty: 4,
      minutes: 30,
      tags: ['modules'],
      interview: true,
      prompt: `\`resolveModule\` is provided. Implement \`loadModule(files, entry)\` — run the module at path \`entry\` (a key of \`files\`, whose value is its **source code**) and return its \`module.exports\`, exactly like Node's \`require\`:

- Wrap each module's source with \`new Function('module', 'exports', 'require', source)\`; call it with \`this === module.exports\`.
- \`module\` is \`{ id: path, exports: {} }\`; code may add to \`exports\` **or** replace \`module.exports\`.
- Inside a module \`require(request)\` resolves relative to **that module** (use \`resolveModule\`) and returns the loaded module's \`module.exports\`.
- **Cache** by resolved path: each module's code runs **once** per \`loadModule\` call.
- **Cycles:** put the module in the cache *before* running it, so a cyclic \`require\` receives the partially-filled \`exports\`.
- Missing modules propagate the error from \`resolveModule\`.`,
      expose: ['loadModule'],
      files: jsFile(
        RESOLVE_SRC +
          `
function loadModule(files, entry) {
  
}
`,
        RESOLVE_SRC +
          `
function loadModule(files, entry) {
  const cache = Object.create(null);

  function load(path) {
    if (cache[path]) return cache[path].exports;
    const module = { id: path, exports: {} };
    cache[path] = module;
    const localRequire = (request) => load(resolveModule(files, path, request));
    const wrapper = new Function('module', 'exports', 'require', files[path]);
    wrapper.call(module.exports, module, module.exports, localRequire);
    return module.exports;
  }

  return load(entry);
}
`
      ),
      tests: [
        ex('exports and require between modules', ({ env, expect }) => {
          const files = {
            '/app.js': "const m = require('./math'); module.exports = m.add(2, 3);",
            '/math.js': 'exports.add = (a, b) => a + b;',
          };
          expect(env.loadModule(files, '/app.js')).toBe(5);
        }),
        ex('module.exports can be replaced', ({ env, expect }) => {
          const files = { '/a.js': 'module.exports = function hello() { return "hi"; };' };
          expect(env.loadModule(files, '/a.js')()).toBe('hi');
        }),
        ex('require is relative to each module', ({ env, expect }) => {
          const files = {
            '/main.js': "module.exports = require('./lib/a').value;",
            '/lib/a.js': "module.exports = { value: require('./b').x + 1 };",
            '/lib/b.js': 'exports.x = 41;',
          };
          expect(env.loadModule(files, '/main.js')).toBe(42);
        }),
        ex('modules run once (cached)', ({ env, expect }) => {
          (globalThis as any).__loads = 0;
          const files = {
            '/main.js': "require('./c'); require('./c'); require('./d'); module.exports = globalThis.__loads;",
            '/c.js': 'globalThis.__loads++; exports.v = 1;',
            '/d.js': "require('./c');",
          };
          expect(env.loadModule(files, '/main.js')).toBe(1);
          delete (globalThis as any).__loads;
        }),
        ex('circular dependencies see partial exports', ({ env, expect }) => {
          const files = {
            '/a.js': "exports.early = 'a-early'; const b = require('./b'); exports.late = 'a-late'; module.exports.sawB = b.sawA;",
            '/b.js': "const a = require('./a'); exports.sawA = JSON.stringify(a);",
          };
          const a = env.loadModule(files, '/a.js');
          expect(a.sawB).toBe('{"early":"a-early"}');
          expect(a.late).toBe('a-late');
        }),
        ex('top-level this is module.exports', ({ env, expect }) => {
          const files = { '/a.js': 'exports.same = (this === exports); exports.sameModule = (this === module.exports);' };
          expect(env.loadModule(files, '/a.js')).toEqual({ same: true, sameModule: true });
        }),
        ex('a missing module throws the resolution error', ({ env, expect }) => {
          expect(() => env.loadModule({ '/a.js': "require('./nope')" }, '/a.js')).toThrow("Cannot find module './nope'");
        }),
        hid('module-local variables do not leak into the global scope', ({ env, expect }) => {
          env.loadModule({ '/a.js': 'var leaked_from_module = 1; exports.ok = true;' }, '/a.js');
          expect('leaked_from_module' in globalThis).toBe(false);
        }),
        hid('every loadModule call has its own cache', ({ env, expect }) => {
          (globalThis as any).__n = 0;
          const files = { '/a.js': 'globalThis.__n++; exports.n = globalThis.__n;' };
          env.loadModule(files, '/a.js'); env.loadModule(files, '/a.js');
          expect((globalThis as any).__n).toBe(2);
          delete (globalThis as any).__n;
        }),
      ],
      hints: ['An inner `load(path)` function with a `cache` object keyed by resolved path.', 'Create `module = { id, exports: {} }` and store it in the cache **before** running the wrapper — that is what makes cycles work.', '`const fn = new Function("module", "exports", "require", source); fn.call(module.exports, module, module.exports, localRequire);`', 'The local `require` resolves with `resolveModule(files, path, request)` then calls `load` on the result.'],
      why: 'This is, almost line for line, how Node loads CommonJS — and the runtime that bundlers like webpack embed.',
    }),

    lab({
      id: 'adv13-order',
      title: 'Dependency order & circular dependency detection',
      kind: 'code',
      difficulty: 3,
      minutes: 20,
      tags: ['graphs', 'modules'],
      interview: true,
      prompt: `A bundler must emit modules so every module appears **after the modules it imports**. The graph is an object mapping a module id to the array of ids it imports.

Implement \`buildOrder(graph, entry)\`:
- Return the ids reachable from \`entry\` in **dependency-first** order (a depth-first post-order), each exactly once. Follow imports in the order they are listed.
- If the graph has a **cycle** reachable from \`entry\`, throw \`Error('Circular dependency: a -> b -> a')\` listing the cycle path (from the first repeated module around back to it).
- If a module imports an id that is not in \`graph\`, throw \`Error('Missing module: x')\`.`,
      expose: ['buildOrder'],
      files: jsFile(
        `function buildOrder(graph, entry) {
  
}
`,
        `function buildOrder(graph, entry) {
  const order = [];
  const state = new Map(); // 1 = visiting, 2 = done
  const stack = [];

  function visit(id) {
    if (!Object.prototype.hasOwnProperty.call(graph, id)) throw new Error('Missing module: ' + id);
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      const start = stack.indexOf(id);
      throw new Error('Circular dependency: ' + [...stack.slice(start), id].join(' -> '));
    }
    state.set(id, 1);
    stack.push(id);
    for (const dep of graph[id]) visit(dep);
    stack.pop();
    state.set(id, 2);
    order.push(id);
  }

  visit(entry);
  return order;
}
`
      ),
      tests: [
        ex('a chain', ({ env, expect }) => expect(env.buildOrder({ a: ['b'], b: ['c'], c: [] }, 'a')).toEqual(['c', 'b', 'a'])),
        ex('a diamond: shared dependency appears once, before its dependants', ({ env, expect }) => {
          expect(env.buildOrder({ a: ['b', 'c'], b: ['d'], c: ['d'], d: [] }, 'a')).toEqual(['d', 'b', 'c', 'a']);
        }),
        ex('unreachable modules are excluded', ({ env, expect }) => {
          expect(env.buildOrder({ a: ['b'], b: [], z: ['b'] }, 'a')).toEqual(['b', 'a']);
        }),
        ex('a single module', ({ env, expect }) => expect(env.buildOrder({ only: [] }, 'only')).toEqual(['only'])),
        ex('detects a cycle and reports the path', ({ env, expect }) => {
          expect(() => env.buildOrder({ a: ['b'], b: ['c'], c: ['a'] }, 'a')).toThrow('Circular dependency: a -> b -> c -> a');
        }),
        ex('reports only the cycle part of the path', ({ env, expect }) => {
          expect(() => env.buildOrder({ main: ['x'], x: ['y'], y: ['z'], z: ['y'] }, 'main')).toThrow('Circular dependency: y -> z -> y');
        }),
        ex('detects a self-import', ({ env, expect }) => expect(() => env.buildOrder({ a: ['a'] }, 'a')).toThrow('a -> a')),
        ex('missing modules are reported', ({ env, expect }) => expect(() => env.buildOrder({ a: ['ghost'] }, 'a')).toThrow('Missing module: ghost')),
        hid('large graphs: 2,000-module chain works without exceeding the budget', async ({ env, expect, measure }) => {
          const g: Record<string, string[]> = {};
          for (let i = 0; i < 2000; i++) g['m' + i] = i < 1999 ? ['m' + (i + 1)] : [];
          const { value } = await measure(() => env.buildOrder(g, 'm0'));
          expect(value.length).toBe(2000);
          expect(value[0]).toBe('m1999');
        }),
      ],
      hints: ['Depth-first search with three states per module: unvisited, **visiting** (on the current path), **done**.', 'Meeting a *visiting* module means a cycle: the path from its first appearance on your stack to the end is the cycle.', 'Push to `order` **after** visiting all dependencies (post-order).'],
    }),

    lab({
      id: 'adv13-shake',
      title: 'Tree shaking as reachability',
      kind: 'code',
      difficulty: 3,
      minutes: 15,
      tags: ['graphs', 'bundlers'],
      prompt: `A bundler records, for every exported symbol, which other symbols its code uses. \`symbols\` maps a symbol id (like \`"math#add"\`) to the array of symbol ids it uses.

- \`liveSymbols(symbols, roots)\` → the sorted list (alphabetical) of symbols **reachable** from the root symbols (the entry module's used exports). Cycles must not loop forever.
- \`deadSymbols(symbols, roots)\` → the sorted list of defined symbols that are **not** reachable — the code a tree shaker removes.
- A used symbol that isn't defined in \`symbols\` throws \`Error('Unknown symbol: id')\`; so does an unknown root.`,
      expose: ['liveSymbols', 'deadSymbols'],
      files: jsFile(
        `function liveSymbols(symbols, roots) {
  
}

function deadSymbols(symbols, roots) {
  
}
`,
        `function liveSymbols(symbols, roots) {
  const live = new Set();
  const stack = [...roots];
  while (stack.length) {
    const id = stack.pop();
    if (live.has(id)) continue;
    if (!Object.prototype.hasOwnProperty.call(symbols, id)) throw new Error('Unknown symbol: ' + id);
    live.add(id);
    for (const used of symbols[id]) stack.push(used);
  }
  return [...live].sort();
}

function deadSymbols(symbols, roots) {
  const live = new Set(liveSymbols(symbols, roots));
  return Object.keys(symbols).filter((id) => !live.has(id)).sort();
}
`
      ),
      tests: [
        ex('transitive reachability', ({ env, expect }) => {
          const s = { 'app#main': ['a#x'], 'a#x': ['b#y'], 'b#y': [], 'b#unused': ['c#z'], 'c#z': [] };
          expect(env.liveSymbols(s, ['app#main'])).toEqual(['a#x', 'app#main', 'b#y']);
          expect(env.deadSymbols(s, ['app#main'])).toEqual(['b#unused', 'c#z']);
        }),
        ex('cycles terminate', ({ env, expect }) => {
          const s = { a: ['b'], b: ['a', 'c'], c: ['c'], d: [] };
          expect(env.liveSymbols(s, ['a'])).toEqual(['a', 'b', 'c']);
          expect(env.deadSymbols(s, ['a'])).toEqual(['d']);
        }),
        ex('several roots', ({ env, expect }) => {
          const s = { a: [], b: [], c: ['d'], d: [] };
          expect(env.liveSymbols(s, ['a', 'c'])).toEqual(['a', 'c', 'd']);
        }),
        ex('no roots → everything is dead', ({ env, expect }) => {
          expect(env.deadSymbols({ a: [], b: [] }, [])).toEqual(['a', 'b']);
        }),
        ex('unknown symbols throw', ({ env, expect }) => {
          expect(() => env.liveSymbols({ a: ['ghost'] }, ['a'])).toThrow('Unknown symbol: ghost');
          expect(() => env.liveSymbols({ a: [] }, ['nope'])).toThrow('Unknown symbol: nope');
        }),
        hid('does not mutate its inputs', ({ env, expect }) => {
          const s = { a: ['b'], b: [] };
          const roots = ['a'];
          env.liveSymbols(s, roots);
          expect(roots).toEqual(['a']);
          expect(s).toEqual({ a: ['b'], b: [] });
        }),
      ],
      hints: ['Mark phase of a mark-and-sweep: a `Set` of live ids and a stack/queue of ids still to visit.', 'Skip ids already in the set — that is what stops cycles.', '`deadSymbols` is "all defined symbols minus the live ones".'],
    }),
  ],
  references: [
    { title: 'Node.js — Modules: CommonJS', url: 'https://nodejs.org/api/modules.html' },
    { title: 'MDN — JavaScript modules', url: 'https://developer.mozilla.org/docs/Web/JavaScript/Guide/Modules' },
    { title: 'webpack — Tree shaking', url: 'https://webpack.js.org/guides/tree-shaking/' },
  ],
};
export default mod;
