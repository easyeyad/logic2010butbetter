/**
 * Exercise, answer and feedback model for the learning system.
 *
 * Everything here is plain JSON-serializable data (formulas are stored as
 * text, never as functions), so exercises can be persisted by the progress
 * store ("continue last exercise") and passed around freely by the UI.
 *
 * OWNER: Learning System.
 */
import type { Classification, ParseErrorCode, Span, Valuation } from '../logic';
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
  | 'terminology';

/** Curriculum order (also the order used when recommending new topics). */
export const TOPICS: readonly Topic[] = [
  'wff',
  'symbolization',
  'truth-table',
  'validity',
  'countermodel',
  'inference-rule',
  'derivation',
  'terminology',
];

export const TOPIC_INFO: Record<Topic, { title: string; description: string }> = {
  wff: { title: 'Well-formed formulas', description: 'Decide whether a string is a formula of sentential logic, and find the error when it is not.' },
  symbolization: { title: 'Symbolization', description: 'Translate English sentences into sentential logic.' },
  'truth-table': { title: 'Truth tables', description: 'Compute truth values and classify sentences as tautologies, contradictions or contingent.' },
  validity: { title: 'Validity', description: 'Decide whether an argument is valid, and back up "invalid" with a countermodel.' },
  countermodel: { title: 'Countermodels', description: 'Find a row that makes every premise true and the conclusion false.' },
  'inference-rule': { title: 'Inference rules', description: 'Recognise which rule justifies a step, and apply a rule to given lines.' },
  derivation: { title: 'Derivations', description: 'Prove conclusions from premises with Show lines, DD, CD and ID.' },
  terminology: { title: 'Concepts & terminology', description: 'Validity, soundness, tautologies, main connectives, antecedents and more.' },
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
  /** When malformed: the parser's error span / code (the location answer is checked against this). */
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

export interface DerivationExercise extends ExerciseBase<'derivation'> {
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

export interface TerminologyExercise extends ExerciseBase<'terminology'> {
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

export type Exercise =
  | WffExercise
  | SymbolizationExercise
  | TruthTableExercise
  | ValidityExercise
  | CountermodelExercise
  | DerivationExercise
  | InferenceRuleExercise
  | TerminologyExercise;

export type ExerciseOf<K extends Topic> = Extract<Exercise, { kind: K }>;

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

export type AnswerOf<K extends Topic> = Extract<Answer, { kind: K }>;

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
