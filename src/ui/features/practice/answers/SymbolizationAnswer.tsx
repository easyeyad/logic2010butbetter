import { useEffect, useState } from 'react';
import { FormulaInput } from '../../../components/FormulaInput';
import { SymbolKey } from './SymbolKey';
import type { AnswerProps } from './types';

export function SymbolizationAnswer({ exercise, initial, onChange }: AnswerProps<'symbolization'>) {
  const [text, setText] = useState(initial?.formula ?? '');
  useEffect(() => onChange(text.trim() ? { kind: 'symbolization', formula: text } : null), [text, onChange]);
  return (
    <div className="stack">
      <blockquote className="sentence">{exercise.sentence}</blockquote>
      <SymbolKey entries={exercise.key} />
      <FormulaInput label="Your symbolization" value={text} onChange={setText} data-autofocus-answer="" />
    </div>
  );
}
