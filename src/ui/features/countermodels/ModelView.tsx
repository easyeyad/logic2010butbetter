import type { Interpretation } from '../../../logic';
import { Icon } from '../../components/Icon';

const obj = (i: number) => `#${i + 1}`;

function Mark({ yes, label }: { yes: boolean; label: string }) {
  return (
    <span className={`mark mark--${yes ? 'yes' : 'no'}`} role="img" aria-label={label}>
      <Icon name={yes ? 'check' : 'x'} size={14} />
    </span>
  );
}

/** Domain as numbered object chips. */
export function DomainChips({ size, names }: { size: number; names?: Record<string, number> }) {
  return (
    <ul className="domain" aria-label={`Domain: ${size} object${size === 1 ? '' : 's'}`}>
      {Array.from({ length: size }, (_, i) => {
        const named = Object.entries(names ?? {})
          .filter(([, v]) => v === i)
          .map(([k]) => k);
        return (
          <li key={i} className="obj">
            <span className="obj__n">{obj(i)}</span>
            {named.length > 0 && <span className="obj__names math">{named.join(', ')}</span>}
          </li>
        );
      })}
    </ul>
  );
}

const has = (ext: number[][], tuple: number[]) => ext.some((t) => t.length === tuple.length && t.every((v, i) => v === tuple[i]));

/**
 * A finite interpretation, drawn for students: domain chips (with the names
 * that denote each object), then one table per predicate — monadic
 * predicates as a row of ✓/✗ per object, binary ones as a small matrix, and
 * sentence letters as True/False. Every mark carries text as well.
 */
export function ModelView({ model }: { model: Interpretation }) {
  const n = model.domainSize;
  const preds = Object.entries(model.predicates).sort(([a], [b]) => a.localeCompare(b));
  const names = Object.entries(model.names).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="model">
      <section className="model__sec">
        <h4 className="panel-h">Domain</h4>
        <DomainChips size={n} names={model.names} />
        {names.length > 0 && (
          <p className="model__names">
            {names.map(([k, v], i) => (
              <span key={k}>
                {i > 0 && ' · '}
                <span className="math">{k}</span> names object {obj(v)}
              </span>
            ))}
          </p>
        )}
      </section>
      {preds.map(([name, p]) => (
        <section key={name} className="model__sec">
          <h4 className="panel-h">
            <span className="math model__pname">{name}</span>
            {p.arity === 0 ? ' (sentence letter)' : p.arity === 1 ? ' (property)' : p.arity === 2 ? ' (relation)' : ` (${p.arity}-place)`}
          </h4>
          {p.arity === 0 && 'value' in p ? (
            <span className={`truth-pill truth-pill--${p.value ? 't' : 'f'}`}>
              <Icon name={p.value ? 'check' : 'x'} size={14} />
              {name} is {p.value ? 'True' : 'False'}
            </span>
          ) : p.arity === 1 && 'extension' in p ? (
            <ul className="mono-row" aria-label={`Objects that are ${name}`}>
              {Array.from({ length: n }, (_, i) => {
                const yes = has(p.extension, [i]);
                return (
                  <li key={i} className={`mono-cell ${yes ? 'is-yes' : ''}`}>
                    <span className="obj__n">{obj(i)}</span>
                    <Mark yes={yes} label={yes ? 'yes' : 'no'} />
                    <span className="mono-cell__txt">{yes ? name : `not ${name}`}</span>
                  </li>
                );
              })}
            </ul>
          ) : p.arity === 2 && 'extension' in p ? (
            <div className="tt-scroll matrix-wrap">
              <table className="matrix">
                <caption className="visually-hidden">
                  {name}xy: rows are x, columns are y
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="matrix__corner">
                      <span className="math">{name}</span>
                      <span className="subtle"> x↓ y→</span>
                    </th>
                    {Array.from({ length: n }, (_, j) => (
                      <th key={j} scope="col">{obj(j)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: n }, (_, i) => (
                    <tr key={i}>
                      <th scope="row">{obj(i)}</th>
                      {Array.from({ length: n }, (_, j) => {
                        const yes = has(p.extension, [i, j]);
                        return (
                          <td key={j} className={yes ? 'is-yes' : ''}>
                            <Mark yes={yes} label={`${name}(${obj(i)}, ${obj(j)}): ${yes ? 'yes' : 'no'}`} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : 'extension' in p ? (
            <p className="math">
              {p.extension.length ? p.extension.map((t) => `⟨${t.map(obj).join(', ')}⟩`).join('  ') : 'no tuples (empty)'}
            </p>
          ) : null}
        </section>
      ))}
    </div>
  );
}
