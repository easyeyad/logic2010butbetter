import { describe, expect, it } from 'vitest';
import { parseOrThrow as p } from './parser';
import { checkConsistency, checkEquivalence, checkValidity } from './validity';

describe('checkValidity', () => {
  it('modus ponens is valid', () => {
    const r = checkValidity([p('P → Q'), p('P')], p('Q'));
    expect(r).toEqual({ valid: true, counterexample: undefined, counterexamples: [], rowsChecked: 4, premisesInconsistent: false });
  });

  it('affirming the consequent is invalid (P=F, Q=T)', () => {
    const r = checkValidity([p('P → Q'), p('Q')], p('P'));
    expect(r.valid).toBe(false);
    expect(r.counterexample).toEqual({ P: false, Q: true });
    expect(r.counterexamples).toEqual([{ P: false, Q: true }]);
    expect(r.premisesInconsistent).toBe(false);
  });

  it('lists all counterexamples in table order', () => {
    const r = checkValidity([p('P ∨ Q')], p('P ∧ Q'));
    expect(r.counterexamples).toEqual([
      { P: true, Q: false },
      { P: false, Q: true },
    ]);
  });

  it('inconsistent premises make the argument vacuously valid', () => {
    const r = checkValidity([p('P'), p('¬P')], p('Q'));
    expect(r.valid).toBe(true);
    expect(r.premisesInconsistent).toBe(true);
  });

  it('no premises: valid iff the conclusion is a tautology', () => {
    expect(checkValidity([], p('P ∨ ¬P')).valid).toBe(true);
    const r = checkValidity([], p('P → Q'));
    expect(r.valid).toBe(false);
    expect(r.counterexample).toEqual({ P: true, Q: false });
  });

  it('hypothetical syllogism, disjunctive syllogism, contraposition', () => {
    expect(checkValidity([p('P → Q'), p('Q → R')], p('P → R')).valid).toBe(true);
    expect(checkValidity([p('P ∨ Q'), p('¬P')], p('Q')).valid).toBe(true);
    expect(checkValidity([p('P → Q')], p('¬Q → ¬P')).valid).toBe(true);
    expect(checkValidity([p('P → Q'), p('¬P')], p('¬Q')).counterexample).toEqual({ P: false, Q: true });
  });

  it('handles conclusion atoms absent from the premises', () => {
    const r = checkValidity([p('P')], p('Q'));
    expect(r.counterexample).toEqual({ P: true, Q: false });
    expect(r.rowsChecked).toBe(4);
  });
});

describe('checkEquivalence', () => {
  it('De Morgan', () => {
    expect(checkEquivalence(p('¬(P ∧ Q)'), p('¬P ∨ ¬Q'))).toEqual({ equivalent: true });
  });
  it('reports the first differing row', () => {
    expect(checkEquivalence(p('P → Q'), p('Q → P'))).toEqual({ equivalent: false, differingValuation: { P: true, Q: false } });
  });
  it('different atom sets', () => {
    expect(checkEquivalence(p('P'), p('P ∧ (Q ∨ ¬Q)')).equivalent).toBe(true);
    expect(checkEquivalence(p('P'), p('Q')).equivalent).toBe(false);
  });
});

describe('checkConsistency', () => {
  it('finds a model', () => {
    expect(checkConsistency([p('P ∨ Q'), p('¬P')])).toEqual({ consistent: true, model: { P: false, Q: true } });
  });
  it('detects inconsistency', () => {
    expect(checkConsistency([p('P → Q'), p('P'), p('¬Q')])).toEqual({ consistent: false });
  });
  it('the empty set is consistent', () => {
    expect(checkConsistency([])).toEqual({ consistent: true, model: {} });
  });
});
