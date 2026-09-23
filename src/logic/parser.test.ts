import { describe, expect, it } from 'vitest';
import { And, Atom, Iff, Implies, Not, Or, equals } from './ast';
import type { Formula } from './ast';
import { normalizeInput, parse, parseOrThrow } from './parser';
import type { ParseErrorCode } from './parser';

const P = Atom('P'), Q = Atom('Q'), R = Atom('R');

function ok(input: string): Formula {
  const r = parse(input);
  if (!r.ok) throw new Error(`expected "${input}" to parse, got ${r.error.code}: ${r.error.message}`);
  return r.formula;
}

function err(input: string, code: ParseErrorCode, spanText?: string) {
  const r = parse(input);
  if (r.ok) throw new Error(`expected "${input}" to fail with ${code}`);
  expect(r.error.code, `${input}: ${r.error.message}`).toBe(code);
  if (spanText !== undefined) expect(input.slice(r.error.span.start, r.error.span.end)).toBe(spanText);
  return r.error;
}

describe('parse: happy paths', () => {
  it.each<[string, Formula]>([
    ['P', P],
    ['Q1', Atom('Q1')],
    ['P23', Atom('P23')],
    ['¬P', Not(P)],
    ['¬¬P', Not(Not(P))],
    ['P ∧ Q', And(P, Q)],
    ['P ∨ Q', Or(P, Q)],
    ['P → Q', Implies(P, Q)],
    ['P ↔ Q', Iff(P, Q)],
    ['(P ∧ Q)', And(P, Q)],
    ['((P ∧ Q))', And(P, Q)],
    ['(P ∧ Q) → R', Implies(And(P, Q), R)],
    ['P ∧ (Q → R)', And(P, Implies(Q, R))],
    ['¬P ∧ Q', And(Not(P), Q)],
    ['¬(P ∨ Q)', Not(Or(P, Q))],
    ['[P ∧ Q] → {R ∨ P}', Implies(And(P, Q), Or(R, P))],
    ['{[(P)]}', P],
    ['  P   ∧\tQ  ', And(P, Q)],
    ['P∧Q', And(P, Q)],
    ['(P → Q) ↔ (¬Q → ¬P)', Iff(Implies(P, Q), Implies(Not(Q), Not(P)))],
    ['¬(¬P)', Not(Not(P))],
  ])('%s', (input, expected) => {
    expect(equals(ok(input), expected)).toBe(true);
  });

  it.each([
    // not
    ['~P', Not(P)], ['-P', Not(P)], ['!P', Not(P)], ['∼P', Not(P)], ['−P', Not(P)], ['--P', Not(Not(P))],
    // and
    ['P & Q', And(P, Q)], ['P ^ Q', And(P, Q)], ['P * Q', And(P, Q)], ['P · Q', And(P, Q)],
    // or
    ['P | Q', Or(P, Q)], ['P v Q', Or(P, Q)], ['(P)v(Q)', Or(P, Q)], ['(P v Q)', Or(P, Q)],
    // implies
    ['P -> Q', Implies(P, Q)], ['P > Q', Implies(P, Q)], ['P ⊃ Q', Implies(P, Q)], ['P => Q', Implies(P, Q)], ['P ⇒ Q', Implies(P, Q)], ['P->Q', Implies(P, Q)],
    // iff
    ['P <-> Q', Iff(P, Q)], ['P <> Q', Iff(P, Q)], ['P = Q', Iff(P, Q)], ['P ≡ Q', Iff(P, Q)], ['P <=> Q', Iff(P, Q)], ['P ⇔ Q', Iff(P, Q)],
    // mixed
    ['~(P & Q) -> (-R v Q)', Implies(Not(And(P, Q)), Or(Not(R), Q))],
    ['-P->Q', Implies(Not(P), Q)],
  ] as [string, Formula][])('alias %s', (input, expected) => {
    expect(equals(ok(input), expected)).toBe(true);
  });

  it('returns the normalized text', () => {
    const r = parse('~P & Q');
    expect(r.normalized).toBe('¬P ∧ Q');
  });

  it('parseOrThrow throws with the message', () => {
    expect(equals(parseOrThrow('P → Q'), Implies(P, Q))).toBe(true);
    expect(() => parseOrThrow('P ∧')).toThrow(/requires a formula on both sides/);
  });
});

describe('parse: errors', () => {
  it('missing left operand inside a formula: ¬(P ∧ → Q)', () => {
    const e = err('¬(P ∧ → Q)', 'missing-operand', '→ Q');
    expect(e.message).toMatch(/^→ requires a formula on both sides/);
    expect(e.message).toMatch(/nothing comes before it/);
  });

  it('missing right operand: P ∧', () => {
    const e = err('P ∧', 'missing-operand', '∧');
    expect(e.message).toBe('∧ requires a formula on both sides — nothing follows it.');
  });

  it('missing right operand before a close: (P ∧)', () => {
    err('(P ∧)', 'missing-operand', '∧');
  });

  it('missing operands at the start: → Q, ∧ P', () => {
    expect(err('→ Q', 'missing-operand', '→ Q').message).toMatch(/nothing comes before it/);
    err('∧ P', 'missing-operand', '∧ P');
    err('P ∧ ∧ Q', 'missing-operand', '∧ Q');
  });

  it('ASCII connectives are reported with their canonical symbol but spanned in the original', () => {
    const e = err('P ->', 'missing-operand', '->');
    expect(e.message).toMatch(/^→ requires/);
  });

  it('unbalanced open', () => {
    err('(P ∧ Q', 'unbalanced-open', '(');
    const e = err('P ∧ (Q', 'unbalanced-open', '(');
    expect(e.span).toEqual({ start: 4, end: 5 });
    err('(', 'unbalanced-open', '(');
    expect(err('((P ∧ Q)', 'unbalanced-open', '(').span).toEqual({ start: 0, end: 1 });
    expect(err('[P ∧ (Q → R]', 'mismatched-bracket', ']').message).toMatch(/“\(”/);
  });

  it('unbalanced close', () => {
    const e = err('P ∧ Q)', 'unbalanced-close', ')');
    expect(e.span).toEqual({ start: 5, end: 6 });
    err(')', 'unbalanced-close', ')');
    err('(P ∧ Q)) ', 'unbalanced-close', ')');
  });

  it('mismatched bracket', () => {
    const e = err('(P ∧ Q]', 'mismatched-bracket', ']');
    expect(e.message).toMatch(/\(/);
    err('[P}', 'mismatched-bracket', '}');
    err('(]', 'mismatched-bracket', ']');
  });

  it('missing connective', () => {
    const e = err('P Q', 'missing-connective', 'P Q');
    expect(e.message).toMatch(/P and Q/);
    err('(P)(Q)', 'missing-connective', '(P)(Q)');
    err('P ∧ Q R', 'missing-connective', 'Q R');
    err('P ¬Q', 'misplaced-connective', '¬');
  });

  it('lowercase atoms', () => {
    const e = err('p ∧ q', 'invalid-atom', 'p');
    expect(e.message).toBe('Sentence letters must be capital letters: did you mean P?');
    expect(err('P ∧ q1', 'invalid-atom', 'q1').message).toMatch(/did you mean Q1\?/);
    expect(err('PvQ', 'invalid-atom', 'v').message).toMatch(/∨/);
    err('foo', 'invalid-atom', 'foo');
  });

  it('run-together letters', () => {
    const e = err('PQ', 'invalid-atom', 'PQ');
    expect(e.message).toMatch(/single capital letters/);
    expect(e.hint).toMatch(/P ∧ Q/);
    err('R → PQ', 'invalid-atom', 'PQ');
  });

  it('empty parens', () => {
    const e = err('()', 'empty-parens', '()');
    expect(e.span).toEqual({ start: 0, end: 2 });
    err('P ∧ ( )', 'empty-parens', '( )');
  });

  it('empty input', () => {
    err('', 'empty');
    err('   ', 'empty');
  });

  it('unexpected characters', () => {
    err('P # Q', 'unexpected-char', '#');
    err('3P', 'unexpected-char', '3');
    err('P < Q', 'unexpected-char', '<');
    expect(err('P and Q', 'unexpected-char', 'and').message).toMatch(/∧/);
    err('P 😀 Q', 'unexpected-char', '😀');
  });

  it('negation alone', () => {
    const e = err('¬', 'missing-operand', '¬');
    expect(e.message).toMatch(/^¬ must be followed by a formula/);
    err('P ∧ ¬', 'missing-operand', '¬');
    err('(¬)', 'missing-operand', '¬');
    err('¬ ∧ P', 'missing-operand', '¬ ∧');
  });

  it('negation used as a binary connective', () => {
    const e = err('P ¬ Q', 'misplaced-connective', '¬');
    expect(e.message).toMatch(/¬ is not a binary connective/);
    expect(e.hint).toMatch(/P ∧ ¬Q/);
  });

  it('ambiguous chains', () => {
    const e = err('P ∧ Q ∨ R', 'ambiguous', 'P ∧ Q ∨ R');
    expect(e.hint).toBe('Add parentheses: (P ∧ Q) ∨ R or P ∧ (Q ∨ R)');
    const e2 = err('P ∧ Q ∧ R', 'ambiguous', 'P ∧ Q ∧ R');
    expect(e2.hint).toBe('Add parentheses: (P ∧ Q) ∧ R or P ∧ (Q ∧ R)');
    const e3 = err('P & Q | R -> S', 'ambiguous', 'P & Q | R -> S');
    expect(e3.hint).toMatch(/\(\(P ∧ Q\) ∨ R\) → S/);
    const e4 = err('¬(P ∧ Q ∨ ¬R) → S', 'ambiguous', 'P ∧ Q ∨ ¬R');
    expect(e4.hint).toMatch(/\(P ∧ Q\) ∨ ¬R/);
    err('(P → Q) ∧ R ∨ S', 'ambiguous', '(P → Q) ∧ R ∨ S');
  });

  it('reports the first error only (no cascading)', () => {
    err('P Q ∧ #', 'missing-connective');
    err('p ∧ (Q', 'invalid-atom', 'p');
    err('(P ∧ → Q', 'missing-operand', '→ Q');
  });

  it('never throws on arbitrary junk', () => {
    const chars = ['P', 'Q', '(', ')', '[', ']', '¬', '∧', '-', '>', '<', 'v', ' ', 'p', '#', '1', '='];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let n = 0; n < 3000; n++) {
      let s = '';
      const len = Math.floor(rnd() * 10);
      for (let i = 0; i < len; i++) s += chars[Math.floor(rnd() * chars.length)];
      const r = parse(s);
      if (!r.ok) {
        expect(r.error.span.start).toBeGreaterThanOrEqual(0);
        expect(r.error.span.end).toBeLessThanOrEqual(s.length);
        expect(r.error.span.start).toBeLessThanOrEqual(r.error.span.end);
        expect(r.error.message.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('normalizeInput', () => {
  it('converts aliases', () => {
    expect(normalizeInput('~P & Q -> R').text).toBe('¬P ∧ Q → R');
    expect(normalizeInput('P <-> Q').text).toBe('P ↔ Q');
    expect(normalizeInput('P <> Q').text).toBe('P ↔ Q');
    expect(normalizeInput('P <=> Q').text).toBe('P ↔ Q');
    expect(normalizeInput('P => Q').text).toBe('P → Q');
    expect(normalizeInput('P > Q').text).toBe('P → Q');
    expect(normalizeInput('P | Q ^ R * S').text).toBe('P ∨ Q ∧ R ∧ S');
    expect(normalizeInput('!P = -Q').text).toBe('¬P ↔ ¬Q');
    expect(normalizeInput('P ⊃ Q ≡ R · S').text).toBe('P → Q ↔ R ∧ S');
  });

  it('converts standalone lowercase v only', () => {
    expect(normalizeInput('P v Q').text).toBe('P ∨ Q');
    expect(normalizeInput('(P)v(Q)').text).toBe('(P)∨(Q)');
    expect(normalizeInput('PvQ').text).toBe('PvQ');
    expect(normalizeInput('very').text).toBe('very');
    expect(normalizeInput('P v1').text).toBe('P v1');
  });

  it('holds a trailing "-" or "=" (might become -> / =>)', () => {
    expect(normalizeInput('P -').text).toBe('P -');
    expect(normalizeInput('P <-').text).toBe('P <-');
    expect(normalizeInput('P <').text).toBe('P <');
    expect(normalizeInput('P =').text).toBe('P =');
    expect(normalizeInput('P <=').text).toBe('P <=');
    expect(normalizeInput('-P').text).toBe('¬P');
    expect(normalizeInput('P - Q').text).toBe('P ¬ Q');
  });

  it('holds "-" right before the caret when typing mid-string', () => {
    // User typed "-" between "P " and " Q": caret is right after it.
    expect(normalizeInput('P - Q', 3)).toEqual({ text: 'P - Q', caret: 3 });
    // then typed ">"
    expect(normalizeInput('P -> Q', 4)).toEqual({ text: 'P → Q', caret: 3 });
    // "<-" mid-string, then ">"
    expect(normalizeInput('P <- Q', 4).text).toBe('P <- Q');
    expect(normalizeInput('P <-> Q', 5)).toEqual({ text: 'P ↔ Q', caret: 3 });
  });

  it('simulates typing "P <-> Q" one key at a time', () => {
    let text = '';
    let caret = 0;
    for (const ch of 'P <-> Q') {
      text = text.slice(0, caret) + ch + text.slice(caret);
      caret += 1;
      ({ text, caret } = normalizeInput(text, caret));
    }
    expect(text).toBe('P ↔ Q');
    expect(caret).toBe(5);
  });

  it('simulates typing "~P & Q -> R" and "-P => Q"', () => {
    for (const [typed, want] of [['~P & Q -> R', '¬P ∧ Q → R'], ['-P => Q', '¬P → Q'], ['P = Q', 'P ↔ Q'], ['P v Q', 'P ∨ Q']]) {
      let text = '';
      let caret = 0;
      for (const ch of typed) {
        text = text.slice(0, caret) + ch + text.slice(caret);
        caret += 1;
        ({ text, caret } = normalizeInput(text, caret));
      }
      expect(text).toBe(want);
      expect(caret).toBe(want.length);
    }
  });

  it('maps the caret', () => {
    expect(normalizeInput('P -> Q', 6)).toEqual({ text: 'P → Q', caret: 5 });
    expect(normalizeInput('P -> Q', 2)).toEqual({ text: 'P → Q', caret: 2 });
    expect(normalizeInput('P <-> Q', 3)).toEqual({ text: 'P ↔ Q', caret: 3 }); // inside the alias → after symbol
    expect(normalizeInput('P & Q', 0)).toEqual({ text: 'P ∧ Q', caret: 0 });
    expect(normalizeInput('abc', 99).caret).toBe(3);
    expect(normalizeInput('abc', -5).caret).toBe(0);
  });

  it('is idempotent', () => {
    const samples = ['~P & Q -> R', 'P <-', 'P -', 'P <> Q = R', 'x v y', '((P)v-Q)=>R', 'P =', '<<->>', '---', '->-', 'P<=>Q'];
    for (const s of samples) {
      const once = normalizeInput(s);
      expect(normalizeInput(once.text).text, s).toBe(once.text);
      for (let c = 0; c <= s.length; c++) {
        const a = normalizeInput(s, c);
        expect(normalizeInput(a.text, a.caret), `${s} @${c}`).toEqual(a);
      }
    }
  });

  it('never changes what parse() accepts', () => {
    const samples = ['~P & (Q -> R)', '(P v Q) <-> -R', 'P => Q', '!(P ^ Q) = R', 'P * Q', 'P <> Q'];
    for (const s of samples) {
      const a = parse(s);
      const b = parse(normalizeInput(s).text);
      expect(a.ok && b.ok && equals(a.formula, b.formula), s).toBe(true);
    }
  });
});
