/**
 * The lab runner: compiles the learner's code (instrumented), builds the test context and runs the
 * tests. Pure TypeScript with no DOM access, so the same code runs in a Web Worker (browser) and
 * in-process under Node (tools/verify.ts).
 */
import type { Lab, LabInput, LabResult, TestCtx, TestResult } from '../core/types';
import { expect, show } from './expect';
import { forAll, gen } from './prop';
import { Rng } from './rng';
import { instrument } from './instrument';
import { makeCounter, StepBudgetExceeded, DEFAULT_STEP_BUDGET } from './steps';
import { makeConsole } from './console';
import { gradeAnswers } from './answers';
import { runSnippet } from './vloop';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(label)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

function describeError(e: any): string {
  if (e && e.name === 'StepBudgetExceeded') return e.message;
  return e && e.name ? `${e.name}: ${e.message}` : String(e);
}

export interface RunOptions {
  testTimeoutMs?: number;
}

export async function runLab(lab: Lab, input: LabInput = {}, opts: RunOptions = {}): Promise<LabResult> {
  if (lab.kind === 'answer') return gradeAnswers(lab, input.answers ?? {});
  if (lab.kind === 'predict') return gradePrediction(lab, input.predicted ?? '');

  const logs: string[] = [];
  const result: LabResult = { labId: lab.id, status: 'fail', tests: [], logs };
  const file = lab.files?.[0];
  if (!file) {
    result.status = 'error';
    result.error = 'This lab has no files.';
    return result;
  }
  const source = input.files?.[file.path] ?? file.starter;
  const { st, tick } = makeCounter(lab.stepBudget ?? DEFAULT_STEP_BUDGET);

  // ---- 1. compile & run the learner's top-level code ----
  let env: Record<string, any> = {};
  if (file.language === 'json') {
    try {
      env = { config: JSON.parse(source) };
    } catch (e: any) {
      result.status = 'error';
      result.error = 'Your JSON is not valid: ' + e.message;
      return result;
    }
  } else {
    const names = lab.expose ?? [];
    let compiled: Function;
    try {
      const tail = '\n;return {' + names.map((n) => JSON.stringify(n) + ': (typeof ' + n + ' === "undefined" ? undefined : ' + n + ')').join(',') + '};';
      compiled = new AsyncFunction('console', '__t', instrument(source) + tail);
    } catch (e: any) {
      result.status = 'error';
      result.error = 'SyntaxError: ' + (e.message || e);
      return result;
    }
    try {
      env = await withTimeout(Promise.resolve(compiled(makeConsole(logs), tick)), opts.testTimeoutMs ?? 3000, 'Your code took too long to finish.');
    } catch (e: any) {
      result.status = 'error';
      result.error = describeError(e);
      return result;
    }
  }

  // ---- 2. build the test context ----
  const metrics: Record<string, number> = {};
  let trace: unknown;
  const baseBudget = lab.stepBudget ?? DEFAULT_STEP_BUDGET;
  const ctx: TestCtx = {
    env,
    code: source,
    logs,
    expect,
    forAll,
    gen,
    rng: (seed = 1) => new Rng(seed),
    async measure(fn, o) {
      const before = { steps: st.steps, budget: st.budget };
      st.steps = 0;
      st.budget = o?.budget ?? before.budget;
      try {
        const value = await fn();
        return { value, steps: st.steps };
      } finally {
        st.steps = before.steps;
        st.budget = before.budget;
      }
    },
    attachTrace(t) {
      trace = t;
    },
    metric(name, value) {
      metrics[name] = value;
    },
  };

  // ---- 3. run tests ----
  const missing = (lab.expose ?? []).filter((n) => env[n] === undefined);
  let hiddenCount = 0;
  for (const t of lab.tests ?? []) {
    const label = t.hidden ? `Hidden test ${++hiddenCount}` : t.name;
    const r: TestResult = { name: label, kind: t.kind, pass: false, hidden: t.hidden };
    if (missing.length) {
      r.message = `I can't find ${missing.map((m) => '`' + m + '`').join(', ')} — is it defined with exactly that name?`;
      result.tests.push(r);
      continue;
    }
    st.steps = 0;
    st.budget = baseBudget;
    try {
      await withTimeout(Promise.resolve(t.run(ctx)), opts.testTimeoutMs ?? 3000, 'This test timed out.');
      r.pass = true;
      if (t.hidden) r.name = t.name;
    } catch (e: any) {
      r.message = e instanceof StepBudgetExceeded || (e && e.name === 'StepBudgetExceeded') ? e.message : e && e.message ? String(e.message) : show(e);
    }
    r.steps = st.steps;
    result.tests.push(r);
  }

  result.metrics = metrics;
  result.trace = trace;
  result.status = result.tests.length > 0 && result.tests.every((t) => t.pass) ? 'pass' : 'fail';
  return result;
}

async function gradePrediction(lab: Lab, predicted: string): Promise<LabResult> {
  const real = await runSnippet(lab.snippet ?? '');
  const actual = real.logs;
  const given = predicted
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  const same = given.length === actual.length && given.every((l, i) => l === actual[i].trim());
  return {
    labId: lab.id,
    status: same ? 'pass' : 'fail',
    tests: [],
    logs: [],
    actual,
    error: real.error,
  };
}
