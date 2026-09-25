import { useMemo, useRef, useState } from 'react';
import type { Difficulty, PredicateSymbolizationExercise, SymbolizationExercise } from '../../../learning';
import { EXERCISE_BANK, generateExercise, generateSymbolization, SYMBOLIZATION_EXERCISES } from '../../../learning';
import { PageHeader } from '../../app/PageHeader';
import { Button } from '../../components/Button';
import { RadioButtons } from '../../components/RadioButtons';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { EngineError } from '../../components/Notice';
import { attempt } from '../../engine/safe';
import { useProgress } from '../../learning/progress';
import { ExerciseRunner } from '../practice/ExerciseRunner';

type Mode = 'bank' | 'generate';
type Logic = 'sentential' | 'predicate';
type SymEx = SymbolizationExercise | PredicateSymbolizationExercise;

function predicateBank(): PredicateSymbolizationExercise[] {
  const r = attempt(() => (EXERCISE_BANK['predicate-symbolization'] ?? []).filter((e): e is PredicateSymbolizationExercise => e.kind === 'predicate-symbolization'));
  return r.ok ? r.value : [];
}
const LEVELS: Difficulty[] = [1, 2, 3, 4, 5];

function label(tag: string) {
  return tag.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export default function SymbolizationPage() {
  const [store] = useProgress();
  const [mode, setMode] = useState<Mode>('bank');
  const [level, setLevel] = useState<Difficulty | 0>(0);
  const [category, setCategory] = useState('');
  const [logic, setLogic] = useState<Logic>('sentential');
  const [current, setCurrent] = useState<SymEx | null>(null);
  const [genLevel, setGenLevel] = useState<Difficulty>(2);
  const [error, setError] = useState<string | null>(null);
  const runnerRef = useRef<HTMLDivElement>(null);

  const source: SymEx[] = useMemo(() => (logic === 'sentential' ? SYMBOLIZATION_EXERCISES : predicateBank()), [logic]);
  const categories = useMemo(() => [...new Set(source.flatMap((e) => e.tags))], [source]);
  const list = source.filter((e) => (!level || e.difficulty === level) && (!category || e.tags.includes(category)));

  const open = (ex: SymEx) => {
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
    const seed = Math.floor(Math.random() * 0x7fffffff);
    const r = attempt((): SymEx =>
      logic === 'sentential' ? generateSymbolization(genLevel, seed) : (generateExercise('predicate-symbolization', genLevel, seed) as PredicateSymbolizationExercise),
    );
    if (!r.ok) return setError(r.error);
    setError(null);
    open(r.value);
  };

  return (
    <div className="page page--wide">
      <PageHeader title="Symbolization" description="Translate English into sentential or predicate logic using a symbol key. Answers are checked for meaning, not exact wording." />
      <div className="sym-layout">
        <section className="card stack sym-browser" aria-label="Choose a sentence">
          <RadioButtons<Logic>
            label="Logic"
            value={logic}
            onChange={(l) => {
              setLogic(l);
              setCategory('');
            }}
            options={[
              { value: 'sentential', label: 'Sentential' },
              { value: 'predicate', label: 'Predicate (∀ ∃)' },
            ]}
          />
          <div className="segmented" role="tablist" aria-label="Source">
            <button type="button" role="tab" aria-selected={mode === 'bank'} onClick={() => setMode('bank')}>Exercise bank</button>
            <button type="button" role="tab" aria-selected={mode === 'generate'} onClick={() => setMode('generate')}>Generate new</button>
          </div>
          {mode === 'bank' ? (
            <>
              <div className="row">
                <RadioButtons<Difficulty | 0>
                  label="Difficulty"
                  value={level}
                  onChange={setLevel}
                  options={[{ value: 0, label: 'All' }, ...LEVELS.map((l) => ({ value: l, label: String(l), ariaLabel: `Level ${l}` }))]}
                />
                <label className="visually-hidden" htmlFor="sym-cat">Category</label>
                <select id="sym-cat" className="select sym-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{label(c)}</option>
                  ))}
                </select>
              </div>
              <p className="subtle" role="status">
                {list.length} sentences
                {logic === 'predicate' && list.length === 0 && ' — the predicate bank is still being written; use Generate new.'}
              </p>
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
