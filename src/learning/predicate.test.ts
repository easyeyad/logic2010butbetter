import { alphaEquals, evaluateIn, findModel, freeVariables, namesOf, parse, parseOrThrow, predicatesOf, type Interpretation } from '../logic';
import { checkDerivation, solve } from '../proof';
import {
  INVALID_PREDICATE_FORMS,
  PREDICATE_SYMBOLIZATION_EXERCISES,
  PREDICATE_TERMINOLOGY_EXERCISES,
  PREDICATE_TOPICS,
  ProgressStore,
  QUANTIFIER_DERIVATION_EXERCISES,
  boundedEquivalent,
  checkAnswer,
  createMemoryStorage,
  createPracticeSession,
  describeWorld,
  exerciseLabel,
  generateExercise,
  generateModelExercise,
  generatePredicateCountermodel,
  getExerciseById,
  getHints,
  getSolution,
  type Difficulty,
  type PredicateSymbolizationExercise,
} from './index';

const DS: Difficulty[] = [1, 2, 3, 4, 5];
const byId = (id: string) => getExerciseById(id) as PredicateSymbolizationExercise;
const check = (id: string, formula: string) => checkAnswer(byId(id), { kind: 'predicate-symbolization', formula });

describe('predicate symbolization bank', () => {
  it('has at least 40 items across all difficulties, unique ids', () => {
    expect(PREDICATE_SYMBOLIZATION_EXERCISES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(PREDICATE_SYMBOLIZATION_EXERCISES.map((e) => e.id)).size).toBe(PREDICATE_SYMBOLIZATION_EXERCISES.length);
    for (const d of DS) expect(PREDICATE_SYMBOLIZATION_EXERCISES.some((e) => e.difficulty === d)).toBe(true);
  });

  it.each(PREDICATE_SYMBOLIZATION_EXERCISES.map((e) => [e.id, e] as const))('%s: answers are sentences over the key, alternatives equivalent', (_id, ex) => {
    const key = parseOrThrow(ex.answer);
    expect(freeVariables(key)).toEqual([]);
    for (const p of predicatesOf(key)) {
      const k = ex.key.find((e) => e.kind === 'predicate' && e.symbol === p.name);
      expect([p.name, k && k.kind === 'predicate' ? k.arity : -1]).toEqual([p.name, p.arity]);
    }
    for (const n of namesOf(key)) expect(ex.key.some((e) => e.kind === 'name' && e.symbol === n)).toBe(true);
    for (const alt of ex.alternatives) {
      const a = parseOrThrow(alt);
      expect([alt, boundedEquivalent(a, key).equivalent]).toEqual([alt, true]);
      expect(check(ex.id, alt).correct).toBe(true);
    }
    expect(check(ex.id, ex.answer).code).toBe('correct');
    expect(getHints(ex).length).toBeGreaterThanOrEqual(3);
  });
});

describe('predicate symbolization checking', () => {
  it('accepts alphabetic variants and ASCII-ish input as standard', () => {
    expect(check('psym-01', '∀y(Dy → My)').code).toBe('correct');
    expect(check('psym-19', '∀z∃wLzw').code).toBe('correct');
  });

  it('accepts equivalent non-standard answers with a bounded-search note', () => {
    const fb = check('psym-03', '∀x(Mx → ¬Fx)');
    expect(fb.correct).toBe(true);
    expect(fb.code).toBe('equivalent-nonstandard');
    expect(fb.details?.[0]).toMatch(/No world with up to \d objects/);
  });

  it('∀ with ∧ for "all F are G"', () => {
    const fb = check('psym-01', '∀x(Dx ∧ Mx)');
    expect(fb.code).toBe('universal-with-and');
    expect(fb.details?.[0]).toMatch(/^In a world with \d things? .*the sentence is (true|false), but your formula is (true|false)\.$/);
  });

  it('∃ with → for "some F are G"', () => {
    expect(check('psym-02', '∃x(Cx → Bx)').code).toBe('existential-with-conditional');
  });

  it('"only" converse', () => {
    const fb = check('psym-11', '∀x(Cx → Vx)');
    expect(fb.code).toBe('converse');
    expect(fb.headline).toMatch(/Only/);
  });

  it('"no" as "not all", and "not every" as "none"', () => {
    expect(check('psym-03', '¬∀x(Fx → Mx)').code).toBe('no-as-not-all');
    expect(check('psym-10', '∀x(Sx → ¬Px)').code).toBe('not-every-as-none');
  });

  it('quantifier order and scope', () => {
    expect(check('psym-20', '∀x∃yLxy').code).toBe('quantifier-order');
    expect(check('psym-25', '∃x(Cx → ∀ySy)').code).toBe('quantifier-scope');
  });

  it('argument order of relations', () => {
    expect(check('psym-08', 'Lab').code).toBe('argument-order');
  });

  it('free variables, wrong arity, unknown symbols and names', () => {
    const free = check('psym-01', '∀xDx → Mx');
    expect(free.code).toBe('free-variable');
    expect(free.headline).toContain('x');
    expect(check('psym-19', '∀x∃yLx').code).toBe('wrong-arity');
    expect(check('psym-01', '∀x(Dx → Qx)').code).toBe('unknown-predicate');
    expect(check('psym-04', 'Sc').code).toBe('unknown-name');
    expect(check('psym-01', 'D → M').code).toBe('sentence-letter');
    expect(check('psym-01', '∀x(Dx →').code).toBe('parse-error');
  });

  it('describes a distinguishing world in English using the key', () => {
    const ex = byId('psym-01');
    const fb = check('psym-01', '∃x(Dx ∧ Mx)');
    expect(fb.correct).toBe(false);
    expect(fb.details?.[0]).toMatch(/is a dog|is a mammal|nothing satisfies/);
    expect(ex.key.length).toBe(2);
  });

  it('sentential symbolization rejects predicate answers politely', () => {
    const fb = checkAnswer(getExerciseById('sym-007')!, { kind: 'symbolization', formula: '∀x(Rx → Wx)' });
    expect(fb.code).toBe('predicate-in-sentential');
  });
});

describe('model exercises', () => {
  it('labels agree with evaluateIn, both truth values occur, deterministic', () => {
    let t = 0;
    let fcount = 0;
    for (const d of DS)
      for (let s = 0; s < 30; s++) {
        const ex = generateModelExercise(d, s);
        expect(generateModelExercise(d, s)).toEqual(ex);
        const g = parseOrThrow(ex.formula);
        expect(ex.truth).toBe(evaluateIn(g, ex.model));
        if (ex.truth) t++;
        else fcount++;
        expect(checkAnswer(ex, { kind: 'model', value: ex.truth }).correct).toBe(true);
        const wrong = checkAnswer(ex, { kind: 'model', value: !ex.truth });
        expect(wrong.correct).toBe(false);
        expect(wrong.explanation.length).toBeGreaterThan(0);
      }
    expect(t).toBeGreaterThan(20);
    expect(fcount).toBeGreaterThan(20);
  });

  it('explains a false universal with a counterexample object', () => {
    const ex = generateModelExercise(2, 1);
    const custom = { ...ex, formula: '∀x(Fx → Gx)', model: { domainSize: 2, names: {}, predicates: { F: { arity: 1, extension: [[0], [1]] }, G: { arity: 1, extension: [[0]] } } } as Interpretation, truth: false };
    const fb = checkAnswer(custom, { kind: 'model', value: true });
    expect(fb.explanation).toContain('for x = #2');
  });
});

describe('predicate countermodels', () => {
  it('every form is invalid (a countermodel exists within 3 objects)', () => {
    for (const form of INVALID_PREDICATE_FORMS) {
      const r = findModel(form.premises.map(parseOrThrow), [parseOrThrow(form.conclusion)], { maxDomain: 3 });
      expect([form.name, r.status]).toEqual([form.name, 'found']);
    }
  });

  it('generated exercises: solution countermodel is accepted; symbols are complete', () => {
    for (const d of DS)
      for (let s = 0; s < 8; s++) {
        const ex = generatePredicateCountermodel(d, s);
        const all = [...ex.premises, ex.conclusion].map(parseOrThrow);
        expect(ex.predicates).toEqual(predicatesOf(...all));
        const r = findModel(ex.premises.map(parseOrThrow), [parseOrThrow(ex.conclusion)], { maxDomain: 3 });
        expect(r.status).toBe('found');
        expect(checkAnswer(ex, { kind: 'predicate-countermodel', model: r.model! }).correct).toBe(true);
        expect(getSolution(ex).summary).toMatch(/A countermodel/);
      }
  });

  it('explains incomplete or failing worlds', () => {
    const ex = generatePredicateCountermodel(1, 0);
    const empty: Interpretation = { domainSize: 1, names: {}, predicates: {} };
    const inc = checkAnswer(ex, { kind: 'predicate-countermodel', model: empty });
    expect(inc.code).toBe('incomplete-model');
    // A world making everything true/false typically fails
    const m: Interpretation = { domainSize: 1, names: Object.fromEntries(ex.names.map((n) => [n, 0])), predicates: Object.fromEntries(ex.predicates.map((p) => [p.name, p.arity === 0 ? { arity: 0, value: true } : { arity: p.arity, extension: [Array(p.arity).fill(0)] }])) };
    const fb = checkAnswer(ex, { kind: 'predicate-countermodel', model: m });
    if (!fb.correct) expect(fb.headline).toMatch(/Not a countermodel/);
  });

  it('describeWorld reads naturally with a key', () => {
    const m: Interpretation = { domainSize: 2, names: { a: 0 }, predicates: { L: { arity: 2, extension: [[0, 1]] }, S: { arity: 1, extension: [] } } };
    const text = describeWorld(m, [{ kind: 'name', symbol: 'a', meaning: 'Alice' }, { kind: 'predicate', symbol: 'L', arity: 2, meaning: 'x loves y' }, { kind: 'predicate', symbol: 'S', arity: 1, meaning: 'x is a student' }]);
    expect(text).toBe('a world with 2 things (Alice and #2) where Alice loves #2 and nothing satisfies "x is a student" (and nothing else holds)');
  });
});

describe('quantifier derivations', () => {
  it('has at least 15 problems, all without countermodels up to 4 objects', () => {
    expect(QUANTIFIER_DERIVATION_EXERCISES.length).toBeGreaterThanOrEqual(15);
    for (const ex of QUANTIFIER_DERIVATION_EXERCISES) {
      expect(ex.topic).toBe('quantifier-derivation');
      expect(ex.kind).toBe('derivation');
      const r = findModel(ex.premises.map(parseOrThrow), [parseOrThrow(ex.goal)], { maxDomain: 4 });
      expect([ex.id, r.status]).toEqual([ex.id, 'none-up-to-limit']);
    }
  });

  it('the prover proves every problem; its proof checks as complete and is offered as the solution', () => {
    let solved = 0;
    for (const ex of QUANTIFIER_DERIVATION_EXERCISES) {
      const lines = solve(ex.premises.map(parseOrThrow), parseOrThrow(ex.goal));
      if (!lines) continue;
      solved++;
      expect([ex.id, checkDerivation({ goal: ex.goal, lines }).complete]).toEqual([ex.id, true]);
      const sol = getSolution(ex);
      expect(sol.derivation?.lines.length).toBe(lines.length);
      expect(checkAnswer(ex, { kind: 'derivation', draft: sol.derivation! }).correct).toBe(true);
    }
    expect(solved).toBe(QUANTIFIER_DERIVATION_EXERCISES.length);
  });

  it('hints start with the quantifier strategy', () => {
    const ex = QUANTIFIER_DERIVATION_EXERCISES.find((e) => e.id === 'qder-05')!;
    expect(getHints(ex)[0]).toMatch(/Universal Derivation \(UD\)/);
    const ex3 = QUANTIFIER_DERIVATION_EXERCISES.find((e) => e.id === 'qder-03')!;
    expect(getHints(ex3)[0]).toMatch(/EG/);
  });
});

describe('predicate terminology', () => {
  it('bank items are answerable and parse', () => {
    expect(PREDICATE_TERMINOLOGY_EXERCISES.length).toBeGreaterThanOrEqual(15);
    for (const ex of PREDICATE_TERMINOLOGY_EXERCISES) {
      expect(ex.topic).toBe('predicate-terminology');
      if (ex.formula) expect(parse(ex.formula).ok).toBe(true);
      let fb;
      switch (ex.format) {
        case 'click-connective':
          fb = checkAnswer(ex, { kind: 'terminology', position: ex.connectiveIndex });
          break;
        case 'type-part':
        case 'type-formula':
        case 'fill-in':
          fb = checkAnswer(ex, { kind: 'terminology', text: ex.accepted![0] });
          break;
        case 'true-false':
          fb = checkAnswer(ex, { kind: 'terminology', value: ex.truth, choice: ex.correctOption });
          break;
        case 'multiple-choice':
          fb = checkAnswer(ex, { kind: 'terminology', choice: ex.correctOption });
          break;
      }
      expect([ex.id, fb.correct]).toEqual([ex.id, true]);
    }
  });

  it('main operator of a quantified formula is the quantifier (or the connective between quantified parts)', () => {
    const q = PREDICATE_TERMINOLOGY_EXERCISES.find((e) => e.id === 'pterm-08')!;
    expect(q.formula![q.connectiveIndex!]).toBe('∀');
    const c = PREDICATE_TERMINOLOGY_EXERCISES.find((e) => e.id === 'pterm-09')!;
    expect(c.formula![c.connectiveIndex!]).toBe('→');
  });
});

describe('predicate topics in sessions and progress', () => {
  it('every predicate topic generates exercises deterministically, with labels', () => {
    for (const t of PREDICATE_TOPICS)
      for (const d of DS) {
        const ex = generateExercise(t, d, 5);
        expect(generateExercise(t, d, 5)).toEqual(ex);
        expect(ex.topic).toBe(t);
        expect(exerciseLabel(ex).length).toBeGreaterThan(0);
        expect(getHints(ex).length).toBeGreaterThanOrEqual(2);
      }
  });

  it('a predicate session mixes the predicate topics; default mixed stays sentential', () => {
    const s = createPracticeSession({ topic: 'mixed', topics: [...PREDICATE_TOPICS], difficulty: 2, count: 10, seed: 4 });
    expect(new Set(s.exercises.map((e) => e.topic))).toEqual(new Set(PREDICATE_TOPICS));
    const d = createPracticeSession({ topic: 'mixed', difficulty: 2, count: 16, seed: 4 });
    expect(d.exercises.some((e) => PREDICATE_TOPICS.includes(e.topic))).toBe(false);
  });

  it('progress accepts predicate topics and keeps old stored data', () => {
    const old = JSON.stringify({ version: 1, createdAt: 0, attempts: [{ exerciseId: 'sym-001', topic: 'symbolization', difficulty: 1, correct: true, hintsUsed: 0, timeMs: 5, timestamp: 1 }], proofs: [] });
    const storage = createMemoryStorage({ 'logic-studio:progress': old });
    const store = new ProgressStore(storage);
    expect(store.loadIssue).toBeNull();
    store.recordAttempt({ exerciseId: 'psym-01', topic: 'predicate-symbolization', difficulty: 1, correct: false, hintsUsed: 0, timeMs: 5 });
    const again = new ProgressStore(storage);
    expect(again.getAttempts().map((a) => a.topic)).toEqual(['symbolization', 'predicate-symbolization']);
    expect(again.topicStats('predicate-symbolization').attempts).toBe(1);
  });
});

describe('alpha-equivalence sanity (contract)', () => {
  it('bank answers are alpha-equal to themselves renamed', () => {
    expect(alphaEquals(parseOrThrow('∀x∃yLxy'), parseOrThrow('∀z∃wLzw'))).toBe(true);
  });
});

describe('review round 3 fixes', () => {
  it('M1: 500 generated countermodel exercises are all genuinely invalid, and hints use only their own symbols', () => {
    for (const d of DS)
      for (let s = 0; s < 100; s++) {
        const ex = generatePredicateCountermodel(d, s * 7 + 1);
        const r = findModel(ex.premises.map(parseOrThrow), [parseOrThrow(ex.conclusion)], { maxDomain: 3 });
        expect([ex.premises.join(', ') + ' ⊢ ' + ex.conclusion, r.status]).toEqual([ex.premises.join(', ') + ' ⊢ ' + ex.conclusion, 'found']);
        const preds = new Set(ex.predicates.map((p) => p.name));
        const names = new Set(ex.names);
        for (const h of getHints(ex)) {
          // formula-like tokens: a capital letter followed only by names (a–e) / variables (u–z)
          for (const m of h.matchAll(/(?<![A-Za-z])([A-Z])([a-eu-z]{1,3})(?![A-Za-z])/g)) {
            expect([h, preds.has(m[1])]).toEqual([h, true]);
            for (const c of m[2]) if (c < 'u') expect([h, names.has(c)]).toEqual([h, true]);
          }
          if (h.startsWith('Why it fails')) {
            for (const m of h.matchAll(/(?<![A-Za-z])([A-Z])(?![A-Za-z])/g)) expect([h, preds.has(m[1])]).toEqual([h, true]);
            for (const m of h.matchAll(/(?<![A-Za-z])([a-z])(?![A-Za-z])/g)) expect([h, names.has(m[1])]).toEqual([h, true]);
          }
        }
      }
  });

  it('M1: renaming is injective (distinct names/predicates stay distinct)', () => {
    for (let s = 0; s < 200; s++) {
      const ex = generatePredicateCountermodel(5, s);
      if (ex.form === 'Symmetry to reflexivity') expect(ex.names).toHaveLength(2);
    }
  });

  it('minor 2: a session does not repeat an underlying form while alternatives remain', () => {
    for (const d of DS) {
      const forms = new Set(INVALID_PREDICATE_FORMS.filter((x) => x.difficulty === d).map((x) => x.name));
      const s = createPracticeSession({ topic: 'predicate-countermodel', difficulty: d, count: forms.size, seed: 11 + d });
      const used = s.exercises.map((e) => (e.kind === 'predicate-countermodel' ? e.form : ''));
      expect(new Set(used).size).toBe(forms.size);
    }
    const v = createPracticeSession({ topic: 'validity', difficulty: 1, count: 5, seed: 3 });
    const fs = v.exercises.map((e) => (e.kind === 'validity' ? e.form ?? e.id : ''));
    expect(new Set(fs).size).toBe(fs.length);
  });

  it('minor 8: moving a negation is not diagnosed as "reversed a conditional"', () => {
    const fb = check('psym-03', '∀x(¬Fx → Mx)');
    expect(fb.correct).toBe(false);
    expect(fb.code).not.toBe('converse');
    expect(fb.details?.[0]).toMatch(/^In a world with/);
    // a genuine converse is still named
    expect(check('psym-11', '∀x(Cx → Vx)').code).toBe('converse');
  });

  it('minor 9: every bank key is contingent (neither logically true nor logically false) up to 3 objects', () => {
    for (const ex of PREDICATE_SYMBOLIZATION_EXERCISES) {
      const k = parseOrThrow(ex.answer);
      expect([ex.id, findModel([k], [], { maxDomain: 3 }).status]).toEqual([ex.id, 'found']);
      expect([ex.id, findModel([], [k], { maxDomain: 3 }).status]).toEqual([ex.id, 'found']);
    }
    expect(check('psym-16', 'Sa → Sa').correct).toBe(false);
  });

  it('polish: qder-12 strategy hint does not send the student to EG', () => {
    const ex = QUANTIFIER_DERIVATION_EXERCISES.find((e) => e.id === 'qder-12')!;
    const h = getHints(ex);
    expect(h[0]).toMatch(/do not need EG/);
    expect(h.join(' ')).toMatch(/MP/);
  });
});

describe('identity (phase 4)', () => {
  const idItems = PREDICATE_SYMBOLIZATION_EXERCISES.filter((e) => e.tags.includes('identity'));

  it('has at least 15 identity symbolization items at difficulty 3–5', () => {
    expect(idItems.length).toBeGreaterThanOrEqual(15);
    for (const e of idItems) expect(e.difficulty).toBeGreaterThanOrEqual(3);
    for (const e of idItems) expect(parseOrThrow(e.answer)).toBeDefined();
  });

  it('diagnoses a missing x ≠ y in "at least two"', () => {
    const fb = check('pid-07', '∃x∃y((Sx ∧ Px) ∧ (Sy ∧ Py))');
    expect(fb.code).toBe('missing-distinctness');
    expect(fb.explanation).toMatch(/DIFFERENT/);
  });

  it('diagnoses "only a" without the uniqueness clause', () => {
    const fb = check('pid-05', 'Pa');
    expect(fb.code).toBe('missing-uniqueness');
    expect(fb.headline).toMatch(/Only Alice/);
  });

  it('diagnoses "exactly one" written as "at least one"', () => {
    const fb = check('pid-09', '∃x(Sx ∧ Px)');
    expect(fb.code).toBe('missing-uniqueness');
    expect(fb.headline).toMatch(/Exactly one/);
  });

  it('accepts the ≠ spelling and equivalent forms', () => {
    expect(check('pid-03', '∃x(Lax ∧ x ≠ a)').correct).toBe(true);
    expect(check('pid-08', '¬∃x∃y(((Sx ∧ Px) ∧ (Sy ∧ Py)) ∧ x ≠ y)').correct).toBe(true);
  });

  it('identity derivations: at least 6, valid, proved by the prover when it can', () => {
    const ids = QUANTIFIER_DERIVATION_EXERCISES.filter((e) => e.tags.includes('identity'));
    expect(ids.length).toBeGreaterThanOrEqual(6);
    for (const ex of ids) {
      expect([ex.id, findModel(ex.premises.map(parseOrThrow), [parseOrThrow(ex.goal)], { maxDomain: 4 }).status]).toEqual([ex.id, 'none-up-to-limit']);
      const lines = solve(ex.premises.map(parseOrThrow), parseOrThrow(ex.goal));
      if (lines) expect([ex.id, checkDerivation({ goal: ex.goal, lines }).complete]).toEqual([ex.id, true]);
    }
  });

  it('identity model and countermodel material', () => {
    const forms = INVALID_PREDICATE_FORMS.filter((x) => /=/.test(x.conclusion + x.premises.join()));
    expect(forms.length).toBeGreaterThanOrEqual(4);
    let sawIdentity = false;
    for (let s = 0; s < 60; s++) {
      const ex = generateModelExercise(5, s);
      if (ex.formula.includes('=') || ex.formula.includes('≠')) sawIdentity = true;
    }
    expect(sawIdentity).toBe(true);
  });

  it('identity terminology is in the bank', () => {
    const ids = PREDICATE_TERMINOLOGY_EXERCISES.filter((e) => e.concept === 'identity');
    expect(ids.length).toBeGreaterThanOrEqual(5);
  });
});

describe('review round 4 fixes', () => {
  it('1: "except" with the conditional reversed is diagnosed as a converse, not a missing uniqueness clause', () => {
    const fb = check('pid-06', '∀x(Px → ¬(x = b))');
    expect(fb.code).toBe('converse');
    expect(fb.details?.some((d) => /leaves out the rest/.test(d))).toBe(true);
    // a genuine missing uniqueness clause is still named
    expect(check('pid-05', 'Pa').code).toBe('missing-uniqueness');
  });

  it('2: one quantifier for "at least two" is "only at least one"; two quantifiers without ≠ is "forgot different"', () => {
    const one = check('pid-07', '∃x(Sx ∧ Px)');
    expect(one.code).toBe('at-least-one');
    expect(one.headline).toMatch(/at least one/);
    expect(check('pid-07', '∃x∃y((Sx ∧ Px) ∧ (Sy ∧ Py))').code).toBe('missing-distinctness');
  });

  it('3: every level has at least 6 countermodel forms, all genuinely invalid', () => {
    for (const d of DS) {
      const forms = INVALID_PREDICATE_FORMS.filter((x) => x.difficulty === d);
      expect([d, forms.length >= 6]).toEqual([d, true]);
      for (const f of forms) expect([f.name, findModel(f.premises.map(parseOrThrow), [parseOrThrow(f.conclusion)], { maxDomain: 3 }).status]).toEqual([f.name, 'found']);
    }
  });

  it('3: long sessions cycle through forms and never repeat a form twice in a row', () => {
    for (const d of DS)
      for (const seed of [1, 2, 3, 4, 5]) {
        const n = INVALID_PREDICATE_FORMS.filter((x) => x.difficulty === d).length;
        const s = createPracticeSession({ topic: 'predicate-countermodel', difficulty: d, count: 2 * n + 1, seed });
        const forms = s.exercises.map((e) => (e.kind === 'predicate-countermodel' ? e.form! : ''));
        for (let i = 1; i < forms.length; i++) expect([d, seed, i, forms[i] === forms[i - 1]]).toEqual([d, seed, i, false]);
        expect(new Set(forms.slice(0, n)).size).toBe(n); // first cycle uses every form once
      }
  });
});
