import type { Formula } from '../logic/ast';
import type { DraftLine } from './types';
import { checkDerivation } from './checker';
import { Prover, prune } from './prover';
import { entails, fmt } from './util';

export interface SolveOptions {
  /** Max lines the search may emit (including rolled-back attempts). Default 6000. */
  maxLines?: number;
}

/**
 * Bounded automatic prover. Returns a legal Logic 2010-style derivation
 * (premises, then "Show goal" with its box) using primitive rules only, or
 * null if the argument is invalid or the search budget runs out. Every
 * returned derivation passes `checkDerivation` as complete.
 */
export function solve(premises: Formula[], goal: Formula, opts: SolveOptions = {}): DraftLine[] | null {
  try {
    if (entails(premises, goal) === false) return null;
    const p = new Prover({ maxLines: opts.maxLines });
    premises.forEach((f) => p.premise(f));
    const show = p.proveGoal(goal, true);
    if (show === null) return null;
    const { lines } = prune(p.out, [show - 1], premises.length);
    const ids = lines.map((l, i) => ({ ...l, id: `sol-${i + 1}` }));
    const check = checkDerivation({ goal: fmt(goal), lines: ids });
    return check.complete ? ids : null;
  } catch (e) {
    if (Prover.isBudget(e)) return null;
    return null;
  }
}
