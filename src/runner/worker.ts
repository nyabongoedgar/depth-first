/// <reference lib="webworker" />
/**
 * Sandboxed runner. Every run gets a brand-new Worker (fresh global state); the page can kill it on timeout.
 * The worker imports the course content itself, so tests (functions) never need to cross the thread boundary.
 */
import { loadCourse } from '../content/index';
import { runLab } from '../grader/run';
import { runSnippet } from '../grader/vloop';
import type { CourseId, LabInput } from '../core/types';

type Msg =
  | { id: number; type: 'lab'; course: CourseId; labId: string; input: LabInput }
  | { id: number; type: 'snippet'; code: string };

self.onunhandledrejection = (e) => e.preventDefault();

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data;
  try {
    if (m.type === 'snippet') {
      const res = await runSnippet(m.code);
      (self as any).postMessage({ id: m.id, ok: true, res });
      return;
    }
    const course = await loadCourse(m.course);
    const lab = course.modules.flatMap((mod) => mod.labs).find((l) => l.id === m.labId);
    if (!lab) throw new Error('Unknown lab ' + m.labId);
    const res = await runLab(lab, m.input);
    (self as any).postMessage({ id: m.id, ok: true, res });
  } catch (err: any) {
    (self as any).postMessage({ id: m.id, ok: false, error: String(err && err.message ? err.message : err) });
  }
};
