import { Link } from 'react-router-dom';
import type { Formula } from '../../../logic';
import { FormulaText } from '../../components/FormulaText';
import { Icon } from '../../components/Icon';
import { EngineError, Notice } from '../../components/Notice';
import { describeModelInWords, type PredicateCheck } from '../../engine/predicateCheck';
import { safeEvaluateIn, safeFormat } from '../../engine/safe';
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
  result: PredicateCheck;
  premises: Formula[];
  conclusion: Formula;
  ascii: boolean;
}) {
  if (result.kind === 'engine') return <EngineError error={result.error} />;
  if (result.kind === 'input-problems') {
    return (
      <Notice tone="err" role="alert" title="Fix the argument before checking it">
        <ul className="problem-msgs">
          {result.problems.map((p, i) => (
            <li key={i}>{p.message}</li>
          ))}
        </ul>
      </Notice>
    );
  }
  if (result.kind === 'too-large') {
    return (
      <div className="verdict-card verdict-card--unknown" role="status">
        <h2 className="verdict-card__title"><Icon name="alert" size={26} /> No conclusion</h2>
        <p>
          The search was too large to finish
          {result.searchedUpTo >= 1 ? ` (it fully searched worlds of up to ${result.searchedUpTo} object${result.searchedUpTo === 1 ? '' : 's'})` : ''}. That
          says nothing either way about whether the argument is valid.
        </p>
        <p className="subtle">Try a simpler version, or look for a derivation in the proof editor.</p>
      </div>
    );
  }
  if (result.kind === 'none-found') {
    return (
      <div className="verdict-card verdict-card--unknown" role="status">
        <h2 className="verdict-card__title"><Icon name="search" size={26} /> No countermodel found</h2>
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
  const m = result.model;
  const val = (f: Formula) => {
    const r = safeEvaluateIn(f, m);
    return r.ok ? r.value : null;
  };
  const desc = describeModelInWords(m);
  return (
    <div className="verdict-card verdict-card--invalid">
      <h2 className="verdict-card__title"><Icon name="xCircle" size={28} /> Invalid</h2>
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
      <p className="narrative">
        Invalid: in this world of {m.domainSize} object{m.domainSize === 1 ? '' : 's'} every premise is true and the conclusion is false.
      </p>
      {desc.length > 0 && (
        <details className="rule__more">
          <summary>The model in words</summary>
          <ul className="model__desc">
            {desc.map((d, i) => (
              <li key={i}>{d}</li>
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
