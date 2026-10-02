import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface RadioOption<T> {
  value: T;
  label: ReactNode;
  ariaLabel?: string;
  className?: string;
}

/**
 * Button-styled radio group following the WAI-ARIA radio pattern: one tab
 * stop (the checked option, or the first), arrow keys move and select,
 * Home/End jump to the ends.
 */
export function RadioButtons<T extends string | number | boolean>({
  options,
  value,
  onChange,
  label,
  labelledBy,
  className = 'segmented',
  buttonClassName,
}: {
  options: RadioOption<T>[];
  value: T | undefined;
  onChange: (v: T) => void;
  label?: string;
  labelledBy?: string;
  className?: string;
  buttonClassName?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = options.findIndex((o) => o.value === value);
  const tabStop = current >= 0 ? current : 0;

  const onKey = (e: KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div className={className} role="radiogroup" aria-label={label} aria-labelledby={labelledBy}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.ariaLabel}
          tabIndex={i === tabStop ? 0 : -1}
          className={[buttonClassName, o.className].filter(Boolean).join(' ') || undefined}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
