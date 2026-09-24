import type React from 'react';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../../components/Icon';

/** Large radio-card choices (keyboard: native radios). */
export function ChoiceGroup<T extends string | number | boolean>({
  label,
  options,
  value,
  onChange,
  columns,
}: {
  label: string;
  options: { value: T; label: ReactNode; description?: ReactNode; icon?: IconName }[];
  value: T | undefined;
  onChange: (v: T) => void;
  columns?: number;
}) {
  const name = `choice-${label.replace(/\W+/g, '-')}`;
  return (
    <fieldset className="choices" style={columns ? ({ '--cols': columns } as React.CSSProperties) : undefined}>
      <legend className="field__label">{label}</legend>
      <div className="choices__grid">
        {options.map((o) => (
          <label key={String(o.value)} className={`choice ${value === o.value ? 'is-selected' : ''}`}>
            <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.icon && <Icon name={o.icon} size={18} />}
            <span className="choice__text">
              <span className="choice__label">{o.label}</span>
              {o.description && <span className="choice__desc">{o.description}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
