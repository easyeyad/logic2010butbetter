import type { Formula } from './ast';
import type { Valuation } from './evaluate';
import { atomsOf, compileFormula } from './evaluate';
import { assertSentential, forEachRow, toValuation } from './truthTable';

// All checks brute-force the truth table in standard row order (all-T first),
// so "the first counterexample/model" matches the first such row a student sees.
// Up to MAX_BRUTE_FORCE_ATOMS (16) sentence letters; throws beyond that.
// Sentential only: predicate/quantified input throws NotSententialError
// (use checkPredicateValidity / findModel).

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

export function checkValidity(premises: Formula[], conclusion: Formula): ValidityResult {
  assertSentential([...premises, conclusion]);
  const atoms = atomsOf(...premises, conclusion);
  const ps = premises.map((p) => compileFormula(p, atoms));
  const c = compileFormula(conclusion, atoms);
  const counterexamples: Valuation[] = [];
  let premisesSatisfiable = false;
  const rowsChecked = forEachRow(atoms, (vs) => {
    for (const p of ps) if (!p(vs)) return;
    premisesSatisfiable = true;
    if (!c(vs)) counterexamples.push(toValuation(atoms, vs));
  });
  return {
    valid: counterexamples.length === 0,
    counterexample: counterexamples[0],
    counterexamples,
    rowsChecked,
    premisesInconsistent: !premisesSatisfiable,
  };
}

export interface EquivalenceResult { equivalent: boolean; differingValuation?: Valuation }

/** Stops at the first row where the two formulas differ. */
export function checkEquivalence(a: Formula, b: Formula): EquivalenceResult {
  assertSentential([a, b]);
  const atoms = atomsOf(a, b);
  const ea = compileFormula(a, atoms);
  const eb = compileFormula(b, atoms);
  let differingValuation: Valuation | undefined;
  forEachRow(atoms, (vs) => {
    if (ea(vs) !== eb(vs)) {
      differingValuation = toValuation(atoms, vs);
      return false;
    }
  });
  return differingValuation ? { equivalent: false, differingValuation } : { equivalent: true };
}

export interface ConsistencyResult { consistent: boolean; model?: Valuation }

/** Stops at the first row making every formula true. The empty set is consistent. */
export function checkConsistency(fs: Formula[]): ConsistencyResult {
  assertSentential(fs);
  const atoms = atomsOf(...fs);
  const evs = fs.map((f) => compileFormula(f, atoms));
  let model: Valuation | undefined;
  forEachRow(atoms, (vs) => {
    if (evs.every((e) => e(vs))) {
      model = toValuation(atoms, vs);
      return false;
    }
  });
  return model ? { consistent: true, model } : { consistent: false };
}
