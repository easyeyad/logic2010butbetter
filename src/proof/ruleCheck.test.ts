// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Formula } from '../logic/ast';
import { parseOrThrow } from '../logic/index';
import { checkRuleApplication } from './ruleCheck';
import type { RuleId } from './types';

const F = (s: string): Formula => parseOrThrow(s);
const check = (rule: string, cited: string[], concl: string, allowDerivedRules = false) =>
  checkRuleApplication(rule as RuleId, cited.map(F), F(concl), { allowDerivedRules });

describe('checkRuleApplication', () => {
  it('accepts every primitive rule in its canonical form (any ref order)', () => {
    const ok: [string, string[], string][] = [
      ['MP', ['P → Q', 'P'], 'Q'],
      ['MP', ['P', 'P → Q'], 'Q'],
      ['MT', ['P → Q', '¬Q'], '¬P'],
      ['DN', ['¬¬P'], 'P'],
      ['DN', ['P'], '¬¬P'],
      ['R', ['P ∧ Q'], 'P ∧ Q'],
      ['S', ['P ∧ Q'], 'Q'],
      ['ADJ', ['Q', 'P'], 'P ∧ Q'],
      ['ADD', ['Q'], 'P ∨ Q'],
      ['MTP', ['¬Q', 'P ∨ Q'], 'P'],
      ['BC', ['P ↔ Q'], 'Q → P'],
      ['CB', ['Q → P', 'P → Q'], 'P ↔ Q'],
    ];
    for (const [r, c, x] of ok) expect(check(r, c, x), `${r} ${c} ⊢ ${x}`).toMatchObject({ ok: true });
  });

  it('derived rules need the setting', () => {
    const r = check('DM', ['¬(P ∧ Q)'], '¬P ∨ ¬Q');
    expect(r).toMatchObject({ ok: false, code: 'rule-not-allowed' });
    expect(r.message).toContain("DM (De Morgan's Laws)");
    expect(check('DM', ['¬(P ∧ Q)'], '¬P ∨ ¬Q', true).ok).toBe(true);
    expect(check('NC', ['¬(P → Q)'], 'P ∧ ¬Q', true).ok).toBe(true);
    expect(check('NB', ['¬(P ↔ Q)'], 'P ↔ ¬Q', true).ok).toBe(true);
    expect(check('CDJ', ['P → Q'], '¬P ∨ Q', true).ok).toBe(true);
    expect(check('SC', ['P ∨ Q', 'P → R', 'Q → R'], 'R', true).ok).toBe(true);
  });

  it('explains mismatches and lists alternative rules', () => {
    const r = check('MP', ['P → Q', '¬Q'], '¬P');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('rule-mismatch');
    expect(r.alternativeRules).toEqual(['MT']);
    expect(r.suggestion).toBe('This step is valid by MT (Modus Tollens), not MP.');
    expect(r.message).toMatch(/^Line 3: /);
  });

  it('uses the given line numbers in messages', () => {
    const r = checkRuleApplication('S', [F('P → Q')], F('P'), { lineNumber: 7, citedLineNumbers: [3] });
    expect(r.message).toBe('Line 7: S (Simplification) extracts one conjunct from a conjunction, but line 3 (P → Q) is a conditional, not a conjunction.');
    expect(r.badRefs).toEqual([3]);
  });

  it('wrong number of cited formulas', () => {
    const r = check('ADD', ['P', 'Q'], 'P ∧ Q');
    expect(r).toMatchObject({ ok: false, code: 'ref-count', alternativeRules: ['ADJ'] });
    expect(r.suggestion).toContain('ADJ (Adjunction)');
    expect(check('MP', [], 'Q')).toMatchObject({ ok: false, code: 'missing-refs' });
  });

  it('unknown rule', () => {
    expect(check('FOO', ['P'], 'P')).toMatchObject({ ok: false, code: 'unknown-rule' });
  });

  it('every failure carries a message and a suggestion', () => {
    const bad: [string, string[], string][] = [
      ['MP', ['P → Q', 'Q'], 'P'],
      ['MT', ['P → Q', '¬P'], '¬Q'],
      ['DN', ['¬P'], 'P'],
      ['R', ['P'], 'Q'],
      ['S', ['P ∨ Q'], 'P'],
      ['ADJ', ['P', 'Q'], 'P ∨ Q'],
      ['ADD', ['P'], 'Q ∨ R'],
      ['MTP', ['P ∨ Q', 'P'], 'Q'],
      ['BC', ['P → Q'], 'Q → P'],
      ['CB', ['P → Q', 'Q → R'], 'P ↔ R'],
      ['DM', ['¬(P ∧ Q)'], '¬P ∧ ¬Q'],
      ['NC', ['¬(P → Q)'], '¬P ∧ Q'],
      ['NB', ['¬(P ↔ Q)'], '¬P ↔ ¬Q'],
      ['CDJ', ['P → Q'], 'P ∨ ¬Q'],
      ['SC', ['P ∨ Q', 'P → R', 'Q → S'], 'R'],
    ];
    for (const [r, c, x] of bad) {
      const res = check(r, c, x, true);
      expect(res.ok, r).toBe(false);
      expect(res.message, r).toMatch(/^Line \d+/);
      expect(res.message, r).toContain(r);
      expect(res.suggestion, r).toBeTruthy();
    }
  });
});
