import { useEffect, useState } from 'react';
import type { Valuation } from '../../../../logic';
import { ArgumentView } from './ArgumentView';
import { ChoiceGroup } from './ChoiceGroup';
import type { AnswerProps } from './types';
import { isComplete, ValuationToggles } from './ValuationToggles';

export function ValidityAnswer({ exercise, initial, onChange, feedback }: AnswerProps<'validity'>) {
  const [valid, setValid] = useState<boolean | undefined>(initial?.valid);
  const [cm, setCm] = useState<Partial<Valuation>>(initial?.countermodel ?? {});
  const complete = isComplete(exercise.atoms, cm);
  useEffect(() => {
    if (valid === undefined) return onChange(null);
    if (valid) return onChange({ kind: 'validity', valid: true });
    if (exercise.requireCountermodel && !complete) return onChange(null);
    onChange({ kind: 'validity', valid: false, countermodel: complete ? (cm as Valuation) : undefined });
  }, [valid, cm, complete, exercise.requireCountermodel, onChange]);
  return (
    <div className="stack">
      <ArgumentView premises={exercise.premises} conclusion={exercise.conclusion} valuation={feedback && valid === false && complete ? (cm as Valuation) : undefined} />
      <ChoiceGroup<boolean>
        label="This argument is…"
        columns={2}
        value={valid}
        onChange={setValid}
        options={[
          { value: true, label: 'Valid', description: 'No row makes the premises true and the conclusion false' },
          { value: false, label: 'Invalid', description: 'Some row makes the premises true and the conclusion false' },
        ]}
      />
      {valid === false && (
        <ValuationToggles
          atoms={exercise.atoms}
          value={cm}
          onChange={setCm}
          label={exercise.requireCountermodel ? 'Countermodel (required)' : 'Countermodel (optional)'}
        />
      )}
    </div>
  );
}
