import type { Span } from '../../logic';

/** Renders formula text in the math font, optionally marking an error span. */
export function FormulaText({ text, span, className }: { text: string; span?: Span; className?: string }) {
  if (!span) return <span className={`math ${className ?? ''}`}>{text}</span>;
  const start = Math.max(0, Math.min(span.start, text.length));
  const end = Math.max(start, Math.min(span.end, text.length));
  const before = text.slice(0, start);
  const bad = text.slice(start, end);
  const after = text.slice(end);
  return (
    <span className={`math fx ${className ?? ''}`}>
      {before}
      {bad.trim().length > 0 ? (
        <mark className="fx-err">{bad}</mark>
      ) : (
        <mark className="fx-err fx-err--point" aria-label="(missing here)">
          {bad || ' '}
        </mark>
      )}
      {after}
    </span>
  );
}
