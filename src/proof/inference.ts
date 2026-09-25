/**
 * Rule matching and rule-specific diagnosis for step lines.
 *
 * `ruleApplies` decides validity (any ref order). `diagnoseRule` explains in
 * student-facing language why a rule does NOT apply, naming the lines, the
 * rule and the likely confusion.
 *
 * OWNER: Proof Engine.
 */
import type { Formula, Term } from '../logic/ast';
import { And, Exists, Forall, Iff, Implies, Name, Not, Or } from '../logic/ast';
import { alphaEquals, freeVariables, isGeneralizationOf, matchInstance, namesOf, substitute } from '../logic/index';
import type { RuleId } from './types';
import { DERIVED_RULE_IDS, INFERENCE_RULE_IDS, ruleLabel } from './rules';
import { aKind, capitalize, contradictory, equals as eq, fmt, isNegationOf, lineList, stripDN } from './util';

export interface RefF {
  /** 1-based line number. */
  n: number;
  f: Formula;
}

/** Allowed number(s) of cited lines per rule. */
export const RULE_ARITY: Record<RuleId, number[]> = {
  MP: [2], MT: [2], DN: [1], R: [1], S: [1], ADJ: [2], ADD: [1], MTP: [2], BC: [1], CB: [2],
  DM: [1], NC: [1], NB: [1], CDJ: [1], SC: [3, 2],
  UI: [1], EG: [1], EI: [1], QN: [1], AV: [1],
  Id: [0], LL: [2], SM: [1],
};

/** What the cited lines must be, for "cites exactly N lines (...)". */
export const NEEDS: Record<RuleId, string> = {
  MP: 'a conditional and its antecedent',
  MT: 'a conditional and the negation of its consequent',
  DN: 'the one line to add or remove ¬¬ on',
  R: 'the one line to repeat',
  S: 'the conjunction to take a conjunct from',
  ADJ: 'one line for each conjunct',
  ADD: 'the one disjunct you already have',
  MTP: 'a disjunction and the negation of one of its disjuncts',
  BC: 'the biconditional',
  CB: 'the two conditionals φ → ψ and ψ → φ',
  DM: 'the one line to rewrite',
  NC: 'the one line to rewrite',
  NB: 'the one line to rewrite',
  CDJ: 'the one line to rewrite',
  SC: 'a disjunction φ ∨ ψ plus φ → χ and ψ → χ',
  UI: 'the universal ∀xφ to instantiate',
  EG: 'the line about a particular term',
  EI: 'the existential ∃xφ to instantiate',
  QN: 'the one line to rewrite',
  AV: 'the one line to rename',
  Id: 'no lines at all',
  LL: 'the line to rewrite and the identity t1 = t2',
  SM: 'the identity to flip',
};

// ------------------------------------------------------------------ transforms

/** All formulas a one-premise equivalence rule produces from f. */
export function transforms(rule: RuleId, f: Formula): Formula[] {
  const out: Formula[] = [];
  switch (rule) {
    case 'R':
      out.push(f);
      break;
    case 'DN':
      out.push(Not(Not(f)));
      if (f.kind === 'not' && f.operand.kind === 'not') out.push(f.operand.operand);
      break;
    case 'S':
      if (f.kind === 'and') out.push(f.left, f.right);
      break;
    case 'BC':
      if (f.kind === 'iff') out.push(Implies(f.left, f.right), Implies(f.right, f.left));
      break;
    case 'DM':
      if (f.kind === 'not' && f.operand.kind === 'and') out.push(Or(Not(f.operand.left), Not(f.operand.right)));
      if (f.kind === 'not' && f.operand.kind === 'or') out.push(And(Not(f.operand.left), Not(f.operand.right)));
      if (f.kind === 'or' && f.left.kind === 'not' && f.right.kind === 'not') out.push(Not(And(f.left.operand, f.right.operand)));
      if (f.kind === 'and' && f.left.kind === 'not' && f.right.kind === 'not') out.push(Not(Or(f.left.operand, f.right.operand)));
      if (f.kind === 'and') out.push(Not(Or(Not(f.left), Not(f.right))));
      if (f.kind === 'or') out.push(Not(And(Not(f.left), Not(f.right))));
      if (f.kind === 'not' && f.operand.kind === 'or' && f.operand.left.kind === 'not' && f.operand.right.kind === 'not')
        out.push(And(f.operand.left.operand, f.operand.right.operand));
      if (f.kind === 'not' && f.operand.kind === 'and' && f.operand.left.kind === 'not' && f.operand.right.kind === 'not')
        out.push(Or(f.operand.left.operand, f.operand.right.operand));
      break;
    case 'NC':
      if (f.kind === 'not' && f.operand.kind === 'implies') out.push(And(f.operand.left, Not(f.operand.right)));
      if (f.kind === 'and' && f.right.kind === 'not') out.push(Not(Implies(f.left, f.right.operand)));
      break;
    case 'NB':
      if (f.kind === 'not' && f.operand.kind === 'iff')
        out.push(Iff(f.operand.left, Not(f.operand.right)), Iff(Not(f.operand.left), f.operand.right));
      if (f.kind === 'iff' && f.right.kind === 'not') out.push(Not(Iff(f.left, f.right.operand)));
      if (f.kind === 'iff' && f.left.kind === 'not') out.push(Not(Iff(f.left.operand, f.right)));
      break;
    case 'SM':
      if (f.kind === 'identity') out.push({ kind: 'identity', left: f.right, right: f.left });
      if (f.kind === 'not' && f.operand.kind === 'identity')
        out.push(Not({ kind: 'identity', left: f.operand.right, right: f.operand.left }));
      break;
    case 'QN':
      if (f.kind === 'not' && f.operand.kind === 'forall') out.push(Exists(f.operand.variable, Not(f.operand.body)));
      if (f.kind === 'not' && f.operand.kind === 'exists') out.push(Forall(f.operand.variable, Not(f.operand.body)));
      if (f.kind === 'exists' && f.body.kind === 'not') out.push(Not(Forall(f.variable, f.body.operand)));
      if (f.kind === 'forall' && f.body.kind === 'not') out.push(Not(Exists(f.variable, f.body.operand)));
      if (f.kind === 'forall') out.push(Not(Exists(f.variable, Not(f.body))));
      if (f.kind === 'exists') out.push(Not(Forall(f.variable, Not(f.body))));
      if (f.kind === 'not' && f.operand.kind === 'exists' && f.operand.body.kind === 'not')
        out.push(Forall(f.operand.variable, f.operand.body.operand));
      if (f.kind === 'not' && f.operand.kind === 'forall' && f.operand.body.kind === 'not')
        out.push(Exists(f.operand.variable, f.operand.body.operand));
      break;
    case 'CDJ':
      if (f.kind === 'implies') {
        out.push(Or(Not(f.left), f.right));
        if (f.left.kind === 'not') out.push(Or(f.left.operand, f.right));
      }
      if (f.kind === 'or') {
        out.push(Implies(Not(f.left), f.right));
        if (f.left.kind === 'not') out.push(Implies(f.left.operand, f.right));
      }
      break;
    default:
      break;
  }
  return out;
}

const ONE_PREMISE_TRANSFORM = new Set<RuleId>(['R', 'DN', 'S', 'BC', 'DM', 'NC', 'NB', 'CDJ', 'QN', 'SM']);

const termEq = (a: Term, b: Term) => a.kind === b.kind && a.name === b.name;
const termText = (t: Term) => t.name;

/**
 * Every formula obtainable from f by replacing a non-empty subset of the free
 * occurrences of t1 by t2 (t2 not captured) — what LL can produce. With more
 * than `maxOcc` occurrences only the replace-all variant is returned.
 */
export function replaceSome(f: Formula, t1: Term, t2: Term, maxOcc = 4): Formula[] {
  // Count replaceable occurrences first.
  let k = 0;
  const countT = (t: Term, bound: Set<string>) => {
    if (termEq(t, t1) && !(t.kind === 'var' && bound.has(t.name)) && !(t2.kind === 'var' && bound.has(t2.name))) k++;
  };
  const count = (g: Formula, bound: Set<string>): void => {
    switch (g.kind) {
      case 'atom':
        return;
      case 'identity':
        countT(g.left, bound);
        countT(g.right, bound);
        return;
      case 'pred':
        g.args.forEach((t) => countT(t, bound));
        return;
      case 'not':
        return count(g.operand, bound);
      case 'forall':
      case 'exists':
        return count(g.body, new Set([...bound, g.variable]));
      case 'and':
      case 'or':
      case 'implies':
      case 'iff':
        count(g.left, bound);
        count(g.right, bound);
        return;
    }
  };
  count(f, new Set());
  if (k === 0) return [];
  if (k > maxOcc) {
    const all = replaceFree(f, t1, t2);
    return all ? [all] : [];
  }
  const out: Formula[] = [];
  for (let mask = 1; mask < 1 << k; mask++) {
    let idx = 0;
    const term = (t: Term, bound: Set<string>): Term => {
      if (!termEq(t, t1) || (t.kind === 'var' && bound.has(t.name)) || (t2.kind === 'var' && bound.has(t2.name))) return t;
      return mask & (1 << idx++) ? t2 : t;
    };
    const go = (g: Formula, bound: Set<string>): Formula => {
      switch (g.kind) {
        case 'atom':
          return g;
        case 'identity': {
          const left = term(g.left, bound);
          return { kind: 'identity', left, right: term(g.right, bound) };
        }
        case 'pred':
          return { kind: 'pred', name: g.name, args: g.args.map((t) => term(t, bound)) };
        case 'not':
          return Not(go(g.operand, bound));
        case 'forall':
        case 'exists':
          return { kind: g.kind, variable: g.variable, body: go(g.body, new Set([...bound, g.variable])) };
        case 'and':
        case 'or':
        case 'implies':
        case 'iff': {
          const left = go(g.left, bound);
          return { kind: g.kind, left, right: go(g.right, bound) };
        }
      }
    };
    out.push(go(f, new Set()));
  }
  return out;
}

/** Replace every FREE occurrence of t1 in f by t2; null if t2 would be captured or nothing changes. */
export function replaceFree(f: Formula, t1: Term, t2: Term): Formula | null {
  let changed = false;
  let captured = false;
  const term = (t: Term, bound: Set<string>): Term => {
    if (!termEq(t, t1) || (t.kind === 'var' && bound.has(t.name))) return t;
    if (t2.kind === 'var' && bound.has(t2.name)) {
      captured = true;
      return t;
    }
    changed = true;
    return t2;
  };
  const go = (g: Formula, bound: Set<string>): Formula => {
    switch (g.kind) {
      case 'atom':
        return g;
      case 'identity':
        return { kind: 'identity', left: term(g.left, bound), right: term(g.right, bound) };
      case 'pred':
        return { kind: 'pred', name: g.name, args: g.args.map((t) => term(t, bound)) };
      case 'not':
        return Not(go(g.operand, bound));
      case 'forall':
      case 'exists':
        return { kind: g.kind, variable: g.variable, body: go(g.body, new Set([...bound, g.variable])) };
      case 'and':
      case 'or':
      case 'implies':
      case 'iff':
        return { kind: g.kind, left: go(g.left, bound), right: go(g.right, bound) };
    }
  };
  const out = go(f, new Set());
  return changed && !captured ? out : null;
}

export type LLResult =
  | { ok: true; replaced: number }
  | { ok: false; why: 'shape' | 'none' | 'reversed' | 'wrong-term' | 'bound' | 'capture'; detail?: string };

/**
 * Is `to` obtained from `from` by replacing one or more FREE occurrences of
 * t1 by t2 (t2 not captured)? Reports why not, for feedback.
 */
export function llCompare(from: Formula, to: Formula, t1: Term, t2: Term): LLResult {
  let replaced = 0;
  let reversed = 0;
  let problem: LLResult | null = null;
  const pair = (x: Term, y: Term, bound: Set<string>): boolean => {
    if (termEq(x, y)) return true;
    if (termEq(x, t1) && termEq(y, t2)) {
      if (x.kind === 'var' && bound.has(x.name)) {
        problem ??= { ok: false, why: 'bound', detail: x.name };
        return false;
      }
      if (y.kind === 'var' && bound.has(y.name)) {
        problem ??= { ok: false, why: 'capture', detail: y.name };
        return false;
      }
      replaced++;
      return true;
    }
    if (termEq(x, t2) && termEq(y, t1)) {
      reversed++;
      return false;
    }
    problem ??= { ok: false, why: 'wrong-term', detail: `${termText(x)}→${termText(y)}` };
    return false;
  };
  const walk = (a: Formula, b: Formula, bound: Set<string>): boolean => {
    if (a.kind !== b.kind) return false;
    switch (a.kind) {
      case 'atom':
        return a.name === (b as typeof a).name;
      case 'identity': {
        const bb = b as typeof a;
        const l = pair(a.left, bb.left, bound);
        const r = pair(a.right, bb.right, bound);
        return l && r;
      }
      case 'pred': {
        const bb = b as typeof a;
        if (a.name !== bb.name || a.args.length !== bb.args.length) return false;
        let ok = true;
        a.args.forEach((t, i) => {
          if (!pair(t, bb.args[i], bound)) ok = false;
        });
        return ok;
      }
      case 'not':
        return walk(a.operand, (b as typeof a).operand, bound);
      case 'forall':
      case 'exists': {
        const bb = b as typeof a;
        return a.variable === bb.variable && walk(a.body, bb.body, new Set([...bound, a.variable]));
      }
      case 'and':
      case 'or':
      case 'implies':
      case 'iff': {
        const bb = b as typeof a;
        const l = walk(a.left, bb.left, bound);
        const r = walk(a.right, bb.right, bound);
        return l && r;
      }
    }
  };
  const same = walk(from, to, new Set());
  if (same && replaced > 0) return { ok: true, replaced };
  if (same) return { ok: false, why: 'none' };
  if (problem) return problem;
  if (reversed > 0) return { ok: false, why: 'reversed' };
  return { ok: false, why: 'shape' };
}

/**
 * If c is an instance of the quantified formula q (every free occurrence of
 * q's variable replaced by one term), the term — or 'vacuous' — else null.
 * Never throws (the logic engine may not support something yet).
 */
export function instanceTerm(q: Extract<Formula, { variable: string }>, c: Formula): Term | 'vacuous' | null {
  try {
    return matchInstance(q.body, q.variable, c);
  } catch {
    return null;
  }
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

// -------------------------------------------------------------------- matching

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  const out: T[][] = [];
  xs.forEach((x, i) => {
    for (const p of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) out.push([x, ...p]);
  });
  return out;
}

function matchOrdered(rule: RuleId, fs: Formula[], c: Formula): boolean {
  const [a, b, d] = fs;
  switch (rule) {
    case 'MP':
      return a.kind === 'implies' && eq(a.left, b) && eq(a.right, c);
    case 'MT':
      return a.kind === 'implies' && isNegationOf(b, a.right) && isNegationOf(c, a.left);
    case 'ADJ':
      return c.kind === 'and' && eq(c.left, a) && eq(c.right, b);
    case 'ADD':
      return c.kind === 'or' && (eq(c.left, a) || eq(c.right, a));
    case 'MTP':
      return (
        a.kind === 'or' &&
        ((isNegationOf(b, a.left) && eq(c, a.right)) || (isNegationOf(b, a.right) && eq(c, a.left)))
      );
    case 'CB':
      return (
        a.kind === 'implies' &&
        b.kind === 'implies' &&
        eq(a.left, b.right) &&
        eq(a.right, b.left) &&
        c.kind === 'iff' &&
        ((eq(c.left, a.left) && eq(c.right, a.right)) || (eq(c.left, a.right) && eq(c.right, a.left)))
      );
    case 'Id':
      return fs.length === 0 && c.kind === 'identity' && termEq(c.left, c.right);
    case 'LL':
      return b.kind === 'identity' && llCompare(a, c, b.left, b.right).ok;
    case 'UI':
      return a.kind === 'forall' && instanceTerm(a, c) !== null;
    case 'EI': {
      if (a.kind !== 'exists') return false;
      const t = instanceTerm(a, c);
      return t === 'vacuous' || (t !== null && t.kind === 'var');
    }
    case 'EG':
      return c.kind === 'exists' && safe(() => isGeneralizationOf(c, a), false);
    case 'AV':
      return safe(() => alphaEquals(a, c), false);
    case 'SC':
      if (fs.length === 3) {
        return (
          a.kind === 'or' &&
          b.kind === 'implies' &&
          d.kind === 'implies' &&
          eq(b.left, a.left) &&
          eq(d.left, a.right) &&
          eq(b.right, c) &&
          eq(d.right, c)
        );
      }
      return (
        a.kind === 'implies' && b.kind === 'implies' && isNegationOf(b.left, a.left) && eq(a.right, c) && eq(b.right, c)
      );
    default:
      if (ONE_PREMISE_TRANSFORM.has(rule)) return transforms(rule, a).some((t) => eq(t, c));
      return false;
  }
}

/** Does `rule` justify `c` from exactly these formulas (in any order)? */
export function ruleApplies(rule: RuleId, fs: Formula[], c: Formula): boolean {
  if (!RULE_ARITY[rule].includes(fs.length)) return false;
  if (fs.length === 1) return matchOrdered(rule, fs, c);
  return permutations(fs).some((p) => matchOrdered(rule, p, c));
}

/** Other rules that justify c from exactly these refs. */
export function alternativeRules(rule: RuleId, fs: Formula[], c: Formula, allowDerived: boolean): RuleId[] {
  return INFERENCE_RULE_IDS.filter(
    (r) => r !== rule && (allowDerived || !DERIVED_RULE_IDS.includes(r)) && ruleApplies(r, fs, c),
  );
}

// ------------------------------------------------------------------- diagnosis

export interface Diagnosis {
  message: string;
  suggestion?: string;
  badRefs?: number[];
  target?: 'formula' | 'rule' | 'refs';
}

/** Context callbacks so diagnoses can point at useful accessible lines. */
export interface DiagContext {
  /** Line number of an accessible earlier line with exactly this formula, if any. */
  find(f: Formula): number | undefined;
  allowDerived: boolean;
}

const F = fmt;
const Ld = (r: RefF): string => `line ${r.n} (${F(r.f)})`;

function diagMP(n: number, [a, b]: RefF[], c: Formula, ctx: DiagContext): Diagnosis {
  const conds = [a, b].filter((r) => r.f.kind === 'implies');
  if (conds.length === 0) {
    const bic = [a, b].find((r) => r.f.kind === 'iff');
    return {
      message: `Line ${n}: MP (Modus Ponens) needs a conditional (φ → ψ) and its antecedent φ, but neither ${Ld(a)} nor ${Ld(b)} is a conditional.`,
      suggestion: bic
        ? `Line ${bic.n} is a biconditional. Take a conditional out of it with BC first, then use MP.`
        : 'Cite the conditional you want to use, together with the line that is exactly its antecedent.',
      badRefs: [a.n, b.n],
      target: 'refs',
    };
  }
  const other = (x: RefF): RefF => (x === a ? b : a);
  const imp = (x: RefF) => x.f as Extract<Formula, { kind: 'implies' }>;
  const cond =
    conds.find((x) => eq(imp(x).left, other(x).f)) ??
    conds.find((x) => eq(imp(x).right, c)) ??
    conds.find((x) => eq(imp(x).right, other(x).f)) ??
    conds[0];
  const o = other(cond);
  const { left: X, right: Y } = imp(cond);
  if (eq(o.f, X)) {
    return {
      message: `Line ${n}: MP from ${Ld(cond)} and ${Ld(o)} gives ${F(Y)}, but you wrote ${F(c)}.`,
      suggestion: `MP always concludes exactly the consequent of the conditional — here ${F(Y)}.`,
      target: 'formula',
    };
  }
  if (eq(o.f, Y) && eq(c, X)) {
    return {
      message: `Line ${n}: MP runs forwards from the antecedent; from ${F(cond.f)} and ${F(Y)} you cannot conclude ${F(X)}. That is the fallacy of affirming the consequent.`,
      suggestion: `To use line ${cond.n} with MP you need its antecedent ${F(X)} on a line of its own. Knowing ${F(Y)} tells you nothing about ${F(X)}.`,
      badRefs: [o.n],
      target: 'refs',
    };
  }
  if (isNegationOf(o.f, Y)) {
    return {
      message: `Line ${n}: MP needs the antecedent of ${Ld(cond)}, which is ${F(X)}; ${Ld(o)} is the negation of its consequent instead.`,
      suggestion: `With a conditional and the negation of its consequent, use MT (Modus Tollens), which gives ${F(Not(X))}.`,
      badRefs: [o.n],
      target: 'rule',
    };
  }
  if (isNegationOf(o.f, X)) {
    return {
      message: `Line ${n}: MP needs the antecedent ${F(X)} itself, but ${Ld(o)} is its negation. From ${F(cond.f)} and ${F(o.f)} nothing follows about ${F(Y)} (that would be denying the antecedent).`,
      suggestion: `Look for a line that is exactly ${F(X)}, or a different way to use line ${o.n}.`,
      badRefs: [o.n],
      target: 'refs',
    };
  }
  const has = ctx.find(X);
  return {
    message: `Line ${n}: MP needs a conditional and its antecedent. Line ${cond.n} is ${F(cond.f)}, so the other line must be ${F(X)} — line ${o.n} is ${F(o.f)}.`,
    suggestion:
      (o.f.kind === 'not' ? 'Did you mean MT? Or cite' : 'Cite') +
      ` the line that contains ${F(X)}` +
      (has !== undefined ? ` (line ${has}).` : ' — you may need to derive it first.'),
    badRefs: [o.n],
    target: 'refs',
  };
}

function diagMT(n: number, [a, b]: RefF[], c: Formula, ctx: DiagContext): Diagnosis {
  const conds = [a, b].filter((r) => r.f.kind === 'implies');
  if (conds.length === 0) {
    const bic = [a, b].find((r) => r.f.kind === 'iff');
    return {
      message: `Line ${n}: MT (Modus Tollens) needs a conditional φ → ψ and the negation of its consequent ¬ψ, but neither ${Ld(a)} nor ${Ld(b)} is a conditional.`,
      suggestion: bic
        ? `Line ${bic.n} is a biconditional. Take a conditional out of it with BC first.`
        : 'Cite a conditional together with the line that is the negation of its consequent.',
      badRefs: [a.n, b.n],
      target: 'refs',
    };
  }
  const other = (x: RefF): RefF => (x === a ? b : a);
  const imp = (x: RefF) => x.f as Extract<Formula, { kind: 'implies' }>;
  const cond =
    conds.find((x) => isNegationOf(other(x).f, imp(x).right)) ??
    conds.find((x) => isNegationOf(c, imp(x).left)) ??
    conds.find((x) => eq(other(x).f, imp(x).left) || eq(other(x).f, imp(x).right)) ??
    conds[0];
  const o = other(cond);
  const { left: X, right: Y } = imp(cond);
  if (isNegationOf(o.f, Y)) {
    if (eq(c, X)) {
      return {
        message: `Line ${n}: MT concludes the NEGATION of the antecedent. From ${F(cond.f)} and ${F(o.f)} you get ${F(Not(X))}, not ${F(X)}.`,
        suggestion: `MT gives the negation of the antecedent: write ${F(Not(X))} here (and use DN afterwards if you need to).`,
        target: 'formula',
      };
    }
    if (X.kind === 'not' && eq(c, X.operand)) {
      return {
        message: `Line ${n}: MT from ${Ld(cond)} and ${Ld(o)} gives ${F(Not(X))} — the negation of the antecedent ${F(X)} — not ${F(c)}. MT itself never removes negations.`,
        suggestion: `Write ${F(Not(X))} with MT, then use DN on the next line to get ${F(c)}.`,
        target: 'formula',
      };
    }
    return {
      message: `Line ${n}: MT from ${Ld(cond)} and ${Ld(o)} gives ${F(Not(X))}, but you wrote ${F(c)}.`,
      suggestion: `MT always concludes exactly the negation of the antecedent — here ${F(Not(X))}.`,
      target: 'formula',
    };
  }
  if (isNegationOf(o.f, X) && isNegationOf(c, Y)) {
    return {
      message: `Line ${n}: MT runs backwards from the negated consequent. From ${F(cond.f)} and ${F(o.f)} you cannot conclude ${F(c)} — that is the fallacy of denying the antecedent.`,
      suggestion: `To use line ${cond.n} with MT you need ${F(Not(Y))}, the negation of its consequent.`,
      badRefs: [o.n],
      target: 'refs',
    };
  }
  if (eq(o.f, X)) {
    return {
      message: `Line ${n}: MT needs the negation of the consequent of ${Ld(cond)}, but ${Ld(o)} is its antecedent — that is a job for MP, not MT.`,
      suggestion: `With a conditional and its antecedent, use MP (Modus Ponens); it gives ${F(Y)}.`,
      badRefs: [o.n],
      target: 'rule',
    };
  }
  if (Y.kind === 'not' && eq(o.f, Y.operand)) {
    return {
      message: `Line ${n}: MT needs the negation of the consequent. The consequent of line ${cond.n} is ${F(Y)}, so its negation is ${F(Not(Y))} — not ${F(o.f)}.`,
      suggestion: `Use DN on line ${o.n} to get ${F(Not(Y))} first, then apply MT.`,
      badRefs: [o.n],
      target: 'refs',
    };
  }
  if (eq(o.f, Y)) {
    return {
      message: `Line ${n}: MT needs the negation of the consequent, ${F(Not(Y))}, but ${Ld(o)} is the consequent itself. From ${F(cond.f)} and ${F(Y)} nothing follows about ${F(X)}.`,
      suggestion: `Look for (or derive) ${F(Not(Y))} if you want to use MT on line ${cond.n}.`,
      badRefs: [o.n],
      target: 'refs',
    };
  }
  const has = ctx.find(Not(Y));
  return {
    message: `Line ${n}: MT needs a conditional and the negation of its consequent. Line ${cond.n} is ${F(cond.f)}, so the other line must be ${F(Not(Y))} — line ${o.n} is ${F(o.f)}.`,
    suggestion: `Cite the line that contains ${F(Not(Y))}` + (has !== undefined ? ` (line ${has}).` : ' — you may need to derive it first.'),
    badRefs: [o.n],
    target: 'refs',
  };
}

function negCount(f: Formula): [number, Formula] {
  let k = 0;
  while (f.kind === 'not') {
    k++;
    f = f.operand;
  }
  return [k, f];
}

function diagDN(n: number, [a]: RefF[], c: Formula): Diagnosis {
  const [ka, ca] = negCount(a.f);
  const [kc, cc] = negCount(c);
  if (eq(ca, cc)) {
    const diff = Math.abs(ka - kc);
    if (diff === 1)
      return {
        message: `Line ${n}: DN (Double Negation) adds or removes exactly TWO negation signs, but ${Ld(a)} and ${F(c)} differ by only one ¬. Adding or dropping a single ¬ changes the meaning.`,
        suggestion:
          kc < ka
            ? `A single ¬ cannot be dropped. If you need ${F(c)}, look for another route (ID is often the way).`
            : `From ${F(a.f)}, DN gives ${F(Not(Not(a.f)))}.`,
        target: 'formula',
      };
    if (diff === 0)
      return {
        message: `Line ${n}: DN must add or remove two negation signs, but ${F(c)} is the same as ${Ld(a)}.`,
        suggestion: 'To copy a line unchanged, use R (Repetition).',
        target: 'rule',
      };
    return {
      message: `Line ${n}: one DN step adds or removes exactly two ¬ signs, but ${Ld(a)} and ${F(c)} differ by ${diff}.`,
      suggestion: diff % 2 === 0 ? 'Use DN several times, one pair of negations per line.' : 'An odd number of ¬ signs can never be removed by DN.',
      target: 'formula',
    };
  }
  if (eq(stripDN(a.f), stripDN(c))) {
    return {
      message: `Line ${n}: DN only works on the whole line — two ¬ in front of the entire formula. ${capitalize(Ld(a))} has its double negation inside ${aKind(a.f)}, so DN can't reach it.`,
      suggestion: `Break line ${a.n} apart first (e.g. with S or MP) so the doubly-negated part stands on its own line, then use DN.`,
      target: 'rule',
    };
  }
  return {
    message: `Line ${n}: DN (Double Negation) turns ${F(a.f)} into ${F(Not(Not(a.f)))}${ka >= 2 ? ` or ${F((a.f as { operand: { operand: Formula } }).operand.operand)}` : ''}, but you wrote ${F(c)}.`,
    suggestion: 'DN only adds or removes ¬¬ at the front of a whole line.',
    target: 'formula',
  };
}

function diagR(n: number, [a]: RefF[], c: Formula): Diagnosis {
  if (eq(stripDN(a.f), stripDN(c)))
    return {
      message: `Line ${n}: R (Repetition) copies a line exactly, but ${F(c)} differs from ${Ld(a)} by a double negation.`,
      suggestion: 'Use DN to add or remove a double negation.',
      target: 'rule',
    };
  return {
    message: `Line ${n}: R (Repetition) copies a line exactly — line ${a.n} is ${F(a.f)}, but you wrote ${F(c)}.`,
    suggestion: `Write exactly ${F(a.f)}, or pick the rule that actually produces ${F(c)}.`,
    target: 'formula',
  };
}

function conjuncts(f: Formula): Formula[] {
  return f.kind === 'and' ? [...conjuncts(f.left), ...conjuncts(f.right)] : [f];
}

function diagS(n: number, [a]: RefF[], c: Formula, ctx: DiagContext): Diagnosis {
  const f = a.f;
  if (f.kind !== 'and') {
    let extra = '';
    let suggestion = 'S only takes apart a line whose main connective is ∧.';
    if (f.kind === 'or') {
      extra = ` From ${F(f)} you only know that at least one disjunct is true, not which one.`;
      suggestion = 'To use a disjunction, try MTP (together with the negation of one disjunct).';
    } else if (f.kind === 'implies') {
      suggestion = 'To use a conditional, try MP (with its antecedent) or MT (with the negation of its consequent).';
    } else if (f.kind === 'iff') {
      suggestion = 'To use a biconditional, take a conditional out with BC.';
    } else if (f.kind === 'not' && f.operand.kind === 'and') {
      extra = ` The ¬ applies to the whole conjunction: ${F(f)} says "not both", not "both".`;
      suggestion = ctx.allowDerived
        ? 'Rewrite it with DM (De Morgan) to get a disjunction, or use it in an ID proof.'
        : `A negated conjunction is usually useful as one half of a contradiction in an ID proof (derive ${F(f.operand)}).`;
    }
    return {
      message: `Line ${n}: S (Simplification) extracts one conjunct from a conjunction, but ${Ld(a)} is ${aKind(f)}, not a conjunction.${extra}`,
      suggestion,
      badRefs: [a.n],
      target: 'refs',
    };
  }
  const all = conjuncts(f);
  if (all.some((x) => eq(x, c)))
    return {
      message: `Line ${n}: S takes off only the outermost ∧. From ${Ld(a)} it gives ${F(f.left)} or ${F(f.right)}; ${F(c)} is buried one level deeper.`,
      suggestion: 'Use S twice: first extract the conjunction that contains it, then extract it.',
      target: 'formula',
    };
  if (c.kind === 'and' && eq(c.left, f.right) && eq(c.right, f.left))
    return {
      message: `Line ${n}: S gives a single conjunct, and cannot swap the order of ${Ld(a)}.`,
      suggestion: 'To reorder a conjunction, use S twice and then ADJ.',
      target: 'rule',
    };
  return {
    message: `Line ${n}: S from ${Ld(a)} can give ${F(f.left)} or ${F(f.right)}, but you wrote ${F(c)}.`,
    suggestion: `Write one of the two conjuncts exactly: ${F(f.left)} or ${F(f.right)}.`,
    target: 'formula',
  };
}

function diagADJ(n: number, [a, b]: RefF[], c: Formula): Diagnosis {
  if (c.kind !== 'and') {
    const addNote =
      c.kind === 'or' && [a, b].some((r) => eq((c as { left: Formula }).left, r.f) || eq((c as { right: Formula }).right, r.f))
        ? ' To build a disjunction from one line, use ADD (Addition).'
        : '';
    return {
      message: `Line ${n}: ADJ (Adjunction) always produces a conjunction (φ ∧ ψ) of the two cited lines, but ${F(c)} is ${aKind(c)}.${addNote}`,
      suggestion: `ADJ of lines ${a.n} and ${b.n} gives ${F(And(a.f, b.f))} (or ${F(And(b.f, a.f))}).`,
      target: 'formula',
    };
  }
  const missing = [c.left, c.right].filter((x) => !eq(x, a.f) && !eq(x, b.f));
  const bad = [a, b].filter((r) => !eq(r.f, c.left) && !eq(r.f, c.right)).map((r) => r.n);
  return {
    message:
      `Line ${n}: ADJ of ${Ld(a)} and ${Ld(b)} gives ${F(And(a.f, b.f))} (or ${F(And(b.f, a.f))}), but you wrote ${F(c)}.` +
      (missing.length ? ` The conjunct ${F(missing[0])} is not one of the cited lines.` : ''),
    suggestion: missing.length ? `Cite a line that is exactly ${F(missing[0])} (derive it first if needed).` : 'Each conjunct must be exactly one of the cited lines.',
    badRefs: bad.length ? bad : undefined,
    target: bad.length ? 'refs' : 'formula',
  };
}

function diagADD(n: number, [a]: RefF[], c: Formula): Diagnosis {
  if (c.kind === 'and')
    return {
      message: `Line ${n}: ADD (Addition) builds a disjunction (∨), not a conjunction. You can't get ${F(c)} from ${Ld(a)} alone.`,
      suggestion: 'To form a conjunction, use ADJ (Adjunction) and cite a line for each conjunct.',
      target: 'rule',
    };
  if (c.kind !== 'or')
    return {
      message: `Line ${n}: ADD (Addition) always produces a disjunction φ ∨ ψ, but ${F(c)} is ${aKind(c)}.`,
      suggestion: `From ${F(a.f)}, ADD gives a formula like ${F(Or(a.f, { kind: 'atom', name: 'Q' }))} — with ${F(a.f)} as one whole disjunct.`,
      target: 'formula',
    };
  return {
    message: `Line ${n}: ADD lets you attach any formula with ∨ to ${Ld(a)}, so ${F(a.f)} must be one of the two disjuncts — but the disjuncts of ${F(c)} are ${F(c.left)} and ${F(c.right)}.`,
    suggestion: `Cite the line that is exactly one of the disjuncts, or change the formula so that ${F(a.f)} is a whole disjunct.`,
    badRefs: [a.n],
    target: 'refs',
  };
}

function diagMTP(n: number, [a, b]: RefF[], c: Formula, ctx: DiagContext): Diagnosis {
  const disj = [a, b].filter((r) => r.f.kind === 'or');
  if (disj.length === 0) {
    return {
      message: `Line ${n}: MTP (Modus Tollendo Ponens) needs a disjunction and the negation of one of its disjuncts, but neither ${Ld(a)} nor ${Ld(b)} is a disjunction.`,
      suggestion: [a, b].some((r) => r.f.kind === 'implies')
        ? 'For a conditional, use MP (with its antecedent) or MT (with the negation of its consequent).'
        : 'Cite a disjunction together with the negation of one of its disjuncts.',
      badRefs: [a.n, b.n],
      target: 'refs',
    };
  }
  const other = (x: RefF): RefF => (x === a ? b : a);
  const or = (x: RefF) => x.f as Extract<Formula, { kind: 'or' }>;
  const d =
    disj.find((x) => isNegationOf(other(x).f, or(x).left) || isNegationOf(other(x).f, or(x).right)) ??
    disj.find((x) => eq(other(x).f, or(x).left) || eq(other(x).f, or(x).right)) ??
    disj[0];
  const o = other(d);
  const { left: L, right: R } = or(d);
  if (isNegationOf(o.f, L) || isNegationOf(o.f, R)) {
    const expect = isNegationOf(o.f, L) ? R : L;
    return {
      message: `Line ${n}: MTP from ${Ld(d)} and ${Ld(o)} gives the other disjunct, ${F(expect)}, but you wrote ${F(c)}.`,
      suggestion: `MTP concludes exactly the disjunct that was not negated — here ${F(expect)}.`,
      target: 'formula',
    };
  }
  if (eq(o.f, L) || eq(o.f, R)) {
    return {
      message: `Line ${n}: MTP needs the NEGATION of one disjunct, but ${Ld(o)} is a disjunct of ${F(d.f)} itself. Knowing one disjunct is true tells you nothing about the other.`,
      suggestion: `You need ${F(Not(L))} or ${F(Not(R))} to use line ${d.n} with MTP.`,
      badRefs: [o.n],
      target: 'refs',
    };
  }
  const wrongNeg = [L, R].find((x) => x.kind === 'not' && eq(o.f, x.operand));
  if (wrongNeg) {
    return {
      message: `Line ${n}: MTP needs the negation of a disjunct. The negation of ${F(wrongNeg)} is ${F(Not(wrongNeg))}, not ${F(o.f)}.`,
      suggestion: `Use DN on line ${o.n} to get ${F(Not(wrongNeg))} first, then apply MTP.`,
      badRefs: [o.n],
      target: 'refs',
    };
  }
  const has = ctx.find(Not(L)) ?? ctx.find(Not(R));
  return {
    message: `Line ${n}: MTP needs a disjunction and the negation of one of its disjuncts. Line ${d.n} is ${F(d.f)}, so the other line must be ${F(Not(L))} or ${F(Not(R))} — line ${o.n} is ${F(o.f)}.`,
    suggestion: has !== undefined ? `Line ${has} looks like what you need.` : 'Derive the negation of one disjunct first.',
    badRefs: [o.n],
    target: 'refs',
  };
}

function diagBC(n: number, [a]: RefF[], c: Formula): Diagnosis {
  if (a.f.kind !== 'iff') {
    return {
      message: `Line ${n}: BC (Biconditional to Conditional) takes a conditional out of a biconditional, but ${Ld(a)} is ${aKind(a.f)}.`,
      suggestion:
        c.kind === 'iff'
          ? 'To BUILD a biconditional, use CB with both conditionals φ → ψ and ψ → φ.'
          : a.f.kind === 'implies' && eq(c, Implies(a.f.right, a.f.left))
            ? `A conditional does not give you its converse: ${F(a.f)} does not mean ${F(c)}.`
            : 'BC only applies to a line whose main connective is ↔.',
      badRefs: [a.n],
      target: 'refs',
    };
  }
  return {
    message: `Line ${n}: BC from ${Ld(a)} gives ${F(Implies(a.f.left, a.f.right))} or ${F(Implies(a.f.right, a.f.left))}, but you wrote ${F(c)}.`,
    suggestion: 'Write one of the two conditionals exactly.',
    target: 'formula',
  };
}

function diagCB(n: number, [a, b]: RefF[], c: Formula): Diagnosis {
  const notCond = [a, b].filter((r) => r.f.kind !== 'implies');
  if (notCond.length) {
    return {
      message: `Line ${n}: CB (Conditional to Biconditional) needs two conditionals, φ → ψ and ψ → φ, but ${notCond.map((r) => `${Ld(r)} is ${aKind(r.f)}`).join(' and ')}.`,
      suggestion: 'Prove each direction as a conditional (usually with CD), then cite both with CB.',
      badRefs: notCond.map((r) => r.n),
      target: 'refs',
    };
  }
  const A = a.f as Extract<Formula, { kind: 'implies' }>;
  const B = b.f as Extract<Formula, { kind: 'implies' }>;
  if (!(eq(A.left, B.right) && eq(A.right, B.left))) {
    return {
      message: `Line ${n}: CB needs a conditional and its converse, but ${Ld(a)} and ${Ld(b)} are not converses of each other.`,
      suggestion: `The converse of ${F(A)} is ${F(Implies(A.right, A.left))}.`,
      badRefs: [b.n],
      target: 'refs',
    };
  }
  return {
    message: `Line ${n}: CB from ${Ld(a)} and ${Ld(b)} gives ${F(Iff(A.left, A.right))} (or ${F(Iff(A.right, A.left))}), but you wrote ${F(c)}.`,
    suggestion: 'The two sides of the biconditional must be the antecedent and consequent of the cited conditionals.',
    target: 'formula',
  };
}

function diagSC(n: number, refs: RefF[], c: Formula): Diagnosis {
  const disj = refs.find((r) => r.f.kind === 'or');
  const conds = refs.filter((r) => r.f.kind === 'implies');
  if (refs.length === 3 && !disj) {
    return {
      message: `Line ${n}: SC (Separation of Cases) needs a disjunction φ ∨ ψ among the cited lines, but none of ${lineList(refs.map((r) => r.n))} is a disjunction.`,
      suggestion: 'Cite the disjunction that sets up the two cases, plus a conditional from each case to the conclusion.',
      target: 'refs',
    };
  }
  if (conds.length < 2) {
    return {
      message: `Line ${n}: SC needs two conditionals (one from each case to the conclusion), but only ${conds.length} of the cited lines ${conds.length === 1 ? 'is a conditional' : 'are conditionals'}.`,
      suggestion: 'Prove φ → χ and ψ → χ (usually with CD) and cite both.',
      target: 'refs',
    };
  }
  const bad = conds.filter((r) => !eq((r.f as { right: Formula }).right, c));
  if (bad.length)
    return {
      message: `Line ${n}: in SC each conditional must lead to the conclusion ${F(c)}, but ${bad.map((r) => `line ${r.n}'s consequent is ${F((r.f as { right: Formula }).right)}`).join(' and ')}.`,
      suggestion: 'Both cases must end in exactly the same formula, which is what SC concludes.',
      badRefs: bad.map((r) => r.n),
      target: 'refs',
    };
  if (disj) {
    const D = disj.f as Extract<Formula, { kind: 'or' }>;
    return {
      message: `Line ${n}: in SC the conditionals must start from the two disjuncts of ${Ld(disj)}: one from ${F(D.left)} and one from ${F(D.right)}.`,
      suggestion: `You need ${F(Implies(D.left, c))} and ${F(Implies(D.right, c))}.`,
      target: 'refs',
    };
  }
  return {
    message: `Line ${n}: the two-conditional form of SC needs φ → χ and ¬φ → χ, with antecedents that are exact negations of each other.`,
    suggestion: 'Check that one antecedent is exactly the negation of the other.',
    target: 'refs',
  };
}

/** A sample instance of q for messages: with a term from c if any, else 'a'. */
function sampleInstance(q: Extract<Formula, { variable: string }>, c: Formula): Formula | null {
  const names = safe(() => namesOf(c), [] as string[]);
  const t: Term = names.length ? Name(names[0]) : Name('a');
  return safe(() => substitute(q.body, q.variable, t), null);
}

function mainIs(f: Formula): string {
  return f.kind === 'atom' || f.kind === 'pred' || f.kind === 'identity' ? `${aKind(f)}` : `${aKind(f)} (main connective ${mainSymbol(f)})`;
}

function mainSymbol(f: Formula): string {
  switch (f.kind) {
    case 'not':
      return '¬';
    case 'and':
      return '∧';
    case 'or':
      return '∨';
    case 'implies':
      return '→';
    case 'iff':
      return '↔';
    case 'forall':
      return '∀';
    case 'exists':
      return '∃';
    case 'atom':
    case 'identity':
    case 'pred':
      return '';
  }
}

function containsQuantifier(f: Formula, kind: 'forall' | 'exists'): boolean {
  switch (f.kind) {
    case 'atom':
    case 'identity':
    case 'pred':
      return false;
    case 'not':
      return containsQuantifier(f.operand, kind);
    case 'forall':
    case 'exists':
      return f.kind === kind || containsQuantifier(f.body, kind);
    case 'and':
    case 'or':
    case 'implies':
    case 'iff':
      return containsQuantifier(f.left, kind) || containsQuantifier(f.right, kind);
  }
}

/**
 * How to say that a thing satisfies the open formula body (free variable v):
 * "is F" for a simple one-place predication Fv, else "satisfies Fx ∧ Gx".
 */
export function describeOpen(body: Formula, v: string): string {
  if (body.kind === 'pred' && body.args.length === 1 && body.args[0].kind === 'var' && body.args[0].name === v) return `is ${body.name}`;
  if (body.kind === 'not' && body.operand.kind === 'pred' && body.operand.args.length === 1 && body.operand.args[0].kind === 'var' && body.operand.args[0].name === v)
    return `is not ${body.operand.name}`;
  return `satisfies ${F(body)}`;
}

/** Advice for using a line whose main connective is not the quantifier the rule needs. */
function quantifierInsideAdvice(f: Formula, q: '∀' | '∃', rule: 'UI' | 'EI'): string {
  const then = `then apply ${rule} to that line`;
  switch (f.kind) {
    case 'implies':
      return containsQuantifier(f.left, q === '∀' ? 'forall' : 'exists') && !containsQuantifier(f.right, q === '∀' ? 'forall' : 'exists')
        ? `To use this conditional, derive its antecedent ${F(f.left)} first and apply MP.`
        : `To use this conditional, derive its antecedent ${F(f.left)} and apply MP to get ${F(f.right)} on its own line; ${then}.`;
    case 'and':
      return `Use S to get the quantified conjunct on its own line; ${then}.`;
    case 'or':
      return `A disjunction is used with MTP (with the negation of one disjunct), not by instantiating inside it.`;
    case 'iff':
      return `Take a conditional out with BC first.`;
    case 'not':
      return f.operand.kind === 'forall' || f.operand.kind === 'exists'
        ? `A negated quantifier is not a quantifier. With derived rules on, QN turns ${F(f)} into ${F(f.operand.kind === 'forall' ? Exists(f.operand.variable, Not(f.operand.body)) : Forall(f.operand.variable, Not(f.operand.body)))}; otherwise use it in an ID proof.`
        : `A negation can't be instantiated; use it in an ID proof or with MT/MTP.`;
    case 'atom':
    case 'identity':
    case 'pred':
    case 'forall':
    case 'exists':
      return `Cite a line whose main connective is ${q}.`;
  }
}

function diagInstantiation(rule: 'UI' | 'EI', n: number, [a]: RefF[], c: Formula): Diagnosis {
  const want = rule === 'UI' ? 'forall' : 'exists';
  const q = rule === 'UI' ? '∀' : '∃';
  const what = rule === 'UI' ? 'a universal ∀xφ' : 'an existential ∃xφ';
  if (a.f.kind !== want) {
    if (a.f.kind === 'forall' || a.f.kind === 'exists') {
      return {
        message: `Line ${n}: ${rule} applies only to ${what}, but ${Ld(a)} is ${aKind(a.f)}.`,
        suggestion:
          rule === 'UI'
            ? 'For an existential use EI, and instantiate to a variable that is new to the derivation.'
            : 'For a universal use UI — it may be instantiated to any term.',
        badRefs: [a.n],
        target: 'rule',
      };
    }
    const inside = containsQuantifier(a.f, want);
    return {
      message: inside
        ? `Line ${n}: ${rule} applies only when ${q} is the main connective of the whole line. In ${Ld(a)} the main connective is ${mainSymbol(a.f)}; the ${q} covers only part of the formula.`
        : `Line ${n}: ${rule} applies to ${what}, but ${Ld(a)} is ${mainIs(a.f)}.`,
      suggestion: inside ? quantifierInsideAdvice(a.f, q, rule) : `Cite a line whose main connective is ${q}.`,
      badRefs: [a.n],
      target: 'refs',
    };
  }
  const Q = a.f as Extract<Formula, { variable: string }>;
  const t = instanceTerm(Q, c);
  if (rule === 'EI' && t !== null && t !== 'vacuous' && t.kind === 'name') {
    return {
      message: `Line ${n}: EI must instantiate to a new VARIABLE, not to the name ${t.name}. From ${F(a.f)} you only know that something ${describeOpen(Q.body, Q.variable)} — not that it is ${t.name}.`,
      suggestion: 'Use a variable that occurs nowhere above (e.g. y or z) instead of a name.',
      target: 'formula',
    };
  }
  const sample = sampleInstance(Q, c);
  const terms = termsAt(Q.body, Q.variable, c);
  const partial = terms !== null && terms.size > 1;
  return {
    message: partial
      ? `Line ${n}: ${rule} must replace EVERY free occurrence of ${Q.variable} in ${F(Q.body)} by one and the same term; ${F(c)} replaces only some of them (or uses different terms).`
      : `Line ${n}: ${rule} from ${Ld(a)} drops the ${q}${Q.variable} and puts one term for every free ${Q.variable} in ${F(Q.body)}${sample ? ` (for example ${F(sample)})` : ''}, but ${F(c)} is not of that form.`,
    suggestion:
      rule === 'UI'
        ? `Write ${F(Q.body)} with each free ${Q.variable} replaced by the same name or variable.`
        : `Write ${F(Q.body)} with each free ${Q.variable} replaced by the same NEW variable.`,
    target: 'formula',
  };
}

/**
 * If c has the same shape as body except where body has a free occurrence
 * of v, return the set of terms (as text) found at those positions; else null.
 */
function termsAt(body: Formula, v: string, c: Formula): Set<string> | null {
  const found = new Set<string>();
  const walk = (b: Formula, x: Formula, bound: Set<string>): boolean => {
    if (b.kind !== x.kind) return false;
    switch (b.kind) {
      case 'atom':
        return b.name === (x as typeof b).name;
      case 'identity': {
        const xi = x as typeof b;
        return [b.left, b.right].every((t, i) => {
          const xt = i === 0 ? xi.left : xi.right;
          if (t.kind === 'var' && t.name === v && !bound.has(v)) {
            found.add(`${xt.kind}:${xt.name}`);
            return true;
          }
          return t.kind === xt.kind && t.name === xt.name;
        });
      }
      case 'pred': {
        const xa = (x as typeof b).args;
        if (b.name !== (x as typeof b).name || b.args.length !== xa.length) return false;
        return b.args.every((t, i) => {
          if (t.kind === 'var' && t.name === v && !bound.has(v)) {
            found.add(`${xa[i].kind}:${xa[i].name}`);
            return true;
          }
          return t.kind === xa[i].kind && t.name === xa[i].name;
        });
      }
      case 'not':
        return walk(b.operand, (x as typeof b).operand, bound);
      case 'forall':
      case 'exists': {
        const xq = x as typeof b;
        if (b.variable !== xq.variable) return false;
        return walk(b.body, xq.body, new Set([...bound, b.variable]));
      }
      case 'and':
      case 'or':
      case 'implies':
      case 'iff': {
        const xb = x as typeof b;
        return walk(b.left, xb.left, bound) && walk(b.right, xb.right, bound);
      }
    }
  };
  return walk(body, c, new Set()) ? found : null;
}

function diagEG(n: number, [a]: RefF[], c: Formula): Diagnosis {
  if (c.kind !== 'exists') {
    return {
      message:
        c.kind === 'forall'
          ? `Line ${n}: EG concludes an existential ∃xφ, but ${F(c)} is a universal. One instance never justifies "everything".`
          : `Line ${n}: EG concludes an existential ∃xφ, but ${F(c)} is ${aKind(c)}.`,
      suggestion:
        c.kind === 'forall'
          ? 'To prove a universal, open "Show ∀x…" and close it with UD (Universal Derivation).'
          : 'EG puts ∃x in front of a formula in which x replaces a term of the cited line.',
      target: 'formula',
    };
  }
  const free = safe(() => freeVariables(c.body), [] as string[]);
  return {
    message: `Line ${n}: EG from ${Ld(a)} needs ${F(c)} to be a generalization of it — replacing ${c.variable} in ${F(c.body)} by one term should give back exactly ${F(a.f)}, but it doesn't.`,
    suggestion: free.includes(c.variable)
      ? `Put ${c.variable} exactly where one term (a name or variable) occurs in line ${a.n}, and leave the rest of the formula unchanged.`
      : `${F(c)} doesn't use ${c.variable} at all inside — generalize by replacing a term of line ${a.n} with ${c.variable}.`,
    target: 'formula',
  };
}

function diagId(n: number, c: Formula): Diagnosis {
  if (c.kind === 'identity')
    return {
      message: `Line ${n}: Id (Identity) only gives a statement with the same term on both sides, like ${c.left.name} = ${c.left.name}; ${F(c)} relates two different terms.`,
      suggestion: 'An identity between different terms has to come from premises — combine identities with LL, or flip one with SM.',
      target: 'rule',
    };
  return {
    message: `Line ${n}: Id (Identity) only gives lines of the form t = t, but ${F(c)} is ${aKind(c)}.`,
    suggestion: 'Pick the rule that actually produces this line.',
    target: 'rule',
  };
}

function diagLL(n: number, [a, b]: RefF[], c: Formula): Diagnosis {
  const ids = [a, b].filter((r) => r.f.kind === 'identity');
  if (ids.length === 0)
    return {
      message: `Line ${n}: LL (Leibniz's Law) needs an identity t1 = t2 among the cited lines, but neither ${Ld(a)} nor ${Ld(b)} is an identity.`,
      suggestion: 'Cite the identity that licenses the substitution together with the line you rewrite.',
      badRefs: [a.n, b.n],
      target: 'refs',
    };
  // Prefer the reading that comes closest to working.
  const readings = ids.map((idr) => {
    const other = idr === a ? b : a;
    const id = idr.f as Extract<Formula, { kind: 'identity' }>;
    return { idr, other, id, res: llCompare(other.f, c, id.left, id.right) };
  });
  const rank = (w: LLResult) => (w.ok ? 0 : w.why === 'reversed' ? 1 : w.why === 'bound' || w.why === 'capture' ? 2 : w.why === 'none' ? 3 : 4);
  readings.sort((x, y) => rank(x.res) - rank(y.res));
  const { idr, other, id, res } = readings[0];
  const t1 = id.left.name;
  const t2 = id.right.name;
  if (res.ok) return { message: `Line ${n}: LL (Leibniz's Law) applies.`, target: 'formula' };
  switch (res.why) {
    case 'reversed':
      return {
        message: `Line ${n}: LL (Leibniz's Law) with ${Ld(idr)} replaces ${t1} by ${t2} — but you replaced ${t2} by ${t1} in ${Ld(other)}.`,
        suggestion: `Use SM on line ${idr.n} to get ${t2} = ${t1} first, then cite that with LL.`,
        target: 'refs',
      };
    case 'bound':
      return {
        message: `Line ${n}: LL (Leibniz's Law) only replaces FREE occurrences of ${t1}, but in ${Ld(other)} the ${res.detail} you replaced is bound by a quantifier.`,
        suggestion: 'Leave bound variables alone; instantiate the quantifier (UI/EI) first if you need that occurrence.',
        target: 'formula',
      };
    case 'capture':
      return {
        message: `Line ${n}: LL (Leibniz's Law) would put ${t2} where a quantifier binds ${res.detail}, changing what the formula says.`,
        suggestion: 'Only substitute where the new term stays free.',
        target: 'formula',
      };
    case 'none':
      return {
        message: `Line ${n}: LL (Leibniz's Law) with ${Ld(idr)} must replace at least one ${t1} by ${t2}, but ${F(c)} is unchanged from ${Ld(other)}.`,
        suggestion: `Replace one or more free occurrences of ${t1} by ${t2} (to copy a line unchanged, use R).`,
        target: 'formula',
      };
    case 'wrong-term':
      return {
        message: `Line ${n}: LL (Leibniz's Law) with ${Ld(idr)} may only replace ${t1} by ${t2}, but ${F(c)} differs from ${Ld(other)} in another way (${res.detail?.replace('→', ' became ')}).`,
        suggestion: `Change only occurrences of ${t1}, and only into ${t2}; everything else must stay exactly as in line ${other.n}.`,
        target: 'formula',
      };
    case 'shape':
      return {
        message: `Line ${n}: LL (Leibniz's Law) only swaps terms; ${F(c)} is not ${Ld(other)} with some ${t1} replaced by ${t2}.`,
        suggestion: `Keep the formula of line ${other.n} exactly, changing only occurrences of ${t1} into ${t2}.`,
        target: 'formula',
      };
  }
}

function diagSM(n: number, [a]: RefF[], c: Formula): Diagnosis {
  const isId = a.f.kind === 'identity' || (a.f.kind === 'not' && a.f.operand.kind === 'identity');
  if (!isId)
    return {
      message: `Line ${n}: SM (Symmetry) applies only to an identity t1 = t2 (or t1 ≠ t2), but ${Ld(a)} is ${aKind(a.f)}.${a.f.kind === 'pred' && a.f.args.length === 2 ? ` Swapping the terms of a relation like ${F(a.f)} is not valid in general.` : ''}`,
      suggestion: 'SM only swaps the two sides of an identity.',
      badRefs: [a.n],
      target: 'refs',
    };
  return {
    message: `Line ${n}: SM (Symmetry) from ${Ld(a)} gives ${transforms('SM', a.f).map(F).join(' or ')}, but you wrote ${F(c)}.`,
    suggestion: 'SM swaps the two terms and changes nothing else.',
    target: 'formula',
  };
}

function diagAV(n: number, [a]: RefF[], c: Formula): Diagnosis {
  return {
    message: `Line ${n}: AV only renames bound variables consistently, but ${F(c)} is not an alphabetic variant of ${Ld(a)}.`,
    suggestion: 'Rename each bound variable everywhere it is bound (and nothing else); free variables and names must stay the same.',
    target: 'formula',
  };
}

function diagTransform(rule: RuleId, n: number, [a]: RefF[], c: Formula): Diagnosis {
  const outs = transforms(rule, a.f);
  const label = ruleLabel(rule);
  if (outs.length === 0) {
    const shape: Record<string, string> = {
      DM: 'a negated conjunction or disjunction such as ¬(φ ∧ ψ), or a disjunction/conjunction of negations such as ¬φ ∨ ¬ψ',
      NC: 'a negated conditional ¬(φ → ψ), or a conjunction φ ∧ ¬ψ',
      NB: 'a negated biconditional ¬(φ ↔ ψ), or a biconditional with a negated side such as φ ↔ ¬ψ',
      CDJ: 'a conditional φ → ψ or a disjunction φ ∨ ψ',
      QN: 'a negated quantifier such as ¬∀xφ or ¬∃xφ, or a quantifier over a negation such as ∃x¬φ',
    };
    return {
      message: `Line ${n}: ${label} applies to ${shape[rule] ?? 'a specific form'}, but ${Ld(a)} is ${aKind(a.f)}.`,
      suggestion: 'Check the form of the line against the rule schema in the reference panel.',
      badRefs: [a.n],
      target: 'refs',
    };
  }
  let extra = '';
  if (rule === 'DM' && a.f.kind === 'not' && (a.f.operand.kind === 'and' || a.f.operand.kind === 'or')) {
    const op = a.f.operand;
    const same = op.kind === 'and' ? And(Not(op.left), Not(op.right)) : Or(Not(op.left), Not(op.right));
    if (eq(c, same)) extra = ` Careful: De Morgan flips the connective — ${op.kind === 'and' ? '∧ becomes ∨' : '∨ becomes ∧'}.`;
  }
  if (rule === 'NC' && a.f.kind === 'not' && a.f.operand.kind === 'implies') {
    const imp = a.f.operand;
    if (eq(c, Implies(Not(imp.left), Not(imp.right))) || eq(c, And(Not(imp.left), imp.right)))
      extra = ' The antecedent stays as it is; only the consequent gets negated, and the result is a conjunction.';
  }
  if (rule === 'QN' && a.f.kind === 'not' && (a.f.operand.kind === 'forall' || a.f.operand.kind === 'exists')) {
    const op = a.f.operand;
    const sameQ = op.kind === 'forall' ? Forall(op.variable, Not(op.body)) : Exists(op.variable, Not(op.body));
    if (eq(c, sameQ)) extra = ` Careful: QN flips the quantifier — ${op.kind === 'forall' ? '∀ becomes ∃' : '∃ becomes ∀'} as the ¬ moves inside.`;
  }
  if (rule === 'CDJ' && a.f.kind === 'implies' && eq(c, Or(a.f.left, Not(a.f.right))))
    extra = ' It is the antecedent that gets negated, not the consequent.';
  return {
    message: `Line ${n}: ${label} applied to ${Ld(a)} gives ${outs.map(F).join(' or ')}, but you wrote ${F(c)}.${extra}`,
    suggestion: `${rule} rewrites the whole line in one of the forms shown in its schema.`,
    target: 'formula',
  };
}

/**
 * Diagnose a failed rule application. The first mention of the rule in the
 * message always carries its full name, e.g. "MP (Modus Ponens)".
 */
export function diagnoseRule(rule: RuleId, n: number, refs: RefF[], c: Formula, ctx: DiagContext): Diagnosis {
  const d = diagnoseRaw(rule, n, refs, c, ctx);
  const label = ruleLabel(rule);
  if (!d.message.includes(label)) {
    const re = new RegExp(`\\b${rule}\\b(?! \\()`);
    d.message = re.test(d.message) ? d.message.replace(re, label) : d.message.replace(/^(Line \d+): /, `$1: ${label} — `);
  }
  if (!d.suggestion) d.suggestion = `Compare the step with the schema of ${label} in the reference panel.`;
  return d;
}

function diagnoseRaw(rule: RuleId, n: number, refs: RefF[], c: Formula, ctx: DiagContext): Diagnosis {
  switch (rule) {
    case 'MP':
      return diagMP(n, refs, c, ctx);
    case 'MT':
      return diagMT(n, refs, c, ctx);
    case 'DN':
      return diagDN(n, refs, c);
    case 'R':
      return diagR(n, refs, c);
    case 'S':
      return diagS(n, refs, c, ctx);
    case 'ADJ':
      return diagADJ(n, refs, c);
    case 'ADD':
      return diagADD(n, refs, c);
    case 'MTP':
      return diagMTP(n, refs, c, ctx);
    case 'BC':
      return diagBC(n, refs, c);
    case 'CB':
      return diagCB(n, refs, c);
    case 'SC':
      return diagSC(n, refs, c);
    case 'UI':
    case 'EI':
      return diagInstantiation(rule, n, refs, c);
    case 'EG':
      return diagEG(n, refs, c);
    case 'AV':
      return diagAV(n, refs, c);
    case 'Id':
      return diagId(n, c);
    case 'LL':
      return diagLL(n, refs, c);
    case 'SM':
      return diagSM(n, refs, c);
    default:
      return diagTransform(rule, n, refs, c);
  }
}

/** Message for a wrong number of cited lines. */
export function refCountMessage(rule: RuleId, n: number, got: number): string {
  const arity = RULE_ARITY[rule];
  if (arity.length === 1 && arity[0] === 0)
    return `Line ${n}: ${ruleLabel(rule)} cites no lines — t = t needs no justification — but you cited ${got}.`;
  const want = arity.length > 1 ? `${arity.join(' or ')}` : `exactly ${arity[0]}`;
  const noun = arity[0] === 1 && arity.length === 1 ? 'line' : 'lines';
  return `Line ${n}: ${ruleLabel(rule)} cites ${want} ${noun} (${NEEDS[rule]}), but you cited ${got}.`;
}

export { contradictory };
