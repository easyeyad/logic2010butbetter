// @vitest-environment node
/**
 * QA cross-module consistency: logic ↔ proof ↔ learning.
 * OWNER: QA / Accessibility. Independent oracles are written here on purpose
 * (brute force, own evaluator) so they don't share bugs with the engines.
 */
import { describe, expect, test } from 'vitest';
import {
  atomsOf,
  buildTruthTable,
  checkValidity,
  classify,
  equals,
  format,
  parse,
  randomFormula,
  seededRandom,
  type Formula,
} from '../logic';
import { checkDerivation, solve } from '../proof';
import {
  DERIVATION_EXERCISES,
  SYMBOLIZATION_EXERCISES,
  checkAnswer,
  derivationSolutionDraft,
} from '../learning';

// ---------------------------------------------------------------------------
// Independent oracle
// ---------------------------------------------------------------------------
function ev(f: Formula, v: Record<string, boolean>): boolean {
  switch (f.kind) {
    case 'atom':
      return v[f.name];
    case 'not':
      return !ev(f.operand, v);
    case 'and':
      return ev(f.left, v) && ev(f.right, v);
    case 'or':
      return ev(f.left, v) || ev(f.right, v);
    case 'implies':
      return !ev(f.left, v) || ev(f.right, v);
    case 'iff':
      return ev(f.left, v) === ev(f.right, v);
  }
}

function letters(fs: Formula[]): string[] {
  const s = new Set<string>();
  const go = (f: Formula) => {
    if (f.kind === 'atom') s.add(f.name);
    else if (f.kind === 'not') go(f.operand);
    else {
      go(f.left);
      go(f.right);
    }
  };
  fs.forEach(go);
  return [...s].sort();
}

function* rows(atoms: string[]): Generator<Record<string, boolean>> {
  const n = atoms.length;
  for (let r = 0; r < 1 << n; r++) {
    const v: Record<string, boolean> = {};
    // standard order: first atom T for the top half
    atoms.forEach((a, i) => (v[a] = ((r >> (n - 1 - i)) & 1) === 0));
    yield v;
  }
}

function bruteValid(ps: Formula[], c: Formula): boolean {
  for (const v of rows(letters([...ps, c]))) if (ps.every((p) => ev(p, v)) && !ev(c, v)) return false;
  return true;
}

function bruteClass(f: Formula): 'tautology' | 'contradiction' | 'contingent' {
  let t = 0;
  let total = 0;
  for (const v of rows(letters([f]))) {
    total++;
    if (ev(f, v)) t++;
  }
  return t === total ? 'tautology' : t === 0 ? 'contradiction' : 'contingent';
}

const depth = (f: Formula): number =>
  f.kind === 'atom' ? 0 : f.kind === 'not' ? 1 + depth(f.operand) : 1 + Math.max(depth(f.left), depth(f.right));

// ---------------------------------------------------------------------------
describe('logic: parse ∘ format round trip', () => {
  const rnd = seededRandom(20260923);
  const formulas = Array.from({ length: 400 }, () =>
    randomFormula({ random: rnd, maxDepth: 5, atoms: ['P', 'Q', 'R', 'S', 'P1', 'Z'] }),
  );

  test('unicode format parses back to the same AST', () => {
    for (const f of formulas) {
      const text = format(f);
      const r = parse(text);
      expect(r.ok, text).toBe(true);
      if (r.ok) expect(equals(r.formula, f), text).toBe(true);
    }
  });

  test('ASCII format parses back to the same AST', () => {
    for (const f of formulas) {
      const text = format(f, { ascii: true });
      const r = parse(text);
      expect(r.ok, text).toBe(true);
      if (r.ok) expect(equals(r.formula, f), text).toBe(true);
    }
  });

  test('format with outer parentheses also round-trips', () => {
    for (const f of formulas) {
      const text = format(f, { dropOuter: false });
      const r = parse(text);
      expect(r.ok, text).toBe(true);
      if (r.ok) expect(equals(r.formula, f), text).toBe(true);
    }
  });

  test('normalized text of a parse is itself parseable to the same AST', () => {
    for (const f of formulas.slice(0, 100)) {
      const r1 = parse(format(f, { ascii: true }));
      expect(r1.ok).toBe(true);
      const r2 = parse(r1.normalized);
      expect(r2.ok, r1.normalized).toBe(true);
      if (r1.ok && r2.ok) expect(equals(r1.formula, r2.formula)).toBe(true);
    }
  });
});

describe('logic: classify / truth table / validity agree with an independent oracle', () => {
  const rnd = seededRandom(7);
  const formulas = Array.from({ length: 300 }, () => randomFormula({ random: rnd, maxDepth: 4, atoms: ['P', 'Q', 'R', 'S'] }));

  test('classify agrees with brute force', () => {
    for (const f of formulas) expect(classify(f), format(f)).toBe(bruteClass(f));
  });

  test('truth table main column agrees with the oracle row by row, and classify agrees with the main column', () => {
    for (const f of formulas) {
      const t = buildTruthTable([f]);
      expect(t.atoms).toEqual(atomsOf(f));
      expect(t.rows.length).toBe(1 << t.atoms.length);
      const main = t.mainColumns[0];
      expect(t.columns[main].isMain).toBe(true);
      const col = t.rows.map((r) => r[main]);
      const expected = [...rows(t.atoms)].map((v) => ev(f, v));
      expect(col, format(f)).toEqual(expected);
      // every column matches its own formula
      t.columns.forEach((c, ci) => {
        t.rows.forEach((row, ri) => expect(row[ci]).toBe(ev(c.formula, t.valuations[ri])));
      });
      const cls = col.every(Boolean) ? 'tautology' : col.some(Boolean) ? 'contingent' : 'contradiction';
      expect(classify(f)).toBe(cls);
    }
  });

  test('checkValidity agrees with brute force; counterexamples really are counterexamples', () => {
    const r = seededRandom(99);
    for (let i = 0; i < 300; i++) {
      const n = 1 + Math.floor(r() * 3);
      const ps = Array.from({ length: n }, () => randomFormula({ random: r, maxDepth: 3, atoms: ['P', 'Q', 'R'] }));
      const c = randomFormula({ random: r, maxDepth: 3, atoms: ['P', 'Q', 'R'] });
      const res = checkValidity(ps, c);
      const label = `${ps.map((p) => format(p)).join(', ')} ⊢ ${format(c)}`;
      expect(res.valid, label).toBe(bruteValid(ps, c));
      if (!res.valid) {
        expect(res.counterexample).toBeDefined();
        for (const cx of res.counterexamples) {
          expect(ps.every((p) => ev(p, cx)), label).toBe(true);
          expect(ev(c, cx), label).toBe(false);
        }
      } else {
        expect(res.counterexamples).toEqual([]);
      }
    }
  });
});

describe('proof: solve() output passes checkDerivation', () => {
  test('random valid arguments: solution is complete and its premises/goal match', () => {
    const r = seededRandom(424242);
    let tried = 0;
    let solved = 0;
    const failures: string[] = [];
    for (let i = 0; i < 400 && tried < 80; i++) {
      const n = 1 + Math.floor(r() * 2);
      const ps = Array.from({ length: n }, () => randomFormula({ random: r, maxDepth: 2, atoms: ['P', 'Q', 'R'] }));
      const c = randomFormula({ random: r, maxDepth: 2, atoms: ['P', 'Q', 'R'] });
      if (!bruteValid(ps, c)) continue;
      tried++;
      const lines = solve(ps, c, { maxLines: 200 });
      const label = `${ps.map((p) => format(p)).join(', ')} ⊢ ${format(c)}`;
      if (!lines) {
        failures.push(`no solution: ${label}`);
        continue;
      }
      solved++;
      const check = checkDerivation({ goal: format(c), lines, premises: ps.map((p) => format(p)) });
      if (!check.complete) {
        failures.push(`incomplete: ${label}: ${check.summary}`);
        continue;
      }
      // premises in the solution are exactly the given premises (subset, each given)
      const prem = lines.filter((l) => l.kind === 'premise');
      for (const l of prem) {
        const pr = parse(l.text);
        expect(pr.ok).toBe(true);
        if (pr.ok) expect(ps.some((p) => equals(p, pr.formula)), `${label}: premise ${l.text}`).toBe(true);
      }
      // the first show line at depth 0 is the goal
      const firstShow = lines.find((l) => l.kind === 'show' && l.depth === 0);
      expect(firstShow).toBeDefined();
      const g = parse(firstShow!.text);
      expect(g.ok && equals(g.formula, c), `${label}: first show ${firstShow!.text}`).toBe(true);
    }
    expect(tried).toBeGreaterThan(20);
    expect(failures, failures.join('\n')).toEqual([]);
    expect(solved).toBe(tried);
  });

  test('harder random valid arguments (depth 3, 4 letters) are solved and check complete', () => {
    const r = seededRandom(5);
    let tried = 0;
    const failures: string[] = [];
    for (let i = 0; i < 600 && tried < 60; i++) {
      const ps = Array.from({ length: 1 + Math.floor(r() * 3) }, () => randomFormula({ random: r, maxDepth: 3, atoms: ['P', 'Q', 'R', 'S'] }));
      const c = randomFormula({ random: r, maxDepth: 3, atoms: ['P', 'Q', 'R', 'S'] });
      if (!bruteValid(ps, c)) continue;
      tried++;
      const label = `${ps.map((p) => format(p)).join(', ')} ⊢ ${format(c)}`;
      const lines = solve(ps, c);
      if (!lines) failures.push(`no solution: ${label}`);
      else if (!checkDerivation({ goal: format(c), lines, premises: ps.map((p) => format(p)) }).complete) failures.push(`incomplete: ${label}`);
    }
    expect(tried).toBeGreaterThan(30);
    expect(failures, failures.join('\n')).toEqual([]);
  });

  test('solve refuses invalid arguments', () => {
    const P = parse('P').ok ? (parse('P') as { formula: Formula }).formula : null!;
    const PQ = (parse('P → Q') as { formula: Formula }).formula;
    const Q = (parse('Q') as { formula: Formula }).formula;
    expect(solve([PQ, Q], P)).toBeNull();
  });
});

describe('learning: banks are internally consistent', () => {
  test('every derivation exercise model solution checks as complete', () => {
    expect(DERIVATION_EXERCISES.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const ex of DERIVATION_EXERCISES) {
      const draft = derivationSolutionDraft(ex);
      const check = checkDerivation({ ...draft, premises: ex.premises });
      if (!check.complete) {
        const errs = check.lines.flatMap((l) => l.issues.filter((i) => i.severity === 'error').map((i) => `L${l.number}: ${i.message}`));
        bad.push(`${ex.id}: ${check.summary} ${errs.join(' | ')}`);
      }
      // the argument itself is valid
      const ps = ex.premises.map((p) => parse(p));
      const g = parse(ex.goal);
      expect(ps.every((p) => p.ok) && g.ok, ex.id).toBe(true);
      if (g.ok) expect(bruteValid(ps.map((p) => (p as { formula: Formula }).formula), g.formula), ex.id).toBe(true);
      // checkAnswer accepts the model solution
      const fb = checkAnswer(ex, { kind: 'derivation', draft });
      if (!fb.correct) bad.push(`${ex.id}: checkAnswer rejected the model solution: ${fb.headline}`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  test('symbolization: the key answer and every alternative are marked correct', () => {
    expect(SYMBOLIZATION_EXERCISES.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const ex of SYMBOLIZATION_EXERCISES) {
      for (const a of [ex.answer, ...ex.alternatives]) {
        const fb = checkAnswer(ex, { kind: 'symbolization', formula: a });
        if (!fb.correct) bad.push(`${ex.id} "${a}": ${fb.headline}`);
      }
      // ASCII rendering of the answer also accepted
      const p = parse(ex.answer);
      expect(p.ok, `${ex.id} answer parses`).toBe(true);
      if (p.ok) {
        const fb = checkAnswer(ex, { kind: 'symbolization', formula: format(p.formula, { ascii: true }) });
        if (!fb.correct) bad.push(`${ex.id} ascii "${format(p.formula, { ascii: true })}": ${fb.headline}`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  test('symbolization: the converse of a conditional answer is marked incorrect (when not equivalent)', () => {
    let n = 0;
    const bad: string[] = [];
    for (const ex of SYMBOLIZATION_EXERCISES) {
      const p = parse(ex.answer);
      if (!p.ok || p.formula.kind !== 'implies') continue;
      const conv: Formula = { kind: 'implies', left: p.formula.right, right: p.formula.left };
      // skip if the converse happens to be equivalent
      const both = letters([p.formula, conv]);
      let equiv = true;
      for (const v of rows(both)) if (ev(p.formula, v) !== ev(conv, v)) equiv = false;
      if (equiv) continue;
      n++;
      const fb = checkAnswer(ex, { kind: 'symbolization', formula: format(conv) });
      if (fb.correct) bad.push(`${ex.id}: converse "${format(conv)}" accepted`);
      else expect(fb.headline.length + fb.explanation.length).toBeGreaterThan(10);
    }
    expect(n).toBeGreaterThan(0);
    expect(bad, bad.join('\n')).toEqual([]);
  });

  test('symbolization: empty and garbage answers are rejected without throwing', () => {
    for (const ex of SYMBOLIZATION_EXERCISES.slice(0, 10)) {
      for (const a of ['', '   ', '((((', 'P ∧', '🙂', 'p and q']) {
        const fb = checkAnswer(ex, { kind: 'symbolization', formula: a });
        expect(fb.correct, `${ex.id} "${a}"`).toBe(false);
        expect(fb.headline.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('edge cases', () => {
  test('10-atom truth table: 1024 rows, oracle agrees', () => {
    const atoms = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const text = '((A ∧ B) ∨ (C → D)) ↔ ((E ∨ F) ∧ ((G → H) ∨ ¬(I ↔ J)))';
    const r = parse(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = buildTruthTable([r.formula]);
    expect(t.atoms).toEqual(atoms);
    expect(t.rows.length).toBe(1024);
    const main = t.mainColumns[0];
    let k = 0;
    for (const v of rows(atoms)) expect(t.rows[k++][main]).toBe(ev(r.formula, v));
    expect(classify(r.formula)).toBe(bruteClass(r.formula));
  });

  test('11 atoms: truth table refuses gracefully (throws a clear error or caps), validity still works', () => {
    const text = '(A ∧ B ∧ C)'.replace(/ ∧ C/, '') + ' ∨ ' + '(C ∨ (D ∨ (E ∨ (F ∨ (G ∨ (H ∨ (I ∨ (J ∨ K))))))))';
    const r = parse(text);
    expect(r.ok, text).toBe(true);
    if (!r.ok) return;
    let threw: unknown = null;
    try {
      buildTruthTable([r.formula]);
    } catch (e) {
      threw = e;
    }
    // either behaviour is acceptable as long as it's an Error with a message
    if (threw) expect((threw as Error).message.length).toBeGreaterThan(0);
    expect(checkValidity([], r.formula).valid).toBe(false);
  });

  test('depth-50 nested formulas parse (no stack issues) and round-trip', () => {
    let s = 'P';
    for (let i = 0; i < 50; i++) s = `(${s} → Q${i})`;
    const r = parse(s);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(depth(r.formula)).toBe(50);
      const back = parse(format(r.formula));
      expect(back.ok && equals(back.formula, r.formula)).toBe(true);
    }
    let n = 'P';
    for (let i = 0; i < 50; i++) n = `¬${n}`;
    const rn = parse(n);
    expect(rn.ok).toBe(true);
    if (rn.ok) expect(depth(rn.formula)).toBe(50);
  });

  test('depth-500 nesting does not crash the process (ok or a parse error, never a thrown RangeError)', () => {
    let s = 'P';
    for (let i = 0; i < 500; i++) s = `(${s} ∧ Q)`;
    expect(() => parse(s)).not.toThrow();
    let n = 'P';
    for (let i = 0; i < 2000; i++) n = `¬${n}`;
    expect(() => parse(n)).not.toThrow();
  });

  test('very long inputs parse quickly', () => {
    const parts = Array.from({ length: 2000 }, (_, i) => `P${i}`);
    let s = parts[0];
    for (let i = 1; i < 60; i++) s = `(${s} ∨ ${parts[i]})`;
    const long = `${s} → ${s}`;
    const t0 = performance.now();
    const r = parse(long);
    expect(r.ok).toBe(true);
    expect(performance.now() - t0).toBeLessThan(500);
    const spaces = ' '.repeat(100000) + 'P' + ' '.repeat(100000);
    const rs = parse(spaces);
    expect(rs.ok).toBe(true);
  });

  // BUG (logic, minor): parse() is documented "Never throws", but ~10,000 nested
  // brackets or negations overflow the recursive-descent stack (RangeError).
  // 8,000 is fine. A pasted/garbage string of 20k "(" crashes the caller unless
  // wrapped (the UI wraps it in safeParse, so the page shows "engine error").
  test.fails('BUG: 20,000 unmatched "(" returns a parse error instead of throwing RangeError', () => {
    const junk = '('.repeat(20000);
    const t1 = performance.now();
    const rj = parse(junk);
    expect(rj.ok).toBe(false);
    expect(performance.now() - t1).toBeLessThan(1000);
    expect(parse('¬'.repeat(20000) + 'P').ok).toBe(true);
  });

  test('unicode oddities: alternate symbols accepted, lookalikes rejected with a span inside the input', () => {
    const ok = ['P ⊃ Q', 'P ≡ Q', '∼P', 'P · Q', '−P', ' P → Q ', 'P\t∧\tQ'];
    for (const s of ok) expect(parse(s).ok, JSON.stringify(s)).toBe(true);
    const bad = ['P ⋀ Q', 'Ｐ', 'P → 🙂', 'P​∧ Q', 'Ρ ∧ Q' /* Greek Rho */, 'P ∧ Q́', 'é'];
    for (const s of bad) {
      const r = parse(s);
      if (!r.ok) {
        expect(r.error.span.start).toBeGreaterThanOrEqual(0);
        expect(r.error.span.end).toBeLessThanOrEqual(s.length);
        expect(r.error.span.start).toBeLessThanOrEqual(r.error.span.end);
        expect(r.error.message.length).toBeGreaterThan(0);
      }
    }
    // zero-width space inside a formula: either tolerated or reported, but not accepted as an atom
    const zw = parse('P​∧ Q');
    if (zw.ok) expect(format(zw.formula)).toBe('P ∧ Q');
  });

  test('surrogate pairs: error span never splits an emoji', () => {
    const s = 'P → 🙂';
    const r = parse(s);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const { start, end } = r.error.span;
      const code = s.charCodeAt(start);
      expect(code >= 0xdc00 && code <= 0xdfff, 'span starts inside a surrogate pair').toBe(false);
      if (end < s.length) {
        const c2 = s.charCodeAt(end);
        expect(c2 >= 0xdc00 && c2 <= 0xdfff, 'span ends inside a surrogate pair').toBe(false);
      }
    }
  });

  test('empty input everywhere', () => {
    for (const s of ['', ' ', '\n\t']) {
      const r = parse(s);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('empty');
    }
    expect(() => checkDerivation({ lines: [] })).not.toThrow();
    const c = checkDerivation({ lines: [] });
    expect(c.complete).toBe(false);
    expect(() => checkDerivation({ goal: '', lines: [{ id: 'a', kind: 'step', text: '', depth: 0 }] })).not.toThrow();
    const blank = checkDerivation({ lines: [{ id: 'a', kind: 'show', text: '', depth: 0 }] });
    expect(blank.complete).toBe(false);
    expect(() => buildTruthTable([])).not.toThrow();
    expect(() => checkValidity([], (parse('P ∨ ¬P') as { formula: Formula }).formula)).not.toThrow();
    expect(checkValidity([], (parse('P ∨ ¬P') as { formula: Formula }).formula).valid).toBe(true);
  });
});
