import { useEffect, useState } from 'react';
import type { RuleId } from '../../../../proof';
import { FormulaInput } from '../../../components/FormulaInput';
import { FormulaText } from '../../../components/FormulaText';
import { ruleName } from '../../proofs/justification';
import { ChoiceGroup } from './ChoiceGroup';
import type { AnswerProps } from './types';

/** 'identify': pick the rule. 'apply': type what follows. */
export function InferenceRuleAnswer({ exercise, initial, onChange }: AnswerProps<'inference-rule'>) {
  const [rule, setRule] = useState<RuleId | undefined>(initial?.rule);
  const [text, setText] = useState(initial?.formula ?? '');
  useEffect(() => {
    if (exercise.mode === 'identify') onChange(rule ? { kind: 'inference-rule', rule } : null);
    else onChange(text.trim() ? { kind: 'inference-rule', formula: text } : null);
  }, [rule, text, exercise.mode, onChange]);

  return (
    <div className="stack">
      <ol className="cited" aria-label="Cited lines">
        {exercise.lines.map((l, i) => (
          <li key={i}>
            <span className="cited__n">{i + 1}.</span>
            <FormulaText text={l} />
          </li>
        ))}
        {exercise.mode === 'identify' && (
          <li className="cited__concl">
            <span className="cited__n">∴</span>
            <FormulaText text={exercise.conclusion} />
            <span className="badge">? {exercise.lines.map((_, i) => i + 1).join(', ')}</span>
          </li>
        )}
      </ol>
      {exercise.mode === 'identify' ? (
        <ChoiceGroup<RuleId>
          label="Which rule?"
          value={rule}
          onChange={setRule}
          options={exercise.choices.map((c) => ({ value: c, label: <span className="choice__abbr">{c}</span>, description: ruleName(c) }))}
        />
      ) : (
        <FormulaInput label={`Result of applying ${exercise.rule}`} value={text} onChange={setText} />
      )}
    </div>
  );
}
