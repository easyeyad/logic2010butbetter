import type { CSSProperties } from 'react';
import type { TruthTable } from '../../../logic';
import { CONNECTIVE_NAME } from '../../../logic';

/** Shared header row: atom columns (sticky), subformula columns, main columns emphasized. */
export function TableHead({ table, highlight }: { table: TruthTable; highlight?: Set<number> }) {
  const atomCount = table.atoms.length;
  return (
    <thead>
      <tr>
        {table.columns.map((col, c) => (
          <th
            key={c}
            scope="col"
            className={[
              'tt__h',
              col.isAtom && 'tt__atom',
              c === atomCount - 1 && 'tt__atom--last',
              col.isMain && 'tt__main',
              highlight?.has(c) && 'is-hl',
            ]
              .filter(Boolean)
              .join(' ')}
            style={col.isAtom ? ({ '--i': c } as CSSProperties) : undefined}
            title={col.isAtom ? 'Sentence letter' : `${CONNECTIVE_NAME[col.formula.kind]}${col.isMain ? ' (main formula)' : ''}`}
          >
            <span className="math">{col.label}</span>
            {col.isMain && <span className="visually-hidden"> (main formula)</span>}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function cellClass(table: TruthTable, c: number, extra?: string) {
  const col = table.columns[c];
  return [
    'tt__c',
    col.isAtom && 'tt__atom',
    c === table.atoms.length - 1 && 'tt__atom--last',
    col.isMain && 'tt__main',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}
