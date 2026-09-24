import type { Interpretation } from '../../../../logic';
import { Icon } from '../../../components/Icon';

type Ext = Record<string, number[][] | boolean>;

export interface BuilderState {
  size: number;
  names: Record<string, number>;
  ext: Ext;
}

export function emptyBuilder(predicates: { name: string; arity: number }[], names: string[], size = 2): BuilderState {
  const ext: Ext = {};
  predicates.forEach((p) => (ext[p.name] = p.arity === 0 ? false : []));
  return { size, names: Object.fromEntries(names.map((n) => [n, 0])), ext };
}

export function toInterpretation(s: BuilderState, predicates: { name: string; arity: number }[]): Interpretation {
  const inRange = (t: number[]) => t.every((v) => v < s.size);
  return {
    domainSize: s.size,
    names: Object.fromEntries(Object.entries(s.names).map(([k, v]) => [k, Math.min(v, s.size - 1)])),
    predicates: Object.fromEntries(
      predicates.map((p) => {
        const e = s.ext[p.name];
        return [p.name, p.arity === 0 ? { arity: 0 as const, value: Boolean(e) } : { arity: p.arity, extension: (Array.isArray(e) ? e : []).filter(inRange) }];
      }),
    ),
  };
}

const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const obj = (i: number) => `#${i + 1}`;

/**
 * Build a finite model by hand: domain size 1–4, which object each name
 * denotes, and each predicate's extension (toggle chips for properties, a
 * ✓/✗ grid for relations). Every control is a ≥44px button with text.
 */
export function ModelBuilder({
  state,
  onChange,
  predicates,
  maxSize = 4,
}: {
  state: BuilderState;
  onChange: (s: BuilderState) => void;
  predicates: { name: string; arity: number }[];
  maxSize?: number;
}) {
  const n = state.size;
  const toggle = (name: string, t: number[]) => {
    const cur = state.ext[name];
    const list = Array.isArray(cur) ? cur : [];
    const next = list.some((x) => same(x, t)) ? list.filter((x) => !same(x, t)) : [...list, t];
    onChange({ ...state, ext: { ...state.ext, [name]: next } });
  };
  const inExt = (name: string, t: number[]) => {
    const cur = state.ext[name];
    return Array.isArray(cur) && cur.some((x) => same(x, t));
  };
  const objs = Array.from({ length: n }, (_, i) => i);

  return (
    <div className="builder">
      <div className="field">
        <span className="field__label" id="dom-size">Domain size</span>
        <div className="segmented" role="radiogroup" aria-labelledby="dom-size">
          {Array.from({ length: maxSize }, (_, i) => i + 1).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={n === k} onClick={() => onChange({ ...state, size: k })}>
              {k} object{k === 1 ? '' : 's'}
            </button>
          ))}
        </div>
      </div>

      {Object.keys(state.names).length > 0 && (
        <div className="builder__sec">
          <div className="field__label">Names</div>
          {Object.keys(state.names).sort().map((nm) => (
            <div key={nm} className="builder__row" role="radiogroup" aria-label={`${nm} names object…`}>
              <span className="builder__sym math">{nm} =</span>
              {objs.map((i) => (
                <button key={i} type="button" role="radio" aria-checked={Math.min(state.names[nm], n - 1) === i} className="objbtn" onClick={() => onChange({ ...state, names: { ...state.names, [nm]: i } })}>
                  {obj(i)}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {predicates.map((p) => (
        <div key={p.name} className="builder__sec">
          <div className="field__label">
            <span className="math">{p.name}</span>{' '}
            {p.arity === 0 ? '(sentence letter)' : p.arity === 1 ? '— tap the objects that are ' + p.name : '— tap the pairs ⟨x, y⟩ in the relation'}
          </div>
          {p.arity === 0 ? (
            <div className="builder__row" role="radiogroup" aria-label={`${p.name} is`}>
              {[true, false].map((b) => (
                <button key={String(b)} type="button" role="radio" aria-checked={Boolean(state.ext[p.name]) === b} className={`valtoggle__opt valtoggle__opt--${b ? 't' : 'f'}`} onClick={() => onChange({ ...state, ext: { ...state.ext, [p.name]: b } })}>
                  <Icon name={b ? 'check' : 'x'} size={14} /> {b ? 'True' : 'False'}
                </button>
              ))}
            </div>
          ) : p.arity === 1 ? (
            <div className="builder__row">
              {objs.map((i) => {
                const on = inExt(p.name, [i]);
                return (
                  <button key={i} type="button" aria-pressed={on} className={`chipbtn ${on ? 'is-on' : ''}`} onClick={() => toggle(p.name, [i])} aria-label={`Object ${obj(i)} is ${p.name}`}>
                    <span className="obj__n">{obj(i)}</span>
                    <Icon name={on ? 'check' : 'x'} size={14} />
                    <span className="math">{on ? p.name : `not ${p.name}`}</span>
                  </button>
                );
              })}
            </div>
          ) : p.arity === 2 ? (
            <div className="tt-scroll matrix-wrap">
              <table className="matrix matrix--edit">
                <caption className="visually-hidden">{p.name}: rows are x, columns are y</caption>
                <thead>
                  <tr>
                    <th scope="col" className="matrix__corner"><span className="math">{p.name}</span><span className="subtle"> x↓ y→</span></th>
                    {objs.map((j) => <th key={j} scope="col">{obj(j)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {objs.map((i) => (
                    <tr key={i}>
                      <th scope="row">{obj(i)}</th>
                      {objs.map((j) => {
                        const on = inExt(p.name, [i, j]);
                        return (
                          <td key={j} className={on ? 'is-yes' : ''}>
                            <button type="button" aria-pressed={on} className="cellbtn" aria-label={`${p.name}(${obj(i)}, ${obj(j)})`} onClick={() => toggle(p.name, [i, j])}>
                              <Icon name={on ? 'check' : 'x'} size={16} />
                              <span className="visually-hidden">{on ? 'yes' : 'no'}</span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="subtle">Predicates with {p.arity} places aren't editable here.</p>
          )}
        </div>
      ))}
    </div>
  );
}
