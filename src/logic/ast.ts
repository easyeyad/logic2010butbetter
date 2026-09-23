/**
 * Shared formula representation. Every engine (parser, evaluator, truth
 * tables, validity, proofs, exercises) speaks this AST — never raw strings.
 *
 * OWNER: Logic Engine. Other modules may import but must not edit.
 */

export type Formula =
  | { kind: 'atom'; name: string }
  | { kind: 'not'; operand: Formula }
  | { kind: 'and'; left: Formula; right: Formula }
  | { kind: 'or'; left: Formula; right: Formula }
  | { kind: 'implies'; left: Formula; right: Formula }
  | { kind: 'iff'; left: Formula; right: Formula };

export type BinaryKind = 'and' | 'or' | 'implies' | 'iff';
export type BinaryFormula = Extract<Formula, { left: Formula }>;

export const Atom = (name: string): Formula => ({ kind: 'atom', name });
export const Not = (operand: Formula): Formula => ({ kind: 'not', operand });
export const And = (left: Formula, right: Formula): Formula => ({ kind: 'and', left, right });
export const Or = (left: Formula, right: Formula): Formula => ({ kind: 'or', left, right });
export const Implies = (left: Formula, right: Formula): Formula => ({ kind: 'implies', left, right });
export const Iff = (left: Formula, right: Formula): Formula => ({ kind: 'iff', left, right });

/** Canonical display symbols. */
export const SYMBOL = {
  not: '¬',
  and: '∧',
  or: '∨',
  implies: '→',
  iff: '↔',
} as const;

/** Human names used in feedback text. */
export const CONNECTIVE_NAME: Record<Formula['kind'], string> = {
  atom: 'sentence letter',
  not: 'negation',
  and: 'conjunction',
  or: 'disjunction',
  implies: 'conditional',
  iff: 'biconditional',
};

export function isBinary(f: Formula): f is BinaryFormula {
  return f.kind === 'and' || f.kind === 'or' || f.kind === 'implies' || f.kind === 'iff';
}

/** Structural equality. */
export function equals(a: Formula, b: Formula): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'atom':
      return a.name === (b as typeof a).name;
    case 'not':
      return equals(a.operand, (b as typeof a).operand);
    default: {
      const bb = b as BinaryFormula;
      return equals(a.left, bb.left) && equals(a.right, bb.right);
    }
  }
}
