/**
 * Concepts & terminology: a curated bank using varied answer formats (click
 * the main connective, type a part of a formula, fill in a term, true/false
 * with a justification, and multiple choice where it genuinely fits), plus a
 * generator for formula-anatomy questions.
 *
 * OWNER: Learning System.
 */
import type { Formula } from '../logic';
import { CONNECTIVE_NAME, SYMBOL, equals, format, formatWithSpans, isBinary, isQuantified, parse } from '../logic';
import type { Difficulty, Feedback, FormulaPart, Solution, TerminologyExercise, TerminologyFormat } from './types';
import { editDistance, f, hash, makeRng, niceRandomFormula, pick, shuffle } from './util';

// ---------------------------------------------------------------------------
// Formula anatomy helpers
// ---------------------------------------------------------------------------

/** Character index of the main connective in `format(g)` (canonical text), or -1 for an atom. */
export function mainConnectiveIndex(g: Formula): number {
  if (!isBinary(g)) return g.kind === 'not' || isQuantified(g) ? 0 : -1;
  return format(g.left, { dropOuter: false }).length + 1;
}

/** Character indices of every connective symbol in `text` (clickable targets for the UI). */
export function connectivePositions(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) if ('¬∧∨→↔∀∃'.includes(text[i])) out.push(i);
  return out;
}

const PART_INFO: Record<FormulaPart, { kind: Formula['kind']; side: 'left' | 'right' | 'operand'; noun: string }> = {
  antecedent: { kind: 'implies', side: 'left', noun: 'antecedent' },
  consequent: { kind: 'implies', side: 'right', noun: 'consequent' },
  'left-conjunct': { kind: 'and', side: 'left', noun: 'first (left) conjunct' },
  'right-conjunct': { kind: 'and', side: 'right', noun: 'second (right) conjunct' },
  'left-disjunct': { kind: 'or', side: 'left', noun: 'first (left) disjunct' },
  'right-disjunct': { kind: 'or', side: 'right', noun: 'second (right) disjunct' },
  'left-side': { kind: 'iff', side: 'left', noun: 'left side' },
  'right-side': { kind: 'iff', side: 'right', noun: 'right side' },
  negated: { kind: 'not', side: 'operand', noun: 'negated formula (what the main ¬ applies to)' },
};

export function formulaPart(g: Formula, part: FormulaPart): Formula | null {
  const info = PART_INFO[part];
  if (g.kind !== info.kind) return null;
  if (g.kind === 'not') return g.operand;
  if (!isBinary(g)) return null;
  return info.side === 'left' ? g.left : g.right;
}

// ---------------------------------------------------------------------------
// Bank
// ---------------------------------------------------------------------------

type Item = Omit<TerminologyExercise, 'kind' | 'topic' | 'source' | 'tags' | 'title'> & { title?: string; tags?: string[] };

const tfJust = (truth: boolean, options: string[], correctOption: number) => ({ format: 'true-false' as const, truth, options, correctOption });

const ITEMS: Item[] = [
  // --- true / false with justification
  {
    id: 'term-01', difficulty: 1, concept: 'validity', prompt: 'True or false: every valid argument has a true conclusion.',
    ...tfJust(false, ['A valid argument can have false premises and a false conclusion; validity only rules out true premises with a false conclusion.', 'Validity is about the premises actually being true.', 'Only sound arguments can be valid.'], 0),
    explanation: 'Validity is about form: there is no row where the premises are all true and the conclusion false. "All fish fly; Rex is a fish; so Rex flies" is valid with a false conclusion.',
  },
  {
    id: 'term-02', difficulty: 1, concept: 'soundness', prompt: 'True or false: if an argument is sound, its conclusion is true.',
    ...tfJust(true, ['Sound means valid with all premises true, and validity carries truth from premises to conclusion.', 'Sound means the conclusion sounds plausible.', 'Every valid argument has a true conclusion.'], 0),
    explanation: 'A sound argument is valid and has true premises, so its conclusion cannot be false.',
  },
  {
    id: 'term-03', difficulty: 1, concept: 'tautology', prompt: 'True or false: a tautology is true in every row of its truth table.',
    ...tfJust(true, ['That is the definition of a tautology.', 'Tautologies are true in at least one row.', 'Tautologies repeat the same sentence letter.'], 0),
    explanation: 'Tautology = true under every assignment of truth values.',
  },
  {
    id: 'term-04', difficulty: 1, concept: 'contingent', prompt: 'True or false: a contingent sentence is false in every row of its truth table.',
    ...tfJust(false, ['That describes a contradiction; a contingent sentence is true in some rows and false in others.', 'Contingent sentences are never false.', 'It depends on how many sentence letters it has.'], 0),
    explanation: 'Contingent = neither a tautology nor a contradiction: at least one T row and at least one F row.',
  },
  {
    id: 'term-05', difficulty: 2, concept: 'validity', prompt: 'True or false: any argument whose conclusion is a tautology is valid.',
    ...tfJust(true, ['The conclusion is never false, so there is no row with true premises and a false conclusion.', 'The premises must be tautologies too.', 'Only if the premises are consistent.'], 0),
    explanation: 'Invalidity needs a row where the conclusion is false; a tautology has none.',
  },
  {
    id: 'term-06', difficulty: 3, concept: 'validity', prompt: 'True or false: an argument whose premises are inconsistent is invalid.',
    ...tfJust(false, ['No row makes all the premises true, so no row can be a countermodel — the argument is (vacuously) valid.', 'Inconsistent premises make every argument invalid.', 'It depends on the conclusion.'], 0),
    explanation: 'Validity fails only if some row makes every premise true and the conclusion false. With inconsistent premises there is no such row.',
  },
  {
    id: 'term-07', difficulty: 2, concept: 'countermodel', prompt: 'True or false: every invalid argument has a countermodel.',
    ...tfJust(true, ['"Invalid" means there is a row with true premises and a false conclusion — that row is a countermodel.', 'Only arguments with false premises have countermodels.', 'Countermodels exist only for valid arguments.'], 0),
    explanation: 'A countermodel is exactly a witness to invalidity.',
  },
  {
    id: 'term-08', difficulty: 2, concept: 'contradiction', prompt: 'True or false: the negation of a contradiction is a tautology.',
    ...tfJust(true, ['A contradiction is F in every row, so its negation is T in every row.', 'Negation turns a contradiction into a contingent sentence.', 'Negation never changes the classification.'], 0),
    explanation: '¬ flips every row of the truth table.',
  },
  {
    id: 'term-09', difficulty: 2, concept: 'validity', prompt: 'True or false: an argument with true premises and a true conclusion must be valid.',
    ...tfJust(false, ['Validity is about every row, not just the actual one: another row may make the premises true and the conclusion false.', 'True premises and conclusion is the definition of validity.', 'It is valid as long as it is sound.'], 0),
    explanation: '"Grass is green; so snow is white" has a true premise and conclusion, but is invalid.',
  },
  {
    id: 'term-10', difficulty: 1, concept: 'consequent', prompt: 'True or false: in P → Q, P is the consequent.',
    ...tfJust(false, ['P comes before the arrow, so it is the antecedent; Q is the consequent.', 'P is the consequent because it comes first.', 'Conditionals have no consequent.'], 0),
    explanation: 'Antecedent → consequent.',
  },
  {
    id: 'term-11', difficulty: 1, concept: 'WFF', prompt: 'True or false: P ∧ Q ∨ R is a well-formed formula.',
    ...tfJust(false, ['Each binary connective joins exactly two formulas, so the grouping must be shown with parentheses.', 'It is fine because ∧ binds more tightly than ∨.', 'Formulas may not mix ∧ and ∨.'], 0),
    explanation: 'Write (P ∧ Q) ∨ R or P ∧ (Q ∨ R) — they mean different things.',
  },
  {
    id: 'term-12', difficulty: 3, concept: 'equivalence', prompt: 'True or false: P → Q is equivalent to its converse Q → P.',
    ...tfJust(false, ['They differ when P is F and Q is T (and vice versa): P → Q is T, Q → P is F.', 'They are equivalent because both contain P and Q.', 'They are equivalent because → is commutative.'], 0),
    explanation: 'A conditional is equivalent to its contrapositive ¬Q → ¬P, not its converse.',
  },
  // --- fill in the term
  { id: 'term-13', difficulty: 1, concept: 'antecedent', format: 'fill-in', prompt: 'In a conditional φ → ψ, the part before the arrow (φ) is called the ___.', accepted: ['antecedent'], confusions: { consequent: 'The consequent is the part AFTER the arrow.' }, explanation: 'φ is the antecedent, ψ the consequent.' },
  { id: 'term-14', difficulty: 1, concept: 'consequent', format: 'fill-in', prompt: 'In a conditional φ → ψ, the part after the arrow (ψ) is called the ___.', accepted: ['consequent'], confusions: { antecedent: 'The antecedent is the part BEFORE the arrow.', conclusion: '"Conclusion" is a part of an argument; inside a conditional, ψ is the consequent.' }, explanation: 'ψ is the consequent.' },
  { id: 'term-15', difficulty: 1, concept: 'disjunct', format: 'fill-in', prompt: 'Each of φ and ψ in φ ∨ ψ is called a ___.', accepted: ['disjunct'], confusions: { conjunct: 'Conjuncts are the parts of a conjunction (∧); ∨ makes a disjunction.' }, explanation: 'The parts of a disjunction are disjuncts.' },
  { id: 'term-16', difficulty: 1, concept: 'conjunct', format: 'fill-in', prompt: 'Each of φ and ψ in φ ∧ ψ is called a ___.', accepted: ['conjunct'], confusions: { disjunct: 'Disjuncts are the parts of a disjunction (∨).' }, explanation: 'The parts of a conjunction are conjuncts.' },
  { id: 'term-17', difficulty: 1, concept: 'soundness', format: 'fill-in', prompt: 'A valid argument whose premises are all true is called ___.', accepted: ['sound'], confusions: { valid: 'It is valid, but the special term for valid + true premises is "sound".', true: 'Arguments are not true or false; sentences are.' }, explanation: 'Sound = valid + all premises true.' },
  { id: 'term-18', difficulty: 1, concept: 'tautology', format: 'fill-in', prompt: 'A sentence that is true in every row of its truth table is a ___.', accepted: ['tautology'], confusions: { contradiction: 'A contradiction is FALSE in every row.', valid: '"Valid" applies to arguments; for a sentence true in every row the term is "tautology".' }, explanation: 'Tautology.' },
  { id: 'term-19', difficulty: 1, concept: 'contradiction', format: 'fill-in', prompt: 'A sentence that is false in every row of its truth table is a ___.', accepted: ['contradiction', 'self-contradiction'], confusions: { tautology: 'A tautology is TRUE in every row.' }, explanation: 'Contradiction.' },
  { id: 'term-20', difficulty: 1, concept: 'contingent', format: 'fill-in', prompt: 'A sentence that is true in some rows and false in others is ___.', accepted: ['contingent'], explanation: 'Contingent.' },
  { id: 'term-21', difficulty: 2, concept: 'countermodel', format: 'fill-in', prompt: 'An assignment of truth values that makes all the premises true and the conclusion false is called a ___.', accepted: ['countermodel', 'counterexample', 'counter model', 'counter-model'], explanation: 'Countermodel (or counterexample): it shows the argument is invalid.' },
  { id: 'term-22', difficulty: 2, concept: 'main connective', format: 'fill-in', prompt: 'The connective with the largest scope in a formula — the one applied last when it is built — is its ___ connective.', accepted: ['main', 'principal', 'major'], explanation: 'The main connective determines what kind of formula it is (conditional, negation, …).' },
  { id: 'term-23', difficulty: 2, concept: 'equivalence', format: 'fill-in', prompt: 'Two sentences that have the same truth value in every row are logically ___.', accepted: ['equivalent'], explanation: 'Equivalent sentences have identical truth-table columns.' },
  { id: 'term-24', difficulty: 2, concept: 'consistency', format: 'fill-in', prompt: 'A set of sentences that can all be true together (in at least one row) is ___.', accepted: ['consistent', 'satisfiable'], confusions: { valid: '"Valid" applies to arguments. For sentences that can be true together, the term is "consistent".' }, explanation: 'Consistent.' },
  { id: 'term-25', difficulty: 1, concept: 'WFF', format: 'fill-in', prompt: 'WFF is short for "well-formed ___".', accepted: ['formula'], explanation: 'Well-formed formula: a string built by the formation rules.' },
  { id: 'term-26', difficulty: 2, concept: 'truth table', format: 'fill-in', prompt: 'How many rows does a truth table for a sentence with 3 sentence letters have?', accepted: ['8', 'eight'], confusions: { '6': 'Each letter doubles the number of rows: 2 × 2 × 2.', '9': 'Each letter has 2 values, not 3: 2³ = 8.', '3': 'Each letter doubles the number of rows: 2³.' }, explanation: '2ⁿ rows for n letters: 2³ = 8.' },
  { id: 'term-27', difficulty: 3, concept: 'truth table', format: 'fill-in', prompt: 'How many rows does a truth table for a sentence with 4 sentence letters have?', accepted: ['16', 'sixteen'], confusions: { '8': 'That is for 3 letters; one more letter doubles it.' }, explanation: '2⁴ = 16.' },
  // --- multiple choice (where it genuinely fits)
  { id: 'term-28', difficulty: 2, concept: 'inference rules', format: 'multiple-choice', prompt: 'From P → Q and ¬Q, which rule lets you infer ¬P?', options: ['MP (Modus Ponens)', 'MT (Modus Tollens)', 'MTP (Modus Tollendo Ponens)', 'DN (Double Negation)'], correctOption: 1, explanation: 'MT: from a conditional and the negation of its consequent, infer the negation of its antecedent.' },
  { id: 'term-29', difficulty: 2, concept: 'derivations', format: 'multiple-choice', prompt: 'Your Show line is ¬(P ∧ Q). Which strategy is the natural one?', options: ['DD — derive it directly', 'CD — assume the antecedent', 'ID — assume P ∧ Q and derive a contradiction'], correctOption: 2, explanation: 'The goal is a negation, so assume what it negates (ASS ID) and derive a contradiction. CD only applies to conditionals.' },
  { id: 'term-30', difficulty: 2, concept: 'derivations', format: 'multiple-choice', prompt: 'Which closing method do you use for a Show line whose formula is a conditional, after assuming its antecedent?', options: ['DD', 'CD', 'ID'], correctOption: 1, explanation: 'Conditional Derivation: assume the antecedent, derive the consequent, close with CD.' },
  { id: 'term-31', difficulty: 3, concept: 'validity', format: 'multiple-choice', prompt: 'Which of these best defines a valid argument?', options: ['Its premises and conclusion are all true.', 'It is impossible for the premises all to be true while the conclusion is false.', 'Its conclusion follows from at least one premise.', 'It has no false premises.'], correctOption: 1, explanation: 'Validity is a guarantee: no possible situation (row) makes the premises true and the conclusion false.' },
  { id: 'term-32', difficulty: 3, concept: 'symbolization', format: 'multiple-choice', prompt: '"P only if Q" is symbolized as…', options: ['P → Q', 'Q → P', 'P ↔ Q', 'P ∧ Q'], correctOption: 0, explanation: '"only if" introduces the consequent (a necessary condition).' },
  // --- formula anatomy (bank versions)
  { id: 'term-33', difficulty: 1, concept: 'main connective', format: 'click-connective', prompt: 'Click the main connective.', formula: '¬(P ∧ Q) → R', explanation: 'The → joins ¬(P ∧ Q) and R, so it is applied last; the ¬ only covers (P ∧ Q).' },
  { id: 'term-34', difficulty: 2, concept: 'main connective', format: 'click-connective', prompt: 'Click the main connective.', formula: '¬(P → (Q ∨ R))', explanation: 'The outer ¬ covers the whole rest of the formula, so it is the main connective.' },
  { id: 'term-35', difficulty: 2, concept: 'main connective', format: 'click-connective', prompt: 'Click the main connective.', formula: '(P ↔ Q) ∧ ¬R', explanation: 'The ∧ joins (P ↔ Q) and ¬R.' },
  { id: 'term-36', difficulty: 1, concept: 'antecedent', format: 'type-part', part: 'antecedent', prompt: 'Type the antecedent of this conditional.', formula: '(P ∧ Q) → (R ∨ S)', explanation: 'The antecedent is everything to the left of the main →.' },
  { id: 'term-37', difficulty: 2, concept: 'consequent', format: 'type-part', part: 'consequent', prompt: 'Type the consequent of this conditional.', formula: 'P → (Q → R)', explanation: 'The consequent of the MAIN arrow is the whole Q → R.' },
  { id: 'term-38', difficulty: 2, concept: 'disjunct', format: 'type-part', part: 'right-disjunct', prompt: 'Type the second disjunct.', formula: '(P → Q) ∨ ¬R', explanation: 'The disjuncts are P → Q and ¬R.' },
  { id: 'term-39', difficulty: 2, concept: 'converse', format: 'type-formula', prompt: 'Write the converse of P → ¬Q.', accepted: ['¬Q → P'], explanation: 'The converse swaps antecedent and consequent.' },
  { id: 'term-40', difficulty: 3, concept: 'contrapositive', format: 'type-formula', prompt: 'Write the contrapositive of P → ¬Q.', accepted: ['¬¬Q → ¬P'], explanation: 'The contrapositive of φ → ψ is ¬ψ → ¬φ; here ψ is ¬Q, so ¬ψ is ¬¬Q. (Q → ¬P is equivalent but is not literally the contrapositive.)' },
  { id: 'term-41', difficulty: 2, concept: 'negation', format: 'type-formula', prompt: 'Write the negation of P → Q (a formula whose main connective is ¬).', accepted: ['¬(P → Q)'], explanation: 'Negate the whole formula: parentheses are needed, since ¬P → Q would only negate P.' },
];

function toExercise(it: Item, topic: TerminologyExercise['topic'] = 'terminology'): TerminologyExercise {
  const title =
    it.title ??
    ({ 'click-connective': 'Main connective', 'type-part': 'Parts of a formula', 'type-formula': 'Write the formula', 'fill-in': 'Fill in the term', 'true-false': 'True or false?', 'multiple-choice': 'Concept check' } as Record<TerminologyFormat, string>)[it.format];
  const ex: TerminologyExercise = { ...it, kind: 'terminology', topic, source: 'bank', title, tags: it.tags ?? [it.concept] };
  if (ex.format === 'true-false' && ex.options && ex.correctOption !== undefined) {
    // Authored with the right reason first; present in a stable shuffled order.
    const right = ex.options[ex.correctOption];
    ex.options = shuffle(makeRng(parseInt(hash(ex.id), 36)), ex.options);
    ex.correctOption = ex.options.indexOf(right);
  }
  if (ex.format === 'click-connective' && ex.formula)ex.connectiveIndex = mainConnectiveIndex(f(ex.formula));
  if (ex.format === 'type-part' && ex.formula && ex.part) {
    const p = formulaPart(f(ex.formula), ex.part);
    ex.accepted = p ? [format(p)] : [];
  }
  return ex;
}

export const TERMINOLOGY_EXERCISES: TerminologyExercise[] = ITEMS.map((it) => toExercise(it)).sort((a, b) => a.difficulty - b.difficulty);

const PREDICATE_ITEMS: Item[] = [
  { id: 'pterm-01', difficulty: 1, concept: 'bound variable', format: 'fill-in', prompt: 'An occurrence of a variable that lies within the scope of a quantifier on that same variable is ___.', accepted: ['bound'], confusions: { free: 'Free is the opposite: NOT within the scope of a quantifier on that variable.' }, explanation: 'Bound: governed by a quantifier ∀x or ∃x whose scope contains it.' },
  { id: 'pterm-02', difficulty: 1, concept: 'free variable', format: 'fill-in', prompt: 'In ∀x Fx → Gx, the occurrence of x in Gx is ___.', accepted: ['free'], confusions: { bound: 'The ∀x covers only Fx — a quantifier binds just the formula right after it, like ¬.' }, explanation: 'The quantifier\'s scope is only Fx, so the x in Gx is free. Write ∀x(Fx → Gx) to bind it.' },
  { id: 'pterm-03', difficulty: 2, concept: 'scope', format: 'true-false', prompt: 'True or false: in ∀x(Fx → Gx) ∧ Hx, every occurrence of x is bound.', truth: false, options: ['The ∀x covers only the parenthesized conditional, so the x in Hx is free.', 'All occurrences are bound because ∀x comes first.', 'Variables are always bound in a sentence.'], correctOption: 0, explanation: 'The scope of ∀x is (Fx → Gx); Hx lies outside it.' },
  { id: 'pterm-04', difficulty: 1, concept: 'sentence', format: 'true-false', prompt: 'True or false: a sentence of predicate logic may contain free variables.', truth: false, options: ['A sentence is by definition a formula with no free variables.', 'Only names may be free.', 'Sentences need at least one free variable.'], correctOption: 0, explanation: 'Formulas with free variables are open formulas; sentences are closed.' },
  { id: 'pterm-05', difficulty: 1, concept: 'instance', format: 'fill-in', prompt: 'Fa is an ___ of ∀xFx (the result of dropping the quantifier and replacing x by a term).', accepted: ['instance', 'instantiation', 'substitution instance'], explanation: 'An instance replaces every free occurrence of the quantified variable in the body by one term.' },
  { id: 'pterm-06', difficulty: 2, concept: 'instance', format: 'type-formula', prompt: 'Write the instance of ∀x(Fx → Gx) for the name a.', accepted: ['Fa → Ga'], explanation: 'Drop ∀x and replace EVERY free x by a.' },
  { id: 'pterm-07', difficulty: 2, concept: 'scope', format: 'type-formula', prompt: 'Type the scope (the formula it governs) of the main quantifier of ∀x(Fx → ∃yRxy).', accepted: ['Fx → ∃yRxy'], explanation: 'The scope of the leading ∀x is the whole parenthesized conditional.' },
  { id: 'pterm-08', difficulty: 2, concept: 'main connective', format: 'click-connective', prompt: 'Click the main operator (connective or quantifier).', formula: '∀x(Fx → Gx)', explanation: 'The ∀x has the whole formula as its scope, so it is the main operator.' },
  { id: 'pterm-09', difficulty: 3, concept: 'main connective', format: 'click-connective', prompt: 'Click the main operator (connective or quantifier).', formula: '∃xFx → ∀yGy', explanation: 'The → joins ∃xFx and ∀yGy; each quantifier governs only its own side.' },
  { id: 'pterm-10', difficulty: 2, concept: 'UI', format: 'multiple-choice', prompt: 'Which line follows from ∀x(Fx → Gx) by UI (universal instantiation)?', options: ['Fa → Ga', 'Fa → Gb', '∃x(Fx → Gx)', 'Fx → Ga'], correctOption: 0, explanation: 'UI replaces every free x in the body by the SAME term.' },
  { id: 'pterm-11', difficulty: 3, concept: 'EI', format: 'multiple-choice', prompt: 'In Logic 2010, existential instantiation (EI) from ∃xFx must instantiate to…', options: ['a variable that does not occur earlier in the derivation', 'any name', 'the name a', 'any variable at all'], correctOption: 0, explanation: 'The instantiated object is unknown, so EI uses a NEW variable — never a name or a variable already in use.' },
  { id: 'pterm-12', difficulty: 3, concept: 'UD', format: 'true-false', prompt: 'True or false: you may close a Show ∀x φ line with UD even if x is free in an undischarged assumption.', truth: false, options: ['UD needs x to be arbitrary: x may not be free in any open assumption or premise (or in a line obtained by EI).', 'UD has no restrictions.', 'Only premises matter, not assumptions.'], correctOption: 0, explanation: 'If x is free in an assumption, facts about x are not general facts about everything.' },
  { id: 'pterm-13', difficulty: 2, concept: 'EG', format: 'true-false', prompt: 'True or false: from Raa, EG allows you to infer ∃xRxa.', truth: true, options: ['EG may generalize on some or all occurrences of the name.', 'EG must replace every occurrence of a.', 'EG only works on variables.'], correctOption: 0, explanation: 'EG is flexible: ∃xRxa, ∃xRax and ∃xRxx all follow from Raa.' },
  { id: 'pterm-14', difficulty: 1, concept: 'domain', format: 'fill-in', prompt: 'The collection of objects the quantifiers range over is called the ___ (of discourse).', accepted: ['domain', 'universe', 'universe of discourse', 'domain of discourse'], explanation: 'The domain: "everything" and "something" mean everything / something in the domain.' },
  { id: 'pterm-15', difficulty: 1, concept: 'extension', format: 'fill-in', prompt: 'The set of objects a one-place predicate is true of is its ___.', accepted: ['extension'], explanation: 'The extension of F is the set of objects that are F; for a two-place predicate, a set of ordered pairs.' },
  { id: 'pterm-16', difficulty: 2, concept: 'interpretation', format: 'fill-in', prompt: 'A domain together with an extension for every predicate and a referent for every name is an ___ (also called a model).', accepted: ['interpretation', 'model', 'structure'], explanation: 'An interpretation fixes the truth value of every sentence.' },
  { id: 'pterm-17', difficulty: 3, concept: 'quantifier order', format: 'true-false', prompt: 'True or false: ∀x∃yLxy and ∃y∀xLxy say the same thing.', truth: false, options: ['∀x∃y lets each x have its own y; ∃y∀x needs one y for every x.', 'Quantifier order never matters.', 'They differ only when the domain is empty.'], correctOption: 0, explanation: 'Everyone loves someone ≠ someone is loved by everyone. (The second implies the first, not conversely.)' },
  { id: 'pterm-18', difficulty: 2, concept: 'vacuous truth', format: 'true-false', prompt: 'True or false: ∀x(Fx → Gx) is true in a world where nothing is F.', truth: true, options: ['Every instance Fo → Go has a false antecedent, so every instance is true.', 'It is false because there are no F to be G.', 'It has no truth value.'], correctOption: 0, explanation: 'A universal conditional with an empty antecedent class is vacuously true.' },
];

/** Predicate-logic concepts (topic 'predicate-terminology'). */
export const PREDICATE_TERMINOLOGY_EXERCISES: TerminologyExercise[] = PREDICATE_ITEMS.map((it) => toExercise(it, 'predicate-terminology')).sort((a, b) => a.difficulty - b.difficulty);

// ---------------------------------------------------------------------------
// Generator: formula anatomy
// ---------------------------------------------------------------------------

export function generateTerminology(difficulty: Difficulty, seed: number): TerminologyExercise {
  const rng = makeRng(seed);
  const bank = TERMINOLOGY_EXERCISES.filter((e) => e.difficulty === difficulty && e.format !== 'click-connective' && e.format !== 'type-part');
  if (bank.length && rng() < 0.4) return pick(rng, bank);
  const atoms = difficulty <= 2 ? ['P', 'Q', 'R'] : ['P', 'Q', 'R', 'S'];
  const maxDepth = difficulty <= 1 ? 2 : difficulty <= 3 ? 3 : 4;
  const minSize = [1, 2, 3, 4, 5][difficulty - 1];
  let g: Formula = f('P → Q');
  for (let i = 0; i < 100; i++) {
    const c = niceRandomFormula({ atoms, maxDepth, random: rng });
    const n = (format(c).match(/[¬∧∨→↔]/g) ?? []).length;
    if (c.kind !== 'atom' && n >= minSize && n <= minSize + 3) {
      g = c;
      break;
    }
  }
  const text = format(g);
  const click = g.kind === 'not' || rng() < 0.5;
  if (click) {
    return {
      id: `term-gen-click-${hash(text)}`,
      kind: 'terminology',
      topic: 'terminology',
      difficulty,
      title: 'Main connective',
      prompt: 'Click the main connective.',
      tags: ['main connective'],
      source: 'generated',
      format: 'click-connective',
      concept: 'main connective',
      formula: text,
      connectiveIndex: mainConnectiveIndex(g),
      explanation: `The main connective is the ${CONNECTIVE_NAME[g.kind]} (${SYMBOL[g.kind as keyof typeof SYMBOL]}): it is applied last when the formula is built, and its scope is the whole formula.`,
    };
  }
  const parts: FormulaPart[] = g.kind === 'implies' ? ['antecedent', 'consequent'] : g.kind === 'and' ? ['left-conjunct', 'right-conjunct'] : g.kind === 'or' ? ['left-disjunct', 'right-disjunct'] : ['left-side', 'right-side'];
  const part = pick(rng, parts);
  const ans = formulaPart(g, part)!;
  return {
    id: `term-gen-part-${part}-${hash(text)}`,
    kind: 'terminology',
    topic: 'terminology',
    difficulty,
    title: 'Parts of a formula',
    prompt: `Type the ${PART_INFO[part].noun} of this ${CONNECTIVE_NAME[g.kind]}.`,
    tags: [PART_INFO[part].noun.split(' ')[0]],
    source: 'generated',
    format: 'type-part',
    concept: CONNECTIVE_NAME[g.kind],
    formula: text,
    part,
    accepted: [format(ans)],
    explanation: `Find the main connective first (the ${SYMBOL[g.kind as keyof typeof SYMBOL]}); the ${PART_INFO[part].noun} is everything on its ${PART_INFO[part].side} side.`,
  };
}

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

const normWord = (s: string) =>
  s.toLowerCase().trim().replace(/[.!?"'“”]/g, '').replace(/^(a|an|the)\s+/, '').replace(/\s+/g, ' ').replace(/s$/, '');

export function checkTerminology(ex: TerminologyExercise, a: { position?: number; text?: string; value?: boolean; choice?: number }): Feedback {
  const ok = (headline = 'Correct!'): Feedback => ({ correct: true, severity: 'success', code: 'correct', headline, explanation: ex.explanation });
  switch (ex.format) {
    case 'click-connective': {
      if (a.position === undefined) return { correct: false, severity: 'error', code: 'empty', headline: 'Click a connective in the formula.', explanation: 'The main connective is the one whose scope is the whole formula.' };
      const g = f(ex.formula!);
      const idx = ex.connectiveIndex ?? mainConnectiveIndex(g);
      if (a.position === idx) return ok(`Correct — the main connective is the ${CONNECTIVE_NAME[g.kind]}.`);
      const hl = [
        { target: 'formula' as const, start: a.position, end: a.position + 1, tone: 'error' as const },
      ];
      // What does the clicked connective govern? Find the subformula whose main connective sits there.
      const clickedScope = scopeAt(g, a.position);
      return {
        correct: false,
        severity: 'error',
        code: 'not-main',
        headline: 'That connective is not the main one.',
        explanation: clickedScope
          ? `The connective you clicked only governs ${clickedScope}, which is a part of a larger formula. The main connective's scope is the WHOLE formula — look for the one that is not inside any parentheses (or a ¬ at the very front that covers everything).`
          : 'The main connective is the one whose scope is the whole formula: not inside any parentheses.',
        highlight: hl,
      };
    }
    case 'type-part':
    case 'type-formula': {
      const text = a.text ?? '';
      if (!text.trim()) return { correct: false, severity: 'error', code: 'empty', headline: 'Type a formula.', explanation: ex.explanation };
      const p = parse(text);
      if (!p.ok) return { correct: false, severity: 'error', code: 'parse-error', headline: "That isn't a well-formed formula.", explanation: p.error.message, details: p.error.hint ? [p.error.hint] : undefined, highlight: [{ target: 'answer', start: p.error.span.start, end: p.error.span.end, tone: 'error' }] };
      const accepted = (ex.accepted ?? []).map(f);
      if (accepted.some((x) => equals(x, p.formula))) return ok();
      if (ex.format === 'type-part' && ex.formula && ex.part) {
        const g = f(ex.formula);
        const other = (Object.keys(PART_INFO) as FormulaPart[]).find((pt) => pt !== ex.part && formulaPart(g, pt) && equals(formulaPart(g, pt)!, p.formula));
        if (other) return { correct: false, severity: 'error', code: 'wrong-part', headline: `That is the ${PART_INFO[other].noun}, not the ${PART_INFO[ex.part].noun}.`, explanation: ex.explanation };
        return { correct: false, severity: 'error', code: 'wrong-part', headline: `That is not the ${PART_INFO[ex.part].noun}.`, explanation: `${ex.explanation} Copy the whole part exactly, including any ¬ and the parentheses' contents.` };
      }
      return { correct: false, severity: 'error', code: 'wrong-formula', headline: 'Not quite.', explanation: ex.explanation };
    }
    case 'fill-in': {
      const w = normWord(a.text ?? '');
      if (!w) return { correct: false, severity: 'error', code: 'empty', headline: 'Type your answer.', explanation: '' };
      const acc = (ex.accepted ?? []).map(normWord);
      if (acc.includes(w)) return ok();
      const close = acc.find((x) => x.length > 4 && editDistance(x, w) <= 1);
      if (close) return { ...ok(`Correct (check the spelling: "${ex.accepted![acc.indexOf(close)]}").`), severity: 'info' };
      const conf = ex.confusions && Object.entries(ex.confusions).find(([k]) => normWord(k) === w);
      return { correct: false, severity: 'error', code: conf ? 'confusion' : 'wrong', headline: conf ? `Not "${a.text?.trim()}".` : 'Not quite.', explanation: conf ? conf[1] : 'Re-read the definition in the question and think of the exact technical term.' };
    }
    case 'true-false': {
      if (a.value === undefined) return { correct: false, severity: 'error', code: 'empty', headline: 'Choose true or false.', explanation: '' };
      if (a.value !== ex.truth) return { correct: false, severity: 'error', code: 'wrong-value', headline: `It is ${ex.truth ? 'true' : 'false'}.`, explanation: ex.explanation };
      if (ex.options?.length && a.choice === undefined) return { correct: false, partial: true, severity: 'warning', code: 'needs-justification', headline: `Right, it is ${ex.truth ? 'true' : 'false'} — now pick the reason why.`, explanation: 'Choose the justification that explains your answer.' };
      if (ex.options?.length && a.choice !== ex.correctOption) return { correct: false, partial: true, severity: 'warning', code: 'wrong-justification', headline: `Right answer (${ex.truth ? 'true' : 'false'}), but not for that reason.`, explanation: ex.explanation };
      return ok();
    }
    case 'multiple-choice': {
      if (a.choice === undefined) return { correct: false, severity: 'error', code: 'empty', headline: 'Choose an option.', explanation: '' };
      if (a.choice === ex.correctOption) return ok();
      return { correct: false, severity: 'error', code: 'wrong-choice', headline: `Not "${ex.options?.[a.choice] ?? '?'}".`, explanation: ex.explanation };
    }
  }
}

/** Text of the subformula whose main connective sits at `pos` in format(g). */
function scopeAt(g: Formula, pos: number): string | null {
  const { text, spans } = formatWithSpans(g);
  for (const { formula: h, span } of spans) {
    if (h.kind === 'atom' || h.kind === 'pred') continue;
    const top = span.start === 0 && span.end === text.length;
    const main = !isBinary(h) ? span.start : span.start + (top ? 0 : 1) + format(h.left, { dropOuter: false }).length + 1;
    if (main === pos) return format(h);
  }
  return null;
}

export function terminologyHints(ex: TerminologyExercise): string[] {
  switch (ex.format) {
    case 'click-connective':
      return ['The main connective is applied last when the formula is built up, so its scope is the whole formula.', 'Ignore everything inside parentheses: the main connective is outside all of them (or is a ¬ at the very front covering everything).'];
    case 'type-part':
      return ['First find the main connective.', `The ${PART_INFO[ex.part!].noun} is the complete formula on the ${PART_INFO[ex.part!].side === 'operand' ? 'right of the ¬' : `${PART_INFO[ex.part!].side} of the main connective`}; drop only its outer parentheses.`];
    case 'type-formula':
      return ['Work from the definition in the question; keep negations exactly as they are and add parentheses where needed.', `The concept here is ${ex.concept}. Start from the formula given in the question and change only what the definition requires.`];
    case 'fill-in':
      return [`Think about the concept: ${ex.concept}.`, `The answer starts with "${(ex.accepted?.[0] ?? '')[0] ?? ''}".`];
    case 'true-false':
      return [`Recall the definition of ${ex.concept}.`, 'Try to think of a counterexample to the statement. If you can find one, it is false.'];
    case 'multiple-choice':
      return [`Recall the definition of ${ex.concept}.`, 'Rule out the options you can show are wrong.'];
  }
}

export function terminologySolution(ex: TerminologyExercise): Solution {
  switch (ex.format) {
    case 'click-connective':
      return { answer: `${ex.formula![ex.connectiveIndex ?? 0]} (position ${ex.connectiveIndex})`, summary: ex.explanation };
    case 'type-part':
    case 'type-formula':
    case 'fill-in':
      return { answer: ex.accepted?.[0] ?? '', summary: ex.explanation };
    case 'true-false':
      return { answer: ex.truth ? 'true' : 'false', summary: `${ex.truth ? 'True' : 'False'}. ${ex.options?.[ex.correctOption ?? 0] ?? ''} ${ex.explanation}`.trim() };
    case 'multiple-choice':
      return { answer: ex.options?.[ex.correctOption ?? 0] ?? '', summary: ex.explanation };
  }
}
