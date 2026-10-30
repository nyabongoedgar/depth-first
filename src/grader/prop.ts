/** Property-based testing with shrinking (a compact take on QuickCheck/fast-check). */
import { Rng } from './rng';
import { AssertionError, show } from './expect';

export interface Gen<T> {
  gen(r: Rng, size: number): T;
  shrink(v: T): Iterable<T>;
}

function* shrinkInt(v: number, lo: number, hi: number): Iterable<number> {
  const target = Math.min(Math.max(0, lo), hi);
  if (v === target) return;
  yield target;
  let delta = Math.trunc((v - target) / 2);
  while (delta !== 0) {
    yield v - delta;
    delta = Math.trunc(delta / 2);
  }
  if (v > target) yield v - 1;
  else yield v + 1;
}

export const gen = {
  int(lo = -100, hi = 100): Gen<number> {
    return { gen: (r) => r.int(lo, hi), shrink: (v) => shrinkInt(v, lo, hi) };
  },
  /** Small non-negative ints, grows with test size. */
  nat(max = 100): Gen<number> {
    return { gen: (r, size) => r.int(0, Math.min(max, 2 + size)), shrink: (v) => shrinkInt(v, 0, max) };
  },
  float(lo = -1, hi = 1): Gen<number> {
    return { gen: (r) => lo + r.float() * (hi - lo), shrink: (v) => (v === 0 ? [] : [0, Math.round(v)]) };
  },
  bool(): Gen<boolean> {
    return { gen: (r) => r.bool(), shrink: (v) => (v ? [false] : []) };
  },
  string(maxLen = 12, alphabet = 'abcdefghijklmnopqrstuvwxyz'): Gen<string> {
    return {
      gen: (r, size) => {
        const n = r.int(0, Math.min(maxLen, 1 + size));
        let s = '';
        for (let i = 0; i < n; i++) s += alphabet[r.int(0, alphabet.length - 1)];
        return s;
      },
      *shrink(v) {
        if (v.length === 0) return;
        yield '';
        yield v.slice(0, v.length >> 1);
        yield v.slice(1);
        yield v.slice(0, -1);
      },
    };
  },
  oneOf<T>(values: readonly T[]): Gen<T> {
    return { gen: (r) => r.pick(values), shrink: (v) => (values[0] !== v ? [values[0]] : []) };
  },
  array<T>(g: Gen<T>, minLen = 0, maxLen = 20): Gen<T[]> {
    return {
      gen: (r, size) => {
        const n = r.int(minLen, Math.max(minLen, Math.min(maxLen, minLen + size)));
        return Array.from({ length: n }, () => g.gen(r, size));
      },
      *shrink(v) {
        if (v.length > minLen) {
          yield v.slice(0, minLen);
          yield v.slice(0, Math.max(minLen, v.length >> 1));
          for (let i = 0; i < v.length && i < 12; i++) yield [...v.slice(0, i), ...v.slice(i + 1)];
        }
        for (let i = 0; i < v.length && i < 8; i++) {
          for (const s of g.shrink(v[i])) {
            yield [...v.slice(0, i), s, ...v.slice(i + 1)];
            break;
          }
        }
      },
    };
  },
  /** Sorted array of distinct ints. */
  sortedInts(maxLen = 20, lo = -50, hi = 50): Gen<number[]> {
    const base = gen.array(gen.int(lo, hi), 0, maxLen);
    return {
      gen: (r, size) => [...new Set(base.gen(r, size))].sort((a, b) => a - b),
      *shrink(v) {
        for (const s of base.shrink(v)) yield [...new Set(s)].sort((a, b) => a - b);
      },
    };
  },
};

export interface ForAllOptions {
  runs?: number;
  seed?: number;
}

const clone = <T>(v: T): T => (typeof structuredClone === 'function' ? structuredClone(v) : (JSON.parse(JSON.stringify(v)) as T));

export async function forAll<A extends any[]>(
  gens: { [K in keyof A]: Gen<A[K]> },
  pred: (...args: A) => boolean | void | Promise<boolean | void>,
  opts: ForAllOptions = {}
): Promise<void> {
  const runs = opts.runs ?? 100;
  const seed = opts.seed ?? 1;
  const rng = new Rng(seed);

  const attempt = async (args: A): Promise<string | null> => {
    try {
      const r = await pred(...(clone(args) as A));
      return r === false ? 'property returned false' : null;
    } catch (e: any) {
      if (e && e.name === 'StepBudgetExceeded') throw e;
      return e && e.message ? String(e.message) : String(e);
    }
  };

  for (let run = 0; run < runs; run++) {
    const size = Math.min(1 + Math.floor((run * 30) / runs), 30);
    const args = gens.map((g) => g.gen(rng, size)) as unknown as A;
    const reason = await attempt(args);
    if (reason === null) continue;

    // shrink
    let best = args;
    let bestReason = reason;
    let budget = 400;
    let improved = true;
    while (improved && budget > 0) {
      improved = false;
      for (let i = 0; i < gens.length && !improved; i++) {
        for (const cand of gens[i].shrink(best[i])) {
          if (budget-- <= 0) break;
          const next = [...best] as unknown as A;
          next[i] = cand as any;
          const r = await attempt(next);
          if (r !== null) {
            best = next;
            bestReason = r;
            improved = true;
            break;
          }
        }
      }
    }
    throw new AssertionError(
      `Property failed after ${run + 1} run(s) (seed ${seed}).\nSmallest counterexample: ${best.map((b) => show(b)).join(', ')}\nReason: ${bestReason}`
    );
  }
}
