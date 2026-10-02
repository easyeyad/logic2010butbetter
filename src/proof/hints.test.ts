// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkDerivation } from './checker';
import { suggestClose, suggestNextStep, type HintLine } from './hints';
import { draft } from './testUtil';
import { And, Atom, Iff, Implies, Not, Or, type Formula } from '../logic/ast';
import { solve } from './solver';
import { entails, fmt } from './util';
import type { DerivationDraft, DraftLine, RuleId } from './types';

function apply(d: DerivationDraft, h: HintLine): DerivationDraft {
  const lines = d.lines.map((l) => ({ ...l }));
  const id = `h${lines.length + 1}`;
  if (h.kind === 'close') {
    lines[h.closeLine! - 1] = { ...lines[h.closeLine! - 1], close: { method: h.rule as 'DD', refs: h.refs! } };
  } else if (h.kind === 'show') {
    lines.push({ id, kind: 'show', text: h.text, depth: h.depth! });
  } else if (h.kind === 'assumption') {
    lines.push({ id, kind: 'assumption', text: h.text, depth: h.depth!, assumption: h.rule === 'ASS CD' ? 'CD' : 'ID' });
  } else {
    lines.push({ id, kind: 'step', text: h.text, depth: h.depth!, rule: h.rule as RuleId, refs: h.refs });
  }
  return { ...d, lines };
}

function premisesDraft(ps: string[], goal: string): DerivationDraft {
  const lines: DraftLine[] = ps.map((p, i) => ({ id: `p${i}`, kind: 'premise', text: p, depth: 0 }));
  return { goal, lines, premises: ps };
}

describe('suggestNextStep', () => {
  it('starts with Show goal', () => {
    const d = premisesDraft(['P → Q', 'Q → R'], 'P → R');
    expect(suggestNextStep(d, 1)!.message).toMatch(/Show line/);
    const h3 = suggestNextStep(d, 3)!;
    expect(h3.line).toMatchObject({ text: 'P → R', kind: 'show', depth: 0 });
  });

  it('conditional goal → CD strategy, graded', () => {
    const d = draft(`
P → Q      | PR
Q → R      | PR
Show P → R |
`, { goal: 'P → R' });
    const h1 = suggestNextStep(d, 1)!;
    expect(h1.message).toBe('Your goal on line 3 is a conditional — try Conditional Derivation (CD).');
    expect(h1.line).toBeUndefined();
    expect(suggestNextStep(d, 2)!.message).toBe('Assume P (ASS CD) and aim to derive R.');
    const h3 = suggestNextStep(d, 3)!;
    expect(h3.line).toMatchObject({ text: 'P', kind: 'assumption', rule: 'ASS CD', depth: 1 });
  });

  it('suggests one concrete step at a time', () => {
    const d = draft(`
P → Q      | PR
Q → R      | PR
Show P → R |
  P        | ASS CD
`, { goal: 'P → R' });
    expect(suggestNextStep(d, 1)!.message).toContain('antecedent you already have');
    expect(suggestNextStep(d, 1)!.message).toContain("You're aiming for R");
    expect(suggestNextStep(d, 2)!.message).toBe('Try MP (Modus Ponens) with lines 1 and 4.');
    expect(suggestNextStep(d, 3)!.line).toMatchObject({ text: 'Q', rule: 'MP', refs: [1, 4], kind: 'step', depth: 1 });
  });

  it('atomic goal with nothing obvious → ID', () => {
    const d = draft(`
¬P → Q  | PR
¬Q      | PR
Show P  |
`);
    // MT gives ¬¬P then DN: a direct route exists, so DD is suggested.
    expect(suggestNextStep(d, 1)!.message).toMatch(/directly/);
    const d2 = draft(`
P ∨ Q   | PR
P → R   | PR
Q → R   | PR
Show R  |
`);
    expect(suggestNextStep(d2, 1)!.message).toMatch(/Indirect Derivation \(ID\)/);
    expect(suggestNextStep(d2, 3)!.line).toMatchObject({ text: '¬R', kind: 'assumption', rule: 'ASS ID' });
  });

  it('conjunction and biconditional goals', () => {
    expect(suggestNextStep(draft(`
P → Q        | PR
Q → P        | PR
Show P ↔ Q   |
`), 1)!.message).toMatch(/CB/);
    const conj = draft(`
P → Q            | PR
P → R            | PR
Show P → (Q ∧ R) |
  P              | ASS CD
  Show Q ∧ R     |
`);
    expect(suggestNextStep(conj, 1)!.message).toBe('Your goal on line 5 is a conjunction — get each conjunct separately, then combine them with ADJ.');
    expect(suggestNextStep(conj, 2)!.message).toBe('Try MP (Modus Ponens) with lines 1 and 4.');
  });

  it('points at errors first', () => {
    const d = draft(`
P → Q   | PR
Show P  |
  P     | S 1
`);
    expect(suggestNextStep(d, 1)!.message).toBe('Line 3 has a problem — fix it before moving on.');
    expect(suggestNextStep(d, 2)!.message).toContain('S (Simplification)');
  });

  it('ignores a trailing empty line', () => {
    const d = draft(`
P → Q      | PR
Q → R      | PR
Show P → R |
  P        | ASS CD
`, { goal: 'P → R' });
    d.lines.push({ id: 'b', kind: 'step', text: '', depth: 1 });
    expect(suggestNextStep(d, 3)!.line).toMatchObject({ text: 'Q', rule: 'MP', refs: [1, 4] });
  });

  it('returns null when complete', () => {
    const d = draft(`
P      | PR
Show P | DD 3
  P    | R 1
`, { goal: 'P' });
    expect(suggestNextStep(d, 1)).toBeNull();
  });

  it('explains when the Show line does not follow', () => {
    const d = draft(`
P → Q  | PR
Show Q |
`);
    expect(suggestNextStep(d, 3)!.message).toMatch(/does not follow/);
  });

  it('following level-3 hints reaches a complete derivation', () => {
    const cases: [string[], string][] = [
      [['P → Q', 'Q → R'], 'P → R'],
      [['P ∨ Q', 'P → R', 'Q → R'], 'R'],
      [['(P ∧ Q) → R'], 'P → (Q → R)'],
      [['¬(P ∨ Q)'], '¬P ∧ ¬Q'],
      [['P ↔ Q', 'Q ↔ R'], 'P ↔ R'],
      [[], '((P → Q) → P) → P'],
    ];
    for (const [ps, g] of cases) {
      let d = premisesDraft(ps, g);
      for (let step = 0; step < 80; step++) {
        const c = checkDerivation(d);
        expect(c.valid, JSON.stringify(c.lines.flatMap((l) => l.issues))).toBe(true);
        if (c.complete) break;
        const h = suggestNextStep(d, 3);
        expect(h?.line, `${g} step ${step}: ${h?.message}`).toBeDefined();
        d = apply(d, h!.line!);
      }
      expect(checkDerivation(d).complete, g).toBe(true);
    }
  });
});

describe('hint following on random valid arguments', () => {
  it('always reaches a complete, error-free derivation', () => {
    let seed = 4242;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed >>> 12) % n;
    };
    const gen = (d: number): Formula => {
      if (d === 0 || rnd(4) === 0) return Atom('PQRS'[rnd(4)]);
      const k = rnd(5);
      if (k === 0) return Not(gen(d - 1));
      const [a, b] = [gen(d - 1), gen(d - 1)];
      return k === 1 ? And(a, b) : k === 2 ? Or(a, b) : k === 3 ? Implies(a, b) : Iff(a, b);
    };
    let tested = 0;
    for (let k = 0; tested < 25 && k < 20000; k++) {
      const prem = Array.from({ length: rnd(3) }, () => gen(2));
      const goal = gen(3);
      if (!entails(prem, goal)) continue;
      const sol = solve(prem, goal);
      if (!sol || sol.length - prem.length < 6) continue; // skip trivial ones
      tested++;
      let d = premisesDraft(prem.map(fmt), fmt(goal));
      let complete = false;
      for (let step = 0; step < 800 && !complete; step++) {
        const c = checkDerivation(d);
        expect(c.valid).toBe(true);
        complete = c.complete;
        if (complete) break;
        const h = suggestNextStep(d, 3);
        expect(h?.line, `${fmt(goal)}: ${h?.message}`).toBeDefined();
        d = apply(d, h!.line!);
      }
      expect(complete, `${prem.map(fmt).join(', ')} ⊢ ${fmt(goal)}`).toBe(true);
    }
    expect(tested).toBe(25);
  }, 60000);
});

describe('suggestClose', () => {
  it('CD close', () => {
    const d = draft(`
P → Q      | PR
Show P → Q |
  P        | ASS CD
  Q        | MP 1,3
`);
    expect(suggestClose(d)).toEqual({ showLine: 2, method: 'CD', refs: [4] });
    expect(suggestNextStep(d, 3)!.line).toMatchObject({ kind: 'close', rule: 'CD', refs: [4], closeLine: 2 });
  });

  it('ID close', () => {
    const d = draft(`
P → Q     | PR
P → ¬Q    | PR
Show ¬P   |
  P       | ASS ID
  Q       | MP 1,4
  ¬Q      | MP 2,4
`);
    expect(suggestClose(d)).toEqual({ showLine: 3, method: 'ID', refs: [5, 6] });
  });

  it('DD close and nothing to close', () => {
    expect(suggestClose(draft(`
P ∧ Q   | PR
Show Q  |
  Q     | S 1
`))).toEqual({ showLine: 2, method: 'DD', refs: [3] });
    expect(suggestClose(draft(`
P ∧ Q   | PR
Show Q  |
`))).toBeNull();
    expect(suggestClose({ lines: [] })).toBeNull();
  });
});
