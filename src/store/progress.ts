/** Local-first progress: signals for the UI, IndexedDB (with a localStorage fallback) for persistence. */
import { signal, batch } from '@preact/signals';

export interface Card {
  due: number; // ms epoch
  interval: number; // days
  ease: number;
  reps: number;
  lapses: number;
}

export interface Progress {
  v: 1;
  labs: Record<string, { passed: boolean; attempts: number; firstPassAt?: number }>;
  code: Record<string, string>;
  quiz: Record<string, Record<number, number>>;
  cards: Record<string, Card>;
  notes: Record<string, string>;
  interview: { labId: string; at: number; passed: boolean; minutes: number }[];
  settings: { theme: 'auto' | 'dark' | 'light' };
  last?: { course: string; module: string };
}

const KEY = 'depth-first/progress';
const empty = (): Progress => ({ v: 1, labs: {}, code: {}, quiz: {}, cards: {}, notes: {}, interview: [], settings: { theme: 'auto' } });

export const progress = signal<Progress>(empty());
export const ready = signal(false);

// ---------- persistence ----------
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('depth-first', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(): Promise<Progress | undefined> {
  const db = await idb();
  return new Promise((res, rej) => {
    const q = db.transaction('kv').objectStore('kv').get(KEY);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
async function idbSet(p: Progress) {
  const db = await idb();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(p, KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function loadProgress() {
  let p: Progress | undefined;
  try {
    p = await idbGet();
  } catch {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) p = JSON.parse(raw);
    } catch {
      /* private mode */
    }
  }
  batch(() => {
    progress.value = p && p.v === 1 ? { ...empty(), ...p } : empty();
    ready.value = true;
  });
}

let timer: ReturnType<typeof setTimeout> | undefined;
function persist() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const p = progress.value;
    try {
      await idbSet(p);
    } catch {
      try {
        localStorage.setItem(KEY, JSON.stringify(p));
      } catch {
        /* ignore */
      }
    }
  }, 400);
}

export function update(fn: (p: Progress) => void) {
  const next = structuredClone(progress.value);
  fn(next);
  progress.value = next;
  persist();
}

// ---------- helpers ----------
export const labPassed = (id: string) => !!progress.value.labs[id]?.passed;

export function recordRun(labId: string, passed: boolean) {
  update((p) => {
    const cur = p.labs[labId] ?? { passed: false, attempts: 0 };
    cur.attempts++;
    if (passed && !cur.passed) {
      cur.passed = true;
      cur.firstPassAt = Date.now();
      // re-solve card: come back to it in 3 days
      p.cards['lab:' + labId] = { due: Date.now() + 3 * 864e5, interval: 3, ease: 2.3, reps: 1, lapses: 0 };
    }
    p.labs[labId] = cur;
  });
}

export function saveCode(labId: string, code: string) {
  update((p) => {
    p.code[labId] = code;
  });
}

export function exportProgress(): string {
  return JSON.stringify(progress.value, null, 2);
}
export function importProgress(json: string) {
  const p = JSON.parse(json);
  if (!p || p.v !== 1) throw new Error('Not a Depth First progress file.');
  progress.value = { ...empty(), ...p };
  persist();
}
export function resetProgress() {
  progress.value = empty();
  persist();
}
