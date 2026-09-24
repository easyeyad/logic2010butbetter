import { useSettings } from '../app/settings';
import { SYMBOLS, type SymbolDef } from './symbols';

/**
 * Row of connective buttons. Buttons don't steal focus on mouse/touch
 * (preventDefault on pointer down), so the caret stays in the input; keyboard
 * users can Tab to them and press Enter/Space, after which focus returns to
 * the input.
 */
export function SymbolBar({ onInsert, label = 'Insert symbol', compact }: { onInsert: (def: SymbolDef) => void; label?: string; compact?: boolean }) {
  const { settings } = useSettings();
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
