/**
 * Symbolization (English → sentential logic): bank exercises, a semantic
 * checker with targeted diagnoses, progressive hints and a template-based
 * generator.
 *
 * Checking is semantic: any formula truth-functionally equivalent to the
 * standard answer is accepted. When the answer is wrong we look for the
 * classic mistake that explains it (converse, "neither/nor" vs "not both",
 * negation scope, ∧/∨ mix-ups, ...) by mutating the standard answer and
 * testing which mutation the student's formula is equivalent to.
 *
 * OWNER: Learning System.
 */
import type { Formula, Valuation } from '../logic';
import { CONNECTIVE_NAME, SYMBOL, atomsOf, checkEquivalence, equals, evaluate, format, isBinary, isPredicateFormula, mainConnective, parse } from '../logic';
import { SYMBOLIZATION_BANK, VOCABULARY, type SymbolizationBankItem } from './symbolizationBank';
import type { Difficulty, Feedback, HighlightSpan, Solution, SymbolKeyEntry, SymbolizationExercise } from './types';
import { capitalize, f, hash, joinList, makeRng, pick, trueFalse, type Rng } from './util';

// ---------------------------------------------------------------------------
// Bank → exercises
// ---------------------------------------------------------------------------

const PROMPT = 'Symbolize the sentence using the given key.';

function keyEntries(item: SymbolizationBankItem): SymbolKeyEntry[] {
  return item.key.map((k) => (typeof k === 'string' ? VOCABULARY[k] : { letter: k[0], meaning: k[1], negation: k[2] }));
}

const TITLE_BY_TAG: [string, string][] = [
  ['only-if', 'Only if'],
  ['necessary', 'Necessary conditions'],
  ['sufficient', 'Sufficient conditions'],
  ['unless', 'Unless'],
  ['neither-nor', 'Neither … nor'],
  ['not-both', 'Not both'],
  ['exclusive', 'Exclusive or'],
  ['negation-scope', 'Scope of negation'],
  ['biconditional', 'Biconditionals'],
  ['nested', 'Nested sentences'],
  ['if-after', '"If" in the middle'],
  ['provided-that', 'Provided that'],
  ['whenever', 'Whenever'],
  ['conditional', 'Conditionals'],
  ['disjunction', 'Disjunction'],
  ['conjunction', 'Conjunction'],
  ['negation', 'Negation'],
  ['simple', 'Simple sentences'],
];

function titleFor(tags: string[]): string {
  for (const [t, title] of TITLE_BY_TAG) if (tags.includes(t)) return title;
  return 'Symbolization';
}

function bankToExercise(item: SymbolizationBankItem): SymbolizationExercise {
  return {
    id: item.id,
    kind: 'symbolization',
    topic: 'symbolization',
    difficulty: item.difficulty,
    title: titleFor(item.tags),
    prompt: PROMPT,
    tags: [...item.tags],
    source: 'bank',
    sentence: item.sentence,
    key: keyEntries(item),
    answer: item.answer,
    alternatives: item.alternatives ?? [],
    explanation: item.explanation,
  };
}

/** All curated symbolization exercises, ordered by difficulty. */
export const SYMBOLIZATION_EXERCISES: SymbolizationExercise[] = SYMBOLIZATION_BANK.map(bankToExercise);

// ---------------------------------------------------------------------------
// English renderings
// ---------------------------------------------------------------------------

/** "it rains and the ground is not wet" for a valuation, in key order. */
export function describeValuation(v: Valuation, key: SymbolKeyEntry[]): string {
  const parts: string[] = [];
  for (const k of key) if (typeof v[k.letter] === 'boolean') parts.push(v[k.letter] ? k.meaning : k.negation);
  for (const a of Object.keys(v).sort()) if (!key.some((k) => k.letter === a)) parts.push(`${a} is ${v[a] ? 'true' : 'false'}`);
  return joinList(parts);
}

const keyLabel = (key: SymbolKeyEntry[], letter: string) => {
  const e = key.find((k) => k.letter === letter);
  return e ? `${letter} ("${e.meaning}")` : letter;
};

// ---------------------------------------------------------------------------
// Idioms and pattern notes (used by hints and feedback)
// ---------------------------------------------------------------------------

export const PATTERN_NOTES: Record<string, string> = {
  simple: 'A sentence with no connective words is just its sentence letter.',
  negation: '"not", "n\'t", "does not" and "it is not the case that" all become ¬ in front of what they deny.',
  conjunction: '"and", "but", "although", "however" and "both … and" all become ∧: both parts are asserted.',
  disjunction: '"or" and "either … or" become ∨, read inclusively (true when both parts are true).',
  conditional: '"If φ, then ψ" is φ → ψ: the "if" clause is the antecedent (left of the arrow).',
  'if-after': '"ψ if φ" is still φ → ψ: "if" introduces the antecedent wherever it appears.',
  whenever: '"Whenever φ, ψ" means "if φ, then ψ": φ → ψ.',
  'provided-that': '"ψ provided that φ" means "ψ if φ": φ → ψ.',
  'only-if': '"φ only if ψ" is φ → ψ: "only if" introduces the consequent (the necessary condition).',
  unless: '"φ unless ψ" is φ ∨ ψ (equivalently ¬ψ → φ): if ψ does not happen, φ does.',
  sufficient: '"φ is sufficient for ψ" is φ → ψ: a sufficient condition is an antecedent.',
  necessary: '"ψ is necessary for φ" is φ → ψ: a necessary condition is a consequent.',
  biconditional: '"if and only if", "just in case", "exactly when" and "necessary and sufficient" become ↔.',
  'neither-nor': '"Neither φ nor ψ" is ¬φ ∧ ¬ψ (equivalently ¬(φ ∨ ψ)): both are false.',
  'not-both': '"Not both φ and ψ" is ¬(φ ∧ ψ) (equivalently ¬φ ∨ ¬ψ): at least one is false.',
  exclusive: '"… but not both" adds a conjunct ¬(φ ∧ ψ) to the disjunction.',
  'negation-scope': 'Decide exactly what "it is not the case that" covers: ¬(φ → ψ) negates the whole conditional, ¬φ → ψ only φ.',
  nested: 'Find the main connective first, symbolize each part on its own, then combine them with parentheses.',
};

const NOTE_PRIORITY = [
  'only-if', 'necessary', 'sufficient', 'unless', 'neither-nor', 'not-both', 'exclusive', 'negation-scope',
  'biconditional', 'if-after', 'provided-that', 'whenever', 'conditional', 'disjunction', 'conjunction', 'negation', 'nested', 'simple',
];

function notesFor(tags: string[], max = 2): string[] {
  return NOTE_PRIORITY.filter((t) => tags.includes(t)).slice(0, max).map((t) => PATTERN_NOTES[t]);
}

const MAIN_CUE: Record<Formula['kind'], string> = {
  atom: 'there is no connective at all',
  not: 'the whole sentence is denied',
  and: 'the sentence asserts two things together',
  or: 'the sentence offers alternatives',
  implies: 'the sentence states a condition',
  iff: 'the sentence says two things stand or fall together',
  pred: 'it is a single predication',
  identity: 'it says two things are the same',
  forall: 'it says something about everything',
  exists: 'it says something exists',
};

// ---------------------------------------------------------------------------
// Mistake diagnosis by mutation
// ---------------------------------------------------------------------------

type MutationCode =
  | 'converse'
  | 'neither-as-not-both'
  | 'not-both-as-neither'
  | 'negation-scope-narrow'
  | 'negation-scope-wide'
  | 'conditional-as-biconditional'
  | 'biconditional-one-direction'
  | 'disjunction-as-conditional'
  | 'exclusive-or'
  | 'and-as-or'
  | 'or-as-and'
  | 'conditional-as-conjunction'
  | 'conjunction-as-conditional'
  | 'grouping'
  | 'missing-negation'
  | 'extra-negation'
  | 'swapped-letters';

const PRIORITY: MutationCode[] = [
  'converse', 'neither-as-not-both', 'not-both-as-neither', 'negation-scope-narrow', 'negation-scope-wide',
  'conditional-as-biconditional', 'biconditional-one-direction', 'disjunction-as-conditional', 'exclusive-or',
  'and-as-or', 'or-as-and', 'conditional-as-conjunction', 'conjunction-as-conditional', 'grouping',
  'missing-negation', 'extra-negation', 'swapped-letters',
];

interface Mutation {
  code: MutationCode;
  /** The part of the standard answer that was changed. */
  original: Formula;
  /** What it was changed into (what the student effectively wrote). */
  replaced: Formula;
  whole: Formula;
  letters?: [string, string];
}

const N = (x: Formula): Formula => ({ kind: 'not', operand: x });
const B = (kind: 'and' | 'or' | 'implies' | 'iff', l: Formula, r: Formula): Formula => ({ kind, left: l, right: r });

function localMutations(g: Formula): { code: MutationCode; to: Formula }[] {
  const out: { code: MutationCode; to: Formula }[] = [];
  switch (g.kind) {
    case 'atom':
      out.push({ code: 'extra-negation', to: N(g) });
      break;
    case 'not': {
      const x = g.operand;
      out.push({ code: 'missing-negation', to: x });
      if (x.kind === 'or') {
        out.push({ code: 'neither-as-not-both', to: N(B('and', x.left, x.right)) });
      }
      if (x.kind === 'and') {
        out.push({ code: 'not-both-as-neither', to: N(B('or', x.left, x.right)) });
      }
      if (x.kind === 'and' || x.kind === 'or' || x.kind === 'implies' || x.kind === 'iff') {
        out.push({ code: 'negation-scope-narrow', to: B(x.kind, N(x.left), x.right) });
      }
      break;
    }
    default: {
      if (!isBinary(g)) break; // predications / quantifiers: sentential exercises never contain them
      const { left: l, right: r } = g;
      if (g.kind === 'and' && l.kind === 'not' && r.kind === 'not') out.push({ code: 'neither-as-not-both', to: N(B('and', l.operand, r.operand)) });
      if (g.kind === 'or' && l.kind === 'not' && r.kind === 'not') out.push({ code: 'not-both-as-neither', to: N(B('or', l.operand, r.operand)) });
      if (l.kind === 'not') out.push({ code: 'negation-scope-wide', to: N(B(g.kind, l.operand, r)) });
      if (r.kind === 'not') out.push({ code: 'negation-scope-wide', to: N(B(g.kind, l, r.operand)) });
      if (g.kind === 'implies') {
        out.push({ code: 'converse', to: B('implies', r, l) });
        out.push({ code: 'conditional-as-biconditional', to: B('iff', l, r) });
        out.push({ code: 'conditional-as-conjunction', to: B('and', l, r) });
      }
      if (g.kind === 'iff') {
        out.push({ code: 'biconditional-one-direction', to: B('implies', l, r) });
        out.push({ code: 'biconditional-one-direction', to: B('implies', r, l) });
      }
      if (g.kind === 'or') {
        out.push({ code: 'or-as-and', to: B('and', l, r) });
        out.push({ code: 'disjunction-as-conditional', to: B('implies', l, r) });
        out.push({ code: 'disjunction-as-conditional', to: B('implies', r, l) });
        out.push({ code: 'exclusive-or', to: N(B('iff', l, r)) });
      }
      if (g.kind === 'and') {
        out.push({ code: 'and-as-or', to: B('or', l, r) });
        out.push({ code: 'conjunction-as-conditional', to: B('implies', l, r) });
      }
      // Regrouping: (A ∘ B) • C  ⇄  A ∘ (B • C)
      if (isBinary(l)) out.push({ code: 'grouping', to: B(l.kind, l.left, B(g.kind, l.right, r)) });
      if (isBinary(r)) out.push({ code: 'grouping', to: B(r.kind, B(g.kind, l, r.left), r.right) });
    }
  }
  return out;
}

function allMutations(key: Formula): Mutation[] {
  const out: Mutation[] = [];
  const walk = (g: Formula, rebuild: (x: Formula) => Formula) => {
    for (const m of localMutations(g)) out.push({ code: m.code, original: g, replaced: m.to, whole: rebuild(m.to) });
    switch (g.kind) {
      case 'atom':
        return;
      case 'not':
        walk(g.operand, (x) => rebuild(N(x)));
        return;
      default: {
        if (!isBinary(g)) return;
        const { kind, left, right } = g;
        walk(left, (x) => rebuild(B(kind, x, right)));
        walk(right, (x) => rebuild(B(kind, left, x)));
      }
    }
  };
  walk(key, (x) => x);
  const atoms = atomsOf(key);
  for (let i = 0; i < atoms.length; i++)
    for (let j = i + 1; j < atoms.length; j++) {
      const [a, b] = [atoms[i], atoms[j]];
      const swap = (g: Formula): Formula =>
        g.kind === 'atom' ? { kind: 'atom', name: g.name === a ? b : g.name === b ? a : g.name } : g.kind === 'not' ? N(swap(g.operand)) : isBinary(g) ? B(g.kind, swap(g.left), swap(g.right)) : g;
      out.push({ code: 'swapped-letters', original: key, replaced: swap(key), whole: swap(key), letters: [a, b] });
    }
  return out.sort((x, y) => PRIORITY.indexOf(x.code) - PRIORITY.indexOf(y.code));
}

/** Find the most plausible named mistake that turns `key` into (something equivalent to) `answer`. */
function findMutation(key: Formula, answer: Formula): Mutation | null {
  for (const m of allMutations(key)) {
    if (checkEquivalence(m.whole, key).equivalent) continue; // not actually a change
    if (checkEquivalence(m.whole, answer).equivalent) return m;
  }
  return null;
}

/** A subformula as it would appear inside a larger formula (compound parts get parentheses). */
const inner = (g: Formula) => format(g, { dropOuter: false });
const neg = (g: Formula) => `¬${inner(g)}`;

/** The two sides of a binary formula, or of the formula a negation applies to. */
function sides(g: Formula): [Formula, Formula] | null {
  if (g.kind === 'not') return sides(g.operand);
  if (!isBinary(g)) return null;
  if (g.kind === 'and' && g.left.kind === 'not' && g.right.kind === 'not') return [g.left.operand, g.right.operand];
  if (g.kind === 'or' && g.left.kind === 'not' && g.right.kind === 'not') return [g.left.operand, g.right.operand];
  return [g.left, g.right];
}

function mutationMessage(m: Mutation, ex: SymbolizationExercise): { headline: string; explanation: string; details: string[] } {
  const o = format(m.original);
  const r = format(m.replaced);
  const has = (t: string) => ex.tags.includes(t);
  const same = `Your formula works like ${r} where the sentence needs ${o}.`;
  const [lf, rf] = sides(m.original) ?? [m.original, m.original];
  const [X, Y] = [inner(lf), inner(rf)];
  switch (m.code) {
    case 'converse': {
      let why = `A conditional only goes one way: the antecedent (the condition) goes on the left of the arrow, the consequent on the right. ${X} → ${Y} and ${Y} → ${X} say different things.`;
      if (has('only-if')) why = `"Only if" introduces the consequent: "${X} only if ${Y}" is ${X} → ${Y}, not ${Y} → ${X}. The part after "only if" is a necessary condition, so it goes on the RIGHT of the arrow.`;
      else if (has('necessary')) why = `A necessary condition is the consequent: "${Y} is necessary for ${X}" means ${X} → ${Y} (if ${X} holds, ${Y} must hold).`;
      else if (has('sufficient')) why = `A sufficient condition is the antecedent: "${X} is sufficient for ${Y}" means ${X} → ${Y}.`;
      else if (has('if-after') || has('provided-that') || has('whenever')) why = `"If" (like "provided that" and "whenever") introduces the antecedent wherever it appears in the sentence: "${Y} if ${X}" is ${X} → ${Y}.`;
      return { headline: 'You reversed the conditional (you wrote its converse).', explanation: why, details: [same] };
    }
    case 'neither-as-not-both':
      return {
        headline: '"Neither … nor" means both are false, not just one.',
        explanation: `"Neither ${X} nor ${Y}" means ${neg(lf)} ∧ ${neg(rf)}, i.e. ¬(${X} ∨ ${Y}). Your formula amounts to ${neg(lf)} ∨ ${neg(rf)} (= ¬(${X} ∧ ${Y})), which means "not both" — it allows one of them to be true.`,
        details: [same],
      };
    case 'not-both-as-neither':
      return {
        headline: '"Not both" only rules out both being true together.',
        explanation: `"Not both ${X} and ${Y}" is ¬(${X} ∧ ${Y}), equivalently ${neg(lf)} ∨ ${neg(rf)}. Your formula amounts to ${neg(lf)} ∧ ${neg(rf)} (= ¬(${X} ∨ ${Y})), which means "neither" — it also rules out exactly one of them being true.`,
        details: [same],
      };
    case 'negation-scope-narrow':
      return {
        headline: 'Your negation covers too little.',
        explanation: `In the sentence the negation applies to the whole ${CONNECTIVE_NAME[m.original.kind === 'not' ? m.original.operand.kind : m.original.kind]}, so the compound needs parentheses after ¬: ${o}. ¬ binds only to what immediately follows it.`,
        details: [same],
      };
    case 'negation-scope-wide':
      return {
        headline: 'Your negation covers too much.',
        explanation: `In the sentence only one part is denied: ${o}. Putting ¬( … ) around the whole ${CONNECTIVE_NAME[m.original.kind]} negates all of it, which says something different.`,
        details: [same],
      };
    case 'conditional-as-biconditional':
      return {
        headline: 'The sentence only goes one way; ↔ claims both directions.',
        explanation: `The sentence says ${X} → ${Y}; ${X} ↔ ${Y} would also claim ${Y} → ${X}. "if", "only if", "provided that", "whenever", "sufficient" and "necessary" each express a one-way conditional. Only "if and only if", "just in case", "exactly when" and "necessary and sufficient" give ↔.`,
        details: [same],
      };
    case 'biconditional-one-direction':
      return {
        headline: 'The sentence claims both directions, but your conditional has only one.',
        explanation: `"if and only if" (like "just in case", "exactly when", "necessary and sufficient") means each side implies the other: ${X} ↔ ${Y}, or equivalently (${X} → ${Y}) ∧ (${Y} → ${X}).`,
        details: [same],
      };
    case 'disjunction-as-conditional':
      return has('unless')
        ? {
            headline: `"${X} unless ${Y}" means ${X} ∨ ${Y} (equivalently ¬${Y} → ${X}).`,
            explanation: `If ${Y} does not happen, ${X} does. Either ${X} ∨ ${Y} or ${neg(rf)} → ${X} is accepted, but your conditional says something else — check which side should be negated and which way the arrow points.`,
            details: [same],
          }
        : { headline: 'The sentence is a disjunction, not a conditional.', explanation: `"or" offers alternatives: ${X} ∨ ${Y}. It does not make one part a condition of the other.`, details: [same] };
    case 'exclusive-or':
      return {
        headline: 'Your formula reads "or"/"unless" exclusively.',
        explanation: `In logic "or" and "unless" are inclusive: ${X} ∨ ${Y} is also true when both ${X} and ${Y} are true. Your formula is false in that case. Only an explicit "but not both" makes it exclusive.`,
        details: [same],
      };
    case 'and-as-or':
      return {
        headline: 'You used ∨ where the sentence needs ∧.',
        explanation: `"and", "but", "although", "however" and "both … and" assert BOTH parts: ${X} ∧ ${Y}. ∨ would need only one part to be true.`,
        details: [same],
      };
    case 'or-as-and':
      return {
        headline: 'You used ∧ where the sentence needs ∨.',
        explanation: has('unless')
          ? `"${X} unless ${Y}" means ${X} ∨ ${Y} (equivalently ¬${Y} → ${X}): only one part has to be true. ∧ would require both.`
          : `"or" and "either … or" are disjunctions: ${X} ∨ ${Y} needs only one part to be true. ∧ would require both.`,
        details: [same],
      };
    case 'conditional-as-conjunction':
      return {
        headline: 'The sentence states a condition; it does not assert both parts.',
        explanation: `An "if" sentence can be true even when its antecedent is false, so it is not a conjunction. Use ${X} → ${Y}, with the condition on the left.`,
        details: [same],
      };
    case 'conjunction-as-conditional':
      return {
        headline: 'The sentence asserts both parts outright — use ∧, not →.',
        explanation: `"and", "but", "although" claim that both parts are true: ${X} ∧ ${Y}. A conditional would only say one holds IF the other does.`,
        details: [same],
      };
    case 'grouping':
      return {
        headline: 'Right connectives, wrong grouping.',
        explanation: `Parentheses decide which connective is the main one. ${mainDescription(ex)} Symbolize each part separately, then combine.`,
        details: [same],
      };
    case 'missing-negation':
      return {
        headline: 'You left out a negation.',
        explanation: 'Look for every "not", "n\'t", "does not", "it is not the case that", "neither" in the sentence — each needs a ¬.',
        details: [same],
      };
    case 'extra-negation':
      return {
        headline: 'Your formula has a negation the sentence does not.',
        explanation: `${o} is asserted positively in the sentence; check each ¬ you wrote against a "not" in the English.`,
        details: [same],
      };
    case 'swapped-letters': {
      const [a, b] = m.letters!;
      return {
        headline: `You swapped ${a} and ${b}.`,
        explanation: `Check the key: ${keyLabel(ex.key, a)} and ${keyLabel(ex.key, b)}. Your formula has the right shape, but the two letters are in each other's places.`,
        details: [],
      };
    }
  }
}

/** Main connectives of all accepted standard forms (answer first). */
function acceptedMains(ex: SymbolizationExercise): Formula['kind'][] {
  const out: Formula['kind'][] = [];
  for (const s of [ex.answer, ...ex.alternatives]) {
    const k = mainConnective(f(s));
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

const symOf = (k: Formula['kind']) => (k === 'atom' ? '' : ` (${SYMBOL[k as keyof typeof SYMBOL]})`);

/** "The sentence as a whole is a disjunction (∨) — or, equivalently, a conditional (→)." */
function mainDescription(ex: SymbolizationExercise): string {
  const [k, ...rest] = acceptedMains(ex);
  const first = `As a whole the sentence is a ${CONNECTIVE_NAME[k]}${symOf(k)} — ${MAIN_CUE[k]}`;
  if (!rest.length) return `${first}.`;
  return `${first}; it can equally be written as a ${rest.map((x) => `${CONNECTIVE_NAME[x]}${symOf(x)}`).join(' or ')} (both forms are accepted).`;
}

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

/** Canonical form treating ∧ ∨ ↔ as commutative, for "standard vs merely equivalent". */
function canon(g: Formula): string {
  switch (g.kind) {
    case 'atom':
      return g.name;
    case 'not':
      return `~${canon(g.operand)}`;
    case 'pred':
    case 'identity':
    case 'forall':
    case 'exists':
      return format(g);
    default: {
      let a = canon(g.left);
      let b = canon(g.right);
      if (g.kind !== 'implies' && b < a) [a, b] = [b, a];
      return `(${a} ${g.kind} ${b})`;
    }
  }
}

function letterSpans(text: string, letters: Set<string>): HighlightSpan[] {
  const out: HighlightSpan[] = [];
  const re = /[A-Z][0-9]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) if (letters.has(m[0])) out.push({ target: 'answer', start: m.index, end: m.index + m[0].length, tone: 'error' });
  return out;
}

/** Check a symbolization answer (raw typed text; ASCII is fine). */
export function checkSymbolization(ex: SymbolizationExercise, text: string): Feedback {
  if (!text.trim()) {
    return { correct: false, severity: 'error', code: 'empty', headline: 'Type a formula first.', explanation: `Use the sentence letters from the key (${ex.key.map((k) => k.letter).join(', ')}) and the connectives ¬ ∧ ∨ → ↔.` };
  }
  const parsed = parse(text);
  if (!parsed.ok) {
    const e = parsed.error;
    return {
      correct: false,
      severity: 'error',
      code: 'parse-error',
      headline: "That isn't a well-formed formula yet.",
      explanation: e.message,
      details: e.hint ? [e.hint] : undefined,
      highlight: [{ target: 'answer', start: e.span.start, end: e.span.end, tone: 'error' }],
    };
  }
  const ans = parsed.formula;
  if (isPredicateFormula(ans)) {
    return {
      correct: false,
      severity: 'error',
      code: 'predicate-in-sentential',
      headline: 'Use sentence letters only here.',
      explanation: `This exercise is in sentential logic: symbolize each clause with a single capital letter from the key (${ex.key.map((k) => k.letter).join(', ')}), without predicates, names or quantifiers.`,
    };
  }
  const key = f(ex.answer);
  const keyLetters = new Set(ex.key.map((k) => k.letter));
  const used = atomsOf(ans);
  const unknown = used.filter((a) => !keyLetters.has(a));
  if (unknown.length) {
    return {
      correct: false,
      severity: 'error',
      code: 'unknown-letter',
      headline: `${joinList(unknown)} ${unknown.length === 1 ? 'is' : 'are'} not in the symbol key.`,
      explanation: `Use only the letters in the key: ${ex.key.map((k) => `${k.letter} = "${k.meaning}"`).join('; ')}.`,
      highlight: letterSpans(text, new Set(unknown)),
    };
  }
  const missing = atomsOf(key).filter((a) => !used.includes(a));
  const eq = checkEquivalence(ans, key);

  if (eq.equivalent) {
    const standard = [ex.answer, ...ex.alternatives].map((s) => canon(f(s)));
    const details: string[] = [];
    if (missing.length) details.push(`Your formula doesn't mention ${joinList(missing.map((a) => keyLabel(ex.key, a)))}. It happens to be equivalent, but a faithful symbolization keeps every clause of the sentence.`);
    if (standard.includes(canon(ans))) {
      return { correct: true, severity: missing.length ? 'info' : 'success', code: 'correct', headline: 'Correct!', explanation: ex.explanation, details: details.length ? details : undefined };
    }
    details.unshift(`The standard symbolization is ${ex.answer}. Both are true in exactly the same rows of the truth table, so either is accepted.`);
    return { correct: true, severity: 'info', code: 'equivalent-nonstandard', headline: 'Correct — equivalent, though not the most direct symbolization.', explanation: ex.explanation, details };
  }

  // Wrong: find out why.
  const v = eq.differingValuation!;
  const row = `If ${describeValuation(v, ex.key)}, the sentence is ${trueFalse(evaluate(key, v))}, but your formula is ${trueFalse(evaluate(ans, v))}.`;
  const m = findMutation(key, ans);
  let fb: Feedback;
  if (m) {
    const msg = mutationMessage(m, ex);
    fb = { correct: false, severity: 'error', code: m.code, headline: msg.headline, explanation: msg.explanation, details: [...msg.details, row] };
  } else if (!acceptedMains(ex).includes(mainConnective(ans))) {
    const k = mainConnective(key);
    fb = {
      correct: false,
      severity: 'error',
      code: 'wrong-main-connective',
      headline: acceptedMains(ex).length > 1 ? `Wrong main connective for this sentence.` : `Wrong main connective: the sentence as a whole is a ${CONNECTIVE_NAME[k]}.`,
      explanation: `${mainDescription(ex)} Your formula's main connective is the ${CONNECTIVE_NAME[mainConnective(ans)]}. ${notesFor(ex.tags, 1).join(' ')}`.trim(),
      details: [row],
    };
  } else {
    fb = {
      correct: false,
      severity: 'error',
      code: 'not-equivalent',
      headline: 'Your main connective can work here, but a part is symbolized incorrectly.',
      explanation: `Compare each part of your formula with the matching clause of the sentence. ${notesFor(ex.tags, 1).join(' ')}`.trim(),
      details: [row],
    };
  }
  if (missing.length) fb.details!.push(`Your formula doesn't mention ${joinList(missing.map((a) => keyLabel(ex.key, a)))} — every clause of the sentence should appear.`);
  fb.valuation = v;
  return fb;
}

// ---------------------------------------------------------------------------
// Hints & solution
// ---------------------------------------------------------------------------

function skeleton(g: Formula): string {
  const masked = (x: Formula): Formula =>
    x.kind === 'atom' ? { kind: 'atom', name: '□' } : x.kind === 'not' ? N(masked(x.operand)) : isBinary(x) ? B(x.kind, masked(x.left), masked(x.right)) : x;
  return format(masked(g));
}

export function symbolizationHints(ex: SymbolizationExercise): string[] {
  const key = f(ex.answer);
  const k = mainConnective(key);
  const hints: string[] = [];
  hints.push(
    k === 'atom'
      ? 'There are no connective words here: the answer is a single sentence letter.'
      : `Start with the main connective. Which connective word governs the whole sentence? (Here ${MAIN_CUE[k]}.)`,
  );
  const notes = notesFor(ex.tags);
  if (notes.length) hints.push(notes.join(' '));
  if (k !== 'atom') hints.push(mainDescription(ex));
  if (atomsOf(key).length > 1 || key.kind !== 'atom') hints.push(`Your formula should have this shape (fill in letters from the key): ${skeleton(key)}`);
  return hints;
}

export function symbolizationSolution(ex: SymbolizationExercise): Solution {
  const alts = ex.alternatives.length ? ` Also accepted: ${ex.alternatives.join(';  ')}.` : '';
  return {
    answer: ex.answer,
    summary: `${ex.answer}.${alts} ${ex.explanation}`,
    steps: [
      `Key: ${ex.key.map((k) => `${k.letter} = "${k.meaning}"`).join('; ')}.`,
      `Main connective: ${CONNECTIVE_NAME[mainConnective(f(ex.answer))]}.`,
      ...notesFor(ex.tags),
    ],
  };
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

interface Phrase {
  text: string;
  f: Formula;
}

type Template = { d: Difficulty; tags: string[]; n: number; build: (p: Phrase[], rng: Rng) => { s: string; f: Formula } };

const I = (l: Formula, r: Formula) => B('implies', l, r);
const A = (l: Formula, r: Formula) => B('and', l, r);
const O = (l: Formula, r: Formula) => B('or', l, r);
const E = (l: Formula, r: Formula) => B('iff', l, r);

/** "A and B" / "either A or B" / "neither…" compound phrases for nesting. */
function compound(a: Phrase, b: Phrase, rng: Rng): Phrase {
  return pick(rng, [
    { text: `${a.text} and ${b.text}`, f: A(a.f, b.f) },
    { text: `both ${a.text} and ${b.text}`, f: A(a.f, b.f) },
    { text: `either ${a.text} or ${b.text}`, f: O(a.f, b.f) },
  ]);
}

const TEMPLATES: Template[] = [
  // d1
  { d: 1, tags: ['simple'], n: 1, build: ([a]) => ({ s: `${a.text}.`, f: a.f }) },
  { d: 1, tags: ['negation'], n: 1, build: ([a]) => ({ s: `It is not the case that ${a.text}.`, f: N(a.f) }) },
  { d: 1, tags: ['conjunction'], n: 2, build: ([a, b]) => ({ s: `${a.text} and ${b.text}.`, f: A(a.f, b.f) }) },
  { d: 1, tags: ['disjunction'], n: 2, build: ([a, b]) => ({ s: `${a.text} or ${b.text}.`, f: O(a.f, b.f) }) },
  { d: 1, tags: ['conditional'], n: 2, build: ([a, b]) => ({ s: `If ${a.text}, then ${b.text}.`, f: I(a.f, b.f) }) },
  // d2
  { d: 2, tags: ['conjunction'], n: 2, build: ([a, b]) => ({ s: `${a.text}, but ${b.text}.`, f: A(a.f, b.f) }) },
  { d: 2, tags: ['conjunction'], n: 2, build: ([a, b]) => ({ s: `Although ${a.text}, ${b.text}.`, f: A(a.f, b.f) }) },
  { d: 2, tags: ['conjunction'], n: 2, build: ([a, b]) => ({ s: `${a.text}; however, ${b.text}.`, f: A(a.f, b.f) }) },
  { d: 2, tags: ['disjunction'], n: 2, build: ([a, b]) => ({ s: `Either ${a.text} or ${b.text}.`, f: O(a.f, b.f) }) },
  { d: 2, tags: ['conditional', 'if-after'], n: 2, build: ([a, b]) => ({ s: `${b.text} if ${a.text}.`, f: I(a.f, b.f) }) },
  { d: 2, tags: ['conditional', 'whenever'], n: 2, build: ([a, b]) => ({ s: `Whenever ${a.text}, ${b.text}.`, f: I(a.f, b.f) }) },
  { d: 2, tags: ['conditional', 'provided-that'], n: 2, build: ([a, b]) => ({ s: `${b.text} provided that ${a.text}.`, f: I(a.f, b.f) }) },
  // d3
  { d: 3, tags: ['only-if'], n: 2, build: ([a, b]) => ({ s: `${a.text} only if ${b.text}.`, f: I(a.f, b.f) }) },
  { d: 3, tags: ['only-if'], n: 2, build: ([a, b]) => ({ s: `Only if ${b.text} is it the case that ${a.text}.`, f: I(a.f, b.f) }) },
  { d: 3, tags: ['unless'], n: 2, build: ([a, b]) => ({ s: `${a.text} unless ${b.text}.`, f: O(a.f, b.f) }) },
  { d: 3, tags: ['unless'], n: 2, build: ([a, b]) => ({ s: `Unless ${b.text}, ${a.text}.`, f: O(a.f, b.f) }) },
  { d: 3, tags: ['biconditional'], n: 2, build: ([a, b], rng) => ({ s: `${a.text} ${pick(rng, ['if and only if', 'just in case', 'exactly when'])} ${b.text}.`, f: E(a.f, b.f) }) },
  { d: 3, tags: ['neither-nor'], n: 2, build: ([a, b]) => ({ s: `It is neither the case that ${a.text} nor the case that ${b.text}.`, f: A(N(a.f), N(b.f)) }) },
  { d: 3, tags: ['not-both'], n: 2, build: ([a, b]) => ({ s: `It is not the case that both ${a.text} and ${b.text}.`, f: N(A(a.f, b.f)) }) },
  { d: 3, tags: ['sufficient'], n: 2, build: ([a, b]) => ({ s: `That ${a.text} is sufficient for it to be the case that ${b.text}.`, f: I(a.f, b.f) }) },
  { d: 3, tags: ['necessary'], n: 2, build: ([a, b]) => ({ s: `That ${b.text} is necessary for it to be the case that ${a.text}.`, f: I(a.f, b.f) }) },
  // d4
  { d: 4, tags: ['nested', 'conditional'], n: 3, build: ([a, b, c], rng) => { const x = compound(a, b, rng); return { s: `If ${x.text}, then ${c.text}.`, f: I(x.f, c.f) }; } },
  { d: 4, tags: ['nested', 'conditional'], n: 3, build: ([a, b, c], rng) => { const y = compound(b, c, rng); return { s: `If ${a.text}, then ${y.text}.`, f: I(a.f, y.f) }; } },
  { d: 4, tags: ['nested', 'only-if'], n: 3, build: ([a, b, c]) => ({ s: `${a.text} only if both ${b.text} and ${c.text}.`, f: I(a.f, A(b.f, c.f)) }) },
  { d: 4, tags: ['nested', 'biconditional'], n: 3, build: ([a, b, c]) => ({ s: `${a.text} if and only if both ${b.text} and ${c.text}.`, f: E(a.f, A(b.f, c.f)) }) },
  { d: 4, tags: ['negation-scope', 'conditional'], n: 2, build: ([a, b]) => ({ s: `It is not the case that if ${a.text}, then ${b.text}.`, f: N(I(a.f, b.f)) }) },
  { d: 4, tags: ['nested', 'unless'], n: 3, build: ([a, b, c]) => ({ s: `Unless ${c.text}, both ${a.text} and ${b.text}.`, f: O(A(a.f, b.f), c.f) }) },
  { d: 4, tags: ['nested', 'neither-nor', 'conditional'], n: 3, build: ([a, b, c]) => ({ s: `If ${a.text}, then it is neither the case that ${b.text} nor the case that ${c.text}.`, f: I(a.f, A(N(b.f), N(c.f))) }) },
  // d5
  { d: 5, tags: ['nested', 'conditional', 'unless'], n: 4, build: ([a, b, c, d]) => ({ s: `If ${a.text} and ${b.text}, then ${c.text} unless ${d.text}.`, f: I(A(a.f, b.f), O(c.f, d.f)) }) },
  { d: 5, tags: ['nested', 'provided-that', 'only-if'], n: 3, build: ([a, b, c]) => ({ s: `Provided that ${a.text}, ${b.text} only if ${c.text}.`, f: I(a.f, I(b.f, c.f)) }) },
  { d: 5, tags: ['nested', 'biconditional', 'unless'], n: 3, build: ([a, b, c]) => ({ s: `${a.text} if and only if ${b.text}, unless ${c.text}.`, f: O(E(a.f, b.f), c.f) }) },
  { d: 5, tags: ['nested', 'whenever', 'biconditional'], n: 3, build: ([a, b, c]) => ({ s: `Whenever ${a.text}, ${b.text} if and only if ${c.text}.`, f: I(a.f, E(b.f, c.f)) }) },
  { d: 5, tags: ['nested', 'only-if', 'conditional'], n: 3, build: ([a, b, c]) => ({ s: `If ${a.text} only if ${b.text}, then ${c.text}.`, f: I(I(a.f, b.f), c.f) }) },
  { d: 5, tags: ['nested', 'conjunction', 'conditional'], n: 3, build: ([a, b, c]) => ({ s: `If ${a.text}, then ${b.text}; and if ${b.text}, then ${c.text}.`, f: A(I(a.f, b.f), I(b.f, c.f)) }) },
  { d: 5, tags: ['nested', 'not-both', 'only-if'], n: 3, build: ([a, b, c]) => ({ s: `It is not the case that both ${a.text} and ${b.text}, and ${c.text} only if ${a.text}.`, f: A(N(A(a.f, b.f)), I(c.f, a.f)) }) },
];

/** Generate a fresh symbolization exercise at the given difficulty (deterministic in `seed`). */
export function generateSymbolization(difficulty: Difficulty, seed: number): SymbolizationExercise {
  const rng = makeRng(seed);
  const pool = TEMPLATES.filter((t) => t.d === difficulty);
  const t = pick(rng, pool);
  const letters = Object.keys(VOCABULARY);
  const chosen: SymbolKeyEntry[] = [];
  while (chosen.length < t.n) {
    const e = VOCABULARY[pick(rng, letters)];
    if (!chosen.includes(e)) chosen.push(e);
  }
  const negateP = difficulty === 1 ? 0 : difficulty === 2 ? 0.3 : 0.2;
  let negated = false;
  const phrases: Phrase[] = chosen.map((e) => {
    const neg = t.tags[0] !== 'negation' && t.tags[0] !== 'simple' && rng() < negateP;
    if (neg) negated = true;
    return { text: neg ? e.negation : e.meaning, f: neg ? N({ kind: 'atom', name: e.letter }) : { kind: 'atom', name: e.letter } };
  });
  const out = t.build(phrases, rng);
  const sentence = capitalize(out.s);
  const answer = format(out.f);
  const tags = [...t.tags, ...(negated && !t.tags.includes('negation') ? ['negation'] : [])];
  const key = [...chosen].sort((x, y) => (x.letter < y.letter ? -1 : 1));
  return {
    id: `sym-gen-${hash(`${sentence}|${answer}`)}`,
    kind: 'symbolization',
    topic: 'symbolization',
    difficulty,
    title: titleFor(tags),
    prompt: PROMPT,
    tags,
    source: 'generated',
    sentence,
    key,
    answer,
    // "φ unless ψ" = φ ∨ ψ, equally ¬ψ → φ
    alternatives: t.tags.includes('unless') && out.f.kind === 'or' ? [format(I(N(out.f.right), out.f.left))] : [],
    explanation: notesFor(tags).join(' ') || 'Symbolize each clause with its letter and combine them with the connective the sentence uses.',
  };
}

/** Exposed for tests / tooling. */
export const SYMBOLIZATION_TEMPLATE_COUNT = TEMPLATES.length;

export function isStandardSymbolization(ex: SymbolizationExercise, g: Formula): boolean {
  return [ex.answer, ...ex.alternatives].some((s) => equals(f(s), g));
}
