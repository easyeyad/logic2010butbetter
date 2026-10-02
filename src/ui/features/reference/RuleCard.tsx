import type { RuleInfo } from '../../../proof';
import { FormulaText } from '../../components/FormulaText';
import { Icon } from '../../components/Icon';

/** Premises over a line over the conclusion. */
export function Schema({ from, to, label }: { from: string[]; to: string; label: string }) {
  return (
    <figure className="schema" aria-label={`${label}: from ${from.length ? from.join(' and ') : 'nothing'} infer ${to}`}>
      {from.length > 0 && (
        <div className="schema__from">
          {from.map((f, i) => (
            <FormulaText key={i} text={f} />
          ))}
        </div>
      )}
      <div className="schema__bar" aria-hidden="true" />
      <div className="schema__to">
        <FormulaText text={to} />
      </div>
    </figure>
  );
}

export function RuleCard({ rule, compact, disabledNote }: { rule: RuleInfo; compact?: boolean; disabledNote?: string }) {
  const details = (
    <>
      <p className="rule__expl">{rule.explanation}</p>
      {rule.requirements.length > 0 && (
        <div className="rule__section">
          <h4>Requirements</h4>
          <ul className="rule__list">
            {rule.requirements.map((r, i) => (
              <li key={i}><Icon name="check" size={16} />{r}</li>
            ))}
          </ul>
        </div>
      )}
      {rule.pitfalls.length > 0 && (
        <div className="rule__section">
          <h4>Common mistakes</h4>
          <ul className="rule__list rule__list--warn">
            {rule.pitfalls.map((r, i) => (
              <li key={i}><Icon name="alert" size={16} />{r}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );

  return (
    <article className={`rule ${compact ? 'rule--compact' : ''}`} aria-labelledby={`rule-${rule.id}`}>
      <header className="rule__head">
        <span className="rule__abbr">{rule.abbreviation}</span>
        <h3 id={`rule-${rule.id}`} className="rule__name">{rule.name}</h3>
        {disabledNote && <span className="badge">{disabledNote}</span>}
      </header>
      <div className="rule__schemas">
        <div>
          <div className="rule__caption">Form</div>
          <Schema from={rule.schema.from} to={rule.schema.to} label="Form" />
        </div>
        <div>
          <div className="rule__caption">Example</div>
          <Schema from={rule.example.from} to={rule.example.to} label="Example" />
        </div>
      </div>
      {compact ? (
        <details className="rule__more">
          <summary>Explanation &amp; common mistakes</summary>
          {details}
        </details>
      ) : (
        details
      )}
    </article>
  );
}
