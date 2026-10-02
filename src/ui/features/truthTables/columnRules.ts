import type { Formula } from '../../../logic';

/** Student-facing rule for how each connective's column is computed (hint text). */
export const COLUMN_RULE: Record<Formula['kind'], string> = {
  atom: 'Sentence letters take every combination of T and F, one combination per row.',
  not: 'A negation is true exactly when the formula it negates is false.',
  and: 'A conjunction is true only when both sides are true.',
  or: 'A disjunction is false only when both sides are false.',
  implies: 'A conditional is false only when the antecedent is true and the consequent is false.',
  iff: 'A biconditional is true exactly when both sides have the same truth value.',
  pred: 'An atomic predication like Fa is true when the object named is in the predicate’s extension.',
  forall: 'A universal quantification is true when its body is true for every object in the domain.',
  identity: 'An identity statement a = b is true when the two names pick out the same object.',
  exists: 'An existential quantification is true when its body is true for at least one object in the domain.',
};
