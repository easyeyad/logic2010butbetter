import { useEffect, useState } from 'react';
import { FormulaText } from '../../../components/FormulaText';
import { ModelView } from '../../countermodels/ModelView';
import { ChoiceGroup } from './ChoiceGroup';
import { PredicateKey } from './PredicateKey';
import type { AnswerProps } from './types';

/** Show a small world; is the sentence true in it? */
export function ModelAnswer({ exercise, initial, onChange }: AnswerProps<'model'>) {
  const [value, setValue] = useState<boolean | undefined>(initial?.value);
  useEffect(() => onChange(value === undefined ? null : { kind: 'model', value }), [value, onChange]);
  return (
    <div className="stack">
      <div className="formula-display"><FormulaText text={exercise.formula} /></div>
      <PredicateKey entries={exercise.key} />
      <ModelView model={exercise.model} />
      <ChoiceGroup<boolean>
        label="In this model the sentence is…"
        columns={2}
        value={value}
        onChange={setValue}
        options={[
          { value: true, label: 'True', icon: 'checkCircle' },
          { value: false, label: 'False', icon: 'xCircle' },
        ]}
      />
    </div>
  );
}
