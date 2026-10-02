/**
 * Curated symbolization bank + the clause vocabulary shared with the
 * template generator.
 *
 * Every item's `answer` and `alternatives` must parse and be truth-functionally
 * equivalent (enforced by symbolization.test.ts).
 *
 * OWNER: Learning System.
 */
import type { Difficulty, SymbolKeyEntry } from './types';

/** Simple clauses, one per sentence letter, for the generator and the bank. */
export const VOCABULARY: Record<string, SymbolKeyEntry> = Object.fromEntries(
  (
    [
      ['A', 'Alice attends the meeting', 'Alice does not attend the meeting'],
      ['B', 'Bob attends the meeting', 'Bob does not attend the meeting'],
      ['C', 'the car starts', 'the car does not start'],
      ['D', 'the dog barks', 'the dog does not bark'],
      ['E', 'Eve studies', 'Eve does not study'],
      ['F', 'the flight is delayed', 'the flight is not delayed'],
      ['G', 'the game is cancelled', 'the game is not cancelled'],
      ['H', 'Hal is hungry', 'Hal is not hungry'],
      ['I', 'interest rates rise', 'interest rates do not rise'],
      ['J', 'Jo passes the exam', 'Jo does not pass the exam'],
      ['K', 'the kettle boils', 'the kettle does not boil'],
      ['L', 'the lights are on', 'the lights are not on'],
      ['M', 'Mia sings', 'Mia does not sing'],
      ['N', 'it snows', 'it does not snow'],
      ['O', 'the office is open', 'the office is not open'],
      ['P', 'the price falls', 'the price does not fall'],
      ['Q', 'the queue is long', 'the queue is not long'],
      ['R', 'it rains', 'it does not rain'],
      ['S', 'the sun shines', 'the sun does not shine'],
      ['T', 'the team wins', 'the team does not win'],
      ['U', 'the university closes', 'the university does not close'],
      ['V', 'Vera votes', 'Vera does not vote'],
      ['W', 'the ground is wet', 'the ground is not wet'],
      ['X', 'the experiment succeeds', 'the experiment does not succeed'],
      ['Y', 'Yuki cooks dinner', 'Yuki does not cook dinner'],
      ['Z', 'the zoo is open', 'the zoo is not open'],
    ] as const
  ).map(([letter, meaning, negation]) => [letter, { letter, meaning, negation }]),
);

export interface SymbolizationBankItem {
  id: string;
  difficulty: Difficulty;
  sentence: string;
  /** Vocabulary letters, or custom [letter, meaning, negation] entries. */
  key: (string | [string, string, string])[];
  answer: string;
  alternatives?: string[];
  tags: string[];
  /** Why; shown with the solution. */
  explanation: string;
}

const JO: [string, string, string][] = [
  ['J', 'Jo passes the exam', 'Jo does not pass the exam'],
  ['S', 'Jo studies', 'Jo does not study'],
];

export const SYMBOLIZATION_BANK: SymbolizationBankItem[] = [
  // ------------------------------------------------------------ difficulty 1
  { id: 'sym-001', difficulty: 1, sentence: 'It rains.', key: ['R'], answer: 'R', tags: ['simple'], explanation: 'A simple sentence is symbolized by its sentence letter alone.' },
  { id: 'sym-002', difficulty: 1, sentence: 'It does not rain.', key: ['R'], answer: '¬R', tags: ['negation'], explanation: '"does not" denies the simple sentence "it rains", so put ¬ in front of R.' },
  { id: 'sym-003', difficulty: 1, sentence: 'It is not the case that the ground is wet.', key: ['W'], answer: '¬W', tags: ['negation'], explanation: '"It is not the case that" is the most explicit way of saying ¬.' },
  { id: 'sym-004', difficulty: 1, sentence: "The ground isn't wet.", key: ['W'], answer: '¬W', tags: ['negation'], explanation: '"isn\'t" is a negation hidden inside the verb: ¬W.' },
  { id: 'sym-005', difficulty: 1, sentence: 'It rains and the ground is wet.', key: ['R', 'W'], answer: 'R ∧ W', tags: ['conjunction'], explanation: '"and" joins two complete sentences: a conjunction.' },
  { id: 'sym-006', difficulty: 1, sentence: 'Alice attends the meeting or Bob attends the meeting.', key: ['A', 'B'], answer: 'A ∨ B', tags: ['disjunction'], explanation: '"or" is disjunction, read inclusively.' },
  { id: 'sym-007', difficulty: 1, sentence: 'If it rains, then the ground is wet.', key: ['R', 'W'], answer: 'R → W', tags: ['conditional'], explanation: 'The "if" clause is the antecedent, the "then" clause the consequent.' },
  { id: 'sym-008', difficulty: 1, sentence: 'The sun shines and it does not rain.', key: ['S', 'R'], answer: 'S ∧ ¬R', tags: ['conjunction', 'negation'], explanation: 'A conjunction whose second conjunct is a negation.' },
  { id: 'sym-009', difficulty: 1, sentence: 'Either the car starts or the dog barks.', key: ['C', 'D'], answer: 'C ∨ D', tags: ['disjunction'], explanation: '"Either … or" is disjunction; "either" only marks where the first disjunct begins.' },
  { id: 'sym-010', difficulty: 1, sentence: 'If the team wins, then Mia sings.', key: ['T', 'M'], answer: 'T → M', tags: ['conditional'], explanation: 'Antecedent: the team wins. Consequent: Mia sings.' },
  { id: 'sym-011', difficulty: 1, sentence: 'Alice and Bob both attend the meeting.', key: ['A', 'B'], answer: 'A ∧ B', tags: ['conjunction'], explanation: 'A compound subject ("Alice and Bob") abbreviates two sentences joined by "and".' },
  { id: 'sym-012', difficulty: 1, sentence: 'It is not the case that the team wins.', key: ['T'], answer: '¬T', tags: ['negation'], explanation: '"It is not the case that" → ¬.' },

  // ------------------------------------------------------------ difficulty 2
  { id: 'sym-013', difficulty: 2, sentence: 'The flight is delayed, but the game is not cancelled.', key: ['F', 'G'], answer: 'F ∧ ¬G', tags: ['conjunction', 'negation'], explanation: '"but" asserts both parts, so it is ∧; the contrast it suggests is not truth-functional.' },
  { id: 'sym-014', difficulty: 2, sentence: 'Although it rains, the sun shines.', key: ['R', 'S'], answer: 'R ∧ S', tags: ['conjunction'], explanation: '"Although P, Q" asserts both P and Q: a conjunction.' },
  { id: 'sym-015', difficulty: 2, sentence: 'The price falls; however, the queue is long.', key: ['P', 'Q'], answer: 'P ∧ Q', tags: ['conjunction'], explanation: '"however" works like "but": both sentences are asserted.' },
  { id: 'sym-016', difficulty: 2, sentence: 'The ground is wet if it rains.', key: ['W', 'R'], answer: 'R → W', tags: ['conditional', 'if-after'], explanation: '"if" introduces the antecedent even when it comes second: "Q if P" is P → Q.' },
  { id: 'sym-017', difficulty: 2, sentence: 'Whenever it rains, the ground is wet.', key: ['R', 'W'], answer: 'R → W', tags: ['conditional', 'whenever'], explanation: '"Whenever P, Q" means "if P, then Q".' },
  { id: 'sym-018', difficulty: 2, sentence: 'The kettle boils provided that the lights are on.', key: ['K', 'L'], answer: 'L → K', tags: ['conditional', 'provided-that'], explanation: '"provided that" means "if", so it introduces the antecedent: L → K.' },
  { id: 'sym-019', difficulty: 2, sentence: 'If the car does not start, then Bob does not attend the meeting.', key: ['C', 'B'], answer: '¬C → ¬B', tags: ['conditional', 'negation'], explanation: 'Both the antecedent and the consequent are negations.' },
  { id: 'sym-020', difficulty: 2, sentence: "Hal is hungry and Ned doesn't dance.", key: ['H', ['N', 'Ned dances', 'Ned does not dance']], answer: 'H ∧ ¬N', tags: ['conjunction', 'negation'], explanation: 'A conjunction whose right conjunct is negated.' },
  { id: 'sym-021', difficulty: 2, sentence: 'The team wins if Mia sings.', key: ['T', 'M'], answer: 'M → T', tags: ['conditional', 'if-after'], explanation: '"Q if P" is P → Q: the clause after "if" is the antecedent.' },
  { id: 'sym-022', difficulty: 2, sentence: 'Vera votes, or it rains.', key: ['V', 'R'], answer: 'V ∨ R', tags: ['disjunction'], explanation: 'A plain disjunction.' },
  { id: 'sym-023', difficulty: 2, sentence: 'If it rains, the game is cancelled.', key: ['R', 'G'], answer: 'R → G', tags: ['conditional'], explanation: '"then" is often left out; it is still a conditional.' },
  { id: 'sym-024', difficulty: 2, sentence: 'Both the kettle boils and the lights are on.', key: ['K', 'L'], answer: 'K ∧ L', tags: ['conjunction'], explanation: '"Both … and" is conjunction.' },
  { id: 'sym-025', difficulty: 2, sentence: 'It rains, and it is not the case that the ground is wet.', key: ['R', 'W'], answer: 'R ∧ ¬W', tags: ['conjunction', 'negation'], explanation: 'The negation covers only the second clause.' },
  { id: 'sym-026', difficulty: 2, sentence: 'Either the office is open or the zoo is not open.', key: ['O', 'Z'], answer: 'O ∨ ¬Z', tags: ['disjunction', 'negation'], explanation: 'A disjunction whose second disjunct is negated.' },

  // ------------------------------------------------------------ difficulty 3
  { id: 'sym-027', difficulty: 3, sentence: 'Jo passes the exam only if she studies.', key: JO, answer: 'J → S', tags: ['only-if'], explanation: '"P only if Q" is P → Q: "only if" introduces the consequent (a necessary condition). Passing requires studying; studying does not guarantee passing.' },
  { id: 'sym-028', difficulty: 3, sentence: 'The car starts only if the battery is charged.', key: ['C', ['B', 'the battery is charged', 'the battery is not charged']], answer: 'C → B', tags: ['only-if'], explanation: 'A charged battery is necessary for starting, so it is the consequent: C → B.' },
  { id: 'sym-029', difficulty: 3, sentence: 'The ground is wet unless the sun shines.', key: ['W', 'S'], answer: 'W ∨ S', alternatives: ['¬S → W'], tags: ['unless'], explanation: '"P unless Q" is P ∨ Q, equivalently ¬Q → P: if the sun does not shine, the ground is wet.' },
  { id: 'sym-030', difficulty: 3, sentence: 'Unless it rains, the game is not cancelled.', key: ['R', 'G'], answer: '¬G ∨ R', alternatives: ['¬R → ¬G'], tags: ['unless', 'negation'], explanation: '"Unless Q, P" is P ∨ Q. Here P is "the game is not cancelled".' },
  { id: 'sym-031', difficulty: 3, sentence: 'Jo studying is a necessary condition for Jo passing the exam.', key: JO, answer: 'J → S', tags: ['necessary'], explanation: 'A necessary condition is the consequent: if Jo passes, she must have studied.' },
  { id: 'sym-032', difficulty: 3, sentence: 'It raining is a sufficient condition for the ground being wet.', key: ['R', 'W'], answer: 'R → W', tags: ['sufficient'], explanation: 'A sufficient condition is the antecedent: rain is enough to guarantee a wet ground.' },
  { id: 'sym-033', difficulty: 3, sentence: 'The office is open if and only if the lights are on.', key: ['O', 'L'], answer: 'O ↔ L', alternatives: ['(O → L) ∧ (L → O)'], tags: ['biconditional'], explanation: '"if and only if" combines "if" and "only if": a biconditional.' },
  { id: 'sym-034', difficulty: 3, sentence: 'The game is cancelled just in case it rains.', key: ['G', 'R'], answer: 'G ↔ R', tags: ['biconditional'], explanation: '"just in case" is the logician\'s "if and only if".' },
  { id: 'sym-035', difficulty: 3, sentence: 'The kettle boils exactly when the lights are on.', key: ['K', 'L'], answer: 'K ↔ L', tags: ['biconditional'], explanation: '"exactly when" means the two always have the same truth value: ↔.' },
  { id: 'sym-036', difficulty: 3, sentence: 'Neither Alice nor Bob attends the meeting.', key: ['A', 'B'], answer: '¬A ∧ ¬B', alternatives: ['¬(A ∨ B)'], tags: ['neither-nor'], explanation: '"Neither P nor Q" says both are false: ¬P ∧ ¬Q, equivalently ¬(P ∨ Q).' },
  { id: 'sym-037', difficulty: 3, sentence: 'Alice and Bob do not both attend the meeting.', key: ['A', 'B'], answer: '¬(A ∧ B)', alternatives: ['¬A ∨ ¬B'], tags: ['not-both'], explanation: '"Not both" denies the conjunction: ¬(A ∧ B). At least one of them stays away.' },
  { id: 'sym-038', difficulty: 3, sentence: 'It is not the case that both the car starts and the dog barks.', key: ['C', 'D'], answer: '¬(C ∧ D)', alternatives: ['¬C ∨ ¬D'], tags: ['not-both'], explanation: 'The negation governs the whole "both … and" conjunction.' },
  { id: 'sym-039', difficulty: 3, sentence: 'It neither rains nor snows.', key: ['R', 'N'], answer: '¬R ∧ ¬N', alternatives: ['¬(R ∨ N)'], tags: ['neither-nor'], explanation: '"neither … nor" → both negated and conjoined.' },
  { id: 'sym-040', difficulty: 3, sentence: 'The team wins only if Mia does not sing.', key: ['T', 'M'], answer: 'T → ¬M', tags: ['only-if', 'negation'], explanation: '"only if" introduces the consequent, which here is a negation.' },
  { id: 'sym-041', difficulty: 3, sentence: 'Only if the price falls is the queue long.', key: ['P', 'Q'], answer: 'Q → P', tags: ['only-if'], explanation: '"Only if P, Q" is Q → P: the "only if" clause is still the consequent even at the front.' },
  { id: 'sym-042', difficulty: 3, sentence: 'Vera votes unless it rains.', key: ['V', 'R'], answer: 'V ∨ R', alternatives: ['¬R → V'], tags: ['unless'], explanation: '"P unless Q" is P ∨ Q: if it does not rain, Vera votes.' },

  // ------------------------------------------------------------ difficulty 4
  { id: 'sym-043', difficulty: 4, sentence: 'The flight is delayed if it snows, and only if it snows.', key: ['F', 'N'], answer: 'F ↔ N', alternatives: ['(N → F) ∧ (F → N)'], tags: ['biconditional', 'if-after', 'only-if'], explanation: '"if it snows" gives N → F; "only if it snows" gives F → N. Together: F ↔ N.' },
  { id: 'sym-044', difficulty: 4, sentence: 'If Alice and Bob both attend the meeting, then the office is open.', key: ['A', 'B', 'O'], answer: '(A ∧ B) → O', tags: ['nested', 'conditional'], explanation: 'The antecedent is itself a conjunction.' },
  { id: 'sym-045', difficulty: 4, sentence: 'If it rains, then either the game is cancelled or the flight is delayed.', key: ['R', 'G', 'F'], answer: 'R → (G ∨ F)', tags: ['nested', 'conditional'], explanation: 'The consequent is a disjunction; "either" marks where it begins.' },
  { id: 'sym-046', difficulty: 4, sentence: 'Alice attends the meeting only if Bob attends and the car starts.', key: ['A', 'B', 'C'], answer: 'A → (B ∧ C)', tags: ['nested', 'only-if'], explanation: 'Everything after "only if" is the consequent: B ∧ C.' },
  { id: 'sym-047', difficulty: 4, sentence: 'If neither Alice nor Bob attends the meeting, then the office is not open.', key: ['A', 'B', 'O'], answer: '(¬A ∧ ¬B) → ¬O', alternatives: ['¬(A ∨ B) → ¬O'], tags: ['nested', 'neither-nor', 'conditional'], explanation: 'The antecedent is a "neither … nor": ¬A ∧ ¬B.' },
  { id: 'sym-048', difficulty: 4, sentence: 'The game is cancelled if it rains or snows.', key: ['G', 'R', 'N'], answer: '(R ∨ N) → G', tags: ['nested', 'if-after'], explanation: '"Q if P" with P = "it rains or it snows".' },
  { id: 'sym-049', difficulty: 4, sentence: 'It is not the case that if it rains, the ground is wet.', key: ['R', 'W'], answer: '¬(R → W)', tags: ['negation-scope', 'conditional'], explanation: 'The negation covers the whole conditional. (This says it rains and the ground is not wet.)' },
  { id: 'sym-050', difficulty: 4, sentence: 'If the team does not win, then neither Mia sings nor Ned dances.', key: ['T', 'M', ['N', 'Ned dances', 'Ned does not dance']], answer: '¬T → (¬M ∧ ¬N)', alternatives: ['¬T → ¬(M ∨ N)'], tags: ['nested', 'neither-nor', 'conditional'], explanation: 'A conditional whose consequent is a "neither … nor".' },
  { id: 'sym-051', difficulty: 4, sentence: 'The kettle boils if and only if the lights are on and the office is open.', key: ['K', 'L', 'O'], answer: 'K ↔ (L ∧ O)', tags: ['nested', 'biconditional'], explanation: 'One side of the biconditional is a conjunction.' },
  { id: 'sym-052', difficulty: 4, sentence: 'Either the car starts or the dog barks, but not both.', key: ['C', 'D'], answer: '(C ∨ D) ∧ ¬(C ∧ D)', alternatives: ['¬(C ↔ D)'], tags: ['nested', 'exclusive', 'not-both'], explanation: '"but not both" adds a second conjunct denying that both are true (exclusive or).' },
  { id: 'sym-053', difficulty: 4, sentence: 'Unless the flight is delayed, Alice and Bob both attend the meeting.', key: ['F', 'A', 'B'], answer: '(A ∧ B) ∨ F', alternatives: ['¬F → (A ∧ B)'], tags: ['nested', 'unless'], explanation: '"Unless Q, P" is P ∨ Q with P = A ∧ B.' },
  { id: 'sym-054', difficulty: 4, sentence: "The sun's shining is necessary and sufficient for the zoo's being open.", key: ['S', 'Z'], answer: 'Z ↔ S', alternatives: ['(S → Z) ∧ (Z → S)'], tags: ['biconditional', 'necessary', 'sufficient'], explanation: 'Sufficient: S → Z. Necessary: Z → S. Both: Z ↔ S.' },
  { id: 'sym-055', difficulty: 4, sentence: 'If it rains, the ground is wet; and if the ground is wet, the game is cancelled.', key: ['R', 'W', 'G'], answer: '(R → W) ∧ (W → G)', tags: ['nested', 'conjunction', 'conditional'], explanation: 'The main connective is the "and" joining two conditionals.' },

  // ------------------------------------------------------------ difficulty 5
  { id: 'sym-056', difficulty: 5, sentence: 'If it rains and it is cold, then the game is cancelled unless the team forfeits.', key: ['R', ['C', 'it is cold', 'it is not cold'], 'G', ['T', 'the team forfeits', 'the team does not forfeit']], answer: '(R ∧ C) → (G ∨ T)', tags: ['nested', 'conditional', 'unless'], explanation: 'Main connective: the conditional. Antecedent R ∧ C; consequent "G unless T" = G ∨ T.' },
  { id: 'sym-057', difficulty: 5, sentence: 'Provided that it is not freezing, the car starts only if the battery is charged.', key: [['F', 'it is freezing', 'it is not freezing'], 'C', ['B', 'the battery is charged', 'the battery is not charged']], answer: '¬F → (C → B)', alternatives: ['(¬F ∧ C) → B'], tags: ['nested', 'provided-that', 'only-if'], explanation: '"Provided that ¬F, X" is ¬F → X, and X = "C only if B" = C → B.' },
  { id: 'sym-058', difficulty: 5, sentence: 'Neither Alice nor Bob attends the meeting unless the office is open.', key: ['A', 'B', 'O'], answer: '(¬A ∧ ¬B) ∨ O', alternatives: ['¬O → (¬A ∧ ¬B)', '¬(A ∨ B) ∨ O'], tags: ['nested', 'neither-nor', 'unless'], explanation: '"P unless Q" with P = "neither A nor B" = ¬A ∧ ¬B.' },
  { id: 'sym-059', difficulty: 5, sentence: 'If Mia sings only if Ned dances, then the team wins.', key: ['M', ['N', 'Ned dances', 'Ned does not dance'], 'T'], answer: '(M → N) → T', tags: ['nested', 'only-if', 'conditional'], explanation: 'The antecedent is itself a conditional: "M only if N" = M → N.' },
  { id: 'sym-060', difficulty: 5, sentence: 'It is not the case that the flight is delayed if and only if it snows.', key: ['F', 'N'], answer: '¬(F ↔ N)', alternatives: ['F ↔ ¬N'], tags: ['negation-scope', 'biconditional'], explanation: 'Read "it is not the case that" as governing the whole biconditional.' },
  { id: 'sym-061', difficulty: 5, sentence: 'Jo passes the exam if and only if she studies, unless the exam is cancelled.', key: [...JO, ['X', 'the exam is cancelled', 'the exam is not cancelled']], answer: '(J ↔ S) ∨ X', alternatives: ['¬X → (J ↔ S)'], tags: ['nested', 'biconditional', 'unless'], explanation: '"P unless Q" where P is the biconditional J ↔ S.' },
  { id: 'sym-062', difficulty: 5, sentence: 'If the price falls, then the queue is long only if the office is open.', key: ['P', 'Q', 'O'], answer: 'P → (Q → O)', alternatives: ['(P ∧ Q) → O'], tags: ['nested', 'only-if', 'conditional'], explanation: 'The consequent "Q only if O" is Q → O.' },
  { id: 'sym-063', difficulty: 5, sentence: 'It is not the case that both it rains and the sun shines, and the ground is wet only if it rains.', key: ['R', 'S', 'W'], answer: '¬(R ∧ S) ∧ (W → R)', tags: ['nested', 'not-both', 'only-if'], explanation: 'Two conjuncts: "not both R and S" and "W only if R".' },
  { id: 'sym-064', difficulty: 5, sentence: 'Whenever Vera votes, Ned dances if and only if Mia sings.', key: ['V', ['N', 'Ned dances', 'Ned does not dance'], 'M'], answer: 'V → (N ↔ M)', tags: ['nested', 'whenever', 'biconditional'], explanation: '"Whenever V, X" is V → X, with X the biconditional.' },
  { id: 'sym-065', difficulty: 5, sentence: 'If the team wins then Hal is hungry, and if the team does not win then Hal is still hungry.', key: ['T', 'H'], answer: '(T → H) ∧ (¬T → H)', tags: ['nested', 'conjunction', 'conditional'], explanation: 'A conjunction of two conditionals. (It is equivalent to plain H — but a faithful symbolization keeps the structure.)' },
  { id: 'sym-066', difficulty: 5, sentence: 'Alice attends the meeting just in case neither Bob nor Eve does.', key: ['A', 'B', ['E', 'Eve attends the meeting', 'Eve does not attend the meeting']], answer: 'A ↔ (¬B ∧ ¬E)', alternatives: ['A ↔ ¬(B ∨ E)'], tags: ['nested', 'biconditional', 'neither-nor'], explanation: '"just in case" is ↔; the right side is a "neither … nor".' },
];
