import { useMemo, useState } from 'react';
import type { TruthTable } from '../../../logic';
import { CONNECTIVE_NAME } from '../../../logic';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/Dialog';
import { FormulaText } from '../../components/FormulaText';
import { Notice } from '../../components/Notice';
import { COLUMN_RULE } from './columnRules';
import { EditableTruthGrid, type GridAnswers } from './EditableTruthGrid';

type Answers = GridAnswers;
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

  const editable = useMemo(() => table.columns.map((c) => !c.isAtom), [table]);
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

  const marks = useMemo(() => {
    if (!checked) return undefined;
    const m: Record<string, 'right' | 'wrong'> = {};
    table.rows.forEach((row, r) =>
      row.forEach((v, c) => {
        const a = answers[k(r, c)];
        if (editable[c] && a !== undefined) m[k(r, c)] = a === v ? 'right' : 'wrong';
      }),
    );
    return m;
  }, [checked, answers, table, editable]);

  const allRight = results.correct === total;
  const hintColumn = hintCol != null ? table.columns[hintCol] : null;

  return (
    <div className="stack">
      <p className="subtle">
        Fill in every column to the right of the sentence letters. Click or tap a cell to cycle T → F → blank, or use the
        keyboard: <kbd>T</kbd>/<kbd>F</kbd> to answer, arrow keys to move, <kbd>Backspace</kbd> to clear.
      </p>
      <EditableTruthGrid
        table={table}
        answers={answers}
        onChange={(a) => {
          setAnswers(a);
          setChecked(false);
        }}
        caption={caption}
        highlight={hl}
        marks={marks}
      />

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
