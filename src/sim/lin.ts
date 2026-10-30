/**
 * Linearizability checker for a key-value register (Wing & Gong search with memoisation).
 * Keys are independent, so each key is checked separately (P-compositionality).
 *
 * Operations that never got a response ("incomplete") may or may not have taken effect, and if
 * they did it could be at any time after they were invoked.
 */
export interface HistOp {
  id: number;
  client: string;
  type: 'put' | 'get';
  key: string;
  /** put: the value written */
  value?: unknown;
  /** get: the value returned (undefined/null = absent) */
  result?: unknown;
  invoke: number;
  /** undefined → no response was received */
  ret?: number;
}

export interface LinResult {
  ok: boolean;
  key?: string;
  reason?: string;
}

const norm = (v: unknown) => (v === undefined ? null : v);

function checkKey(ops: HistOp[]): boolean {
  // incomplete gets have no observable effect — drop them
  const all = ops.filter((o) => !(o.type === 'get' && o.ret === undefined));
  const n = all.length;
  if (n === 0) return true;
  if (n > 60) throw new Error('History too long to check exactly (more than 60 operations on one key).');
  all.sort((a, b) => a.invoke - b.invoke);
  const required = all.map((o) => o.ret !== undefined);
  const memo = new Set<string>();

  function dfs(done: boolean[], state: string): boolean {
    // all required ops linearized?
    let remainingRequired = false;
    for (let i = 0; i < n; i++) if (!done[i] && required[i]) { remainingRequired = true; break; }
    if (!remainingRequired) return true;
    const memoKey = done.map((d) => (d ? '1' : '0')).join('') + '|' + state;
    if (memo.has(memoKey)) return false;

    // earliest return among not-yet-linearized *required* ops bounds which ops may go next
    let minRet = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && required[i]) minRet = Math.min(minRet, all[i].ret!);

    for (let i = 0; i < n; i++) {
      if (done[i]) continue;
      const op = all[i];
      if (op.invoke > minRet) continue; // started after some other op already finished → can't precede it
      let next = state;
      if (op.type === 'get') {
        if (JSON.stringify(norm(op.result)) !== state) continue;
      } else next = JSON.stringify(norm(op.value));
      done[i] = true;
      if (dfs(done, next)) return true;
      done[i] = false;
    }
    memo.add(memoKey);
    return false;
  }
  return dfs(new Array(n).fill(false), JSON.stringify(null));
}

export function checkLinearizable(history: HistOp[]): LinResult {
  const byKey = new Map<string, HistOp[]>();
  for (const op of history) {
    if (!byKey.has(op.key)) byKey.set(op.key, []);
    byKey.get(op.key)!.push(op);
  }
  for (const [key, ops] of byKey) {
    if (!checkKey(ops)) {
      return { ok: false, key, reason: `No valid ordering of the operations on key "${key}" explains what clients observed.` };
    }
  }
  return { ok: true };
}
