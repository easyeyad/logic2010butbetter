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
 *    <-> <> <=> ≡ (iff). `normalizeInput` rewrites these into canonical symbols.
 *    NOTE: '=' is NOT an iff alias (it is identity); '=>' still means →.
 *  - Parentheses ( ) and brackets [ ] { } group.
 *  - Outermost parentheses may be omitted. Any binary sub-formula nested
 *    inside another connective MUST be parenthesized (P ∧ Q ∨ R is rejected as
 *    ambiguous with a helpful message). ¬ binds to the immediately following
 *    formula: ¬P ∧ Q means (¬P) ∧ Q.
 *
 * Predicate syntax (see ast.ts):
 *  - Predications: a capital letter with its terms attached, no spaces: Fa, Rxy,
 *    Gx1a. ("F a" is rejected with the hint "Fa".) A bare capital is a sentence letter.
 *  - Terms: names a–t, variables u w x y z (optionally with digits); 'v' is "or".
 *  - Quantifiers ∀x / ∃x; ASCII aliases @ (∀) and $ (∃). Space between the
 *    quantifier and variable is allowed ("∀ x Fx"). Scope is like ¬: ∀x Fx → Gx
 *    is (∀x Fx) → Gx.
 *  - format(): "∀x(Fx → Gx)", "∀x Fx", "∃x¬Fx", "∀x∃y Rxy", ASCII "@x(Fx -> Gx)".
 *  - Identity: t = t between two terms (names or variables), atomic, binds
 *    tightest: ¬a = b is ¬(a = b). a ≠ b (ASCII a != b) parses to ¬(a = b) and
 *    ¬(a = b) formats as "a ≠ b". "P = Q" / "Fa = b" are errors.
 *  - Sentential tools (evaluate, compileFormula, buildTruthTable, classify,
 *    checkValidity/Equivalence/Consistency) throw NotSententialError on
 *    predicate/quantified input; use predicate.ts (findModel, checkPredicateValidity).
 *    atomsOf returns only sentence letters (predications are skipped).
 */
export * from './ast';

export type { Span, ParseError, ParseResult, ParseErrorCode } from './parser';
export { parse, parseOrThrow, normalizeInput, MAX_NESTING_DEPTH } from './parser';

export { format, formatWithSpans, ASCII_SYMBOL } from './format';
export type { FormatOptions } from './format';

export { atomsOf, evaluate, subformulas, complexity, mainConnective, compareAtoms, compileFormula, NotSententialError } from './evaluate';
export type { Valuation } from './evaluate';

export { buildTruthTable, classify, allValuations, MAX_TRUTH_TABLE_ATOMS, MAX_BRUTE_FORCE_ATOMS } from './truthTable';
export type { TruthTable, TruthTableColumn, Classification } from './truthTable';

export { checkValidity, checkEquivalence, checkConsistency } from './validity';
export type { ValidityResult, EquivalenceResult, ConsistencyResult } from './validity';

export { randomFormula, seededRandom } from './random';
export type { RandomFormulaOptions } from './random';

export {
  freeVariables, namesOf, variablesOf, predicatesOf, arityConflicts, isSentence,
  substitute, matchInstance, isGeneralizationOf, alphaEquals, freshVariable,
  evaluateIn, findModel, checkPredicateValidity, describeInterpretation,
} from './predicate';
export type { Interpretation, ModelSearchResult, PredicateValidityResult } from './predicate';
