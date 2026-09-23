import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { TruthTable } from '../../../logic';
import { CONNECTIVE_NAME } from '../../../logic';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/Dialog';
import { FormulaText } from '../../components/FormulaText';
import { Icon } from '../../components/Icon';
import { Notice } from '../../components/Notice';
import { COLUMN_RULE } from './columnRules';
import { cellClass, TableHead } from './TableHead';
import { TruthValue } from './TruthValue';

type Answers = Record<string, boolean | undefined>;
const k = (r: number, c: number) => `${r}:${c}`;

/**
 * Practice mode: the student fills every non-atom cell (click/tap cycles
 * blank → T → F; keys T/F/1/0, Backspace clears; arrows move). "Check" marks
 * each cell with an icon + word; "Hint" explains one column's rule.
 */
export function PracticeTable({ table, caption, onSolved }: { table: TruthTable; caption: string; onSolved?: () => void }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [checked, setChecked] = useState(false);
  const [hintCol, setHintCol] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [pos, setPos] = useState<{ r: number; c: number }>({ r: 0, c: table.atoms.length });
  const gridRef = useRef<HTMLTableElement>(null);

  const editable = useMemo(() => table.columns.map((c) => !c.isAtom), [table]);
  const firstEditable = editable.indexOf(true);
  const total = table.rows.length * editable.filter(Boolean).length;

  const results = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    let blank = 0;
    table.rows.forEach((row, r) =>
      row.forEach((v, c) => {
        if (!editable[c]) return;
        const a = answers[k(r, c)];
        if (a === undefined) blank++;
        else if (a === v) correct++;
        else wrong++;
      }),
    );
    return { correct, wrong, blank };
  }, [answers, table, editable]);

  const focusCell = (r: number, c: number) => {
    setPos({ r, c });
    requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)?.focus();
    });
  };

  const setCell = (r: number, c: number, v: boolean | undefined) => {
    setAnswers((a) => ({ ...a, [k(r, c)]: v }));
    setChecked(false);
  };

  const move = (r: number, c: number, dr: number, dc: number) => {
    let nr = r + dr;
    let nc = c + dc;
    if (dc !== 0) {
      while (nc >= 0 && nc < editable.length && !editable[nc]) nc += dc;
      if (nc < 0 || nc >= editable.length) return;
    }
    nr = Math.max(0, Math.min(table.rows.length - 1, nr));
    focusCell(nr, nc);
  };

  const onKey = (e: KeyboardEvent, r: number, c: number) => {
    const key = e.key.toLowerCase();
    if (key === 't' || key === '1') {
      e.preventDefault();
      setCell(r, c, true);
      move(r, c, 1, 0);
    } else if (key === 'f' || key === '0') {
      e.preventDefault();
      setCell(r, c, false);
      move(r, c, 1, 0);
    } else if (key === 'backspace' || key === 'delete') {
      e.preventDefault();
      setCell(r, c, undefined);
    } else if (key === ' ' || key === 'enter') {
      e.preventDefault();
      cycle(r, c);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(r, c, 1, 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(r, c, -1, 0);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      move(r, c, 0, 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      move(r, c, 0, -1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusCell(r, firstEditable);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusCell(r, editable.length - 1);
    }
  };

  const cycle = (r: number, c: number) => {
    const a = answers[k(r, c)];
    setCell(r, c, a === undefined ? true : a === true ? false : undefined);
  };

  const hint = () => {
    // First column (in evaluation order) with a blank or wrong cell.
    const col = table.columns.findIndex((_, c) => editable[c] && table.rows.some((row, r) => answers[k(r, c)] !== row[c]));
    setHintCol(col >= 0 ? col : null);
  };

  const hl = useMemo(() => {
    const s = new Set<number>();
    if (hintCol != null) {
      s.add(hintCol);
      table.columns[hintCol].dependsOn.forEach((d) => s.add(d));
    }
    return s;
  }, [hintCol, table]);

  const allRight = results.correct === total;
  const hintColumn = hintCol != null ? table.columns[hintCol] : null;

  return (
    <div className="stack">
      <p className="subtle">
        Fill in every column to the right of the sentence letters. Click or tap a cell to cycle T → F → blank, or use the
        keyboard: <kbd>T</kbd>/<kbd>F</kbd> to answer, arrow keys to move, <kbd>Backspace</kbd> to clear.
      </p>
      <div className="tt-scroll" role="region" aria-label={`${caption} (scrolls horizontally)`}>
        <table ref={gridRef} className="tt tt--practice" role="grid" aria-label={caption}>
          <TableHead table={table} highlight={hl} />
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r}>
                {row.map((v, c) => {
                  const style = table.columns[c].isAtom ? ({ '--i': c } as CSSProperties) : undefined;
                  if (!editable[c])
                    return (
                      <th key={c} scope="row" className={cellClass(table, c)} style={style}>
                        <TruthValue value={v} />
                      </th>
                    );
                  const a = answers[k(r, c)];
                  const state = !checked || a === undefined ? '' : a === v ? 'is-right' : 'is-wrong';
                  const active = pos.r === r && pos.c === c;
                  const colLabel = table.columns[c].label;
                  const feedback = checked ? (a === undefined ? ', not answered' : a === v ? ', correct' : ', incorrect') : '';
                  return (
                    <td
                      key={c}
                      role="gridcell"
                      data-cell={`${r}:${c}`}
                      tabIndex={active ? 0 : -1}
                      className={cellClass(table, c, `tt__cell ${state} ${hl.has(c) ? 'is-hl' : ''}`)}
                      aria-label={`Row ${r + 1}, ${colLabel}: ${a === undefined ? 'blank' : a ? 'T' : 'F'}${feedback}`}
                      onClick={() => {
                        setPos({ r, c });
                        cycle(r, c);
                      }}
                      onFocus={() => setPos({ r, c })}
                      onKeyDown={(e) => onKey(e, r, c)}
                    >
                      <span className="tt__cellinner">
                        {a === undefined ? <span className="tt__blank" aria-hidden="true">·</span> : <TruthValue value={a} />}
                        {state === 'is-right' && <Icon name="check" size={13} className="tt__mark" />}
                        {state === 'is-wrong' && <Icon name="x" size={13} className="tt__mark" />}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row">
        <Button variant="primary" icon="check" onClick={() => {
          setChecked(true);
          if (results.correct === total) onSolved?.();
        }}>
          Check
        </Button>
        <Button icon="lightbulb" onClick={hint}>Hint</Button>
        <Button variant="ghost" icon="refresh" onClick={() => { setAnswers({}); setChecked(false); setHintCol(null); setRevealed(false); }}>
          Clear
        </Button>
        <Button variant="ghost" icon="eye" onClick={() => setConfirm(true)} disabled={revealed}>
          Show solution
        </Button>
      </div>

      {hintColumn && (
        <Notice tone="info" icon="lightbulb" title={<>Hint for column <FormulaText text={hintColumn.label} /></>}>
          This column is a {CONNECTIVE_NAME[hintColumn.formula.kind]}. {COLUMN_RULE[hintColumn.formula.kind]}
          {hintColumn.dependsOn.length > 0 && (
            <> Read it off the highlighted column{hintColumn.dependsOn.length > 1 ? 's' : ''}{' '}
              {hintColumn.dependsOn.map((d, i) => (
                <span key={d}>{i > 0 && ' and '}<FormulaText text={table.columns[d].label} /></span>
              ))}.
            </>
          )}
        </Notice>
      )}
      {checked && (
        allRight ? (
          <Notice tone="ok" role="status" title="All correct!">
            Every one of the {total} cells is right{revealed ? ' (solution shown)' : ''}.
          </Notice>
        ) : (
          <Notice tone="err" role="status" title={`${results.correct} of ${total} cells correct`}>
            {results.wrong > 0 && <>{results.wrong} incorrect (marked ✗). </>}
            {results.blank > 0 && <>{results.blank} still blank. </>}
            Use Hint if you're unsure how a column works.
          </Notice>
        )
      )}

      <ConfirmDialog
        open={confirm}
        title="Show the solution?"
        message="This fills in every cell with the correct value. Try a hint first if you haven't."
        confirmLabel="Show solution"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          const a: Answers = {};
          table.rows.forEach((row, r) => row.forEach((v, c) => editable[c] && (a[k(r, c)] = v)));
          setAnswers(a);
          setChecked(true);
          setRevealed(true);
          setConfirm(false);
        }}
      />
    </div>
  );
}
