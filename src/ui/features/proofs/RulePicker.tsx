import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { exactMatch, filterOptions, type JustOption } from './justification';

/**
 * Justification combobox with type-to-filter. Typing an exact abbreviation
 * ("mp") selects it immediately; arrows + Enter pick from the list.
 */
export function RulePicker({
  value,
  options,
  onChange,
  label,
  invalid,
  onKeyDown,
  disabled,
}: {
  value: string;
  options: JustOption[];
  onChange: (key: string) => void;
  label: string;
  invalid?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  // Reflect external changes (undo, selection) when not typing.
  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);

  const filtered = useMemo(() => filterOptions(options, open ? text : ''), [options, text, open]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  const choose = (o: JustOption) => {
    onChange(o.key);
    setText(o.abbr);
    setOpen(false);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      if (!open) setOpen(true);
      else setActive((a) => Math.min(filtered.length - 1, a + 1));
      return;
    }
    if (e.key === 'ArrowUp' && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      if (open) setActive((a) => Math.max(0, a - 1));
      return;
    }
    if (e.key === 'Enter' && open && filtered[active]) {
      e.preventDefault();
      e.stopPropagation();
      choose(filtered[active]);
      return;
    }
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setText(value);
      return;
    }
    if (e.key === 'Tab' && open && text.trim() && filtered[active] && filtered[active].key !== value) {
      choose(filtered[active]);
    }
    onKeyDown?.(e);
  };

  const shownLabel = options.find((o) => o.key === value);

  return (
    <div className="picker">
      <label htmlFor={id} className="visually-hidden">{label}</label>
      <input
        id={id}
        className={`picker__input ${invalid ? 'is-invalid' : ''} ${value ? 'has-value' : ''}`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${id}-opt-${active}` : undefined}
        aria-invalid={invalid || undefined}
        data-field="rule"
        value={text}
        disabled={disabled}
        placeholder="rule"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        title={shownLabel?.name}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          setOpen(true);
          setActive(0);
          const exact = exactMatch(options, t);
          if (exact) onChange(exact.key);
          else if (t.trim() === '') onChange('');
        }}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          setOpen(false);
          setText(value);
        }}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKey}
      />
      {open && (
        <ul id={listId} ref={listRef} role="listbox" className="picker__list" aria-label={`${label} options`}>
          {filtered.length === 0 && <li className="picker__empty">No rule matches “{text}”</li>}
          {filtered.map((o, i) => (
            <li
              key={o.key}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={`picker__opt ${o.key === value ? 'is-current' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
              onMouseEnter={() => setActive(i)}
            >
              <span className="picker__abbr">{o.abbr}</span>
              <span className="picker__name">{o.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
