// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseOrThrow } from '../logic/index';
import { checkDerivation } from './checker';
import { suggestNextStep } from './hints';
import { checkRuleApplication } from './ruleCheck';
import { solve } from './solver';
import { draft } from './testUtil';
import type { DerivationCheck, DerivationDraft, RuleId } from './types';

const F = parseOrThrow;
const codesOf = (c: DerivationCheck, line: number) => c.lines[line - 1].issues.map((i) => i.code);
function expectComplete(c: DerivationCheck) {
  expect(c.lines.flatMap((l) => l.issues.filter((i) => i.severity === 'error').map((i) => `${l.number}: ${i.message}`))).toEqual([]);
  expect(c.complete).toBe(true);
}

describe('identity derivations', () => {
  it('a = b, Fa ⊢ Fb (LL)', () => {
    expectComplete(checkDerivation(draft(`
a = b     | PR
Fa        | PR
Show Fb   | DD 4
  Fb      | LL 2,1
`, { goal: 'Fb' })));
  });

  it('a = b ⊢ b = a (SM)', () => {
    expectComplete(checkDerivation(draft(`
a = b      | PR
Show b = a | DD 3
  b = a    | SM 1
`, { goal: 'b = a' })));
  });

  it('⊢ a = a (Id, via Show/DD), with no lines cited', () => {
    const c = checkDerivation(draft(`
Show a = a | DD 2
  a = a    | Id
`, { goal: 'a = a' }));
    expectComplete(c);
    expect(c.lines[1].justification).toBe('Id');
    expect(c.lines[1].dependsOn).toEqual([]);
  });

  it('a = b, b = c ⊢ a = c (LL on an identity)', () => {
    expectComplete(checkDerivation(draft(`
a = b      | PR
b = c      | PR
Show a = c | DD 4
  a = c    | LL 1,2
`, { goal: 'a = c' })));
  });

  it('∀x(x = a → Fx) ⊢ Fa (UI, Id, MP)', () => {
    expectComplete(checkDerivation(draft(`
∀x(x = a → Fx)  | PR
Show Fa         | DD 5
  a = a → Fa    | UI 1
  a = a         | Id
  Fa            | MP 3,4
`, { goal: 'Fa' })));
  });
});

describe('identity rule feedback', () => {
  it('LL replaces some (not necessarily all) occurrences', () => {
    expect(checkRuleApplication('LL', [F('Fa ∧ Ga'), F('a = b')], F('Fb ∧ Ga')).ok).toBe(true);
    expect(checkRuleApplication('LL', [F('a = b'), F('Fa ∧ Ga')], F('Fb ∧ Gb')).ok).toBe(true);
  });

  it('LL in the wrong direction suggests SM', () => {
    const r = checkRuleApplication('LL', [F('Fb'), F('a = b')], F('Fa'));
    expect(r.ok).toBe(false);
    expect(r.message).toContain("LL (Leibniz's Law)");
    expect(r.message).toContain('replaces a by b');
    expect(r.suggestion).toContain('SM');
  });

  it('LL with the wrong term', () => {
    const r = checkRuleApplication('LL', [F('Fa'), F('a = b')], F('Fc'));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('may only replace a by b');
  });

  it('LL without citing an identity', () => {
    const r = checkRuleApplication('LL', [F('Fa'), F('Ga')], F('Fb'));
    expect(r.message).toContain('needs an identity t1 = t2 among the cited lines');
  });

  it('LL may not replace a bound variable', () => {
    const r = checkRuleApplication('LL', [F('∀x Fx'), F('x = a')], F('∀x Fa'));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('FREE occurrences');
  });

  it('SM on a non-identity; SM on ≠; valid by SM, not LL', () => {
    const r = checkRuleApplication('SM', [F('Rab')], F('Rba'));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('SM (Symmetry) applies only to an identity');
    expect(checkRuleApplication('SM', [F('a ≠ b')], F('b ≠ a')).ok).toBe(true);
    const r2 = checkRuleApplication('LL', [F('a = b')], F('b = a'));
    expect(r2.code).toBe('ref-count');
    expect(r2.suggestion).toBe('This step is valid by SM (Symmetry), not LL.');
  });

  it('Id with refs, and Id for different terms', () => {
    const c = checkDerivation(draft(`
a = b      | PR
Show a = a | DD 3
  a = a    | Id 1
`));
    expect(codesOf(c, 3)).toEqual(['ref-count']);
    expect(c.lines[2].issues[0].message).toContain('Id (Identity) cites no lines');
    const r = checkRuleApplication('Id', [], F('a = b'));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('same term on both sides');
  });
});

describe('identity solve and hints', () => {
  const problems: [string[], string][] = [
    [['a = b', 'Fa'], 'Fb'],
    [['a = b'], 'b = a'],
    [[], 'a = a'],
    [['a = b', 'b = c'], 'a = c'],
    [['∀x(x = a → Fx)'], 'Fa'],
    [['Fa', '¬Fb'], 'a ≠ b'],
    [['∀x Fx'], '∀x(x = a → Fa)'],
    [['a = b', 'Rab'], 'Rba'],
  ];
  for (const [ps, g] of problems) {
    it(`${ps.join(', ')} ⊢ ${g}`, () => {
      const lines = solve(ps.map(F), F(g));
      expect(lines, 'no proof found').not.toBeNull();
      expectComplete(checkDerivation({ goal: g, lines: lines!, premises: ps }));
    });
  }

  it('level-3 hints complete a = b, Rab ⊢ Rba using identity rewrites', () => {
    let d: DerivationDraft = {
      goal: 'Rba',
      premises: ['a = b', 'Rab'],
      lines: [
        { id: 'p1', kind: 'premise', text: 'a = b', depth: 0 },
        { id: 'p2', kind: 'premise', text: 'Rab', depth: 0 },
      ],
    };
    const used = new Set<string>();
    for (let step = 0; step < 20; step++) {
      const c = checkDerivation(d);
      expect(c.valid).toBe(true);
      if (c.complete) break;
      const h = suggestNextStep(d, 3)!;
      expect(h.message).not.toMatch(/Nothing gives/);
      const l = h.line!;
      expect(l, h.message).toBeDefined();
      if (l.rule) used.add(l.rule);
      const lines = d.lines.map((x) => ({ ...x }));
      if (l.kind === 'close') lines[l.closeLine! - 1].close = { method: l.rule as 'DD', refs: l.refs! };
      else if (l.kind === 'show') lines.push({ id: `h${step}`, kind: 'show', text: l.text, depth: l.depth! });
      else if (l.kind === 'assumption') lines.push({ id: `h${step}`, kind: 'assumption', text: l.text, depth: l.depth!, assumption: l.rule === 'ASS CD' ? 'CD' : 'ID' });
      else lines.push({ id: `h${step}`, kind: 'step', text: l.text, depth: l.depth!, rule: l.rule as RuleId, refs: l.refs });
      d = { ...d, lines };
    }
    expect(checkDerivation(d).complete).toBe(true);
    expect(used.has('LL')).toBe(true);
    expect(d.lines.length).toBeLessThanOrEqual(7);
  });

  it('level-1 hint for a = b, Rab ⊢ Rba mentions working forward, not "nothing"', () => {
    const d = draft(`
a = b    | PR
Rab      | PR
Show Rba |
`);
    const h = suggestNextStep(d, 1)!;
    expect(h.message).not.toMatch(/Nothing gives/);
    const d2 = draft(`
a = b    | PR
Rab      | PR
Show Rba |
  b = a  | SM 1
`);
    expect(suggestNextStep(d2, 1)!.message).toContain('substitute one term for the other (LL)');
  });

  it('hint for a t = t goal points to Id', () => {
    const d = draft(`
Show a = a |
`);
    expect(suggestNextStep(d, 3)!.line).toMatchObject({ text: 'a = a', rule: 'Id', refs: [] });
  });
});
