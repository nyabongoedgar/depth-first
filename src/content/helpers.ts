/** Authoring helpers: compact constructors for tests and labs. */
import type { Lab, LabFile, TestCtx, TestKind, TestSpec } from '../core/types';

type Run = (ctx: TestCtx) => void | Promise<void>;

const mk = (kind: TestKind) => (name: string, run: Run, hidden = false): TestSpec => ({ name, kind, run, hidden });

export const ex = mk('example');
export const prop = mk('property');
export const diff = mk('differential');
export const meta = mk('metamorphic');
export const perf = mk('perf');
export const sim = mk('sim');
export const num = mk('numeric');
export const struct = mk('structural');
/** A hidden test: its name is revealed only when it passes. */
export const hid = (name: string, run: Run, kind: TestKind = 'hidden'): TestSpec => ({ name, kind, run, hidden: true });

/** Single-file JavaScript lab. */
export function jsFile(starter: string, solution: string, path = 'solution.js'): LabFile[] {
  return [{ path, language: 'js', starter: starter.replace(/^\n/, ''), solution: solution.replace(/^\n/, '') }];
}
export function jsonFile(starter: string, solution: string, path = 'config.json'): LabFile[] {
  return [{ path, language: 'json', starter: starter.replace(/^\n/, ''), solution: solution.replace(/^\n/, '') }];
}

export type LabDef = Omit<Lab, 'hints'> & { hints?: string[] };
export const lab = (l: LabDef): Lab => ({ hints: ['Re-read the prompt and the lesson section it relates to.', 'Try the smallest example by hand first.'], ...l });

/** Run `fn` and return how long the learner code took in steps, failing if over budget. */
export async function stepsOf(ctx: TestCtx, fn: () => unknown | Promise<unknown>, budget?: number) {
  return (await ctx.measure(fn, { budget })).steps;
}

/** Fit growth: ratio of steps when n doubles. ~2 → linear, ~4 → quadratic, ~2.2 → n log n. */
export async function growthRatio(ctx: TestCtx, run: (n: number) => unknown, n = 2000, budget = 20_000_000): Promise<{ a: number; b: number; ratio: number }> {
  const a = await stepsOf(ctx, () => run(n), budget);
  const b = await stepsOf(ctx, () => run(n * 2), budget);
  return { a, b, ratio: b / Math.max(a, 1) };
}
