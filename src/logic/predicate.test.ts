import { describe, expect, it } from 'vitest';
import { Exists, Forall, Identity, Name, Not, Pred, Var, equals } from './ast';
import type { Formula } from './ast';
import { NotSententialError, atomsOf, complexity, evaluate, subformulas } from './evaluate';
import { format, formatWithSpans } from './format';
import { normalizeInput, parse, parseOrThrow as p } from './parser';
import type { ParseErrorCode } from './parser';
import {
  alphaEquals, arityConflicts, checkPredicateValidity, describeInterpretation, evaluateIn, findModel, freeVariables,
  freshVariable, isGeneralizationOf, isSentence, matchInstance, namesOf, predicatesOf, substitute, variablesOf,
} from './predicate';
import type { Interpretation } from './predicate';
import { randomFormula, seededRandom } from './random';
import { buildTruthTable, classify } from './truthTable';
import { isPredicateFormula as isPredicate } from './ast';
import { checkConsistency, checkEquivalence, checkValidity } from './validity';

const x = Var('x'), y = Var('y'), a = Name('a'), b = Name('b');

function err(input: string, code: ParseErrorCode, spanText?: string) {
  const r = parse(input);
  if (r.ok) throw new Error(`expected "${input}" to fail with ${code}`);
  expect(r.error.code, `${input}: ${r.error.message}`).toBe(code);
  if (spanText !== undefined) expect(input.slice(r.error.span.start, r.error.span.end)).toBe(spanText);
  return r.error;
}

describe('parse: predicate syntax', () => {
  it.each<[string, Formula]>([
    ['Fa', Pred('F', a)],
    ['Rab', Pred('R', a, b)],
    ['Gxy', Pred('G', x, y)],
    ['Fx1a2', Pred('F', Var('x1'), Name('a2'))],
    ['F1a', Pred('F1', a)],
    ['∀x Fx', Forall('x', Pred('F', x))],
    ['∀xFx', Forall('x', Pred('F', x))],
    ['∀ x Fx', Forall('x', Pred('F', x))],
    ['@x Fx', Forall('x', Pred('F', x))],
    ['$x Fx', Exists('x', Pred('F', x))],
    ['∃x¬Fx', Exists('x', Not(Pred('F', x)))],
    ['¬∃x Fx', Not(Exists('x', Pred('F', x)))],
    ['∀x∃y Rxy', Forall('x', Exists('y', Pred('R', x, y)))],
    ['∀x(Fx → Gx)', Forall('x', { kind: 'implies', left: Pred('F', x), right: Pred('G', x) })],
    ['∀x(Fx v Gx)', Forall('x', { kind: 'or', left: Pred('F', x), right: Pred('G', x) })],
    ['@x(Fx -> Gx)', Forall('x', { kind: 'implies', left: Pred('F', x), right: Pred('G', x) })],
    ['∀x Fx → Gx', { kind: 'implies', left: Forall('x', Pred('F', x)), right: Pred('G', x) }],
    ['P ∧ ∀x Fx', { kind: 'and', left: { kind: 'atom', name: 'P' }, right: Forall('x', Pred('F', x)) }],
    ['∀u∀w∀z Ruwz', Forall('u', Forall('w', Forall('z', Pred('R', Var('u'), Var('w'), Var('z')))))],
    ['∃x[Fx ∧ {Gx ∨ Ha}]', Exists('x', { kind: 'and', left: Pred('F', x), right: { kind: 'or', left: Pred('G', x), right: Pred('H', a) } })],
  ])('%s', (input, expected) => {
    const r = parse(input);
    if (!r.ok) throw new Error(r.error.message);
    expect(equals(r.formula, expected)).toBe(true);
  });

  it('normalizeInput converts @ and $', () => {
    expect(normalizeInput('@x(Fx -> $y Rxy)').text).toBe('∀x(Fx → ∃y Rxy)');
    expect(normalizeInput('@x(Fx v Gx)').text).toBe('∀x(Fx ∨ Gx)');
  });

  it('errors', () => {
    expect(err('∀Fx', 'bad-quantifier', '∀').message).toBe('∀ must be followed by a variable such as x.');
    err('∃', 'bad-quantifier', '∃');
    err('∀(Fx)', 'bad-quantifier', '∀');
    expect(err('∀a Fa', 'bad-quantifier', '∀a').message).toBe('a is a name; quantify a variable: x, y, z, w or u.');
    expect(err('x ∧ P', 'invalid-atom', 'x').message).toMatch(/must follow a predicate letter, e\.g\. Fx/);
    expect(err('R a b', 'invalid-atom', 'R a b').hint).toBe('Write Rab');
    expect(err('Fa b', 'invalid-atom', 'Fa b').hint).toBe('Write Fab');
    expect(err('∀x', 'missing-operand', '∀x').message).toMatch(/^∀x must be followed by a formula/);
    err('∀x ∧ P', 'missing-operand', '∀x ∧');
    err('(∃y)', 'missing-operand', '∃y');
    err('FaGb', 'invalid-atom', 'FaGb');
    err('Fx ∀y Gy', 'missing-connective', 'Fx ∀y Gy');
    err('∀vFv', 'invalid-atom', 'v');
    err('∀x Fx ∧ Gx ∨ Hx', 'ambiguous', '∀x Fx ∧ Gx ∨ Hx');
    err('∀x(Fx ∧ Gx ∨ Hx)', 'ambiguous', 'Fx ∧ Gx ∨ Hx');
    expect(err('p ∧ q', 'invalid-atom', 'p').message).toMatch(/did you mean P\?/);
  });

  it('deeply nested quantifiers are too-deep, not a crash', () => {
    const r = parse('∀x'.repeat(5000) + 'Fx');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('too-deep');
  });
});

describe('format: predicate formulas', () => {
  it('canonical style', () => {
    expect(format(p('∀x (Fx→Gx)'))).toBe('∀x(Fx → Gx)');
    expect(format(p('∀xFx'))).toBe('∀x Fx');
    expect(format(p('∃x ¬ Fx'))).toBe('∃x¬Fx');
    expect(format(p('∀x ∃y Rxy'))).toBe('∀x∃y Rxy');
    expect(format(p('Rab ∧ ∃x Rxa'))).toBe('Rab ∧ ∃x Rxa');
    expect(format(p('∀x(Fx → Gx)'), { ascii: true })).toBe('@x(Fx -> Gx)');
    expect(format(p('∃x(Fx v Gx)'), { ascii: true })).toBe('$x(Fx v Gx)');
  });

  it('round-trips random predicate formulas', () => {
    const random = seededRandom(42);
    for (let i = 0; i < 2000; i++) {
      const f = randomFormula({ random, predicate: true, maxDepth: 5 });
      expect(isSentence(f)).toBe(true);
      for (const opts of [{}, { ascii: true }, { dropOuter: false }]) {
        const text = format(f, opts);
        const r = parse(text);
        if (!r.ok) throw new Error(`${text}: ${r.error.message}`);
        expect(equals(r.formula, f), text).toBe(true);
      }
      const { text, spans } = formatWithSpans(f);
      for (const s of spans) {
        const piece = text.slice(s.span.start, s.span.end);
        const r = parse(piece);
        // In "a ≠ b" the inner identity shares the span of the whole negation.
        const want = s.formula.kind === 'identity' && piece.includes('≠') ? Not(s.formula) : s.formula;
        expect(r.ok && equals(r.formula, want)).toBe(true);
      }
    }
  });
});

describe('sentential tools on predicate input', () => {
  const f = p('∀x Fx → P');
  it('throw NotSententialError with a student-facing message', () => {
    for (const fn of [
      () => buildTruthTable([f]),
      () => classify(f),
      () => checkValidity([f], p('P')),
      () => checkEquivalence(f, p('P')),
      () => checkConsistency([f]),
      () => evaluate(f, { P: true }),
    ]) {
      expect(fn).toThrow(NotSententialError);
      expect(fn).toThrow('Truth tables only apply to sentential formulas; use Countermodels for quantified formulas.');
    }
  });
  it('atomsOf skips predications; subformulas/complexity handle quantifiers', () => {
    expect(atomsOf(p('(∀x Fx → P) ∧ Q'))).toEqual(['P', 'Q']);
    expect(subformulas(p('∀x(Fx → Gx)')).map((g) => format(g))).toEqual(['Fx → Gx', '∀x(Fx → Gx)']);
    expect(complexity(p('∀x∃y ¬Rxy'))).toBe(3);
  });
});

describe('symbols', () => {
  const f = p('∀x(Fx → ∃y Rxy) ∧ (Gz ∨ Hab)');
  it('free variables, names, variables, predicates', () => {
    expect(freeVariables(f)).toEqual(['z']);
    expect(freeVariables(p('Fx ∧ ∀x Gx'))).toEqual(['x']);
    expect(freeVariables(p('Ryx ∧ Fz'))).toEqual(['y', 'x', 'z']);
    expect(namesOf(f, p('Fa2 ∧ Fa10'))).toEqual(['a', 'a2', 'a10', 'b']);
    expect(variablesOf(f, p('∀w P'))).toEqual(['w', 'x', 'y', 'z']);
    expect(predicatesOf(f, p('P'))).toEqual([
      { name: 'F', arity: 1 }, { name: 'G', arity: 1 }, { name: 'H', arity: 2 }, { name: 'P', arity: 0 }, { name: 'R', arity: 2 },
    ]);
    expect(arityConflicts(p('Fa ∧ Fab'), p('F'))).toEqual([{ name: 'F', arities: [0, 1, 2] }]);
    expect(arityConflicts(f)).toEqual([]);
    expect(isSentence(f)).toBe(false);
    expect(isSentence(p('∀x Fx'))).toBe(true);
  });
  it('freshVariable', () => {
    expect(freshVariable(p('Fa'))).toBe('x');
    expect(freshVariable(p('∀x Fx ∧ Gy'))).toBe('z');
    expect(freshVariable(p('Rxy ∧ (Rzw ∧ ∀u Fu)'))).toBe('x1');
  });
});

describe('substitution', () => {
  it('replaces free occurrences only', () => {
    expect(format(substitute(p('Fx ∧ ∀x Gx'), 'x', a)!)).toBe('Fa ∧ ∀x Gx');
    expect(format(substitute(p('∃y Rxy'), 'x', a)!)).toBe('∃y Ray');
    expect(format(substitute(p('∃y Rxy'), 'x', Var('z'))!)).toBe('∃y Rzy');
    expect(format(substitute(p('P'), 'x', a)!)).toBe('P');
  });
  it('returns null on capture', () => {
    expect(substitute(p('∃y Rxy'), 'x', y)).toBeNull();
    expect(substitute(p('∀y(Fy → Gx)'), 'x', y)).toBeNull();
    // y bound but x not free under it: no capture
    expect(format(substitute(p('∃y Fy ∧ Gx'), 'x', y)!)).toBe('∃y Fy ∧ Gy');
  });
});

describe('matchInstance / isGeneralizationOf', () => {
  const body = p('Fx → Gx');
  it('UI-style instances', () => {
    expect(matchInstance(body, 'x', p('Fa → Ga'))).toEqual(a);
    expect(matchInstance(body, 'x', p('Fy → Gy'))).toEqual(y);
    expect(matchInstance(body, 'x', p('Fa → Gb'))).toBeNull();
    expect(matchInstance(body, 'x', p('Fa → Ha'))).toBeNull();
    expect(matchInstance(p('Fx ∧ P'), 'x', p('Fx ∧ P'))).toEqual(x);
    expect(matchInstance(p('Fa'), 'x', p('Fa'))).toBe('vacuous');
    expect(matchInstance(p('Fa'), 'x', p('Fb'))).toBeNull();
    expect(matchInstance(p('∃y Rxy'), 'x', p('∃y Ryy'))).toBeNull(); // y not free for x
    expect(matchInstance(p('Fx ∧ ∀x Gx'), 'x', p('Fa ∧ ∀x Gx'))).toEqual(a);
    expect(matchInstance(p('Fx ∧ ∀x Gx'), 'x', p('Fa ∧ ∀x Ga'))).toBeNull();
    expect(matchInstance(p('Rxa'), 'x', p('Raa'))).toEqual(a);
  });
  it('EG: some occurrences may be generalized', () => {
    expect(isGeneralizationOf(p('∃x Rxa'), p('Raa'))).toBe(true);
    expect(isGeneralizationOf(p('∃x Rax'), p('Raa'))).toBe(true);
    expect(isGeneralizationOf(p('∃x Rxx'), p('Raa'))).toBe(true);
    expect(isGeneralizationOf(p('∃x Rxx'), p('Rab'))).toBe(false);
    expect(isGeneralizationOf(p('∃x(Fx ∧ Ga)'), p('Fa ∧ Ga'))).toBe(true);
    expect(isGeneralizationOf(p('∃x Fx'), p('Fy'))).toBe(true);
    expect(isGeneralizationOf(p('∃x P'), p('P'))).toBe(true);
    expect(isGeneralizationOf(p('∃x ∀y Rxy'), p('∀y Ryy'))).toBe(false);
    expect(isGeneralizationOf(p('Fa'), p('Fa'))).toBe(false);
  });
});

describe('alphaEquals', () => {
  it('ignores bound variable names only', () => {
    expect(alphaEquals(p('∀x Fx'), p('∀y Fy'))).toBe(true);
    expect(alphaEquals(p('∀x∃y Rxy'), p('∀y∃x Ryx'))).toBe(true);
    expect(alphaEquals(p('∀x∃y Rxy'), p('∀y∃x Rxy'))).toBe(false);
    expect(alphaEquals(p('∀x Rxz'), p('∀y Ryz'))).toBe(true);
    expect(alphaEquals(p('∀x Rxz'), p('∀z Rzz'))).toBe(false);
    expect(alphaEquals(p('Fx'), p('Fy'))).toBe(false);
    expect(alphaEquals(p('∀x Fx'), p('∃x Fx'))).toBe(false);
  });
});

describe('evaluateIn', () => {
  const m: Interpretation = {
    domainSize: 3,
    names: { a: 0, b: 2 },
    predicates: {
      F: { arity: 1, extension: [[0], [1]] },
      R: { arity: 2, extension: [[0, 1], [1, 2], [2, 0]] },
      P: { arity: 0, value: true },
    },
  };
  it.each([
    ['Fa', true], ['Fb', false], ['Rab', false], ['Rba', true], ['P', true],
    ['∃x ¬Fx', true], ['∀x Fx', false], ['∀x∃y Rxy', true], ['∃y∀x Rxy', false], ['∀x(Fx → ∃y(Rxy ∧ ¬Fy))', false],
    ['∀x ¬Rxx', true], ['∃x(Fx ∧ Rxb)', true],
  ] as [string, boolean][])('%s = %s', (s, v) => {
    expect(evaluateIn(p(s), m)).toBe(v);
  });
  it('uses the assignment for free variables', () => {
    expect(evaluateIn(p('Fx'), m, { x: 2 })).toBe(false);
    expect(evaluateIn(p('Fx ∧ ∀x Fx'), m, { x: 0 })).toBe(false);
    expect(() => evaluateIn(p('Fx'), m)).toThrow(/free/);
    expect(() => evaluateIn(p('Gc'), m)).toThrow();
  });
  it('describeInterpretation', () => {
    expect(describeInterpretation(m)).toEqual(['Domain: {1, 2, 3}', 'a = 1', 'b = 3', 'F: {1, 2}', 'P: true', 'R: {⟨1,2⟩, ⟨2,3⟩, ⟨3,1⟩}']);
    expect(describeInterpretation({ domainSize: 1, names: {}, predicates: { G: { arity: 1, extension: [] } } })).toEqual(['Domain: {1}', 'G: ∅']);
  });
});

describe('findModel / checkPredicateValidity', () => {
  const check = (ps: string[], c: string) => {
    const t0 = performance.now();
    const r = checkPredicateValidity(ps.map(p), p(c));
    const ms = performance.now() - t0;
    if (r.countermodel) {
      for (const q of ps) expect(evaluateIn(p(q), r.countermodel)).toBe(true);
      expect(evaluateIn(p(c), r.countermodel)).toBe(false);
    }
    return { ...r, ms };
  };

  it('∀x(Fx→Gx), Ga ⊢ Fa is invalid', () => {
    const r = check(['∀x(Fx → Gx)', 'Ga'], 'Fa');
    expect(r.status).toBe('invalid');
    expect(r.countermodel!.domainSize).toBe(1);
    expect(r.ms).toBeLessThan(500);
  });
  it('∃xFx ⊢ ∀xFx is invalid with 2 objects', () => {
    const r = check(['∃x Fx'], '∀x Fx');
    expect(r.status).toBe('invalid');
    expect(r.countermodel!.domainSize).toBe(2);
    expect(r.searchedUpTo).toBe(1);
  });
  it('∀x∃yRxy ⊢ ∃y∀xRxy is invalid', () => {
    const r = check(['∀x∃y Rxy'], '∃y∀x Rxy');
    expect(r.status).toBe('invalid');
    expect(r.countermodel!.domainSize).toBe(2);
    expect(r.ms).toBeLessThan(500);
  });
  it('∀xFx ⊢ ∃xFx: no countermodel', () => {
    const r = check(['∀x Fx'], '∃x Fx');
    expect(r.status).toBe('no-countermodel-found');
    expect(r.searchedUpTo).toBe(4);
    expect(r.explanation).toMatch(/No countermodel with up to 4 objects/);
  });
  it('syllogism Barbara: no countermodel, fast', () => {
    const r = check(['∀x(Fx → Gx)', '∀x(Gx → Hx)'], '∀x(Fx → Hx)');
    expect(r.status).toBe('no-countermodel-found');
    expect(r.ms).toBeLessThan(500);
  });
  it('needs 3 objects: irreflexive serial relation without 2-cycles', () => {
    const r = check(['∀x∃y Rxy', '∀x ¬Rxx'], '∃x∃y(Rxy ∧ Ryx)');
    expect(r.status).toBe('invalid');
    expect(r.countermodel!.domainSize).toBe(3);
    expect(r.ms).toBeLessThan(500);
  });
  it('transitive + irreflexive ⊢ asymmetric (valid; full search to 4) within budget', () => {
    const r = check(['∀x∀y∀z((Rxy ∧ Ryz) → Rxz)', '∀x ¬Rxx'], '∀x∀y(Rxy → ¬Ryx)');
    expect(r.status).toBe('no-countermodel-found');
    expect(r.ms).toBeLessThan(1000);
  });
  it('names and open formulas', () => {
    const r = check(['Fa', 'Gb'], 'Fb');
    expect(r.status).toBe('invalid');
    expect(r.countermodel!.names).toEqual({ a: 0, b: 1 });
    const m = findModel([p('Fx')], [p('Fy')]);
    expect(m.status).toBe('found');
    expect(m.model!.names).toEqual({ x: 0, y: 1 });
  });
  it('sentential arguments are decided exactly', () => {
    expect(check(['P → Q', 'P'], 'Q').status).toBe('valid');
    const r = check(['P → Q', 'Q'], 'P');
    expect(r.status).toBe('invalid');
    expect(r.countermodel!.predicates).toEqual({ P: { arity: 0, value: false }, Q: { arity: 0, value: true } });
  });
  it('mixed sentence letters and quantifiers', () => {
    expect(check(['P → ∀x Fx', 'P'], 'Fa').status).toBe('no-countermodel-found');
    expect(check(['P ∨ ∃x Fx'], 'P').status).toBe('invalid');
  });
  it('findModel for consistency, and inconsistency', () => {
    expect(findModel([p('∃x Fx'), p('∃x ¬Fx')], []).model!.domainSize).toBe(2);
    const r = findModel([p('∀x Fx'), p('¬Fa')], [], { maxDomain: 3 });
    expect(r.status).toBe('none-up-to-limit');
    expect(r.searchedUpTo).toBe(3);
  });
  it('arity conflicts are reported, not thrown', () => {
    const r = findModel([p('Fa ∧ Fab')], []);
    expect(r.status).toBe('too-large');
    expect(r.note).toMatch(/F is used with different numbers of terms/);
  });
  it('gives up gracefully on a tiny time budget', () => {
    const big = p('∀x∀y∀z∀w(((Rxy ∧ Ryz) ∧ Rzw) → Rxw)');
    const r = findModel([big, p('∀x∃y Rxy'), p('∀x ¬Rxx')], [], { maxDomain: 8, timeBudgetMs: 5 });
    expect(['too-large', 'found']).toContain(r.status);
  });
  it('agrees with direct evaluation on random formulas (models found really are models)', () => {
    const random = seededRandom(99);
    for (let i = 0; i < 150; i++) {
      const f = randomFormula({ random, predicate: true, maxDepth: 3 });
      const r = findModel([f], [], { maxDomain: 3 });
      if (r.status === 'found') expect(evaluateIn(f, r.model!)).toBe(true);
      else expect(r.status).toBe('none-up-to-limit');
    }
  });
});


describe('identity', () => {
  const c = Name('c');
  it('parses', () => {
    const cases: [string, Formula][] = [
      ['a = b', Identity(a, b)],
      ['x=y', Identity(x, y)],
      ['a ≠ b', Not(Identity(a, b))],
      ['a != b', Not(Identity(a, b))],
      ['¬a = b', Not(Identity(a, b))],
      ['¬a ≠ b', Not(Not(Identity(a, b)))],
      ['a = b ∧ Fa', { kind: 'and', left: Identity(a, b), right: Pred('F', a) }],
      ['∀x x = x', Forall('x', Identity(x, x))],
      ['∀x(x = a → Fx)', Forall('x', { kind: 'implies', left: Identity(x, a), right: Pred('F', x) })],
      ['∃x∃y x ≠ y', Exists('x', Exists('y', Not(Identity(x, y))))],
      ['(b = c)', Identity(b, c)],
    ];
    for (const [s, f] of cases) {
      const r = parse(s);
      if (!r.ok) throw new Error(`${s}: ${r.error.message}`);
      expect(equals(r.formula, f), s).toBe(true);
    }
  });
  it('= is no longer an alias for ↔', () => {
    const e = err('P = Q', 'misplaced-connective', '=');
    expect(e.hint).toBe('For “if and only if” use ↔ (type <->).');
    expect(err('Fa = b', 'misplaced-connective', '=').message).toBe('= goes between two terms, e.g. a = b.');
    expect(parse('P => Q').ok).toBe(true);
    expect(parse('P <=> Q').ok).toBe(true);
  });
  it('errors', () => {
    expect(err('a = ', 'missing-operand', '=').message).toBe('= needs a term on each side — nothing follows it.');
    expect(err('= b', 'missing-operand', '= b').message).toMatch(/nothing comes before it/);
    err('(a ≠)', 'missing-operand', '≠');
    err('a = P', 'misplaced-connective', 'a = P');
    const chain = err('a = b = c', 'misplaced-connective', 'a = b = c');
    expect(chain.message).toMatch(/can't be chained/);
    expect(chain.hint).toBe('Write a = b ∧ b = c');
    expect(err('x ≠ y ≠ z', 'misplaced-connective', 'x ≠ y ≠ z').hint).toBe('Write x ≠ y ∧ y ≠ z');
    expect(err('a==b', 'unexpected-char', '==').message).toBe('Use a single = for identity, as in a = b.');
    err('a === b', 'unexpected-char', '===');
    const ne = err('P != Q', 'misplaced-connective', '!=');
    expect(ne.message).toMatch(/≠ is for terms, as in a ≠ b/);
    expect(ne.message).toMatch(/Did you mean ¬\(P ↔ Q\)\?/);
    expect(ne.message).not.toMatch(/if and only if/);
    err('P ≠ Q', 'misplaced-connective', '≠');
    const slash = err('a =/= b', 'unexpected-char', '=/=');
    expect(slash.message).toMatch(/≠ \(type !=\)/);
    expect(slash.message).not.toMatch(/sentential/);
    err('a ∧ P', 'invalid-atom', 'a');
    err('F a = b', 'missing-connective', 'F a = b');
  });
  it('formats', () => {
    expect(format(Identity(a, b))).toBe('a = b');
    expect(format(Not(Identity(a, b)))).toBe('a ≠ b');
    expect(format(Not(Identity(a, b)), { ascii: true })).toBe('a != b');
    expect(format(Not(Not(Identity(a, b))))).toBe('¬a ≠ b');
    expect(format(p('∀x∀y(x = y ∨ x ≠ y)'))).toBe('∀x∀y(x = y ∨ x ≠ y)');
    expect(format(Forall('x', Identity(x, x)))).toBe('∀x x = x');
    expect(format(Forall('x', Not(Identity(x, a))))).toBe('∀x x ≠ a');
  });
  it('symbols and substitution', () => {
    const f = p('∀x(x = a → Rxy)');
    expect(freeVariables(f)).toEqual(['y']);
    expect(namesOf(p('a = b ∧ c ≠ a'))).toEqual(['a', 'b', 'c']);
    expect(variablesOf(p('x = y'))).toEqual(['x', 'y']);
    expect(predicatesOf(p('a = b ∧ Fa'))).toEqual([{ name: 'F', arity: 1 }]);
    expect(format(substitute(p('x = a ∧ ∀x x = x'), 'x', b)!)).toBe('b = a ∧ ∀x x = x');
    expect(substitute(p('∃y x ≠ y'), 'x', y)).toBeNull();
    expect(matchInstance(p('x = a'), 'x', p('b = a'))).toEqual(b);
    expect(matchInstance(p('x = x'), 'x', p('a = b'))).toBeNull();
    expect(isGeneralizationOf(p('∃x x = a'), p('a = a'))).toBe(true);
    expect(isGeneralizationOf(p('∃x a = x'), p('a = a'))).toBe(true);
    expect(alphaEquals(p('∀x x = a'), p('∀y y = a'))).toBe(true);
    expect(alphaEquals(p('∀x x = y'), p('∀y y = y'))).toBe(false);
    expect(isPredicate(p('a = b'))).toBe(true);
  });
  it('evaluateIn: same object', () => {
    const m: Interpretation = { domainSize: 2, names: { a: 0, b: 0, c: 1 }, predicates: {} };
    expect(evaluateIn(p('a = b'), m)).toBe(true);
    expect(evaluateIn(p('a = c'), m)).toBe(false);
    expect(evaluateIn(p('a ≠ c'), m)).toBe(true);
    expect(evaluateIn(p('∃x∃y x ≠ y'), m)).toBe(true);
    expect(evaluateIn(p('∀x∀y x = y'), m)).toBe(false);
  });
  it('countermodels', () => {
    const v = (ps: string[], c: string) => checkPredicateValidity(ps.map(p), p(c));
    expect(v(['a = b', 'Fa'], 'Fb').status).toBe('no-countermodel-found');
    expect(v(['Fa', '¬Fb'], 'a ≠ b').status).toBe('no-countermodel-found');
    expect(v(['∀x∀y x = y'], 'Fa → Fb').status).toBe('no-countermodel-found');
    const r = v(['a = b'], 'b = c');
    expect(r.status).toBe('invalid');
    expect(r.countermodel!.names.b).not.toBe(r.countermodel!.names.c);
    const m = findModel([p('∃x∃y x ≠ y')], []);
    expect(m.status).toBe('found');
    expect(m.model!.domainSize).toBe(2);
    expect(m.searchedUpTo).toBe(1);
    expect(v(['∃x∀y(Fy ↔ y = x)'], '∀x∀y((Fx ∧ Fy) → x = y)').status).toBe('no-countermodel-found');
    const three = findModel([p('∃x∃y∃z((x ≠ y ∧ y ≠ z) ∧ x ≠ z)')], []);
    expect(three.model!.domainSize).toBe(3);
  });
});
