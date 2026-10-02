import type { SymbolKeyEntry } from '../../../../learning';

export function SymbolKey({ entries }: { entries: SymbolKeyEntry[] }) {
  return (
    <div className="symkey">
      <div className="panel-h">Symbol key</div>
      <dl className="symkey__list">
        {entries.map((k) => (
          <div key={k.letter} className="symkey__row">
            <dt className="math">{k.letter}</dt>
            <dd>{k.meaning}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
