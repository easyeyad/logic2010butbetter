/**
 * Rule matching and rule-specific diagnosis for step lines.
 *
 * `ruleApplies` decides validity (any ref order). `diagnoseRule` explains in
 * student-facing language why a rule does NOT apply, naming the lines, the
 * rule and the likely confusion.
 *
 * OWNER: Proof Engine.
 */
import type { Formula } from '../logic/ast';
import { And, Iff, Implies, Not, Or } from '../logic/ast';
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
};

/** What the cited lines must be, for "cites exactly N lines (...)". */
const NEEDS: Record<RuleId, string> = {
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

const ONE_PREMISE_TRANSFORM = new Set<RuleId>(['R', 'DN', 'S', 'BC', 'DM', 'NC', 'NB', 'CDJ']);

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
        suggestion: `Write ${F(Not(X))} here.`,
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
      message: `Line ${n}: ${capitalize(Ld(o))} is the antecedent of ${Ld(cond)} itself, not the negation of its consequent — that is a job for MP, not MT.`,
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

function diagTransform(rule: RuleId, n: number, [a]: RefF[], c: Formula): Diagnosis {
  const outs = transforms(rule, a.f);
  const label = ruleLabel(rule);
  if (outs.length === 0) {
    const shape: Record<string, string> = {
      DM: 'a negated conjunction or disjunction such as ¬(φ ∧ ψ), or a disjunction/conjunction of negations such as ¬φ ∨ ¬ψ',
      NC: 'a negated conditional ¬(φ → ψ), or a conjunction φ ∧ ¬ψ',
      NB: 'a negated biconditional ¬(φ ↔ ψ), or a biconditional with a negated side such as φ ↔ ¬ψ',
      CDJ: 'a conditional φ → ψ or a disjunction φ ∨ ψ',
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
  if (rule === 'CDJ' && a.f.kind === 'implies' && eq(c, Or(a.f.left, Not(a.f.right))))
    extra = ' It is the antecedent that gets negated, not the consequent.';
  return {
    message: `Line ${n}: ${label} applied to ${Ld(a)} gives ${outs.map(F).join(' or ')}, but you wrote ${F(c)}.${extra}`,
    suggestion: `${rule} rewrites the whole line in one of the forms shown in its schema.`,
    target: 'formula',
  };
}

export function diagnoseRule(rule: RuleId, n: number, refs: RefF[], c: Formula, ctx: DiagContext): Diagnosis {
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
    default:
      return diagTransform(rule, n, refs, c);
  }
}

/** Message for a wrong number of cited lines. */
export function refCountMessage(rule: RuleId, n: number, got: number): string {
  const arity = RULE_ARITY[rule];
  const want = arity.length > 1 ? `${arity.join(' or ')}` : `exactly ${arity[0]}`;
  const noun = arity[0] === 1 && arity.length === 1 ? 'line' : 'lines';
  return `Line ${n}: ${ruleLabel(rule)} cites ${want} ${noun} (${NEEDS[rule]}), but you cited ${got}.`;
}

export { contradictory };
