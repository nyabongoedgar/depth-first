import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, equivalent } from '../src/mathkit/expr';
import { checkLinearizable } from '../src/sim/lin';
import { runLab } from '../src/grader/run';
import { instrument } from '../src/grader/instrument';
import { lab, ex, jsFile } from '../src/content/helpers';

test('expr: parse, evaluate, equivalence', () => {
  assert.equal(evaluate('2*x+1', { x: 3 }), 7);
  assert.ok(equivalent('(x+1)^2', 'x^2+2*x+1', ['x']));
  assert.ok(!equivalent('x^2', 'x^3', ['x']));
});

test('linearizability checker: accepts a fresh read, rejects a stale one', () => {
  const put = { id: 1, client: 'a', type: 'put', key: 'k', value: 1, invoke: 0, ret: 1 } as const;
  const fresh: any[] = [put, { id: 2, client: 'b', type: 'get', key: 'k', result: 1, invoke: 2, ret: 3 }];
  const stale: any[] = [put, { id: 2, client: 'b', type: 'get', key: 'k', result: undefined, invoke: 2, ret: 3 }];
  assert.equal(checkLinearizable(fresh).ok, true);
  assert.equal(checkLinearizable(stale).ok, false);
});

test('grader: a passing lab passes, an infinite loop is cut off', async () => {
  const mk = (src: string) =>
    lab({ id: 't', title: 't', kind: 'code', difficulty: 1, minutes: 1, prompt: '', expose: ['f'], files: jsFile(src, 'function f(){return 1}'), tests: [ex('returns 1', ({ env, expect }) => expect(env.f()).toBe(1))], hints: ['a', 'b'] } as any);
  assert.equal((await runLab(mk('function f(){return 1}'))).status, 'pass');
  const t0 = Date.now();
  const r = await runLab(mk('function f(){ while(true){} }'));
  assert.notEqual(r.status, 'pass');
  assert.ok(Date.now() - t0 < 10000);
});

test('instrument adds step ticks', () => {
  assert.match(instrument('while(x){}'), /__t\(\)/);
});
