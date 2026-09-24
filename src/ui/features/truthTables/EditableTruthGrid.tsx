import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { TruthTable } from '../../../logic';
import { Icon } from '../../components/Icon';
import { cellClass, TableHead } from './TableHead';
import { TruthValue } from './TruthValue';

export type GridAnswers = Record<string, boolean | undefined>;
export const cellKey = (r: number, c: number) => `${r}:${c}`;

/**
 * Editable truth table (controlled). Atom columns are given; every other cell
 * cycles blank → T → F on click, T/F/1/0 keys answer, arrows move, Backspace
 * clears. `marks` shows per-cell right/wrong with an icon.
 */
export function EditableTruthGrid({
  table,
  answers,
  onChange,
  caption,
  marks,
  highlight,
}: {
  table: TruthTable;
  answers: GridAnswers;
  onChange: (a: GridAnswers) => void;
  caption: string;
  marks?: Record<string, 'right' | 'wrong'>;
  highlight?: Set<number>;
}) {
  const [pos, setPos] = useState<{ r: number; c: number }>({ r: 0, c: table.atoms.length });
  const gridRef = useRef<HTMLTableElement>(null);
  const editable = useMemo(() => table.columns.map((c) => !c.isAtom), [table]);
  const firstEditable = editable.indexOf(true);

  const focusCell = (r: number, c: number) => {
    setPos({ r, c });
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)?.focus());
  };
  const setCell = (r: number, c: number, v: boolean | undefined) => onChange({ ...answers, [cellKey(r, c)]: v });
  const cycle = (r: number, c: number) => {
    const a = answers[cellKey(r, c)];
    setCell(r, c, a === undefined ? true : a === true ? false : undefined);
  };
  const move = (r: number, c: number, dr: number, dc: number) => {
    let nc = c + dc;
    if (dc !== 0) {
      while (nc >= 0 && nc < editable.length && !editable[nc]) nc += dc;
      if (nc < 0 || nc >= editable.length) return;
    }
    focusCell(Math.max(0, Math.min(table.rows.length - 1, r + dr)), nc);
  };
  const onKey = (e: KeyboardEvent, r: number, c: number) => {
    const key = e.key.toLowerCase();
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (key === 't' || key === '1') {
      handled();
      setCell(r, c, true);
      move(r, c, 1, 0);
    } else if (key === 'f' || key === '0') {
      handled();
      setCell(r, c, false);
      move(r, c, 1, 0);
    } else if (key === 'backspace' || key === 'delete') {
      handled();
      setCell(r, c, undefined);
    } else if (key === ' ') {
      handled();
      cycle(r, c);
    } else if (e.key === 'ArrowDown') {
      handled();
      move(r, c, 1, 0);
    } else if (e.key === 'ArrowUp') {
      handled();
      move(r, c, -1, 0);
    } else if (e.key === 'ArrowRight') {
      handled();
      move(r, c, 0, 1);
    } else if (e.key === 'ArrowLeft') {
      handled();
      move(r, c, 0, -1);
    } else if (e.key === 'Home') {
      handled();
      focusCell(r, firstEditable);
    } else if (e.key === 'End') {
      handled();
      focusCell(r, editable.length - 1);
    }
  };

  return (
    <div className="tt-scroll" role="region" aria-label={`${caption} (scrolls horizontally)`}>
      <table ref={gridRef} className="tt tt--practice" role="grid" aria-label={caption}>
        <TableHead table={table} highlight={highlight} />
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
                const a = answers[cellKey(r, c)];
                const mark = marks?.[cellKey(r, c)];
                const state = mark === 'right' ? 'is-right' : mark === 'wrong' ? 'is-wrong' : '';
                const feedback = mark ? (mark === 'right' ? ', correct' : ', incorrect') : '';
                return (
                  <td
                    key={c}
                    role="gridcell"
                    data-cell={`${r}:${c}`}
                    tabIndex={pos.r === r && pos.c === c ? 0 : -1}
                    className={cellClass(table, c, `tt__cell ${state} ${highlight?.has(c) ? 'is-hl' : ''}`)}
                    aria-label={`Row ${r + 1}, ${table.columns[c].label}: ${a === undefined ? 'blank' : a ? 'T' : 'F'}${feedback}`}
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
  );
}
