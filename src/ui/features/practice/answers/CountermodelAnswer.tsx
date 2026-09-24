import { useEffect, useState } from 'react';
import type { Valuation } from '../../../../logic';
import { ArgumentView } from './ArgumentView';
import type { AnswerProps } from './types';
import { isComplete, ValuationToggles } from './ValuationToggles';

/** T/F toggles; after checking, each premise's and the conclusion's value is shown live. */
export function CountermodelAnswer({ exercise, initial, onChange, feedback }: AnswerProps<'countermodel'>) {
  const [v, setV] = useState<Partial<Valuation>>(initial?.valuation ?? {});
  const complete = isComplete(exercise.atoms, v);
  useEffect(() => onChange(complete ? { kind: 'countermodel', valuation: v as Valuation } : null), [v, complete, onChange]);
  return (
    <div className="stack">
      <ArgumentView premises={exercise.premises} conclusion={exercise.conclusion} valuation={feedback && complete ? (v as Valuation) : undefined} />
      <ValuationToggles atoms={exercise.atoms} value={v} onChange={setV} label="Assign truth values" />
      {feedback && <p className="subtle">Each sentence's value under your assignment is shown above; change a letter and check again.</p>}
    </div>
  );
}
