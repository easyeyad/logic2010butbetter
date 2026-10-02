import { describe, expect, it } from 'vitest';
import { Atom, equals } from './ast';
import { evaluate } from './evaluate';
import { parseOrThrow as p } from './parser';
import { randomFormula, seededRandom } from './random';
import { allValuations, buildTruthTable, classify } from './truthTable';

const T = true, F = false;

describe('buildTruthTable', () => {
  it('(P ∧ Q) → R', () => {
    const t = buildTruthTable([p('(P ∧ Q) → R')]);
    expect(t.atoms).toEqual(['P', 'Q', 'R']);
    expect(t.columns.map((c) => c.label)).toEqual(['P', 'Q', 'R', 'P ∧ Q', '(P ∧ Q) → R']);
    expect(t.columns.map((c) => c.isAtom)).toEqual([T, T, T, F, F]);
    expect(t.columns.map((c) => c.isMain)).toEqual([F, F, F, F, T]);
    expect(t.columns[3].dependsOn).toEqual([0, 1]);
    expect(t.columns[4].dependsOn).toEqual([3, 2]);
    expect(t.mainColumns).toEqual([4]);
    expect(t.rows).toEqual([
      [T, T, T, T, T],
      [T, T, F, T, F],
      [T, F, T, F, T],
      [T, F, F, F, T],
      [F, T, T, F, T],
      [F, T, F, F, T],
      [F, F, T, F, T],
      [F, F, F, F, T],
    ]);
    expect(t.valuations[1]).toEqual({ P: T, Q: T, R: F });
    expect(t.valuations[7]).toEqual({ P: F, Q: F, R: F });
  });

  it('¬(P ∨ Q)', () => {
    const t = buildTruthTable([p('¬(P ∨ Q)')]);
    expect(t.columns.map((c) => c.label)).toEqual(['P', 'Q', 'P ∨ Q', '¬(P ∨ Q)']);
    expect(t.rows.map((r) => r[3])).toEqual([F, F, F, T]);
    expect(t.columns[3].dependsOn).toEqual([2]);
  });

  it('multiple formulas share atoms and dedupe columns', () => {
    const t = buildTruthTable([p('P → Q'), p('(P → Q) ∧ P'), p('Q')]);
    expect(t.columns.map((c) => c.label)).toEqual(['P', 'Q', 'P → Q', '(P → Q) ∧ P']);
    expect(t.columns.map((c) => c.isMain)).toEqual([F, T, T, T]);
    expect(t.mainColumns).toEqual([2, 3, 1]);
  });

  it('a single atom', () => {
    const t = buildTruthTable([Atom('P')]);
    expect(t.rows).toEqual([[T], [F]]);
    expect(t.columns[0].isMain).toBe(true);
  });

  it('no atoms / no formulas: one empty row', () => {
    const t = buildTruthTable([]);
    expect(t.rows).toEqual([[]]);
    expect(t.valuations).toEqual([{}]);
  });

  it('columns agree with evaluate (random)', () => {
    const random = seededRandom(11);
    for (let i = 0; i < 200; i++) {
      const f = randomFormula({ random, atoms: ['P', 'Q', 'R', 'S'] });
      const t = buildTruthTable([f]);
      t.rows.forEach((row, r) => {
        t.columns.forEach((c, ci) => expect(row[ci]).toBe(evaluate(c.formula, t.valuations[r])));
      });
      expect(equals(t.columns[t.mainColumns[0]].formula, f)).toBe(true);
    }
  });

  it('limits to 10 atoms and is fast', () => {
    const big = p(`((((A ∧ B) ∨ (C → D)) ↔ ((E ∧ ¬F) ∨ (G ↔ H))) → ((I ∨ J) ∧ ¬(A ↔ J)))`);
    const start = performance.now();
    const t = buildTruthTable([big, p('(A ∨ B) ∧ (C ∨ D)'), p('¬(E ∧ F) ∨ (G → (H ∧ I))')]);
    const ms = performance.now() - start;
    expect(t.rows.length).toBe(1024);
    expect(t.columns.length).toBeGreaterThan(25);
    expect(ms).toBeLessThan(200);
    expect(() => buildTruthTable([p('(((A ∧ B) ∧ (C ∧ D)) ∧ ((E ∧ F) ∧ (G ∧ H))) ∧ ((I ∧ J) ∧ K)')])).toThrow(/limited to 10 sentence letters/);
  });
});

describe('allValuations', () => {
  it('standard order: first atom alternates slowest, all-true first', () => {
    expect(allValuations(['P', 'Q'])).toEqual([
      { P: T, Q: T },
      { P: T, Q: F },
      { P: F, Q: T },
      { P: F, Q: F },
    ]);
  });
});

describe('classify', () => {
  it.each([
    ['(P → Q) ↔ (¬Q → ¬P)', 'tautology'],
    ['P ∨ ¬P', 'tautology'],
    ['P ∧ ¬P', 'contradiction'],
    ['¬(P → P)', 'contradiction'],
    ['(P ∧ Q) → R', 'contingent'],
    ['P', 'contingent'],
  ])('%s is %s', (f, c) => {
    expect(classify(p(f))).toBe(c);
  });
});
