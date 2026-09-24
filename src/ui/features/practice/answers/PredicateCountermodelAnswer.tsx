import { useEffect, useMemo, useState } from 'react';
import type { Formula } from '../../../../logic';
import { FormulaText } from '../../../components/FormulaText';
import { Icon } from '../../../components/Icon';
import { safeEvaluateIn, safeParse } from '../../../engine/safe';
import { emptyBuilder, ModelBuilder, toInterpretation, type BuilderState } from './ModelBuilder';
import type { AnswerProps } from './types';

/** Build a world where every premise is true and the conclusion false; after checking, each sentence's value is shown live. */
export function PredicateCountermodelAnswer({ exercise, initial, onChange, feedback }: AnswerProps<'predicate-countermodel'>) {
  const [state, setState] = useState<BuilderState>(() => {
    if (initial?.model) {
      const m = initial.model;
      const ext: BuilderState['ext'] = {};
      Object.entries(m.predicates).forEach(([k, p]) => (ext[k] = 'value' in p ? p.value : p.extension));
      return { size: m.domainSize, names: { ...m.names }, ext };
    }
    return emptyBuilder(exercise.predicates, exercise.names, Math.min(2, exercise.maxDomain || 2));
  });
  const model = useMemo(() => toInterpretation(state, exercise.predicates), [state, exercise.predicates]);
  useEffect(() => onChange({ kind: 'predicate-countermodel', model }), [model, onChange]);

  const parsed = useMemo(() => {
    const p = (t: string): Formula | null => {
      const r = safeParse(t);
      return r.ok && r.value.ok ? r.value.formula : null;
    };
    return { premises: exercise.premises.map(p), conclusion: p(exercise.conclusion) };
  }, [exercise]);
  const val = (f: Formula | null) => {
    if (!f || !feedback) return null;
    const r = safeEvaluateIn(f, model);
    return r.ok ? r.value : null;
  };
  const row = (label: string, text: string, f: Formula | null, concl?: boolean) => {
    const v = val(f);
    return (
      <li key={label} className={`argv__row ${concl ? 'argv__row--concl' : ''}`}>
        <span className="argv__role">{label}</span>
        <FormulaText text={text} className="argv__f" />
        {v !== null && (
          <span className={`truth-pill truth-pill--${v ? 't' : 'f'}`}>
            <Icon name={v ? 'check' : 'x'} size={14} />
            {v ? 'True' : 'False'}
          </span>
        )}
      </li>
    );
  };
  return (
    <div className="stack">
      <ol className="argv" aria-label="Argument">
        {exercise.premises.map((p, i) => row(`Premise ${i + 1}`, p, parsed.premises[i]))}
        {row('∴ Conclusion', exercise.conclusion, parsed.conclusion, true)}
      </ol>
      <ModelBuilder state={state} onChange={setState} predicates={exercise.predicates} maxSize={Math.max(4, exercise.maxDomain || 4)} />
      {feedback && <p className="subtle">Each sentence's value in your model is shown above and updates as you edit.</p>}
    </div>
  );
}
