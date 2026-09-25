/**
 * Shared formula representation. Every engine (parser, evaluator, truth
 * tables, validity, models, proofs, exercises) speaks this AST — never raw
 * strings.
 *
 * Sentential part (Logic 2010 ch. 1–4): sentence letters and ¬ ∧ ∨ → ↔.
 * Predicate part (Logic 2010 quantifier chapters):
 *  - Terms: lowercase letters. NAMES are a–t; VARIABLES are u, w, x, y, z
 *    ('v' is excluded because it doubles as the ASCII "or"). Either may carry
 *    a numeric subscript (x1, a2).
 *  - Predications: a capital letter followed by one or more terms: Fa, Gxy,
 *    Rab. A capital letter with no terms is a sentence letter ('atom').
 *  - Quantifiers: ∀x φ and ∃x φ. The quantifier binds the variable in the
 *    immediately following formula, exactly like ¬: ∀x Fx → Gx means
 *    (∀x Fx) → Gx; write ∀x(Fx → Gx) for the wide scope.
 *  - Identity: t1 = t2 between two terms (Logic 2010's identity chapter).
 *    It is atomic (like a predication) and has no extension to interpret:
 *    it is true exactly when both terms denote the same object. `≠` is
 *    notation for the negation: a ≠ b is ¬(a = b).
 *  - Formulas may contain free variables (open formulas) — Logic 2010
 *    derivations use them (EI instantiates to a new variable; UD
 *    generalizes on one). A SENTENCE is a formula with no free variables.
 *
 * OWNER: Logic Engine. Other modules may import but must not edit.
 */

export type Term =
  | { kind: 'var'; name: string }
  | { kind: 'name'; name: string };

export type Formula =
  | { kind: 'atom'; name: string }
  | { kind: 'pred'; name: string; args: Term[] }
  | { kind: 'identity'; left: Term; right: Term }
  | { kind: 'not'; operand: Formula }
  | { kind: 'and'; left: Formula; right: Formula }
  | { kind: 'or'; left: Formula; right: Formula }
  | { kind: 'implies'; left: Formula; right: Formula }
  | { kind: 'iff'; left: Formula; right: Formula }
  | { kind: 'forall'; variable: string; body: Formula }
  | { kind: 'exists'; variable: string; body: Formula };

export type BinaryKind = 'and' | 'or' | 'implies' | 'iff';
export type BinaryFormula = Extract<Formula, { left: Formula }>;
export type QuantifiedFormula = Extract<Formula, { variable: string }>;

export const Atom = (name: string): Formula => ({ kind: 'atom', name });
export const Not = (operand: Formula): Formula => ({ kind: 'not', operand });
export const And = (left: Formula, right: Formula): Formula => ({ kind: 'and', left, right });
export const Or = (left: Formula, right: Formula): Formula => ({ kind: 'or', left, right });
export const Implies = (left: Formula, right: Formula): Formula => ({ kind: 'implies', left, right });
export const Iff = (left: Formula, right: Formula): Formula => ({ kind: 'iff', left, right });
export const Var = (name: string): Term => ({ kind: 'var', name });
export const Name = (name: string): Term => ({ kind: 'name', name });
export const Pred = (name: string, ...args: Term[]): Formula => ({ kind: 'pred', name, args });
export const Identity = (left: Term, right: Term): Formula => ({ kind: 'identity', left, right });
export const Forall = (variable: string, body: Formula): Formula => ({ kind: 'forall', variable, body });
export const Exists = (variable: string, body: Formula): Formula => ({ kind: 'exists', variable, body });

/** Canonical display symbols. */
export const SYMBOL = {
  not: '¬',
  and: '∧',
  or: '∨',
  implies: '→',
  iff: '↔',
  forall: '∀',
  exists: '∃',
  identity: '=',
  nonIdentity: '≠',
} as const;

/** Human names used in feedback text. */
export const CONNECTIVE_NAME: Record<Formula['kind'], string> = {
  atom: 'sentence letter',
  pred: 'atomic predication',
  identity: 'identity statement',
  not: 'negation',
  and: 'conjunction',
  or: 'disjunction',
  implies: 'conditional',
  iff: 'biconditional',
  forall: 'universal quantification',
  exists: 'existential quantification',
};

/** Names a–t; variables u, w, x, y, z (each optionally followed by digits). */
export const NAME_LETTERS = 'abcdefghijklmnopqrst';
export const VARIABLE_LETTERS = 'uwxyz';

export function isBinary(f: Formula): f is BinaryFormula {
  return f.kind === 'and' || f.kind === 'or' || f.kind === 'implies' || f.kind === 'iff';
}

export function isQuantified(f: Formula): f is QuantifiedFormula {
  return f.kind === 'forall' || f.kind === 'exists';
}

/** True if the formula uses predicates or quantifiers anywhere. */
export function isPredicateFormula(f: Formula): boolean {
  switch (f.kind) {
    case 'atom':
      return false;
    case 'pred':
    case 'identity':
    case 'forall':
    case 'exists':
      return true;
    case 'not':
      return isPredicateFormula(f.operand);
    default:
      return isPredicateFormula(f.left) || isPredicateFormula(f.right);
  }
}

export function termEquals(a: Term, b: Term): boolean {
  return a.kind === b.kind && a.name === b.name;
}

/**
 * Structural equality. Bound variables are compared by name (no alpha
 * equivalence): ∀x Fx and ∀y Fy are NOT equal. Use `alphaEquals` from
 * the logic engine when renaming bound variables should not matter.
 */
export function equals(a: Formula, b: Formula): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'atom':
      return a.name === (b as typeof a).name;
    case 'pred': {
      const bb = b as typeof a;
      return a.name === bb.name && a.args.length === bb.args.length && a.args.every((t, i) => termEquals(t, bb.args[i]));
    }
    case 'identity': {
      const bb = b as typeof a;
      return termEquals(a.left, bb.left) && termEquals(a.right, bb.right);
    }
    case 'not':
      return equals(a.operand, (b as typeof a).operand);
    case 'forall':
    case 'exists': {
      const bb = b as typeof a;
      return a.variable === bb.variable && equals(a.body, bb.body);
    }
    default: {
      const bb = b as BinaryFormula;
      return equals(a.left, bb.left) && equals(a.right, bb.right);
    }
  }
}
