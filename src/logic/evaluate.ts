import type { Formula } from './ast';

export type Valuation = Record<string, boolean>;

/** Distinct sentence letters, sorted (P, Q, R ... then alphabetical; digits numerically). */
export function atomsOf(..._fs: Formula[]): string[] {
  throw new Error('not implemented');
}

export function evaluate(_f: Formula, _v: Valuation): boolean {
  throw new Error('not implemented');
}

/**
 * Distinct non-atomic subformulas in evaluation order (inner first, the formula
 * itself last). Duplicates removed by structural equality.
 */
export function subformulas(_f: Formula): Formula[] {
  throw new Error('not implemented');
}

/** Number of connectives. */
export function complexity(_f: Formula): number {
  throw new Error('not implemented');
}

export function mainConnective(f: Formula): Formula['kind'] {
  return f.kind;
}
