import { useEffect, useState } from 'react';
import { HighlightedText } from '../../../components/HighlightedText';
import { ChoiceGroup } from './ChoiceGroup';
import { formulaSpans, type AnswerProps } from './types';

/** Well-formed? yes/no, and (when asked) click the character where the problem is. */
export function WffAnswer({ exercise, initial, onChange, feedback }: AnswerProps<'wff'>) {
  const [wf, setWf] = useState<boolean | undefined>(initial?.wellFormed);
  const [at, setAt] = useState<number | undefined>(initial?.errorAt);
  const needLocation = exercise.askLocation && wf === false;

  useEffect(() => {
    if (wf === undefined) onChange(null);
    else if (needLocation && at === undefined) onChange(null);
    else onChange({ kind: 'wff', wellFormed: wf, errorAt: needLocation ? at : undefined });
  }, [wf, at, needLocation, onChange]);

  const chars = Array.from(exercise.formula);
  return (
    <div className="stack">
      <div className="formula-display" aria-label="Formula to judge">
        {needLocation ? (
          <div className="charpick" role="group" aria-label="Click the character where the problem is">
            {chars.map((c, i) => (
              <button
                key={i}
                type="button"
                className={`charpick__c math ${at === i ? 'is-selected' : ''} ${c === ' ' ? 'is-space' : ''}`}
                aria-pressed={at === i}
                aria-label={`Character ${i + 1}: ${c === ' ' ? 'space' : c}`}
                onClick={() => setAt(i)}
              >
                {c === ' ' ? ' ' : c}
              </button>
            ))}
          </div>
        ) : (
          <HighlightedText math text={exercise.formula} spans={formulaSpans(feedback)} />
        )}
      </div>
      <ChoiceGroup<boolean>
        label="Your judgment"
        columns={2}
        value={wf}
        onChange={setWf}
        options={[
          { value: true, label: 'Well-formed', icon: 'checkCircle' },
          { value: false, label: 'Not well-formed', icon: 'xCircle' },
        ]}
      />
      {needLocation && (
        <p className="subtle">
          {at === undefined ? 'Now click the character in the formula where the problem is.' : `You marked character ${at + 1}. Click another to change it.`}
        </p>
      )}
    </div>
  );
}
