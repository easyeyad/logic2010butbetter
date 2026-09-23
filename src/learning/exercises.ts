/**
 * Uniform entry points over every exercise kind: generate, look up, check,
 * hint, solve.
 *
 * OWNER: Learning System.
 */
import { checkDerivationAnswer, derivationHints, derivationSolution, DERIVATION_EXERCISES } from './derivations';
import { checkInferenceRule, generateInferenceRule, inferenceRuleHints, inferenceRuleSolution } from './inferenceRules';
import {
  argumentHints,
  argumentSolution,
  checkCountermodelAnswer,
  checkTruthTable,
  checkValidityAnswer,
  generateCountermodel,
  generateTruthTable,
  generateValidity,
  truthTableHints,
  truthTableSolution,
} from './semantics';
import { checkSymbolization, generateSymbolization, symbolizationHints, symbolizationSolution, SYMBOLIZATION_EXERCISES } from './symbolization';
import { checkTerminology, generateTerminology, terminologyHints, terminologySolution, TERMINOLOGY_EXERCISES } from './terminology';
import type { Answer, Difficulty, Exercise, Feedback, Solution, Topic } from './types';
import { makeRng, pick } from './util';
import { checkWff, generateWff, wffHints, wffSolution } from './wff';

/** Every curated (bank) exercise, by topic. */
export const EXERCISE_BANK: Partial<Record<Topic, readonly Exercise[]>> = {
  symbolization: SYMBOLIZATION_EXERCISES,
  derivation: DERIVATION_EXERCISES,
  terminology: TERMINOLOGY_EXERCISES,
};

const BY_ID = new Map<string, Exercise>();
for (const list of Object.values(EXERCISE_BANK)) for (const ex of list ?? []) BY_ID.set(ex.id, ex);

/** Look up a bank exercise by id (generated exercises are not retrievable by id — persist them instead). */
export function getExerciseById(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

export interface GenerateOptions {
  /**
   * For topics with a curated bank (symbolization, derivation), how often to
   * draw from the bank rather than the generator (0–1). Derivations always
   * come from the bank. Default 0.5 for symbolization.
   */
  bankRatio?: number;
  /** Exercise ids to avoid (e.g. already in this session). */
  exclude?: ReadonlySet<string>;
}

/** Bank items at the difficulty, falling back to the nearest available difficulty. */
function bankAt<T extends Exercise>(list: readonly T[], difficulty: Difficulty, exclude?: ReadonlySet<string>): T[] {
  for (let delta = 0; delta <= 4; delta++) {
    const xs = list.filter((e) => Math.abs(e.difficulty - difficulty) === delta && !exclude?.has(e.id));
    if (xs.length) return xs;
  }
  return [];
}

/** Produce one exercise of the topic at the difficulty. Deterministic in `seed`. */
export function generateExercise(topic: Topic, difficulty: Difficulty, seed: number, opts: GenerateOptions = {}): Exercise {
  const rng = makeRng(seed ^ 0x5bd1e995);
  const s = Math.floor(rng() * 0x7fffffff);
  switch (topic) {
    case 'wff':
      return generateWff(difficulty, s);
    case 'symbolization': {
      const bank = bankAt(SYMBOLIZATION_EXERCISES, difficulty, opts.exclude);
      if (bank.length && rng() < (opts.bankRatio ?? 0.5)) return pick(rng, bank);
      return generateSymbolization(difficulty, s);
    }
    case 'truth-table':
      return generateTruthTable(difficulty, s);
    case 'validity':
      return generateValidity(difficulty, s);
    case 'countermodel':
      return generateCountermodel(difficulty, s);
    case 'inference-rule':
      return generateInferenceRule(difficulty, s);
    case 'derivation': {
      const bank = bankAt(DERIVATION_EXERCISES, difficulty, opts.exclude);
      return bank.length ? pick(rng, bank) : pick(rng, bankAt(DERIVATION_EXERCISES, difficulty));
    }
    case 'terminology': {
      const ex = generateTerminology(difficulty, s);
      if (opts.exclude?.has(ex.id)) {
        const bank = bankAt(TERMINOLOGY_EXERCISES, difficulty, opts.exclude);
        if (bank.length) return pick(rng, bank);
      }
      return ex;
    }
  }
}

function mismatch(ex: Exercise, answer: Answer): Feedback {
  return { correct: false, severity: 'error', code: 'answer-kind-mismatch', headline: 'That answer does not fit this exercise.', explanation: `Expected an answer for a ${ex.kind} exercise, got one for ${answer.kind}.` };
}

/** Check an answer. Never throws for well-typed input. */
export function checkAnswer(ex: Exercise, answer: Answer): Feedback {
  if (ex.kind !== answer.kind) return mismatch(ex, answer);
  switch (ex.kind) {
    case 'wff': {
      const a = answer as Extract<Answer, { kind: 'wff' }>;
      return checkWff(ex, a.wellFormed, a.errorAt);
    }
    case 'symbolization':
      return checkSymbolization(ex, (answer as Extract<Answer, { kind: 'symbolization' }>).formula);
    case 'truth-table':
      return checkTruthTable(ex, answer as Extract<Answer, { kind: 'truth-table' }>);
    case 'validity': {
      const a = answer as Extract<Answer, { kind: 'validity' }>;
      return checkValidityAnswer(ex, a.valid, a.countermodel);
    }
    case 'countermodel':
      return checkCountermodelAnswer(ex, (answer as Extract<Answer, { kind: 'countermodel' }>).valuation);
    case 'derivation':
      return checkDerivationAnswer(ex, (answer as Extract<Answer, { kind: 'derivation' }>).draft);
    case 'inference-rule':
      return checkInferenceRule(ex, answer as Extract<Answer, { kind: 'inference-rule' }>);
    case 'terminology':
      return checkTerminology(ex, answer as Extract<Answer, { kind: 'terminology' }>);
  }
}

/**
 * Progressive hints, gentlest first. Show them one at a time; none of them
 * is the complete answer (use getSolution for that, on explicit request).
 */
export function getHints(ex: Exercise): string[] {
  switch (ex.kind) {
    case 'wff':
      return wffHints(ex);
    case 'symbolization':
      return symbolizationHints(ex);
    case 'truth-table':
      return truthTableHints(ex);
    case 'validity':
    case 'countermodel':
      return argumentHints(ex);
    case 'derivation':
      return derivationHints(ex);
    case 'inference-rule':
      return inferenceRuleHints(ex);
    case 'terminology':
      return terminologyHints(ex);
  }
}

/** The full worked answer. Only show on explicit request ("Show solution"). */
export function getSolution(ex: Exercise): Solution {
  switch (ex.kind) {
    case 'wff':
      return wffSolution(ex);
    case 'symbolization':
      return symbolizationSolution(ex);
    case 'truth-table':
      return truthTableSolution(ex);
    case 'validity':
    case 'countermodel':
      return argumentSolution(ex);
    case 'derivation':
      return derivationSolution(ex);
    case 'inference-rule':
      return inferenceRuleSolution(ex);
    case 'terminology':
      return terminologySolution(ex);
  }
}
