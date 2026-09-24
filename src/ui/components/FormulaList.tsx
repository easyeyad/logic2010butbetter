import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { FormulaInput, type FormulaInputHandle } from './FormulaInput';

/**
 * Several formulas, one per row. Typing or pasting a comma splits the text
 * into separate rows and moves the caret to the end of the last new row, so
 * "P -> Q, ~Q -> ~P" typed straight through lands in two rows.
 */
export function FormulaList({
  values,
  onChange,
  labelFor,
  addLabel = 'Add formula',
  min = 1,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  labelFor: (i: number) => string;
  addLabel?: string;
  min?: number;
}) {
  const refs = useRef<(FormulaInputHandle | null)[]>([]);
  const [focusRow, setFocusRow] = useState<number | null>(null);

  useEffect(() => {
    if (focusRow === null) return;
    refs.current[focusRow]?.focus('end');
    setFocusRow(null);
  }, [focusRow, values]);

  const setAt = (i: number, text: string) => {
    if (text.includes(',')) {
      const parts = text.split(',').map((p, k) => (k === 0 ? p.trimEnd() : p.trimStart()));
      const next = [...values.slice(0, i), ...parts, ...values.slice(i + 1)];
      onChange(next);
      setFocusRow(i + parts.length - 1);
      return;
    }
    // Leading whitespace carries no meaning (typically the space after a comma).
    onChange(values.map((v, j) => (j === i ? text.replace(/^\s+/, '') : v)));
  };

  return (
    <div className="stack stack--sm">
      {values.map((v, i) => (
        <div key={i} className="row row--top">
          <FormulaInput
            ref={(h) => {
              refs.current[i] = h;
            }}
            className="grow"
            label={labelFor(i)}
            value={v}
            onChange={(t) => setAt(i, t)}
            toolbar={i === values.length - 1}
          />
          {values.length > min && (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              icon="trash"
              label={`Remove ${labelFor(i).toLowerCase()}`}
              className="row__trail"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
            />
          )}
        </div>
      ))}
      <div>
        <Button
          size="sm"
          variant="ghost"
          icon="plus"
          onClick={() => {
            onChange([...values, '']);
            setFocusRow(values.length);
          }}
        >
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
