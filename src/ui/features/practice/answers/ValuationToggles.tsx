import type { Valuation } from '../../../../logic';
import { Icon } from '../../../components/Icon';

/** One True/False switch pair per sentence letter. `value[letter]` undefined = not chosen yet. */
export function ValuationToggles({
  atoms,
  value,
  onChange,
  disabled,
  label = 'Truth values',
}: {
  atoms: string[];
  value: Partial<Valuation>;
  onChange: (v: Partial<Valuation>) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <fieldset className="valtoggles" disabled={disabled}>
      <legend className="field__label">{label}</legend>
      <div className="valtoggles__grid">
        {atoms.map((a) => (
          <div key={a} className="valtoggle" role="radiogroup" aria-label={`${a} is`}>
            <span className="valtoggle__letter math">{a}</span>
            {[true, false].map((b) => (
              <button
                key={String(b)}
                type="button"
                role="radio"
                aria-checked={value[a] === b}
                className={`valtoggle__opt valtoggle__opt--${b ? 't' : 'f'}`}
                onClick={() => onChange({ ...value, [a]: b })}
              >
                <Icon name={b ? 'check' : 'x'} size={14} />
                {b ? 'True' : 'False'}
              </button>
            ))}
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export function isComplete(atoms: string[], v: Partial<Valuation>): v is Valuation {
  return atoms.every((a) => typeof v[a] === 'boolean');
}
