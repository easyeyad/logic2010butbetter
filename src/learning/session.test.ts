import { TOPICS, checkAnswer, createPracticeSession, getSolution, pointsFor, scoreSession, type Answer, type Exercise } from './index';

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
    expect(score).toMatchObject({ total: 5, answered: 4, correct: 3, partial: 1, skipped: 1, hintsUsed: 2, totalTimeMs: 3000 });
    // 1 + 0.8 + 0.5 + 0 + 0 = 2.3 / 5
    expect(score.score).toBe(46);
    expect(score.toReview).toEqual([c, d]);
    expect(score.byTopic.wff).toMatchObject({ total: 5, correct: 3 });
  });

  it('caps the hint penalty', () => {
    expect(pointsFor({ exerciseId: 'x', correct: true, hintsUsed: 20 })).toBe(0.5);
    expect(pointsFor({ exerciseId: 'x', correct: false, hintsUsed: 3 })).toBe(0);
  });
});
