import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { formatRefs, parseRefs, sameRefs } from './draftOps';

/** Line-reference field ("1,2" or "1 2"). Keeps partial text while typing. */
export function RefsInput({
  refs,
  onChange,
  label,
  invalid,
  onKeyDown,
  noRefs,
}: {
  refs: number[] | undefined;
  onChange: (refs: number[]) => void;
  label: string;
  invalid?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** The rule cites no lines (e.g. Id): show a disabled "none" field with a note. */
  noRefs?: string;
}) {
  const id = useId();
  const [text, setText] = useState(formatRefs(refs));
  const parsed = parseRefs(text);

  // Sync when refs change from outside (undo, renumbering).
  useEffect(() => {
    setText((t) => (sameRefs(parseRefs(t) ?? undefined, refs) ? t : formatRefs(refs)));
  }, [refs]);

  const bad = parsed === null;
  if (noRefs && (!refs || refs.length === 0)) {
    return (
      <div className="refs">
        <label htmlFor={id} className="visually-hidden">{label}</label>
        <input id={id} className="refs__input refs__input--none" data-field="refs" value="" placeholder="none" disabled title={noRefs} aria-description={noRefs} />
      </div>
    );
  }
  return (
    <div className="refs">
      <label htmlFor={id} className="visually-hidden">{label}</label>
      <input
        id={id}
        className={`refs__input ${invalid || bad ? 'is-invalid' : ''}`}
        data-field="refs"
        value={text}
        inputMode="decimal"
        placeholder="lines"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid || bad || undefined}
        title={bad ? 'Use line numbers separated by commas or spaces, e.g. 1, 2' : undefined}
        onChange={(e) => {
          setText(e.target.value);
          const p = parseRefs(e.target.value);
          if (p) onChange(p);
        }}
        onBlur={() => {
          const p = parseRefs(text);
          if (p) setText(formatRefs(p));
        }}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
