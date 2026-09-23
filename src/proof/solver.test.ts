// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Formula } from '../logic/ast';
import { And, Atom, Iff, Implies, Not, Or } from '../logic/ast';
import { parse } from '../logic/index';
import { checkDerivation } from './checker';
import { solve } from './solver';
import { entails, fmt } from './util';

const P = (s: string): Formula => {
  const r = parse(s);
  if (!r.ok) throw new Error(`bad test formula ${s}: ${r.error.message}`);
  return r.formula;
};

function solveAndCheck(premises: string[], goal: string) {
  const lines = solve(premises.map(P), P(goal));
  expect(lines, `no proof for ${premises.join(', ')} ⊢ ${goal}`).not.toBeNull();
  const c = checkDerivation({ goal, lines: lines!, premises });
  const errs = c.lines.flatMap((l) => l.issues.map((i) => `${l.number}: ${i.message}`));
  expect(errs).toEqual([]);
  expect(c.complete).toBe(true);
  return lines!;
}

describe('solve', () => {
  it('MP chain, natural layout', () => {
    const lines = solveAndCheck(['P → Q', 'Q → R', 'P'], 'R');
    expect(lines.map((l) => l.text)).toEqual(['P → Q', 'Q → R', 'P', 'R', 'Q', 'R']);
    expect(lines[3].kind).toBe('show');
    expect(lines[3].close?.method).toBe('DD');
  });

  it('hypothetical syllogism uses CD', () => {
    const lines = solveAndCheck(['P → Q', 'Q → R'], 'P → R');
    expect(lines[2].close?.method).toBe('CD');
    expect(lines[3]).toMatchObject({ kind: 'assumption', assumption: 'CD', text: 'P' });
    expect(lines.length).toBe(6);
  });

  it('classic exercises', () => {
    const cases: [string[], string][] = [
      [['¬¬P'], 'P'],
      [['P → Q'], '¬Q → ¬P'],
      [[], 'P → P'],
      [[], 'P ∨ ¬P'],
      [[], '¬(P ∧ ¬P)'],
      [['P ∨ Q', '¬P'], 'Q'],
      [['P ∨ Q', 'P → R', 'Q → R'], 'R'],
      [['¬(P ∨ Q)'], '¬P ∧ ¬Q'],
      [['¬P ∧ ¬Q'], '¬(P ∨ Q)'],
      [['¬(P ∧ Q)'], '¬P ∨ ¬Q'],
      [['¬P ∨ ¬Q'], '¬(P ∧ Q)'],
      [['¬(P → Q)'], 'P ∧ ¬Q'],
      [['P → Q'], '¬P ∨ Q'],
      [['¬P ∨ Q'], 'P → Q'],
      [['P ↔ Q'], '(P → Q) ∧ (Q → P)'],
      [['¬(P ↔ Q)'], 'P ↔ ¬Q'],
      [['P ↔ ¬Q'], '¬(P ↔ Q)'],
      [[], '((P → Q) → P) → P'],
      [['(P ∧ Q) → R'], 'P → (Q → R)'],
      [['P → (Q → R)'], '(P ∧ Q) → R'],
      [['P ∧ (Q ∨ R)'], '(P ∧ Q) ∨ (P ∧ R)'],
      [['(P ∧ Q) ∨ (P ∧ R)'], 'P ∧ (Q ∨ R)'],
      [['P ∨ (Q ∧ R)'], '(P ∨ Q) ∧ (P ∨ R)'],
      [['P', '¬P'], 'Q'],
      [[], '(P ↔ Q) ↔ (Q ↔ P)'],
      [['A → (B ∨ C)', '¬B', 'C → D', 'A'], 'D'],
      [['(P → Q) ∧ (R → S)', 'P ∨ R'], 'Q ∨ S'],
      [['(P → Q) ∧ (R → S)', '¬Q ∨ ¬S'], '¬P ∨ ¬R'],
    ];
    for (const [ps, g] of cases) solveAndCheck(ps, g);
  });

  it('returns null for invalid arguments', () => {
    expect(solve([P('P → Q'), P('Q')], P('P'))).toBeNull();
    expect(solve([], P('P'))).toBeNull();
  });

  it('random valid arguments are all proved and pass the checker', () => {
    let seed = 12345;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed >>> 12) % n;
    };
    const letters = ['P', 'Q', 'R', 'S'];
    const gen = (d: number): Formula => {
      if (d === 0 || rnd(4) === 0) return Atom(letters[rnd(3 + (d > 1 ? 1 : 0))]);
      switch (rnd(5)) {
        case 0:
          return Not(gen(d - 1));
        case 1:
          return And(gen(d - 1), gen(d - 1));
        case 2:
          return Or(gen(d - 1), gen(d - 1));
        case 3:
          return Implies(gen(d - 1), gen(d - 1));
        default:
          return Iff(gen(d - 1), gen(d - 1));
      }
    };
    let proved = 0;
    for (let k = 0; proved < 60 && k < 3000; k++) {
      const prem = Array.from({ length: rnd(3) }, () => gen(2));
      const goal = gen(3);
      if (!entails(prem, goal)) continue;
      const lines = solve(prem, goal);
      expect(lines, `${prem.map(fmt).join(', ')} ⊢ ${fmt(goal)}`).not.toBeNull();
      const c = checkDerivation({ goal: fmt(goal), lines: lines! });
      expect(c.complete, `${prem.map(fmt).join(', ')} ⊢ ${fmt(goal)}`).toBe(true);
      proved++;
    }
    expect(proved).toBe(60);
  });
});
