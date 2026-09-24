import type { CSSProperties } from 'react';
import type { TruthTable } from '../../../logic';
import { ScrollRegion } from '../../components/ScrollRegion';
import { cellClass, TableHead } from './TableHead';
import { TruthValue } from './TruthValue';

/** Automatic mode: the full computed table. */
export function TruthTableView({ table, caption }: { table: TruthTable; caption: string }) {
  return (
    <ScrollRegion label={caption}>
      <table className="tt">
        <caption className="visually-hidden">{caption}</caption>
        <TableHead table={table} />
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>
              {row.map((v, c) => {
                const Tag = c === 0 && table.columns[c].isAtom ? 'th' : 'td';
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
    </ScrollRegion>
  );
}
