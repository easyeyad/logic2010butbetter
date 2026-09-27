import { useEffect, useId, useRef, useState } from 'react';
import { Button } from './Button';
import { FormulaInput, useActiveFormulaId, type FormulaInputHandle } from './FormulaInput';
import { BP, useMediaQuery } from '../hooks/useMediaQuery';
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
        if (target?.insert(d)) return;
        // Nothing focused yet: target the row the bar sits under.
        onFallback();
        target?.insert(d);
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
  onConclusion,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  labelFor: (i: number) => string;
  addLabel?: string;
  min?: number;
  /** Rows flagged by a whole-argument check (e.g. inconsistent predicate arity). */
  invalidRows?: Set<number>;
  /** Receives the part after ∴ / therefore / ⊢ when an argument is pasted into a row. */
  onConclusion?: (text: string) => void;
}) {
  const refs = useRef<(FormulaInputHandle | null)[]>([]);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  // Latest values: row handlers must never act on a stale copy (that would resurrect deleted rows).
  const valuesRef = useRef(values);
  valuesRef.current = values;
  // Stable row ids (React keys and field ids), kept in step with `values`.
  const idSeq = useRef(0);
  const [rowIds, setRowIds] = useState<string[]>(() => values.map(() => `r${idSeq.current++}`));
  const ids =
    rowIds.length === values.length
      ? rowIds
      : rowIds.length > values.length
        ? rowIds.slice(0, values.length)
        : [...rowIds, ...values.slice(rowIds.length).map(() => `r${idSeq.current++}`)];
  useEffect(() => {
    if (ids !== rowIds) setRowIds(ids);
  }, [ids, rowIds]);
  const idsRef = useRef(ids);
  idsRef.current = ids;

  // The shared symbol bar sits under the most recently focused row (the last row until one is focused).
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const activeIdx = activeRowId ? ids.indexOf(activeRowId) : -1;
  const barRow = activeIdx >= 0 ? activeIdx : values.length - 1;
  const listId = useId();
  const activeId = useActiveFormulaId();
  // Phones: show the bar only while one of this list's fields is the one being edited.
  const isPhone = useMediaQuery(BP.mobile);
  const showBar = !isPhone || (activeId?.startsWith(`fl-${listId}-`) ?? false);

  useEffect(() => {
    if (focusRow === null) return;
    refs.current[focusRow]?.focus('end');
    setFocusRow(null);
  }, [focusRow, values]);

  /** Replace row `rowId` (looked up in the CURRENT rows) with one or more texts. */
  const setRow = (rowId: string, text: string) => {
    const cur = valuesRef.current;
    const curIds = idsRef.current;
    const i = curIds.indexOf(rowId);
    if (i < 0) return; // the row was deleted: never recreate it
    let t = text;
    // "P -> Q, P ∴ Q" pasted into a premise: the part after ∴ / therefore / ⊢ / |- is the conclusion.
    const concl = onConclusion ? t.match(/\s*(?:∴|⊢|\|-|\btherefore\b)\s*/i) : null;
    if (concl && concl.index !== undefined && onConclusion) {
      onConclusion(t.slice(concl.index + concl[0].length).trim());
      t = t.slice(0, concl.index);
    }
    if (t.includes(',')) {
      const parts = t.split(',').map((p, k) => (k === 0 ? p.trimEnd() : p.trimStart()));
      const newIds = parts.map((_, k) => (k === 0 ? rowId : `r${idSeq.current++}`));
      setRowIds([...curIds.slice(0, i), ...newIds, ...curIds.slice(i + 1)]);
      onChange([...cur.slice(0, i), ...parts, ...cur.slice(i + 1)]);
      setFocusRow(i + parts.length - 1);
      return;
    }
    // Leading whitespace carries no meaning (typically the space after a comma).
    onChange(cur.map((v, j) => (j === i ? t.replace(/^\s+/, '') : v)));
  };

  const removeRow = (rowId: string) => {
    const cur = valuesRef.current;
    const curIds = idsRef.current;
    const i = curIds.indexOf(rowId);
    if (i < 0) return;
    const nextIds = curIds.filter((x) => x !== rowId);
    setRowIds(nextIds);
    onChange(cur.filter((_, j) => j !== i));
    // Retarget the shared bar: if the deleted row was active, move to the nearest surviving row.
    if (activeRowId === rowId) setActiveRowId(nextIds[Math.min(i, nextIds.length - 1)] ?? null);
    // Keep keyboard focus in the list (the trash button just disappeared).
    if (nextIds.length) setFocusRow(Math.min(i, nextIds.length - 1));
  };

  return (
    <div className="stack stack--sm">
      {values.map((v, i) => (
        <div key={ids[i]} className="fl__item" onFocus={() => setActiveRowId(ids[i])}>
        <div className="row row--top">
          <FormulaInput
            ref={(h) => {
              refs.current[i] = h;
            }}
            id={`fl-${listId}-${ids[i]}`}
            className="grow"
            label={labelFor(i)}
            value={v}
            invalid={invalidRows?.has(i)}
            onChange={(t) => setRow(ids[i], t)}
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
              onClick={() => removeRow(ids[i])}
            />
          )}
        </div>
        {i === barRow && showBar && <SharedBar fallbackLabel={labelFor(i)} onFallback={() => refs.current[i]?.focus('end')} />}
        </div>
      ))}
      <div>
        <Button
          size="sm"
          variant="ghost"
          icon="plus"
          onClick={() => {
            onChange([...valuesRef.current, '']);
            setFocusRow(valuesRef.current.length);
          }}
        >
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
