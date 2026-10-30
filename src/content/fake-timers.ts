/** Deterministic timers for tests: nothing fires until you `advance()` virtual time. */
const realTick = () => new Promise<void>((r) => setTimeout(r, 0));

export class FakeTimers {
  t = 0;
  private seq = 0;
  private timers: { id: number; at: number; seq: number; fn: (...a: any[]) => void }[] = [];
  cleared = 0;

  setTimeout = (fn: (...a: any[]) => void, ms = 0) => {
    const id = ++this.seq;
    this.timers.push({ id, at: this.t + Math.max(0, ms), seq: id, fn });
    return id as any;
  };
  clearTimeout = (id: any) => {
    const n = this.timers.length;
    this.timers = this.timers.filter((x) => x.id !== id);
    if (this.timers.length < n) this.cleared++;
  };
  now = () => this.t;
  get pending() {
    return this.timers.length;
  }
  /** Fire every timer due within the next `ms` virtual milliseconds, letting promises settle between timers. */
  async advance(ms: number) {
    const end = this.t + ms;
    await realTick();
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const next = this.timers[0];
      if (!next || next.at > end) break;
      this.timers.shift();
      this.t = next.at;
      next.fn();
      await realTick();
    }
    this.t = end;
    await realTick();
  }
  async flush() {
    await realTick();
  }
}

/** A deferred promise that the test settles by hand. */
export function deferred<T = unknown>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.catch(() => {}); // a test-side handler so an unattended rejection never crashes the runner
  return { promise, resolve, reject };
}

export const tick = realTick;
