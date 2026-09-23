/**
 * Public API of the learning system — the engine behind the Practice,
 * Symbolization, Progress and Dashboard pages. Pure TypeScript: no React, no
 * DOM (browser storage is reached only through `KeyValueStorage`).
 *
 * OWNER: Learning System. UI may import but must not edit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EXERCISES
 *   type Exercise = WffExercise | SymbolizationExercise | TruthTableExercise
 *                 | ValidityExercise | CountermodelExercise | DerivationExercise
 *                 | InferenceRuleExercise | TerminologyExercise
 *   Discriminated on `kind` (== `topic`). All fields are JSON-serializable.
 *   Common fields: id, kind, topic, difficulty (1–5), title, prompt, tags, source.
 *
 *   generateExercise(topic, difficulty, seed, opts?)  → Exercise   (deterministic)
 *   getExerciseById(id)                                → bank exercise | undefined
 *   SYMBOLIZATION_EXERCISES / DERIVATION_EXERCISES / TERMINOLOGY_EXERCISES (curated, easiest first)
 *   Per-kind generators: generateSymbolization, generateWff, generateTruthTable,
 *   generateValidity, generateCountermodel, generateInferenceRule, generateTerminology.
 *
 * ANSWERING
 *   checkAnswer(exercise, answer) → Feedback
 *     answer shapes (Answer union, discriminated on `kind`):
 *       wff:            { wellFormed, errorAt? }   errorAt = char index clicked in exercise.formula
 *       symbolization:  { formula }                raw typed text; ASCII ok (~ & v -> <->)
 *       truth-table:    { classification? , values?, cells? }
 *                       values = main column per row (standard order, T first); cells[row][col]
 *                       aligned with buildTruthTable([parse(exercise.formula)]).columns
 *       validity:       { valid, countermodel? }   countermodel: Valuation (letter → boolean)
 *       countermodel:   { valuation }
 *       derivation:     { draft }                  DerivationDraft from the proof editor
 *       inference-rule: { rule? , formula? }       'identify' mode → rule; 'apply' mode → formula
 *       terminology:    { position? , text?, value?, choice? }
 *                       click-connective → position; type-part/type-formula/fill-in → text;
 *                       true-false → value + choice (justification index); multiple-choice → choice
 *   Feedback = { correct, partial?, severity, headline, explanation, details?, highlight?, code?, valuation? }
 *     headline: what went wrong (one line); explanation: why / the concept or rule;
 *     details: specifics & what to check next (e.g. the English truth-table row
 *     where a symbolization differs); highlight: spans into 'answer' | 'formula' | 'prompt';
 *     code: machine diagnosis ('converse', 'neither-as-not-both', 'parse-error', ...).
 *
 *   getHints(exercise)    → string[]   progressive; reveal one at a time; never the full answer
 *   getSolution(exercise) → Solution   only on explicit request; derivations include a
 *                                       complete `derivation` draft ready for the editor
 *
 *   Helpers: createDerivationDraft(ex) (premises + opening Show line), formatDraft(draft),
 *   parseProofScript(lines), connectivePositions(text) (clickable targets), mainConnectiveIndex,
 *   describeValuation(v, key) (English), ruleJustifies / rulesJustifying (one-step rule matcher).
 *
 * SESSIONS
 *   createPracticeSession({ topic | 'mixed', difficulty, count, seed, topics?, difficultyByTopic?, ramp? })
 *     → { id, config, exercises }            (deterministic; no duplicate ids)
 *   scoreSession(session, results)           → SessionScore (0–100, per-topic, toReview)
 *
 * PROGRESS
 *   const store = new ProgressStore(getDefaultStorage(), { now? })
 *   store.recordAttempt({ exerciseId, topic, difficulty, correct, partial?, hintsUsed, timeMs, solutionViewed? })
 *   store.overview()            → totals, streak, per-topic stats, weak areas, recommendation, recent activity
 *   store.topicStats(t) / allTopicStats() / streak() / weakAreas() / activityByDay(days)
 *   store.recommendNext()       → { topic, difficulty, kind, reason }   (adaptive)
 *   store.recommendedDifficulty(topic)
 *   store.setLastExercise(ex, { answerDraft?, hintsShown? }) / getLastExercise() / clearLastExercise()
 *   store.saveProof({ id, title, draft, status?, exerciseId? }) / listProofs() / getProof(id) / deleteProof(id)
 *   store.subscribe(fn) + store.getSnapshot()   (works with React useSyncExternalStore)
 *   store.exportData() / importData(json) / reset(); store.loadIssue reports reset-on-corruption.
 * ─────────────────────────────────────────────────────────────────────────
 */
export * from './types';

export { checkAnswer, getHints, getSolution, generateExercise, getExerciseById, EXERCISE_BANK } from './exercises';
export type { GenerateOptions } from './exercises';

export {
  SYMBOLIZATION_EXERCISES,
  checkSymbolization,
  generateSymbolization,
  describeValuation,
  PATTERN_NOTES,
} from './symbolization';
export { SYMBOLIZATION_BANK, VOCABULARY } from './symbolizationBank';
export type { SymbolizationBankItem } from './symbolizationBank';

export { generateWff, checkWff } from './wff';

export {
  generateTruthTable,
  generateValidity,
  generateCountermodel,
  checkTruthTable,
  checkValidityAnswer,
  checkCountermodelAnswer,
  ARGUMENT_FORMS,
} from './semantics';
export type { ArgumentForm } from './semantics';

export {
  generateInferenceRule,
  checkInferenceRule,
  ruleJustifies,
  rulesJustifying,
  PRIMITIVE_RULES,
  DERIVED_RULES,
  ALL_RULES,
} from './inferenceRules';

export {
  DERIVATION_EXERCISES,
  createDerivationDraft,
  derivationSolutionDraft,
  parseProofScript,
  formatDraft,
  checkDerivationAnswer,
} from './derivations';

export {
  TERMINOLOGY_EXERCISES,
  generateTerminology,
  checkTerminology,
  mainConnectiveIndex,
  connectivePositions,
  formulaPart,
} from './terminology';

export { createPracticeSession, scoreSession, pointsFor, randomTopic } from './session';
export type { PracticeSession, PracticeSessionConfig, ExerciseResult, SessionScore } from './session';

export {
  ProgressStore,
  createMemoryStorage,
  getDefaultStorage,
  adaptiveLevel,
  dayKey,
  PROGRESS_SCHEMA_VERSION,
  PROMOTE_AFTER,
  DEMOTE_AFTER,
} from './progress';
export type {
  KeyValueStorage,
  AttemptRecord,
  AttemptInput,
  LastExerciseRecord,
  ProofDraftRecord,
  ProofStatus,
  ProgressData,
  TopicStats,
  StreakInfo,
  WeakArea,
  Recommendation,
  DayActivity,
  ProgressOverview,
  ProgressStoreOptions,
  LoadIssue,
} from './progress';
