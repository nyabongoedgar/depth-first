import { useEffect } from 'preact/hooks';
import type { Course, CourseId, Module } from '../core/types';
import { COURSE_IDS, COURSE_ORDER_HINT } from '../content/index';
import { useAllCourses, useCourse } from './useCourse';
import { href } from './router';
import { Markdown } from './markdown';
import { LabView } from './LabView';
import { Quiz } from './Quiz';
import { progress, update } from '../store/progress';
import { dueCards } from '../store/srs';

export const labsPassed = (m: Module) => m.labs.filter((l) => progress.value.labs[l.id]?.passed).length;
export const courseStats = (c: Course) => {
  const total = c.modules.reduce((n, m) => n + m.labs.length, 0);
  const done = c.modules.reduce((n, m) => n + labsPassed(m), 0);
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
};

const Loading = ({ what = 'content' }: { what?: string }) => <p class="dim loading">Loading {what}…</p>;

export function Home() {
  const courses = useAllCourses();
  const due = dueCards().length;
  const totalLabs = courses?.reduce((n, c) => n + c.modules.reduce((m, mod) => m + mod.labs.length, 0), 0) ?? 0;
  const doneLabs = Object.values(progress.value.labs).filter((l) => l.passed).length;
  return (
    <div class="home">
      <section class="hero">
        <h1>Engineering, <span class="accent">in depth</span>.</h1>
        <p class="lead">Six interactive, auto-graded courses — advanced JavaScript, Node &amp; distributed systems, cloud, AI/ML, math, and algorithms. Everything runs in your browser, works offline, and tests your code with property-based checks, complexity budgets and fault-injection simulations.</p>
        <div class="hero-actions">
          <a class="btn primary big" href={href.course('adv-js')}>Start with Advanced JS →</a>
          <a class="btn big" href={href.course('algos')}>Practise algorithms</a>
          {due > 0 && <a class="btn big gold" href={href.review()}>Review {due} due {due === 1 ? 'card' : 'cards'}</a>}
        </div>
        {courses && <p class="dim">{doneLabs} of {totalLabs} labs passed · progress is saved in this browser</p>}
      </section>

      <h2>Courses</h2>
      {!courses ? <Loading what="courses" /> : (
        <div class="cards">
          {courses.map((c) => {
            const s = courseStats(c);
            return (
              <a key={c.id} class="card course-card" href={href.course(c.id)}>
                <div class="card-top"><span class="icon">{c.icon}</span><span class="hint">{COURSE_ORDER_HINT[c.id]}</span></div>
                <h3>{c.title}</h3>
                <p class="dim">{c.tagline}</p>
                <div class="meta"><span>{c.modules.length} modules</span><span>{c.modules.reduce((n, m) => n + m.labs.length, 0)} labs</span>{c.planned.length > 0 && <span class="dim">+{c.planned.length} planned</span>}</div>
                <div class="bar"><div style={`width:${s.pct}%`} /></div>
                <div class="meta"><span>{s.pct}% complete</span></div>
              </a>
            );
          })}
        </div>
      )}

      <h2>How it works</h2>
      <div class="steps">
        <div><b>1 · Read</b><p>Plain-English lessons with live, editable examples that run in a sandboxed worker.</p></div>
        <div><b>2 · Predict</b><p>Commit to a prediction (output, complexity, ordering) before you run — then compare.</p></div>
        <div><b>3 · Build</b><p>Implement real things: a Promise, an event loop, Raft, an interpreter. Auto-graded.</p></div>
        <div><b>4 · Break it</b><p>Hidden tests, property tests and fault injection find the bugs your examples don't.</p></div>
        <div><b>5 · Retain</b><p>Quiz answers and solved labs return as spaced-repetition reviews.</p></div>
      </div>
    </div>
  );
}

export function CoursePage({ id }: { id: CourseId }) {
  const { course, error } = useCourse(id);
  if (error) return <p class="err-box">Could not load this course: {error}</p>;
  if (!course) return <Loading what="course" />;
  const s = courseStats(course);
  const first = course.modules.find((m) => labsPassed(m) < m.labs.length) ?? course.modules[0];
  return (
    <div class="course-page">
      <div class="crumbs"><a href={href.home()}>Courses</a> / {course.title}</div>
      <h1>{course.icon} {course.title}</h1>
      <p class="lead">{course.tagline}</p>
      <div class="meta big"><span>{course.modules.length} modules</span><span>{course.modules.reduce((n, m) => n + m.labs.length, 0)} labs</span><span>~{Math.round(course.modules.reduce((n, m) => n + m.minutes, 0) / 60)} h</span><span>{s.pct}% complete</span></div>
      <div class="bar wide"><div style={`width:${s.pct}%`} /></div>
      {first && <p><a class="btn primary" href={href.module(course.id, first.id)}>{s.done ? 'Continue' : 'Start'}: {first.title} →</a></p>}

      <h2>Modules</h2>
      <ol class="module-list">
        {course.modules.map((m, i) => {
          const done = labsPassed(m);
          const full = done === m.labs.length;
          return (
            <li key={m.id} class={full ? 'done' : ''}>
              <a href={href.module(course.id, m.id)}>
                <span class="num">{full ? '✓' : i + 1}</span>
                <span class="title">{m.title}</span>
                <span class="dim">{m.minutes} min · {done}/{m.labs.length} labs</span>
              </a>
            </li>
          );
        })}
      </ol>

      {course.planned.length > 0 && (
        <>
          <h2>On the roadmap</h2>
          <p class="dim">Specified in the curriculum but not authored yet.</p>
          <ul class="planned">
            {course.planned.map((p) => <li key={p.id}><b>{p.title}</b> <span class="dim">— {p.topics}</span></li>)}
          </ul>
        </>
      )}
    </div>
  );
}

export function ModulePage({ courseId, moduleId }: { courseId: CourseId; moduleId: string }) {
  const { course, error } = useCourse(courseId);
  useEffect(() => {
    if (course && course.modules.some((m) => m.id === moduleId) && progress.peek().last?.module !== moduleId) {
      update((p) => { p.last = { course: courseId, module: moduleId }; });
    }
  }, [course, moduleId]);
  if (error) return <p class="err-box">Could not load this course: {error}</p>;
  if (!course) return <Loading what="module" />;
  const idx = course.modules.findIndex((m) => m.id === moduleId);
  if (idx < 0) return <p>Module not found. <a href={href.course(courseId)}>Back to the course</a></p>;
  const mod = course.modules[idx];
  const prev = course.modules[idx - 1];
  const next = course.modules[idx + 1];
  return (
    <div class="module-layout">
      <aside class="sidebar">
        <a class="back" href={href.course(courseId)}>← {course.title}</a>
        <ol>
          {course.modules.map((m, i) => (
            <li key={m.id} class={m.id === moduleId ? 'active' : labsPassed(m) === m.labs.length ? 'done' : ''}>
              <a href={href.module(courseId, m.id)}><span class="num">{labsPassed(m) === m.labs.length ? '✓' : i + 1}</span> {m.title}</a>
            </li>
          ))}
        </ol>
      </aside>
      <article class="module">
        <div class="crumbs"><a href={href.home()}>Courses</a> / <a href={href.course(courseId)}>{course.title}</a> / Module {idx + 1}</div>
        <h1>{mod.title}</h1>
        <div class="meta"><span>~{mod.minutes} min</span><span>{mod.labs.length} labs</span><span>{labsPassed(mod)}/{mod.labs.length} passed</span></div>
        <div class="objectives"><b>You will be able to</b><ul>{mod.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul></div>

        <Markdown text={mod.body} />

        <h2 id="quiz">🧠 Quick quiz</h2>
        <Quiz module={mod} />

        <h2 id="labs">🛠 Labs</h2>
        <p class="dim">Each lab is graded automatically. Hidden tests reveal their names only once they pass. Stuck? Use the hints one at a time.</p>
        {mod.labs.map((lab) => <LabView key={lab.id} course={course} module={mod} lab={lab} />)}

        {mod.references && mod.references.length > 0 && (
          <>
            <h2>Further reading</h2>
            <ul>{mod.references.map((r, i) => <li key={i}>{r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a> : r.title}</li>)}</ul>
          </>
        )}

        <nav class="pager">
          {prev ? <a class="btn" href={href.module(courseId, prev.id)}>← {prev.title}</a> : <span />}
          {next ? <a class="btn primary" href={href.module(courseId, next.id)}>{next.title} →</a> : <a class="btn primary" href={href.course(courseId)}>Back to the course</a>}
        </nav>
      </article>
    </div>
  );
}

export { COURSE_IDS };
