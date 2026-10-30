import type { AnswerQuestion, Lab, LabResult } from '../core/types';
import { equivalent, parseNumber } from '../mathkit/expr';

function closeEnough(a: number, b: number, tol: number): boolean {
  if (Number.isNaN(a)) return false;
  if (b === 0) return Math.abs(a) <= 1e-9;
  return Math.abs(a - b) <= tol * Math.abs(b);
}

export function gradeQuestion(q: AnswerQuestion, raw: string | undefined): { ok: boolean; message?: string } {
  const given = (raw ?? '').trim();
  if (given === '') return { ok: false, message: 'No answer given.' };
  switch (q.type) {
    case 'number': {
      const v = parseNumber(given, q.unit);
      if (Number.isNaN(v)) return { ok: false, message: 'Enter a number' + (q.unit ? ` (in ${q.unit})` : '') + '.' };
      return closeEnough(v, q.answer as number, q.tolerance ?? 1e-6)
        ? { ok: true }
        : { ok: false, message: 'Not quite — check your arithmetic and units' + (q.unit ? ` (answer in ${q.unit})` : '') + '.' };
    }
    case 'text': {
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
      const accepted = (Array.isArray(q.answer) ? q.answer : [q.answer]).map((x) => norm(String(x)));
      return accepted.includes(norm(given)) ? { ok: true } : { ok: false, message: 'Not quite.' };
    }
    case 'expr': {
      const ok = equivalent(given, String(q.answer), q.vars);
      return ok ? { ok: true } : { ok: false, message: 'That expression is not equivalent to the answer (any equivalent form is accepted).' };
    }
    case 'choice':
      return Number(given) === q.answer ? { ok: true } : { ok: false, message: 'Not quite.' };
    case 'list': {
      const parts = given.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
      const want = q.answer as Array<number | string>;
      if (parts.length !== want.length) return { ok: false, message: `Expected ${want.length} values, separated by commas.` };
      const ok = parts.every((p, i) =>
        typeof want[i] === 'number' ? closeEnough(parseNumber(p), want[i] as number, q.tolerance ?? 1e-6) : p.toLowerCase() === String(want[i]).toLowerCase()
      );
      return ok ? { ok: true } : { ok: false, message: 'At least one value is off.' };
    }
  }
}

export function gradeAnswers(lab: Lab, answers: Record<string, string>): LabResult {
  const out: LabResult['answers'] = {};
  let all = true;
  for (const q of lab.questions ?? []) {
    const r = gradeQuestion(q, answers[q.id]);
    out[q.id] = r;
    if (!r.ok) all = false;
  }
  return { labId: lab.id, status: all ? 'pass' : 'fail', tests: [], logs: [], answers: out };
}
