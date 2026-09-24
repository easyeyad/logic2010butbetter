import { useEffect, useState } from 'react';
import { FormulaInput } from '../../../components/FormulaInput';
import { PredicateKey } from './PredicateKey';
import type { AnswerProps } from './types';

export function PredicateSymbolizationAnswer({ exercise, initial, onChange }: AnswerProps<'predicate-symbolization'>) {
  const [text, setText] = useState(initial?.formula ?? '');
  useEffect(() => onChange(text.trim() ? { kind: 'predicate-symbolization', formula: text } : null), [text, onChange]);
  return (
    <div className="stack">
      <blockquote className="sentence">{exercise.sentence}</blockquote>
      <PredicateKey entries={exercise.key} />
      <FormulaInput label="Your symbolization" value={text} onChange={setText} placeholder="e.g. ∀x(Dx → Mx)" />
    </div>
  );
}
