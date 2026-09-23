import { Button } from './Button';
import { FormulaInput } from './FormulaInput';

/**
 * Several formulas, one per row. Typing or pasting a comma splits the text
 * into separate rows.
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
  const setAt = (i: number, text: string) => {
    if (text.includes(',')) {
      const parts = text.split(',').map((p) => p.trim());
      const next = [...values.slice(0, i), ...parts, ...values.slice(i + 1)];
      onChange(next);
      return;
    }
    onChange(values.map((v, j) => (j === i ? text : v)));
  };
  return (
    <div className="stack stack--sm">
      {values.map((v, i) => (
        <div key={i} className="row row--top">
          <FormulaInput className="grow" label={labelFor(i)} value={v} onChange={(t) => setAt(i, t)} toolbar={i === values.length - 1} />
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
        <Button size="sm" variant="ghost" icon="plus" onClick={() => onChange([...values, ''])}>
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
