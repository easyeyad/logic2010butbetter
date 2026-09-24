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
}: {
  onInsert: (def: SymbolDef) => void;
  label?: string;
  compact?: boolean;
  /** Show the quantifier row (∀ ∃ and common terms). Defaults to the predicate-logic setting. */
  quantifiers?: boolean;
}) {
  const { settings } = useSettings();
  const showQ = quantifiers ?? settings.predicateMode;
  const button = (s: SymbolDef) => (
    <button
      key={s.key}
      type="button"
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
  if (showQ) {
    return (
      <div className={`symbar symbar--pred ${compact ? 'symbar--compact' : ''}`} role="toolbar" aria-label={label}>
        <div className="symbar__row">{SYMBOLS.map(button)}</div>
        <div className="symbar__row symbar__row--q" role="group" aria-label="Quantifiers and terms">
          {QUANTIFIER_SYMBOLS.map(button)}
        </div>
      </div>
    );
  }
  return (
    <div className={`symbar ${compact ? 'symbar--compact' : ''}`} role="toolbar" aria-label={label}>
      {SYMBOLS.map((s) => (
        <button
          key={s.key}
          type="button"
          className="symbar__btn math"
          aria-label={`Insert ${s.name}`}
          title={`${s.name} — or type ${s.typed}`}
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => e.pointerType !== "mouse" && e.preventDefault()}
          onClick={() => onInsert(s)}
        >
          {settings.asciiDisplay ? s.ascii : s.symbol}
        </button>
      ))}
    </div>
  );
}
