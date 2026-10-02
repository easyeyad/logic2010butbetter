import type { Formula } from './ast';
import { Atom, equals, isBinary, isPredicateFormula } from './ast';
import type { Valuation } from './evaluate';
import { NotSententialError, atomsOf, compileFormula, subformulas } from './evaluate';
import { format } from './format';

export type Classification = 'tautology' | 'contradiction' | 'contingent';

export interface TruthTableColumn {
  /** The (sub)formula this column evaluates. For atoms, an Atom. */
  formula: Formula;
  /** Display label, e.g. "P ∧ Q". */
  label: string;
  isAtom: boolean;
  /** True for the column(s) of the input formula(s) themselves. */
  isMain: boolean;
  /** Indices (into columns) of this column's immediate subformula columns. */
  dependsOn: number[];
}

export interface TruthTable {
  atoms: string[];
  columns: TruthTableColumn[];
  /** rows[r][c] — row order is standard: first atom T for the top half (TT..., TF..., ... FF). */
  rows: boolean[][];
  valuations: Valuation[];
  /**
   * mainColumns[i] is the column index of input formula i (the same column
   * may appear twice if two inputs are identical or one is a subformula of another).
   */
  mainColumns: number[];
}

/** Maximum number of sentence letters for which a truth table is built (2^10 = 1024 rows). */
export const MAX_TRUTH_TABLE_ATOMS = 10;

/** Maximum number of sentence letters for brute-force checks (classify, validity...). */
export const MAX_BRUTE_FORCE_ATOMS = 16;

/** Truth value of atom `i` (of `n`) in row `r` under the standard row order. */
export function rowValue(r: number, i: number, n: number): boolean {
  return ((r >> (n - 1 - i)) & 1) === 0;
}

/**
 * All valuations of `atoms` in standard order: all-true first, the first atom
 * alternating slowest, the last atom alternating every row.
 */
export function allValuations(atoms: string[]): Valuation[] {
  const n = atoms.length;
  const out: Valuation[] = [];
  for (let r = 0; r < 1 << n; r++) {
    const v: Valuation = {};
    for (let i = 0; i < n; i++) v[atoms[i]] = rowValue(r, i, n);
    out.push(v);
  }
  return out;
}

/**
 * Build a table for one or more formulas (sharing atoms). Columns: atoms first,
 * then each non-atomic subformula (inner first, deduped across formulas),
 * with the input formulas' own columns flagged isMain.
 * Throws if more than 10 atoms, and a NotSententialError if any formula uses
 * predicates or quantifiers.
 */
export function buildTruthTable(formulas: Formula[]): TruthTable {
  assertSentential(formulas);
  const atoms = atomsOf(...formulas);
  const n = atoms.length;
  if (n > MAX_TRUTH_TABLE_ATOMS) {
    throw new Error(
      `Truth tables are limited to ${MAX_TRUTH_TABLE_ATOMS} sentence letters; this one has ${n} (${atoms.join(', ')}).`,
    );
  }

  const columns: TruthTableColumn[] = atoms.map((name) => ({
    formula: Atom(name),
    label: name,
    isAtom: true,
    isMain: false,
    dependsOn: [],
  }));
  const find = (f: Formula): number => columns.findIndex((c) => equals(c.formula, f));

  for (const f of formulas) {
    for (const s of subformulas(f)) {
      if (find(s) >= 0) continue;
      const dependsOn = s.kind === 'not' ? [find(s.operand)] : isBinary(s) ? [find(s.left), find(s.right)] : [];
      columns.push({ formula: s, label: format(s), isAtom: false, isMain: false, dependsOn });
    }
  }
  const mainColumns = formulas.map((f) => {
    const i = find(f);
    columns[i].isMain = true;
    return i;
  });

  const rowCount = 1 << n;
  const rows: boolean[][] = new Array(rowCount);
  const valuations: Valuation[] = new Array(rowCount);
  const m = columns.length;
  for (let r = 0; r < rowCount; r++) {
    const row: boolean[] = new Array(m);
    const v: Valuation = {};
    for (let i = 0; i < n; i++) {
      const b = rowValue(r, i, n);
      row[i] = b;
      v[atoms[i]] = b;
    }
    for (let c = n; c < m; c++) {
      const col = columns[c];
      const d = col.dependsOn;
      switch (col.formula.kind) {
        case 'not':
          row[c] = !row[d[0]];
          break;
        case 'and':
          row[c] = row[d[0]] && row[d[1]];
          break;
        case 'or':
          row[c] = row[d[0]] || row[d[1]];
          break;
        case 'implies':
          row[c] = !row[d[0]] || row[d[1]];
          break;
        case 'iff':
          row[c] = row[d[0]] === row[d[1]];
          break;
        default:
          break;
      }
    }
    rows[r] = row;
    valuations[r] = v;
  }
  return { atoms, columns, rows, valuations, mainColumns };
}

/** Throws NotSententialError if any formula uses predicates or quantifiers. */
export function assertSentential(fs: Formula[]): void {
  if (fs.some(isPredicateFormula)) throw new NotSententialError();
}

/** Shared brute-force driver: calls `visit` for each row (standard order) until it returns false. */
export function forEachRow(atoms: string[], visit: (values: boolean[], row: number) => boolean | void): number {
  const n = atoms.length;
  if (n > MAX_BRUTE_FORCE_ATOMS) {
    throw new Error(`Too many sentence letters to check (${n}); the limit is ${MAX_BRUTE_FORCE_ATOMS}.`);
  }
  const values: boolean[] = new Array(n);
  const total = 1 << n;
  for (let r = 0; r < total; r++) {
    for (let i = 0; i < n; i++) values[i] = rowValue(r, i, n);
    if (visit(values, r) === false) return r + 1;
  }
  return total;
}

export function toValuation(atoms: string[], values: boolean[]): Valuation {
  const v: Valuation = {};
  atoms.forEach((a, i) => (v[a] = values[i]));
  return v;
}

/** Throws NotSententialError for predicate/quantified formulas. */
export function classify(f: Formula): Classification {
  assertSentential([f]);
  const atoms = atomsOf(f);
  const ev = compileFormula(f, atoms);
  let sawT = false;
  let sawF = false;
  forEachRow(atoms, (vs) => {
    if (ev(vs)) sawT = true;
    else sawF = true;
    return !(sawT && sawF);
  });
  return sawT && sawF ? 'contingent' : sawT ? 'tautology' : 'contradiction';
}
