import { buildTruthTable, checkValidity, classify, equals, parse, parseOrThrow } from '../logic';
import {
  ARGUMENT_FORMS,
  TERMINOLOGY_EXERCISES,
  TOPICS,
  checkAnswer,
  connectivePositions,
  diagnoseWff,
  generateCountermodel,
  generateExercise,
  generateInferenceRule,
  generateTerminology,
  generateTruthTable,
  generateValidity,
  generateWff,
  getHints,
  getSolution,
  mainConnectiveIndex,
  ruleJustifies,
  rulesJustifying,
  type Difficulty,
  type Exercise,
} from './index';

const DS: Difficulty[] = [1, 2, 3, 4, 5];
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 3);

describe('determinism', () => {
  it('every topic generator is deterministic in (difficulty, seed)', () => {
    for (const t of TOPICS) for (const d of DS) for (const s of [1, 99]) expect(generateExercise(t, d, s)).toEqual(generateExercise(t, d, s));
  });

  it('exercises are JSON round-trippable', () => {
    for (const t of TOPICS) {
      const ex = generateExercise(t, 3, 5);
      expect(JSON.parse(JSON.stringify(ex))).toEqual(ex);
    }
  });

  it('every generated exercise has hints and a solution', () => {
    for (const t of TOPICS)
      for (const d of DS) {
        const ex = generateExercise(t, d, 11);
        expect(ex.topic === ex.kind || (ex.kind === 'derivation' && ex.topic === 'quantifier-derivation') || (ex.kind === 'terminology' && ex.topic === 'predicate-terminology')).toBe(true);
        expect(getHints(ex).length).toBeGreaterThanOrEqual(2);
        expect(getSolution(ex).summary.length).toBeGreaterThan(0);
      }
  });
});

describe('WFF generator', () => {
  it("labels agree with parse(), and both kinds occur", () => {
    let good = 0;
    let bad = 0;
    for (const d of DS)
      for (const s of SEEDS) {
        const ex = generateWff(d, s);
        const r = parse(ex.formula);
        expect(ex.wellFormed).toBe(r.ok);
        if (r.ok) good++;
        else {
          bad++;
          expect(ex.errorSpan).toEqual(diagnoseWff(ex.formula)!.span);
          expect(ex.errorCode).toBe(r.error.code);
        }
      }
    expect(good).toBeGreaterThan(40);
    expect(bad).toBeGreaterThan(40);
  });

  it('produces every kind of defect', () => {
    const defects = new Set<string>();
    for (const d of DS) for (let s = 0; s < 150; s++) {
      const ex = generateWff(d, s);
      if (ex.defect) defects.add(ex.defect);
    }
    for (const x of ['missing-paren', 'dangling-connective', 'lowercase-atom', 'ambiguous-chain', 'missing-connective', 'misplaced-negation']) expect(defects.has(x)).toBe(true);
  });

  it('the prompt does not give the answer away', () => {
    const prompts = new Set(SEEDS.map((s) => generateWff(3, s).prompt));
    expect(prompts.size).toBe(1);
  });

  it('checks answers, including the error location', () => {
    const bad = SEEDS.map((s) => generateWff(3, s)).find((e) => !e.wellFormed && e.errorSpan!.end - e.errorSpan!.start < 3)!;
    const good = SEEDS.map((s) => generateWff(3, s)).find((e) => e.wellFormed)!;
    expect(checkAnswer(good, { kind: 'wff', wellFormed: true }).correct).toBe(true);
    const wrong = checkAnswer(good, { kind: 'wff', wellFormed: false });
    expect(wrong.correct).toBe(false);
    expect(wrong.code).toBe('is-well-formed');
    const miss = checkAnswer(bad, { kind: 'wff', wellFormed: true });
    expect(miss.correct).toBe(false);
    expect(miss.highlight?.[0].target).toBe('formula');
    expect(checkAnswer(bad, { kind: 'wff', wellFormed: false }).partial).toBe(true); // location required
    expect(checkAnswer(bad, { kind: 'wff', wellFormed: false, errorAt: bad.errorSpan!.start }).correct).toBe(true);
    const far = bad.errorSpan!.start > 5 ? 0 : bad.formula.length - 1;
    if (Math.abs(far - bad.errorSpan!.start) > 3) expect(checkAnswer(bad, { kind: 'wff', wellFormed: false, errorAt: far }).code).toBe('wrong-location');
  });
});

describe('truth-table generator', () => {
  it('classification labels agree with classify(), all classes occur', () => {
    const seen = new Set<string>();
    for (const d of DS)
      for (const s of SEEDS) {
        const ex = generateTruthTable(d, s, 'classify');
        expect(ex.classification).toBe(classify(parseOrThrow(ex.formula)));
        seen.add(ex.classification);
      }
    expect(seen).toEqual(new Set(['tautology', 'contradiction', 'contingent']));
  });

  it('checks classification with a witness row', () => {
    const ex = generateTruthTable(2, 1, 'classify');
    const wrong = (['tautology', 'contradiction', 'contingent'] as const).find((c) => c !== ex.classification)!;
    expect(checkAnswer(ex, { kind: 'truth-table', classification: ex.classification }).correct).toBe(true);
    const fb = checkAnswer(ex, { kind: 'truth-table', classification: wrong });
    expect(fb.correct).toBe(false);
    expect(fb.code).toBe('wrong-classification');
  });

  it('checks filled main columns and full grids', () => {
    const ex = generateTruthTable(3, 4, 'fill');
    const table = buildTruthTable([parseOrThrow(ex.formula)]);
    const main = table.mainColumns[0];
    const values = table.rows.map((r) => r[main]);
    expect(checkAnswer(ex, { kind: 'truth-table', values }).correct).toBe(true);
    const flipped = values.map((v, i) => (i === 1 ? !v : v));
    const fb = checkAnswer(ex, { kind: 'truth-table', values: flipped });
    expect(fb.correct).toBe(false);
    expect(fb.headline).toContain('2');
    expect(fb.valuation).toEqual(table.valuations[1]);
    const blank = values.map((v, i) => (i === 0 ? null : v));
    expect(checkAnswer(ex, { kind: 'truth-table', values: blank }).code).toBe('incomplete');
    // full grid with one wrong inner cell
    const cells = table.rows.map((r) => [...r]);
    const inner = table.columns.findIndex((c) => !c.isAtom && !c.isMain);
    if (inner >= 0) {
      cells[0][inner] = !cells[0][inner];
      const g = checkAnswer(ex, { kind: 'truth-table', cells });
      expect(g.code).toBe('wrong-cell');
      expect(g.headline).toContain(table.columns[inner].label);
    }
  });
});

describe('validity & countermodel generators', () => {
  it('labels agree with checkValidity; both valid and invalid occur', () => {
    let valid = 0;
    let invalid = 0;
    for (const d of DS)
      for (const s of SEEDS) {
        const ex = generateValidity(d, s);
        const r = checkValidity(ex.premises.map(parseOrThrow), parseOrThrow(ex.conclusion));
        expect(ex.valid).toBe(r.valid);
        expect(r.premisesInconsistent).toBe(false);
        if (ex.valid) valid++;
        else invalid++;
      }
    expect(valid).toBeGreaterThan(40);
    expect(invalid).toBeGreaterThan(40);
  });

  it('named argument forms are labelled correctly', () => {
    for (const form of ARGUMENT_FORMS) {
      const r = checkValidity(form.premises.map(parseOrThrow), parseOrThrow(form.conclusion));
      expect([form.name, r.valid]).toEqual([form.name, form.valid]);
    }
  });

  it('countermodel exercises are always invalid, and their solutions are countermodels', () => {
    for (const d of DS)
      for (const s of SEEDS.slice(0, 15)) {
        const ex = generateCountermodel(d, s);
        expect(checkValidity(ex.premises.map(parseOrThrow), parseOrThrow(ex.conclusion)).valid).toBe(false);
        const sol = getSolution(ex);
        expect(checkAnswer(ex, { kind: 'countermodel', valuation: sol.valuation! }).correct).toBe(true);
      }
  });

  it('explains why a proposed valuation is not a countermodel', () => {
    const ex = generateCountermodel(1, 3);
    const sol = getSolution(ex).valuation!;
    // flip every letter: very likely breaks it
    const flipped = Object.fromEntries(Object.entries(sol).map(([k, v]) => [k, !v]));
    const fb = checkAnswer(ex, { kind: 'countermodel', valuation: flipped });
    if (!fb.correct) {
      expect(fb.headline).toMatch(/Not a countermodel/);
      expect(fb.details!.length).toBeGreaterThan(0);
    }
    const partialV = { ...sol };
    delete partialV[ex.atoms[0]];
    expect(checkAnswer(ex, { kind: 'countermodel', valuation: partialV }).code).toBe('incomplete-valuation');
  });

  it('validity answers: countermodel required for full credit on invalid arguments', () => {
    const ex = SEEDS.map((s) => generateValidity(2, s)).find((e) => !e.valid)!;
    const cm = getSolution(ex).valuation!;
    expect(checkAnswer(ex, { kind: 'validity', valid: false }).code).toBe('needs-countermodel');
    expect(checkAnswer(ex, { kind: 'validity', valid: false, countermodel: cm }).correct).toBe(true);
    expect(checkAnswer(ex, { kind: 'validity', valid: true }).code).toBe('actually-invalid');
    const v = SEEDS.map((s) => generateValidity(2, s)).find((e) => e.valid)!;
    expect(checkAnswer(v, { kind: 'validity', valid: true }).correct).toBe(true);
    expect(checkAnswer(v, { kind: 'validity', valid: false }).code).toBe('actually-valid');
  });

  it('names the fallacy when a student accepts affirming the consequent', () => {
    const ex = SEEDS.map((s) => generateValidity(1, s)).find((e) => e.form === 'Affirming the Consequent')!;
    const fb = checkAnswer(ex, { kind: 'validity', valid: true });
    expect(fb.headline).toContain('Affirming the Consequent');
  });
});

describe('inference-rule generator', () => {
  it("'identify' questions have exactly one justifying rule — the labelled one", () => {
    for (const d of DS)
      for (const s of SEEDS) {
        const ex = generateInferenceRule(d, s, 'identify');
        const cited = ex.lines.map(parseOrThrow);
        expect(rulesJustifying(cited, parseOrThrow(ex.conclusion))).toEqual([ex.rule]);
        expect(ex.choices).toContain(ex.rule);
        expect(checkAnswer(ex, { kind: 'inference-rule', rule: ex.rule }).correct).toBe(true);
        const other = ex.choices.find((r) => r !== ex.rule)!;
        expect(checkAnswer(ex, { kind: 'inference-rule', rule: other }).correct).toBe(false);
      }
  });

  it("'apply' questions accept the rule's result and diagnose other results", () => {
    for (const d of DS)
      for (const s of SEEDS) {
        const ex = generateInferenceRule(d, s, 'apply');
        expect(ruleJustifies(ex.rule, ex.lines.map(parseOrThrow), parseOrThrow(ex.conclusion))).toBe(true);
        expect(checkAnswer(ex, { kind: 'inference-rule', formula: ex.conclusion }).correct).toBe(true);
      }
    const mt = SEEDS.map((s) => generateInferenceRule(1, s, 'apply')).find((e) => e.rule === 'MP')!;
    const fb = checkAnswer(mt, { kind: 'inference-rule', formula: 'Z' });
    expect(fb.correct).toBe(false);
    expect(checkAnswer(mt, { kind: 'inference-rule', formula: '(' }).code).toBe('parse-error');
  });

  it('rule matcher basics', () => {
    const F = parseOrThrow;
    expect(ruleJustifies('MP', [F('P → Q'), F('P')], F('Q'))).toBe(true);
    expect(ruleJustifies('MP', [F('P → Q'), F('Q')], F('P'))).toBe(false);
    expect(ruleJustifies('MT', [F('¬Q'), F('P → Q')], F('¬P'))).toBe(true);
    expect(ruleJustifies('MTP', [F('P ∨ Q'), F('¬Q')], F('P'))).toBe(true);
    expect(ruleJustifies('DN', [F('¬¬P')], F('P'))).toBe(true);
    expect(ruleJustifies('DN', [F('¬P')], F('P'))).toBe(false);
    expect(ruleJustifies('S', [F('P ∧ Q')], F('Q'))).toBe(true);
    expect(ruleJustifies('ADD', [F('P')], F('R ∨ P'))).toBe(true);
    expect(ruleJustifies('BC', [F('P ↔ Q')], F('Q → P'))).toBe(true);
    expect(ruleJustifies('CB', [F('P → Q'), F('Q → P')], F('P ↔ Q'))).toBe(true);
    expect(ruleJustifies('DM', [F('¬(P ∧ Q)')], F('¬P ∨ ¬Q'))).toBe(true);
    expect(ruleJustifies('SC', [F('P ∨ Q'), F('P → R'), F('Q → R')], F('R'))).toBe(true);
    expect(ruleJustifies('SC', [F('P → R'), F('¬P → R')], F('R'))).toBe(true);
  });
});

describe('terminology', () => {
  it('bank has at least 30 items with unique ids and varied formats', () => {
    expect(TERMINOLOGY_EXERCISES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(TERMINOLOGY_EXERCISES.map((e) => e.id)).size).toBe(TERMINOLOGY_EXERCISES.length);
    const formats = new Set(TERMINOLOGY_EXERCISES.map((e) => e.format));
    expect(formats.size).toBe(6);
    const mc = TERMINOLOGY_EXERCISES.filter((e) => e.format === 'multiple-choice').length;
    expect(mc / TERMINOLOGY_EXERCISES.length).toBeLessThan(0.25);
  });

  it('every bank item is answerable with its own solution data', () => {
    for (const ex of TERMINOLOGY_EXERCISES) {
      let fb;
      switch (ex.format) {
        case 'click-connective':
          expect(connectivePositions(ex.formula!)).toContain(ex.connectiveIndex);
          fb = checkAnswer(ex, { kind: 'terminology', position: ex.connectiveIndex });
          break;
        case 'type-part':
        case 'type-formula':
          for (const a of ex.accepted!) expect(parse(a).ok).toBe(true);
          fb = checkAnswer(ex, { kind: 'terminology', text: ex.accepted![0] });
          break;
        case 'fill-in':
          fb = checkAnswer(ex, { kind: 'terminology', text: ` The ${ex.accepted![0].toUpperCase()}. ` });
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

  it('true/false needs the right justification for full credit', () => {
    const ex = TERMINOLOGY_EXERCISES.find((e) => e.id === 'term-01')!;
    expect(checkAnswer(ex, { kind: 'terminology', value: true }).correct).toBe(false);
    expect(checkAnswer(ex, { kind: 'terminology', value: false }).partial).toBe(true);
    const wrongJust = [0, 1, 2].find((i) => i !== ex.correctOption)!;
    expect(checkAnswer(ex, { kind: 'terminology', value: false, choice: wrongJust }).code).toBe('wrong-justification');
  });

  it('fill-in anticipates confusions and tolerates small typos', () => {
    const ex = TERMINOLOGY_EXERCISES.find((e) => e.id === 'term-13')!;
    const conf = checkAnswer(ex, { kind: 'terminology', text: 'consequent' });
    expect(conf.code).toBe('confusion');
    expect(conf.explanation).toMatch(/AFTER/);
    expect(checkAnswer(ex, { kind: 'terminology', text: 'antecedant' }).correct).toBe(true);
  });

  it('main-connective clicks: explains what a wrong click governs', () => {
    const ex = TERMINOLOGY_EXERCISES.find((e) => e.id === 'term-33')!; // ¬(P ∧ Q) → R
    expect(ex.formula![ex.connectiveIndex!]).toBe('→');
    const fb = checkAnswer(ex, { kind: 'terminology', position: ex.formula!.indexOf('∧') });
    expect(fb.correct).toBe(false);
    expect(fb.explanation).toContain('P ∧ Q');
  });

  it('type-part recognises the other part', () => {
    const ex = TERMINOLOGY_EXERCISES.find((e) => e.id === 'term-36')!; // antecedent of (P ∧ Q) → (R ∨ S)
    expect(checkAnswer(ex, { kind: 'terminology', text: 'P & Q' }).correct).toBe(true);
    expect(checkAnswer(ex, { kind: 'terminology', text: 'R ∨ S' }).headline).toMatch(/consequent/);
  });

  it('generated anatomy questions are consistent', () => {
    for (const d of DS)
      for (const s of SEEDS) {
        const ex = generateTerminology(d, s);
        if (ex.format === 'click-connective') {
          const g = parseOrThrow(ex.formula!);
          expect(ex.connectiveIndex).toBe(mainConnectiveIndex(g));
          expect('¬∧∨→↔').toContain(ex.formula![ex.connectiveIndex!]);
          expect(checkAnswer(ex, { kind: 'terminology', position: ex.connectiveIndex }).correct).toBe(true);
        }
        if (ex.format === 'type-part') expect(checkAnswer(ex, { kind: 'terminology', text: ex.accepted![0] }).correct).toBe(true);
      }
  });
});

describe('hints never reveal the solution answer verbatim (generated kinds)', () => {
  it('holds for symbolization/inference-rule apply/type-part', () => {
    const exs: Exercise[] = [];
    for (const s of SEEDS.slice(0, 10)) {
      exs.push(generateInferenceRule(3, s, 'apply'));
      exs.push(generateExercise('symbolization', 4, s, { bankRatio: 0 }));
    }
    for (const ex of exs) {
      const ans = getSolution(ex).answer;
      if (ans.length > 2) for (const h of getHints(ex)) expect(h.includes(ans)).toBe(false);
    }
  });
});

describe('WFF diagnosis wording (review round 1)', () => {
  it('blames the dangling connective, quoting it, with no character indices', () => {
    const d = diagnoseWff('R ↔ ¬(Q ∨ R) →')!;
    expect(d.code).toBe('dangling-connective');
    expect(d.message).toContain('The "→" at the end has nothing after it');
    expect(d.span).toEqual({ start: 13, end: 14 });
    expect(diagnoseWff('∧ P')!.message).toContain('at the start has nothing before it');
    const ex = { id: 'w', kind: 'wff', topic: 'wff', difficulty: 2, title: '', prompt: '', tags: [], source: 'generated', formula: 'R ↔ ¬(Q ∨ R) →', wellFormed: false, askLocation: true } as const;
    const sol = getSolution({ ...ex, tags: [] });
    const text = [sol.summary, ...(sol.steps ?? [])].join(' ');
    expect(text).toContain('nothing after it');
    expect(text).not.toMatch(/character|\d+\s*[–-]\s*\d+/);
    expect(checkAnswer({ ...ex, tags: [] }, { kind: 'wff', wellFormed: false, errorAt: 13 }).correct).toBe(true);
    expect(checkAnswer({ ...ex, tags: [] }, { kind: 'wff', wellFormed: false, errorAt: 0 }).code).toBe('wrong-location');
  });

  it('explains a misplaced ¬ by quoting the fragment', () => {
    const d = diagnoseWff('¬(Q ¬Q)')!;
    expect(d.message).toContain('"Q ¬Q"');
    expect(d.message).toMatch(/only negates the formula right after it/);
  });

  it('no generated WFF solution or feedback mentions character positions', () => {
    for (const d of DS)
      for (const s of SEEDS) {
        const ex = generateWff(d, s);
        const sol = getSolution(ex);
        const fb = checkAnswer(ex, { kind: 'wff', wellFormed: !ex.wellFormed });
        for (const t of [sol.summary, ...(sol.steps ?? []), fb.explanation, ...(fb.details ?? [])]) expect(t).not.toMatch(/character/i);
      }
  });
});

describe('inference-rule drill: quantifier and identity rules (phase 4)', () => {
  it('covers UI, EG, EI (level 3+) and LL, SM (level 4+), still with exactly one justifying rule', () => {
    const seen = new Set<string>();
    for (const d of [3, 4, 5] as Difficulty[])
      for (let s = 0; s < 150; s++) {
        const ex = generateInferenceRule(d, s, 'identify');
        seen.add(ex.rule);
        expect(rulesJustifying(ex.lines.map(parseOrThrow), parseOrThrow(ex.conclusion))).toEqual([ex.rule]);
        if (['UI', 'EG', 'EI'].includes(ex.rule)) expect(ex.prompt).toMatch(/new to the derivation/);
      }
    for (const r of ['UI', 'EG', 'EI', 'LL', 'SM']) expect([r, seen.has(r)]).toEqual([r, true]);
    for (let s = 0; s < 50; s++) expect(['UI', 'EG', 'EI', 'LL', 'SM', 'QN', 'AV']).not.toContain(generateInferenceRule(2, s, 'identify').rule);
  });

  it('EI apply: rejects names and reused variables, accepts a new variable', () => {
    let ex;
    for (let s = 0; s < 400 && !ex; s++) {
      const e = generateInferenceRule(4, s, 'apply');
      if (e.rule === 'EI') ex = e;
    }
    expect(ex).toBeDefined();
    const cited = parseOrThrow(ex!.lines[0]);
    if (cited.kind !== 'exists') throw new Error('expected ∃');
    const v = cited.variable;
    expect(checkAnswer(ex!, { kind: 'inference-rule', formula: ex!.conclusion }).correct).toBe(true);
    const body = ex!.lines[0].slice(ex!.lines[0].indexOf(v) + 1).trim();
    const withName = body.replace(new RegExp(`(?<![a-z])${v}(?![a-z])`, 'g'), 'c').replace(/^\((.*)\)$/, '$1');
    expect(checkAnswer(ex!, { kind: 'inference-rule', formula: withName }).correct).toBe(false);
  });
});

describe('inference-rule drill: no degenerate items (review round 4)', () => {
  it('conclusion never equals a cited line and cited lines are never duplicates (4000 items)', () => {
    for (const d of DS)
      for (let s = 0; s < 400; s++)
        for (const mode of ['identify', 'apply'] as const) {
          const ex = generateInferenceRule(d, s, mode);
          const cited = ex.lines.map(parseOrThrow);
          const concl = parseOrThrow(ex.conclusion);
          expect([ex.lines.join(', ') + ' ⊢ ' + ex.conclusion, cited.some((c) => equals(c, concl))]).toEqual([ex.lines.join(', ') + ' ⊢ ' + ex.conclusion, false]);
          expect(new Set(ex.lines).size).toBe(ex.lines.length);
        }
  });
});
