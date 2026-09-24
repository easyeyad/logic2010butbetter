// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseOrThrow } from '../logic/index';
import { checkDerivation } from './checker';
import { suggestClose, suggestNextStep, type HintLine } from './hints';
import { checkRuleApplication } from './ruleCheck';
import { solve } from './solver';
import { draft } from './testUtil';
import type { DerivationCheck, DerivationDraft, DraftLine, RuleId } from './types';

const F = parseOrThrow;
const codesOf = (c: DerivationCheck, line: number) => c.lines[line - 1].issues.map((i) => i.code);
const issue = (c: DerivationCheck, line: number) => c.lines[line - 1].issues[0];
function expectComplete(c: DerivationCheck) {
  expect(c.lines.flatMap((l) => l.issues.filter((i) => i.severity === 'error').map((i) => `${l.number}: ${i.message}`))).toEqual([]);
  expect(c.complete).toBe(true);
}

describe('quantifier derivations', () => {
  it('∀x(Fx → Gx), ∀x(Gx → Hx) ⊢ ∀x(Fx → Hx) by UD + CD', () => {
    const c = checkDerivation(draft(`
∀x(Fx → Gx)          | PR
∀x(Gx → Hx)          | PR
Show ∀x(Fx → Hx)     | UD 4
  Show Fx → Hx       | CD 9
    Fx               | ASS CD
    Fx → Gx          | UI 1
    Gx               | MP 6,5
    Gx → Hx          | UI 2
    Hx               | MP 8,7
`, { goal: '∀x(Fx → Hx)' }));
    expectComplete(c);
    expect(c.lines[2].justification).toBe('UD 4');
    expect(c.lines[2].dependsOn).toEqual([1, 2]);
  });

  it('∀x(Fx → Gx), ∃xFx ⊢ ∃xGx by EI, UI, MP, EG', () => {
    const c = checkDerivation(draft(`
∀x(Fx → Gx)   | PR
∃xFx          | PR
Show ∃xGx     | DD 7
  Fy          | EI 2
  Fy → Gy     | UI 1
  Gy          | MP 5,4
  ∃xGx        | EG 6
`, { goal: '∃xGx' }));
    expectComplete(c);
  });

  it('¬∃xFx ⊢ ∀x¬Fx by UD + ID', () => {
    const c = checkDerivation(draft(`
¬∃xFx         | PR
Show ∀x¬Fx    | UD 3
  Show ¬Fx    | ID 5,6
    Fx        | ASS ID
    ∃xFx      | EG 4
    ¬∃xFx     | R 1
`, { goal: '∀x¬Fx' }));
    expectComplete(c);
  });

  it('QN both ways (derived rules on)', () => {
    const c = checkDerivation(
      draft(`
¬∀xFx         | PR
¬∃xGx         | PR
Show ∃x¬Fx    | DD 4
  ∃x¬Fx       | QN 1
Show ∀x¬Gx    | DD 6
  ∀x¬Gx       | QN 2
Show ¬∀xFx    | DD 8
  ¬∀xFx       | QN 4
`, { allowDerivedRules: true }),
    );
    // line 8 cites line 4 inside a closed box → accessibility error only there
    expect(codesOf(c, 8)).toEqual(['ref-boxed']);
    const c2 = checkDerivation(draft(`
¬∀xFx         | PR
Show ∃x¬Fx    | DD 3
  ∃x¬Fx       | QN 1
`, { allowDerivedRules: true }));
    expectComplete(c2);
    const c3 = checkDerivation(draft(`
∃x¬Fx         | PR
Show ¬∀xFx    | DD 3
  ¬∀xFx       | QN 1
`, { allowDerivedRules: true }));
    expectComplete(c3);
  });

  it('QN needs derived rules; AV renames bound variables', () => {
    expect(checkRuleApplication('QN', [F('¬∀xFx')], F('∃x¬Fx'))).toMatchObject({ ok: false, code: 'rule-not-allowed' });
    expect(checkRuleApplication('AV', [F('∀x(Fx → Gx)')], F('∀y(Fy → Gy)'), { allowDerivedRules: true }).ok).toBe(true);
    expect(checkRuleApplication('AV', [F('∀x(Fx → Gx)')], F('∀y(Fy → Gx)'), { allowDerivedRules: true }).ok).toBe(false);
  });
});

describe('quantifier rule feedback', () => {
  it('UI to names and variables; must replace every occurrence', () => {
    expect(checkRuleApplication('UI', [F('∀x(Fx → Gx)')], F('Fa → Ga')).ok).toBe(true);
    expect(checkRuleApplication('UI', [F('∀x(Fx → Gx)')], F('Fy → Gy')).ok).toBe(true);
    const r = checkRuleApplication('UI', [F('∀x(Fx → Gx)')], F('Fa → Gx'));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('UI (Universal Instantiation)');
    expect(r.message).toContain('EVERY free occurrence');
  });

  it('UI on a line whose main connective is not ∀', () => {
    const r = checkRuleApplication('UI', [F('∀xFx → P')], F('Fa → P'));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('main connective of the whole line');
    expect(r.message).toContain('the main connective is →');
  });

  it('UI vs EI confusion is named, with the alternative', () => {
    const r = checkRuleApplication('UI', [F('∃xFx')], F('Fy'));
    expect(r.message).toContain('UI (Universal Instantiation) applies only to a universal');
    expect(r.alternativeRules).toContain('EI');
    expect(r.suggestion).toBe('This step is valid by EI (Existential Instantiation), not UI.');
    const r2 = checkRuleApplication('EI', [F('∀xFx')], F('Fa'));
    expect(r2.suggestion).toBe('This step is valid by UI (Universal Instantiation), not EI.');
  });

  it('EI to a name is a classic error', () => {
    const r = checkRuleApplication('EI', [F('∃xFx')], F('Fa'));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('new VARIABLE, not to the name a');
  });

  it('EG generalizes some occurrences; ∀ needs UD', () => {
    expect(checkRuleApplication('EG', [F('Fa ∧ Ga')], F('∃x(Fx ∧ Ga)')).ok).toBe(true);
    expect(checkRuleApplication('EG', [F('Fa ∧ Ga')], F('∃x(Fx ∧ Gx)')).ok).toBe(true);
    expect(checkRuleApplication('EG', [F('Fa ∧ Gb')], F('∃x(Fx ∧ Gx)')).ok).toBe(false);
    const r = checkRuleApplication('EG', [F('Fa')], F('∀xFx'));
    expect(r.suggestion).toContain('UD');
  });

  it('EI to a variable that already occurs (new-variable restriction)', () => {
    const c = checkDerivation(draft(`
∃xFx          | PR
Gy            | PR
Show ∃x(Fx ∧ Gx) |
  Fy          | EI 1
`));
    const i = issue(c, 4);
    expect(i.code).toBe('ei-variable-not-new');
    expect(i.message).toBe('Line 4: EI (Existential Instantiation) must use a variable that is new to the derivation, but y already occurs on line 2.');
    expect(i.suggestion).toMatch(/e\.g\. [uwz]/);
  });

  it('the classic fallacy ∃xFx ⊢ ∀xFx is blocked', () => {
    const c = checkDerivation(draft(`
∃xFx        | PR
Show ∀xFx   | UD 3
  Fx        | EI 1
`));
    expect(codesOf(c, 3)).toContain('ei-variable-not-new');
    const c2 = checkDerivation(draft(`
∃xFx        | PR
Show ∀yFy   | UD 3
  Fy        | EI 1
`));
    // y occurs in the Show line above, so EI to y is not new either
    expect(codesOf(c2, 3)).toContain('ei-variable-not-new');
  });

  it('UD restriction: x free in a premise', () => {
    const c = checkDerivation(draft(`
Fx          | PR
Show ∀xFx   | UD 3
  Fx        | R 1
`));
    const i = issue(c, 2);
    expect(i.code).toBe('close-ud-restriction');
    expect(i.message).toContain('x occurs free in line 1 (Fx)');
    expect(i.badRefs).toEqual([1]);
  });

  it('UD misuse: wrong formula / non-universal / assumption', () => {
    const c = checkDerivation(draft(`
∀xFx        | PR
Show ∀xFx   | UD 3
  ∀xFx      | R 1
`));
    expect(codesOf(c, 2)).toContain('close-mismatch');
    const c2 = checkDerivation(draft(`
Fa          | PR
Show ∃xFx   | UD 3
  ∃xFx      | EG 1
`));
    expect(codesOf(c2, 2)).toContain('close-ud-not-universal');
  });

  it('ID and CD work with quantified formulas', () => {
    const c = checkDerivation(draft(`
∀x(Fx → Gx)       | PR
Show ∃xFx → ∃xGx  | CD 8
  ∃xFx            | ASS CD
  Show ∃xGx       | ID 9,10
    ¬∃xGx         | ASS ID
    Fy            | EI 3
    Fy → Gy       | UI 1
    Gy            | MP 7,6
    ∃xGx          | EG 8
    ¬∃xGx         | R 5
`));
    // CD cites line 8 inside the nested ID box → only that close is wrong
    expect(codesOf(c, 2)).toEqual(['close-ref-inaccessible']);
    const good = checkDerivation(draft(`
∀x(Fx → Gx)       | PR
Show ∃xFx → ∃xGx  | CD 4
  ∃xFx            | ASS CD
  Show ∃xGx       | ID 9,10
    ¬∃xGx         | ASS ID
    Fy            | EI 3
    Fy → Gy       | UI 1
    Gy            | MP 7,6
    ∃xGx          | EG 8
    ¬∃xGx         | R 5
`));
    expectComplete(good);
  });
});

describe('solve (monadic)', () => {
  const problems: [string[], string][] = [
    [['∀x(Fx → Gx)', '∀x(Gx → Hx)'], '∀x(Fx → Hx)'],
    [['∀x(Fx → Gx)', '∃xFx'], '∃xGx'],
    [['¬∃xFx'], '∀x¬Fx'],
    [['∀x¬Fx'], '¬∃xFx'],
    [['¬∀xFx'], '∃x¬Fx'],
    [['∃x¬Fx'], '¬∀xFx'],
    [['∀xFx'], '∃xFx'],
    [['∀x(Fx ∧ Gx)'], '∀xFx ∧ ∀xGx'],
    [['∀xFx ∧ ∀xGx'], '∀x(Fx ∧ Gx)'],
    [['∃x(Fx ∧ Gx)'], '∃xFx ∧ ∃xGx'],
    [['∀xFx ∨ ∀xGx'], '∀x(Fx ∨ Gx)'],
    [['∃xFx ∨ ∃xGx'], '∃x(Fx ∨ Gx)'],
    [['Fa', '∀x(Fx → Gx)'], 'Ga'],
    [['∀x(Fx → Gx)', '¬Ga'], '¬Fa'],
  ];
  for (const [ps, g] of problems) {
    it(`${ps.join(', ')} ⊢ ${g}`, () => {
      const lines = solve(ps.map(F), F(g));
      expect(lines, 'no proof found').not.toBeNull();
      const c = checkDerivation({ goal: g, lines: lines!, premises: ps });
      expectComplete(c);
    });
  }

  it('returns null for invalid arguments, quickly', () => {
    const t0 = performance.now();
    expect(solve([F('∃xFx')], F('∀xFx'))).toBeNull();
    expect(solve([F('∀x(Fx → Gx)'), F('∃xGx')], F('∃xFx'))).toBeNull();
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

function apply(d: DerivationDraft, h: HintLine): DerivationDraft {
  const lines = d.lines.map((l) => ({ ...l }));
  const id = `h${lines.length + 1}`;
  if (h.kind === 'close') lines[h.closeLine! - 1] = { ...lines[h.closeLine! - 1], close: { method: h.rule as 'UD', refs: h.refs! } };
  else if (h.kind === 'show') lines.push({ id, kind: 'show', text: h.text, depth: h.depth! });
  else if (h.kind === 'assumption') lines.push({ id, kind: 'assumption', text: h.text, depth: h.depth!, assumption: h.rule === 'ASS CD' ? 'CD' : 'ID' });
  else lines.push({ id, kind: 'step', text: h.text, depth: h.depth!, rule: h.rule as RuleId, refs: h.refs });
  return { ...d, lines };
}

describe('quantifier hints', () => {
  it('universal goal → UD strategy', () => {
    const d = draft(`
∀x(Fx → Gx)     | PR
∀x(Gx → Hx)     | PR
Show ∀x(Fx → Hx) |
`);
    expect(suggestNextStep(d, 1)!.message).toContain('Universal Derivation (UD)');
  });

  it('suggestClose offers UD', () => {
    const d = draft(`
∀x(Fx ∧ Gx)  | PR
Show ∀xFx    |
  Fx ∧ Gx    | UI 1
  Fx         | S 3
`);
    expect(suggestClose(d)).toEqual({ showLine: 2, method: 'UD', refs: [4] });
  });

  it('following level-3 hints completes classic problems, each hint within budget', () => {
    const cases: [string[], string][] = [
      [['∀x(Fx → Gx)', '∀x(Gx → Hx)'], '∀x(Fx → Hx)'],
      [['∀x(Fx → Gx)', '∃xFx'], '∃xGx'],
      [['¬∃xFx'], '∀x¬Fx'],
    ];
    for (const [ps, g] of cases) {
      let d: DerivationDraft = { goal: g, premises: ps, lines: ps.map((p, i): DraftLine => ({ id: `p${i}`, kind: 'premise', text: p, depth: 0 })) };
      for (let step = 0; step < 60; step++) {
        const c = checkDerivation(d);
        expect(c.valid, JSON.stringify(c.lines.flatMap((l) => l.issues))).toBe(true);
        if (c.complete) break;
        const t0 = performance.now();
        const h = suggestNextStep(d, 3);
        expect(performance.now() - t0).toBeLessThan(1500);
        expect(h?.line, `${g}: ${h?.message}`).toBeDefined();
        d = apply(d, h!.line!);
      }
      expect(checkDerivation(d).complete, g).toBe(true);
    }
  });

  it('warns with a countermodel when the Show line does not follow', () => {
    const d = draft(`
∃xFx       | PR
Show ∀xFx  |
`);
    const h = suggestNextStep(d, 1)!;
    expect(h.message).toMatch(/does not follow|No automatic hint/);
  });
});
