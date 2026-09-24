import type { Formula } from '../logic/ast';
import type { CloseMethod, DerivationDraft, DraftLine } from './types';
import { accessProblem, analyze, udViolation, type Analysis } from './checker';
import { Prover, prune } from './prover';
import { ruleLabel } from './rules';
import { consistent, contradictory, entails, equals as eq, fmt, lineList, predicateCountermodel } from './util';
import { isPredicateFormula } from '../logic/ast';

/** A concrete suggested line (level 3), or a close instruction. */
export interface HintLine {
  text: string;
  /** Rule id for steps ('MP'...), 'ASS CD' / 'ASS ID' for assumptions, 'DD'/'CD'/'ID' for closes. */
  rule?: string;
  refs?: number[];
  /** Additive: what kind of action this is. 'close' = close the Show line `closeLine` with `rule`. */
  kind?: 'show' | 'assumption' | 'step' | 'close';
  /** Additive: depth the new line goes at. */
  depth?: number;
  /** Additive: for kind 'close', the 1-based Show line to close. */
  closeLine?: number;
}

export interface Hint {
  message: string;
  line?: HintLine;
}

/** Drop trailing just-inserted empty lines (the hint's new line goes there). */
function trimTrailingEmpty(draft: DerivationDraft): DerivationDraft {
  const lines = Array.isArray(draft.lines) ? draft.lines : [];
  let end = lines.length;
  while (end > 0 && (typeof lines[end - 1]?.text !== 'string' || lines[end - 1].text.replace(/^\s*show\b/i, '').trim() === '')) end--;
  return end === lines.length ? draft : { ...draft, lines: lines.slice(0, end) };
}

/** Innermost open Show line whose box contains the end of the derivation (index), or -1. */
function targetShow(an: Analysis): number {
  const n = an.lines.length;
  if (n === 0) return -1;
  const last = n - 1;
  if (an.lines[last].kind === 'show' && !an.closed[last]) return last;
  for (let s = an.parent[last]; s !== -1; s = an.parent[s]) if (!an.closed[s]) return s;
  return -1;
}

function ancestors(an: Analysis, t: number): Set<number> {
  const set = new Set<number>();
  for (let s = t; s !== -1; s = an.parent[s]) set.add(s);
  return set;
}

/** Lines usable by a new line appended inside the box of Show t. */
function accessibleFor(an: Analysis, t: number): { n: number; f: Formula }[] {
  const anc = ancestors(an, t);
  const out: { n: number; f: Formula }[] = [];
  for (let r = 0; r < an.lines.length; r++) {
    const f = an.formulas[r];
    if (!f) continue;
    if (accessProblem(an, r, (s) => anc.has(s), '')) continue;
    out.push({ n: r + 1, f });
  }
  return out;
}

function directChildren(an: Analysis, t: number): number[] {
  const out: number[] = [];
  for (let k = t + 1; k <= an.boxEnd[t]; k++) if (an.parent[k] === t) out.push(k);
  return out;
}

function closeFor(an: Analysis, t: number): { method: CloseMethod; refs: number[] } | null {
  const G = an.formulas[t];
  if (!G || an.boxEnd[t] === t) return null;
  for (let k = t + 1; k <= an.boxEnd[t]; k++) if (an.lines[k].kind === 'show' && !an.closed[k]) return null;
  const kids = directChildren(an, t).filter((k) => an.formulas[k] && !(an.lines[k].kind === 'show' && !an.closed[k]));
  const first = t + 1;
  const asm = an.lines[first]?.kind === 'assumption' ? an.asmKind[first] : undefined;
  if (asm === 'CD' && G.kind === 'implies') {
    const k = kids.find((k) => eq(an.formulas[k]!, G.right));
    if (k !== undefined) return { method: 'CD', refs: [k + 1] };
  }
  if (asm === 'ID') {
    for (const a of kids)
      for (const b of kids) if (a < b && contradictory(an.formulas[a]!, an.formulas[b]!)) return { method: 'ID', refs: [a + 1, b + 1] };
  }
  if (!asm && G.kind === 'forall') {
    const k = kids.find((k) => eq(an.formulas[k]!, G.body));
    const inBox = (s: number, i: number) => s < i && i <= an.boxEnd[s];
    if (k !== undefined && udViolation(an, t, inBox) === null) return { method: 'UD', refs: [k + 1] };
  }
  const k = kids.find((k) => eq(an.formulas[k]!, G));
  if (k !== undefined) return { method: 'DD', refs: [k + 1] };
  return null;
}

/** If the innermost open show can be closed now, which method and refs. */
export function suggestClose(draft: DerivationDraft): { showLine: number; method: CloseMethod; refs: number[] } | null {
  try {
    const an = analyze(trimTrailingEmpty(draft));
    const t = targetShow(an);
    if (t === -1) return null;
    const c = closeFor(an, t);
    return c ? { showLine: t + 1, ...c } : null;
  } catch {
    return null;
  }
}

const RULE_NUDGE: Record<string, string> = {
  MP: 'Look for a conditional whose antecedent you already have.',
  MT: 'Look for a conditional whose consequent is contradicted by another line.',
  S: 'One of your available lines is a conjunction — you can break it apart.',
  DN: 'A double negation can be added or removed.',
  ADJ: 'Two lines you already have can be combined into something you need.',
  ADD: 'You can build a disjunction from a line you already have.',
  MTP: 'You have a disjunction and the negation of one of its sides.',
  BC: 'A biconditional can give you a conditional to work with.',
  CB: 'You have both directions of a biconditional.',
  R: 'Something you need is outside the current box — bring it inside with R so you can cite it when closing.',
  UI: 'A universal line can be instantiated to a term you are working with.',
  EI: 'An existential line can be instantiated — to a variable that is new to the derivation.',
  EG: 'You have an instance of what you need — generalize it with ∃.',
  QN: 'A negated quantifier can be pushed inside (the quantifier flips).',
  AV: 'Rename a bound variable to match what you need.',
};

/** Hard time budget for computing one hint. */
const HINT_TIME_MS = 300;

/** Continue the student's derivation with the prover; return the new lines (pruned) or null. */
/**
 * Prefer the shorter of the strict and lenient continuations — unless the
 * lenient one starts by re-opening an enclosing open Show (which would make a
 * hint-follower regress forever).
 */
function continueProof(an: Analysis, t: number): { lines: DraftLine[]; origN: number } | null {
  const deadline = Date.now() + HINT_TIME_MS;
  return continueBudget(an, t, 2500, deadline) ?? continueBudget(an, t, 12000, deadline);
}

function continueBudget(an: Analysis, t: number, budget: number, deadline: number): { lines: DraftLine[]; origN: number } | null {
  const strict = continueWith(an, t, true, budget, deadline);
  const lenient = continueWith(an, t, false, budget, deadline);
  if (!lenient) return strict;
  const first = lenient.lines[lenient.origN];
  const open = new Set<string>();
  for (let s = t; s !== -1; s = an.parent[s]) if (an.formulas[s] && !an.closed[s]) open.add(fmt(an.formulas[s]!));
  const regress = first && first.kind === 'show' && open.has(first.text);
  if (regress) return strict ?? lenient;
  if (!strict) return lenient;
  return lenient.lines.length < strict.lines.length ? lenient : strict;
}

function continueWith(an: Analysis, t: number, strict: boolean, budget: number, deadline: number): { lines: DraftLine[]; origN: number } | null {
  const G = an.formulas[t]!;
  const n = an.lines.length;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return null;
  const p = new Prover({ maxLines: budget, strictNesting: strict, timeBudgetMs: remaining });
  p.out = an.lines.map((l) => ({ ...l, refs: l.refs ? [...l.refs] : undefined, close: l.close ? { ...l.close, refs: [...l.close.refs] } : undefined }));
  p.outF = [...an.formulas];
  for (const a of accessibleFor(an, t)) p.addAvail(a.f, a.n);
  p.depth = an.lines[t].depth + 1;
  const stack: string[] = [];
  for (let s = t; s !== -1; s = an.parent[s]) if (an.formulas[s] && !an.closed[s]) stack.unshift(fmt(an.formulas[s]!));
  p.openStack.push(...stack);
  for (let s = t; s !== -1; s = an.parent[s]) if (an.formulas[s] && !an.closed[s]) p.goalStack.unshift(an.formulas[s]!);
  const show = t + 1;
  const first = t + 1 < n && an.parent[t + 1] === t ? t + 1 : -1;
  const asm = first !== -1 && an.lines[first].kind === 'assumption' ? an.asmKind[first] : undefined;
  let result: { method: CloseMethod; refs: number[] } | null = null;
  try {
    if (asm === 'CD' && G.kind === 'implies') {
      const r = p.bodyCD(G, show, first + 1);
      if (r) result = { method: 'CD', refs: r };
    } else if (asm === 'ID') {
      const r = p.bodyID(G, show, first + 1);
      if (r) result = { method: 'ID', refs: r };
    } else if (first === -1) {
      for (const s of p.strategies(G)) {
        const snap = p.snapshot();
        const r = s.body(show);
        if (r) {
          result = { method: s.method, refs: r };
          break;
        }
        p.restore(snap);
      }
    } else if (G.kind === 'forall' && !asm) {
      const snap = p.snapshot();
      const ud = p.bodyUD(G, show);
      if (ud) result = { method: 'UD', refs: ud };
      else {
        p.restore(snap);
        const dd = p.bodyDD(G, show, true);
        if (dd) result = { method: 'DD', refs: dd };
      }
    } else {
      const r = p.bodyDD(G, show, true);
      if (r) result = { method: 'DD', refs: r };
    }
  } catch {
    return null;
  }
  if (!result) return null;
  p.out[t] = { ...p.out[t], close: result };
  const pr = prune(p.out, [t], n);
  return { lines: pr.lines, origN: n };
}

function goalStrategy(G: Formula, t: number, method: CloseMethod | undefined): string {
  const L = `line ${t + 1}`;
  switch (G.kind) {
    case 'implies':
      return method === 'CD' || method === undefined
        ? `Your goal on ${L} is a conditional — try Conditional Derivation (CD).`
        : `Your goal on ${L} is a conditional, but here it is easier to get directly — work forward from what you have.`;
    case 'and':
      return `Your goal on ${L} is a conjunction — get each conjunct separately, then combine them with ADJ.`;
    case 'iff':
      return `Your goal on ${L} is a biconditional — prove the two conditionals (each by CD), then combine them with CB.`;
    case 'or':
      return method === 'ID'
        ? `Your goal on ${L} is a disjunction. Unless one disjunct is easy to get (then ADD), disjunctions are usually proved by Indirect Derivation (ID).`
        : `Your goal on ${L} is a disjunction — can you get one of the disjuncts and use ADD?`;
    case 'not':
      return method === 'ID'
        ? `Your goal on ${L} is a negation — Indirect Derivation (ID) is the natural approach: assume what's negated and look for a contradiction.`
        : `Your goal on ${L} may follow directly from what you have — work forward with the rules.`;
    case 'forall':
      return method === 'UD'
        ? `Your goal on ${L} is a universal — try Universal Derivation (UD): derive ${fmt(G.body)} for an arbitrary ${G.variable} inside the box (no assumption), then close with UD.`
        : method === 'ID'
          ? `Your goal on ${L} is a universal, but ${G.variable} isn't arbitrary here — try Indirect Derivation (ID).`
          : `Your goal on ${L} may follow directly from what you have — work forward with the rules.`;
    case 'exists':
      return method === 'ID'
        ? `Your goal on ${L} is an existential. If no instance is easy to get, try Indirect Derivation (ID): assume ${fmt({ kind: 'not', operand: G })} and look for a contradiction.`
        : `Your goal on ${L} is an existential — derive one instance of ${fmt(G.body)} and use EG.`;
    case 'atom':
    case 'pred':
      return method === 'ID'
        ? `Nothing gives ${fmt(G)} on ${L} directly — try Indirect Derivation (ID): assume the opposite and aim for a contradiction.`
        : `Your goal on ${L} may follow directly from what you have — work forward with the rules (DD).`;
  }
}

/**
 * A graded hint for the next move, NOT a full solution. level 1 = strategic
 * nudge ("Your goal is a conditional — try Conditional Derivation"), level 2 =
 * more specific ("Assume P as ASS CD and aim for Q"), level 3 = the concrete
 * next line. Returns null if nothing sensible to suggest.
 */
export function suggestNextStep(draft: DerivationDraft, level: 1 | 2 | 3): Hint | null {
  try {
    return nextStep(draft, level);
  } catch {
    return null;
  }
}

function nextStep(draft: DerivationDraft, level: 1 | 2 | 3): Hint | null {
  const an = analyze(trimTrailingEmpty(draft));
  const check = an.check;
  const bad = check.lines.find((l) => !l.ok);
  if (bad) {
    const issue = bad.issues.find((i) => i.severity === 'error')!;
    if (level === 1) return { message: `Line ${bad.number} has a problem — fix it before moving on.` };
    if (level === 2) return { message: issue.message };
    return { message: issue.suggestion ? `${issue.message} ${issue.suggestion}` : issue.message };
  }
  if (check.complete) return null;
  const t = targetShow(an);
  if (t === -1) {
    if (!an.goal) return null;
    const g = fmt(an.goal);
    const msgs = [
      'Start by writing your goal on a Show line.',
      `Write "Show ${g}" at the outermost level, then work inside its box.`,
      `Next line: Show ${g}.`,
    ];
    return { message: msgs[level - 1], line: level === 3 ? { text: g, kind: 'show', depth: 0 } : undefined };
  }
  const G = an.formulas[t]!;
  const T = t + 1;
  const close = closeFor(an, t);
  if (close) {
    const refs = close.refs;
    const msgs = [
      `Look at line ${T} — you may already be able to close it.`,
      `Close line ${T} with ${ruleLabel(close.method)}.`,
      `Close line ${T} with ${close.method}, citing ${lineList(refs)}.`,
    ];
    return {
      message: msgs[level - 1],
      line: level === 3 ? { text: fmt(G), rule: close.method, refs, kind: 'close', closeLine: T } : undefined,
    };
  }
  const boxEmpty = an.boxEnd[t] === t;
  const first = boxEmpty ? -1 : t + 1;
  const asm = first !== -1 && an.lines[first].kind === 'assumption' ? an.asmKind[first] : undefined;
  const cont = continueProof(an, t);
  if (!cont) {
    // Explain why, if the Show line simply doesn't follow.
    const avail = accessibleFor(an, t).map((a) => a.f);
    const target: Formula = asm === 'CD' && G.kind === 'implies' ? G.right : G;
    const ok = asm === 'ID' ? (consistent(avail) === null ? null : !consistent(avail)) : entails(avail, target);
    if (ok === null && asm !== 'ID') {
      const model = predicateCountermodel(avail, target);
      if (model)
        return {
          message: `${fmt(target)} does not follow from the lines available at line ${T} — here is a countermodel: ${model.join('; ')}. Double-check that line ${T}'s Show formula is what you need.`,
        };
    }
    if (ok === null && isPredicateFormula(G))
      return { message: `No automatic hint is available for this step. ${goalStrategy(G, t, undefined)}` };
    if (ok === false)
      return {
        message:
          asm === 'ID'
            ? `The lines available inside line ${T}'s box are consistent, so no contradiction can be derived from them. Check that the Show formula on line ${T} really follows.`
            : `${fmt(target)} does not follow from the lines available at line ${T} — double-check that line ${T}'s Show formula is what you need.`,
      };
    return { message: goalStrategy(G, t, undefined) };
  }
  const newLine = cont.lines[cont.origN];
  const closeLine = cont.lines[t];
  if (!newLine) {
    const c = closeLine.close!;
    return { message: `Close line ${T} with ${ruleLabel(c.method)}.`, line: level === 3 ? { text: fmt(G), rule: c.method, refs: c.refs, kind: 'close', closeLine: T } : undefined };
  }
  const method = closeLine.close?.method;
  const nf = newLine.text;
  let l1: string;
  let l2: string;
  const inIDBox = asm === 'ID' || (boxEmpty && method === 'ID');
  const aim = asm === 'CD' && G.kind === 'implies' ? ` You're aiming for ${fmt(G.right)}.` : inIDBox ? ' You are looking for a contradiction: some formula together with its negation.' : '';
  if (boxEmpty) {
    l1 = goalStrategy(G, t, method);
    if (newLine.kind === 'assumption') {
      l2 =
        newLine.assumption === 'CD' && G.kind === 'implies'
          ? `Assume ${nf} (ASS CD) and aim to derive ${fmt(G.right)}.`
          : `Assume ${nf} (ASS ID) and look for a contradiction.`;
    } else if (newLine.kind === 'show') {
      l2 = `Set up a subgoal first: Show ${nf}.`;
    } else {
      l2 = `Try ${ruleLabel(newLine.rule!)} with ${lineList(newLine.refs ?? [])}.`;
    }
  } else if (newLine.kind === 'show') {
    l1 = inIDBox
      ? `You need a contradiction. Pick a formula whose negation you have (or could get), and try to prove it as a subgoal.`
      : `Set yourself an intermediate goal with a new Show line.${aim}`;
    l2 = `Try proving ${nf} in its own Show box.`;
  } else {
    l1 = `${RULE_NUDGE[newLine.rule ?? ''] ?? 'Work forward from the lines you have.'}${aim}`;
    l2 = `Try ${ruleLabel(newLine.rule!)} with ${lineList(newLine.refs ?? [])}.`;
  }
  const just =
    newLine.kind === 'assumption'
      ? `ASS ${newLine.assumption}`
      : newLine.kind === 'show'
        ? ''
        : `${newLine.rule} ${(newLine.refs ?? []).join(',')}`;
  const l3 = newLine.kind === 'show' ? `Next line: Show ${nf}.` : `Next line: ${nf}   ${just}.`;
  const line: HintLine = {
    text: nf,
    kind: newLine.kind === 'premise' ? 'step' : newLine.kind,
    depth: newLine.depth,
    ...(newLine.kind === 'step' ? { rule: newLine.rule, refs: newLine.refs } : {}),
    ...(newLine.kind === 'assumption' ? { rule: `ASS ${newLine.assumption}` } : {}),
  };
  const msgs = [l1, l2, l3];
  return { message: msgs[level - 1], line: level === 3 ? line : undefined };
}
