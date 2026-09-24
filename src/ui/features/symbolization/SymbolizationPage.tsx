import { useMemo, useRef, useState } from 'react';
import type { Difficulty, SymbolizationExercise } from '../../../learning';
import { generateSymbolization, SYMBOLIZATION_EXERCISES } from '../../../learning';
import { PageHeader } from '../../app/PageHeader';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { EngineError } from '../../components/Notice';
import { attempt } from '../../engine/safe';
import { useProgress } from '../../learning/progress';
import { ExerciseRunner } from '../practice/ExerciseRunner';

type Mode = 'bank' | 'generate';
const LEVELS: Difficulty[] = [1, 2, 3, 4, 5];

function label(tag: string) {
  return tag.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export default function SymbolizationPage() {
  const [store] = useProgress();
  const [mode, setMode] = useState<Mode>('bank');
  const [level, setLevel] = useState<Difficulty | 0>(0);
  const [category, setCategory] = useState('');
  const [current, setCurrent] = useState<SymbolizationExercise | null>(null);
  const [genLevel, setGenLevel] = useState<Difficulty>(2);
  const [error, setError] = useState<string | null>(null);
  const runnerRef = useRef<HTMLDivElement>(null);

  const categories = useMemo(() => [...new Set(SYMBOLIZATION_EXERCISES.flatMap((e) => e.tags))], []);
  const list = SYMBOLIZATION_EXERCISES.filter((e) => (!level || e.difficulty === level) && (!category || e.tags.includes(category)));

  const open = (ex: SymbolizationExercise) => {
    setCurrent(ex);
    requestAnimationFrame(() => {
      if (window.innerWidth < 1280) runnerRef.current?.scrollIntoView?.({ block: 'start' });
    });
  };
  const nextInList = () => {
    if (!current) return;
    const i = list.findIndex((e) => e.id === current.id);
    if (i >= 0 && i + 1 < list.length) open(list[i + 1]);
  };
  const generate = () => {
    const r = attempt(() => generateSymbolization(genLevel, Math.floor(Math.random() * 0x7fffffff)));
    if (!r.ok) return setError(r.error);
    setError(null);
    open(r.value);
  };

  return (
    <div className="page page--wide">
      <PageHeader title="Symbolization" description="Translate English into sentential logic using a symbol key. Answers are checked for meaning, not exact wording." />
      <div className="sym-layout">
        <section className="card stack sym-browser" aria-label="Choose a sentence">
          <div className="segmented" role="tablist" aria-label="Source">
            <button type="button" role="tab" aria-selected={mode === 'bank'} onClick={() => setMode('bank')}>Exercise bank</button>
            <button type="button" role="tab" aria-selected={mode === 'generate'} onClick={() => setMode('generate')}>Generate new</button>
          </div>
          {mode === 'bank' ? (
            <>
              <div className="row">
                <div className="segmented" role="radiogroup" aria-label="Difficulty">
                  <button type="button" role="radio" aria-checked={level === 0} onClick={() => setLevel(0)}>All</button>
                  {LEVELS.map((l) => (
                    <button key={l} type="button" role="radio" aria-checked={level === l} aria-label={`Level ${l}`} onClick={() => setLevel(l)}>{l}</button>
                  ))}
                </div>
                <label className="visually-hidden" htmlFor="sym-cat">Category</label>
                <select id="sym-cat" className="select sym-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{label(c)}</option>
                  ))}
                </select>
              </div>
              <p className="subtle" role="status">{list.length} sentences</p>
              <ul className="sym-list">
                {list.map((e) => {
                  const solved = store.isSolved(e.id);
                  return (
                    <li key={e.id}>
                      <button type="button" className={`sym-item ${current?.id === e.id ? 'is-active' : ''}`} aria-current={current?.id === e.id ? 'true' : undefined} onClick={() => open(e)}>
                        <span className="sym-item__sentence">{e.sentence}</span>
                        <span className="sym-item__meta">
                          <span className="badge">Level {e.difficulty}</span>
                          <span className="badge">{e.title}</span>
                          {solved && (
                            <span className="badge badge--ok"><Icon name="check" /> Solved</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="stack">
              <div className="field">
                <label className="field__label" htmlFor="gen-level">Difficulty: level {genLevel}</label>
                <input id="gen-level" className="range" type="range" min={1} max={5} step={1} value={genLevel} onChange={(e) => setGenLevel(Number(e.target.value) as Difficulty)} aria-valuetext={`Level ${genLevel}`} />
                <div className="range__ticks" aria-hidden="true">{LEVELS.map((l) => <span key={l}>{l}</span>)}</div>
              </div>
              <Button variant="primary" icon="sparkle" onClick={generate}>Generate a sentence</Button>
              {error && <EngineError error={error} />}
            </div>
          )}
        </section>
        <div ref={runnerRef} className="sym-runner">
          {current ? (
            <ExerciseRunner
              key={current.id}
              exercise={current}
              onNext={mode === 'generate' ? generate : list.findIndex((e) => e.id === current.id) + 1 < list.length ? nextInList : undefined}
              nextLabel={mode === 'generate' ? 'Generate another' : 'Next sentence'}
            />
          ) : (
            <EmptyState icon="symbol" title="Pick a sentence to symbolize">
              Choose one from the bank, or generate a fresh sentence at the level you want.
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}
