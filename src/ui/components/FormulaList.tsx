import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { FormulaInput, type FormulaInputHandle } from './FormulaInput';
import { FormulaTargetProvider, useFormulaTarget } from './FormulaTarget';
import { SymbolBar } from './SymbolBar';

/**
 * Several formulas, one per row. Typing or pasting a comma splits the text
 * into separate rows and moves the caret to the end of the last new row, so
 * "P -> Q, ~Q -> ~P" typed straight through lands in two rows.
 */
/** Several formulas sharing one symbol bar that inserts into whichever row was focused last. */
export function FormulaList(props: Parameters<typeof FormulaListInner>[0]) {
  return (
    <FormulaTargetProvider>
      <FormulaListInner {...props} />
    </FormulaTargetProvider>
  );
}

function SharedBar({ fallbackLabel, onFallback }: { fallbackLabel: string; onFallback: () => void }) {
  const target = useFormulaTarget();
  const label = target?.activeLabel ?? fallbackLabel;
  return (
    <SymbolBar
      label={`Insert symbol into ${label}`}
      onInsert={(d) => {
        if (!target?.insert(d)) onFallback();
      }}
    />
  );
}

function FormulaListInner({
  values,
  onChange,
  labelFor,
  addLabel = 'Add formula',
  min = 1,
  invalidRows,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  labelFor: (i: number) => string;
  addLabel?: string;
  min?: number;
  /** Rows flagged by a whole-argument check (e.g. inconsistent predicate arity). */
  invalidRows?: Set<number>;
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
            invalid={invalidRows?.has(i)}
            onChange={(t) => setAt(i, t)}
            toolbar={false}
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
      <SharedBar
        fallbackLabel={labelFor(0)}
        onFallback={() => refs.current[0]?.focus('end')}
      />
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
