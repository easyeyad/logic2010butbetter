import { useEffect, useMemo, useState } from 'react';
import type { Classification } from '../../../../logic';
import { FormulaText } from '../../../components/FormulaText';
import { safeParse, safeTruthTable } from '../../../engine/safe';
import { EditableTruthGrid, type GridAnswers } from '../../truthTables/EditableTruthGrid';
import { ChoiceGroup } from './ChoiceGroup';
import type { AnswerProps } from './types';

/** 'classify': three choices. 'fill': the table with the main column to fill (other columns optional). */
export function TruthTableAnswer({ exercise, initial, onChange }: AnswerProps<'truth-table'>) {
  const [cls, setCls] = useState<Classification | undefined>(initial?.classification);
  const table = useMemo(() => {
    const p = safeParse(exercise.formula);
    if (!p.ok || !p.value.ok) return null;
    const t = safeTruthTable([p.value.formula]);
    return t.ok ? t.value : null;
  }, [exercise.formula]);
  const [cells, setCells] = useState<GridAnswers>(() => {
    const a: GridAnswers = {};
    initial?.cells?.forEach((row, r) => row.forEach((v, c) => v !== null && (a[`${r}:${c}`] = v)));
    return a;
  });

  useEffect(() => {
    if (exercise.mode === 'classify') {
      onChange(cls ? { kind: 'truth-table', classification: cls } : null);
      return;
    }
    if (!table) return onChange(null);
    const main = table.columns.findIndex((c) => c.isMain);
    const values = table.rows.map((_, r) => cells[`${r}:${main}`] ?? null);
    const grid = table.rows.map((row, r) => row.map((_, c) => (table.columns[c].isAtom ? null : (cells[`${r}:${c}`] ?? null))));
    onChange(values.some((v) => v !== null) ? { kind: 'truth-table', values, cells: grid } : null);
  }, [cls, cells, table, exercise.mode, onChange]);

  if (exercise.mode === 'classify') {
    return (
      <div className="stack">
        <div className="formula-display"><FormulaText text={exercise.formula} /></div>
        <ChoiceGroup<Classification>
          label="This sentence is…"
          columns={3}
          value={cls}
          onChange={setCls}
          options={[
            { value: 'tautology', label: 'A tautology', description: 'True in every row' },
            { value: 'contradiction', label: 'A contradiction', description: 'False in every row' },
            { value: 'contingent', label: 'Contingent', description: 'True in some rows, false in others' },
          ]}
        />
      </div>
    );
  }
  if (!table) return <p className="subtle">This table can't be displayed right now.</p>;
  return (
    <div className="stack stack--sm">
      <p className="subtle">
        The outlined column is required. Filling the smaller columns first is optional but helps. Click a cell to cycle T → F →
        blank, or type <kbd>T</kbd>/<kbd>F</kbd> and use the arrow keys.
      </p>
      <EditableTruthGrid table={table} answers={cells} onChange={setCells} caption={`Truth table for ${exercise.formula}`} />
    </div>
  );
}
