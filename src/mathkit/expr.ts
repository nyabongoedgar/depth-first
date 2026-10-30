/**
 * A tiny expression engine used to grade math answers by *equivalence* (not by string match):
 * "x^2 + 2x + 1" and "(x+1)^2" are the same. We evaluate both at many random points.
 * Supports + - * / ^, implicit multiplication (2x, 3(x+1)), factorial n!, % suffix,
 * constants pi/e, and common functions.
 */
import { Rng } from '../grader/rng';

export type Ast =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'neg'; a: Ast }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Ast; b: Ast }
  | { t: 'fact'; a: Ast }
  | { t: 'call'; fn: string; args: Ast[] };

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, ln: Math.log, log: Math.log,
  log2: Math.log2, log10: Math.log10, sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil,
  round: Math.round, min: Math.min, max: Math.max, pow: Math.pow, atan2: Math.atan2,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };

interface Tok { k: 'num' | 'id' | 'op' | 'end'; s: string; v?: number }

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/\*\*/g, '^');
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
      if (!m) throw new Error('Bad number near "' + s.slice(i, i + 5) + '"');
      out.push({ k: 'num', s: m[0], v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z_0-9]*/.exec(s.slice(i))!;
      out.push({ k: 'id', s: m[0] });
      i += m[0].length;
      continue;
    }
    if ('+-*/^(),!%'.includes(c)) { out.push({ k: 'op', s: c }); i++; continue; }
    throw new Error('Unexpected character "' + c + '"');
  }
  out.push({ k: 'end', s: '' });
  return out;
}

export function parseExpr(src: string): Ast {
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p];
  const eat = (s?: string) => {
    const t = toks[p];
    if (s !== undefined && t.s !== s) throw new Error(`Expected "${s}" but found "${t.s || 'end of input'}"`);
    p++;
    return t;
  };

  function expr(): Ast {
    let a = term();
    while (peek().k === 'op' && (peek().s === '+' || peek().s === '-')) {
      const op = eat().s as '+' | '-';
      a = { t: 'bin', op, a, b: term() };
    }
    return a;
  }
  function startsFactor(t: Tok) {
    return t.k === 'num' || t.k === 'id' || (t.k === 'op' && t.s === '(');
  }
  function term(): Ast {
    let a = unary();
    for (;;) {
      const t = peek();
      if (t.k === 'op' && (t.s === '*' || t.s === '/')) {
        eat();
        a = { t: 'bin', op: t.s as '*' | '/', a, b: unary() };
      } else if (startsFactor(t)) {
        a = { t: 'bin', op: '*', a, b: power() }; // implicit multiplication
      } else break;
    }
    return a;
  }
  function unary(): Ast {
    if (peek().k === 'op' && peek().s === '-') { eat(); return { t: 'neg', a: unary() }; }
    if (peek().k === 'op' && peek().s === '+') { eat(); return unary(); }
    return power();
  }
  function power(): Ast {
    const base = postfix();
    if (peek().k === 'op' && peek().s === '^') {
      eat();
      const exp = peek().k === 'op' && peek().s === '-' ? (eat(), { t: 'neg', a: power() } as Ast) : power();
      return { t: 'bin', op: '^', a: base, b: exp };
    }
    return base;
  }
  function postfix(): Ast {
    let a = primary();
    while (peek().k === 'op' && (peek().s === '!' || peek().s === '%')) {
      const op = eat().s;
      a = op === '!' ? { t: 'fact', a } : { t: 'bin', op: '/', a, b: { t: 'num', v: 100 } };
    }
    return a;
  }
  function primary(): Ast {
    const t = eat();
    if (t.k === 'num') return { t: 'num', v: t.v! };
    if (t.k === 'id') {
      const lower = t.s.toLowerCase();
      if (peek().k === 'op' && peek().s === '(' && FUNCS[lower]) {
        eat('(');
        const args: Ast[] = [];
        if (!(peek().k === 'op' && peek().s === ')')) {
          args.push(expr());
          while (peek().k === 'op' && peek().s === ',') { eat(); args.push(expr()); }
        }
        eat(')');
        return { t: 'call', fn: lower, args };
      }
      if (CONSTS[lower] !== undefined && lower !== 'e') return { t: 'num', v: CONSTS[lower] };
      if (lower === 'e') return { t: 'var', name: 'e' };
      return { t: 'var', name: t.s };
    }
    if (t.k === 'op' && t.s === '(') {
      const a = expr();
      eat(')');
      return a;
    }
    throw new Error(t.k === 'end' ? 'The expression ends too early' : `Unexpected "${t.s}"`);
  }

  const ast = expr();
  if (peek().k !== 'end') throw new Error(`Unexpected "${peek().s}"`);
  return ast;
}

function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n) || n > 170) return NaN;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function evalAst(a: Ast, env: Record<string, number> = {}): number {
  switch (a.t) {
    case 'num': return a.v;
    case 'var':
      if (a.name in env) return env[a.name];
      if (a.name === 'e') return Math.E;
      throw new Error(`Unknown variable "${a.name}"`);
    case 'neg': return -evalAst(a.a, env);
    case 'fact': return factorial(evalAst(a.a, env));
    case 'call': return FUNCS[a.fn](...a.args.map((x) => evalAst(x, env)));
    case 'bin': {
      const x = evalAst(a.a, env);
      const y = evalAst(a.b, env);
      switch (a.op) {
        case '+': return x + y;
        case '-': return x - y;
        case '*': return x * y;
        case '/': return x / y;
        case '^': return Math.pow(x, y);
      }
    }
  }
}

export function evaluate(src: string, env: Record<string, number> = {}): number {
  return evalAst(parseExpr(src), env);
}

export function variablesOf(a: Ast, acc = new Set<string>()): Set<string> {
  switch (a.t) {
    case 'var': if (a.name !== 'e') acc.add(a.name); break;
    case 'neg': case 'fact': variablesOf(a.a, acc); break;
    case 'bin': variablesOf(a.a, acc); variablesOf(a.b, acc); break;
    case 'call': a.args.forEach((x) => variablesOf(x, acc)); break;
  }
  return acc;
}

/** True when two expressions agree at many random points (so algebraically equal for practical purposes). */
export function equivalent(a: string, b: string, vars?: string[], seed = 12345): boolean {
  let A: Ast;
  let B: Ast;
  try {
    A = parseExpr(a);
    B = parseExpr(b);
  } catch {
    return false;
  }
  const names = vars ?? [...new Set([...variablesOf(A), ...variablesOf(B)])];
  const r = new Rng(seed);
  let good = 0;
  for (let i = 0; i < 80 && good < 24; i++) {
    const env: Record<string, number> = {};
    for (const n of names) env[n] = i < 6 ? [0.5, 1.5, 2, 3, -1.5, 0.25][i] + r.float() * 0.01 : r.float() * 6 - 3;
    let x: number;
    let y: number;
    try {
      x = evalAst(A, env);
      y = evalAst(B, env);
    } catch {
      return false;
    }
    const finiteX = Number.isFinite(x);
    const finiteY = Number.isFinite(y);
    if (!finiteX && !finiteY) continue;
    if (finiteX !== finiteY) return false;
    if (Math.abs(x - y) > 1e-7 * Math.max(1, Math.abs(x), Math.abs(y))) return false;
    good++;
  }
  return good >= 8;
}

/** Parse "3/4", "0.75", "75%", "1e-3", "-2", "3.3 V" (with optional unit) into a number. */
export function parseNumber(s: string, unit?: string): number {
  let t = s.trim();
  if (unit) {
    const u = unit.toLowerCase();
    if (t.toLowerCase().endsWith(u)) t = t.slice(0, t.length - unit.length).trim();
  }
  if (t === '') return NaN;
  try {
    return evaluate(t.replace(/,/g, ''));
  } catch {
    return NaN;
  }
}
