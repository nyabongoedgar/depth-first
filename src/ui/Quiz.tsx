import { useState } from 'preact/hooks';
import type { Module } from '../core/types';
import { inline } from './markdown';
import { progress, update } from '../store/progress';
import { addQuizCard } from '../store/srs';

export function Quiz({ module }: { module: Module }) {
  const answers = progress.value.quiz[module.id] ?? {};
  return (
    <div class="quiz">
      {module.quiz.map((q, qi) => {
        const chosen = answers[qi];
        const solved = chosen === q.answer;
        return (
          <div class="quiz-q" key={qi}>
            <p class="q">{inline(q.q)}</p>
            <div class="q-opts">
              {q.options.map((o, oi) => (
                <button key={oi} disabled={solved} class={`opt ${chosen === oi ? (oi === q.answer ? 'right' : 'wrong') : ''}`} onClick={() => {
                  update((p) => { (p.quiz[module.id] ??= {})[qi] = oi; });
                  if (oi === q.answer) addQuizCard(`quiz:${module.id}#${qi}`);
                }}>{inline(o)}</button>
              ))}
            </div>
            {chosen !== undefined && <p class={`why ${solved ? 'ok' : 'bad'}`}>{solved ? '✓ ' + q.why : '✗ Not quite — try another answer.'}</p>}
          </div>
        );
      })}
    </div>
  );
}
