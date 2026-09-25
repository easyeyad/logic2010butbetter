/**
 * Predicate-logic toolkit: terms, free variables, substitution, finite
 * interpretations and countermodel search. CONTRACT — the proof engine,
 * learning system and UI code against these signatures.
 *
 * OWNER: Logic Engine.
 */
import type { Formula, Term } from './ast';
import { equals, isPredicateFormula, isQuantified, termEquals } from './ast';
import { atomsOf, compareAtoms } from './evaluate';
import { MAX_BRUTE_FORCE_ATOMS } from './truthTable';
import { checkValidity } from './validity';

// ---------------------------------------------------------------------------
// Symbols
// ---------------------------------------------------------------------------

/** Pre-order walk over every node. */
function walk(f: Formula, visit: (g: Formula) => void): void {
  visit(f);
  switch (f.kind) {
    case 'atom':
    case 'pred':
    case 'identity':
      return;
    case 'not':
      walk(f.operand, visit);
      return;
    case 'forall':
    case 'exists':
      walk(f.body, visit);
      return;
    default:
      walk(f.left, visit);
      walk(f.right, visit);
  }
}

/** The terms of an atomic predication or identity, left to right. */
function termsOf(f: Extract<Formula, { kind: 'pred' | 'identity' }>): Term[] {
  return f.kind === 'pred' ? f.args : [f.left, f.right];
}

/** Variables occurring free in f, in order of first occurrence. */
export function freeVariables(f: Formula): string[] {
  const out: string[] = [];
  const go = (g: Formula, bound: string[]): void => {
    switch (g.kind) {
      case 'atom':
        return;
      case 'pred':
      case 'identity':
        for (const t of termsOf(g)) if (t.kind === 'var' && !bound.includes(t.name) && !out.includes(t.name)) out.push(t.name);
        return;
      case 'not':
        go(g.operand, bound);
        return;
      case 'forall':
      case 'exists':
        go(g.body, [...bound, g.variable]);
        return;
      default:
        go(g.left, bound);
        go(g.right, bound);
    }
  };
  go(f, []);
  return out;
}

function collectTerms(fs: Formula[], kind: Term['kind'], includeQuantVars: boolean): string[] {
  const seen = new Set<string>();
  for (const f of fs) {
    walk(f, (g) => {
      if (g.kind === 'pred' || g.kind === 'identity') for (const t of termsOf(g)) if (t.kind === kind) seen.add(t.name);
      if (includeQuantVars && (g.kind === 'forall' || g.kind === 'exists')) seen.add(g.variable);
    });
  }
  return [...seen].sort(compareAtoms);
}

/** Names (constants a–t) occurring in the formulas, sorted (a, a1, a2, b ...). */
export function namesOf(...fs: Formula[]): string[] {
  return collectTerms(fs, 'name', false);
}

/** Every variable occurring anywhere (free or bound, including vacuous quantifier variables), sorted. */
export function variablesOf(...fs: Formula[]): string[] {
  return collectTerms(fs, 'var', true);
}

/**
 * Predicate letters with their arity, e.g. [{name:'F',arity:1},{name:'R',arity:2}],
 * sorted by name then arity. Sentence letters are arity 0; identity (=) is not
 * listed. Throws nothing; if one
 * letter is used with two arities, both are listed (see `arityConflicts`).
 */
export function predicatesOf(...fs: Formula[]): { name: string; arity: number }[] {
  const seen = new Map<string, { name: string; arity: number }>();
  for (const f of fs) {
    walk(f, (g) => {
      if (g.kind === 'atom') seen.set(`${g.name}/0`, { name: g.name, arity: 0 });
      if (g.kind === 'pred') seen.set(`${g.name}/${g.args.length}`, { name: g.name, arity: g.args.length });
    });
  }
  return [...seen.values()].sort((a, b) => compareAtoms(a.name, b.name) || a.arity - b.arity);
}

/** Letters used with inconsistent arities (e.g. "Fa ∧ Fab"): student-facing error material. */
export function arityConflicts(...fs: Formula[]): { name: string; arities: number[] }[] {
  const by = new Map<string, number[]>();
  for (const p of predicatesOf(...fs)) by.set(p.name, [...(by.get(p.name) ?? []), p.arity]);
  return [...by].filter(([, a]) => a.length > 1).map(([name, arities]) => ({ name, arities }));
}

export function isSentence(f: Formula): boolean {
  return freeVariables(f).length === 0;
}

// ---------------------------------------------------------------------------
// Substitution and matching
// ---------------------------------------------------------------------------

/**
 * Replace free occurrences of variable `v` in f by term t (capture-avoiding:
 * returns null if t is a variable that would be captured by a quantifier in f,
 * i.e. t is not "free for" v in f).
 */
export function substitute(f: Formula, v: string, t: Term): Formula | null {
  const sub = (a: Term): Term => (a.kind === 'var' && a.name === v ? t : a);
  const go = (g: Formula): Formula | null => {
    switch (g.kind) {
      case 'atom':
        return g;
      case 'pred':
        return { kind: 'pred', name: g.name, args: g.args.map(sub) };
      case 'identity':
        return { kind: 'identity', left: sub(g.left), right: sub(g.right) };
      case 'not': {
        const o = go(g.operand);
        return o && { kind: 'not', operand: o };
      }
      case 'forall':
      case 'exists': {
        if (g.variable === v) return g; // v is bound here: no free occurrences inside
        if (t.kind === 'var' && t.name === g.variable && freeVariables(g.body).includes(v)) return null; // capture
        const b = go(g.body);
        return b && { kind: g.kind, variable: g.variable, body: b };
      }
      case 'and':
      case 'or':
      case 'implies':
      case 'iff': {
        const l = go(g.left);
        const r = l && go(g.right);
        return l && r && { kind: g.kind, left: l, right: r };
      }
    }
  };
  return go(f);
}

/**
 * If `instance` is body[t/v] for some single term t (every free occurrence of
 * v in body replaced by the same t, t free for v), return that t. If v does
 * not occur free in body and instance equals body, return 'vacuous'.
 * Otherwise null. Used by UI/EG/EI/UD checking.
 */
export function matchInstance(body: Formula, v: string, instance: Formula): Term | null | 'vacuous' {
  let found: Term | null = null;
  const go = (b: Formula, i: Formula, vBound: boolean): boolean => {
    if (b.kind !== i.kind) return false;
    switch (b.kind) {
      case 'atom':
        return b.name === (i as typeof b).name;
      case 'pred':
      case 'identity': {
        const ii = i as typeof b;
        if (b.kind === 'pred' && (b.name !== (ii as typeof b).name || b.args.length !== (ii as typeof b).args.length)) return false;
        const its = termsOf(ii);
        return termsOf(b).every((a, k) => {
          const x = its[k];
          if (!vBound && a.kind === 'var' && a.name === v) {
            if (found === null) found = x;
            return termEquals(found, x);
          }
          return termEquals(a, x);
        });
      }
      case 'not':
        return go(b.operand, (i as typeof b).operand, vBound);
      case 'forall':
      case 'exists': {
        const ii = i as typeof b;
        return b.variable === ii.variable && go(b.body, ii.body, vBound || b.variable === v);
      }
      default: {
        const ii = i as typeof b;
        return go(b.left, ii.left, vBound) && go(b.right, ii.right, vBound);
      }
    }
  };
  if (!go(body, instance, false)) return null;
  if (found === null) return 'vacuous';
  const t: Term = found;
  const s = substitute(body, v, t);
  return s && equals(s, instance) ? t : null;
}

/**
 * EG is looser than UI: from φ[t] infer ∃x ψ where ψ[t/x] = φ[t] but only SOME
 * occurrences of t need be generalized. Returns true if `instance` can be
 * obtained from `body` by replacing the free occurrences of v by t
 * (t a name or variable free for v) — where t may also occur elsewhere.
 * Also true for a vacuous quantifier whose body equals the instance.
 * False if `quantified` is not a quantified formula.
 */
export function isGeneralizationOf(quantified: Formula, instance: Formula): boolean {
  if (!isQuantified(quantified)) return false;
  return matchInstance(quantified.body, quantified.variable, instance) !== null;
}

/** Equality up to renaming of bound variables. */
export function alphaEquals(a: Formula, b: Formula): boolean {
  const term = (x: Term, y: Term, ea: Map<string, number>, eb: Map<string, number>): boolean => {
    if (x.kind !== y.kind) return false;
    if (x.kind === 'name') return x.name === y.name;
    const bx = ea.get(x.name);
    const by = eb.get(y.name);
    if (bx === undefined && by === undefined) return x.name === y.name;
    return bx === by;
  };
  const go = (x: Formula, y: Formula, ea: Map<string, number>, eb: Map<string, number>, depth: number): boolean => {
    if (x.kind !== y.kind) return false;
    switch (x.kind) {
      case 'atom':
        return x.name === (y as typeof x).name;
      case 'pred': {
        const yy = y as typeof x;
        return x.name === yy.name && x.args.length === yy.args.length && x.args.every((t, k) => term(t, yy.args[k], ea, eb));
      }
      case 'identity': {
        const yy = y as typeof x;
        return term(x.left, yy.left, ea, eb) && term(x.right, yy.right, ea, eb);
      }
      case 'not':
        return go(x.operand, (y as typeof x).operand, ea, eb, depth);
      case 'forall':
      case 'exists': {
        const yy = y as typeof x;
        const na = new Map(ea).set(x.variable, depth);
        const nb = new Map(eb).set(yy.variable, depth);
        return go(x.body, yy.body, na, nb, depth + 1);
      }
      default: {
        const yy = y as typeof x;
        return go(x.left, yy.left, ea, eb, depth) && go(x.right, yy.right, ea, eb, depth);
      }
    }
  };
  return go(a, b, new Map(), new Map(), 0);
}

/**
 * A variable not occurring (free or bound) in any of the formulas. Tries
 * x, y, z, w, u, then x1, y1, z1, w1, u1, x2 ...
 */
export function freshVariable(...fs: Formula[]): string {
  const used = new Set(variablesOf(...fs));
  const letters = ['x', 'y', 'z', 'w', 'u'];
  for (let n = 0; ; n++) {
    for (const l of letters) {
      const cand = n === 0 ? l : `${l}${n}`;
      if (!used.has(cand)) return cand;
    }
  }
}

// ---------------------------------------------------------------------------
// Interpretations
// ---------------------------------------------------------------------------

/**
 * A finite interpretation. Domain elements are 0..size-1 (UI shows them as
 * 1, 2, 3 … or named objects). Every predicate letter maps to its extension:
 * arity 0 → boolean (sentence letter), arity n → list of n-tuples.
 * Every name maps to a domain element. Free variables need `assignment`.
 */
export interface Interpretation {
  domainSize: number;
  names: Record<string, number>;
  predicates: Record<string, { arity: number; extension: number[][] } | { arity: 0; value: boolean }>;
}

/**
 * Truth in an interpretation (variables assigned by `assignment`). Throws if a
 * symbol is uninterpreted. A free variable missing from `assignment` falls back
 * to `m.names` (findModel stores free variables there, treating them as names).
 */
export function evaluateIn(f: Formula, m: Interpretation, assignment: Record<string, number> = {}): boolean {
  const env: Record<string, number> = { ...assignment };
  const val = (t: Term): number => {
    const d = t.kind === 'var' ? (env[t.name] ?? m.names[t.name]) : m.names[t.name];
    if (d === undefined) {
      throw new Error(t.kind === 'var' ? `The variable ${t.name} is free and has no value.` : `The name ${t.name} does not refer to anything in this interpretation.`);
    }
    return d;
  };
  const go = (g: Formula): boolean => {
    switch (g.kind) {
      case 'atom': {
        const p = m.predicates[g.name];
        if (!p) throw new Error(`The sentence letter ${g.name} has no truth value in this interpretation.`);
        return 'value' in p ? p.value : p.extension.length > 0;
      }
      case 'pred': {
        const p = m.predicates[g.name];
        if (!p || 'value' in p) throw new Error(`The predicate ${g.name} is not interpreted.`);
        const vs = g.args.map(val);
        return p.extension.some((e) => e.length === vs.length && e.every((x, k) => x === vs[k]));
      }
      case 'identity':
        return val(g.left) === val(g.right);
      case 'not':
        return !go(g.operand);
      case 'and':
        return go(g.left) && go(g.right);
      case 'or':
        return go(g.left) || go(g.right);
      case 'implies':
        return !go(g.left) || go(g.right);
      case 'iff':
        return go(g.left) === go(g.right);
      case 'forall':
      case 'exists': {
        const saved = Object.hasOwn(env, g.variable) ? env[g.variable] : undefined;
        let result = g.kind === 'forall';
        for (let d = 0; d < m.domainSize; d++) {
          env[g.variable] = d;
          if (go(g.body) !== (g.kind === 'forall')) {
            result = !result;
            break;
          }
        }
        if (saved === undefined) delete env[g.variable];
        else env[g.variable] = saved;
        return result;
      }
    }
  };
  return go(f);
}

export interface ModelSearchResult {
  /** 'found': model satisfies all `trueFormulas` and falsifies all `falseFormulas`. */
  status: 'found' | 'none-up-to-limit' | 'too-large';
  model?: Interpretation;
  /** Largest domain size fully searched. */
  searchedUpTo: number;
  /** Student-facing note, e.g. "No countermodel with up to 4 objects. The argument may be valid — try a derivation." */
  note: string;
}

// ----- grounding -----------------------------------------------------------

/** Ground propositional formula: constant, literal (±atom id), or n-ary node. */
type G = boolean | number | { op: 'and' | 'or'; xs: G[] } | { op: 'iff'; a: G; b: G };

function neg(g: G): G {
  if (typeof g === 'boolean') return !g;
  if (typeof g === 'number') return -g;
  if (g.op === 'iff') return { op: 'iff', a: neg(g.a), b: g.b };
  return { op: g.op === 'and' ? 'or' : 'and', xs: g.xs.map(neg) };
}

function mk(op: 'and' | 'or', parts: G[]): G {
  const unit = op === 'and';
  const xs: G[] = [];
  for (const p of parts) {
    if (p === unit) continue;
    if (p === !unit) return !unit;
    if (typeof p === 'object' && p.op === op) xs.push(...p.xs);
    else xs.push(p);
  }
  if (xs.length === 0) return unit;
  if (xs.length === 1) return xs[0];
  return { op, xs };
}

function mkIff(a: G, b: G): G {
  if (typeof a === 'boolean') return a ? b : neg(b);
  if (typeof b === 'boolean') return b ? a : neg(a);
  return { op: 'iff', a, b };
}

class Timeout {}

class Grounder {
  ids = new Map<string, number>();
  meta: { pred: string; tuple: number[] }[] = [null as never];
  constructor(private n: number, private consts: Record<string, number>, private deadline: number) {}

  atomId(pred: string, tuple: number[]): number {
    const key = `${pred}(${tuple.join(',')})`;
    let id = this.ids.get(key);
    if (id === undefined) {
      id = this.meta.length;
      this.ids.set(key, id);
      this.meta.push({ pred, tuple });
    }
    return id;
  }

  ground(f: Formula, env: Map<string, number>): G {
    switch (f.kind) {
      case 'atom':
        return this.atomId(f.name, []);
      case 'pred':
        return this.atomId(
          f.name,
          f.args.map((t) => (t.kind === 'var' ? (env.get(t.name) ?? this.consts[t.name]) : this.consts[t.name])),
        );
      case 'identity': {
        const tv = (t: Term) => (t.kind === 'var' ? (env.get(t.name) ?? this.consts[t.name]) : this.consts[t.name]);
        return tv(f.left) === tv(f.right);
      }
      case 'not':
        return neg(this.ground(f.operand, env));
      case 'and':
        return mk('and', [this.ground(f.left, env), this.ground(f.right, env)]);
      case 'or':
        return mk('or', [this.ground(f.left, env), this.ground(f.right, env)]);
      case 'implies':
        return mk('or', [neg(this.ground(f.left, env)), this.ground(f.right, env)]);
      case 'iff':
        return mkIff(this.ground(f.left, env), this.ground(f.right, env));
      case 'forall':
      case 'exists': {
        if (performance.now() > this.deadline) throw new Timeout();
        const had = env.has(f.variable);
        const saved = env.get(f.variable);
        const parts: G[] = [];
        for (let d = 0; d < this.n; d++) {
          env.set(f.variable, d);
          parts.push(this.ground(f.body, env));
        }
        if (had) env.set(f.variable, saved!);
        else env.delete(f.variable);
        return mk(f.kind === 'forall' ? 'and' : 'or', parts);
      }
    }
  }
}

// ----- CNF + DPLL ----------------------------------------------------------

class Cnf {
  clauses: number[][] = [];
  unsat = false;
  constructor(public nVars: number) {}

  private fresh(): number {
    return ++this.nVars;
  }

  /** Tseitin literal equivalent to g (g non-constant). */
  enc(g: G): number {
    if (typeof g === 'number') return g;
    if (typeof g === 'boolean') throw new Error('unexpected constant');
    if (g.op === 'iff') {
      const a = this.enc(g.a), b = this.enc(g.b), x = this.fresh();
      this.clauses.push([-x, -a, b], [-x, a, -b], [x, a, b], [x, -a, -b]);
      return x;
    }
    const lits = g.xs.map((h) => this.enc(h));
    const x = this.fresh();
    if (g.op === 'and') {
      for (const l of lits) this.clauses.push([-x, l]);
      this.clauses.push([x, ...lits.map((l) => -l)]);
    } else {
      for (const l of lits) this.clauses.push([x, -l]);
      this.clauses.push([-x, ...lits]);
    }
    return x;
  }

  assert(g: G): void {
    if (g === true) return;
    if (g === false) {
      this.unsat = true;
      return;
    }
    if (typeof g === 'number') this.clauses.push([g]);
    else if (g.op === 'and') g.xs.forEach((h) => this.assert(h));
    else if (g.op === 'or') this.clauses.push(g.xs.map((h) => this.enc(h)));
    else this.clauses.push([this.enc(g)]);
  }
}

/** DPLL with unit propagation over occurrence lists. Returns an assignment (index = var, 1/-1/0) or null. */
function dpll(cnf: Cnf, deadline: number): Int8Array | null {
  if (cnf.unsat) return null;
  const n = cnf.nVars;
  const clauses = cnf.clauses;
  const assign = new Int8Array(n + 1);
  const occ: number[][] = Array.from({ length: 2 * n + 1 }, () => []);
  clauses.forEach((c, i) => c.forEach((l) => occ[l + n].push(i)));
  const trail: number[] = [];
  const litVal = (l: number) => (l > 0 ? assign[l] : -assign[-l]);
  const set = (l: number) => {
    assign[Math.abs(l)] = l > 0 ? 1 : -1;
    trail.push(l);
  };
  const undo = (mark: number) => {
    while (trail.length > mark) assign[Math.abs(trail.pop()!)] = 0;
  };
  /** Propagate from trail position `from`; false on conflict. */
  const propagate = (from: number): boolean => {
    for (let q = from; q < trail.length; q++) {
      const falsified = -trail[q];
      for (const ci of occ[falsified + n]) {
        const c = clauses[ci];
        let unassigned = 0;
        let last = 0;
        let sat = false;
        for (const l of c) {
          const v = litVal(l);
          if (v === 1) {
            sat = true;
            break;
          }
          if (v === 0) {
            unassigned++;
            last = l;
          }
        }
        if (sat) continue;
        if (unassigned === 0) return false;
        if (unassigned === 1) set(last);
      }
    }
    return true;
  };
  for (const c of clauses) {
    if (c.length === 0) return null;
    if (c.length === 1) {
      const v = litVal(c[0]);
      if (v === -1) return null;
      if (v === 0) set(c[0]);
    }
  }
  if (!propagate(0)) return null;
  let steps = 0;
  const search = (): boolean => {
    if ((++steps & 63) === 0 && performance.now() > deadline) throw new Timeout();
    // Branch on a literal of the shortest unsatisfied clause.
    let best: number[] | null = null;
    let bestLen = Infinity;
    for (const c of clauses) {
      let open = 0;
      let sat = false;
      for (const l of c) {
        const v = litVal(l);
        if (v === 1) {
          sat = true;
          break;
        }
        if (v === 0) open++;
      }
      if (!sat && open < bestLen) {
        best = c;
        bestLen = open;
        if (open <= 2) break;
      }
    }
    if (!best) return true;
    const lit = best.find((l) => litVal(l) === 0)!;
    for (const l of [lit, -lit]) {
      const mark = trail.length;
      set(l);
      if (propagate(mark) && search()) return true;
      undo(mark);
    }
    return false;
  };
  return search() ? assign : null;
}

/** Restricted-growth assignments of k constants into a domain of size n (one per isomorphism class). */
function* nameAssignments(k: number, n: number): Generator<number[]> {
  const a: number[] = new Array(k).fill(0);
  function* rec(i: number, max: number): Generator<number[]> {
    if (i === k) {
      yield a.slice();
      return;
    }
    for (let v = 0; v <= Math.min(max + 1, n - 1); v++) {
      a[i] = v;
      yield* rec(i + 1, Math.max(max, v));
    }
  }
  yield* rec(0, -1);
}

function quantDepth(f: Formula): number {
  switch (f.kind) {
    case 'atom':
    case 'pred':
    case 'identity':
      return 0;
    case 'not':
      return quantDepth(f.operand);
    case 'forall':
    case 'exists':
      return 1 + quantDepth(f.body);
    default:
      return Math.max(quantDepth(f.left), quantDepth(f.right));
  }
}

function formulaSize(f: Formula): number {
  let n = 0;
  walk(f, () => n++);
  return n;
}

/** Rough cap on the number of ground nodes per domain size before giving up. */
const MAX_GROUND_SIZE = 400_000;

const objects = (n: number) => `${n} object${n === 1 ? '' : 's'}`;

/**
 * Search for a smallest finite model (domain 1..maxDomain, default 4) making
 * every formula in `trueFormulas` true and every one in `falseFormulas` false.
 * Free variables are treated as names (universally-quantified readings are
 * NOT assumed) and appear in `model.names`. Grounds quantifiers over the
 * domain and runs a DPLL search over ground atoms. Domain sizes are tried in
 * increasing order; name assignments are enumerated up to symmetry.
 *
 * status 'too-large' means the time budget (default 2000 ms) or grounding
 * size was exceeded before a model was found — `searchedUpTo` tells how far
 * the search got — or that a letter is used with inconsistent arities.
 * Predicates not constrained by the formulas get empty extensions (sentence
 * letters: false).
 */
export function findModel(
  trueFormulas: Formula[],
  falseFormulas: Formula[],
  opts?: { maxDomain?: number; timeBudgetMs?: number },
): ModelSearchResult {
  const maxDomain = Math.max(1, opts?.maxDomain ?? 4);
  const deadline = performance.now() + (opts?.timeBudgetMs ?? 2000);
  const all = [...trueFormulas, ...falseFormulas];
  const conflicts = arityConflicts(...all);
  if (conflicts.length) {
    const c = conflicts[0];
    return {
      status: 'too-large',
      searchedUpTo: 0,
      note: `${c.name} is used with different numbers of terms (${c.arities.join(' and ')}); each predicate letter must always take the same number of terms.`,
    };
  }
  const consts = [...namesOf(...all), ...[...new Set(all.flatMap(freeVariables))].sort(compareAtoms)];
  const preds = predicatesOf(...all);
  const size = all.reduce((s, f) => s + formulaSize(f), 0);
  const depth = Math.max(0, ...all.map(quantDepth));

  let searchedUpTo = 0;
  for (let n = 1; n <= maxDomain; n++) {
    if (size * n ** depth > MAX_GROUND_SIZE) {
      return { status: 'too-large', searchedUpTo, note: tooLargeNote(searchedUpTo) };
    }
    try {
      for (const values of nameAssignments(consts.length, n)) {
        const constMap: Record<string, number> = {};
        consts.forEach((c, i) => (constMap[c] = values[i]));
        const gr = new Grounder(n, constMap, deadline);
        const env = new Map<string, number>();
        const trueG = trueFormulas.map((f) => gr.ground(f, env));
        const falseG = falseFormulas.map((f) => neg(gr.ground(f, env)));
        const cnf = new Cnf(gr.meta.length - 1);
        [...trueG, ...falseG].forEach((g) => cnf.assert(g));
        const assign = dpll(cnf, deadline);
        if (!assign) continue;
        const model = buildModel(n, constMap, preds, gr, assign);
        if (!trueFormulas.every((f) => evaluateIn(f, model)) || falseFormulas.some((f) => evaluateIn(f, model))) {
          throw new Error('findModel: internal error (model check failed)');
        }
        return { status: 'found', model, searchedUpTo, note: `Found a model with ${objects(n)}.` };
      }
    } catch (e) {
      if (e instanceof Timeout) return { status: 'too-large', searchedUpTo, note: tooLargeNote(searchedUpTo) };
      throw e;
    }
    searchedUpTo = n;
  }
  return {
    status: 'none-up-to-limit',
    searchedUpTo,
    note: `No model with up to ${objects(searchedUpTo)}.`,
  };
}

function tooLargeNote(searchedUpTo: number): string {
  return searchedUpTo > 0
    ? `The search got too large; no model with up to ${objects(searchedUpTo)}, but larger domains were not checked.`
    : 'The search got too large to finish; try a simpler problem.';
}

function buildModel(
  n: number,
  names: Record<string, number>,
  preds: { name: string; arity: number }[],
  gr: Grounder,
  assign: Int8Array,
): Interpretation {
  const predicates: Interpretation['predicates'] = {};
  for (const { name, arity } of preds) {
    const isTrue = (tuple: number[]) => {
      const id = gr.ids.get(`${name}(${tuple.join(',')})`);
      return id !== undefined && assign[id] === 1;
    };
    if (arity === 0) {
      predicates[name] = { arity: 0, value: isTrue([]) };
      continue;
    }
    const extension: number[][] = [];
    const tuple: number[] = new Array(arity).fill(0);
    for (let k = 0; k < n ** arity; k++) {
      let r = k;
      for (let j = arity - 1; j >= 0; j--) {
        tuple[j] = r % n;
        r = Math.floor(r / n);
      }
      if (isTrue(tuple)) extension.push(tuple.slice());
    }
    predicates[name] = { arity, extension };
  }
  return { domainSize: n, names: { ...names }, predicates };
}

export interface PredicateValidityResult {
  /** 'invalid' = countermodel found; 'no-countermodel-found' = none up to the limit (predicate validity is undecidable in general, so we never claim 'valid' unless the argument is sentential). */
  status: 'invalid' | 'no-countermodel-found' | 'valid';
  countermodel?: Interpretation;
  searchedUpTo: number;
  explanation: string;
}

/**
 * Validity for arguments that may use quantifiers. For purely sentential input
 * this is exact (truth tables, or a domain-1 search beyond 16 letters) and can
 * answer 'valid'; the countermodel then has domainSize 1 and only arity-0 predicates.
 */
export function checkPredicateValidity(premises: Formula[], conclusion: Formula, opts?: { maxDomain?: number }): PredicateValidityResult {
  const all = [...premises, conclusion];
  const sentential = !all.some(isPredicateFormula);
  if (sentential && atomsOf(...all).length <= MAX_BRUTE_FORCE_ATOMS) {
    const r = checkValidity(premises, conclusion);
    if (r.valid) {
      return { status: 'valid', searchedUpTo: 1, explanation: 'Valid: no row of the truth table makes every premise true and the conclusion false.' };
    }
    const predicates: Interpretation['predicates'] = {};
    for (const [k, v] of Object.entries(r.counterexample!)) predicates[k] = { arity: 0, value: v };
    return {
      status: 'invalid',
      countermodel: { domainSize: 1, names: {}, predicates },
      searchedUpTo: 1,
      explanation: 'Invalid: this row of the truth table makes every premise true and the conclusion false.',
    };
  }
  const r = findModel(premises, [conclusion], { maxDomain: sentential ? 1 : opts?.maxDomain });
  if (r.status === 'found') {
    return {
      status: 'invalid',
      countermodel: r.model,
      searchedUpTo: r.searchedUpTo,
      explanation: `Invalid: in this interpretation (${objects(r.model!.domainSize)}) every premise is true and the conclusion is false.`,
    };
  }
  if (sentential && r.status === 'none-up-to-limit') {
    return { status: 'valid', searchedUpTo: 1, explanation: 'Valid: no assignment of truth values makes every premise true and the conclusion false.' };
  }
  return {
    status: 'no-countermodel-found',
    searchedUpTo: r.searchedUpTo,
    explanation:
      r.status === 'too-large'
        ? r.note
        : `No countermodel with up to ${objects(r.searchedUpTo)}. The argument may be valid — try a derivation.`,
  };
}

/**
 * Human description of a model for feedback/UI, e.g.
 * ["Domain: {1, 2}", "a = 1", "F: {1}", "R: {⟨1,2⟩}", "P: true"].
 * Objects are shown 1-based; empty extensions as ∅. Names first, then predicates, each sorted.
 */
export function describeInterpretation(m: Interpretation): string[] {
  const show = (d: number) => String(d + 1);
  const lines = [`Domain: {${Array.from({ length: m.domainSize }, (_, i) => show(i)).join(', ')}}`];
  for (const name of Object.keys(m.names).sort(compareAtoms)) lines.push(`${name} = ${show(m.names[name])}`);
  for (const name of Object.keys(m.predicates).sort(compareAtoms)) {
    const p = m.predicates[name];
    if ('value' in p) {
      lines.push(`${name}: ${p.value ? 'true' : 'false'}`);
      continue;
    }
    const items = p.extension.map((t) => (t.length === 1 ? show(t[0]) : `⟨${t.map(show).join(',')}⟩`));
    lines.push(`${name}: ${items.length ? `{${items.join(', ')}}` : '∅'}`);
  }
  return lines;
}
