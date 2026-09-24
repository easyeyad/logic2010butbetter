import { atomsOf, checkEquivalence, parse, parseOrThrow } from '../logic';
import {
  SYMBOLIZATION_BANK,
  SYMBOLIZATION_EXERCISES,
  checkAnswer,
  checkSymbolization,
  generateSymbolization,
  getExerciseById,
  getHints,
  getSolution,
  type Difficulty,
  type SymbolizationExercise,
} from './index';

const byId = (id: string) => getExerciseById(id) as SymbolizationExercise;
const check = (id: string, text: string) => checkSymbolization(byId(id), text);

describe('symbolization bank', () => {
  it('has at least 60 items with unique ids, spanning every difficulty', () => {
    expect(SYMBOLIZATION_BANK.length).toBeGreaterThanOrEqual(60);
    expect(new Set(SYMBOLIZATION_BANK.map((i) => i.id)).size).toBe(SYMBOLIZATION_BANK.length);
    for (const d of [1, 2, 3, 4, 5]) expect(SYMBOLIZATION_EXERCISES.some((e) => e.difficulty === d)).toBe(true);
  });

  it('covers the required idioms', () => {
    const tags = new Set(SYMBOLIZATION_BANK.flatMap((i) => i.tags));
    for (const t of ['simple', 'negation', 'conjunction', 'disjunction', 'conditional', 'only-if', 'unless', 'provided-that', 'whenever', 'sufficient', 'necessary', 'biconditional', 'neither-nor', 'not-both', 'nested'])
      expect(tags.has(t)).toBe(true);
  });

  it.each(SYMBOLIZATION_EXERCISES.map((e) => [e.id, e] as const))('%s: answers parse, are equivalent, and use exactly the key letters', (_id, ex) => {
    const key = parse(ex.answer);
    expect(key.ok).toBe(true);
    const keyF = parseOrThrow(ex.answer);
    const letters = ex.key.map((k) => k.letter);
    expect(new Set(letters).size).toBe(letters.length);
    expect(atomsOf(keyF).sort()).toEqual([...letters].sort());
    for (const k of ex.key) {
      expect(k.meaning.length).toBeGreaterThan(0);
      expect(k.negation.length).toBeGreaterThan(0);
    }
    for (const alt of ex.alternatives) {
      const p = parse(alt);
      expect(p.ok).toBe(true);
      if (p.ok) expect(checkEquivalence(p.formula, keyF).equivalent).toBe(true);
      expect(checkSymbolization(ex, alt).correct).toBe(true);
    }
    const fb = checkSymbolization(ex, ex.answer);
    expect(fb.correct).toBe(true);
    expect(fb.code).toBe('correct');
  });
});

describe('symbolization checking', () => {
  it('accepts ASCII input and commuted conjuncts as standard', () => {
    expect(check('sym-007', 'R -> W').code).toBe('correct');
    expect(check('sym-005', 'W & R').code).toBe('correct');
  });

  it('accepts equivalent but non-standard answers with an info note', () => {
    const fb = check('sym-007', '¬R ∨ W');
    expect(fb.correct).toBe(true);
    expect(fb.code).toBe('equivalent-nonstandard');
    expect(fb.severity).toBe('info');
    expect(fb.details?.[0]).toContain('R → W');
  });

  it('passes parse errors through with the span', () => {
    const fb = check('sym-007', 'R →');
    expect(fb.correct).toBe(false);
    expect(fb.code).toBe('parse-error');
    expect(fb.highlight?.[0]).toMatchObject({ target: 'answer', tone: 'error' });
  });

  it('flags letters not in the key, highlighting them', () => {
    const fb = check('sym-007', 'R → Q');
    expect(fb.code).toBe('unknown-letter');
    expect(fb.headline).toContain('Q');
    expect(fb.highlight).toEqual([{ target: 'answer', start: 4, end: 5, tone: 'error' }]);
  });

  it('diagnoses the converse, with the "only if" explanation', () => {
    const fb = check('sym-027', 'S → J');
    expect(fb.correct).toBe(false);
    expect(fb.code).toBe('converse');
    expect(fb.explanation).toMatch(/only if.*introduces the consequent/i);
  });

  it('explains necessary / sufficient / "if" in the middle when reversed', () => {
    expect(check('sym-031', 'S → J').explanation).toMatch(/necessary condition is the consequent/i);
    expect(check('sym-032', 'W → R').explanation).toMatch(/sufficient condition is the antecedent/i);
    expect(check('sym-016', 'W → R').explanation).toMatch(/introduces the antecedent wherever/i);
  });

  it('phrases the differing truth-table row in English', () => {
    const fb = check('sym-007', 'W → R');
    expect(fb.details).toContain('If it rains and the ground is not wet, the sentence is false, but your formula is true.');
    expect(fb.valuation).toEqual({ R: true, W: false });
  });

  it('diagnoses "neither … nor" written as "not both"', () => {
    for (const ans of ['¬A ∨ ¬B', '¬(A ∧ B)']) {
      const fb = check('sym-036', ans);
      expect(fb.code).toBe('neither-as-not-both');
      expect(fb.explanation).toContain('"Neither A nor B" means ¬A ∧ ¬B');
      expect(fb.explanation).not.toMatch(/\bP\b|\bQ\b/); // no stray schematic letters
      expect(fb.explanation).toMatch(/not both/);
    }
  });

  it('diagnoses "not both" written as "neither"', () => {
    expect(check('sym-037', '¬A ∧ ¬B').code).toBe('not-both-as-neither');
    expect(check('sym-037', '¬(A ∨ B)').code).toBe('not-both-as-neither');
  });

  it('diagnoses ∧/∨ mix-ups', () => {
    expect(check('sym-005', 'R ∨ W').code).toBe('and-as-or');
    expect(check('sym-006', 'A ∧ B').code).toBe('or-as-and');
    expect(check('sym-029', 'W ∧ S').code).toBe('or-as-and');
  });

  it('diagnoses conditional mix-ups', () => {
    expect(check('sym-007', 'R ↔ W').code).toBe('conditional-as-biconditional');
    expect(check('sym-007', 'R ∧ W').code).toBe('conditional-as-conjunction');
    expect(check('sym-033', 'O → L').code).toBe('biconditional-one-direction');
    expect(check('sym-033', 'L → O').code).toBe('biconditional-one-direction');
  });

  it('diagnoses "unless" read as a conditional or exclusively', () => {
    const fb = check('sym-029', 'S → W');
    expect(fb.code).toBe('disjunction-as-conditional');
    expect(fb.headline).toBe('"W unless S" means W ∨ S (equivalently ¬S → W).');
    expect(check('sym-042', '¬(V ↔ R)').code).toBe('exclusive-or');
  });

  it('diagnoses negation scope', () => {
    const fb = check('sym-049', '¬R → W');
    expect(fb.code).toBe('negation-scope-narrow');
    expect(check('sym-025', '¬(R ∧ W)').code).toBe('negation-scope-wide');
  });

  it('diagnoses missing / extra negations and swapped letters', () => {
    expect(check('sym-008', 'S ∧ R').code).toBe('missing-negation');
    expect(check('sym-005', 'R ∧ ¬W').code).toBe('extra-negation');
    expect(check('sym-044', '(A ∧ O) → B').code).toBe('swapped-letters');
  });

  it('diagnoses wrong grouping', () => {
    expect(check('sym-044', 'A ∧ (B → O)').code).toBe('grouping');
  });

  it('falls back to a main-connective diagnosis and reports missing letters', () => {
    const fb = check('sym-056', 'R');
    expect(fb.correct).toBe(false);
    expect(fb.code).toBe('wrong-main-connective');
    expect(fb.details?.some((d) => /doesn't mention/.test(d))).toBe(true);
  });

  it('works through the generic checkAnswer dispatcher', () => {
    expect(checkAnswer(byId('sym-027'), { kind: 'symbolization', formula: 'J → S' }).correct).toBe(true);
    expect(checkAnswer(byId('sym-027'), { kind: 'wff', wellFormed: true }).code).toBe('answer-kind-mismatch');
  });

  it('hints are progressive and never contain the answer; the solution does', () => {
    for (const ex of SYMBOLIZATION_EXERCISES) {
      const hints = getHints(ex);
      expect(hints.length).toBeGreaterThanOrEqual(2);
      for (const h of hints) expect(h.includes(ex.answer) && ex.answer.length > 2).toBe(false);
      expect(getSolution(ex).answer).toBe(ex.answer);
    }
  });
});

describe('symbolization generator', () => {
  const ds: Difficulty[] = [1, 2, 3, 4, 5];

  it('is deterministic in the seed', () => {
    for (const d of ds) for (const seed of [1, 7, 42]) expect(generateSymbolization(d, seed)).toEqual(generateSymbolization(d, seed));
    const sentences = new Set(Array.from({ length: 20 }, (_, i) => generateSymbolization(3, i).sentence));
    expect(sentences.size).toBeGreaterThan(10);
  });

  it('produces consistent, self-checking exercises at every difficulty', () => {
    for (const d of ds)
      for (let seed = 0; seed < 60; seed++) {
        const ex = generateSymbolization(d, seed);
        expect(ex.difficulty).toBe(d);
        expect(ex.sentence).toMatch(/^[A-Z].*\.$/);
        const g = parseOrThrow(ex.answer);
        const letters = ex.key.map((k) => k.letter);
        expect(new Set(letters).size).toBe(letters.length);
        expect(atomsOf(g).sort()).toEqual([...letters].sort());
        expect(checkSymbolization(ex, ex.answer).correct).toBe(true);
        expect(getHints(ex).length).toBeGreaterThanOrEqual(2);
      }
  });
});
