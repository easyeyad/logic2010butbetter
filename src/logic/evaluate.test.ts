import { describe, expect, it } from 'vitest';
import { And, Atom, Iff, Implies, Not, Or, equals } from './ast';
import { atomsOf, compileFormula, complexity, evaluate, mainConnective, subformulas } from './evaluate';
import { format } from './format';
import { parseOrThrow as p } from './parser';
import { randomFormula, seededRandom } from './random';
import { allValuations } from './truthTable';

const P = Atom('P'), Q = Atom('Q');

describe('atomsOf', () => {
  it('sorts by letter then numeric suffix, deduped', () => {
    expect(atomsOf(p('(R ∧ P10) → (Q ∨ P2)'), p('P ∧ P1'), p('A ↔ R'))).toEqual(['A', 'P', 'P1', 'P2', 'P10', 'Q', 'R']);
    expect(atomsOf()).toEqual([]);
    expect(atomsOf(p('¬¬Q'))).toEqual(['Q']);
  });
});

describe('evaluate', () => {
  it('computes each connective', () => {
    const rows: [boolean, boolean][] = [[true, true], [true, false], [false, true], [false, false]];
    const expected = {
      and: [true, false, false, false],
      or: [true, true, true, false],
      implies: [true, false, true, true],
      iff: [true, false, false, true],
    };
    rows.forEach(([a, b], i) => {
      const v = { P: a, Q: b };
      expect(evaluate(And(P, Q), v)).toBe(expected.and[i]);
      expect(evaluate(Or(P, Q), v)).toBe(expected.or[i]);
      expect(evaluate(Implies(P, Q), v)).toBe(expected.implies[i]);
      expect(evaluate(Iff(P, Q), v)).toBe(expected.iff[i]);
      expect(evaluate(Not(P), v)).toBe(!a);
    });
  });

  it('throws for a missing atom', () => {
    expect(() => evaluate(P, {})).toThrow(/P/);
  });

  it('compileFormula agrees with evaluate', () => {
    const random = seededRandom(3);
    for (let i = 0; i < 300; i++) {
      const f = randomFormula({ random });
      const atoms = atomsOf(f);
      const ev = compileFormula(f, atoms);
      for (const v of allValuations(atoms)) expect(ev(atoms.map((a) => v[a]))).toBe(evaluate(f, v));
    }
  });
});

describe('subformulas', () => {
  it('post-order, non-atomic, deduped, formula last', () => {
    const f = p('(P ∧ Q) → ¬(P ∧ Q)');
    expect(subformulas(f).map((g) => format(g))).toEqual(['P ∧ Q', '¬(P ∧ Q)', '(P ∧ Q) → ¬(P ∧ Q)']);
    expect(subformulas(P)).toEqual([]);
    expect(subformulas(p('¬¬P')).map((g) => format(g))).toEqual(['¬P', '¬¬P']);
    const g = p('(P → Q) ↔ (¬Q → ¬P)');
    const subs = subformulas(g);
    expect(subs.map((x) => format(x))).toEqual(['P → Q', '¬Q', '¬P', '¬Q → ¬P', '(P → Q) ↔ (¬Q → ¬P)']);
    expect(equals(subs[subs.length - 1], g)).toBe(true);
  });
});

describe('complexity / mainConnective', () => {
  it('counts connectives', () => {
    expect(complexity(P)).toBe(0);
    expect(complexity(p('¬¬P'))).toBe(2);
    expect(complexity(p('(P ∧ Q) → ¬R'))).toBe(3);
    expect(mainConnective(p('(P ∧ Q) → ¬R'))).toBe('implies');
  });
});
