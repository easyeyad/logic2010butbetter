import type { Formula } from './ast';
import { equals } from './ast';

export type Valuation = Record<string, boolean>;

/**
 * Thrown by the sentential tools (evaluate, compileFormula, buildTruthTable,
 * classify, checkValidity, checkEquivalence, checkConsistency) when given a
 * formula with predicates or quantifiers. `message` is student-facing.
 */
export class NotSententialError extends Error {
  readonly code = 'not-sentential';
  constructor(message = 'Truth tables only apply to sentential formulas; use Countermodels for quantified formulas.') {
    super(message);
    this.name = 'NotSententialError';
  }
}

function splitAtom(name: string): [string, number] {
  const letter = name.slice(0, 1);
  const digits = name.slice(1);
  return [letter, digits === '' ? -1 : Number(digits)];
}

/** Comparator for sentence letters: by letter, then numeric suffix (P < P1 < P2 < P10 < Q). */
export function compareAtoms(a: string, b: string): number {
  const [la, na] = splitAtom(a);
  const [lb, nb] = splitAtom(b);
  if (la !== lb) return la < lb ? -1 : 1;
  if (na !== nb) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0; // e.g. "P01" vs "P1"
}

/**
 * Distinct sentence letters, sorted alphabetically by letter, then by numeric
 * suffix (A, B, ..., P, P1, P2, P10, Q, R ...).
 * Only 'atom' nodes count: predications (Fa, Rxy) are skipped and quantifier
 * bodies are searched. Use `predicatesOf` for predicate letters.
 */
export function atomsOf(...fs: Formula[]): string[] {
  const seen = new Set<string>();
  const walk = (f: Formula): void => {
    switch (f.kind) {
      case 'atom':
        seen.add(f.name);
        return;
      case 'pred':
        return;
      case 'not':
        walk(f.operand);
        return;
      case 'forall':
      case 'exists':
        walk(f.body);
        return;
      default:
        walk(f.left);
        walk(f.right);
    }
  };
  fs.forEach(walk);
  return [...seen].sort(compareAtoms);
}

/**
 * Truth value of `f` under `v`. Throws if an atom has no value in `v`, and a
 * NotSententialError for predications/quantifiers (use `evaluateIn`).
 */
export function evaluate(f: Formula, v: Valuation): boolean {
  switch (f.kind) {
    case 'atom': {
      const val = v[f.name];
      if (val === undefined) throw new Error(`No truth value given for sentence letter ${f.name}.`);
      return val;
    }
    case 'not':
      return !evaluate(f.operand, v);
    case 'and':
      return evaluate(f.left, v) && evaluate(f.right, v);
    case 'or':
      return evaluate(f.left, v) || evaluate(f.right, v);
    case 'implies':
      return !evaluate(f.left, v) || evaluate(f.right, v);
    case 'iff':
      return evaluate(f.left, v) === evaluate(f.right, v);
    default:
      throw new NotSententialError();
  }
}

/**
 * Compile a formula into a fast evaluator over a value array indexed like `atoms`.
 * Throws if the formula mentions an atom not in `atoms`; NotSententialError
 * for predications/quantifiers.
 */
export function compileFormula(f: Formula, atoms: string[]): (values: boolean[]) => boolean {
  const index = new Map(atoms.map((a, i) => [a, i] as const));
  const go = (g: Formula): ((vs: boolean[]) => boolean) => {
    switch (g.kind) {
      case 'atom': {
        const i = index.get(g.name);
        if (i === undefined) throw new Error(`Unknown sentence letter ${g.name}.`);
        return (vs) => vs[i];
      }
      case 'not': {
        const a = go(g.operand);
        return (vs) => !a(vs);
      }
      case 'and': {
        const a = go(g.left), b = go(g.right);
        return (vs) => a(vs) && b(vs);
      }
      case 'or': {
        const a = go(g.left), b = go(g.right);
        return (vs) => a(vs) || b(vs);
      }
      case 'implies': {
        const a = go(g.left), b = go(g.right);
        return (vs) => !a(vs) || b(vs);
      }
      case 'iff': {
        const a = go(g.left), b = go(g.right);
        return (vs) => a(vs) === b(vs);
      }
      default:
        throw new NotSententialError();
    }
  };
  return go(f);
}

/**
 * Distinct non-atomic subformulas in evaluation order (inner first, the formula
 * itself last). Duplicates removed by structural equality.
 * Order is a left-to-right post-order traversal keeping first occurrences.
 * Atomic formulas (sentence letters and predications like Fa) are excluded;
 * quantified formulas are included (their bodies first).
 */
export function subformulas(f: Formula): Formula[] {
  const out: Formula[] = [];
  const walk = (g: Formula): void => {
    switch (g.kind) {
      case 'atom':
      case 'pred':
        return;
      case 'not':
        walk(g.operand);
        break;
      case 'forall':
      case 'exists':
        walk(g.body);
        break;
      default:
        walk(g.left);
        walk(g.right);
    }
    if (!out.some((h) => equals(h, g))) out.push(g);
  };
  walk(f);
  return out;
}

/** Number of connectives and quantifiers. */
export function complexity(f: Formula): number {
  switch (f.kind) {
    case 'atom':
    case 'pred':
      return 0;
    case 'not':
      return 1 + complexity(f.operand);
    case 'forall':
    case 'exists':
      return 1 + complexity(f.body);
    default:
      return 1 + complexity(f.left) + complexity(f.right);
  }
}

export function mainConnective(f: Formula): Formula['kind'] {
  return f.kind;
}
