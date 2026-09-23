/**
 * Small, dependency-free formula helpers used inside the proof engine.
 * (Kept local so the proof engine never depends on anything but the shared
 * AST and `parse`.)
 *
 * OWNER: Proof Engine.
 */
import type { Formula } from '../logic/ast';
import { CONNECTIVE_NAME, Not, equals } from '../logic/ast';
import { MAX_BRUTE_FORCE_ATOMS, atomsOf, checkConsistency, checkValidity, format } from '../logic/index';

export { equals };

/**
 * Canonical display text (the logic engine's `format`): outermost parentheses
 * dropped, nested binaries parenthesized. Injective, so it doubles as a map key.
 */
export function fmt(f: Formula): string {
  return format(f);
}

/** "a conditional", "a sentence letter", ... */
export function aKind(f: Formula): string {
  return `a ${CONNECTIVE_NAME[f.kind]}`;
}

export function isNegationOf(a: Formula, b: Formula): boolean {
  return a.kind === 'not' && equals(a.operand, b);
}

/** One of the two is exactly the negation of the other. */
export function contradictory(a: Formula, b: Formula): boolean {
  return isNegationOf(a, b) || isNegationOf(b, a);
}

/** Remove every double negation anywhere in the formula (proof-specific: DN diagnostics). */
export function stripDN(f: Formula): Formula {
  switch (f.kind) {
    case 'atom':
      return f;
    case 'not':
      if (f.operand.kind === 'not') return stripDN(f.operand.operand);
      return Not(stripDN(f.operand));
    default:
      return { kind: f.kind, left: stripDN(f.left), right: stripDN(f.right) };
  }
}

/**
 * Entailment via the logic engine's `checkValidity`. Returns null when there
 * are too many sentence letters to check quickly.
 */
export function entails(premises: Formula[], goal: Formula, maxAtoms = 14): boolean | null {
  if (atomsOf(...premises, goal).length > Math.min(maxAtoms, MAX_BRUTE_FORCE_ATOMS)) return null;
  return checkValidity(premises, goal).valid;
}

/** Jointly satisfiable? (null when too many letters). */
export function consistent(fs: Formula[], maxAtoms = 14): boolean | null {
  if (atomsOf(...fs).length > Math.min(maxAtoms, MAX_BRUTE_FORCE_ATOMS)) return null;
  return checkConsistency(fs).consistent;
}

/** "lines 2 and 5", "lines 2, 3 and 5", "line 4". */
export function lineList(ns: number[]): string {
  if (ns.length === 0) return 'no lines';
  if (ns.length === 1) return `line ${ns[0]}`;
  return `lines ${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
