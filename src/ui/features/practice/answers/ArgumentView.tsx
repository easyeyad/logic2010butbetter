import type { Valuation } from '../../../../logic';
import { FormulaText } from '../../../components/FormulaText';
import { Icon } from '../../../components/Icon';
import { safeEvaluate, safeParse } from '../../../engine/safe';

function value(text: string, v?: Valuation): boolean | null {
  if (!v) return null;
  const p = safeParse(text);
  if (!p.ok || !p.value.ok) return null;
  const r = safeEvaluate(p.value.formula, v);
  return r.ok ? r.value : null;
}

/** Premises over a line, then the conclusion; optionally each sentence's value under `valuation`. */
export function ArgumentView({ premises, conclusion, valuation }: { premises: string[]; conclusion: string; valuation?: Valuation }) {
  const row = (label: string, text: string, concl?: boolean) => {
    const v = value(text, valuation);
    return (
      <li key={label} className={`argv__row ${concl ? 'argv__row--concl' : ''}`}>
        <span className="argv__role">{label}</span>
        <FormulaText text={text} className="argv__f" />
        {v !== null && (
          <span className={`truth-pill truth-pill--${v ? 't' : 'f'}`}>
            <Icon name={v ? 'check' : 'x'} size={14} />
            {v ? 'True' : 'False'}
          </span>
        )}
      </li>
    );
  };
  return (
    <ol className="argv" aria-label="Argument">
      {premises.map((p, i) => row(`Premise ${i + 1}`, p))}
      {row('∴ Conclusion', conclusion, true)}
    </ol>
  );
}
