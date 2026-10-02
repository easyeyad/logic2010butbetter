import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useSettings } from '../../app/settings';
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
  unavailable = [],
}: {
  value: string;
  options: JustOption[];
  onChange: (key: string) => void;
  label: string;
  invalid?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  /** Options that exist but are switched off (derived rules): explained when typed. */
  unavailable?: JustOption[];
}) {
  const { update } = useSettings();
  const id = useId();
  const listId = `${id}-list`;
  const popId = `${id}-pop`;
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // Keep the popover clear of fixed bottom bars (phone tab bar, proof tools bar): cap its height, or open upward.
  const [place, setPlace] = useState<{ up: boolean; maxHeight?: number }>({ up: false });
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (!r) return;
      let floor = window.innerHeight;
      document.querySelectorAll<HTMLElement>('.actionbar, .tabbar').forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.height > 0 && getComputedStyle(el).position === 'fixed') floor = Math.min(floor, b.top);
      });
      const gap = 8 + 12; // offset + the popover's own padding and border
      const below = floor - r.bottom - gap;
      const above = r.top - gap - 56; // leave room for a sticky header
      const want = 280;
      if (below >= Math.min(want, 160) || below >= above) setPlace({ up: false, maxHeight: Math.max(96, Math.min(want, below)) });
      else setPlace({ up: true, maxHeight: Math.max(96, Math.min(want, above)) });
    };
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [open]);

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
    <div
      className="picker"
      // Focus moving INSIDE the picker (e.g. Tab to "Enable derived rules") keeps the popover and the typed text.
      onBlur={(e) => {
        if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
        setFocused(false);
        setOpen(false);
        setText(value);
      }}
    >
      <label htmlFor={id} className="visually-hidden">{label}</label>
      <input
        id={id}
        className={`picker__input ${invalid ? 'is-invalid' : ''} ${value ? 'has-value' : ''}`}
        role="combobox"
        aria-expanded={open}
        // The listbox when there is one; otherwise the popover that explains why there are no options.
        aria-controls={open && filtered.length === 0 ? popId : listId}
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
        ref={inputRef}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKey}
      />
      {open && (
        // Popover: the listbox holds ONLY options (and presentational group headings); messages and the
        // "Enable derived rules" button sit beside it, still inside the picker so focus stays contained.
        <div ref={popRef} id={popId} className={`picker__pop ${place.up ? 'picker__pop--up' : ''}`}>
          {filtered.length > 0 ? (
            <ul
              id={listId}
              ref={listRef}
              role="listbox"
              className="picker__list"
              style={place.maxHeight ? { maxHeight: place.maxHeight } : undefined}
              aria-label={`${label} options`}
              // Chrome makes scrollable elements keyboard-focusable; keep Tab moving on to the cited-lines field.
              tabIndex={-1}
            >
              {filtered.map((o, i) => [
                !text.trim() && (i === 0 || filtered[i - 1].group !== o.group) ? (
                  <li key={`g-${o.group}`} role="presentation" className="picker__group">{o.group}</li>
                ) : null,
                <li
                  key={o.key}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={`picker__opt ${o.key === value ? 'is-current' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  // Only real pointer movement changes the highlight — a resting pointer must not override typing.
                  onPointerMove={() => i !== active && setActive(i)}
                >
                  <span className="picker__abbr">{o.abbr}</span>
                  <span className="picker__name">{o.name}</span>
                </li>,
              ])}
            </ul>
          ) : (() => {
            const off = filterOptions(unavailable, text)[0];
            return off && text.trim() ? (
              <div className="picker__empty picker__empty--derived" role="group" aria-label="Derived rule unavailable" data-testid="picker-derived">
                <span role="status">
                  <strong>{off.abbr}</strong> ({off.name}) is a derived rule, and derived rules are off.
                </span>
                <button
                  type="button"
                  className="btn btn--sm"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    update({ derivedRules: true });
                    // Use the rule that was typed, and go back to the field.
                    onChange(off.key);
                    setText(off.abbr);
                    setOpen(false);
                    inputRef.current?.focus();
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Escape') return;
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(false);
                    setText(value);
                    inputRef.current?.focus();
                  }}
                >
                  Enable derived rules
                </button>
                <span className="subtle">You can change this any time in Settings.</span>
              </div>
            ) : (
              <div className="picker__empty" role="status">No rule matches “{text}”</div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
