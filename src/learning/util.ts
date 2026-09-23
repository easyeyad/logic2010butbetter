/**
 * Small shared helpers: seeded randomness, hashing, and English renderings
 * of truth values used across feedback text.
 *
 * OWNER: Learning System.
 */
import type { Formula, Valuation } from '../logic';
import { atomsOf, evaluate, format, parse, seededRandom } from '../logic';

export type Rng = () => number;

export function makeRng(seed: number): Rng {
  return seededRandom(seed);
}

export function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function pick<T>(rng: Rng, xs: readonly T[]): T {
  return xs[Math.floor(rng() * xs.length)];
}

export function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Choose k distinct elements. */
export function sample<T>(rng: Rng, xs: readonly T[], k: number): T[] {
  return shuffle(rng, xs).slice(0, k);
}

/** Derive a child seed (so generators nest deterministically). */
export function childSeed(rng: Rng): number {
  return Math.floor(rng() * 0x7fffffff);
}

/** Short, stable content hash (FNV-1a, base36). */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export const tf = (b: boolean): string => (b ? 'T' : 'F');
export const trueFalse = (b: boolean): string => (b ? 'true' : 'false');

/** Parse or throw — for curated data that is guaranteed (by tests) to parse. */
export function f(text: string): Formula {
  const r = parse(text);
  if (!r.ok) throw new Error(`Bad formula in learning data: "${text}": ${r.error.message}`);
  return r.formula;
}

export const fmt = (x: Formula): string => format(x);

/** "P = T, Q = F". */
export function formatValuation(v: Valuation, atoms?: string[]): string {
  const letters = atoms ?? Object.keys(v).sort();
  return letters.map((a) => `${a} = ${v[a] === undefined ? '?' : tf(v[a])}`).join(', ');
}

/** "a, b and c". */
export function joinList(items: string[], conj = 'and'): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, ${conj} ${items[items.length - 1]}`;
}

/** Ordinal words for small numbers. */
export function ordinal(n: number): string {
  return ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'][n] ?? `${n}th`;
}

/**
 * Why `g` has the truth value it has under `v`, in one sentence referring to
 * its immediate parts. E.g. "P → Q is F because its antecedent P is T and its
 * consequent Q is F."
 */
export function explainValue(g: Formula, v: Valuation): string {
  const val = evaluate(g, v);
  const s = fmt(g);
  const part = (h: Formula) => `${fmt(h)} is ${tf(evaluate(h, v))}`;
  switch (g.kind) {
    case 'atom':
      return `${s} is ${tf(val)}.`;
    case 'not':
      return `${s} is ${tf(val)} because ${part(g.operand)} — a negation has the opposite value of what it negates.`;
    case 'and':
      if (val) return `${s} is T because both conjuncts are T.`;
      return `${s} is F because ${!evaluate(g.left, v) ? part(g.left) : part(g.right)} — a conjunction needs both conjuncts true.`;
    case 'or':
      if (!val) return `${s} is F because both disjuncts are F.`;
      return `${s} is T because ${evaluate(g.left, v) ? part(g.left) : part(g.right)} — a disjunction needs only one true disjunct.`;
    case 'implies':
      if (!val) return `${s} is F because its antecedent ${part(g.left)} and its consequent ${part(g.right)} — the only way a conditional is false.`;
      if (!evaluate(g.left, v)) return `${s} is T because its antecedent ${part(g.left)} — a conditional with a false antecedent is true.`;
      return `${s} is T because its consequent ${part(g.right)} — a conditional with a true consequent is true.`;
    case 'iff':
      return val
        ? `${s} is T because both sides have the same value (${tf(evaluate(g.left, v))}).`
        : `${s} is F because its sides differ: ${part(g.left)} but ${part(g.right)}.`;
  }
}

/** True iff `v` assigns a boolean to every atom of the formulas. */
export function missingAtoms(v: Valuation, fs: Formula[]): string[] {
  return atomsOf(...fs).filter((a) => typeof v[a] !== 'boolean');
}

/** Levenshtein distance (small strings only). */
export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** Map every atom of `g` through `sub`. */
export function substitute(g: Formula, sub: Record<string, Formula>): Formula {
  switch (g.kind) {
    case 'atom':
      return sub[g.name] ?? g;
    case 'not':
      return { kind: 'not', operand: substitute(g.operand, sub) };
    default:
      return { kind: g.kind, left: substitute(g.left, sub), right: substitute(g.right, sub) };
  }
}

/** Number of connectives. */
export function size(g: Formula): number {
  switch (g.kind) {
    case 'atom':
      return 0;
    case 'not':
      return 1 + size(g.operand);
    default:
      return 1 + size(g.left) + size(g.right);
  }
}

export function depth(g: Formula): number {
  switch (g.kind) {
    case 'atom':
      return 0;
    case 'not':
      return 1 + depth(g.operand);
    default:
      return 1 + Math.max(depth(g.left), depth(g.right));
  }
}
