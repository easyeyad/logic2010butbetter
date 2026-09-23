/**
 * Inference-rule exercises: "which rule justifies this step?" and "what
 * follows from these lines by rule X?". Includes a small, self-contained
 * matcher for the Logic 2010 sentential rules (one step, whole lines only),
 * used both to guarantee that generated 'identify' questions have exactly one
 * right answer and to check 'apply' answers.
 *
 * OWNER: Learning System.
 */
import type { Formula } from '../logic';
import { checkValidity, equals, format, parse } from '../logic';
import type { RuleId } from '../proof';
import { getRule, ruleLabel } from '../proof';
import type { Difficulty, Feedback, InferenceRuleExercise, Solution } from './types';
import { f, hash, makeRng, pick, sample, shuffle, type Rng } from './util';

export const PRIMITIVE_RULES: RuleId[] = ['MP', 'MT', 'DN', 'R', 'S', 'ADJ', 'ADD', 'MTP', 'BC', 'CB'];
export const DERIVED_RULES: RuleId[] = ['DM', 'NC', 'NB', 'CDJ', 'SC'];
export const ALL_RULES: RuleId[] = [...PRIMITIVE_RULES, ...DERIVED_RULES];

const ARITY: Record<RuleId, number> = { MP: 2, MT: 2, DN: 1, R: 1, S: 1, ADJ: 2, ADD: 1, MTP: 2, BC: 1, CB: 2, DM: 1, NC: 1, NB: 1, CDJ: 1, SC: 3 };


const eq = equals;
const isNeg = (g: Formula): g is Extract<Formula, { kind: 'not' }> => g.kind === 'not';
const N = (x: Formula): Formula => ({ kind: 'not', operand: x });
const Bn = (kind: 'and' | 'or' | 'implies' | 'iff', l: Formula, r: Formula): Formula => ({ kind, left: l, right: r });

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Two-way one-line equivalences (DM, NC, NB, CDJ): does `a` rewrite to `b` at the top level? */
function oneWay(rule: RuleId, a: Formula, b: Formula): boolean {
  switch (rule) {
    case 'DM':
      if (isNeg(a) && a.operand.kind === 'and') return eq(b, Bn('or', N(a.operand.left), N(a.operand.right)));
      if (isNeg(a) && a.operand.kind === 'or') return eq(b, Bn('and', N(a.operand.left), N(a.operand.right)));
      return false;
    case 'NC':
      return isNeg(a) && a.operand.kind === 'implies' && eq(b, Bn('and', a.operand.left, N(a.operand.right)));
    case 'NB':
      return isNeg(a) && a.operand.kind === 'iff' && eq(b, Bn('iff', a.operand.left, N(a.operand.right)));
    case 'CDJ':
      if (a.kind === 'implies') return eq(b, Bn('or', N(a.left), a.right));
      if (a.kind === 'or') return eq(b, Bn('implies', N(a.left), a.right));
      return false;
    default:
      return false;
  }
}

/** Does `rule` justify `to` from exactly the lines `cited` (any order, all used)? */
export function ruleJustifies(rule: RuleId, cited: Formula[], to: Formula): boolean {
  if (cited.length !== ARITY[rule] && !(rule === 'SC' && cited.length === 2)) return false;
  return permutations(cited).some((ls) => {
    const [a, b, c] = ls;
    switch (rule) {
      case 'MP':
        return a.kind === 'implies' && eq(a.left, b) && eq(a.right, to);
      case 'MT':
        return a.kind === 'implies' && isNeg(b) && eq(b.operand, a.right) && eq(to, N(a.left));
      case 'DN':
        return eq(to, N(N(a))) || (isNeg(a) && isNeg(a.operand) && eq(a.operand.operand, to));
      case 'R':
        return eq(a, to);
      case 'S':
        return a.kind === 'and' && (eq(a.left, to) || eq(a.right, to));
      case 'ADJ':
        return to.kind === 'and' && eq(to.left, a) && eq(to.right, b);
      case 'ADD':
        return to.kind === 'or' && (eq(to.left, a) || eq(to.right, a));
      case 'MTP':
        return a.kind === 'or' && isNeg(b) && ((eq(b.operand, a.left) && eq(to, a.right)) || (eq(b.operand, a.right) && eq(to, a.left)));
      case 'BC':
        return a.kind === 'iff' && (eq(to, Bn('implies', a.left, a.right)) || eq(to, Bn('implies', a.right, a.left)));
      case 'CB':
        return a.kind === 'implies' && b.kind === 'implies' && eq(a.left, b.right) && eq(a.right, b.left) && eq(to, Bn('iff', a.left, a.right));
      case 'DM':
      case 'NC':
      case 'NB':
      case 'CDJ':
        return oneWay(rule, a, to) || oneWay(rule, to, a);
      case 'SC':
        if (ls.length === 2) return a.kind === 'implies' && b.kind === 'implies' && eq(b.left, N(a.left)) && eq(a.right, to) && eq(b.right, to);
        return (
          a.kind === 'or' && b.kind === 'implies' && c.kind === 'implies' && eq(b.left, a.left) && eq(c.left, a.right) && eq(b.right, to) && eq(c.right, to)
        );
    }
  });
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
  }
}

const APPLY_RULES: RuleId[] = ['MP', 'MT', 'MTP', 'S', 'BC', 'CB', 'ADJ'];
const APPLY_DERIVED: RuleId[] = ['DM', 'NC', 'CDJ'];

export function generateInferenceRule(difficulty: Difficulty, seed: number, mode?: 'identify' | 'apply'): InferenceRuleExercise {
  const rng = makeRng(seed);
  const m = mode ?? (rng() < 0.55 ? 'identify' : 'apply');
  const choices = difficulty >= 4 ? ALL_RULES.filter((r) => r !== 'R') : PRIMITIVE_RULES.filter((r) => r !== 'R');
  const pool: RuleId[] = m === 'identify' ? choices : difficulty >= 4 ? [...APPLY_RULES, ...APPLY_DERIVED] : APPLY_RULES;
  let chosen: { rule: RuleId; inst: Instance } | null = null;
  for (let attempt = 0; attempt < 200 && !chosen; attempt++) {
    const rule = pick(rng, pool);
    const x = part(rng, difficulty);
    const y = part(rng, difficulty);
    const z = part(rng, difficulty);
    if (equals(x, y) || equals(y, z) || equals(x, z)) continue;
    const inst = instance(rule, x, y, z, rng);
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
  const prompt =
    m === 'identify'
      ? `Which rule justifies deriving ${conclusion} from line${lines.length > 1 ? 's' : ''} ${nums}?`
      : `What can you derive from line${lines.length > 1 ? 's' : ''} ${nums} by ${ruleLabel(rule)}?`;
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
  if (ruleJustifies(ex.rule, cited, g)) {
    return { correct: true, severity: 'success', code: 'correct', headline: `Correct — ${format(g)} follows by ${ex.rule}.`, explanation: getRule(ex.rule)?.explanation ?? '' };
  }
  const others = rulesJustifying(cited, g).filter((r) => r !== ex.rule);
  const r = getRule(ex.rule);
  const details = [`${ruleLabel(ex.rule)}: ${schemaText(ex.rule)}`, ...(r?.requirements.slice(0, 2) ?? [])];
  if (others.length) {
    return { correct: false, severity: 'error', code: 'other-rule', headline: `${format(g)} does follow — but by ${joinRules(others)}, not ${ex.rule}.`, explanation: `The question asks for ${ruleLabel(ex.rule)}. Match its pattern exactly.`, details };
  }
  if (checkValidity(cited, g).valid) {
    return { correct: false, severity: 'error', code: 'not-one-step', headline: `${format(g)} is a logical consequence, but not a single ${ex.rule} step.`, explanation: 'Rules apply to whole lines, one step at a time. Apply the pattern of the rule to the lines exactly as they are.', details };
  }
  return { correct: false, severity: 'error', code: 'does-not-follow', headline: `${format(g)} does not follow from ${ex.lines.length > 1 ? 'these lines' : 'this line'}.`, explanation: r?.pitfalls[0] ?? 'Compare with the rule’s pattern.', details };
}

const joinRules = (rs: RuleId[]) => rs.map(ruleLabel).join(' or ');

export function inferenceRuleHints(ex: InferenceRuleExercise): string[] {
  const cited = ex.lines.map(f);
  const kinds = cited.map((g) => ({ atom: 'a sentence letter', not: 'a negation', and: 'a conjunction', or: 'a disjunction', implies: 'a conditional', iff: 'a biconditional' })[g.kind]);
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
