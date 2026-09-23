import type { CSSProperties } from 'react';
import type { TruthTable } from '../../../logic';
import { cellClass, TableHead } from './TableHead';
import { TruthValue } from './TruthValue';

/** Automatic mode: the full computed table. */
export function TruthTableView({ table, caption }: { table: TruthTable; caption: string }) {
  return (
    <div className="tt-scroll" tabIndex={0} role="region" aria-label={`${caption} (scrolls horizontally)`}>
      <table className="tt">
        <caption className="visually-hidden">{caption}</caption>
        <TableHead table={table} />
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>
              {row.map((v, c) => {
                const Tag = table.columns[c].isAtom ? 'th' : 'td';
                return (
                  <Tag key={c} scope={Tag === 'th' ? 'row' : undefined} className={cellClass(table, c)} style={table.columns[c].isAtom ? ({ '--i': c } as CSSProperties) : undefined}>
                    <TruthValue value={v} />
                  </Tag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
