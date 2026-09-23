import type { Formula } from './ast';

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
}

/** A random well-formed formula (for tests and exercise generators). */
export function randomFormula(opts: RandomFormulaOptions = {}): Formula {
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
