import type { CourseId, LabInput, LabResult } from '../core/types';
import type { SnippetResult } from '../grader/vloop';

let nextId = 1;

function spawn(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
}

function call<T>(payload: Record<string, unknown>, timeoutMs: number, onTimeout: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const w = spawn();
    const id = nextId++;
    const timer = setTimeout(() => {
      w.terminate();
      resolve(onTimeout());
    }, timeoutMs);
    w.onmessage = (e: MessageEvent) => {
      clearTimeout(timer);
      w.terminate();
      if (e.data.ok) resolve(e.data.res as T);
      else reject(new Error(e.data.error));
    };
    w.onerror = (e) => {
      clearTimeout(timer);
      w.terminate();
      reject(new Error(e.message || 'The sandbox crashed'));
    };
    w.postMessage({ id, ...payload });
  });
}

export function runLabInWorker(course: CourseId, labId: string, input: LabInput, timeoutMs = 25000): Promise<LabResult> {
  return call<LabResult>({ type: 'lab', course, labId, input }, timeoutMs, () => ({
    labId,
    status: 'timeout',
    tests: [],
    logs: [],
    error: `Your code ran for more than ${Math.round(timeoutMs / 1000)} seconds and was stopped. Is there an infinite loop?`,
  }));
}

export function runSnippetInWorker(code: string, timeoutMs = 10000): Promise<SnippetResult> {
  return call<SnippetResult>({ type: 'snippet', code }, timeoutMs, () => ({ logs: [], error: 'Timed out — is there an infinite loop?' }));
}
