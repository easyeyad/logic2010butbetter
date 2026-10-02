import { useEffect, useId, useState } from 'react';
import { connectivePositions } from '../../../../learning';
import { FormulaInput } from '../../../components/FormulaInput';
import { HighlightedText } from '../../../components/HighlightedText';
import { attempt } from '../../../engine/safe';
import { ChoiceGroup } from './ChoiceGroup';
import { formulaSpans, type AnswerProps } from './types';

/** Main-connective clicking, typing parts/formulas/terms, true-false with justification, multiple choice. */
export function TerminologyAnswer({ exercise, initial, onChange, feedback }: AnswerProps<'terminology'>) {
  const [position, setPosition] = useState<number | undefined>(initial?.position);
  const [text, setText] = useState(initial?.text ?? '');
  const [value, setValue] = useState<boolean | undefined>(initial?.value);
  const [choice, setChoice] = useState<number | undefined>(initial?.choice);
  const fillId = useId();
  const f = exercise.format;

  useEffect(() => {
    switch (f) {
      case 'click-connective':
        return onChange(position !== undefined ? { kind: 'terminology', position } : null);
      case 'type-part':
      case 'type-formula':
      case 'fill-in':
        return onChange(text.trim() ? { kind: 'terminology', text } : null);
      case 'true-false':
        return onChange(value !== undefined && (choice !== undefined || !exercise.options?.length) ? { kind: 'terminology', value, choice } : null);
      case 'multiple-choice':
        return onChange(choice !== undefined ? { kind: 'terminology', choice } : null);
    }
  }, [f, position, text, value, choice, exercise.options, onChange]);

  const formula = exercise.formula ?? '';
  const positions = f === 'click-connective' ? (attempt(() => connectivePositions(formula)).ok ? connectivePositions(formula) : []) : [];

  return (
    <div className="stack">
      {f === 'click-connective' && (
        <div className="formula-display">
          <div className="charpick" role="group" aria-label="Connectives: click the main connective">
            {Array.from(formula).map((c, i) =>
              positions.includes(i) ? (
                <button
                  key={i}
                  type="button"
                  className={`charpick__c charpick__c--conn math ${position === i ? 'is-selected' : ''}`}
                  aria-pressed={position === i}
                  aria-label={`Connective ${c} at position ${i + 1}`}
                  onClick={() => setPosition(i)}
                >
                  {c}
                </button>
              ) : (
                <span key={i} className="charpick__t math" aria-hidden="true">
                  {c === ' ' ? ' ' : c}
                </span>
              ),
            )}
          </div>
          {feedback && formulaSpans(feedback)?.length ? (
            <p className="subtle">
              <HighlightedText math text={formula} spans={formulaSpans(feedback)} />
            </p>
          ) : null}
        </div>
      )}
      {(f === 'type-part' || f === 'type-formula') && (
        <>
          {formula && <div className="formula-display"><HighlightedText math text={formula} spans={formulaSpans(feedback)} /></div>}
          <FormulaInput label="Your answer" value={text} onChange={setText} />
        </>
      )}
      {f === 'fill-in' && (
        <div className="field">
          <label htmlFor={fillId} className="field__label">Your answer</label>
          <input id={fillId} className="input" value={text} autoComplete="off" onChange={(e) => setText(e.target.value)} />
        </div>
      )}
      {f === 'true-false' && (
        <>
          <ChoiceGroup<boolean>
            label="True or false?"
            columns={2}
            value={value}
            onChange={setValue}
            options={[
              { value: true, label: 'True', icon: 'checkCircle' },
              { value: false, label: 'False', icon: 'xCircle' },
            ]}
          />
          {exercise.options && exercise.options.length > 0 && (
            <ChoiceGroup<number>
              label="Because…"
              value={choice}
              onChange={setChoice}
              options={exercise.options.map((o, i) => ({ value: i, label: o }))}
            />
          )}
        </>
      )}
      {f === 'multiple-choice' && (
        <ChoiceGroup<number> label="Choose one" value={choice} onChange={setChoice} options={(exercise.options ?? []).map((o, i) => ({ value: i, label: o }))} />
      )}
    </div>
  );
}
