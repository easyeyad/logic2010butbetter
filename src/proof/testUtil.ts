/**
 * Test-only helper: build a DerivationDraft from a compact text form.
 *
 *   P → Q          | PR
 *   Show Q         | DD 4        (closed Show; "Show" alone = open)
 *     Q            | MP 1,2
 *     P            | ASS CD
 *
 * Depth = leading spaces / 2.
 */
import type { DerivationDraft, DraftLine, RuleId } from './types';

export function draft(src: string, extra: Partial<DerivationDraft> = {}): DerivationDraft {
  const rows = src.split('\n').filter((l) => l.trim() !== '');
  const indent = Math.min(...rows.map((r) => r.match(/^ */)![0].length));
  const lines: DraftLine[] = rows.map((row, i) => {
    const r = row.slice(indent);
    const depth = Math.floor(r.match(/^ */)![0].length / 2);
    const [left, right = ''] = r.trim().split('|').map((s) => s.trim());
    const id = `l${i + 1}`;
    const nums = (s: string) => (s.trim() === '' ? [] : s.split(',').map((x) => Number(x.trim())));
    if (left.startsWith('Show')) {
      const text = left.replace(/^Show\s*/, '');
      const m = right.match(/^(DD|CD|ID|UD)\s*(.*)$/);
      return { id, kind: 'show', text, depth, ...(m ? { close: { method: m[1] as 'DD', refs: nums(m[2]) } } : {}) };
    }
    if (right === 'PR') return { id, kind: 'premise', text: left, depth };
    const asm = right.match(/^ASS\s*(CD|ID)?$/);
    if (asm) return { id, kind: 'assumption', text: left, depth, ...(asm[1] ? { assumption: asm[1] as 'CD' } : {}) };
    const m = right.match(/^([A-Z][A-Za-z]*)\s*(.*)$/);
    return { id, kind: 'step', text: left, depth, ...(m ? { rule: m[1] as RuleId, refs: nums(m[2]) } : {}) };
  });
  return { lines, ...extra };
}
