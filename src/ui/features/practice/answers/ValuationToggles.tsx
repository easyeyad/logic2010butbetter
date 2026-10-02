import type { Valuation } from '../../../../logic';
import { Icon } from '../../../components/Icon';
import { RadioButtons } from '../../../components/RadioButtons';

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
          <div key={a} className="valtoggle">
            <span className="valtoggle__letter math" aria-hidden="true">{a}</span>
            <RadioButtons<boolean>
              className="valtoggle__group"
              label={`${a} is`}
              value={value[a]}
              onChange={(b) => onChange({ ...value, [a]: b })}
              options={[true, false].map((b) => ({
                value: b,
                className: `valtoggle__opt valtoggle__opt--${b ? 't' : 'f'}`,
                label: (
                  <>
                    <Icon name={b ? 'check' : 'x'} size={14} />
                    {b ? 'True' : 'False'}
                  </>
                ),
              }))}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export function isComplete(atoms: string[], v: Partial<Valuation>): v is Valuation {
  return atoms.every((a) => typeof v[a] === 'boolean');
}
