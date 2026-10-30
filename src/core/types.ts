/** Shared types for content, graders and the UI. */

export type CourseId = 'adv-js' | 'node-dist' | 'cloud' | 'ai-ml' | 'math' | 'algos';

export type LabKind =
  | 'code' //    write JS; tests call your exported functions
  | 'config' //  edit JSON (policies, manifests, IaC…); tests evaluate it in a simulator
  | 'answer' //  fill in numbers / expressions / choices
  | 'predict' // predict the output of a snippet, then compare with the real run
  | 'sim'; //    code lab graded inside the distributed-systems simulator (shows a trace)

export type TestKind =
  | 'example'
  | 'property'
  | 'differential'
  | 'metamorphic'
  | 'perf'
  | 'hidden'
  | 'sim'
  | 'numeric'
  | 'structural';

export interface QuizItem {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export interface LabFile {
  path: string;
  language: 'js' | 'json';
  starter: string;
  solution: string;
}

export interface AnswerQuestion {
  id: string;
  prompt: string;
  type: 'number' | 'text' | 'expr' | 'choice' | 'list';
  /** number → number; text → string; expr → expression string; choice → index; list → array of numbers/strings */
  answer: number | string | Array<number | string>;
  /** relative tolerance for numbers (default 1e-6) */
  tolerance?: number;
  unit?: string;
  options?: string[];
  /** variables for `expr` equivalence checking */
  vars?: string[];
  explain?: string;
}

export interface TestCtx {
  /** Names exposed by the learner's code (code/sim labs) or `{ config }` (config labs). */
  env: Record<string, any>;
  /** The learner's original (un-instrumented) source. */
  code: string;
  logs: string[];
  expect: (actual: unknown) => import('../grader/expect').Matchers;
  forAll: typeof import('../grader/prop').forAll;
  gen: typeof import('../grader/prop').gen;
  rng: (seed?: number) => import('../grader/rng').Rng;
  /** Run `fn`, returning its value and how many instrumented steps of *learner code* it executed. */
  measure<T>(fn: () => T | Promise<T>, opts?: { budget?: number }): Promise<{ value: T; steps: number }>;
  /** Attach a trace (e.g. from the simulator) for the UI to draw. */
  attachTrace(trace: unknown): void;
  metric(name: string, value: number): void;
}

export interface TestSpec {
  name: string;
  kind: TestKind;
  /** Hidden tests don't reveal their name until they pass (anti-hard-coding). */
  hidden?: boolean;
  run: (ctx: TestCtx) => void | Promise<void>;
}

export interface Lab {
  id: string;
  title: string;
  kind: LabKind;
  /** Markdown. */
  prompt: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  minutes: number;
  tags?: string[];
  /** Eligible for the timed mock-interview mode. */
  interview?: boolean;
  why?: string;
  /** Names the learner's code must define (code / sim labs). */
  expose?: string[];
  files?: LabFile[];
  tests?: TestSpec[];
  questions?: AnswerQuestion[];
  /** `predict` labs: code whose console output the learner must predict. */
  snippet?: string;
  explanation?: string;
  hints: string[];
  /** Default instrumented-step budget per test (default 30M). */
  stepBudget?: number;
  viz?: 'spacetime';
}

export interface Reference {
  title: string;
  url?: string;
}

export interface Module {
  id: string;
  course: CourseId;
  title: string;
  minutes: number;
  objectives: string[];
  /** Markdown (see src/ui/markdown.tsx for the supported subset). */
  body: string;
  quiz: QuizItem[];
  labs: Lab[];
  references?: Reference[];
}

export interface PlannedModule {
  id: string;
  title: string;
  topics: string;
}

export interface Course {
  id: CourseId;
  title: string;
  icon: string;
  tagline: string;
  level: string;
  modules: Module[];
  /** Modules from the spec that are not authored yet — shown on the roadmap. */
  planned: PlannedModule[];
}

export interface TestResult {
  name: string;
  kind: TestKind;
  pass: boolean;
  hidden?: boolean;
  message?: string;
  steps?: number;
}

export interface LabResult {
  labId: string;
  status: 'pass' | 'fail' | 'error' | 'timeout';
  tests: TestResult[];
  logs: string[];
  /** A compile/runtime error from the learner's code. */
  error?: string;
  metrics?: Record<string, number>;
  trace?: unknown;
  /** Answer labs: per-question verdicts. */
  answers?: Record<string, { ok: boolean; message?: string }>;
  /** Predict labs: the real output. */
  actual?: string[];
}

export interface LabInput {
  files?: Record<string, string>;
  answers?: Record<string, string>;
  predicted?: string;
}
