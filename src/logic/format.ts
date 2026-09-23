import type { Formula } from './ast';
import type { Span } from './parser';

export interface FormatOptions {
  /** Omit outermost parentheses (default true). */
  dropOuter?: boolean;
  /** Use ASCII (~ & v -> <->) instead of symbols (default false). */
  ascii?: boolean;
}

/** Canonical string for a formula, e.g. "(P ∧ Q) → R". parse(format(f)) equals f. */
export function format(_f: Formula, _opts?: FormatOptions): string {
  throw new Error('not implemented');
}

/**
 * Format and also report the span of every sub-formula in the output string,
 * in post-order (children before parents; the last entry is the whole formula).
 * Used to highlight subformulas / truth-table columns.
 */
export function formatWithSpans(_f: Formula, _opts?: FormatOptions): { text: string; spans: { formula: Formula; span: Span }[] } {
  throw new Error('not implemented');
}
