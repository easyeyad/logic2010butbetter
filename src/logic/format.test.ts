import { describe, expect, it } from 'vitest';
import { And, Atom, Iff, Implies, Not, Or, equals } from './ast';
import { format, formatWithSpans } from './format';
import { parse } from './parser';
import { randomFormula, seededRandom } from './random';

const P = Atom('P'), Q = Atom('Q'), R = Atom('R');

describe('format', () => {
  it('uses canonical spacing', () => {
    expect(format(Implies(And(P, Q), R))).toBe('(P ∧ Q) → R');
    expect(format(Not(Not(P)))).toBe('¬¬P');
    expect(format(Not(Or(P, Q)))).toBe('¬(P ∨ Q)');
    expect(format(Iff(Implies(P, Q), Implies(Not(Q), Not(P))))).toBe('(P → Q) ↔ (¬Q → ¬P)');
    expect(format(And(Not(P), Atom('Q1')))).toBe('¬P ∧ Q1');
    expect(format(P)).toBe('P');
  });

  it('dropOuter: false keeps outer parentheses', () => {
    expect(format(And(P, Q), { dropOuter: false })).toBe('(P ∧ Q)');
    expect(format(Not(P), { dropOuter: false })).toBe('¬P');
  });

  it('ascii', () => {
    expect(format(Iff(Implies(Not(P), Or(Q, R)), And(P, Q)), { ascii: true })).toBe('(~P -> (Q v R)) <-> (P & Q)');
  });

  it('round-trips through parse (random formulas, symbols and ascii)', () => {
    const random = seededRandom(2010);
    for (let i = 0; i < 3000; i++) {
      const f = randomFormula({ random, maxDepth: 5, atoms: ['P', 'Q', 'R', 'S1', 'A'] });
      for (const opts of [{}, { ascii: true }, { dropOuter: false }, { ascii: true, dropOuter: false }]) {
        const text = format(f, opts);
        const r = parse(text);
        if (!r.ok) throw new Error(`${text}: ${r.error.message}`);
        expect(equals(r.formula, f), text).toBe(true);
      }
    }
  });
});

describe('formatWithSpans', () => {
  it('reports post-order spans matching format()', () => {
    const f = Implies(And(P, Q), Not(R));
    const { text, spans } = formatWithSpans(f);
    expect(text).toBe(format(f));
    const slices = spans.map((s) => text.slice(s.span.start, s.span.end));
    expect(slices).toEqual(['P', 'Q', '(P ∧ Q)', 'R', '¬R', '(P ∧ Q) → ¬R']);
    expect(equals(spans[spans.length - 1].formula, f)).toBe(true);
  });

  it('every span re-parses to its formula', () => {
    const random = seededRandom(7);
    for (let i = 0; i < 500; i++) {
      const f = randomFormula({ random });
      for (const opts of [{}, { ascii: true }]) {
        const { text, spans } = formatWithSpans(f, opts);
        expect(text).toBe(format(f, opts));
        for (const { formula, span } of spans) {
          const r = parse(text.slice(span.start, span.end));
          expect(r.ok && equals(r.formula, formula)).toBe(true);
        }
      }
    }
  });
});
