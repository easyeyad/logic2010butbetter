import type { Formula } from '../logic/ast';
import { Not } from '../logic/ast';
import { parse } from '../logic/index';
import type {
  CloseMethod,
  DerivationCheck,
  DerivationDraft,
  DraftLine,
  LineCheck,
  LineIssue,
  RuleId,
} from './types';
import { DERIVED_RULE_IDS, isRuleId, ruleLabel } from './rules';
import { NEEDS, RULE_ARITY, type RefF } from './inference';
import { checkRuleApplication } from './ruleCheck';
import { aKind, capitalize, contradictory, equals as eq, fmt, lineList } from './util';

/**
 * Derivation checker — Logic 2010 (Kalish–Montague) semantics.
 *
 * Structure (0-based indices internally, 1-based numbers in messages):
 *  - The box of a Show line s is every following line with depth > depth(s),
 *    up to (not including) the first line with depth ≤ depth(s).
 *  - Depth may increase only by exactly 1, and only right after a Show line.
 *  - Leaving a box (a line at depth ≤ the Show's depth) requires that Show to
 *    be closed.
 *  - Premises: depth 0, before every other line.
 *  - Assumptions: only as the first line of a Show's box; ASS CD = antecedent
 *    of the Show conditional; ASS ID = ¬φ, or ψ when the Show formula is ¬ψ.
 *  - A Show line with `close` set is treated as closed for structure and
 *    accessibility (even if the close itself is faulty — the fault is reported
 *    on the Show line), so later lines don't get cascading errors.
 *
 * Accessibility of line r from citing line c (r < c):
 *  - an open Show line is never citable; a Show line is never citable from
 *    inside its own box;
 *  - r must not sit inside any box that c is outside of: if that box's Show
 *    is closed → 'ref-boxed', else → 'ref-exited-box'.
 *
 * Closing Show s: cited lines must be DIRECT members of s's box (not inside a
 * nested box) — i.e. accessible from the end of the box.
 */

// ----------------------------------------------------------------- analysis

export interface Analysis {
  lines: DraftLine[];
  /** Parsed formula for each line (undefined on parse error). */
  formulas: (Formula | undefined)[];
  /** Index of the enclosing Show line, or -1. */
  parent: number[];
  /** For Show lines: index of the last line in its box (== s when empty). */
  boxEnd: number[];
  /** Show line has `close` set. */
  closed: boolean[];
  /** Effective assumption kind for assumption lines. */
  asmKind: ('CD' | 'ID' | undefined)[];
  goal?: Formula;
  check: DerivationCheck;
}

interface AccessProblem {
  code: string;
  message: string;
  suggestion?: string;
}

const SHOW_PREFIX = /^\s*show\b[\s:]*/i;

function safeParse(text: string): ReturnType<typeof parse> {
  try {
    return parse(text);
  } catch {
    return {
      ok: false,
      normalized: text,
      error: { code: 'empty', message: 'The formula parser is unavailable.', span: { start: 0, end: text.length } },
    };
  }
}

/**
 * Is line r (index) usable by a line whose enclosing boxes are exactly the
 * Show lines s for which `inside(s)` is true? `who` is "Line 7" etc.
 */
export function accessProblem(an: Pick<Analysis, 'lines' | 'formulas' | 'parent' | 'closed'>, r: number, inside: (s: number) => boolean, who: string): AccessProblem | null {
  const line = an.lines[r];
  const f = an.formulas[r];
  const num = r + 1;
  if (line.kind === 'show') {
    if (inside(r)) {
      return {
        code: an.closed[r] ? 'ref-own-show' : 'ref-open-show',
        message: an.closed[r]
          ? `${who} cites line ${num}, the Show line whose box it is in. Inside its own box a Show formula can't be used — it is what the box is proving.`
          : `Line ${num} is a Show line that hasn't been closed yet, so it can't be used — its formula is what you're trying to prove.`,
        suggestion: f
          ? `Derive ${fmt(f)} on a line inside the box, then close line ${num}.`
          : `Derive the Show formula inside the box, then close line ${num}.`,
      };
    }
    if (!an.closed[r]) {
      return {
        code: 'ref-open-show',
        message: `Line ${num} is a Show line that hasn't been closed yet, so it can't be used — its formula has not been proved.`,
        suggestion: `Close line ${num} first; after that its formula becomes available.`,
      };
    }
  }
  let blocker = -1;
  for (let s = an.parent[r]; s !== -1; s = an.parent[s]) if (!inside(s)) blocker = s;
  if (blocker === -1) return null;
  const sf = an.formulas[blocker];
  const showDesc = `line ${blocker + 1}${sf ? ` (Show ${fmt(sf)})` : ''}`;
  if (an.closed[blocker]) {
    return {
      code: 'ref-boxed',
      message: `${who} cites line ${num}, but line ${num} is inside the box of ${showDesc}, which has been closed. Once a box is closed, the lines inside it can't be used any more — only its Show line can.`,
      suggestion: `Cite line ${blocker + 1} instead if its formula helps, or derive what you need again outside that box.`,
    };
  }
  return {
    code: 'ref-exited-box',
    message: `${who} cites line ${num}, which is inside the box of ${showDesc} — and ${who.toLowerCase()} is not in that box. Lines in a box can only be used inside that box.`,
    suggestion: `Work inside the box of line ${blocker + 1} (and close it) instead.`,
  };
}

function err(code: string, message: string, extra: Partial<LineIssue> = {}): LineIssue {
  return { severity: 'error', code, message, ...extra };
}

export function analyze(draft: DerivationDraft): Analysis {
  const lines = Array.isArray(draft.lines) ? draft.lines : [];
  const n = lines.length;
  const allowDerived = !!draft.allowDerivedRules;
  const issues: LineIssue[][] = lines.map(() => []);
  const formulas: (Formula | undefined)[] = new Array(n);
  const depth: number[] = new Array(n);

  // ---- parse + depth sanitize
  for (let i = 0; i < n; i++) {
    const line = lines[i];
    let d = line.depth;
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 0) {
      issues[i].push(err('depth-invalid', `Line ${i + 1} has an invalid indentation level.`, { target: 'structure', suggestion: 'Re-indent the line: 0 for the outermost level, one more for each open box.' }));
      d = 0;
    }
    depth[i] = d;
    let text = typeof line.text === 'string' ? line.text : '';
    let offset = 0;
    if (line.kind === 'show') {
      const m = SHOW_PREFIX.exec(text);
      if (m && m[0].length < text.length) {
        offset = m[0].length;
        text = text.slice(offset);
      }
    }
    if (text.trim() === '') {
      issues[i].push(
        err('empty-formula', `Line ${i + 1} has no formula yet.`, {
          target: 'formula',
          suggestion: line.kind === 'show' ? 'Type the formula you want to show.' : 'Type the formula for this line.',
        }),
      );
      continue;
    }
    const res = safeParse(text);
    if (res.ok) formulas[i] = res.formula;
    else
      issues[i].push(
        err('parse-error', `Line ${i + 1}: ${res.error.message}`, {
          target: 'formula',
          suggestion: res.error.hint ?? 'Check the highlighted part of the formula — every connective needs its formulas, and nested binary parts need parentheses.',
          span: { start: res.error.span.start + offset, end: res.error.span.end + offset },
        }),
      );
  }

  // ---- structure: parents, box ends
  const parent: number[] = new Array(n).fill(-1);
  const boxEnd: number[] = new Array(n).fill(-1);
  const closed: boolean[] = lines.map((l) => l.kind === 'show' && !!l.close);
  const stack: number[] = [];
  const closeBox = (s: number, end: number) => {
    boxEnd[s] = end;
  };
  let seenNonPremise = false;
  for (let i = 0; i < n; i++) {
    const line = lines[i];
    const d = depth[i];
    const exited: number[] = [];
    while (stack.length && depth[stack[stack.length - 1]] >= d) {
      const s = stack.pop()!;
      closeBox(s, i - 1);
      exited.push(s);
    }
    parent[i] = stack.length ? stack[stack.length - 1] : -1;
    // depth checks
    if (i === 0) {
      if (d !== 0)
        issues[i].push(err('depth-jump', 'Line 1 must be at the outermost level (not indented).', { target: 'structure', suggestion: 'Remove the indentation from line 1.' }));
    } else {
      const pd = depth[i - 1];
      if (d > pd) {
        if (lines[i - 1].kind !== 'show')
          issues[i].push(
            err('depth-jump', `Line ${i + 1} is indented deeper than line ${i}, but a new box can only start right after a Show line.`, {
              target: 'structure',
              suggestion: `Move line ${i + 1} back to the level of line ${i}, or put a Show line before it.`,
            }),
          );
        else if (d !== pd + 1)
          issues[i].push(
            err('depth-jump', `Line ${i + 1} is indented ${d - pd} levels below the Show line on line ${i}; a box goes exactly one level deeper.`, {
              target: 'structure',
              suggestion: `Indent line ${i + 1} exactly one level deeper than line ${i}.`,
            }),
          );
      }
    }
    const openExited = exited.filter((s) => !closed[s]);
    if (openExited.length) {
      const s = openExited[openExited.length - 1]; // outermost
      const sf = formulas[s];
      issues[i].push(
        err(
          'box-exited-open',
          `Line ${i + 1} is outside the box of line ${s + 1}${sf ? ` (Show ${fmt(sf)})` : ''}, but that Show line hasn't been closed yet. A box can only be left once its Show line is closed.`,
          {
            target: 'structure',
            suggestion: `Finish the box of line ${s + 1} and close it first — or indent line ${i + 1} into that box.`,
          },
        ),
      );
    }
    // premises
    if (line.kind === 'premise') {
      if (seenNonPremise)
        issues[i].push(
          err('premise-misplaced', `Line ${i + 1} is a premise, but premises must all come first, before any other line.`, {
            target: 'structure',
            suggestion: 'Move the premise to the top of the derivation.',
          }),
        );
      if (d !== 0)
        issues[i].push(err('premise-depth', `Line ${i + 1}: premises belong at the outermost level, not inside a box.`, { target: 'structure', suggestion: 'Move the premise to the top of the derivation, unindented.' }));
    } else seenNonPremise = true;
    if (line.kind === 'show') stack.push(i);
  }
  while (stack.length) closeBox(stack.pop()!, n - 1);

  const inBox = (s: number, i: number) => s < i && i <= boxEnd[s];
  const firstChild = (s: number) => (boxEnd[s] > s ? s + 1 : -1);

  // ---- assumptions
  const asmKind: ('CD' | 'ID' | undefined)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const line = lines[i];
    if (line.kind !== 'assumption') continue;
    const p = i > 0 && lines[i - 1].kind === 'show' && depth[i] === depth[i - 1] + 1 ? i - 1 : -1;
    const f = formulas[i];
    if (p === -1) {
      asmKind[i] = line.assumption;
      issues[i].push(
        err('assumption-misplaced', `Line ${i + 1}: an assumption is only allowed as the first line inside a Show box, right after the Show line.`, {
          target: 'structure',
          suggestion: 'Start a new Show line and make the assumption the first line of its box — or justify this line with a rule.',
        }),
      );
      continue;
    }
    const g = formulas[p];
    let kind = line.assumption;
    if (!kind && f && g) {
      if (g.kind === 'implies' && eq(f, g.left)) kind = 'CD';
      else kind = 'ID';
    }
    asmKind[i] = kind ?? 'ID';
    if (!f || !g) continue;
    const show = `line ${p + 1} (Show ${fmt(g)})`;
    if (asmKind[i] === 'CD') {
      if (g.kind !== 'implies') {
        issues[i].push(
          err('assumption-cd-not-conditional', `Line ${i + 1}: ASS CD can only be used when the Show formula is a conditional, but ${show} is ${aKind(g)}.`, {
            target: 'formula',
            suggestion:
              g.kind === 'iff'
                ? 'For a biconditional, show the two conditionals separately (each by CD) and combine them with CB.'
                : g.kind === 'and'
                  ? 'For a conjunction, show each conjunct separately and combine them with ADJ.'
                  : 'For this goal, try ID: assume the opposite of the Show formula (ASS ID).',
          }),
        );
      } else if (!eq(f, g.left)) {
        issues[i].push(
          err(
            'assumption-wrong-formula',
            eq(f, g.right)
              ? `Line ${i + 1}: for CD you assume the antecedent and derive the consequent. You assumed the consequent ${fmt(g.right)} of ${show}.`
              : `Line ${i + 1}: for CD you assume exactly the antecedent of ${show}, which is ${fmt(g.left)} — you wrote ${fmt(f)}.`,
            { target: 'formula', suggestion: `Assume ${fmt(g.left)} (ASS CD), then aim for ${fmt(g.right)}.` },
          ),
        );
      }
    } else {
      const okID = eq(f, Not(g)) || (g.kind === 'not' && eq(f, g.operand));
      if (!okID) {
        const allowed = g.kind === 'not' ? `${fmt(g.operand)} (or ${fmt(Not(g))})` : fmt(Not(g));
        issues[i].push(
          err(
            'assumption-wrong-formula',
            eq(f, g)
              ? `Line ${i + 1}: for ID you assume the OPPOSITE of what you're showing, not the Show formula itself. For ${show} assume ${allowed}.`
              : `Line ${i + 1}: for ID you assume the opposite of what you're showing. For ${show} that is ${allowed} — you wrote ${fmt(f)}.`,
            {
              target: 'formula',
              suggestion:
                g.kind === 'implies' && eq(f, g.left)
                  ? 'That looks like a CD assumption — mark it ASS CD instead.'
                  : `Assume ${allowed} (ASS ID) and look for a contradiction.`,
            },
          ),
        );
      }
    }
  }

  // ---- steps
  const findAccessible = (c: number, target: Formula): number | undefined => {
    const inside = (s: number) => inBox(s, c);
    for (let r = c - 1; r >= 0; r--) {
      const f = formulas[r];
      if (f && eq(f, target) && !accessProblem(an0, r, inside, '')) return r + 1;
    }
    return undefined;
  };
  const an0 = { lines, formulas, parent, closed };

  const resolveRefs = (i: number, refs: unknown, who: string): { ok: RefF[] } => {
    const out: RefF[] = [];
    const list = Array.isArray(refs) ? refs : [];
    for (const raw of list) {
      const num = typeof raw === 'number' ? raw : Number(raw);
      const r = num - 1;
      if (!Number.isInteger(num) || r < 0 || r >= n) {
        issues[i].push(err('ref-out-of-range', `${who} cites line ${raw}, but there is no line ${raw}.`, { target: 'refs', badRefs: [num], suggestion: 'Check the line numbers you cited — they must be lines above this one.' }));
        continue;
      }
      if (r === i) {
        issues[i].push(err('ref-self', `${who} cites itself. A line can only use lines above it.`, { target: 'refs', badRefs: [num], suggestion: 'Cite the earlier lines the rule actually works on.' }));
        continue;
      }
      if (r > i) {
        issues[i].push(
          err('ref-later', `${who} cites line ${num}, which comes later. A line can only use lines above it.`, {
            target: 'refs',
            badRefs: [num],
            suggestion: `Derive line ${num}'s formula before this line, or cite an earlier line.`,
          }),
        );
        continue;
      }
      const prob = accessProblem(an0, r, (s) => inBox(s, i), who);
      if (prob) {
        issues[i].push(err(prob.code, prob.message, { target: 'refs', badRefs: [num], suggestion: prob.suggestion }));
      }
      const f = formulas[r];
      if (!f) {
        issues[i].push(
          err('ref-unparsed', `${who} cites line ${num}, whose formula can't be read yet.`, {
            target: 'refs',
            badRefs: [num],
            suggestion: `Fix the formula on line ${num} first.`,
          }),
        );
        continue;
      }
      out.push({ n: num, f });
    }
    return { ok: out };
  };

  const citedCount = (refs: unknown) => (Array.isArray(refs) ? refs.length : 0);

  for (let i = 0; i < n; i++) {
    const line = lines[i];
    if (line.kind !== 'step') continue;
    const num = i + 1;
    const who = `Line ${num}`;
    const rule = line.rule as string | undefined;
    if (!rule) {
      issues[i].push(
        err('missing-rule', `Line ${num} needs a justification: which rule gives this line?`, {
          target: 'rule',
          suggestion: 'Pick a rule and cite the lines it uses.',
        }),
      );
      continue;
    }
    if (!isRuleId(rule)) {
      issues[i].push(err('unknown-rule', `Line ${num}: "${rule}" is not a rule of this system.`, { target: 'rule', suggestion: 'Pick one of MP, MT, DN, R, S, ADJ, ADD, MTP, BC, CB (or a derived rule, if enabled).' }));
      continue;
    }
    const f = formulas[i];
    const got = citedCount(line.refs);
    if (got === 0) {
      issues[i].push(
        err('missing-refs', `Line ${num}: ${ruleLabel(rule)} needs to cite ${RULE_ARITY[rule][0]} line${RULE_ARITY[rule][0] === 1 ? '' : 's'} — which lines does it use?`, {
          target: 'refs',
          suggestion: `Add the line number${RULE_ARITY[rule][0] === 1 ? '' : 's'} of the ${RULE_ARITY[rule][0] === 1 ? 'line' : 'lines'} ${rule} works on (${NEEDS[rule]}).`,
        }),
      );
      continue;
    }
    const { ok: refs } = resolveRefs(i, line.refs, who);
    if (!f || refs.length !== got) {
      if (DERIVED_RULE_IDS.includes(rule) && !allowDerived)
        issues[i].push(err('rule-not-allowed', `Line ${num} uses ${ruleLabel(rule)}, a derived rule, but derived rules are turned off for this exercise.`, {
          target: 'rule',
          suggestion: 'Use the primitive rules instead (an ID or CD subproof usually does the job), or enable derived rules in settings.',
        }));
      continue;
    }
    const res = checkRuleApplication(
      rule,
      refs.map((r) => r.f),
      f,
      { allowDerivedRules: allowDerived, lineNumber: num, citedLineNumbers: refs.map((r) => r.n), find: (t) => findAccessible(i, t), alternativesWhenValid: false },
    );
    if (!res.ok)
      issues[i].push(err(res.code!, res.message!, { target: res.target, badRefs: res.badRefs, suggestion: res.suggestion }));
  }

  // ---- closes
  for (let s = 0; s < n; s++) {
    const line = lines[s];
    if (line.kind !== 'show') {
      if (line.close)
        issues[s].push(err('close-not-show', `Line ${s + 1} is not a Show line, so there is no box to close.`, { target: 'close', suggestion: 'Only Show lines are closed (with DD, CD or ID).' }));
      continue;
    }
    if (!line.close) continue;
    const g = formulas[s];
    const num = s + 1;
    const method = line.close.method as string;
    const crefs = Array.isArray(line.close.refs) ? line.close.refs : [];
    const push = (code: string, message: string, extra: Partial<LineIssue> = {}) =>
      issues[s].push(err(code, message, { target: 'close', ...extra }));
    if (method !== 'DD' && method !== 'CD' && method !== 'ID') {
      push('close-unknown-method', `Line ${num}: "${method}" is not a way to close a box.`, { suggestion: 'Use DD (Direct Derivation), CD (Conditional Derivation) or ID (Indirect Derivation).' });
      continue;
    }
    const mLabel = ruleLabel(method);
    if (boxEnd[s] === s) {
      push('close-empty-box', `Line ${num} can't be closed with ${mLabel}: its box is empty.`, { suggestion: 'Work inside the box first — the lines right after the Show line, one level deeper.' });
      continue;
    }
    let openInner = -1;
    for (let k = s + 1; k <= boxEnd[s]; k++) if (lines[k].kind === 'show' && !closed[k]) { openInner = k; break; }
    if (openInner !== -1) {
      const kf = formulas[openInner];
      push(
        'close-open-inner',
        `Line ${num} can't be closed yet: line ${openInner + 1}${kf ? ` (Show ${fmt(kf)})` : ''} inside its box is still open.`,
        { suggestion: `Close (or delete) line ${openInner + 1} first — boxes close from the inside out.` },
      );
      continue;
    }
    if (!g) continue;
    if (crefs.length === 0) {
      push('close-missing-refs', `Line ${num}: to close with ${mLabel}, you need to cite the line${method === 'ID' ? 's' : ''} inside the box that ${method === 'ID' ? 'contradict each other' : method === 'CD' ? 'is the consequent' : 'is the Show formula'}.`, {
        suggestion: method === 'ID' ? 'Add the two line numbers of χ and ¬χ.' : 'Add the line number of that line.',
      });
      continue;
    }
    // Resolve refs: must be direct members of the box.
    const good: RefF[] = [];
    let refsBad = false;
    for (const raw of crefs) {
      const rn = typeof raw === 'number' ? raw : Number(raw);
      const r = rn - 1;
      if (!Number.isInteger(rn) || r < 0 || r >= n) {
        push('close-ref-outside-box', `Line ${num}: ${mLabel} cites line ${raw}, but there is no line ${raw}.`, { badRefs: [rn] });
        refsBad = true;
        continue;
      }
      if (!inBox(s, r)) {
        push(
          'close-ref-outside-box',
          r === s
            ? `Line ${num}: you can't cite the Show line itself to close it.`
            : `Line ${num}: ${mLabel} cites line ${rn}, which is outside the box of line ${num}. The lines you cite to close a box must be inside it.`,
          { badRefs: [rn], suggestion: r < s ? `Use R (Repetition) to copy line ${rn} into the box, then cite the copy.` : `Cite a line between line ${num} and the end of its box.` },
        );
        refsBad = true;
        continue;
      }
      if (parent[r] !== s) {
        let inner = parent[r];
        while (parent[inner] !== s) inner = parent[inner];
        push(
          'close-ref-inaccessible',
          `Line ${num}: line ${rn} is inside the smaller box of line ${inner + 1}, so it isn't available for closing line ${num}.`,
          { badRefs: [rn], suggestion: `Cite line ${inner + 1} (once closed) or a line directly in line ${num}'s box.` },
        );
        refsBad = true;
        continue;
      }
      const f = formulas[r];
      if (!f) {
        push('ref-unparsed', `Line ${num}: ${mLabel} cites line ${rn}, whose formula can't be read yet.`, { badRefs: [rn], suggestion: `Fix the formula on line ${rn} first.` });
        refsBad = true;
        continue;
      }
      good.push({ n: rn, f });
    }
    if (refsBad) continue;
    const fc = firstChild(s);
    const firstAsm = fc !== -1 && lines[fc].kind === 'assumption' ? asmKind[fc] : undefined;
    const directWith = (t: Formula) => {
      for (let k = s + 1; k <= boxEnd[s]; k++) {
        const kf = formulas[k];
        if (parent[k] === s && kf && eq(kf, t) && !(lines[k].kind === 'show' && !closed[k])) return k + 1;
      }
      return undefined;
    };
    const showG = `Show ${fmt(g)}`;
    if (method === 'DD') {
      if (!good.some((r) => eq(r.f, g))) {
        const r0 = good[0];
        const has = directWith(g);
        push(
          'close-mismatch',
          `Line ${num}: DD (Direct Derivation) closes ${showG} by citing a line in the box that is exactly ${fmt(g)}, but line ${r0.n} is ${fmt(r0.f)}.`,
          {
            badRefs: good.map((r) => r.n),
            suggestion:
              has !== undefined
                ? `Line ${has} is ${fmt(g)} — cite that line.`
                : g.kind === 'implies' && firstAsm === 'CD' && eq(r0.f, g.right)
                  ? `Line ${r0.n} is the consequent — close with CD instead of DD.`
                  : `Keep deriving inside the box until you reach ${fmt(g)}.`,
          },
        );
      }
    } else if (method === 'CD') {
      if (g.kind !== 'implies') {
        push('close-cd-not-conditional', `Line ${num}: CD (Conditional Derivation) only closes a Show line whose formula is a conditional, but ${showG} is ${aKind(g)}.`, {
          suggestion: firstAsm === 'ID' ? 'Your box starts with ASS ID — close it with ID.' : 'Use DD or ID for this Show line.',
        });
      } else if (firstAsm !== 'CD') {
        push(
          firstAsm === 'ID' ? 'close-wrong-assumption' : 'close-missing-assumption',
          firstAsm === 'ID'
            ? `Line ${num}: the box starts with an ASS ID assumption, so it can't be closed with CD.`
            : `Line ${num}: CD requires the first line of the box to be the antecedent ${fmt(g.left)}, marked ASS CD.`,
          {
            suggestion:
              firstAsm === 'ID'
                ? 'Close it with ID by citing two contradictory lines in the box.'
                : good.some((r) => eq(r.f, g))
                  ? `You derived ${fmt(g)} itself — close with DD.`
                  : `Start the box with ${fmt(g.left)} (ASS CD).`,
          },
        );
      } else if (!good.some((r) => eq(r.f, g.right))) {
        const r0 = good.find((r) => r.n !== fc + 1) ?? good[0];
        const has = directWith(g.right);
        push(
          'close-mismatch',
          eq(r0.f, g)
            ? `Line ${num}: CD closes ${showG} by citing the consequent ${fmt(g.right)}; line ${r0.n} is the whole conditional — close with DD instead.`
            : `Line ${num}: CD closes ${showG} by citing a line in the box that is the consequent ${fmt(g.right)}, but line ${r0.n} is ${fmt(r0.f)}.`,
          {
            badRefs: [r0.n],
            suggestion:
              has !== undefined ? `Line ${has} is ${fmt(g.right)} — cite that line.` : `Keep going until you derive ${fmt(g.right)} inside the box.`,
          },
        );
      }
    } else {
      if (firstAsm !== 'ID') {
        const want = g.kind === 'not' ? `${fmt(g.operand)} (or ${fmt(Not(g))})` : fmt(Not(g));
        push(
          firstAsm === 'CD' ? 'close-wrong-assumption' : 'close-missing-assumption',
          firstAsm === 'CD'
            ? `Line ${num}: the box starts with an ASS CD assumption, so it closes with CD, not ID.`
            : `Line ${num}: ID requires the first line of the box to be the opposite of the Show formula, ${want}, marked ASS ID.`,
          {
            suggestion: firstAsm === 'CD' ? `Close with CD by citing ${g.kind === 'implies' ? fmt(g.right) : 'the consequent'}.` : `Start the box with ${want} (ASS ID).`,
          },
        );
      } else {
        let found = false;
        for (let a = 0; a < good.length && !found; a++)
          for (let b = a + 1; b < good.length && !found; b++) if (contradictory(good[a].f, good[b].f)) found = true;
        if (!found) {
          let message: string;
          if (good.length < 2) {
            message = `Line ${num}: ID needs two lines inside the box that contradict each other — some formula χ and its negation ¬χ. You cited only line ${good[0].n}.`;
          } else {
            const [x, y] = good;
            const sameMeaning =
              (x.f.kind === 'not' && x.f.operand.kind === 'not' && eq(x.f.operand.operand, y.f)) ||
              (y.f.kind === 'not' && y.f.operand.kind === 'not' && eq(y.f.operand.operand, x.f));
            message = sameMeaning
              ? `Line ${num}: line ${x.n} (${fmt(x.f)}) and line ${y.n} (${fmt(y.f)}) don't contradict each other — a double negation says the same thing as the original. ID needs a formula and exactly its negation (one ¬ more).`
              : `Line ${num}: line ${x.n} (${fmt(x.f)}) and line ${y.n} (${fmt(y.f)}) are not a formula and its negation, so they don't give the contradiction ID needs.`;
          }
          push('close-no-contradiction', message, {
            badRefs: good.map((r) => r.n),
            suggestion: 'Find some χ such that both χ and ¬χ are on lines directly in the box (use R to bring outside lines in).',
          });
        }
      }
    }
  }

  // ---- premises vs. given
  if (Array.isArray(draft.premises)) {
    const given = draft.premises.map((t) => safeParse(t)).filter((r) => r.ok).map((r) => (r as { formula: Formula }).formula);
    for (let i = 0; i < n; i++) {
      const f = formulas[i];
      if (lines[i].kind === 'premise' && f && !given.some((g) => eq(g, f)))
        issues[i].push(
          err('premise-not-given', `Line ${i + 1}: ${fmt(f)} is not one of the premises of this argument.`, {
            target: 'formula',
            suggestion: 'Only the given premises may be written as PR. Everything else has to be derived.',
          }),
        );
    }
  }

  // ---- dependencies
  const deps: (number[] | undefined)[] = new Array(n);
  const visiting = new Uint8Array(n);
  const depsOf = (i: number): number[] => {
    const cached = deps[i];
    if (cached) return cached;
    if (visiting[i]) return [];
    visiting[i] = 1;
    const line = lines[i];
    const set = new Set<number>();
    const addFrom = (refs: unknown, keep: (r: number) => boolean) => {
      if (!Array.isArray(refs)) return;
      for (const raw of refs) {
        const r = Number(raw) - 1;
        if (Number.isInteger(r) && r >= 0 && r < n && r !== i && keep(r)) for (const d of depsOf(r)) set.add(d);
      }
    };
    if (line.kind === 'premise' || line.kind === 'assumption') set.add(i + 1);
    else if (line.kind === 'step') addFrom(line.refs, (r) => r < i);
    else if (line.kind === 'show' && closed[i]) {
      addFrom(line.close?.refs, (r) => inBox(i, r));
      for (let k = i + 1; k <= boxEnd[i]; k++) set.delete(k + 1);
    }
    visiting[i] = 0;
    const out = [...set].sort((a, b) => a - b);
    deps[i] = out;
    return out;
  };

  // ---- goal
  const globalIssues: LineIssue[] = [];
  let goal: Formula | undefined;
  if (typeof draft.goal === 'string' && draft.goal.trim() !== '') {
    const g = safeParse(draft.goal);
    if (g.ok) goal = g.formula;
    else
      globalIssues.push(
        err('goal-parse-error', `The goal can't be read: ${g.error.message}`, {
          suggestion: g.error.hint ?? 'Check how the goal formula is written.',
        }),
      );
  }

  // ---- assemble
  const lineChecks: LineCheck[] = lines.map((line, i) => {
    const iss = issues[i];
    let justification = '';
    if (line.kind === 'premise') justification = 'PR';
    else if (line.kind === 'assumption') justification = `ASS ${asmKind[i] ?? ''}`.trim();
    else if (line.kind === 'step') justification = `${line.rule ?? ''}${line.refs && line.refs.length ? ' ' + line.refs.join(',') : ''}`;
    else if (line.kind === 'show' && line.close) justification = `${line.close.method}${line.close.refs?.length ? ' ' + line.close.refs.join(',') : ''}`;
    let boxed = false;
    for (let s = parent[i]; s !== -1; s = parent[s]) if (closed[s]) { boxed = true; break; }
    const lc: LineCheck = {
      id: line.id,
      number: i + 1,
      ok: !iss.some((x) => x.severity === 'error'),
      issues: iss,
      boxed,
      dependsOn: depsOf(i),
      justification,
    };
    if (formulas[i]) lc.formula = formulas[i];
    if (line.kind === 'show') lc.showStatus = closed[i] ? 'closed' : 'open';
    return lc;
  });

  const errorLines = lineChecks.filter((l) => !l.ok).map((l) => l.number);
  const openShows = lineChecks.filter((l) => l.showStatus === 'open');
  const valid = errorLines.length === 0 && !globalIssues.some((x) => x.severity === 'error');
  let goalShown = false;
  if (goal) {
    goalShown = lineChecks.some(
      (l, i) =>
        depth[i] === 0 &&
        l.formula &&
        eq(l.formula, goal!) &&
        (lines[i].kind === 'show' ? closed[i] : lines[i].kind === 'step'),
    );
    // A premise that equals the goal does not count as showing it.
  }

  if (openShows.length) {
    const last = openShows[openShows.length - 1];
    globalIssues.push({
      severity: 'info',
      code: 'open-shows',
      message:
        openShows.length === 1
          ? `Line ${last.number}${last.formula ? ` (Show ${fmt(last.formula)})` : ''} is still open.`
          : `${openShows.length} Show lines are still open: ${lineList(openShows.map((l) => l.number))}.`,
    });
  }
  if (goal && !goalShown) {
    globalIssues.push({
      severity: 'info',
      code: 'goal-not-shown',
      message:
        n === 0 || !lines.some((l) => l.kind === 'show')
          ? `The goal ${fmt(goal)} has not been shown yet. Start with the line "Show ${fmt(goal)}".`
          : `The goal ${fmt(goal)} has not been shown yet.`,
    });
  }
  if (n === 0) globalIssues.push({ severity: 'info', code: 'empty-derivation', message: 'The derivation is empty.' });

  const complete =
    valid && n > 0 && openShows.length === 0 && (goal ? goalShown : lines.some((l) => l.kind === 'show'));

  let summary: string;
  if (complete) {
    summary = goal ? `Derivation complete — ${fmt(goal)} has been shown.` : 'Derivation complete — every line checks out and every Show line is closed.';
  } else if (!valid) {
    const nErr = errorLines.length;
    summary =
      nErr === 0
        ? globalIssues.find((x) => x.severity === 'error')?.message ?? 'There is a problem with the derivation.'
        : nErr === 1
          ? `Line ${errorLines[0]} needs attention.`
          : `${nErr} lines need attention: ${lineList(errorLines)}.`;
  } else if (n === 0) {
    summary = goal ? `Start by writing "Show ${fmt(goal)}".` : 'Start by adding lines.';
  } else if (openShows.length) {
    const inner = openShows[openShows.length - 1];
    summary = `So far so good. ${openShows.length === 1 ? 'One Show line is' : `${openShows.length} Show lines are`} still open (innermost: line ${inner.number}${inner.formula ? `, Show ${fmt(inner.formula)}` : ''}).`;
  } else if (goal && !goalShown) {
    summary = `No errors so far, but the goal ${fmt(goal)} hasn't been shown yet.`;
  } else {
    summary = 'No errors so far.';
  }

  return {
    lines,
    formulas,
    parent,
    boxEnd,
    closed,
    asmKind,
    goal,
    check: { lines: lineChecks, complete, valid, summary: capitalize(summary), globalIssues },
  };
}

/** Pure, synchronous; must handle 100+ lines in well under 10ms. Never throws. */
export function checkDerivation(draft: DerivationDraft): DerivationCheck {
  try {
    return analyze(draft).check;
  } catch (e) {
    const lines = Array.isArray(draft?.lines) ? draft.lines : [];
    return {
      lines: lines.map((l, i) => ({
        id: l?.id ?? String(i),
        number: i + 1,
        ok: false,
        issues: [],
        boxed: false,
        dependsOn: [],
        justification: '',
      })),
      complete: false,
      valid: false,
      summary: 'The derivation could not be checked.',
      globalIssues: [
        { severity: 'error', code: 'internal-error', message: `The checker hit an internal problem: ${e instanceof Error ? e.message : String(e)}` },
      ],
    };
  }
}

export type { CloseMethod, RuleId };
