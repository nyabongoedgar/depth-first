import { show } from './expect';

/** A console that records output for display instead of printing it. */
export function makeConsole(logs: string[], limit = 400) {
  const fmt = (v: unknown) => (typeof v === 'string' ? v : show(v));
  const push =
    (prefix = '') =>
    (...args: unknown[]) => {
      if (logs.length < limit) logs.push((prefix ? prefix + ' ' : '') + args.map(fmt).join(' '));
      else if (logs.length === limit) logs.push('… (output truncated)');
    };
  return {
    log: push(),
    info: push(),
    debug: push(),
    table: push(),
    warn: push('Warning:'),
    error: push('Error:'),
    group: () => {},
    groupEnd: () => {},
    time: () => {},
    timeEnd: () => {},
    assert: (c: unknown, ...a: unknown[]) => {
      if (!c) push('Assertion failed:')(...a);
    },
  };
}
