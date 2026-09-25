import React, {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react';
import type { ParseResult } from '../../logic';
import { useSettings } from '../app/settings';
import { safeNormalize, safeParse } from '../engine/safe';
import { useDebounced } from '../hooks/useDebounced';
import { BP, useMediaQuery } from '../hooks/useMediaQuery';
import { useFormulaTarget } from './FormulaTarget';
import { FormulaText } from './FormulaText';
import { Icon } from './Icon';
import { SymbolBar } from './SymbolBar';
import { endsWithPartialConnective, insertAt, type SymbolDef } from './symbols';

export interface FormulaInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> {
  value: string;
  onChange: (text: string) => void;
  /** Accessible label (always present; visually hidden with hideLabel). */
  label: string;
  hideLabel?: boolean;
  /** Dense variant for proof lines: no built-in toolbar, smaller error area. */
  compact?: boolean;
  /** Show the symbol toolbar. Defaults to !compact. */
  toolbar?: boolean;
  /** Run live parse validation (default true). */
  validate?: boolean;
  /** Extra element ids for aria-describedby. */
  describedBy?: string;
  /** Called with the (debounced) parse result, or null when empty/unavailable. */
  onParsed?: (r: ParseResult | null) => void;
  /** Forces the invalid state (e.g. the checker found a problem). */
  invalid?: boolean;
  /** Hide the success check (e.g. when the parent shows its own status). */
  hideSuccess?: boolean;
  debounceMs?: number;
  /**
   * Wrap long formulas onto several lines (auto-growing textarea; Enter never
   * inserts a newline). Defaults to `compact`.
   */
  wrap?: boolean;
}

export interface FormulaInputHandle {
  focus: (caret?: 'start' | 'end') => void;
  input: HTMLInputElement | HTMLTextAreaElement | null;
}

export const FormulaInput = forwardRef<FormulaInputHandle, FormulaInputProps>(function FormulaInput(
  {
    value,
    onChange,
    label,
    hideLabel,
    compact,
    toolbar,
    validate = true,
    describedBy,
    onParsed,
    invalid,
    hideSuccess,
    debounceMs = 150,
    wrap,
    id: idProp,
    className,
    onKeyDown,
    onFocus,
    onBlur,
    placeholder,
    ...rest
  },
  ref,
) {
  const { settings } = useSettings();
  const ascii = settings.asciiDisplay;
  const autoId = useId();
  const id = idProp ?? `fi-${autoId}`;
  const msgId = `${id}-msg`;
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const multiline = wrap ?? Boolean(compact);
  const pendingCaret = useRef<number | null>(null);
  const lastSel = useRef<{ start: number; end: number }>({ start: value.length, end: value.length });
  const target = useFormulaTarget();
  const isPhone = useMediaQuery(BP.mobile);
  const [within, setWithin] = useState(false);

  useImperativeHandle(ref, () => ({
    focus: (caret) => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      if (caret === 'start') el.setSelectionRange(0, 0);
      else if (caret === 'end') el.setSelectionRange(el.value.length, el.value.length);
    },
    get input() {
      return inputRef.current;
    },
  }));

  // Auto-grow the wrapping textarea to fit its content.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!multiline || !el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, multiline]);

  // Restore the caret after a normalization/insertion re-render.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el && pendingCaret.current != null && document.activeElement === el) {
      const c = Math.min(pendingCaret.current, el.value.length);
      el.setSelectionRange(c, c);
    }
    pendingCaret.current = null;
  }, [value]);

  const emit = useCallback(
    (input: string, caretIn: number, force = false) => {
      // A formula is one line: drop pasted newlines.
      const before = input.slice(0, caretIn).replace(/[\r\n]+/g, ' ');
      const raw = before + input.slice(caretIn).replace(/[\r\n]+/g, ' ');
      const caret = before.length;
      if (ascii) {
        pendingCaret.current = caret;
        onChange(raw);
        return;
      }
      if (!force && endsWithPartialConnective(raw.slice(0, caret))) {
        pendingCaret.current = caret;
        onChange(raw);
        return;
      }
      const n = safeNormalize(raw, caret);
      pendingCaret.current = n.caret;
      onChange(n.text);
    },
    [ascii, onChange],
  );

  const insert = useCallback(
    (def: SymbolDef) => {
      const el = inputRef.current;
      const sel = el && document.activeElement === el ? { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 } : lastSel.current;
      const r = insertAt(value, sel.start, sel.end, def, ascii);
      pendingCaret.current = r.caret;
      lastSel.current = { start: r.caret, end: r.caret };
      el?.focus();
      onChange(r.text);
    },
    [value, ascii, onChange],
  );

  // Keep the shared-toolbar registration pointing at the latest inserter.
  const insertRef = useRef(insert);
  useEffect(() => {
    insertRef.current = insert;
  }, [insert]);

  const rememberSel = () => {
    const el = inputRef.current;
    if (el) lastSel.current = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
  };

  // Debounced live parse.
  const debounced = useDebounced(value, debounceMs);
  const parsed = useMemo(() => {
    if (!validate || debounced.trim() === '') return null;
    return { text: debounced, result: safeParse(debounced) };
  }, [debounced, validate]);

  useEffect(() => {
    if (!onParsed) return;
    onParsed(parsed && parsed.result.ok ? parsed.result.value : null);
  }, [parsed, onParsed]);

  const stale = debounced !== value;
  const result = parsed?.result;
  const parseError = !stale && result?.ok && !result.value.ok ? result.value.error : null;
  const parseOk = !stale && result?.ok && result.value.ok;
  const engineDown = !stale && result && !result.ok;
  const isInvalid = Boolean(parseError) || Boolean(invalid);
  // On phones a field's symbol bar appears only while the field (or its bar) has focus.
  const showToolbar = (toolbar ?? !compact) && (!isPhone || within);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (multiline && e.key === 'Enter') e.preventDefault(); // never a newline; parents may still act on Enter
    onKeyDown?.(e as KeyboardEvent<HTMLInputElement>);
  };

  return (
    <div
      className={`fi ${compact ? 'fi--compact' : ''} ${className ?? ''}`}
      onFocus={() => setWithin(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setWithin(false);
      }}
    >
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : 'field__label'}>
        {label}
      </label>
      <div className={`fi__box ${isInvalid ? 'is-invalid' : ''} ${parseOk && !invalid ? 'is-valid' : ''}`}>
        {multiline ? (
          <textarea
            {...(rest as Record<string, unknown>)}
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            rows={1}
            data-multiline=""
            id={id}
            className="fi__input math"
            value={value}
            placeholder={placeholder ?? (compact ? 'formula' : 'e.g. (P & Q) -> R')}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize={settings.predicateMode ? "none" : "characters"}
            spellCheck={false}
            inputMode="text"
            aria-invalid={isInvalid || undefined}
            aria-describedby={[parseError || engineDown ? msgId : null, describedBy].filter(Boolean).join(' ') || undefined}
            onChange={(e) => emit(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onSelect={rememberSel}
            onKeyUp={rememberSel}
            onKeyDown={handleKeyDown}
            onFocus={(e: FocusEvent<HTMLTextAreaElement>) => {
              target?.register((d) => insertRef.current(d));
              onFocus?.(e as unknown as FocusEvent<HTMLInputElement>);
            }}
            onBlur={(e: FocusEvent<HTMLTextAreaElement>) => {
              rememberSel();
              if (!ascii && endsWithPartialConnective(value)) emit(value, value.length, true);
              onBlur?.(e as unknown as FocusEvent<HTMLInputElement>);
            }}
          />
        ) : (
          <input
            {...rest}
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            id={id}
            className="fi__input math"
            value={value}
            placeholder={placeholder ?? (compact ? 'formula' : 'e.g. (P & Q) -> R')}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize={settings.predicateMode ? "none" : "characters"}
            spellCheck={false}
            inputMode="text"
            aria-invalid={isInvalid || undefined}
            aria-describedby={[parseError || engineDown ? msgId : null, describedBy].filter(Boolean).join(' ') || undefined}
            onChange={(e) => emit(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onSelect={rememberSel}
            onKeyUp={rememberSel}
            onKeyDown={handleKeyDown}
            onFocus={(e: FocusEvent<HTMLInputElement>) => {
              target?.register((d) => insertRef.current(d));
              onFocus?.(e);
            }}
            onBlur={(e: FocusEvent<HTMLInputElement>) => {
              rememberSel();
              if (!ascii && endsWithPartialConnective(value)) emit(value, value.length, true);
              onBlur?.(e);
            }}
          />
        )}
        {parseOk && !invalid && !hideSuccess && (
          <span className="fi__ok" title="Well-formed formula">
            <Icon name="check" size={16} />
            <span className="visually-hidden">Well-formed formula</span>
          </span>
        )}
      </div>
      {showToolbar && <SymbolBar onInsert={insert} label={`Insert symbol into ${label}`} />}
      {parseError && (
        <div id={msgId} className="fi__error" role="status">
          <Icon name="xCircle" size={16} />
          <div className="fi__error-body">
            <div className="fi__render">
              <FormulaText text={debounced} span={parseError.span} />
            </div>
            <div className="fi__msg">
              <strong>Not well-formed:</strong> {parseError.message}
            </div>
            {parseError.hint && <div className="fi__hint">{parseError.hint}</div>}
          </div>
        </div>
      )}
      {engineDown && !compact && (
        <div id={msgId} className="fi__note">
          <Icon name="info" size={16} /> Live checking is unavailable right now.
        </div>
      )}
    </div>
  );
});
