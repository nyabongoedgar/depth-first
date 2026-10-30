/**
 * npm run verify — the content quality gate.
 *  • every code/config/sim lab: reference solution passes ALL tests, starter fails
 *  • every answer lab: the stated answers pass, empty answers fail
 *  • every predict lab: the real output passes, an empty prediction fails
 *  • every ```js run block in a lesson executes without an error
 *  • structure: ids unique, ≥3 quiz questions, ≥2 hints per lab, tests present
 */
import { COURSE_IDS, loadCourse } from '../src/content/index';
import { runLab } from '../src/grader/run';
import { runSnippet } from '../src/grader/vloop';
import type { Course, Lab, LabResult } from '../src/core/types';

// Starter code often leaves promises unhandled on purpose; that must not crash the verifier.
process.on('unhandledRejection', () => {});

const only = process.argv[2]; // optional: verify a single course id
const problems: string[] = [];
const bad = (m: string) => problems.push(m);

async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: any;
  const timeout = new Promise<never>((_, rej) => (t = setTimeout(() => rej(new Error('timeout: ' + what)), ms)));
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(t);
  }
}

function failedTests(r: LabResult): string {
  if (r.error) return r.error;
  return r.tests.filter((t) => !t.pass).map((t) => `${t.name} — ${t.message}`).join(' | ');
}

async function checkLab(c: Course, mId: string, lab: Lab) {
  const where = `[${c.id}] ${mId}/${lab.id}`;
  if ((lab.hints?.length ?? 0) < 2) bad(`${where}: needs ≥ 2 hints`);
  if (!lab.prompt || !lab.why && false) bad(`${where}: empty prompt`);

  if (lab.kind === 'answer') {
    if (!lab.questions?.length) return bad(`${where}: answer lab without questions`);
    const good: Record<string, string> = {};
    for (const q of lab.questions) good[q.id] = Array.isArray(q.answer) ? (q.type === 'list' ? q.answer.join(', ') : String(q.answer[0])) : String(q.answer);
    const ok = await runLab(lab, { answers: good });
    if (ok.status !== 'pass') bad(`${where}: stated answers do not pass — ` + JSON.stringify(ok.answers));
    const empty = await runLab(lab, { answers: {} });
    if (empty.status === 'pass') bad(`${where}: empty answers pass`);
    return;
  }
  if (lab.kind === 'predict') {
    if (!lab.snippet) return bad(`${where}: predict lab without snippet`);
    const first = await runLab(lab, { predicted: '' });
    if (first.error) return bad(`${where}: snippet error ${first.error}`);
    if (!first.actual?.length) return bad(`${where}: snippet prints nothing`);
    const ok = await runLab(lab, { predicted: first.actual.join('\n') });
    if (ok.status !== 'pass') bad(`${where}: real output does not pass`);
    if (first.status === 'pass') bad(`${where}: empty prediction passes`);
    return;
  }
  // code / config / sim
  if (!lab.files?.length) return bad(`${where}: no files`);
  if ((lab.tests?.length ?? 0) < 2) bad(`${where}: needs ≥ 2 tests`);
  const f = lab.files[0];
  const sol = await withTimeout(runLab(lab, { files: { [f.path]: f.solution } }), 60000, where + ' solution');
  if (sol.status !== 'pass') bad(`${where}: SOLUTION FAILS — ${failedTests(sol)}`);
  const start = await withTimeout(runLab(lab, { files: { [f.path]: f.starter } }), 60000, where + ' starter');
  if (start.status === 'pass') bad(`${where}: STARTER ALREADY PASSES`);
}

async function checkRunBlocks(c: Course, mId: string, body: string) {
  const re = /```(?:js|json)\s+run(:error)?\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(body))) {
    i++;
    if (m[0].startsWith('```json')) continue;
    const expectError = !!m[1];
    const r = await withTimeout(runSnippet(m[2]), 20000, `${c.id}/${mId} run block ${i}`);
    if (r.error && !expectError) bad(`[${c.id}] ${mId}: run block ${i} errors: ${r.error}`);
    if (!r.error && expectError) bad(`[${c.id}] ${mId}: run block ${i} was expected to error`);
  }
}

const labIds = new Set<string>();
const modIds = new Set<string>();
let totalLabs = 0;
let totalModules = 0;
const rows: string[] = [];

for (const id of COURSE_IDS) {
  if (only && only !== id) continue;
  const c = await loadCourse(id);
  let labs = 0;
  const t0 = Date.now();
  for (const m of c.modules) {
    totalModules++;
    if (modIds.has(m.id)) bad(`duplicate module id ${m.id}`);
    modIds.add(m.id);
    if (m.quiz.length < 3) bad(`[${c.id}] ${m.id}: needs ≥ 3 quiz questions`);
    for (const q of m.quiz) if (!(q.answer >= 0 && q.answer < q.options.length) || !q.why) bad(`[${c.id}] ${m.id}: bad quiz item "${q.q.slice(0, 40)}"`);
    if (m.objectives.length < 2) bad(`[${c.id}] ${m.id}: needs ≥ 2 objectives`);
    if (m.labs.length < 2) bad(`[${c.id}] ${m.id}: needs ≥ 2 labs`);
    await checkRunBlocks(c, m.id, m.body);
    for (const lab of m.labs) {
      if (labIds.has(lab.id)) bad(`duplicate lab id ${lab.id}`);
      labIds.add(lab.id);
      labs++;
      totalLabs++;
      try {
        await checkLab(c, m.id, lab);
      } catch (e: any) {
        bad(`[${c.id}] ${m.id}/${lab.id}: verifier crashed — ${e && e.message}`);
      }
    }
  }
  rows.push(`  ${c.icon} ${c.title.padEnd(40)} ${String(c.modules.length).padStart(3)} modules ${String(labs).padStart(4)} labs   (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

console.log('\nDepth First — content verification\n');
rows.forEach((r) => console.log(r));
console.log(`\n  ${totalModules} modules, ${totalLabs} labs checked`);
if (problems.length) {
  console.log(`\n✗ ${problems.length} problem(s):`);
  problems.forEach((p) => console.log('  - ' + p));
  process.exit(1);
}
console.log('✓ every solution passes, every starter fails, every demo runs.\n');
