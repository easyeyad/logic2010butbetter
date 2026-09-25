/**
 * Curated derivation problems (Logic 2010 / Kalish–Montague style), ordered
 * by difficulty, each with progressive hints and a complete model solution.
 *
 * Model solutions are written in a compact script (see `parseProofScript`):
 *
 *   'P → Q :: PR'                 premise
 *   'Show P → R :: CD 6'          Show line, closed by CD citing line 6
 *   '  P :: ASS CD'               assumption (2 spaces of indent per box level)
 *   '  Q :: MP 1 4'               rule application citing lines 1 and 4
 *
 * Line numbers are 1-based, as in the editor. Every problem is a valid
 * argument (checked in derivations.test.ts with checkValidity).
 *
 * OWNER: Learning System.
 */
import { equals, format, parse } from '../logic';
import type { CloseMethod, DerivationCheck, DerivationDraft, DraftLine, RuleId } from '../proof';
import { checkDerivation, solve } from '../proof';
import type { DerivationExercise, Difficulty, Feedback, Solution } from './types';
import { f } from './util';

interface Problem {
  id: string;
  title: string;
  difficulty: Difficulty;
  premises: string[];
  goal: string;
  strategy: CloseMethod;
  hints: string[];
  solution: string[];
  derived?: boolean;
  tags?: string[];
  /** Overrides the generic goal-shape strategy hint when it would mislead. */
  strategyHint?: string;
}

const PROBLEMS: Problem[] = [
  // ------------------------------------------------------------------ level 1
  {
    id: 'der-01', title: 'Modus ponens chain', difficulty: 1, strategy: 'DD', premises: ['P → Q', 'Q → R', 'P'], goal: 'R', tags: ['MP'],
    hints: ['R is the consequent of premise 2, so you need Q first.', 'Q is the consequent of premise 1, and you have its antecedent P.'],
    solution: ['P → Q :: PR', 'Q → R :: PR', 'P :: PR', 'Show R :: DD 6', '  Q :: MP 1 3', '  R :: MP 2 5'],
  },
  {
    id: 'der-02', title: 'Modus tollens', difficulty: 1, strategy: 'DD', premises: ['P → Q', '¬Q'], goal: '¬P', tags: ['MT'],
    hints: ['You have a conditional and the negation of its consequent.', 'MT: from φ → ψ and ¬ψ, derive ¬φ.'],
    solution: ['P → Q :: PR', '¬Q :: PR', 'Show ¬P :: DD 4', '  ¬P :: MT 1 2'],
  },
  {
    id: 'der-03', title: 'Double negation', difficulty: 1, strategy: 'DD', premises: ['¬¬P', 'P → Q'], goal: 'Q', tags: ['DN', 'MP'],
    hints: ['MP needs exactly P, but premise 1 is ¬¬P.', 'DN removes two negations from the front of a whole line.'],
    solution: ['¬¬P :: PR', 'P → Q :: PR', 'Show Q :: DD 5', '  P :: DN 1', '  Q :: MP 2 4'],
  },
  {
    id: 'der-04', title: 'Commuting a conjunction', difficulty: 1, strategy: 'DD', premises: ['P ∧ Q'], goal: 'Q ∧ P', tags: ['S', 'ADJ'],
    hints: ['Take the conjunction apart with S, then put it back together in the other order.', 'ADJ joins two lines into a conjunction in the order you choose.'],
    solution: ['P ∧ Q :: PR', 'Show Q ∧ P :: DD 5', '  P :: S 1', '  Q :: S 1', '  Q ∧ P :: ADJ 4 3'],
  },
  {
    id: 'der-05', title: 'Addition', difficulty: 1, strategy: 'DD', premises: ['P', '(P ∨ Q) → R'], goal: 'R', tags: ['ADD', 'MP'],
    hints: ['To use premise 2 with MP you need its antecedent P ∨ Q.', 'ADD lets you attach any disjunct to a line you have.'],
    solution: ['P :: PR', '(P ∨ Q) → R :: PR', 'Show R :: DD 5', '  P ∨ Q :: ADD 1', '  R :: MP 2 4'],
  },
  {
    id: 'der-06', title: 'Simplify twice', difficulty: 1, strategy: 'DD', premises: ['P ∧ (Q ∧ R)'], goal: 'R', tags: ['S'],
    hints: ['R is buried inside a conjunction inside a conjunction.', 'Use S once to get Q ∧ R, then S again.'],
    solution: ['P ∧ (Q ∧ R) :: PR', 'Show R :: DD 4', '  Q ∧ R :: S 1', '  R :: S 3'],
  },
  // ------------------------------------------------------------------ level 2
  {
    id: 'der-07', title: 'Modus tollendo ponens', difficulty: 2, strategy: 'DD', premises: ['P ∨ Q', '¬P', 'Q → R'], goal: 'R', tags: ['MTP', 'MP'],
    hints: ['A disjunction plus the negation of one disjunct gives the other disjunct (MTP).', 'Once you have Q, premise 3 finishes the job.'],
    solution: ['P ∨ Q :: PR', '¬P :: PR', 'Q → R :: PR', 'Show R :: DD 6', '  Q :: MTP 1 2', '  R :: MP 3 5'],
  },
  {
    id: 'der-08', title: 'Modus tollens with a negated consequent', difficulty: 2, strategy: 'DD', premises: ['P → ¬Q', 'Q'], goal: '¬P', tags: ['MT', 'DN'],
    hints: ['For MT you need the negation of the consequent ¬Q — that is ¬¬Q, not Q.', 'Get ¬¬Q from Q by DN, then use MT.'],
    solution: ['P → ¬Q :: PR', 'Q :: PR', 'Show ¬P :: DD 5', '  ¬¬Q :: DN 2', '  ¬P :: MT 1 4'],
  },
  {
    id: 'der-09', title: 'Using a biconditional', difficulty: 2, strategy: 'DD', premises: ['P ↔ Q', 'Q'], goal: 'P', tags: ['BC', 'MP'],
    hints: ['MP does not work directly on a biconditional.', 'BC turns P ↔ Q into the conditional you need: Q → P.'],
    solution: ['P ↔ Q :: PR', 'Q :: PR', 'Show P :: DD 5', '  Q → P :: BC 1', '  P :: MP 4 2'],
  },
  {
    id: 'der-10', title: 'Adjunction for MP', difficulty: 2, strategy: 'DD', premises: ['(P ∧ Q) → R', 'P', 'Q'], goal: 'R', tags: ['ADJ', 'MP'],
    hints: ['The antecedent of premise 1 is P ∧ Q, and you have P and Q separately.', 'ADJ builds P ∧ Q; then MP.'],
    solution: ['(P ∧ Q) → R :: PR', 'P :: PR', 'Q :: PR', 'Show R :: DD 6', '  P ∧ Q :: ADJ 2 3', '  R :: MP 1 5'],
  },
  {
    id: 'der-11', title: 'Hypothetical syllogism', difficulty: 2, strategy: 'CD', premises: ['P → Q', 'Q → R'], goal: 'P → R', tags: ['CD'],
    hints: ['The goal is a conditional: use Conditional Derivation.', 'Assume the antecedent P (ASS CD) and aim for R.'],
    solution: ['P → Q :: PR', 'Q → R :: PR', 'Show P → R :: CD 6', '  P :: ASS CD', '  Q :: MP 1 4', '  R :: MP 2 5'],
  },
  {
    id: 'der-12', title: 'Contraposition', difficulty: 2, strategy: 'CD', premises: ['P → Q'], goal: '¬Q → ¬P', tags: ['CD', 'MT'],
    hints: ['The goal is a conditional; assume its antecedent ¬Q.', 'With ¬Q assumed, MT on the premise gives ¬P.'],
    solution: ['P → Q :: PR', 'Show ¬Q → ¬P :: CD 4', '  ¬Q :: ASS CD', '  ¬P :: MT 1 3'],
  },
  {
    id: 'der-13', title: 'Chaining with MT and MTP', difficulty: 2, strategy: 'DD', premises: ['P ∨ Q', 'Q → R', '¬R'], goal: 'P', tags: ['MT', 'MTP'],
    hints: ['From premises 2 and 3 you can learn that Q is false.', 'With ¬Q, MTP on premise 1 gives P.'],
    solution: ['P ∨ Q :: PR', 'Q → R :: PR', '¬R :: PR', 'Show P :: DD 6', '  ¬Q :: MT 2 3', '  P :: MTP 1 5'],
  },
  // ------------------------------------------------------------------ level 3
  {
    id: 'der-14', title: 'Two conditionals, one conjunction', difficulty: 3, strategy: 'DD', premises: ['P → Q', 'R → S', 'P ∧ R'], goal: 'Q ∧ S', tags: ['S', 'MP', 'ADJ'],
    hints: ['Break premise 3 apart first.', 'Get Q and S separately with MP, then ADJ.'],
    solution: ['P → Q :: PR', 'R → S :: PR', 'P ∧ R :: PR', 'Show Q ∧ S :: DD 9', '  P :: S 3', '  R :: S 3', '  Q :: MP 1 5', '  S :: MP 2 6', '  Q ∧ S :: ADJ 7 8'],
  },
  {
    id: 'der-15', title: 'Indirect derivation', difficulty: 3, strategy: 'ID', premises: ['P → Q', 'P → ¬Q'], goal: '¬P', tags: ['ID'],
    hints: ['The goal is a negation, so try ID: assume P (the goal without its ¬).', 'From P you get both Q and ¬Q — a contradiction.'],
    solution: ['P → Q :: PR', 'P → ¬Q :: PR', 'Show ¬P :: ID 5 6', '  P :: ASS ID', '  Q :: MP 1 4', '  ¬Q :: MP 2 4'],
  },
  {
    id: 'der-16', title: 'Neither … nor (1)', difficulty: 3, strategy: 'ID', premises: ['¬(P ∨ Q)'], goal: '¬P', tags: ['ID', 'ADD', 'R'],
    hints: ['Goal is a negation: assume P for ID.', 'From P, ADD gives P ∨ Q, which contradicts the premise. Bring the premise into the box with R.'],
    solution: ['¬(P ∨ Q) :: PR', 'Show ¬P :: ID 4 5', '  P :: ASS ID', '  P ∨ Q :: ADD 3', '  ¬(P ∨ Q) :: R 1'],
  },
  {
    id: 'der-17', title: 'Neither … nor (2)', difficulty: 3, strategy: 'ID', premises: ['¬P ∧ ¬Q'], goal: '¬(P ∨ Q)', tags: ['ID', 'MTP'],
    hints: ['Goal is a negation: assume P ∨ Q for ID.', 'With ¬P from the premise, MTP on the assumption gives Q — but the premise also gives ¬Q.'],
    solution: ['¬P ∧ ¬Q :: PR', 'Show ¬(P ∨ Q) :: ID 5 6', '  P ∨ Q :: ASS ID', '  ¬P :: S 1', '  Q :: MTP 3 4', '  ¬Q :: S 1'],
  },
  {
    id: 'der-18', title: 'Exportation', difficulty: 3, strategy: 'CD', premises: ['(P ∧ Q) → R'], goal: 'P → (Q → R)', tags: ['CD', 'nested'],
    hints: ['The goal is a conditional whose consequent is also a conditional: two CD boxes, one inside the other.', 'Assume P, then Show Q → R, assume Q, and use ADJ + MP.'],
    solution: ['(P ∧ Q) → R :: PR', 'Show P → (Q → R) :: CD 4', '  P :: ASS CD', '  Show Q → R :: CD 7', '    Q :: ASS CD', '    P ∧ Q :: ADJ 3 5', '    R :: MP 1 6'],
  },
  {
    id: 'der-19', title: 'Importation', difficulty: 3, strategy: 'CD', premises: ['P → (Q → R)'], goal: '(P ∧ Q) → R', tags: ['CD', 'S'],
    hints: ['Assume the antecedent P ∧ Q.', 'Split the assumption with S, then use MP twice.'],
    solution: ['P → (Q → R) :: PR', 'Show (P ∧ Q) → R :: CD 7', '  P ∧ Q :: ASS CD', '  P :: S 3', '  Q → R :: MP 1 4', '  Q :: S 3', '  R :: MP 5 6'],
  },
  {
    id: 'der-20', title: 'Conditional from a disjunction', difficulty: 3, strategy: 'CD', premises: ['¬P ∨ Q'], goal: 'P → Q', tags: ['CD', 'DN', 'MTP'],
    hints: ['Assume P for CD.', 'MTP needs the negation of the disjunct ¬P, which is ¬¬P. Get it by DN.'],
    solution: ['¬P ∨ Q :: PR', 'Show P → Q :: CD 5', '  P :: ASS CD', '  ¬¬P :: DN 3', '  Q :: MTP 1 4'],
  },
  {
    id: 'der-21', title: 'Weakening', difficulty: 3, strategy: 'CD', premises: [], goal: 'P → (Q → P)', tags: ['CD', 'R', 'theorem'],
    hints: ['No premises: the whole proof happens inside Show boxes.', 'Assume P; then Show Q → P, assume Q and repeat P with R.'],
    solution: ['Show P → (Q → P) :: CD 3', '  P :: ASS CD', '  Show Q → P :: CD 5', '    Q :: ASS CD', '    P :: R 2'],
  },
  {
    id: 'der-22', title: 'Contraposition backwards', difficulty: 3, strategy: 'ID', premises: ['¬Q → ¬P', 'P'], goal: 'Q', tags: ['ID', 'MP'],
    hints: ['Goal is a letter; if nothing direct works, try ID: assume ¬Q.', 'From ¬Q the first premise gives ¬P, contradicting premise 2.'],
    solution: ['¬Q → ¬P :: PR', 'P :: PR', 'Show Q :: ID 6 5', '  ¬Q :: ASS ID', '  ¬P :: MP 1 4', '  P :: R 2'],
  },
  // ------------------------------------------------------------------ level 4
  {
    id: 'der-23', title: 'Proof by cases', difficulty: 4, strategy: 'ID', premises: ['P ∨ Q', 'P → R', 'Q → R'], goal: 'R', tags: ['ID', 'MT', 'MTP'],
    hints: ['Without SC, try ID: assume ¬R.', 'From ¬R, MT gives ¬P and ¬Q. Then MTP on premise 1 produces a contradiction.'],
    solution: ['P ∨ Q :: PR', 'P → R :: PR', 'Q → R :: PR', 'Show R :: ID 8 7', '  ¬R :: ASS ID', '  ¬P :: MT 2 5', '  ¬Q :: MT 3 5', '  Q :: MTP 1 6'],
  },
  {
    id: 'der-24', title: 'Distributing a conditional', difficulty: 4, strategy: 'CD', premises: ['(P → Q) ∧ (P → R)'], goal: 'P → (Q ∧ R)', tags: ['CD', 'S', 'ADJ'],
    hints: ['Assume P for CD; the target is Q ∧ R.', 'Split the premise into its two conditionals and use MP with each.'],
    solution: ['(P → Q) ∧ (P → R) :: PR', 'Show P → (Q ∧ R) :: CD 8', '  P :: ASS CD', '  P → Q :: S 1', '  P → R :: S 1', '  Q :: MP 4 3', '  R :: MP 5 3', '  Q ∧ R :: ADJ 6 7'],
  },
  {
    id: 'der-25', title: 'Conditional to biconditional', difficulty: 4, strategy: 'DD', premises: ['P → Q', '¬P → ¬Q'], goal: 'P ↔ Q', tags: ['CB', 'CD', 'DN', 'MT'],
    hints: ['To get a biconditional, use CB on two conditionals: P → Q (you have it) and Q → P.', 'Show Q → P by CD: assume Q, get ¬¬Q, then MT on premise 2 and DN.'],
    solution: ['P → Q :: PR', '¬P → ¬Q :: PR', 'Show P ↔ Q :: DD 9', '  Show Q → P :: CD 8', '    Q :: ASS CD', '    ¬¬Q :: DN 5', '    ¬¬P :: MT 2 6', '    P :: DN 7', '  P ↔ Q :: CB 1 4'],
  },
  {
    id: 'der-26', title: 'Biconditional chain', difficulty: 4, strategy: 'DD', premises: ['P ↔ Q', 'Q ↔ R'], goal: 'P ↔ R', tags: ['BC', 'CB', 'CD'],
    hints: ['Break both biconditionals into conditionals with BC.', 'Show P → R and R → P, each by CD, then combine with CB.'],
    solution: [
      'P ↔ Q :: PR', 'Q ↔ R :: PR', 'Show P ↔ R :: DD 16',
      '  P → Q :: BC 1', '  Q → P :: BC 1', '  Q → R :: BC 2', '  R → Q :: BC 2',
      '  Show P → R :: CD 11', '    P :: ASS CD', '    Q :: MP 4 9', '    R :: MP 6 10',
      '  Show R → P :: CD 15', '    R :: ASS CD', '    Q :: MP 7 13', '    P :: MP 5 14',
      '  P ↔ R :: CB 8 12',
    ],
  },
  {
    id: 'der-27', title: 'De Morgan: not both', difficulty: 4, strategy: 'ID', premises: ['¬P ∨ ¬Q'], goal: '¬(P ∧ Q)', tags: ['ID', 'DN', 'MTP'],
    hints: ['Goal is a negation: assume P ∧ Q.', 'From P get ¬¬P by DN; MTP on the premise then gives ¬Q, contradicting Q.'],
    solution: ['¬P ∨ ¬Q :: PR', 'Show ¬(P ∧ Q) :: ID 7 6', '  P ∧ Q :: ASS ID', '  P :: S 3', '  ¬¬P :: DN 4', '  ¬Q :: MTP 1 5', '  Q :: S 3'],
  },
  {
    id: 'der-28', title: 'Conditional as disjunction', difficulty: 4, strategy: 'ID', premises: ['P → Q'], goal: '¬P ∨ Q', tags: ['ID', 'ADD', 'nested'],
    hints: ['Disjunctions are hard to prove directly. Assume ¬(¬P ∨ Q) for ID.', 'Inside, Show ¬P by ID (assume P, get Q, then ¬P ∨ Q by ADD). Then ADD again for the contradiction.'],
    solution: [
      'P → Q :: PR',
      'Show ¬P ∨ Q :: ID 9 10', '  ¬(¬P ∨ Q) :: ASS ID',
      '  Show ¬P :: ID 7 8', '    P :: ASS ID', '    Q :: MP 1 5', '    ¬P ∨ Q :: ADD 6', '    ¬(¬P ∨ Q) :: R 3',
      '  ¬P ∨ Q :: ADD 4', '  ¬(¬P ∨ Q) :: R 3',
    ],
  },
  {
    id: 'der-29', title: 'Excluded middle', difficulty: 4, strategy: 'ID', premises: [], goal: 'P ∨ ¬P', tags: ['ID', 'ADD', 'theorem'],
    hints: ['No premises and a disjunction as the goal: assume ¬(P ∨ ¬P) for ID.', 'Inside, Show ¬P by ID: assuming P gives P ∨ ¬P by ADD. Then ¬P gives P ∨ ¬P by ADD too.'],
    solution: [
      'Show P ∨ ¬P :: ID 7 8', '  ¬(P ∨ ¬P) :: ASS ID',
      '  Show ¬P :: ID 5 6', '    P :: ASS ID', '    P ∨ ¬P :: ADD 4', '    ¬(P ∨ ¬P) :: R 2',
      '  P ∨ ¬P :: ADD 3', '  ¬(P ∨ ¬P) :: R 2',
    ],
  },
  {
    id: 'der-30', title: 'Disjunction in, conjunction out', difficulty: 4, strategy: 'DD', premises: ['(P ∨ Q) → R'], goal: '(P → R) ∧ (Q → R)', tags: ['CD', 'ADD', 'ADJ'],
    hints: ['A conjunction is shown by showing each conjunct and using ADJ.', 'Each conjunct is a conditional: CD, then ADD to reach the antecedent of the premise.'],
    solution: [
      '(P ∨ Q) → R :: PR', 'Show (P → R) ∧ (Q → R) :: DD 11',
      '  Show P → R :: CD 6', '    P :: ASS CD', '    P ∨ Q :: ADD 4', '    R :: MP 1 5',
      '  Show Q → R :: CD 10', '    Q :: ASS CD', '    P ∨ Q :: ADD 8', '    R :: MP 1 9',
      '  (P → R) ∧ (Q → R) :: ADJ 3 7',
    ],
  },
  // ------------------------------------------------------------------ level 5
  {
    id: 'der-31', title: 'Constructive dilemma', difficulty: 5, strategy: 'ID', premises: ['P ∨ Q', 'P → R', 'Q → S'], goal: 'R ∨ S', tags: ['ID', 'nested'],
    hints: ['Assume ¬(R ∨ S) for ID.', 'Inside, Show ¬R and Show ¬S (each by ID with ADD). Then MT and MTP give a contradiction.'],
    solution: [
      'P ∨ Q :: PR', 'P → R :: PR', 'Q → S :: PR',
      'Show R ∨ S :: ID 16 10', '  ¬(R ∨ S) :: ASS ID',
      '  Show ¬R :: ID 8 9', '    R :: ASS ID', '    R ∨ S :: ADD 7', '    ¬(R ∨ S) :: R 5',
      '  Show ¬S :: ID 12 13', '    S :: ASS ID', '    R ∨ S :: ADD 11', '    ¬(R ∨ S) :: R 5',
      '  ¬P :: MT 2 6', '  Q :: MTP 1 14', '  S :: MP 3 15',
    ],
  },
  {
    id: 'der-32', title: 'De Morgan: not both (converse)', difficulty: 5, strategy: 'ID', premises: ['¬(P ∧ Q)'], goal: '¬P ∨ ¬Q', tags: ['ID', 'nested'],
    hints: ['Assume ¬(¬P ∨ ¬Q) for ID.', 'Inside, Show P and Show Q (each by ID with ADD), then ADJ them to contradict the premise.'],
    solution: [
      '¬(P ∧ Q) :: PR', 'Show ¬P ∨ ¬Q :: ID 12 13', '  ¬(¬P ∨ ¬Q) :: ASS ID',
      '  Show P :: ID 6 7', '    ¬P :: ASS ID', '    ¬P ∨ ¬Q :: ADD 5', '    ¬(¬P ∨ ¬Q) :: R 3',
      '  Show Q :: ID 10 11', '    ¬Q :: ASS ID', '    ¬P ∨ ¬Q :: ADD 9', '    ¬(¬P ∨ ¬Q) :: R 3',
      '  P ∧ Q :: ADJ 4 8', '  ¬(P ∧ Q) :: R 1',
    ],
  },
  {
    id: 'der-33', title: 'Cases inside a conditional', difficulty: 5, strategy: 'CD', premises: ['P → (Q ∨ R)', 'Q → S', 'R → S'], goal: 'P → S', tags: ['CD', 'ID', 'nested'],
    hints: ['Assume P for CD; you get Q ∨ R.', 'To get S from Q ∨ R, Show S by ID: assume ¬S, then MT twice and MTP.'],
    solution: [
      'P → (Q ∨ R) :: PR', 'Q → S :: PR', 'R → S :: PR',
      'Show P → S :: CD 7', '  P :: ASS CD', '  Q ∨ R :: MP 1 5',
      '  Show S :: ID 10 11', '    ¬S :: ASS ID', '    ¬Q :: MT 2 8', '    R :: MTP 6 9', '    ¬R :: MT 3 8',
    ],
  },
  {
    id: 'der-34', title: 'Negated conditional', difficulty: 5, strategy: 'DD', premises: ['¬(P → Q)'], goal: 'P ∧ ¬Q', tags: ['ID', 'CD', 'nested'],
    hints: ['Show P and ¬Q separately, then ADJ.', 'For each, use ID and derive P → Q (by CD) inside, contradicting the premise.'],
    solution: [
      '¬(P → Q) :: PR', 'Show P ∧ ¬Q :: DD 18',
      '  Show P :: ID 5 11', '    ¬P :: ASS ID',
      '    Show P → Q :: CD 7', '      P :: ASS CD',
      '      Show Q :: ID 9 10', '        ¬Q :: ASS ID', '        P :: R 6', '        ¬P :: R 4',
      '    ¬(P → Q) :: R 1',
      '  Show ¬Q :: ID 14 17', '    Q :: ASS ID',
      '    Show P → Q :: CD 16', '      P :: ASS CD', '      Q :: R 13',
      '    ¬(P → Q) :: R 1',
      '  P ∧ ¬Q :: ADJ 3 12',
    ],
  },
  {
    id: 'der-35', title: "Peirce's law", difficulty: 5, strategy: 'CD', premises: [], goal: '((P → Q) → P) → P', tags: ['CD', 'ID', 'theorem', 'nested'],
    hints: ['Assume (P → Q) → P for CD, then Show P by ID.', 'With ¬P, MT gives ¬(P → Q). Now Show P → Q by CD (inside it, Show Q by ID using P and ¬P).'],
    solution: [
      'Show ((P → Q) → P) → P :: CD 3', '  (P → Q) → P :: ASS CD',
      '  Show P :: ID 6 5', '    ¬P :: ASS ID', '    ¬(P → Q) :: MT 2 4',
      '    Show P → Q :: CD 8', '      P :: ASS CD',
      '      Show Q :: ID 10 11', '        ¬Q :: ASS ID', '        P :: R 7', '        ¬P :: R 4',
    ],
  },
];

// ---------------------------------------------------------------------------
// Proof scripts
// ---------------------------------------------------------------------------

const ASS_RE = /^ASS\s+(CD|ID)$/;

/** Turn a compact proof script into an editor draft (throws on malformed scripts). */
export function parseProofScript(script: string[], goal?: string, idPrefix = 'l'): DerivationDraft {
  const lines: DraftLine[] = script.map((raw, i) => {
    const indent = raw.length - raw.trimStart().length;
    const depthBase = Math.floor(indent / 2);
    const [lhs, rhs = ''] = raw.trim().split('::').map((s) => s.trim());
    const id = `${idPrefix}${i + 1}`;
    const refs = (s: string) => s.split(/[\s,]+/).filter(Boolean).map(Number);
    if (lhs.startsWith('Show ')) {
      const [method, ...rest] = rhs.split(/\s+/);
      return { id, kind: 'show', text: lhs.slice(5).trim(), depth: depthBase, ...(method ? { close: { method: method as CloseMethod, refs: refs(rest.join(' ')) } } : {}) };
    }
    if (rhs === 'PR') return { id, kind: 'premise', text: lhs, depth: depthBase };
    const ass = ASS_RE.exec(rhs);
    if (ass) return { id, kind: 'assumption', text: lhs, depth: depthBase, assumption: ass[1] as 'CD' | 'ID' };
    const [rule, ...rest] = rhs.split(/\s+/);
    return { id, kind: 'step', text: lhs, depth: depthBase, rule: rule as RuleId, refs: refs(rest.join(' ')) };
  });
  return { goal, lines };
}

/** Render a draft as numbered text lines (for solutions / printing). */
export function formatDraft(d: DerivationDraft): string[] {
  return d.lines.map((l, i) => {
    const pad = '    '.repeat(l.depth);
    const just =
      l.kind === 'premise' ? 'PR'
      : l.kind === 'assumption' ? `ASS ${l.assumption}`
      : l.kind === 'show' ? (l.close ? `${l.close.method} ${l.close.refs.join(', ')}` : '')
      : `${l.rule} ${(l.refs ?? []).join(', ')}`;
    return `${String(i + 1).padStart(2)}.  ${pad}${l.kind === 'show' ? 'Show ' : ''}${l.text}    ${just}`.trimEnd();
  });
}

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

/**
 * Quantifier derivations (Logic 2010 style: UI, EG, EI, UD). No scripted
 * solutions: the model solution comes from the proof engine's prover.
 * Every problem has no countermodel up to 4 objects (derivations.test.ts).
 */
const QUANTIFIER_PROBLEMS: Problem[] = [
  { id: 'qder-01', title: 'Universal instantiation', difficulty: 1, strategy: 'DD', premises: ['∀x(Fx → Gx)', 'Fa'], goal: 'Ga', tags: ['UI', 'MP'], hints: ['Instantiate the universal premise to the name a with UI.', 'UI on line 1 gives Fa → Ga; then MP.'], solution: [] },
  { id: 'qder-02', title: 'Chain of universals', difficulty: 1, strategy: 'DD', premises: ['∀x(Fx → Gx)', '∀x(Gx → Hx)', 'Fa'], goal: 'Ha', tags: ['UI', 'MP'], hints: ['Instantiate both universals to a.', 'Then MP twice.'], solution: [] },
  { id: 'qder-03', title: 'Existential generalization', difficulty: 1, strategy: 'DD', premises: ['Fa'], goal: '∃xFx', tags: ['EG'], hints: ['EG: from an instance, infer the existential.', 'From Fa you may write ∃xFx.'], solution: [] },
  { id: 'qder-04', title: 'All to some', difficulty: 2, strategy: 'DD', premises: ['∀xFx'], goal: '∃xFx', tags: ['UI', 'EG'], hints: ['Instantiate the universal to any term, then generalize existentially.', 'UI gives an instance such as Fy; EG then gives ∃xFx.'], solution: [] },
  { id: 'qder-05', title: 'Universal derivation', difficulty: 2, strategy: 'UD', premises: ['∀x(Fx ∧ Gx)'], goal: '∀xFx', tags: ['UI', 'UD', 'S'], hints: ['The goal is universal: Show Fx for an arbitrary x, then close with UD.', 'UI gives Fx ∧ Gx; S gives Fx.'], solution: [] },
  { id: 'qder-06', title: 'Distributing over →', difficulty: 2, strategy: 'UD', premises: ['∀x(Fx → Gx)', '∀xFx'], goal: '∀xGx', tags: ['UI', 'UD', 'MP'], hints: ['Show Gx for arbitrary x and close with UD.', 'Instantiate both premises to x, then MP.'], solution: [] },
  { id: 'qder-07', title: 'Existential instantiation', difficulty: 2, strategy: 'DD', premises: ['∃x(Fx ∧ Gx)'], goal: '∃xFx', tags: ['EI', 'EG', 'S'], hints: ['EI: instantiate the existential to a NEW variable.', 'EI gives Fy ∧ Gy (y new); S gives Fy; EG gives ∃xFx.'], solution: [] },
  { id: 'qder-08', title: 'Some F, so some G', difficulty: 3, strategy: 'DD', premises: ['∀x(Fx → Gx)', '∃xFx'], goal: '∃xGx', tags: ['EI', 'UI', 'EG'], hints: ['Do EI first, to a new variable — UI can then use that same variable.', 'EI gives Fz (z new); UI to z gives Fz → Gz; MP gives Gz; EG gives ∃xGx.'], solution: [] },
  { id: 'qder-09', title: 'Universal syllogism', difficulty: 3, strategy: 'UD', premises: ['∀x(Fx → Gx)', '∀x(Gx → Hx)'], goal: '∀x(Fx → Hx)', tags: ['UD', 'CD', 'UI'], hints: ['Show Fx → Hx for arbitrary x (UD), inside it use CD.', 'Instantiate both premises to x and chain them.'], solution: [] },
  { id: 'qder-10', title: 'Contraposition under ∀', difficulty: 3, strategy: 'UD', premises: ['∀x(Fx → Gx)'], goal: '∀x(¬Gx → ¬Fx)', tags: ['UD', 'CD', 'MT'], hints: ['UD on the goal; CD inside.', 'Assume ¬Gx; UI gives Fx → Gx; MT.'], solution: [] },
  { id: 'qder-11', title: 'Diagonal', difficulty: 3, strategy: 'UD', premises: ['∀x∀yRxy'], goal: '∀xRxx', tags: ['UI', 'UD'], hints: ['UI can instantiate both quantifiers to the same variable.', 'UI twice gives Rxx; close with UD.'], solution: [] },
  { id: 'qder-12', title: 'Instantiating to a name', difficulty: 3, strategy: 'DD', premises: ['∀x(Fx → ∃yRxy)', 'Fa'], goal: '∃yRay', tags: ['UI', 'MP'], strategyHint: 'Your goal ∃yRay is existential, but you do not need EG here: it is the consequent of an instance of premise 1.', hints: ['UI to the name a: Fa → ∃yRay.', 'MP with premise 2 gives ∃yRay directly.'], solution: [] },
  { id: 'qder-13', title: 'Nothing is F, so everything is not F', difficulty: 3, strategy: 'UD', premises: ['¬∃xFx'], goal: '∀x¬Fx', tags: ['UD', 'ID', 'EG'], hints: ['Show ¬Fx for arbitrary x (UD), by ID.', 'Assume Fx; EG gives ∃xFx, contradicting the premise.'], solution: [] },
  { id: 'qder-14', title: 'Everything is not F, so nothing is F', difficulty: 3, strategy: 'ID', premises: ['∀x¬Fx'], goal: '¬∃xFx', tags: ['ID', 'EI', 'UI'], hints: ['Goal is a negation: assume ∃xFx for ID.', 'EI gives Fz (z new); UI to z gives ¬Fz — a contradiction.'], solution: [] },
  { id: 'qder-15', title: 'Exists-forall to forall-exists', difficulty: 4, strategy: 'UD', premises: ['∃x∀yRxy'], goal: '∀y∃xRxy', tags: ['EI', 'UI', 'EG', 'UD'], hints: ['EI first (to a new variable), then Show ∃xRxy for arbitrary y and close with UD.', 'EI gives ∀yRzy (z new); UI to y gives Rzy; EG gives ∃xRxy.'], solution: [] },
  { id: 'qder-16', title: 'Disjunction of universals', difficulty: 4, strategy: 'UD', premises: ['∀xFx ∨ ∀xGx'], goal: '∀x(Fx ∨ Gx)', tags: ['UD', 'ID'], hints: ['UD on the goal; inside, Show Fx ∨ Gx by ID, assuming ¬(Fx ∨ Gx).', 'Show ¬Fx and ¬Gx (each by ID with ADD). Then Show ¬∀xFx; MTP on the premise gives ∀xGx, whose instance Gx contradicts ¬Gx.'], solution: [] },
  { id: 'qder-17', title: 'Existential over ∨', difficulty: 4, strategy: 'ID', premises: ['∃x(Fx ∨ Gx)'], goal: '∃xFx ∨ ∃xGx', tags: ['EI', 'EG', 'ID'], hints: ['Assume the negation of the goal for ID, and EI the premise: Fy ∨ Gy (y new).', 'Show ¬∃xFx and ¬∃xGx (ID with ADD), then ¬Fy and ¬Gy (ID with EG); MTP on Fy ∨ Gy gives the contradiction.'], solution: [] },
  { id: 'qder-18', title: 'Not all, so some not', difficulty: 5, strategy: 'ID', premises: ['¬∀xFx'], goal: '∃x¬Fx', tags: ['ID', 'UD', 'EG'], hints: ['Assume ¬∃x¬Fx for ID and aim to derive ∀xFx.', 'Show ∀xFx by UD: Show Fx by ID — assuming ¬Fx gives ∃x¬Fx by EG.'], solution: [] },
];

function toExercise(p: Problem, topic: DerivationExercise['topic'] = 'derivation'): DerivationExercise {
  const prem = p.premises.length ? `from ${p.premises.join(',  ')}` : 'with no premises (it is a theorem)';
  return {
    id: p.id,
    kind: 'derivation',
    topic,
    difficulty: p.difficulty,
    title: p.title,
    prompt: `Derive ${p.goal} ${prem}.`,
    tags: p.tags ?? [],
    source: 'bank',
    premises: [...p.premises],
    goal: p.goal,
    strategy: p.strategy,
    allowDerivedRules: p.derived ?? false,
    hints: [...p.hints],
    ...(p.strategyHint ? { strategyHint: p.strategyHint } : {}),
    solution: [...p.solution],
  };
}

/** Curated problems, easiest first. */
export const DERIVATION_EXERCISES: DerivationExercise[] = PROBLEMS.map((p) => toExercise(p));

/** Curated quantifier problems (topic 'quantifier-derivation'), easiest first. */
export const QUANTIFIER_DERIVATION_EXERCISES: DerivationExercise[] = QUANTIFIER_PROBLEMS.map((p) =>
  toExercise({ ...p, premises: p.premises.map((x) => format(f(x))), goal: format(f(p.goal)) }, 'quantifier-derivation'),
);

const solvedCache = new Map<string, DraftLine[] | null>();
/** Proof-engine solution for problems without a scripted one (cached). */
function solvedLines(ex: DerivationExercise): DraftLine[] | null {
  if (!solvedCache.has(ex.id)) {
    let lines: DraftLine[] | null = null;
    try {
      lines = solve(ex.premises.map(f), f(ex.goal));
    } catch {
      lines = null;
    }
    solvedCache.set(ex.id, lines);
  }
  return solvedCache.get(ex.id)!;
}

/** A fresh draft for the editor: premise lines plus the opening Show line. */
export function createDerivationDraft(ex: DerivationExercise): DerivationDraft {
  const lines: DraftLine[] = ex.premises.map((p, i) => ({ id: `${ex.id}-pr${i + 1}`, kind: 'premise', text: p, depth: 0 }));
  lines.push({ id: `${ex.id}-show`, kind: 'show', text: ex.goal, depth: 0 });
  return { goal: ex.goal, lines, allowDerivedRules: ex.allowDerivedRules };
}

/** The model solution as an editor draft. */
export function derivationSolutionDraft(ex: DerivationExercise): DerivationDraft | null {
  if (ex.solution.length) return { ...parseProofScript(ex.solution, ex.goal, `${ex.id}-s`), allowDerivedRules: ex.allowDerivedRules };
  const lines = solvedLines(ex);
  return lines ? { goal: ex.goal, lines: lines.map((l, i) => ({ ...l, id: `${ex.id}-s${i + 1}` })), allowDerivedRules: ex.allowDerivedRules } : null;
}

const STRATEGY_HINT: Record<string, string> = {
  implies: 'Your goal is a conditional: try Conditional Derivation (CD) — assume the antecedent (ASS CD) and aim for the consequent.',
  not: 'Your goal is a negation: try Indirect Derivation (ID) — assume the formula without its ¬ (ASS ID) and aim for a contradiction.',
  iff: 'Your goal is a biconditional: prove both conditionals (often each by CD) and combine them with CB.',
  and: 'Your goal is a conjunction: get each conjunct on its own line, then use ADJ.',
  or: 'Your goal is a disjunction: if you can get one disjunct, use ADD; otherwise try ID, assuming the negation of the whole disjunction.',
  atom: 'Your goal is a sentence letter: see if MP, MTP or S can produce it directly from the premises; if not, try ID (assume its negation).',
  pred: 'Your goal is a single predication: instantiate the universal premises to its terms with UI, then use the sentential rules; if that stalls, try ID.',
  forall: 'Your goal is universal: use Universal Derivation (UD) — Show the formula for an arbitrary variable (one not free in any open assumption or premise) and close with UD.',
  exists: 'Your goal is existential: derive an instance of it (with a name or variable) and use EG. If a premise is existential, EI it first, to a new variable.',
};

export function derivationHints(ex: DerivationExercise): string[] {
  const goal = f(ex.goal);
  const hints = [ex.strategyHint ?? STRATEGY_HINT[goal.kind], ...ex.hints];
  const model = derivationSolutionDraft(ex);
  if (!model) return hints;
  const outline = model.lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.kind === 'show' || l.kind === 'assumption')
    .map(({ l, i }) => `${i + 1}. ${'  '.repeat(l.depth)}${l.kind === 'show' ? `Show ${l.text}` : `${l.text}  ASS ${l.assumption}`}`);
  hints.push(`Outline (Show lines and assumptions only):\n${outline.join('\n')}`);
  return hints;
}

export function derivationSolution(ex: DerivationExercise): Solution {
  const draft = derivationSolutionDraft(ex);
  if (!draft) {
    return { answer: ex.goal, summary: `No worked derivation is available for ${ex.goal} yet. Hints: ${ex.hints.join(' ')}`, steps: ex.hints };
  }
  return {
    answer: ex.goal,
    summary: `A complete derivation of ${ex.goal} (strategy: ${ex.strategy}).`,
    steps: formatDraft(draft),
    derivation: draft,
  };
}

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

function sameFormula(a: string, b: string): boolean {
  const pa = parse(a);
  const pb = parse(b);
  return pa.ok && pb.ok && equals(pa.formula, pb.formula);
}

export function checkDerivationAnswer(ex: DerivationExercise, draft: DerivationDraft): Feedback {
  // Premise lines must be exactly the exercise's premises.
  const premLines = draft.lines.map((l, i) => ({ l, n: i + 1 })).filter(({ l }) => l.kind === 'premise');
  const extra = premLines.filter(({ l }) => !ex.premises.some((p) => sameFormula(p, l.text)));
  if (extra.length) {
    return {
      correct: false,
      severity: 'error',
      code: 'extra-premise',
      headline: `Line ${extra[0].n} is not one of the given premises.`,
      explanation: `You may only use the premises the problem gives you: ${ex.premises.join(', ') || 'none — this is a theorem'}. Anything else must be derived or assumed inside a Show box.`,
    };
  }
  let check: DerivationCheck;
  try {
    check = checkDerivation({ ...draft, goal: ex.goal, allowDerivedRules: draft.allowDerivedRules ?? ex.allowDerivedRules });
  } catch {
    return { correct: false, severity: 'warning', code: 'checker-unavailable', headline: 'The derivation checker is not available right now.', explanation: 'Your work is saved; try checking again later.' };
  }
  if (check.complete) {
    return { correct: true, severity: 'success', code: 'correct', headline: `Complete — you derived ${ex.goal}.`, explanation: check.summary };
  }
  const errors = check.lines.filter((l) => l.issues.some((i) => i.severity === 'error'));
  if (check.valid && !errors.length) {
    return {
      correct: false,
      partial: true,
      severity: 'warning',
      code: 'incomplete',
      headline: 'No mistakes so far — but the derivation is not finished.',
      explanation: check.summary,
      details: check.globalIssues.map((i) => i.message),
    };
  }
  const details: string[] = [];
  for (const l of errors.slice(0, 3)) for (const i of l.issues.filter((x) => x.severity === 'error')) details.push(`${/^Line \d+/.test(i.message) ? '' : `Line ${l.number}: `}${i.message}${i.suggestion ? ` ${i.suggestion}` : ''}`);
  details.push(...check.globalIssues.filter((i) => i.severity === 'error').map((i) => i.message));
  return {
    correct: false,
    severity: 'error',
    code: 'errors',
    headline: errors.length ? `Line ${errors[0].number} has a problem.` : 'The derivation has a problem.',
    explanation: check.summary,
    details,
  };
}
