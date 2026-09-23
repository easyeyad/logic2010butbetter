import type { Formula } from './ast';
import type { Valuation } from './evaluate';

export type Classification = 'tautology' | 'contradiction' | 'contingent';

export interface TruthTableColumn {
  /** The (sub)formula this column evaluates. For atoms, an Atom. */
  formula: Formula;
  /** Display label, e.g. "P ∧ Q". */
  label: string;
  isAtom: boolean;
  /** True for the column(s) of the input formula(s) themselves. */
  isMain: boolean;
  /** Indices (into columns) of this column's immediate subformula columns. */
  dependsOn: number[];
}

export interface TruthTable {
  atoms: string[];
  columns: TruthTableColumn[];
  /** rows[r][c] — row order is standard: first atom T for the top half (TT..., TF..., ... FF). */
  rows: boolean[][];
  valuations: Valuation[];
}

/**
 * Build a table for one or more formulas (sharing atoms). Columns: atoms first,
 * then each non-atomic subformula (inner first, deduped across formulas),
 * with the input formulas' own columns flagged isMain.
 * Throws if more than 10 atoms.
 */
export function buildTruthTable(_formulas: Formula[]): TruthTable {
  throw new Error('not implemented');
}

export function classify(_f: Formula): Classification {
  throw new Error('not implemented');
}
