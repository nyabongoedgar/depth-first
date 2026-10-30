/** Assertions with readable failure messages. */

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

export function show(v: unknown, depth = 0, seen = new Set<unknown>()): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'function') return '[Function ' + ((v as Function).name || 'anonymous') + ']';
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
  if (typeof v === 'bigint') return v + 'n';
  if (typeof v === 'symbol') return v.toString();
  if (typeof v !== 'object') return String(v);
  if (seen.has(v)) return '[Circular]';
  if (v instanceof Error) return v.name + ': ' + v.message;
  if (depth > 4) return Array.isArray(v) ? '[…]' : '{…}';
  seen.add(v);
  let out: string;
  if (Array.isArray(v)) {
    const items = v.slice(0, 30).map((x) => show(x, depth + 1, seen));
    out = '[' + items.join(', ') + (v.length > 30 ? ', … +' + (v.length - 30) : '') + ']';
  } else if (v instanceof Map) {
    out = 'Map(' + [...v].slice(0, 20).map(([k, x]) => show(k, depth + 1, seen) + ' => ' + show(x, depth + 1, seen)).join(', ') + ')';
  } else if (v instanceof Set) {
    out = 'Set(' + [...v].slice(0, 20).map((x) => show(x, depth + 1, seen)).join(', ') + ')';
  } else if (ArrayBuffer.isView(v)) {
    out = (v as any).constructor.name + '[' + Array.from(v as any).slice(0, 30).join(', ') + ']';
  } else {
    const keys = Object.keys(v as object);
    const body = keys.slice(0, 20).map((k) => k + ': ' + show((v as any)[k], depth + 1, seen));
    out = '{' + body.join(', ') + (keys.length > 20 ? ', …' : '') + '}';
  }
  seen.delete(v);
  const s = out.length > 400 ? out.slice(0, 400) + '…' : out;
  return s;
}

export function deepEqual(a: any, b: any): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !deepEqual(v, b.get(k))) return false;
    return true;
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    const x = a as any;
    const y = b as any;
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (!Object.is(x[i], y[i])) return false;
    return true;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

export interface Matchers {
  not: Matchers;
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeType(type: string): void;
  toBeNear(expected: number, tol?: number | { abs?: number; rel?: number }): void;
  toBeLessThan(n: number): void;
  toBeLessThanOrEqual(n: number): void;
  toBeGreaterThan(n: number): void;
  toBeGreaterThanOrEqual(n: number): void;
  toBeBetween(lo: number, hi: number): void;
  toContain(item: unknown): void;
  toHaveLength(n: number): void;
  toMatch(re: RegExp): void;
  toBeInstanceOf(cls: Function): void;
  toThrow(message?: string | RegExp): void;
}

export function expect(actual: unknown, negate = false): Matchers {
  const check = (ok: boolean, msg: string, negMsg: string) => {
    if (negate ? ok : !ok) throw new AssertionError(negate ? negMsg : msg);
  };
  const m: Matchers = {
    get not() {
      return expect(actual, !negate);
    },
    toBe: (e) => check(Object.is(actual, e), `Expected ${show(e)} but got ${show(actual)}`, `Expected value not to be ${show(e)}`),
    toEqual: (e) => check(deepEqual(actual, e), `Expected ${show(e)} but got ${show(actual)}`, `Expected value not to equal ${show(e)}`),
    toBeTruthy: () => check(!!actual, `Expected a truthy value but got ${show(actual)}`, `Expected a falsy value but got ${show(actual)}`),
    toBeFalsy: () => check(!actual, `Expected a falsy value but got ${show(actual)}`, `Expected a truthy value but got ${show(actual)}`),
    toBeType: (t) => check(typeof actual === t, `Expected a ${t} but got ${typeof actual} (${show(actual)})`, `Expected value not to be a ${t}`),
    toBeNear: (e, tol) => {
      const o = typeof tol === 'number' ? { abs: tol } : tol ?? { abs: 1e-9, rel: 1e-9 };
      const a = actual as number;
      const diff = Math.abs(a - e);
      const ok = typeof a === 'number' && !Number.isNaN(a) && (diff <= (o.abs ?? 0) || diff <= (o.rel ?? 0) * Math.abs(e));
      check(ok, `Expected about ${e} but got ${show(actual)}`, `Expected value not to be near ${e}`);
    },
    toBeLessThan: (n) => check((actual as number) < n, `Expected ${show(actual)} < ${n}`, `Expected ${show(actual)} >= ${n}`),
    toBeLessThanOrEqual: (n) => check((actual as number) <= n, `Expected ${show(actual)} <= ${n}`, `Expected ${show(actual)} > ${n}`),
    toBeGreaterThan: (n) => check((actual as number) > n, `Expected ${show(actual)} > ${n}`, `Expected ${show(actual)} <= ${n}`),
    toBeGreaterThanOrEqual: (n) => check((actual as number) >= n, `Expected ${show(actual)} >= ${n}`, `Expected ${show(actual)} < ${n}`),
    toBeBetween: (lo, hi) => check((actual as number) >= lo && (actual as number) <= hi, `Expected ${show(actual)} to be between ${lo} and ${hi}`, `Expected ${show(actual)} to be outside ${lo}..${hi}`),
    toContain: (item) => {
      const ok = typeof actual === 'string' ? actual.includes(item as string) : Array.isArray(actual) ? actual.some((x) => deepEqual(x, item)) : actual instanceof Set ? actual.has(item) : false;
      check(ok, `Expected ${show(actual)} to contain ${show(item)}`, `Expected ${show(actual)} not to contain ${show(item)}`);
    },
    toHaveLength: (n) => check((actual as any)?.length === n, `Expected length ${n} but got ${(actual as any)?.length}`, `Expected length not to be ${n}`),
    toMatch: (re) => check(typeof actual === 'string' && re.test(actual), `Expected ${show(actual)} to match ${re}`, `Expected ${show(actual)} not to match ${re}`),
    toBeInstanceOf: (cls) => check(actual instanceof cls, `Expected an instance of ${cls.name}`, `Expected not an instance of ${cls.name}`),
    toThrow: (message) => {
      let threw = false;
      let err: any;
      try {
        (actual as () => unknown)();
      } catch (e) {
        threw = true;
        err = e;
      }
      let ok = threw;
      if (threw && message !== undefined) {
        const text = String(err && err.message);
        ok = typeof message === 'string' ? text.includes(message) : message.test(text);
      }
      check(ok, threw ? `Expected error message to match ${show(message)} but got ${show(err && err.message)}` : 'Expected the function to throw, but it did not', 'Expected the function not to throw');
    },
  };
  return m;
}

export function fail(message: string): never {
  throw new AssertionError(message);
}
