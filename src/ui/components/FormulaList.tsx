import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { safeNormalize } from '../engine/safe';
import { BP, useMediaQuery } from '../hooks/useMediaQuery';
import { Button } from './Button';
import { FormulaInput, useActiveFormulaId, type FormulaInputHandle } from './FormulaInput';
import { FormulaTargetBoundary } from './FormulaTarget';
import { SymbolBar } from './SymbolBar';

/** Last target row index per `rememberKey`, so a remounted list (navigate away and back) keeps its bar where it was. */
const rememberedTarget = new Map<string, number>();

/** Argument markers recognized when a whole argument is pasted into a row. */
const MARKER = /\s*(?:∴|⊢|\|-|\btherefore\b)\s*/i;

/**
 * Several formulas, one per row, sharing ONE symbol bar.
 *
 * Design (single source of truth): `targetRowId` is the only state that
 * decides where the bar is drawn, which row it inserts into, and its
 * accessible name. It changes only when a row's TEXT FIELD gains focus, or
 * when rows are added/removed — never on focus of buttons (trash, bar). The
 * bar inserts by calling the target row's own `insert`, which reads that
 * row's current value and caret and updates it through the list's onChange.
 *
 * Row ids are stable (React keys), minted only in initializers, effects and
 * event handlers — never during render.
 */
export function FormulaList({
  values,
  onChange,
  labelFor,
  addLabel = 'Add formula',
  min = 1,
  invalidRows,
  onConclusion,
  rememberKey,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  labelFor: (i: number) => string;
  addLabel?: string;
  min?: number;
  /** Rows flagged by a whole-argument check (e.g. inconsistent predicate arity). */
  invalidRows?: Set<number>;
  /** Receives the part after ∴ / therefore / ⊢ / |- when an argument is PASTED into a row. */
  onConclusion?: (text: string) => void;
  /** Remember the targeted row across remounts under this key. */
  rememberKey?: string;
}) {
  const seq = useRef(0);
  const mint = useCallback(() => `r${++seq.current}`, []);
  const [ids, setIds] = useState<string[]>(() => values.map(() => `r${++seq.current}`));

  // Values replaced from outside with a different length: reconcile ids (in an effect, not in render).
  useLayoutEffect(() => {
    if (ids.length === values.length) return;
    setIds((cur) =>
      cur.length === values.length
        ? cur
        : cur.length > values.length
          ? cur.slice(0, values.length)
          : [...cur, ...Array.from({ length: values.length - cur.length }, mint)],
    );
  }, [values.length, ids.length, mint]);
  const rowIds = values.map((_, i) => ids[i] ?? `pending-${i}`);

  // Latest values/ids for handlers (never act on a stale copy).
  const latest = useRef({ values, rowIds });
  latest.current = { values, rowIds };

  const [targetRowId, setTargetRowId] = useState<string | null>(() => {
    const i = rememberKey ? rememberedTarget.get(rememberKey) : undefined;
    return i !== undefined && i < ids.length ? ids[i] : null;
  });
  const targetIdx = targetRowId ? rowIds.indexOf(targetRowId) : -1;
  const barIdx = targetIdx >= 0 ? targetIdx : values.length - 1;
  useEffect(() => {
    if (rememberKey && targetIdx >= 0) rememberedTarget.set(rememberKey, targetIdx);
  }, [rememberKey, targetIdx]);

  const handles = useRef(new Map<string, FormulaInputHandle>());
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusRowId) return;
    handles.current.get(focusRowId)?.focus('end');
    setFocusRowId(null);
  }, [focusRowId, values]);

  const listId = useId();
  const activeId = useActiveFormulaId();
  const isPhone = useMediaQuery(BP.mobile);
  // Phones: show the bar only while one of this list's fields is the one being edited.
  const showBar = !isPhone || (activeId?.startsWith(`fl-${listId}-`) ?? false);

  /** Replace row `rowId` with one text (or several, split on commas). */
  const setRow = (rowId: string, text: string) => {
    const { values: cur, rowIds: curIds } = latest.current;
    const i = curIds.indexOf(rowId);
    if (i < 0) return; // row was removed: never recreate it
    if (text.includes(',')) {
      const parts = text.split(',').map((p, k) => (k === 0 ? p.trimEnd() : p.trimStart()));
      splice(i, parts);
      return;
    }
    // Leading whitespace carries no meaning (typically the space after a comma).
    onChange(cur.map((v, j) => (j === i ? text.replace(/^\s+/, '') : v)));
  };

  /** Replace row i with `parts` (first part keeps the row's id); focus/target the last part. */
  const splice = (i: number, parts: string[]) => {
    const { values: cur, rowIds: curIds } = latest.current;
    const newIds = parts.map((_, k) => (k === 0 ? curIds[i] : mint()));
    setIds([...curIds.slice(0, i), ...newIds, ...curIds.slice(i + 1)]);
    onChange([...cur.slice(0, i), ...parts, ...cur.slice(i + 1)]);
    const last = newIds[newIds.length - 1];
    setTargetRowId(last);
    setFocusRowId(last);
  };

  /** Paste: route "premises ∴ conclusion" and comma lists, working on the RAW clipboard text. */
  const pasteInto = (rowId: string, raw: string, start: number, end: number): boolean => {
    const { values: cur, rowIds: curIds } = latest.current;
    const i = curIds.indexOf(rowId);
    if (i < 0) return false;
    const m = onConclusion ? raw.match(MARKER) : null;
    const hasComma = raw.includes(',');
    if (!m && !hasComma) return false;
    let body = raw;
    if (m && m.index !== undefined && onConclusion) {
      const after = raw.slice(m.index + m[0].length).trim();
      body = raw.slice(0, m.index);
      if (after) onConclusion(safeNormalize(after, after.length).text);
    }
    const norm = (t: string) => safeNormalize(t.trim(), t.trim().length).text;
    const pieces = body.split(',').map(norm);
    const before = cur[i].slice(0, start);
    const after = cur[i].slice(end);
    pieces[0] = before + pieces[0];
    pieces[pieces.length - 1] = pieces[pieces.length - 1] + after;
    splice(i, pieces);
    return true;
  };

  const removeRow = (rowId: string) => {
    const { values: cur, rowIds: curIds } = latest.current;
    const i = curIds.indexOf(rowId);
    if (i < 0) return;
    const nextIds = curIds.filter((x) => x !== rowId);
    setIds(nextIds);
    onChange(cur.filter((_, j) => j !== i));
    if (!nextIds.length) return;
    // If the target row was removed, retarget to the nearest surviving row; keep focus in the list.
    const near = nextIds[Math.min(i, nextIds.length - 1)];
    if (targetRowId === rowId || targetRowId === null) setTargetRowId(near);
    setFocusRowId(targetRowId && targetRowId !== rowId && nextIds.includes(targetRowId) ? targetRowId : near);
  };

  const addRow = () => {
    const { values: cur, rowIds: curIds } = latest.current;
    const id = mint();
    setIds([...curIds, id]);
    onChange([...cur, '']);
    setTargetRowId(id);
    setFocusRowId(id);
  };

  const barRowId = rowIds[barIdx];
  // Rows are reached through their own handles; they never register with an outer FormulaTarget.
  return (
    <FormulaTargetBoundary>
    <div className="stack stack--sm">
      {values.map((v, i) => {
        const rowId = rowIds[i];
        return (
          <div key={rowId} className="fl__item" data-row-id={rowId}>
            <div className="row row--top">
              <FormulaInput
                ref={(h) => {
                  if (h) handles.current.set(rowId, h);
                  else handles.current.delete(rowId);
                }}
                id={`fl-${listId}-${rowId}`}
                className="grow"
                label={labelFor(i)}
                value={v}
                invalid={invalidRows?.has(i)}
                onChange={(t) => setRow(rowId, t)}
                onFocus={() => setTargetRowId(rowId)}
                onPasteText={(raw, s, e) => pasteInto(rowId, raw, s, e)}
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
                  onClick={() => removeRow(rowId)}
                />
              )}
            </div>
            {i === barIdx && showBar && (
              <SymbolBar
                label={`Insert symbol into ${labelFor(barIdx)}`}
                onInsert={(d) => handles.current.get(barRowId)?.insert(d)}
              />
            )}
          </div>
        );
      })}
      <div>
        <Button size="sm" variant="ghost" icon="plus" onClick={addRow}>
          {addLabel}
        </Button>
      </div>
    </div>
    </FormulaTargetBoundary>
  );
}
