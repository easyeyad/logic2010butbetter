/**
 * Public API of the logic engine. CONTRACT — the signatures below are relied
 * on by the proof engine, learning system and UI. Implementations live in
 * sibling files; this file only re-exports. Adding exports is fine; changing
 * existing signatures requires coordinating with every consumer.
 *
 * OWNER: Logic Engine.
 *
 * Syntax (Logic 2010 conventions):
 *  - Sentence letters: a capital letter A–Z, optionally followed by digits (P, Q1).
 *  - Connectives: ¬ ∧ ∨ → ↔. ASCII input accepted: ~ - ! (not), & ^ * (and),
 *    | v (or, lowercase v only when surrounded by spaces/parens), -> > (implies),
 *    <-> <> = (iff). `normalizeInput` rewrites these into canonical symbols.
 *  - Parentheses ( ) and brackets [ ] { } group.
 *  - Outermost parentheses may be omitted. Any binary sub-formula nested
 *    inside another connective MUST be parenthesized (P ∧ Q ∨ R is rejected as
 *    ambiguous with a helpful message). ¬ binds to the immediately following
 *    formula: ¬P ∧ Q means (¬P) ∧ Q.
 */
export * from './ast';

export type { Span, ParseError, ParseResult, ParseErrorCode } from './parser';
export { parse, parseOrThrow, normalizeInput } from './parser';

export { format, formatWithSpans, ASCII_SYMBOL } from './format';
export type { FormatOptions } from './format';

export { atomsOf, evaluate, subformulas, complexity, mainConnective, compareAtoms, compileFormula } from './evaluate';
export type { Valuation } from './evaluate';

export { buildTruthTable, classify, allValuations, MAX_TRUTH_TABLE_ATOMS, MAX_BRUTE_FORCE_ATOMS } from './truthTable';
export type { TruthTable, TruthTableColumn, Classification } from './truthTable';

export { checkValidity, checkEquivalence, checkConsistency } from './validity';
export type { ValidityResult, EquivalenceResult, ConsistencyResult } from './validity';

export { randomFormula, seededRandom } from './random';
export type { RandomFormulaOptions } from './random';
