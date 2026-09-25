/**
 * Inference-rule exercises: "which rule justifies this step?" and "what
 * follows from these lines by rule X?". Includes a small, self-contained
 * matcher for the Logic 2010 sentential rules (one step, whole lines only),
 * used both to guarantee that generated 'identify' questions have exactly one
 * right answer and to check 'apply' answers.
 *
 * OWNER: Learning System.
 */
import type { Formula, Term } from '../logic';
import { CONNECTIVE_NAME, checkValidity, equals, format, freeVariables, isPredicateFormula, namesOf, parse, variablesOf } from '../logic';
import type { RuleId } from '../proof';
import { checkRuleApplication, getRule, ruleLabel } from '../proof';
import type { Difficulty, Feedback, InferenceRuleExercise, Solution } from './types';
import { f, hash, makeRng, pick, sample, shuffle, type Rng } from './util';

export const PRIMITIVE_RULES: RuleId[] = ['MP', 'MT', 'DN', 'R', 'S', 'ADJ', 'ADD', 'MTP', 'BC', 'CB'];
export const DERIVED_RULES: RuleId[] = ['DM', 'NC', 'NB', 'CDJ', 'SC'];
/** Primitive quantifier rules (drilled from level 3). */
export const QUANTIFIER_RULES: RuleId[] = ['UI', 'EG', 'EI'];
/** Derived quantifier rules (drilled at level 5). */
export const DERIVED_QUANTIFIER_RULES: RuleId[] = ['QN', 'AV'];
/** Identity rules, drilled from level 4 — only those the proof engine knows about. */
export const IDENTITY_RULES: RuleId[] = (['LL', 'SM'] as string[]).filter((r) => getRule(r)) as RuleId[];
export const ALL_RULES: RuleId[] = [...PRIMITIVE_RULES, ...QUANTIFIER_RULES, ...IDENTITY_RULES, ...DERIVED_RULES, ...DERIVED_QUANTIFIER_RULES];

const ARITY: Record<string, number> = { MP: 2, MT: 2, DN: 1, R: 1, S: 1, ADJ: 2, ADD: 1, MTP: 2, BC: 1, CB: 2, DM: 1, NC: 1, NB: 1, CDJ: 1, SC: 3, UI: 1, EG: 1, EI: 1, QN: 1, AV: 1, Id: 0, LL: 2, SM: 1 };

/** Rules offered (and drilled) at a difficulty. */
export function rulesForDifficulty(difficulty: Difficulty): RuleId[] {
  const out: RuleId[] = PRIMITIVE_RULES.filter((r) => r !== 'R');
  if (difficulty >= 3) out.push(...QUANTIFIER_RULES);
  if (difficulty >= 4) out.push(...DERIVED_RULES, ...IDENTITY_RULES);
  if (difficulty >= 5) out.push(...DERIVED_QUANTIFIER_RULES);
  return out;
}

const N = (x: Formula): Formula => ({ kind: 'not', operand: x });
const Bn = (kind: 'and' | 'or' | 'implies' | 'iff', l: Formula, r: Formula): Formula => ({ kind, left: l, right: r });

/**
 * Does `rule` justify `to` from exactly the lines `cited` (any order, all used)?
 * Delegates to the proof engine's single rule checker (derived rules allowed).
 */
export function ruleJustifies(rule: RuleId, cited: Formula[], to: Formula): boolean {
  return checkRuleApplication(rule, cited, to, { allowDerivedRules: true, alternativesWhenValid: false }).ok;
}

/** Every rule (from `pool`) that justifies the step. */
export function rulesJustifying(cited: Formula[], to: Formula, pool: RuleId[] = ALL_RULES): RuleId[] {
  return pool.filter((r) => ruleJustifies(r, cited, to));
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

const LETTERS = ['P', 'Q', 'R', 'S'];

function part(rng: Rng, difficulty: Difficulty): Formula {
  const atom = (): Formula => ({ kind: 'atom', name: pick(rng, LETTERS) });
  const r = rng();
  if (difficulty <= 1) return atom();
  if (difficulty === 2) return r < 0.7 ? atom() : N(atom());
  if (r < 0.4) return atom();
  if (r < 0.6) return N(atom());
  const [a, b] = sample(rng, LETTERS, 2).map((name): Formula => ({ kind: 'atom', name }));
  return Bn(pick(rng, ['and', 'or', 'implies', 'iff'] as const), a, difficulty >= 5 && rng() < 0.4 ? N(b) : b);
}

type Instance = { cited: Formula[]; to: Formula };

function instance(rule: RuleId, x: Formula, y: Formula, z: Formula, rng: Rng): Instance {
  const coin = rng() < 0.5;
  switch (rule) {
    case 'MP': return { cited: [Bn('implies', x, y), x], to: y };
    case 'MT': return { cited: [Bn('implies', x, y), N(y)], to: N(x) };
    case 'DN': return coin ? { cited: [x], to: N(N(x)) } : { cited: [N(N(x))], to: x };
    case 'R': return { cited: [x], to: x };
    case 'S': return { cited: [Bn('and', x, y)], to: coin ? x : y };
    case 'ADJ': return { cited: [x, y], to: Bn('and', x, y) };
    case 'ADD': return { cited: [x], to: coin ? Bn('or', x, y) : Bn('or', y, x) };
    case 'MTP': return coin ? { cited: [Bn('or', x, y), N(x)], to: y } : { cited: [Bn('or', x, y), N(y)], to: x };
    case 'BC': return { cited: [Bn('iff', x, y)], to: coin ? Bn('implies', x, y) : Bn('implies', y, x) };
    case 'CB': return { cited: [Bn('implies', x, y), Bn('implies', y, x)], to: Bn('iff', x, y) };
    case 'DM': return coin ? { cited: [N(Bn('and', x, y))], to: Bn('or', N(x), N(y)) } : { cited: [Bn('and', N(x), N(y))], to: N(Bn('or', x, y)) };
    case 'NC': return coin ? { cited: [N(Bn('implies', x, y))], to: Bn('and', x, N(y)) } : { cited: [Bn('and', x, N(y))], to: N(Bn('implies', x, y)) };
    case 'NB': return { cited: [N(Bn('iff', x, y))], to: Bn('iff', x, N(y)) };
    case 'CDJ': return coin ? { cited: [Bn('implies', x, y)], to: Bn('or', N(x), y) } : { cited: [Bn('or', x, y)], to: Bn('implies', N(x), y) };
    case 'SC': return { cited: [Bn('or', x, y), Bn('implies', x, z), Bn('implies', y, z)], to: z };
    default: return { cited: [Bn('implies', x, y), x], to: y }; // quantifier rules are not generated here
  }
}

// ---------------------------------------------------------------------------
// Quantifier and identity instances
// ---------------------------------------------------------------------------

const Tm = (name: string): Term => (/^[u-z]/.test(name) ? { kind: 'var', name } : { kind: 'name', name });
const Pr = (p: string, ...ts: Term[]): Formula => ({ kind: 'pred', name: p, args: ts });
const Qf = (kind: 'forall' | 'exists', v: string, body: Formula): Formula => ({ kind, variable: v, body });

/** Bodies φ(t) for quantifier drills, harder with difficulty. */
function bodies(difficulty: Difficulty): ((t: Term) => Formula)[] {
  const a = Tm('a');
  const base: ((t: Term) => Formula)[] = [(t) => Pr('F', t), (t) => Bn('implies', Pr('F', t), Pr('G', t)), (t) => Bn('and', Pr('F', t), Pr('G', t)), (t) => N(Pr('F', t))];
  if (difficulty >= 4) base.push((t) => Pr('R', t, a), (t) => Bn('or', Pr('F', t), Pr('H', t)), (t) => Bn('implies', Pr('F', t), Pr('R', a, t)));
  return base;
}

function quantInstance(rule: RuleId, rng: Rng, difficulty: Difficulty): Instance | null {
  const body = pick(rng, bodies(difficulty));
  const v = pick(rng, ['x', 'y']);
  const X = Tm(v);
  switch (rule) {
    case 'UI': {
      const t = Tm(pick(rng, ['a', 'b', 'z', v]));
      return { cited: [Qf('forall', v, body(X))], to: body(t) };
    }
    case 'EG': {
      const t = Tm(pick(rng, ['a', 'b']));
      return { cited: [body(t)], to: Qf('exists', v, body(X)) };
    }
    case 'EI': {
      const w = pick(rng, ['z', 'u', 'w'].filter((x) => x !== v));
      return { cited: [Qf('exists', v, body(X))], to: body(Tm(w)) };
    }
    case 'QN': {
      const q = rng() < 0.5 ? 'forall' : 'exists';
      const dual = q === 'forall' ? 'exists' : 'forall';
      return { cited: [N(Qf(q, v, body(X)))], to: Qf(dual, v, N(body(X))) };
    }
    case 'AV': {
      const w = v === 'x' ? 'y' : 'x';
      const q = rng() < 0.5 ? 'forall' : 'exists';
      return { cited: [Qf(q, v, body(X))], to: Qf(q, w, body(Tm(w))) };
    }
    case 'LL': {
      const [s, t] = shuffle(rng, ['a', 'b', 'c']).slice(0, 2).map(Tm);
      const b2 = pick(rng, bodies(Math.min(difficulty, 3) as Difficulty));
      return { cited: [b2(s), { kind: 'identity', left: s, right: t }], to: b2(t) };
    }
    case 'SM': {
      const [s, t] = shuffle(rng, ['a', 'b', 'c']).slice(0, 2).map(Tm);
      return { cited: [{ kind: 'identity', left: s, right: t }], to: { kind: 'identity', left: t, right: s } };
    }
    default:
      return null;
  }
}

const isQuantOrIdentityRule = (r: RuleId) => [...QUANTIFIER_RULES, ...DERIVED_QUANTIFIER_RULES, ...IDENTITY_RULES].includes(r);

const APPLY_RULES: RuleId[] = ['MP', 'MT', 'MTP', 'S', 'BC', 'CB', 'ADJ'];
const APPLY_DERIVED: RuleId[] = ['DM', 'NC', 'CDJ'];

export function generateInferenceRule(difficulty: Difficulty, seed: number, mode?: 'identify' | 'apply'): InferenceRuleExercise {
  const rng = makeRng(seed);
  const m = mode ?? (rng() < 0.55 ? 'identify' : 'apply');
  const choices = rulesForDifficulty(difficulty);
  const sentPool: RuleId[] = m === 'identify' ? choices.filter((r) => !isQuantOrIdentityRule(r)) : difficulty >= 4 ? [...APPLY_RULES, ...APPLY_DERIVED] : APPLY_RULES;
  const quantPool: RuleId[] = choices.filter((r) => isQuantOrIdentityRule(r) && (m === 'identify' || r !== 'AV'));
  // From level 3, about 40% of questions drill the quantifier (and, from 4, identity) rules.
  const useQuant = quantPool.length > 0 && rng() < 0.4;
  let chosen: { rule: RuleId; inst: Instance } | null = null;
  for (let attempt = 0; attempt < 200 && !chosen; attempt++) {
    const rule = pick(rng, useQuant ? quantPool : sentPool);
    let inst: Instance | null;
    if (useQuant) inst = quantInstance(rule, rng, difficulty);
    else {
      const x = part(rng, difficulty);
      const y = part(rng, difficulty);
      const z = part(rng, difficulty);
      if (equals(x, y) || equals(y, z) || equals(x, z)) continue;
      inst = instance(rule, x, y, z, rng);
    }
    if (!inst) continue;
    // Reject degenerate steps: the conclusion repeats a cited line, or two cited lines are the same.
    if (inst.cited.some((c) => equals(c, inst!.to))) continue;
    if (inst.cited.some((c, i) => inst!.cited.some((d, j) => j > i && equals(c, d)))) continue;
    if (m === 'identify') {
      const all = rulesJustifying(inst.cited, inst.to);
      if (all.length !== 1 || all[0] !== rule) continue;
    } else {
      // the rule must actually apply, and the lines should not also invite a different rule to the same result
      if (!ruleJustifies(rule, inst.cited, inst.to)) continue;
    }
    chosen = { rule, inst };
  }
  if (!chosen) {
    const P: Formula = { kind: 'atom', name: 'P' };
    const Q: Formula = { kind: 'atom', name: 'Q' };
    chosen = { rule: 'MP', inst: { cited: [Bn('implies', P, Q), P], to: Q } };
  }
  const { rule, inst } = chosen;
  const lines = shuffle(rng, inst.cited).map((g) => format(g));
  const conclusion = format(inst.to);
  const nums = lines.map((_, i) => i + 1).join(lines.length > 1 ? ', ' : '');
  const eiNote = ' (Assume any variable that does not appear in the cited lines is new to the derivation.)';
  const prompt =
    m === 'identify'
      ? `Which rule justifies deriving ${conclusion} from line${lines.length > 1 ? 's' : ''} ${nums}?${useQuant ? eiNote : ''}`
      : `What can you derive from line${lines.length > 1 ? 's' : ''} ${nums} by ${ruleLabel(rule)}?${rule === 'EI' ? ' Instantiate to a new variable.' : rule === 'UI' ? ' Instantiate to any term.' : ''}`;
  return {
    id: `rule-gen-${m}-${hash(`${lines.join(';')}|${conclusion}|${rule}`)}`,
    kind: 'inference-rule',
    topic: 'inference-rule',
    difficulty,
    title: m === 'identify' ? 'Name that rule' : `Apply ${rule}`,
    prompt,
    tags: m === 'apply' ? [m, rule] : [m],
    source: 'generated',
    mode: m,
    lines,
    conclusion,
    rule,
    choices,
  };
}

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

function schemaText(id: RuleId): string {
  const r = getRule(id);
  return r ? `${r.schema.from.join(',  ')}  ⊢  ${r.schema.to}` : id;
}

export function checkInferenceRule(ex: InferenceRuleExercise, answer: { rule?: RuleId; formula?: string }): Feedback {
  const cited = ex.lines.map(f);
  if (ex.mode === 'identify') {
    const said = answer.rule;
    if (!said) return { correct: false, severity: 'error', code: 'empty', headline: 'Pick a rule.', explanation: 'Compare the shape of the cited lines and the new line with each rule’s pattern.' };
    const target = f(ex.conclusion);
    if (said === ex.rule || ruleJustifies(said, cited, target)) {
      const r = getRule(said);
      return { correct: true, severity: 'success', code: 'correct', headline: `Correct — ${ruleLabel(said)}.`, explanation: r?.explanation ?? '', details: [`Pattern: ${schemaText(said)}`] };
    }
    const r = getRule(said);
    const details = [`${ruleLabel(said)} has the pattern ${schemaText(said)}.`];
    if (ARITY[said] !== cited.length) details.push(`${said} cites ${ARITY[said]} line${ARITY[said] > 1 ? 's' : ''}, but this step cites ${cited.length}.`);
    if (r?.pitfalls[0]) details.push(r.pitfalls[0]);
    return {
      correct: false,
      severity: 'error',
      code: 'wrong-rule',
      headline: `${said} does not produce ${ex.conclusion} from ${ex.lines.length > 1 ? 'these lines' : 'this line'}.`,
      explanation: 'Look at the main connective of each cited line and of the new line, and find the rule whose pattern matches all of them exactly.',
      details,
    };
  }
  // apply
  const text = answer.formula ?? '';
  if (!text.trim()) return { correct: false, severity: 'error', code: 'empty', headline: 'Type the line you would derive.', explanation: `${ruleLabel(ex.rule)}: ${schemaText(ex.rule)}` };
  const p = parse(text);
  if (!p.ok) {
    return { correct: false, severity: 'error', code: 'parse-error', headline: "That isn't a well-formed formula.", explanation: p.error.message, details: p.error.hint ? [p.error.hint] : undefined, highlight: [{ target: 'answer', start: p.error.span.start, end: p.error.span.end, tone: 'error' }] };
  }
  const g = p.formula;
  if (ex.rule === 'EI' && ruleJustifies('EI', cited, g)) {
    const old = new Set(variablesOf(...cited));
    const newNames = namesOf(g).filter((n) => !namesOf(...cited).includes(n));
    if (newNames.length) {
      return { correct: false, severity: 'error', code: 'ei-name', headline: `EI may not instantiate to the name ${newNames[0]}.`, explanation: 'You do not know WHICH object the existential is about, so EI must use a variable that is new to the derivation — never a name.' };
    }
    const reused = freeVariables(g).filter((v) => old.has(v));
    if (reused.length) {
      return { correct: false, severity: 'error', code: 'ei-not-new', headline: `EI needs a NEW variable, but ${reused[0]} already occurs in the cited line.`, explanation: 'EI instantiates to a variable that does not occur anywhere earlier in the derivation; otherwise you would be assuming the unknown object is one you already know about.' };
    }
  }
  if (ruleJustifies(ex.rule, cited, g)) {
    return { correct: true, severity: 'success', code: 'correct', headline: `Correct — ${format(g)} follows by ${ex.rule}.`, explanation: getRule(ex.rule)?.explanation ?? '' };
  }
  const others = rulesJustifying(cited, g).filter((r) => r !== ex.rule);
  const r = getRule(ex.rule);
  const details = [`${ruleLabel(ex.rule)}: ${schemaText(ex.rule)}`, ...(r?.requirements.slice(0, 2) ?? [])];
  if (others.length) {
    return { correct: false, severity: 'error', code: 'other-rule', headline: `${format(g)} does follow — but by ${joinRules(others)}, not ${ex.rule}.`, explanation: `The question asks for ${ruleLabel(ex.rule)}. Match its pattern exactly.`, details };
  }
  if (!isPredicateFormula(g) && checkValidity(cited, g).valid) {
    return { correct: false, severity: 'error', code: 'not-one-step', headline: `${format(g)} is a logical consequence, but not a single ${ex.rule} step.`, explanation: 'Rules apply to whole lines, one step at a time. Apply the pattern of the rule to the lines exactly as they are.', details };
  }
  return { correct: false, severity: 'error', code: 'does-not-follow', headline: `${format(g)} does not follow from ${ex.lines.length > 1 ? 'these lines' : 'this line'}.`, explanation: r?.pitfalls[0] ?? 'Compare with the rule’s pattern.', details };
}

const joinRules = (rs: RuleId[]) => rs.map(ruleLabel).join(' or ');

export function inferenceRuleHints(ex: InferenceRuleExercise): string[] {
  const cited = ex.lines.map(f);
  const kinds = cited.map((g) => `${/^[aeiou]/.test(CONNECTIVE_NAME[g.kind]) ? 'an' : 'a'} ${CONNECTIVE_NAME[g.kind]}`);
  const hints = [`The cited line${cited.length > 1 ? 's are' : ' is'} ${kinds.join(' and ')}. Which rules take ${cited.length > 1 ? 'lines of those shapes' : 'a line of that shape'}?`];
  if (ex.mode === 'identify') {
    hints.push(`The rule cites exactly ${cited.length} line${cited.length > 1 ? 's' : ''}.`);
    hints.push(`Look at how ${ex.conclusion} relates to the cited lines: is it a part of one of them, a combination of them, or a negated part?`);
  } else {
    const r = getRule(ex.rule);
    hints.push(`${ruleLabel(ex.rule)} has the pattern ${schemaText(ex.rule)}.`);
    if (r) hints.push(`Example: from ${r.example.from.join(' and ')} you get ${r.example.to}.`);
  }
  return hints;
}

export function inferenceRuleSolution(ex: InferenceRuleExercise): Solution {
  return ex.mode === 'identify'
    ? { answer: ex.rule, summary: `${ruleLabel(ex.rule)}: ${schemaText(ex.rule)}.`, steps: [getRule(ex.rule)?.explanation ?? ''] }
    : { answer: ex.conclusion, summary: `By ${ruleLabel(ex.rule)} you may write ${ex.conclusion}.`, steps: [schemaText(ex.rule)] };
}
