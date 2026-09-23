import type { Formula } from './ast';
import type { Valuation } from './evaluate';

export interface ValidityResult {
  valid: boolean;
  /** When invalid: one valuation making all premises true and the conclusion false. */
  counterexample?: Valuation;
  /** All such valuations (for "show all counterexamples"). */
  counterexamples: Valuation[];
  /** Total rows examined. */
  rowsChecked: number;
  /** True if premises are jointly inconsistent (argument valid vacuously). */
  premisesInconsistent: boolean;
}

export function checkValidity(_premises: Formula[], _conclusion: Formula): ValidityResult {
  throw new Error('not implemented');
}

export interface EquivalenceResult { equivalent: boolean; differingValuation?: Valuation }
export function checkEquivalence(_a: Formula, _b: Formula): EquivalenceResult {
  throw new Error('not implemented');
}

export interface ConsistencyResult { consistent: boolean; model?: Valuation }
export function checkConsistency(_fs: Formula[]): ConsistencyResult {
  throw new Error('not implemented');
}
