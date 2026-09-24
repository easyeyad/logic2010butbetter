import type { PredicateKeyEntry } from '../../../../learning';

const VARS = ['x', 'y', 'z', 'w', 'u'];

/** "Dx: x is a dog", "Lxy: x loves y", "a: Alice". */
export function PredicateKey({ entries }: { entries: PredicateKeyEntry[] }) {
  if (!entries.length) return null;
  const preds = entries.filter((e) => e.kind === 'predicate');
  const names = entries.filter((e) => e.kind === 'name');
  return (
    <div className="symkey">
      <div className="panel-h">Symbol key</div>
      <dl className="symkey__list">
        {preds.map((k) => (
          <div key={`p-${k.symbol}`} className="symkey__row">
            <dt className="math">
              {k.symbol}
              {k.kind === 'predicate' ? VARS.slice(0, k.arity).join('') : ''}
            </dt>
            <dd>{k.meaning}</dd>
          </div>
        ))}
        {names.map((k) => (
          <div key={`n-${k.symbol}`} className="symkey__row">
            <dt className="math">{k.symbol}</dt>
            <dd>{k.meaning}</dd>
          </div>
        ))}
      </dl>
      {names.length > 0 && <p className="subtle">Lowercase letters a–t are names; x, y, z, u, w are variables.</p>}
    </div>
  );
}
