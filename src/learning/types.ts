/**
 * Exercise, answer and feedback model for the learning system.
 *
 * Everything here is plain JSON-serializable data (formulas are stored as
 * text, never as functions), so exercises can be persisted by the progress
 * store ("continue last exercise") and passed around freely by the UI.
 *
 * OWNER: Learning System.
 */
import type { Classification, Interpretation, ParseErrorCode, Span, Valuation } from '../logic';
import type { CloseMethod, DerivationDraft, RuleId } from '../proof';

// ---------------------------------------------------------------------------
// Topics & difficulty
// ---------------------------------------------------------------------------

export type Topic =
  | 'wff'
  | 'symbolization'
  | 'truth-table'
  | 'validity'
  | 'countermodel'
  | 'inference-rule'
  | 'derivation'
  | 'terminology'
  // Predicate logic (Logic 2010 quantifier chapters)
  | 'predicate-symbolization'
  | 'model'
  | 'predicate-countermodel'
  | 'quantifier-derivation'
  | 'predicate-terminology';

export const SENTENTIAL_TOPICS: readonly Topic[] = [
  'wff',
  'symbolization',
  'truth-table',
  'validity',
  'countermodel',
  'inference-rule',
  'derivation',
  'terminology',
];

export const PREDICATE_TOPICS: readonly Topic[] = [
  'predicate-symbolization',
  'model',
  'predicate-countermodel',
  'quantifier-derivation',
  'predicate-terminology',
];

/** Curriculum order (also the order used when recommending new topics): sentential, then predicate. */
export const TOPICS: readonly Topic[] = [...SENTENTIAL_TOPICS, ...PREDICATE_TOPICS];

export function isPredicateTopic(t: Topic): boolean {
  return PREDICATE_TOPICS.includes(t);
}

export const TOPIC_INFO: Record<Topic, { title: string; description: string }> = {
  wff: { title: 'Well-formed formulas', description: 'Decide whether a string is a formula of sentential logic, and find the error when it is not.' },
  symbolization: { title: 'Symbolization', description: 'Translate English sentences into sentential logic.' },
  'truth-table': { title: 'Truth tables', description: 'Compute truth values and classify sentences as tautologies, contradictions or contingent.' },
  validity: { title: 'Validity', description: 'Decide whether an argument is valid, and back up "invalid" with a countermodel.' },
  countermodel: { title: 'Countermodels', description: 'Find a row that makes every premise true and the conclusion false.' },
  'inference-rule': { title: 'Inference rules', description: 'Recognise which rule justifies a step, and apply a rule to given lines.' },
  derivation: { title: 'Derivations', description: 'Prove conclusions from premises with Show lines, DD, CD and ID.' },
  terminology: { title: 'Concepts & terminology', description: 'Validity, soundness, tautologies, main connectives, antecedents and more.' },
  'predicate-symbolization': { title: 'Predicate symbolization', description: 'Translate English into predicate logic with quantifiers, predicates and names.' },
  model: { title: 'Truth in a model', description: 'Decide whether a quantified sentence is true in a small, fully described world.' },
  'predicate-countermodel': { title: 'Predicate countermodels', description: 'Build a small world where the premises are true and the conclusion is false.' },
  'quantifier-derivation': { title: 'Quantifier derivations', description: 'Derivations with UI, EG, EI, UD and quantifier negation.' },
  'predicate-terminology': { title: 'Predicate-logic concepts', description: 'Bound and free variables, scope, instances, domains, extensions and interpretations.' },
};

export type Difficulty = 1 | 2 | 3 | 4 | 5;
export const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3, 4, 5];

export function clampDifficulty(n: number): Difficulty {
  const r = Math.round(Number.isFinite(n) ? n : 1);
  return Math.min(5, Math.max(1, r)) as Difficulty;
}

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

interface ExerciseBase<K extends Topic> {
  /** Stable id. Bank items have fixed ids; generated items get a content hash. */
  id: string;
  kind: K;
  /** Always equal to `kind` (kept separate so analytics code reads naturally). */
  topic: K;
  difficulty: Difficulty;
  /** Short name for lists, e.g. "Only if" or "Modus ponens chain". */
  title: string;
  /** The instruction shown to the student. */
  prompt: string;
  /** Finer-grained labels, e.g. ['only-if'] or ['fallacy', 'affirming-the-consequent']. */
  tags: string[];
  source: 'bank' | 'generated';
}

/** One entry of a symbolization key: R = "it rains". */
export interface SymbolKeyEntry {
  letter: string;
  /** Affirmative English clause, lower-case start: "it rains". */
  meaning: string;
  /** Negated clause: "it does not rain". */
  negation: string;
}

export type WffDefect =
  | 'missing-paren'
  | 'extra-paren'
  | 'dangling-connective'
  | 'lowercase-atom'
  | 'ambiguous-chain'
  | 'missing-connective'
  | 'misplaced-negation'
  | 'double-connective'
  | 'run-together-letters';

export interface WffExercise extends ExerciseBase<'wff'> {
  /** The string to judge, exactly as displayed. */
  formula: string;
  /** Ground truth; always equals parse(formula).ok. */
  wellFormed: boolean;
  /** When malformed: ask the student to click where the problem is. */
  askLocation: boolean;
  /** When malformed: where the problem is (from diagnoseWff; the location answer is checked against this) and the parser error code. */
  errorSpan?: Span;
  errorCode?: ParseErrorCode;
  /** How the malformed string was produced (for hints). */
  defect?: WffDefect;
}

export interface SymbolizationExercise extends ExerciseBase<'symbolization'> {
  sentence: string;
  key: SymbolKeyEntry[];
  /** Standard symbolization (canonical text). */
  answer: string;
  /** Other standard renderings (all equivalent to `answer`). */
  alternatives: string[];
  /** Why the answer is what it is (shown with the solution). */
  explanation: string;
}

export interface TruthTableExercise extends ExerciseBase<'truth-table'> {
  formula: string;
  /** Sentence letters in table order (standard row order: all-T first). */
  atoms: string[];
  /**
   * 'classify': choose tautology / contradiction / contingent.
   * 'fill': fill in the main column (optionally every column, via `cells`).
   */
  mode: 'classify' | 'fill';
  classification: Classification;
}

export interface ValidityExercise extends ExerciseBase<'validity'> {
  premises: string[];
  conclusion: string;
  valid: boolean;
  /** Named argument form, e.g. 'Modus Ponens' or 'Affirming the Consequent'. */
  form?: string;
  /** If invalid, the student must also give a countermodel for full credit. */
  requireCountermodel: boolean;
  atoms: string[];
}

export interface CountermodelExercise extends ExerciseBase<'countermodel'> {
  premises: string[];
  conclusion: string;
  atoms: string[];
  form?: string;
}

export interface DerivationExercise extends Omit<ExerciseBase<'derivation'>, 'topic'> {
  /** 'quantifier-derivation' for predicate-logic problems (same kind, same editor). */
  topic: 'derivation' | 'quantifier-derivation';
  premises: string[];
  goal: string;
  /** Main strategy for the outermost Show line. */
  strategy: CloseMethod;
  allowDerivedRules: boolean;
  /** Problem-specific hints, progressive. */
  hints: string[];
  /**
   * Model solution in the compact script format understood by
   * `parseProofScript` (see derivations.ts). Revealed only by getSolution.
   * May be empty for quantifier problems: the solution then comes from the
   * proof engine's automatic prover (`solve`).
   */
  solution: string[];
}

export interface InferenceRuleExercise extends ExerciseBase<'inference-rule'> {
  /** 'identify': which rule justifies `conclusion` from `lines`? 'apply': what follows from `lines` by `rule`? */
  mode: 'identify' | 'apply';
  /** Numbered cited lines (formula text), shown as 1., 2., ... */
  lines: string[];
  /** 'identify': the step to justify. 'apply': one correct result (others may also be accepted). */
  conclusion: string;
  rule: RuleId;
  /** Rules offered in the picker for 'identify' mode. */
  choices: RuleId[];
}

export type TerminologyFormat =
  | 'click-connective'
  | 'type-part'
  | 'type-formula'
  | 'fill-in'
  | 'true-false'
  | 'multiple-choice';

export type FormulaPart =
  | 'antecedent'
  | 'consequent'
  | 'left-conjunct'
  | 'right-conjunct'
  | 'left-disjunct'
  | 'right-disjunct'
  | 'left-side'
  | 'right-side'
  | 'negated';

export interface TerminologyExercise extends Omit<ExerciseBase<'terminology'>, 'topic'> {
  topic: 'terminology' | 'predicate-terminology';
  format: TerminologyFormat;
  /** The concept being tested, e.g. 'main connective', 'validity'. */
  concept: string;
  /** click-connective / type-part: the formula (canonical text, as displayed). */
  formula?: string;
  /** click-connective: character index of the correct connective in `formula`. */
  connectiveIndex?: number;
  /** type-part: which part to type. */
  part?: FormulaPart;
  /** type-part / type-formula: accepted formulas (compared structurally). fill-in: accepted words. */
  accepted?: string[];
  /** true-false: the correct truth value of the statement. */
  truth?: boolean;
  /** true-false: justification options (one must be chosen). multiple-choice: options. */
  options?: string[];
  /** true-false: index of the right justification. multiple-choice: correct index. */
  correctOption?: number;
  /** Explanation shown after answering (and in the solution). */
  explanation: string;
  /** fill-in: wrong answers we anticipate → targeted explanation. */
  confusions?: Record<string, string>;
}

/** Symbol-key entry for predicate logic. */
export type PredicateKeyEntry =
  /** e.g. { symbol: 'L', arity: 2, meaning: 'x loves y' } — the meaning uses x, y, z for the argument places in order. */
  | { kind: 'predicate'; symbol: string; arity: number; meaning: string }
  /** e.g. { symbol: 'a', meaning: 'Alice' }. */
  | { kind: 'name'; symbol: string; meaning: string };

export interface PredicateSymbolizationExercise extends ExerciseBase<'predicate-symbolization'> {
  sentence: string;
  key: PredicateKeyEntry[];
  /** Standard symbolization (canonical text). */
  answer: string;
  /** Other standard renderings (all equivalent to `answer`). */
  alternatives: string[];
  explanation: string;
}

export interface ModelExercise extends ExerciseBase<'model'> {
  /** The sentence to evaluate (canonical text). */
  formula: string;
  /** The world: domain 0..size-1 (show as 1, 2, 3 …), extensions, names. */
  model: Interpretation;
  /** Optional English readings of the symbols. */
  key: PredicateKeyEntry[];
  /** Ground truth: evaluateIn(formula, model). */
  truth: boolean;
}

export interface PredicateCountermodelExercise extends ExerciseBase<'predicate-countermodel'> {
  premises: string[];
  conclusion: string;
  /** Symbols the model must interpret. */
  predicates: { name: string; arity: number }[];
  names: string[];
  /** A countermodel exists with at most this many objects (a hint for the domain-size control). */
  maxDomain: number;
  form?: string;
}

export type Exercise =
  | WffExercise
  | PredicateSymbolizationExercise
  | ModelExercise
  | PredicateCountermodelExercise
  | SymbolizationExercise
  | TruthTableExercise
  | ValidityExercise
  | CountermodelExercise
  | DerivationExercise
  | InferenceRuleExercise
  | TerminologyExercise;

export type ExerciseKind = Exercise['kind'];
export type ExerciseOf<K extends ExerciseKind> = Extract<Exercise, { kind: K }>;

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export type Answer =
  | { kind: 'wff'; wellFormed: boolean; /** character index the student clicked as the error location */ errorAt?: number }
  | { kind: 'symbolization'; formula: string }
  | {
      kind: 'truth-table';
      classification?: Classification;
      /** Main-column values in standard row order (null = left blank). */
      values?: (boolean | null)[];
      /**
       * Optional full grid: cells[row][col] aligned with
       * buildTruthTable([formula]).columns. Atom columns are ignored.
       */
      cells?: (boolean | null)[][];
    }
  | { kind: 'validity'; valid: boolean; countermodel?: Valuation }
  | { kind: 'countermodel'; valuation: Valuation }
  | { kind: 'derivation'; draft: DerivationDraft }
  | { kind: 'inference-rule'; rule?: RuleId; formula?: string }
  | { kind: 'predicate-symbolization'; formula: string }
  | { kind: 'model'; value: boolean }
  | { kind: 'predicate-countermodel'; model: Interpretation }
  | {
      kind: 'terminology';
      /** click-connective: character index clicked. */
      position?: number;
      /** type-part / type-formula / fill-in. */
      text?: string;
      /** true-false. */
      value?: boolean;
      /** true-false justification index, or multiple-choice option index. */
      choice?: number;
    };

export type AnswerOf<K extends ExerciseKind> = Extract<Answer, { kind: K }>;

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export interface HighlightSpan {
  /**
   * What the span indexes into:
   *  'answer'  — the text the student typed,
   *  'formula' — the exercise's displayed formula (WFF, terminology, truth table),
   *  'prompt'  — the exercise prompt / English sentence.
   */
  target: 'answer' | 'formula' | 'prompt';
  start: number;
  end: number;
  tone: 'error' | 'info' | 'ok';
}

export interface Feedback {
  correct: boolean;
  /** Right idea but incomplete (e.g. "invalid" without a countermodel). */
  partial?: boolean;
  /** 'success' | 'info' (correct but with a remark) | 'warning' (partial) | 'error'. */
  severity: 'success' | 'info' | 'warning' | 'error';
  /** One line: "Not quite: you reversed the conditional." */
  headline: string;
  /** WHY — the concept or rule that applies. */
  explanation: string;
  /** Extra specifics: the row where things differ, what to check next... */
  details?: string[];
  highlight?: HighlightSpan[];
  /** Machine-readable diagnosis, e.g. 'converse', 'neither-nor', 'parse-error'. */
  code?: string;
  /** A valuation that illustrates the problem (for "show me the row"). */
  valuation?: Valuation;
}

/** Revealed only on explicit request ("Show solution"). */
export interface Solution {
  /** One-paragraph answer + reason. */
  summary: string;
  /** The answer in its natural form (formula text, "valid", rule id, ...). */
  answer: string;
  /** Worked steps / explanation lines. */
  steps?: string[];
  /** For countermodel/validity: a countermodel. */
  valuation?: Valuation;
  /** For derivations: a complete model derivation, ready to load into the editor. */
  derivation?: DerivationDraft;
}
