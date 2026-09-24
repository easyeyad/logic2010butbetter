/**
 * Public single-step rule checker: does `rule` justify `conclusion` from the
 * `cited` formulas? Shared by the derivation checker and the learning system
 * (rule-identification exercises), so there is exactly one rule checker.
 *
 * OWNER: Proof Engine.
 */
import type { Formula } from '../logic/ast';
import type { LineIssue, RuleId } from './types';
import { DERIVED_RULE_IDS, isRuleId, ruleLabel } from './rules';
import { RULE_ARITY, alternativeRules, diagnoseRule, instanceTerm, refCountMessage, ruleApplies, type RefF } from './inference';
import { lineList } from './util';

export interface RuleCheckOptions {
  /** Allow DM, NC, NB, CDJ, SC. Default false. */
  allowDerivedRules?: boolean;
  /** Line number used in messages for the conclusion (default: cited.length + 1). */
  lineNumber?: number;
  /** Line numbers used in messages for the cited formulas (default: 1, 2, ...). */
  citedLineNumbers?: number[];
  /** Optional lookup of an earlier accessible line containing a formula (sharper suggestions). */
  find?: (f: Formula) => number | undefined;
  /**
   * For EI's new-variable restriction: the number of an earlier line on which
   * variable v occurs (free or bound), or undefined. Without it, the
   * restriction is not checked (single-step use).
   */
  variableOccursOn?: (v: string) => number | undefined;
  /** For EI feedback: a variable that is new to the derivation, to suggest. */
  freshVariableHint?: string;
  /** Also list alternative rules when the step is valid (default true; the derivation checker turns it off for speed). */
  alternativesWhenValid?: boolean;
}

export interface RuleCheckResult {
  ok: boolean;
  /** Issue code when not ok: 'unknown-rule' | 'rule-not-allowed' | 'missing-refs' | 'ref-count' | 'rule-mismatch' | 'ei-variable-not-new'. */
  code?: string;
  /** Student-facing explanation naming the line(s), the rule and why it fails. */
  message?: string;
  suggestion?: string;
  /** Where the problem is, for highlighting. */
  target?: LineIssue['target'];
  /** Offending cited line numbers, if any. */
  badRefs?: number[];
  /** Other allowed rules that WOULD justify this conclusion from exactly these cited formulas. */
  alternativeRules: RuleId[];
}

function subsets<T>(xs: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i < xs.length; i++) {
      acc.push(xs[i]);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

/**
 * Check one rule application. Messages refer to the cited formulas as
 * "line 1", "line 2", ... (or `citedLineNumbers`) and to the conclusion as
 * "Line k" (or `lineNumber`). Never throws.
 */
export function checkRuleApplication(
  rule: RuleId | string,
  cited: Formula[],
  conclusion: Formula,
  opts: RuleCheckOptions = {},
): RuleCheckResult {
  const allowDerived = !!opts.allowDerivedRules;
  const nums = cited.map((_, i) => opts.citedLineNumbers?.[i] ?? i + 1);
  const num = opts.lineNumber ?? Math.max(cited.length, ...nums, 0) + 1;
  if (!isRuleId(rule)) {
    return {
      ok: false,
      code: 'unknown-rule',
      message: `Line ${num}: "${rule}" is not a rule of this system.`,
      suggestion: 'Pick one of MP, MT, DN, R, S, ADJ, ADD, MTP, BC, CB, UI, EG, EI (or a derived rule, if enabled).',
      target: 'rule',
      alternativeRules: [],
    };
  }
  const refs: RefF[] = cited.map((f, i) => ({ n: nums[i], f }));
  const applies = ruleApplies(rule, cited, conclusion);
  const alts =
    applies && opts.alternativesWhenValid === false ? [] : alternativeRules(rule, cited, conclusion, allowDerived);
  if (DERIVED_RULE_IDS.includes(rule) && !allowDerived) {
    return {
      ok: false,
      code: 'rule-not-allowed',
      message: `Line ${num} uses ${ruleLabel(rule)}, a derived rule, but derived rules are turned off for this exercise.`,
      suggestion: alts.length
        ? `This step is valid by ${ruleLabel(alts[0])}, which is allowed.`
        : 'Use the primitive rules instead (an ID or CD subproof usually does the job), or enable derived rules in settings.',
      target: 'rule',
      alternativeRules: alts,
    };
  }
  if (applies && rule === 'EI' && opts.variableOccursOn && cited[0].kind === 'exists') {
    const t = instanceTerm(cited[0], conclusion);
    if (t && t !== 'vacuous' && t.kind === 'var') {
      const on = opts.variableOccursOn(t.name);
      if (on !== undefined) {
        return {
          ok: false,
          code: 'ei-variable-not-new',
          message: `Line ${num}: EI (Existential Instantiation) must use a variable that is new to the derivation, but ${t.name} already occurs on line ${on}.`,
          suggestion: `Instantiate to a variable that appears nowhere above${opts.freshVariableHint ? `, e.g. ${opts.freshVariableHint}` : ''}. (Otherwise you would be assuming the "something" is the same thing line ${on} talks about.)`,
          target: 'formula',
          alternativeRules: alts,
        };
      }
    }
  }
  if (applies) return { ok: true, alternativeRules: alts };
  if (cited.length === 0) {
    const k = RULE_ARITY[rule][0];
    return {
      ok: false,
      code: 'missing-refs',
      message: `Line ${num}: ${ruleLabel(rule)} needs to cite ${k} line${k === 1 ? '' : 's'}, but no lines are cited.`,
      suggestion: `Cite the line${k === 1 ? '' : 's'} ${rule} works on (see the rule's schema in the reference panel).`,
      target: 'refs',
      alternativeRules: alts,
    };
  }
  if (!RULE_ARITY[rule].includes(cited.length)) {
    let suggestion: string | undefined;
    const max = Math.max(...RULE_ARITY[rule]);
    if (cited.length > max) {
      const subset = subsets(refs, max).find((sub) => ruleApplies(rule, sub.map((r) => r.f), conclusion));
      if (subset) suggestion = `Cite only ${lineList(subset.map((r) => r.n))}.`;
    }
    if (alts.length) suggestion = `This step is valid by ${ruleLabel(alts[0])}, not ${rule}.`;
    let message = refCountMessage(rule, num, cited.length);
    if (rule === 'ADD' && conclusion.kind === 'and') message += ' Note: ADD builds a disjunction (∨), never a conjunction.';
    if (rule === 'S' && cited.length === 2 && conclusion.kind === 'and')
      message += ' S takes a conjunction apart; to put two lines together use ADJ.';
    return {
      ok: false,
      code: 'ref-count',
      message,
      suggestion:
        suggestion ??
        (cited.length < Math.min(...RULE_ARITY[rule])
          ? 'Add the missing line to the citations, or pick the rule that matches the lines you cited.'
          : 'Remove the lines this step does not use.'),
      target: 'refs',
      alternativeRules: alts,
    };
  }
  const diag = diagnoseRule(rule, num, refs, conclusion, { allowDerived, find: opts.find ?? (() => undefined) });
  let suggestion = diag.suggestion;
  if (alts.length) suggestion = `This step is valid by ${ruleLabel(alts[0])}, not ${rule}.`;
  else if (!allowDerived) {
    const derivedAlt = alternativeRules(rule, cited, conclusion, true).find((r) => DERIVED_RULE_IDS.includes(r));
    if (derivedAlt && suggestion) suggestion += ` (With derived rules enabled, ${ruleLabel(derivedAlt)} would justify it.)`;
  }
  return {
    ok: false,
    code: 'rule-mismatch',
    message: diag.message,
    suggestion,
    target: diag.target ?? 'formula',
    badRefs: diag.badRefs,
    alternativeRules: alts,
  };
}
