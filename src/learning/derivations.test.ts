import { checkValidity, equals, parseOrThrow } from '../logic';
import { checkDerivation, solve, type RuleId } from '../proof';
import {
  DERIVATION_EXERCISES,
  checkAnswer,
  createDerivationDraft,
  derivationSolutionDraft,
  formatDraft,
  getHints,
  getSolution,
  parseProofScript,
  ruleJustifies,
} from './index';

describe('curated derivation problems', () => {
  it('has at least 25 problems, unique ids, ordered by difficulty', () => {
    expect(DERIVATION_EXERCISES.length).toBeGreaterThanOrEqual(25);
    expect(new Set(DERIVATION_EXERCISES.map((e) => e.id)).size).toBe(DERIVATION_EXERCISES.length);
    const ds = DERIVATION_EXERCISES.map((e) => e.difficulty);
    expect([...ds].sort((a, b) => a - b)).toEqual(ds);
    for (const m of ['DD', 'CD', 'ID']) expect(DERIVATION_EXERCISES.some((e) => e.strategy === m)).toBe(true);
  });

  it.each(DERIVATION_EXERCISES.map((e) => [e.id, e] as const))('%s is a valid argument', (_id, ex) => {
    const r = checkValidity(ex.premises.map(parseOrThrow), parseOrThrow(ex.goal));
    expect(r.valid).toBe(true);
    expect(r.premisesInconsistent).toBe(false);
  });

  it.each(DERIVATION_EXERCISES.map((e) => [e.id, e] as const))('%s: model solution is structurally sound', (_id, ex) => {
    const d = derivationSolutionDraft(ex)!;
    const lines = d.lines;
    // premises first, exactly the problem's premises, in order
    const prem = lines.filter((l) => l.kind === 'premise');
    expect(prem.map((l) => l.text)).toEqual(ex.premises);
    expect(lines.slice(0, prem.length).every((l) => l.kind === 'premise' && l.depth === 0)).toBe(true);
    // first show line is the goal, at depth 0
    const first = lines[prem.length];
    expect(first.kind).toBe('show');
    expect(first.depth).toBe(0);
    expect(equals(parseOrThrow(first.text), parseOrThrow(ex.goal))).toBe(true);
    // every line parses; every show is closed; depths never jump by more than one
    lines.forEach((l, i) => {
      expect(() => parseOrThrow(l.text)).not.toThrow();
      if (l.kind === 'show') expect(l.close).toBeDefined();
      if (i > 0) expect(l.depth - lines[i - 1].depth).toBeLessThanOrEqual(1);
      if (l.kind === 'assumption') {
        expect(lines[i - 1].kind).toBe('show');
        expect(l.depth).toBe(lines[i - 1].depth + 1);
      }
    });
  });

  it.each(DERIVATION_EXERCISES.map((e) => [e.id, e] as const))('%s: every rule step in the model solution is a correct one-step application', (_id, ex) => {
    const d = derivationSolutionDraft(ex)!;
    const F = d.lines.map((l) => parseOrThrow(l.text));
    d.lines.forEach((l, i) => {
      if (l.kind === 'step') {
        const cited = (l.refs ?? []).map((n) => F[n - 1]);
        expect([i + 1, l.rule, ruleJustifies(l.rule as RuleId, cited, F[i])]).toEqual([i + 1, l.rule, true]);
        for (const n of l.refs ?? []) expect(n).toBeLessThan(i + 1);
      }
      if (l.kind === 'show' && l.close) {
        const refs = l.close.refs.map((n) => F[n - 1]);
        const g = F[i];
        if (l.close.method === 'DD') expect(equals(refs[0], g)).toBe(true);
        if (l.close.method === 'CD') {
          expect(g.kind).toBe('implies');
          if (g.kind === 'implies') expect(equals(refs[0], g.right)).toBe(true);
        }
        if (l.close.method === 'ID') {
          const [a, b] = refs;
          const contradictory = (b.kind === 'not' && equals(b.operand, a)) || (a.kind === 'not' && equals(a.operand, b));
          expect(contradictory).toBe(true);
        }
        for (const n of l.close.refs) {
          expect(n).toBeGreaterThan(i + 1);
          // the cited line sits directly inside this show's box
          expect(d.lines[n - 1].depth).toBe(l.depth + 1);
        }
      }
    });
  });

  it('the proof engine accepts every model solution as complete', () => {
    for (const ex of DERIVATION_EXERCISES) {
      const d = derivationSolutionDraft(ex)!;
      const r = checkDerivation(d);
      const errs = r.lines.flatMap((l) => l.issues.filter((i) => i.severity === 'error').map((i) => `line ${l.number}: ${i.message}`));
      expect([ex.id, r.complete, errs]).toEqual([ex.id, true, []]);
      expect(checkAnswer(ex, { kind: 'derivation', draft: d }).correct).toBe(true);
    }
  });

  it('the automatic prover (proof.solve) proves every curated problem', () => {
    for (const ex of DERIVATION_EXERCISES) {
      const lines = solve(ex.premises.map(parseOrThrow), parseOrThrow(ex.goal));
      expect([ex.id, lines !== null]).toEqual([ex.id, true]);
      expect([ex.id, checkDerivation({ goal: ex.goal, lines: lines! }).complete]).toEqual([ex.id, true]);
    }
  });
});

describe('derivation helpers', () => {
  it('createDerivationDraft sets up premises and the goal Show line', () => {
    const ex = DERIVATION_EXERCISES.find((e) => e.id === 'der-11')!;
    const d = createDerivationDraft(ex);
    expect(d.goal).toBe('P → R');
    expect(d.lines.map((l) => [l.kind, l.text, l.depth])).toEqual([
      ['premise', 'P → Q', 0],
      ['premise', 'Q → R', 0],
      ['show', 'P → R', 0],
    ]);
    expect(new Set(d.lines.map((l) => l.id)).size).toBe(3);
  });

  it('parseProofScript reads the compact format', () => {
    const d = parseProofScript(['P → Q :: PR', 'Show P → Q :: CD 4', '  P :: ASS CD', '  Q :: MP 1 3']);
    expect(d.lines[1]).toMatchObject({ kind: 'show', text: 'P → Q', depth: 0, close: { method: 'CD', refs: [4] } });
    expect(d.lines[2]).toMatchObject({ kind: 'assumption', assumption: 'CD', depth: 1 });
    expect(d.lines[3]).toMatchObject({ kind: 'step', rule: 'MP', refs: [1, 3], depth: 1 });
    expect(formatDraft(d)[3]).toMatch(/^ 4\.\s+Q\s+MP 1, 3$/);
  });

  it('hints go from strategy to outline; the solution is a full derivation', () => {
    const ex = DERIVATION_EXERCISES.find((e) => e.id === 'der-15')!;
    const hints = getHints(ex);
    expect(hints[0]).toMatch(/negation.*ID/);
    expect(hints[hints.length - 1]).toMatch(/Outline/);
    expect(hints.join('\n')).not.toContain('MP 1');
    const sol = getSolution(ex);
    expect(sol.derivation?.lines.length).toBe(ex.solution.length);
  });

  it('rejects drafts that add premises of their own', () => {
    const ex = DERIVATION_EXERCISES.find((e) => e.id === 'der-01')!;
    const d = createDerivationDraft(ex);
    d.lines.unshift({ id: 'x', kind: 'premise', text: 'R', depth: 0 });
    const fb = checkAnswer(ex, { kind: 'derivation', draft: d });
    expect(fb.correct).toBe(false);
    expect(fb.code).toBe('extra-premise');
  });

  it('reports an unfinished (but error-free) derivation as incomplete', () => {
    const ex = DERIVATION_EXERCISES[0];
    const fb = checkAnswer(ex, { kind: 'derivation', draft: createDerivationDraft(ex) });
    expect(fb.correct).toBe(false);
    expect(fb.partial).toBe(true);
    expect(fb.code).toBe('incomplete');
  });

  it('reports rule errors with line numbers', () => {
    const ex = DERIVATION_EXERCISES.find((e) => e.id === 'der-01')!;
    const d = createDerivationDraft(ex);
    d.lines.push({ id: 'bad', kind: 'step', text: 'R', depth: 1, rule: 'MP', refs: [1, 3] });
    const fb = checkAnswer(ex, { kind: 'derivation', draft: d });
    expect(fb.correct).toBe(false);
    expect(fb.code).toBe('errors');
    expect(fb.headline).toContain('Line 5');
    expect(fb.details!.length).toBeGreaterThan(0);
  });
});
