import { useState, type KeyboardEvent } from 'react';
import { useSettings } from '../app/settings';
import { QUANTIFIER_SYMBOLS, SYMBOLS, type SymbolDef } from './symbols';

/**
 * Row of connective buttons. Buttons don't steal focus on mouse/touch
 * (preventDefault on pointer down), so the caret stays in the input; keyboard
 * users can Tab to them and press Enter/Space, after which focus returns to
 * the input.
 */
export function SymbolBar({
  onInsert,
  label = 'Insert symbol',
  compact,
  quantifiers,
  terms = true,
  termLetters,
}: {
  onInsert: (def: SymbolDef) => void;
  label?: string;
  compact?: boolean;
  /** Show the quantifier row (∀ ∃ and common terms). Defaults to the predicate-logic setting. */
  quantifiers?: boolean;
  /** Include the x y z a b term buttons (docked phone bars leave them out to stay compact). */
  terms?: boolean;
  /** Replace the default term buttons (x y z a b), e.g. with the names in a symbol key. */
  termLetters?: string[];
}) {
  const { settings } = useSettings();
  const showQ = quantifiers ?? settings.predicateMode;
  // Toolbar pattern: one tab stop; arrow keys / Home / End move between buttons.
  const [focusIdx, setFocusIdx] = useState(0);
  let idx = 0;
  const onToolbarKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button.symbar__btn'));
    const cur = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (cur < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (cur + 1) % btns.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (cur - 1 + btns.length) % btns.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = btns.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setFocusIdx(next);
    btns[next].focus();
  };
  const button = (s: SymbolDef) => {
    const my = idx++;
    return (
    <button
      key={s.key}
      type="button"
      tabIndex={my === focusIdx ? 0 : -1}
      onFocus={() => setFocusIdx(my)}
      className={`symbar__btn math ${s.group ? `symbar__btn--${s.group}` : ''}`}
      aria-label={`Insert ${s.name}`}
      title={s.group === 'term' ? s.name : `${s.name} — or type ${s.typed}`}
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.pointerType !== 'mouse' && e.preventDefault()}
      onClick={() => onInsert(s)}
    >
      {settings.asciiDisplay && !s.group ? s.ascii : s.symbol}
    </button>
    );
  };
  if (showQ) {
    return (
      <div className={`symbar symbar--pred ${compact ? 'symbar--compact' : ''}`} role="toolbar" aria-label={label} onKeyDown={onToolbarKey}>
        <div className="symbar__row">{SYMBOLS.map(button)}</div>
        <div className="symbar__row symbar__row--q" role="group" aria-label="Quantifiers and terms">
          {QUANTIFIER_SYMBOLS.filter((q) => q.group !== 'term').map(button)}
          {terms &&
            (termLetters
              ? termLetters.map((t) => ({
                  key: `t-${t}`,
                  symbol: t,
                  ascii: t,
                  name: 'uwxyz'.includes(t[0]) ? `variable ${t}` : `name ${t}`,
                  typed: t,
                  group: 'term' as const,
                }))
              : QUANTIFIER_SYMBOLS.filter((q) => q.group === 'term')
            ).map(button)}
        </div>
      </div>
    );
  }
  return (
    <div className={`symbar ${compact ? 'symbar--compact' : ''}`} role="toolbar" aria-label={label} onKeyDown={onToolbarKey}>
      {SYMBOLS.map(button)}
    </div>
  );
}
