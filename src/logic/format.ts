import type { Formula } from './ast';
import { SYMBOL } from './ast';
import type { Span } from './parser';

export interface FormatOptions {
  /** Omit outermost parentheses (default true). */
  dropOuter?: boolean;
  /** Use ASCII (~ & v -> <->) instead of symbols (default false). */
  ascii?: boolean;
}

/** ASCII spellings used by `format(f, { ascii: true })`. All are accepted by `parse`. */
export const ASCII_SYMBOL = {
  not: '~',
  and: '&',
  or: 'v',
  implies: '->',
  iff: '<->',
} as const;

/** Canonical string for a formula, e.g. "(P ∧ Q) → R". parse(format(f)) equals f. */
export function format(f: Formula, opts?: FormatOptions): string {
  const sym = opts?.ascii ? ASCII_SYMBOL : SYMBOL;
  const go = (g: Formula, top: boolean): string => {
    switch (g.kind) {
      case 'atom':
        return g.name;
      case 'not':
        return sym.not + go(g.operand, false);
      default: {
        const inner = `${go(g.left, false)} ${sym[g.kind]} ${go(g.right, false)}`;
        return top ? inner : `(${inner})`;
      }
    }
  };
  return go(f, opts?.dropOuter ?? true);
}

/**
 * Format and also report the span of every sub-formula in the output string,
 * in post-order (children before parents; the last entry is the whole formula).
 * Used to highlight subformulas / truth-table columns.
 *
 * Every occurrence is reported (no deduplication). The span of a parenthesized
 * binary subformula includes its parentheses; the whole formula's span is
 * always the entire output text.
 */
export function formatWithSpans(f: Formula, opts?: FormatOptions): { text: string; spans: { formula: Formula; span: Span }[] } {
  const sym = opts?.ascii ? ASCII_SYMBOL : SYMBOL;
  const spans: { formula: Formula; span: Span }[] = [];
  let text = '';
  const go = (g: Formula, top: boolean): void => {
    const start = text.length;
    switch (g.kind) {
      case 'atom':
        text += g.name;
        break;
      case 'not':
        text += sym.not;
        go(g.operand, false);
        break;
      default:
        if (!top) text += '(';
        go(g.left, false);
        text += ` ${sym[g.kind]} `;
        go(g.right, false);
        if (!top) text += ')';
    }
    spans.push({ formula: g, span: { start, end: text.length } });
  };
  go(f, opts?.dropOuter ?? true);
  return { text, spans };
}
