import { Link } from 'react-router-dom';
import type { Formula, PredicateValidityResult } from '../../../logic';
import { FormulaText } from '../../components/FormulaText';
import { Icon } from '../../components/Icon';
import { Notice } from '../../components/Notice';
import { safeDescribeInterpretation, safeEvaluateIn, safeFormat } from '../../engine/safe';
import { ModelView } from './ModelView';

/**
 * Verdict for an argument with quantifiers. A countermodel is drawn in full
 * and every premise / the conclusion is evaluated in it. When no countermodel
 * is found we say exactly that — predicate validity is undecidable, so we
 * never claim "valid" from a failed search.
 */
export function PredicateVerdict({
  result,
  premises,
  conclusion,
  ascii,
}: {
  result: PredicateValidityResult;
  premises: Formula[];
  conclusion: Formula;
  ascii: boolean;
}) {
  if (result.status === 'valid') {
    return (
      <div className="verdict-card verdict-card--valid">
        <div className="verdict-card__title"><Icon name="checkCircle" size={28} /> Valid</div>
        <p>{result.explanation}</p>
      </div>
    );
  }
  if (result.status === 'no-countermodel-found' || !result.countermodel) {
    return (
      <div className="verdict-card verdict-card--unknown" role="status">
        <div className="verdict-card__title"><Icon name="search" size={26} /> No countermodel found</div>
        <p>
          There is no countermodel with up to {result.searchedUpTo} object{result.searchedUpTo === 1 ? '' : 's'}. That suggests the
          argument is valid — but with quantifiers a search can't prove it. To be sure, prove it with a derivation.
        </p>
        <div>
          <Link
            to={`/proofs?${new URLSearchParams({ premises: premises.map((p) => safeFormat(p)).join('\n'), goal: safeFormat(conclusion) }).toString()}`}
            className="btn btn--primary"
          >
            Prove it in the proof editor <Icon name="arrowRight" />
          </Link>
        </div>
      </div>
    );
  }
  const m = result.countermodel;
  const val = (f: Formula) => {
    const r = safeEvaluateIn(f, m);
    return r.ok ? r.value : null;
  };
  const desc = safeDescribeInterpretation(m);
  return (
    <div className="verdict-card verdict-card--invalid">
      <div className="verdict-card__title"><Icon name="xCircle" size={28} /> Invalid</div>
      <p className="subtle">
        Here is a countermodel with {m.domainSize} object{m.domainSize === 1 ? '' : 's'}: every premise is true in it and the conclusion is
        false.
      </p>
      <ModelView model={m} />
      <div>
        <h3 className="panel-h">In this model</h3>
        <ul className="eval-list">
          {premises.map((p, i) => {
            const v = val(p);
            return (
              <li key={i}>
                <span className="eval-list__role">Premise {i + 1}</span>
                <FormulaText text={safeFormat(p, ascii)} className="eval-list__f" />
                {v !== null && <Pill v={v} />}
              </li>
            );
          })}
          <li className="eval-list__concl">
            <span className="eval-list__role">Conclusion</span>
            <FormulaText text={safeFormat(conclusion, ascii)} className="eval-list__f" />
            {val(conclusion) !== null && <Pill v={Boolean(val(conclusion))} />}
          </li>
        </ul>
      </div>
      <p className="narrative">{result.explanation}</p>
      {desc.length > 0 && (
        <details className="rule__more">
          <summary>The model in words</summary>
          <ul className="model__desc">
            {desc.map((d, i) => (
              <li key={i} className="math">{d}</li>
            ))}
          </ul>
        </details>
      )}
      {premises.some((p) => val(p) === false) || val(conclusion) === true ? (
        <Notice tone="warn">This model doesn't fit the argument as expected — please report it.</Notice>
      ) : null}
    </div>
  );
}

function Pill({ v }: { v: boolean }) {
  return (
    <span className={`truth-pill truth-pill--${v ? 't' : 'f'}`}>
      <Icon name={v ? 'check' : 'x'} size={14} />
      {v ? 'True' : 'False'}
    </span>
  );
}
