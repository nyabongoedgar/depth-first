import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Course, Lab, Module } from '../core/types';
import { useAllCourses } from './useCourse';
import { href } from './router';
import { LabView } from './LabView';
import { Markdown, inline } from './markdown';
import { progress, update, exportProgress, importProgress, resetProgress } from '../store/progress';
import { dueCards, rate, type Rating } from '../store/srs';
import { labsPassed } from './pages';

const Loading = () => <p class="dim loading">Loading…</p>;

/** Find modules/labs by id across all courses. */
function useIndex(courses?: Course[]) {
  return useMemo(() => {
    const modules = new Map<string, { course: Course; module: Module }>();
    const labs = new Map<string, { course: Course; module: Module; lab: Lab }>();
    for (const c of courses ?? []) for (const m of c.modules) {
      modules.set(m.id, { course: c, module: m });
      for (const l of m.labs) labs.set(l.id, { course: c, module: m, lab: l });
    }
    return { modules, labs };
  }, [courses]);
}

// ───────────────────────── Review ─────────────────────────
export function Review() {
  const courses = useAllCourses();
  const idx = useIndex(courses);
  const [queue, setQueue] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [done, setDone] = useState(0);

  useEffect(() => { if (courses && !queue) setQueue(dueCards()); }, [courses]);
  if (!courses || !queue) return <Loading />;

  const cardId = queue[0];
  if (!cardId) {
    return (
      <div class="narrow">
        <h1>🔁 Review</h1>
        <p class="lead">{done > 0 ? `All done — ${done} card${done === 1 ? '' : 's'} reviewed. 🎉` : 'Nothing is due right now.'}</p>
        <p class="dim">Quiz questions you answer correctly, and labs you solve, come back here on a spaced schedule (1, 3–6, then growing intervals) so you actually retain them.</p>
        <p><a class="btn primary" href={href.home()}>Back to courses</a></p>
      </div>
    );
  }

  const advance = (r: Rating) => {
    rate(cardId, r);
    setPicked(null);
    setDone(done + 1);
    setQueue(r === 'again' ? [...queue.slice(1), cardId] : queue.slice(1));
  };

  let body;
  if (cardId.startsWith('quiz:')) {
    const [modId, qi] = cardId.slice(5).split('#');
    const hit = idx.modules.get(modId);
    const q = hit?.module.quiz[+qi];
    if (!hit || !q) { rate(cardId, 'easy'); setQueue(queue.slice(1)); return <Loading />; }
    body = (
      <>
        <p class="dim">From <a href={href.module(hit.course.id, modId)}>{hit.module.title}</a></p>
        <p class="q">{inline(q.q)}</p>
        <div class="q-opts">
          {q.options.map((o, i) => (
            <button key={i} class={`opt ${picked !== null ? (i === q.answer ? 'right' : picked === i ? 'wrong' : '') : ''}`} disabled={picked !== null} onClick={() => setPicked(i)}>{inline(o)}</button>
          ))}
        </div>
        {picked !== null && <p class={`why ${picked === q.answer ? 'ok' : 'bad'}`}>{q.why}</p>}
        {picked !== null && (
          <div class="rate">
            {picked === q.answer ? <>
              <button class="btn" onClick={() => advance('hard')}>Hard</button>
              <button class="btn primary" onClick={() => advance('good')}>Good</button>
              <button class="btn" onClick={() => advance('easy')}>Easy</button>
            </> : <button class="btn primary" onClick={() => advance('again')}>Again</button>}
          </div>
        )}
      </>
    );
  } else {
    const hit = idx.labs.get(cardId.slice(4));
    if (!hit) { rate(cardId, 'easy'); setQueue(queue.slice(1)); return <Loading />; }
    body = (
      <>
        <p class="dim">Re-solve from memory (no peeking at the solution) — {hit.module.title}</p>
        <h3>{hit.lab.title}</h3>
        <Markdown text={hit.lab.prompt} />
        <p><a class="btn" href={href.module(hit.course.id, hit.module.id) + ''} target="_blank">Open the lab in a new tab ↗</a></p>
        <p>How did it go?</p>
        <div class="rate">
          <button class="btn" onClick={() => advance('again')}>Couldn't</button>
          <button class="btn" onClick={() => advance('hard')}>Hard</button>
          <button class="btn primary" onClick={() => advance('good')}>Good</button>
          <button class="btn" onClick={() => advance('easy')}>Easy</button>
        </div>
      </>
    );
  }

  return (
    <div class="narrow">
      <h1>🔁 Review</h1>
      <p class="dim">{queue.length} due · {done} done this session</p>
      <div class="review-card">{body}</div>
    </div>
  );
}

// ───────────────────────── Interview mode ─────────────────────────
const ROUND_MIN = 45;

export function Interview({ labId }: { labId?: string }) {
  const courses = useAllCourses();
  const idx = useIndex(courses);
  if (!courses) return <Loading />;
  const pool = [...idx.labs.values()].filter((x) => x.lab.interview);
  const hit = labId ? idx.labs.get(labId) : undefined;

  if (hit) return <Round hit={hit} />;
  const unsolved = pool.filter((x) => !progress.value.labs[x.lab.id]?.passed);
  const pick = () => {
    const from = unsolved.length ? unsolved : pool;
    return from[Math.floor(Math.random() * from.length)];
  };
  return (
    <div class="narrow">
      <h1>🎯 Mock interview</h1>
      <p class="lead">A timed round: one problem, {ROUND_MIN} minutes, <b>no hints, no solutions</b>. Hidden tests and complexity budgets apply. Talk through your approach out loud — that's half of the real thing.</p>
      <p><button class="btn primary big" onClick={() => { const p = pick(); if (p) location.hash = href.interview(p.lab.id); }}>Start a random round →</button></p>
      <p class="dim">{pool.length} problems in the pool · {pool.filter((x) => progress.value.labs[x.lab.id]?.passed).length} already solved (unsolved ones come first)</p>
      <h2>Or choose a problem</h2>
      <ul class="plain">
        {pool.map((x) => (
          <li key={x.lab.id}>
            <a href={href.interview(x.lab.id)}>{progress.value.labs[x.lab.id]?.passed ? '✓ ' : ''}{x.lab.title}</a> <span class="dim">· {x.course.title} · difficulty {x.lab.difficulty}/5</span>
          </li>
        ))}
      </ul>
      {progress.value.interview.length > 0 && (
        <>
          <h2>History</h2>
          <ul class="plain">{[...progress.value.interview].reverse().slice(0, 10).map((r, i) => <li key={i}>{new Date(r.at).toLocaleDateString()} — {idx.labs.get(r.labId)?.lab.title ?? r.labId}: {r.passed ? '✓ passed' : '✗ not solved'} in {r.minutes} min</li>)}</ul>
        </>
      )}
    </div>
  );
}

function Round({ hit }: { hit: { course: Course; module: Module; lab: Lab } }) {
  const [left, setLeft] = useState(ROUND_MIN * 60);
  const [finished, setFinished] = useState(false);
  const start = useRef(Date.now());
  const solved = useRef(false);
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const end = () => {
    setFinished(true);
    update((p) => { p.interview.push({ labId: hit.lab.id, at: Date.now(), passed: solved.current, minutes: Math.round((Date.now() - start.current) / 60000) }); });
  };
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div class="round">
      <div class={`timer ${left < 300 ? 'low' : ''}`}>⏱ {mm}:{ss}</div>
      <p class="dim">{hit.course.title} · {hit.module.title}</p>
      <LabView course={hit.course} module={hit.module} lab={hit.lab} strict onResult={(r) => { if (r.status === 'pass') solved.current = true; }} />
      <p class="round-actions">
        {!finished ? <button class="btn" onClick={end}>End round &amp; log it</button> : <>
          <b>{solved.current ? '✓ Solved.' : 'Not solved this time.'}</b> Debrief: what was the brute force? What was the bottleneck? Which pattern fixed it? What are the edge cases?{' '}
          <a class="btn primary" href={href.interview()}>Another round</a>
        </>}
      </p>
    </div>
  );
}

// ───────────────────────── Skill map ─────────────────────────
export function Skills() {
  const courses = useAllCourses();
  if (!courses) return <Loading />;
  return (
    <div>
      <h1>🗺 Skill map</h1>
      <p class="lead">Every module, coloured by how many labs you have passed.</p>
      {courses.map((c) => (
        <section key={c.id} class="skill-course">
          <h2><a href={href.course(c.id)}>{c.icon} {c.title}</a></h2>
          <div class="skill-grid">
            {c.modules.map((m) => {
              const d = labsPassed(m);
              const pct = Math.round((d / m.labs.length) * 100);
              return (
                <a key={m.id} class={`skill ${pct === 100 ? 'full' : pct > 0 ? 'part' : ''}`} href={href.module(c.id, m.id)} title={`${d}/${m.labs.length} labs`}>
                  <span>{m.title}</span>
                  <div class="bar"><div style={`width:${pct}%`} /></div>
                </a>
              );
            })}
            {c.planned.map((p) => <div key={p.id} class="skill planned" title={p.topics}><span>{p.title}</span><small>planned</small></div>)}
          </div>
        </section>
      ))}
    </div>
  );
}

// ───────────────────────── Search ─────────────────────────
export function Search({ q }: { q: string }) {
  const courses = useAllCourses();
  const [query, setQuery] = useState(q);
  useEffect(() => setQuery(q), [q]);
  const docs = useMemo(() => (courses ?? []).flatMap((c) => c.modules.map((m) => ({
    c, m,
    title: m.title.toLowerCase(),
    objs: m.objectives.join(' ').toLowerCase(),
    body: (m.body + ' ' + m.labs.map((l) => l.title + ' ' + (l.tags ?? []).join(' ')).join(' ')).toLowerCase(),
  }))), [courses]);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = terms.length === 0 ? [] : docs
    .map((d) => {
      let score = 0;
      for (const t of terms) {
        if (d.title.includes(t)) score += 10;
        if (d.objs.includes(t)) score += 4;
        const n = d.body.split(t).length - 1;
        if (n === 0 && !d.title.includes(t) && !d.objs.includes(t)) return { d, score: -1 };
        score += Math.min(n, 8);
      }
      return { d, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);
  return (
    <div class="narrow">
      <h1>Search</h1>
      <input class="search-big" type="search" value={query} placeholder="e.g. closure, raft, big-o, bayes…" onInput={(e) => { const v = (e.target as HTMLInputElement).value; setQuery(v); history.replaceState(null, '', href.search(v)); }} autofocus />
      {!courses && <Loading />}
      {terms.length > 0 && <p class="dim">{results.length} result{results.length === 1 ? '' : 's'}</p>}
      <ul class="plain results-list">
        {results.map(({ d }) => (
          <li key={d.m.id}><a href={href.module(d.c.id, d.m.id)}><b>{d.m.title}</b></a> <span class="dim">· {d.c.title}</span><p class="dim">{d.m.objectives[0]}</p></li>
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────── Settings ─────────────────────────
export function Settings() {
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const download = () => {
    const blob = new Blob([exportProgress()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `depth-first-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div class="narrow">
      <h1>Settings</h1>
      <h2>Theme</h2>
      <p>
        {(['auto', 'dark', 'light'] as const).map((t) => (
          <button key={t} class={`btn ${progress.value.settings.theme === t ? 'primary' : ''}`} onClick={() => { update((p) => { p.settings.theme = t; }); location.reload(); }}>{t}</button>
        ))}
      </p>
      <h2>Your data</h2>
      <p class="dim">Everything is stored locally in this browser (IndexedDB). There are no accounts and nothing is sent anywhere. Export a backup, or move your progress to another device.</p>
      <p>
        <button class="btn" onClick={download}>Export progress</button>{' '}
        <button class="btn" onClick={() => file.current?.click()}>Import progress…</button>
        <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (!f) return;
          try { importProgress(await f.text()); setMsg('Imported ✓'); } catch (err: any) { setMsg('Import failed: ' + err.message); }
        }} />
      </p>
      <p><button class="btn danger" onClick={() => { if (confirm('Erase ALL progress and saved code on this device?')) { resetProgress(); setMsg('Progress erased.'); } }}>Erase everything</button></p>
      {msg && <p class="ok-msg">{msg}</p>}
      <h2>About</h2>
      <p class="dim">Depth First — an offline-first engineering curriculum. Code: Apache-2.0. Content: CC BY-SA 4.0. Lessons simplify real systems; where a lab uses a simulator or model, it says so.</p>
    </div>
  );
}
