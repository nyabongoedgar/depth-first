import type { Course } from '../../core/types';
import m01 from './m01-closures';
import m02 from './m02-object-model';
import m03 from './m03-this-bind';
import m04 from './m04-event-loop';
import m05 from './m05-promises';
import m06 from './m06-async-patterns';
import m07 from './m07-iterators';
import m08 from './m08-proxy';
import m09 from './m09-functional';
import m10 from './m10-memory';
import m11 from './m11-binary';
import m12 from './m12-streams';
import m13 from './m13-modules';
import m14 from './m14-interpreter';

const course: Course = {
  id: 'adv-js',
  title: 'Advanced JavaScript',
  icon: '🟨',
  tagline: 'Understand the language and runtime deeply enough to explain — and fix — anything in it.',
  level: 'After the JS Bootcamp',
  modules: [m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12, m13, m14],
  planned: [
    { id: 'engine-pipeline', title: 'The engine pipeline & JIT tiers', topics: 'Parsing, AST, bytecode, Ignition/Sparkplug/Maglev/TurboFan, deopts, browser differences' },
    { id: 'hidden-classes', title: 'Hidden classes & inline caches', topics: 'Shapes, monomorphic/polymorphic sites, dictionary mode, why object layout matters (simulator lab)' },
    { id: 'gc-internals', title: 'Garbage-collector internals', topics: 'Generational and mark-sweep-compact collection, write barriers, WeakRef/FinalizationRegistry timing (simulator lab)' },
    { id: 'webassembly', title: 'WebAssembly', topics: 'Memory model, imports/exports, hand-written WAT, when WASM helps' },
    { id: 'browser-perf', title: 'Browser internals & performance', topics: 'Critical rendering path, layout thrash, compositing, long tasks, INP/LCP, trace-graded fixes' },
    { id: 'perf-engineering', title: 'Performance engineering', topics: 'Profiling, flame graphs, benchmarking pitfalls, optimising five programs against op/alloc budgets' },
    { id: 'js-security', title: 'Security for JS engineers', topics: 'XSS, CSP, prototype pollution, supply-chain, SES/Compartments (exploit-then-fix labs)' },
    { id: 'typescript-types', title: 'Advanced TypeScript', topics: 'Conditional, mapped and template-literal types; type-level programming' },
    { id: 'testing-design', title: 'Testing & API design', topics: 'Property-based and mutation testing, error-handling strategy, designing library APIs' },
  ],
};
export default course;
