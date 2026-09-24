import { TOPICS, checkAnswer, createPracticeSession, exerciseLabel, generateExercise, getSolution, mergeResult, pointsFor, scoreSession, type Answer, type Exercise, type ExerciseResult } from './index';

/** Build a correct answer from the exercise's own solution data (used to drive sessions end-to-end). */
function correctAnswer(ex: Exercise): Answer | null {
  const sol = getSolution(ex);
  switch (ex.kind) {
    case 'wff':
      return { kind: 'wff', wellFormed: ex.wellFormed, errorAt: ex.errorSpan?.start };
    case 'symbolization':
      return { kind: 'symbolization', formula: ex.answer };
    case 'truth-table':
      return { kind: 'truth-table', classification: ex.classification };
    case 'validity':
      return { kind: 'validity', valid: ex.valid, countermodel: sol.valuation };
    case 'countermodel':
      return { kind: 'countermodel', valuation: sol.valuation! };
    case 'derivation':
      return { kind: 'derivation', draft: sol.derivation! };
    case 'inference-rule':
      return ex.mode === 'identify' ? { kind: 'inference-rule', rule: ex.rule } : { kind: 'inference-rule', formula: ex.conclusion };
    case 'terminology':
      return null;
  }
}

describe('practice sessions', () => {
  it('are deterministic in the seed and have the requested length', () => {
    const a = createPracticeSession({ topic: 'symbolization', difficulty: 3, count: 10, seed: 123 });
    const b = createPracticeSession({ topic: 'symbolization', difficulty: 3, count: 10, seed: 123 });
    const c = createPracticeSession({ topic: 'symbolization', difficulty: 3, count: 10, seed: 124 });
    expect(a).toEqual(b);
    expect(a.id).toBe(b.id);
    expect(a.exercises).toHaveLength(10);
    expect(a.exercises.map((e) => e.id)).not.toEqual(c.exercises.map((e) => e.id));
    expect(a.exercises.every((e) => e.topic === 'symbolization' && e.difficulty === 3)).toBe(true);
  });

  it('never repeats an exercise within a session', () => {
    for (const topic of [...TOPICS, 'mixed' as const]) {
      const s = createPracticeSession({ topic, difficulty: 2, count: 12, seed: 7 });
      expect([topic, new Set(s.exercises.map((e) => e.id)).size]).toEqual([topic, 12]);
    }
  });

  it('mixed sessions spread evenly over the chosen topics, with per-topic difficulty', () => {
    const s = createPracticeSession({ topic: 'mixed', difficulty: 2, count: 9, seed: 1, topics: ['wff', 'validity', 'symbolization'], difficultyByTopic: { validity: 4 } });
    const counts: Record<string, number> = {};
    for (const e of s.exercises) counts[e.topic] = (counts[e.topic] ?? 0) + 1;
    expect(counts).toEqual({ wff: 3, validity: 3, symbolization: 3 });
    expect(s.exercises.filter((e) => e.topic === 'validity').every((e) => e.difficulty === 4)).toBe(true);
  });

  it('ramps difficulty when asked', () => {
    const s = createPracticeSession({ topic: 'wff', difficulty: 3, count: 5, seed: 2, ramp: true });
    expect(s.exercises.map((e) => e.difficulty)).toEqual([2, 3, 3, 4, 4]);
  });

  it('every exercise in a mixed session is answerable with its own solution', () => {
    const s = createPracticeSession({ topic: 'mixed', difficulty: 3, count: 24, seed: 99 });
    for (const ex of s.exercises) {
      const a = correctAnswer(ex);
      if (!a) continue;
      expect([ex.id, checkAnswer(ex, a).correct]).toEqual([ex.id, true]);
    }
  });
});

describe('scoring', () => {
  it('scores correct, partial, hints, solution views and skips', () => {
    const s = createPracticeSession({ topic: 'wff', difficulty: 1, count: 5, seed: 3 });
    const [a, b, c, d] = s.exercises.map((e) => e.id);
    const score = scoreSession(s, [
      { exerciseId: a, correct: true, timeMs: 1000 },
      { exerciseId: b, feedback: { correct: true }, hintsUsed: 2, timeMs: 2000 },
      { exerciseId: c, feedback: { correct: false, partial: true } },
      { exerciseId: d, correct: true, solutionViewed: true },
      // fifth skipped
    ]);
    expect(score).toMatchObject({ total: 5, answered: 4, correct: 3, firstTryCorrect: 3, partial: 1, skipped: 1, hintsUsed: 2, totalTimeMs: 3000 });
    // 1 + 0.8 + 0.25 + 0 + 0 = 2.05 / 5
    expect(score.score).toBe(41);
    expect(score.toReview).toEqual([c, d]);
    expect(score.byTopic.wff).toMatchObject({ total: 5, correct: 3 });
  });

  it('caps the hint penalty', () => {
    expect(pointsFor({ exerciseId: 'x', correct: true, hintsUsed: 20 })).toBe(0.5);
    expect(pointsFor({ exerciseId: 'x', correct: false, hintsUsed: 3 })).toBe(0);
  });
});

describe('retries and review labels (review round 1)', () => {
  it('a session fixed by Retry does not score as 5/5 first-try', () => {
    const s = createPracticeSession({ topic: 'wff', difficulty: 1, count: 5, seed: 3 });
    const ids = s.exercises.map((e) => e.id);
    let results: ExerciseResult[] = [];
    // 3 wrong first, then retried to correct; 2 right first time
    for (const id of ids.slice(0, 3)) {
      results = mergeResult(results, { exerciseId: id, feedback: { correct: false }, correct: false });
      results = mergeResult(results, { exerciseId: id, feedback: { correct: true }, correct: true });
    }
    for (const id of ids.slice(3)) results = mergeResult(results, { exerciseId: id, feedback: { correct: true }, correct: true });
    expect(results).toHaveLength(5);
    const score = scoreSession(s, results);
    expect(score).toMatchObject({ correct: 5, firstTryCorrect: 2, correctAfterRetry: 3, firstTryAccuracy: 0.4 });
    expect(score.score).toBe(70); // (2 × 1 + 3 × 0.5) / 5
    expect(score.review.map((r) => r.reason)).toEqual(['correct-after-retry', 'correct-after-retry', 'correct-after-retry']);
  });

  it('mergeResult keeps first-try failure, counts attempts, keeps max hints and any solution view', () => {
    let rs = mergeResult([], { exerciseId: 'x', correct: false, hintsUsed: 1 });
    rs = mergeResult(rs, { exerciseId: 'x', correct: true, hintsUsed: 0, solutionViewed: false });
    expect(rs).toEqual([expect.objectContaining({ exerciseId: 'x', correct: true, attempts: 2, firstTryCorrect: false, hintsUsed: 1 })]);
    expect(pointsFor(rs[0])).toBeCloseTo(0.4);
    // explicit attempts > 1 without firstTryCorrect also means not first try
    expect(pointsFor({ exerciseId: 'y', correct: true, attempts: 3 })).toBe(0.5);
  });

  it('review items carry concrete labels', () => {
    const wff = generateExercise('wff', 1, 1);
    const val = generateExercise('validity', 1, 2);
    const sym = generateExercise('symbolization', 2, 3);
    const tt = generateExercise('truth-table', 2, 4);
    expect(exerciseLabel(wff)).toBe(wff.kind === 'wff' ? wff.formula : '');
    if (val.kind === 'validity') expect(exerciseLabel(val)).toBe(`${val.premises.join(', ')} ⊢ ${val.conclusion}`);
    if (sym.kind === 'symbolization') expect(exerciseLabel(sym)).toBe(sym.sentence);
    if (tt.kind === 'truth-table') expect(exerciseLabel(tt)).toBe(tt.formula);
    const s = createPracticeSession({ topic: 'wff', difficulty: 1, count: 5, seed: 3 });
    const score = scoreSession(s, s.exercises.map((e) => ({ exerciseId: e.id, correct: false })));
    expect(score.review.map((r) => r.label)).toEqual(s.exercises.map((e) => (e.kind === 'wff' ? e.formula : '')));
    expect(new Set(score.review.map((r) => r.label)).size).toBe(5);
  });
});
