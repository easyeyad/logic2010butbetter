import type { Formula, Term } from './ast';
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
  forall: '@',
  exists: '$',
} as const;

const termsText = (args: Term[]) => args.map((t) => t.name).join('');

/**
 * Quantifier prefix: "∀x" followed by a space only when the body starts with a
 * letter ("∀x Fx", "∃y P"); no space before "(", "¬" or another quantifier
 * ("∀x(Fx → Gx)", "∀x¬Fx", "∀x∃y Rxy").
 */
function quantPrefix(sym: string, variable: string, body: Formula): string {
  const letterNext = body.kind === 'atom' || body.kind === 'pred';
  return sym + variable + (letterNext ? ' ' : '');
}

/** Canonical string for a formula, e.g. "(P ∧ Q) → R", "∀x(Fx → Gx)", "∃x Rxa". parse(format(f)) equals f. */
export function format(f: Formula, opts?: FormatOptions): string {
  const sym = opts?.ascii ? ASCII_SYMBOL : SYMBOL;
  const go = (g: Formula, top: boolean): string => {
    switch (g.kind) {
      case 'atom':
        return g.name;
      case 'pred':
        return g.name + termsText(g.args);
      case 'not':
        return sym.not + go(g.operand, false);
      case 'forall':
      case 'exists':
        return quantPrefix(sym[g.kind], g.variable, g.body) + go(g.body, false);
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
      case 'pred':
        text += g.name + termsText(g.args);
        break;
      case 'not':
        text += sym.not;
        go(g.operand, false);
        break;
      case 'forall':
      case 'exists':
        text += quantPrefix(sym[g.kind], g.variable, g.body);
        go(g.body, false);
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
