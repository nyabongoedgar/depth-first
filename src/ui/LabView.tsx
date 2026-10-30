import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Course, Lab, LabResult, Module } from '../core/types';
import { Editor } from './Editor';
import { Markdown } from './markdown';
import { SpaceTime } from './SpaceTime';
import { runLabInWorker } from '../runner/client';
import { progress, recordRun, saveCode } from '../store/progress';

interface Props {
  course: Course;
  module: Module;
  lab: Lab;
  /** Interview mode: no hints, no solution. */
  strict?: boolean;
  onResult?: (r: LabResult) => void;
}

const KIND_LABEL: Record<string, string> = { example: 'example', property: 'property', differential: 'differential', metamorphic: 'metamorphic', perf: 'complexity', hidden: 'hidden', sim: 'simulation', numeric: 'numeric', structural: 'structure' };

export function LabView({ course, module, lab, strict, onResult }: Props) {
  const file = lab.files?.[0];
  const saved = progress.value.code[lab.id];
  const [code, setCode] = useState<string>(saved ?? file?.starter ?? '');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [predicted, setPredicted] = useState('');
  const [result, setResult] = useState<LabResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [hints, setHints] = useState(0);
  const [runs, setRuns] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const passed = progress.value.labs[lab.id]?.passed;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const onCode = (v: string) => {
    setCode(v);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveCode(lab.id, v), 600);
  };

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const input = lab.kind === 'answer' ? { answers } : lab.kind === 'predict' ? { predicted } : { files: { [file!.path]: code } };
      const r = await runLabInWorker(course.id, lab.id, input);
      setResult(r);
      setRuns((n) => n + 1);
      recordRun(lab.id, r.status === 'pass');
      onResult?.(r);
    } catch (e: any) {
      setResult({ labId: lab.id, status: 'error', tests: [], logs: [], error: String(e.message ?? e) });
    }
    setBusy(false);
  }

  const reset = () => {
    if (file) {
      setCode(file.starter);
      saveCode(lab.id, file.starter);
    }
    setResult(null);
    setShowSolution(false);
  };

  const solution = file?.solution;
  const canShowSolution = !strict && (passed || runs >= 2 || hints >= (lab.hints?.length ?? 0));

  return (
    <section class={`lab ${passed ? 'passed' : ''}`} id={lab.id}>
      <header class="lab-head">
        <h3>{lab.title}</h3>
        <div class="lab-meta">
          <span class="stars" title={`Difficulty ${lab.difficulty}/5`}>{'●'.repeat(lab.difficulty)}<span class="dim">{'●'.repeat(5 - lab.difficulty)}</span></span>
          <span>~{lab.minutes} min</span>
          {lab.tags?.slice(0, 3).map((t) => <span class="tag" key={t}>{t}</span>)}
          {lab.interview && <span class="tag gold">interview</span>}
          {passed && <span class="badge ok">✓ passed</span>}
        </div>
      </header>

      <Markdown text={lab.prompt} />
      {lab.why && <p class="why">💬 <em>Why it matters:</em> {lab.why}</p>}

      {lab.kind === 'predict' && (
        <>
          <pre class="static"><code>{lab.snippet}</code></pre>
          <textarea class="predict" placeholder="Type the output, one line per console.log…" rows={Math.min(14, (lab.snippet?.split('\n').length ?? 6))} value={predicted} onInput={(e) => setPredicted((e.target as HTMLTextAreaElement).value)} />
        </>
      )}

      {lab.kind === 'answer' && (
        <div class="answers">
          {lab.questions!.map((q) => (
            <div class={`aq ${result?.answers?.[q.id] ? (result.answers[q.id].ok ? 'ok' : 'bad') : ''}`} key={q.id}>
              <Markdown text={q.prompt} />
              {q.type === 'choice' ? (
                <div class="opts">{q.options!.map((o, i) => <label key={i}><input type="radio" name={lab.id + q.id} checked={answers[q.id] === String(i)} onChange={() => setAnswers({ ...answers, [q.id]: String(i) })} /> {o}</label>)}</div>
              ) : (
                <div class="ans-row"><input type="text" value={answers[q.id] ?? ''} placeholder={q.type === 'expr' ? 'e.g. (x+1)^2' : q.type === 'list' ? 'comma-separated' : 'your answer'} onInput={(e) => setAnswers({ ...answers, [q.id]: (e.target as HTMLInputElement).value })} onKeyDown={(e) => e.key === 'Enter' && run()} />{q.unit && <span class="unit">{q.unit}</span>}</div>
              )}
              {result?.answers?.[q.id] && (result.answers[q.id].ok ? <p class="ok-msg">✓ Correct. {q.explain}</p> : <p class="bad-msg">{result.answers[q.id].message}</p>)}
            </div>
          ))}
        </div>
      )}

      {(lab.kind === 'code' || lab.kind === 'config' || lab.kind === 'sim') && file && (
        <Editor value={code} onChange={onCode} onRun={run} language={file.language} minHeight={120} maxHeight={560} />
      )}

      <div class="lab-actions">
        <button class="btn primary" disabled={busy} onClick={run}>{busy ? 'Running…' : lab.kind === 'answer' ? 'Check answers' : lab.kind === 'predict' ? 'Check prediction' : 'Run tests ▶'}</button>
        {!strict && lab.hints.length > 0 && hints < lab.hints.length && <button class="btn" onClick={() => setHints(hints + 1)}>💡 Hint {hints + 1}/{lab.hints.length}</button>}
        {!strict && (lab.kind === 'code' || lab.kind === 'sim' || lab.kind === 'config') && (
          <button class="btn ghost" disabled={!canShowSolution} title={canShowSolution ? '' : 'Try a couple of runs or use the hints first'} onClick={() => setShowSolution(!showSolution)}>{showSolution ? 'Hide solution' : 'Show solution'}</button>
        )}
        {file && <button class="btn ghost" onClick={reset}>Reset</button>}
        <span class="spacer" />
        <small class="dim">Ctrl/⌘ + Enter to run</small>
      </div>

      {hints > 0 && !strict && (
        <ol class="hints">{lab.hints.slice(0, hints).map((h, i) => <li key={i}><Markdown text={h} /></li>)}</ol>
      )}
      {showSolution && solution && (
        <div class="solution"><strong>One possible solution</strong> — read it, close it, then write it again from memory.<pre class="static"><code>{solution}</code></pre></div>
      )}

      {result && <Results lab={lab} result={result} />}
    </section>
  );
}

function Results({ lab, result }: { lab: Lab; result: LabResult }) {
  const trace = result.trace as any;
  const total = result.tests.length;
  const ok = result.tests.filter((t) => t.pass).length;
  return (
    <div class={`results ${result.status}`}>
      {result.error && <pre class="err-box">✖ {result.error}</pre>}
      {lab.kind === 'predict' && result.actual && (
        <div class={`predict-result ${result.status}`}>
          {result.status === 'pass' ? (
            <><p class="ok-msg">✓ Correct!</p>{lab.explanation && <Markdown text={lab.explanation} />}</>
          ) : (
            <p class="bad-msg">Not quite — your prediction doesn't match the real output. Re-read the code slowly and trace each step. {result.actual.length} line(s) are expected.</p>
          )}
        </div>
      )}
      {lab.kind === 'predict' && result.status !== 'pass' && result.actual && <RevealOutput actual={result.actual} explanation={lab.explanation} />}
      {lab.kind === 'answer' && <p class={result.status === 'pass' ? 'ok-msg' : 'bad-msg'}>{result.status === 'pass' ? '🎉 All answers correct!' : 'Some answers are not right yet.'}</p>}
      {total > 0 && (
        <>
          <p class={`summary ${result.status === 'pass' ? 'ok' : 'bad'}`}>{result.status === 'pass' ? `🎉 All ${total} tests passed!` : `${ok} of ${total} tests passed — read the failures below.`}</p>
          <ul class="tests">
            {result.tests.map((t, i) => (
              <li key={i} class={t.pass ? 'pass' : 'fail'}>
                <span class="mark">{t.pass ? '✓' : '✗'}</span>
                <div>
                  <span class="tname">{t.name}</span> <span class={`kind k-${t.kind}`}>{KIND_LABEL[t.kind] ?? t.kind}</span>
                  {t.steps && t.kind === 'perf' && <span class="dim"> · {t.steps.toLocaleString()} steps</span>}
                  {!t.pass && t.message && <pre class="msg">{t.message}</pre>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {result.logs.length > 0 && <details open={!!result.error}><summary>Console output ({result.logs.length})</summary><pre class="output">{result.logs.join('\n')}</pre></details>}
      {result.metrics && Object.keys(result.metrics).length > 0 && (
        <div class="metrics">{Object.entries(result.metrics).map(([k, v]) => <span key={k} class="chip">{k}: <b>{Math.round(v * 100) / 100}</b></span>)}</div>
      )}
      {trace && trace.events && (
        <details open>
          <summary>Simulation trace (space-time diagram)</summary>
          <SpaceTime trace={trace} />
        </details>
      )}
    </div>
  );
}

function RevealOutput({ actual, explanation }: { actual: string[]; explanation?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <button class="btn ghost sm" onClick={() => setShown(!shown)}>{shown ? 'Hide real output' : 'Give up — show the real output'}</button>
      {shown && <><pre class="output">{actual.join('\n')}</pre>{explanation && <Markdown text={explanation} />}</>}
    </div>
  );
}
