/**
 * Runs a snippet on a *virtual* timer queue so event-loop puzzles are fast and deterministic.
 * Microtask ordering comes from the real engine (it is the real thing); only timers are virtual:
 * `setTimeout`/`setInterval` fire in (time, registration) order and a delay of 0 behaves like 1 ms,
 * as in browsers.
 */
import { instrument } from './instrument';
import { StepBudgetExceeded } from './steps';
import { makeConsole } from './console';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const realTick = () => new Promise<void>((r) => setTimeout(r, 0));

export interface SnippetResult {
  logs: string[];
  error?: string;
}

export async function runSnippet(code: string, opts: { budget?: number; maxFirings?: number } = {}): Promise<SnippetResult> {
  const logs: string[] = [];
  const timers: { id: number; time: number; seq: number; fn: (...a: any[]) => void; args: any[]; every?: number }[] = [];
  let now = 0;
  let seq = 0;
  let nextId = 1;
  let steps = 0;
  const budget = opts.budget ?? 5_000_000;
  const __t = () => {
    if (++steps > budget) throw new StepBudgetExceeded(budget);
  };

  const vSetTimeout = (fn: (...a: any[]) => void, ms = 0, ...args: any[]) => {
    const id = nextId++;
    timers.push({ id, time: now + Math.max(1, Number(ms) || 0), seq: seq++, fn, args });
    return id;
  };
  const vSetInterval = (fn: (...a: any[]) => void, ms = 0, ...args: any[]) => {
    const id = nextId++;
    const every = Math.max(1, Number(ms) || 0);
    timers.push({ id, time: now + every, seq: seq++, fn, args, every });
    return id;
  };
  const vClear = (id: number) => {
    const i = timers.findIndex((t) => t.id === id);
    if (i >= 0) timers.splice(i, 1);
  };
  const vNow = () => now;
  const perf = { now: vNow };

  let program: Function;
  try {
    program = new AsyncFunction('console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', '__t', instrument(code));
  } catch (e: any) {
    return { logs, error: 'SyntaxError: ' + (e.message || e) };
  }

  let error: string | undefined;
  const main = program(makeConsole(logs), vSetTimeout, vClear, vSetInterval, vClear, perf, __t).catch((e: any) => {
    error = describe(e);
  });

  await realTick();
  let firings = 0;
  const maxFirings = opts.maxFirings ?? 500;
  while (timers.length && firings++ < maxFirings) {
    timers.sort((a, b) => a.time - b.time || a.seq - b.seq);
    const t = timers[0];
    now = t.time;
    if (t.every) {
      t.time = now + t.every;
      t.seq = seq++;
    } else timers.shift();
    try {
      t.fn(...t.args);
    } catch (e: any) {
      logs.push('Uncaught ' + describe(e));
    }
    await realTick();
  }
  await main;
  return { logs, error };
}

function describe(e: any): string {
  return e && e.name ? `${e.name}: ${e.message}` : String(e);
}
