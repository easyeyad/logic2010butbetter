import type { CSSProperties } from 'react';
import type { Formula, Valuation } from '../../../logic';
import { FormulaText } from '../../components/FormulaText';
import { Icon } from '../../components/Icon';
import { safeEvaluate, safeFormat } from '../../engine/safe';
import { countermodelNarrative } from './narrative';

function Value({ v }: { v: boolean }) {
  return (
    <span className={`truth-pill truth-pill--${v ? 't' : 'f'}`}>
      <Icon name={v ? 'check' : 'x'} size={14} />
      {v ? 'True' : 'False'}
    </span>
  );
}

/** One countermodel: a card per sentence letter, then each sentence's value and a narrative. */
export function CountermodelView({
  atoms,
  valuation,
  premises,
  conclusion,
  ascii,
}: {
  atoms: string[];
  valuation: Valuation;
  premises: Formula[];
  conclusion: Formula;
  ascii: boolean;
}) {
  const val = (f: Formula) => {
    const r = safeEvaluate(f, valuation);
    return r.ok ? r.value : null;
  };
  return (
    <div className="stack">
      <div>
        <h3 className="panel-h">Assignment</h3>
        <ul className="atom-cards">
          {atoms.map((a) => (
            <li key={a} className={`atom-card atom-card--${valuation[a] ? 't' : 'f'}`}>
              <span className="atom-card__name math">{a}</span>
              <span className="atom-card__eq" aria-hidden="true">=</span>
              <Value v={Boolean(valuation[a])} />
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="panel-h">Under this assignment</h3>
        <ul className="eval-list">
          {premises.map((p, i) => {
            const v = val(p);
            return (
              <li key={i}>
                <span className="eval-list__role">Premise {i + 1}</span>
                <FormulaText text={safeFormat(p, ascii)} className="eval-list__f" />
                {v !== null && <Value v={v} />}
              </li>
            );
          })}
          <li className="eval-list__concl">
            <span className="eval-list__role">Conclusion</span>
            <FormulaText text={safeFormat(conclusion, ascii)} className="eval-list__f" />
            {val(conclusion) !== null && <Value v={Boolean(val(conclusion))} />}
          </li>
        </ul>
      </div>
      <p className="narrative">{countermodelNarrative(atoms, valuation, premises.length)}</p>
    </div>
  );
}

/** All counterexample rows, compact table. */
export function CounterexampleTable({
  atoms,
  rows,
  premises,
  conclusion,
  ascii,
}: {
  atoms: string[];
  rows: Valuation[];
  premises: Formula[];
  conclusion: Formula;
  ascii: boolean;
}) {
  const ev = (f: Formula, v: Valuation) => {
    const r = safeEvaluate(f, v);
    return r.ok ? r.value : null;
  };
  const cell = (b: boolean | null) => (b === null ? '?' : b ? 'T' : 'F');
  return (
    <div className="tt-scroll" tabIndex={0} role="region" aria-label="All counterexample rows (scrolls horizontally)">
      <table className="tt tt--compact">
        <thead>
          <tr>
            {atoms.map((a, i) => (
              <th key={a} scope="col" className={`tt__h tt__atom ${i === atoms.length - 1 ? 'tt__atom--last' : ''}`} style={{ '--i': i } as CSSProperties}>
                <span className="math">{a}</span>
              </th>
            ))}
            {premises.map((p, i) => (
              <th key={i} scope="col" className="tt__h"><span className="math">{safeFormat(p, ascii)}</span></th>
            ))}
            <th scope="col" className="tt__h tt__main"><span className="math">{safeFormat(conclusion, ascii)}</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v, r) => (
            <tr key={r}>
              {atoms.map((a, i) => (
                <th key={a} scope="row" className={`tt__c tt__atom ${i === atoms.length - 1 ? 'tt__atom--last' : ''}`} style={{ '--i': i } as CSSProperties}>
                  <span className={`tv tv--${v[a] ? 't' : 'f'}`}>{v[a] ? 'T' : 'F'}</span>
                </th>
              ))}
              {premises.map((p, i) => {
                const b = ev(p, v);
                return <td key={i} className="tt__c"><span className={`tv tv--${b ? 't' : 'f'}`}>{cell(b)}</span></td>;
              })}
              <td className="tt__c tt__main"><span className="tv tv--f">{cell(ev(conclusion, v))}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
