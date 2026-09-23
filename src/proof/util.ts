/**
 * Small, dependency-free formula helpers used inside the proof engine.
 * (Kept local so the proof engine never depends on anything but the shared
 * AST and `parse`.)
 *
 * OWNER: Proof Engine.
 */
import type { Formula } from '../logic/ast';
import { CONNECTIVE_NAME, Not, SYMBOL, equals } from '../logic/ast';

export { equals };

function wrap(f: Formula): string {
  return f.kind === 'atom' || f.kind === 'not' ? fmt(f) : `(${fmt(f)})`;
}

/**
 * Canonical display text: outermost parentheses dropped, every nested binary
 * sub-formula parenthesized, ¬ written without a space ("¬(P ∧ Q) → R").
 * Injective, so it doubles as a map key.
 */
export function fmt(f: Formula): string {
  switch (f.kind) {
    case 'atom':
      return f.name;
    case 'not':
      return SYMBOL.not + wrap(f.operand);
    default:
      return `${wrap(f.left)} ${SYMBOL[f.kind]} ${wrap(f.right)}`;
  }
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

/** Remove every double negation anywhere in the formula. */
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

export function atoms(fs: Formula[]): string[] {
  const set = new Set<string>();
  const walk = (f: Formula): void => {
    if (f.kind === 'atom') set.add(f.name);
    else if (f.kind === 'not') walk(f.operand);
    else {
      walk(f.left);
      walk(f.right);
    }
  };
  fs.forEach(walk);
  return [...set].sort();
}

export function evalF(f: Formula, v: Record<string, boolean>): boolean {
  switch (f.kind) {
    case 'atom':
      return !!v[f.name];
    case 'not':
      return !evalF(f.operand, v);
    case 'and':
      return evalF(f.left, v) && evalF(f.right, v);
    case 'or':
      return evalF(f.left, v) || evalF(f.right, v);
    case 'implies':
      return !evalF(f.left, v) || evalF(f.right, v);
    case 'iff':
      return evalF(f.left, v) === evalF(f.right, v);
  }
}

/**
 * Truth-table entailment check. Returns true/false, or null when there are
 * too many sentence letters to check quickly.
 */
export function entails(premises: Formula[], goal: Formula, maxAtoms = 14): boolean | null {
  const names = atoms([...premises, goal]);
  if (names.length > maxAtoms) return null;
  const total = 1 << names.length;
  const v: Record<string, boolean> = {};
  for (let mask = 0; mask < total; mask++) {
    for (let i = 0; i < names.length; i++) v[names[i]] = (mask & (1 << i)) !== 0;
    if (premises.every((p) => evalF(p, v)) && !evalF(goal, v)) return false;
  }
  return true;
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
