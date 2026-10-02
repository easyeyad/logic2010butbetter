import type { Formula, Term } from './ast';

/** Deterministic PRNG (mulberry32) returning floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RandomFormulaOptions {
  /** Sentence letters to draw from (default P, Q, R). */
  atoms?: string[];
  /** Maximum nesting depth (default 4). */
  maxDepth?: number;
  /** Source of randomness (default Math.random). */
  random?: () => number;
  /**
   * Generate a predicate-logic SENTENCE instead: monadic predicates F, G, H,
   * a binary R, identities (t = t, t ≠ t), names a, b, and 1–`maxQuantifiers` (default 2) quantifiers over x, y
   * (the outermost node is always a quantifier). `atoms` is ignored.
   */
  predicate?: boolean;
  maxQuantifiers?: number;
}

/** A random well-formed formula (for tests and exercise generators). */
export function randomFormula(opts: RandomFormulaOptions = {}): Formula {
  if (opts.predicate) return randomPredicateFormula(opts);
  const atoms = opts.atoms ?? ['P', 'Q', 'R'];
  const rnd = opts.random ?? Math.random;
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const go = (depth: number): Formula => {
    if (depth <= 0 || rnd() < 0.25) return { kind: 'atom', name: pick(atoms) };
    const k = pick(['not', 'and', 'or', 'implies', 'iff'] as const);
    if (k === 'not') return { kind: 'not', operand: go(depth - 1) };
    return { kind: k, left: go(depth - 1), right: go(depth - 1) };
  };
  return go(opts.maxDepth ?? 4);
}

function randomPredicateFormula(opts: RandomFormulaOptions): Formula {
  const rnd = opts.random ?? Math.random;
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const maxQ = Math.max(1, Math.min(opts.maxQuantifiers ?? 2, 2));
  const vars = ['x', 'y'];
  let quantifiers = 0;
  const term = (bound: string[]): Term =>
    bound.length && rnd() < 0.8 ? { kind: 'var', name: pick(bound) } : { kind: 'name', name: pick(['a', 'b']) };
  const go = (depth: number, bound: string[]): Formula => {
    const free = vars.filter((v) => !bound.includes(v));
    if (free.length && quantifiers < maxQ && rnd() < 0.3) return quant(depth, bound, free[0]);
    if (depth <= 0 || rnd() < 0.3) {
      const r = rnd();
      if (r < 0.15) {
        const id: Formula = { kind: 'identity', left: term(bound), right: term(bound) };
        return rnd() < 0.4 ? { kind: 'not', operand: id } : id;
      }
      if (r < 0.35) return { kind: 'pred', name: 'R', args: [term(bound), term(bound)] };
      return { kind: 'pred', name: pick(['F', 'G', 'H']), args: [term(bound)] };
    }
    const k = pick(['not', 'and', 'or', 'implies', 'iff'] as const);
    if (k === 'not') return { kind: 'not', operand: go(depth - 1, bound) };
    return { kind: k, left: go(depth - 1, bound), right: go(depth - 1, bound) };
  };
  const quant = (depth: number, bound: string[], v: string): Formula => {
    quantifiers++;
    return { kind: rnd() < 0.5 ? 'forall' : 'exists', variable: v, body: go(depth - 1, [...bound, v]) };
  };
  return quant(opts.maxDepth ?? 4, [], 'x');
}
