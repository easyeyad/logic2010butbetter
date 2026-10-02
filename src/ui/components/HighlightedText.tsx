import type React from 'react';
import type { HighlightSpan } from '../../learning';

/** Text with feedback spans marked (underline + tint + tone class; never color alone). */
export function HighlightedText({ text, spans, className, math }: { text: string; spans?: HighlightSpan[]; className?: string; math?: boolean }) {
  const list = (spans ?? [])
    .map((s) => ({ ...s, start: Math.max(0, Math.min(s.start, text.length)), end: Math.max(0, Math.min(s.end, text.length)) }))
    .filter((s) => s.end >= s.start)
    .sort((a, b) => a.start - b.start);
  const out: React.ReactNode[] = [];
  let pos = 0;
  list.forEach((s, i) => {
    if (s.start < pos) return;
    if (s.start > pos) out.push(text.slice(pos, s.start));
    const piece = text.slice(s.start, s.end);
    out.push(
      <mark key={i} className={`hl hl--${s.tone} ${piece.trim() ? '' : 'hl--point'}`}>
        <span className="visually-hidden">{s.tone === 'error' ? '[problem: ' : '['}</span>
        {piece || ' '}
        <span className="visually-hidden">]</span>
      </mark>,
    );
    pos = s.end;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return <span className={`${math ? 'math' : ''} ${className ?? ''}`}>{out}</span>;
}
