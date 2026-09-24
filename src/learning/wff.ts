/**
 * WFF exercises: "is this a well-formed formula?" and, when it is not,
 * "where is the problem?". Malformed strings are produced by applying one
 * realistic defect to a well-formed formula; the ground truth label is always
 * taken from the parser itself.
 *
 * OWNER: Learning System.
 */
import { CONNECTIVE_NAME, format, mainConnective, parse } from '../logic';
import type { Span } from '../logic';
import type { Difficulty, Feedback, Solution, WffDefect, WffExercise } from './types';
import { hash, makeRng, niceRandomFormula, pick, type Rng } from './util';

const ATOMS_BY_DIFFICULTY: Record<Difficulty, string[]> = {
  1: ['P', 'Q'],
  2: ['P', 'Q', 'R'],
  3: ['P', 'Q', 'R'],
  4: ['P', 'Q', 'R', 'S'],
  5: ['P', 'Q', 'R', 'S'],
};

const BINARY = ['∧', '∨', '→', '↔'];
const isBinaryChar = (c: string) => BINARY.includes(c);

const DEFECT_TEXT: Record<WffDefect, string> = {
  'missing-paren': 'a parenthesis is missing',
  'extra-paren': 'there is a parenthesis with no partner',
  'dangling-connective': 'a connective is missing one of its sides',
  'lowercase-atom': 'a sentence letter is lowercase',
  'ambiguous-chain': 'two binary connectives are chained without parentheses',
  'missing-connective': 'two formulas sit side by side with no connective',
  'misplaced-negation': '¬ is used as if it joined two formulas',
  'double-connective': 'two binary connectives appear in a row',
  'run-together-letters': 'two sentence letters are run together',
};

/** Indices of all characters matching `pred`. */
function indices(s: string, pred: (c: string, i: number) => boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) if (pred(s[i], i)) out.push(i);
  return out;
}

function matchingClose(s: string, open: number): number {
  let d = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') d++;
    else if (s[i] === ')' && --d === 0) return i;
  }
  return -1;
}

const splice = (s: string, i: number, del: number, ins = '') => s.slice(0, i) + ins + s.slice(i + del);

/** Apply one defect; returns null if the defect doesn't fit this string. */
function applyDefect(s: string, defect: WffDefect, rng: Rng): string | null {
  const choose = (xs: number[]) => (xs.length ? pick(rng, xs) : null);
  switch (defect) {
    case 'missing-paren': {
      const i = choose(indices(s, (c) => c === '(' || c === ')'));
      return i === null ? null : splice(s, i, 1);
    }
    case 'extra-paren': {
      return rng() < 0.5 ? `(${s}` : `${s})`;
    }
    case 'dangling-connective': {
      if (rng() < 0.5) return `${s} ${pick(rng, BINARY)}`;
      // delete an atom operand next to a binary connective
      const i = choose(indices(s, (c, k) => c >= 'A' && c <= 'Z' && (s[k + 2] !== undefined && isBinaryChar(s[k + 2]) || isBinaryChar(s[k - 2] ?? ''))));
      return i === null ? `${pick(rng, BINARY)} ${s}` : splice(s, i, 1);
    }
    case 'lowercase-atom': {
      const i = choose(indices(s, (c) => c >= 'A' && c <= 'Z' && c !== 'V'));
      return i === null ? null : splice(s, i, 1, s[i].toLowerCase());
    }
    case 'ambiguous-chain': {
      // remove a matching pair of parentheses that is not directly negated
      const opens = indices(s, (c, k) => c === '(' && s[k - 1] !== '¬');
      const i = choose(opens);
      if (i === null) return null;
      const j = matchingClose(s, i);
      return j < 0 ? null : splice(splice(s, j, 1), i, 1);
    }
    case 'missing-connective': {
      const i = choose(indices(s, isBinaryChar));
      return i === null ? null : splice(s, i - 1, 2); // drop " ∧"
    }
    case 'misplaced-negation': {
      const i = choose(indices(s, isBinaryChar));
      return i === null ? null : splice(s, i, 1, '¬');
    }
    case 'double-connective': {
      const i = choose(indices(s, isBinaryChar));
      return i === null ? null : splice(s, i + 1, 0, ` ${pick(rng, BINARY.filter((c) => c !== s[i]))}`);
    }
    case 'run-together-letters': {
      const i = choose(indices(s, isBinaryChar));
      if (i === null) return null;
      // "P ∧ Q" → "PQ": remove " ∧ " only when both neighbours are letters
      if (!/[A-Z]/.test(s[i - 2] ?? '') || !/[A-Z]/.test(s[i + 2] ?? '')) return null;
      return splice(s, i - 1, 3);
    }
  }
}

const DEFECTS_BY_DIFFICULTY: Record<Difficulty, WffDefect[]> = {
  1: ['missing-paren', 'dangling-connective', 'lowercase-atom', 'missing-connective'],
  2: ['missing-paren', 'dangling-connective', 'lowercase-atom', 'missing-connective', 'ambiguous-chain', 'extra-paren'],
  3: ['missing-paren', 'ambiguous-chain', 'misplaced-negation', 'double-connective', 'extra-paren', 'run-together-letters'],
  4: ['missing-paren', 'ambiguous-chain', 'misplaced-negation', 'double-connective', 'run-together-letters'],
  5: ['missing-paren', 'ambiguous-chain', 'misplaced-negation', 'double-connective'],
};

/** Legal-but-unusual decorations: brackets, redundant parentheses, double negation. */
function decorate(s: string, rng: Rng, difficulty: Difficulty): string {
  if (difficulty < 3) return s;
  const r = rng();
  if (r < 0.2) return `(${s})`;
  if (r < 0.4) {
    const i = s.indexOf('(');
    const j = i >= 0 ? matchingClose(s, i) : -1;
    if (j > i) return s.slice(0, i) + '[' + s.slice(i + 1, j) + ']' + s.slice(j + 1);
  }
  if (r < 0.5) return `¬¬${/[∧∨→↔]/.test(s) ? `(${s})` : s}`;
  return s;
}

export function generateWff(difficulty: Difficulty, seed: number): WffExercise {
  const rng = makeRng(seed);
  const atoms = ATOMS_BY_DIFFICULTY[difficulty];
  const wantWellFormed = rng() < 0.45;
  let text = '';
  let defect: WffDefect | undefined;
  for (let attempt = 0; attempt < 50; attempt++) {
    const maxDepth = difficulty <= 1 ? 2 : difficulty <= 3 ? 3 : 4;
    const g = niceRandomFormula({ atoms, maxDepth, random: rng });
    const s = format(g);
    const conns = (s.match(/[¬∧∨→↔]/g) ?? []).length;
    const minConns = [1, 1, 2, 3, 4][difficulty - 1];
    const maxConns = [3, 4, 5, 7, 9][difficulty - 1];
    if (conns < minConns || conns > maxConns) continue;
    if (wantWellFormed) {
      text = decorate(s, rng, difficulty);
      defect = undefined;
      if (parse(text).ok) break;
      continue;
    }
    const d = pick(rng, DEFECTS_BY_DIFFICULTY[difficulty]);
    const bad = applyDefect(s, d, rng);
    if (bad && !parse(bad).ok) {
      text = bad;
      defect = d;
      break;
    }
  }
  if (!text) text = wantWellFormed ? 'P → Q' : 'P ∧ Q ∨ R';
  const res = parse(text);
  const diag = diagnoseWff(text);
  // Same prompt either way, so the prompt never gives the answer away.
  const askLocation = difficulty >= 2;
  return {
    id: `wff-gen-${hash(text)}`,
    kind: 'wff',
    topic: 'wff',
    difficulty,
    title: 'Well-formed?',
    prompt: askLocation
      ? 'Is this a well-formed formula? If not, click where the problem is.'
      : 'Is this a well-formed formula of sentential logic?',
    tags: [],
    source: 'generated',
    formula: text,
    wellFormed: res.ok,
    askLocation,
    errorSpan: diag?.span,
    errorCode: res.ok ? undefined : res.error.code,
    defect: res.ok ? undefined : defect,
  };
}

export interface WffDiagnosis {
  code: string;
  /** Student-facing explanation that quotes the offending fragment (no character indices). */
  message: string;
  hint?: string;
  /** Region of the formula to highlight. */
  span: Span;
}

const quote = (s: string) => `"${s.trim()}"`;

/**
 * Explain why `text` is not a WFF (null if it is one). Uses the parser's
 * error, but first checks for a connective dangling at either end — the
 * parser reports whole-string ambiguity before that in cases like
 * "R ↔ ¬(Q ∨ R) →", and the dangling connective is the real problem.
 */
export function diagnoseWff(text: string): WffDiagnosis | null {
  const res = parse(text);
  if (res.ok) return null;
  const e = res.error;
  const trimmedEnd = text.replace(/\s+$/, '');
  const last = trimmedEnd.length - 1;
  if (last >= 0 && isBinaryChar(trimmedEnd[last])) {
    return {
      code: 'dangling-connective',
      message: `The ${quote(trimmedEnd[last])} at the end has nothing after it: every binary connective needs a formula on both sides.`,
      hint: 'Add the missing right-hand formula, or remove the connective.',
      span: { start: last, end: last + 1 },
    };
  }
  const first = text.search(/\S/);
  if (first >= 0 && isBinaryChar(text[first])) {
    return {
      code: 'dangling-connective',
      message: `The ${quote(text[first])} at the start has nothing before it: every binary connective needs a formula on both sides.`,
      hint: 'Add the missing left-hand formula, or remove the connective.',
      span: { start: first, end: first + 1 },
    };
  }
  const frag = text.slice(e.span.start, e.span.end);
  const context = text.slice(Math.max(0, e.span.start - 2), Math.min(text.length, e.span.end + 2)).trim();
  const whole = e.span.start === 0 && e.span.end >= text.trim().length;
  let message = e.message;
  if (e.code === 'misplaced-negation') {
    message = `In ${quote(context)}, ¬ sits between two formulas. ¬ only negates the formula right after it; to join two formulas you need ∧, ∨, → or ↔.`;
  } else if (!whole && frag.trim()) {
    message = `${e.message} Look at ${quote(frag.length < 3 ? context : frag)}.`;
  }
  return { code: e.code, message, hint: e.hint, span: e.span };
}

export function checkWff(ex: WffExercise, wellFormed: boolean, errorAt?: number): Feedback {
  const d = diagnoseWff(ex.formula);
  if (wellFormed === ex.wellFormed) {
    if (ex.wellFormed || !d) {
      return {
        correct: true,
        severity: 'success',
        code: 'correct',
        headline: 'Correct — it is well-formed.',
        explanation: 'Every connective has the right number of well-formed parts, every binary sub-formula nested inside another connective is in parentheses, and the brackets balance. (Outermost parentheses may be dropped.)',
      };
    }
    const hl = [{ target: 'formula' as const, start: d.span.start, end: d.span.end, tone: 'error' as const }];
    if (ex.askLocation && errorAt === undefined) {
      return { correct: false, partial: true, severity: 'warning', code: 'no-location', headline: 'Right, it is not well-formed — now show where the problem is.', explanation: 'Click the part of the string that breaks the formation rules.' };
    }
    if (ex.askLocation && errorAt !== undefined && !(errorAt >= d.span.start - 1 && errorAt <= d.span.end)) {
      return {
        correct: false,
        partial: true,
        severity: 'warning',
        code: 'wrong-location',
        headline: 'Right, it is not well-formed — but the problem is elsewhere.',
        explanation: d.message,
        details: d.hint ? [d.hint] : undefined,
        highlight: hl,
      };
    }
    return { correct: true, severity: 'success', code: 'correct', headline: 'Correct — it is not well-formed.', explanation: d.message, details: d.hint ? [d.hint] : undefined, highlight: hl };
  }
  if (ex.wellFormed) {
    return {
      correct: false,
      severity: 'error',
      code: 'is-well-formed',
      headline: 'Actually, this one is well-formed.',
      explanation:
        'Check it piece by piece: each sentence letter is a capital letter, each ¬ is followed by a formula, each binary connective (∧ ∨ → ↔) has a formula on each side, and any binary part inside a larger formula is wrapped in brackets. Outer brackets, square brackets and double negations are all allowed.',
    };
  }
  return {
    correct: false,
    severity: 'error',
    code: 'not-well-formed',
    headline: 'This one is not well-formed.',
    explanation: d ? d.message : 'It breaks the formation rules.',
    details: d?.hint ? [d.hint] : undefined,
    highlight: d ? [{ target: 'formula', start: d.span.start, end: d.span.end, tone: 'error' }] : undefined,
  };
}

export function wffHints(ex: WffExercise): string[] {
  const hints = [
    'Scan left to right: every binary connective (∧ ∨ → ↔) needs a complete formula on each side; ¬ needs one formula right after it.',
    'Count brackets: every "(" needs a matching ")". A binary formula inside another connective must be in brackets — P ∧ Q ∨ R is not a formula.',
    'Sentence letters are single capital letters (optionally with digits). Lowercase letters and two letters side by side are not allowed.',
  ];
  if (!ex.wellFormed && ex.defect) hints.push(`Look for this: ${DEFECT_TEXT[ex.defect]}.`);
  else if (ex.wellFormed) hints.push('Nothing here is actually broken — outer brackets, [square brackets] and ¬¬ are all legal.');
  return hints;
}

export function wffSolution(ex: WffExercise): Solution {
  const res = parse(ex.formula);
  if (res.ok) {
    return { answer: 'well-formed', summary: `Well-formed. Written canonically: ${format(res.formula)}.`, steps: [`Its main connective is the ${CONNECTIVE_NAME[mainConnective(res.formula)]}.`] };
  }
  const d = diagnoseWff(ex.formula)!;
  return { answer: 'not well-formed', summary: `Not well-formed. ${d.message}`, steps: d.hint ? [d.hint] : undefined };
}
