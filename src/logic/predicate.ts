/**
 * Predicate-logic toolkit: terms, free variables, substitution, finite
 * interpretations and countermodel search. CONTRACT — the proof engine,
 * learning system and UI code against these signatures.
 *
 * OWNER: Logic Engine.
 */
import type { Formula, Term } from './ast';

/** Variables occurring free in f, in order of first occurrence. */
export function freeVariables(_f: Formula): string[] {
  throw new Error('not implemented');
}

/** Names (constants a–t) occurring in the formulas, sorted. */
export function namesOf(..._fs: Formula[]): string[] {
  throw new Error('not implemented');
}

/** Every variable occurring anywhere (free or bound), sorted. */
export function variablesOf(..._fs: Formula[]): string[] {
  throw new Error('not implemented');
}

/** Predicate letters with their arity, e.g. [{name:'F',arity:1},{name:'R',arity:2}]. Sentence letters are arity 0. Throws nothing; if one letter is used with two arities, both are listed (see `arityConflicts`). */
export function predicatesOf(..._fs: Formula[]): { name: string; arity: number }[] {
  throw new Error('not implemented');
}

/** Letters used with inconsistent arities (e.g. "Fa ∧ Fab"): student-facing error material. */
export function arityConflicts(..._fs: Formula[]): { name: string; arities: number[] }[] {
  throw new Error('not implemented');
}

export function isSentence(f: Formula): boolean {
  return freeVariables(f).length === 0;
}

/**
 * Replace free occurrences of variable `v` in f by term t (capture-avoiding:
 * returns null if t is a variable that would be captured by a quantifier in f,
 * i.e. t is not "free for" v in f).
 */
export function substitute(_f: Formula, _v: string, _t: Term): Formula | null {
  throw new Error('not implemented');
}

/**
 * If `instance` is body[t/v] for some single term t (every free occurrence of
 * v in body replaced by the same t, t free for v), return that t; if v does
 * not occur free in body and instance equals body, return {kind:'var',name:v}
 * (vacuous). Otherwise null. Used by UI/EG/EI/UD checking.
 */
export function matchInstance(_body: Formula, _v: string, _instance: Formula): Term | null | 'vacuous' {
  throw new Error('not implemented');
}

/**
 * EG is looser than UI: from φ[t] infer ∃x ψ where ψ[t/x] = φ[t] but only SOME
 * occurrences of t need be generalized. Returns true if `instance` can be
 * obtained from `body` by replacing the free occurrences of v by t
 * (t a name or variable free for v) — where t may also occur elsewhere.
 */
export function isGeneralizationOf(_quantified: Formula, _instance: Formula): boolean {
  throw new Error('not implemented');
}

/** Equality up to renaming of bound variables. */
export function alphaEquals(_a: Formula, _b: Formula): boolean {
  throw new Error('not implemented');
}

/** A variable (u, w, x, y, z, then x1, y1 …) not occurring in any of the formulas. */
export function freshVariable(..._fs: Formula[]): string {
  throw new Error('not implemented');
}

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

/** Truth in an interpretation (variables assigned by `assignment`). Throws if a symbol is uninterpreted. */
export function evaluateIn(_f: Formula, _m: Interpretation, _assignment?: Record<string, number>): boolean {
  throw new Error('not implemented');
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

/**
 * Search for a smallest finite model (domain 1..maxDomain, default 4) making
 * every formula in `trueFormulas` true and every one in `falseFormulas` false.
 * Free variables are treated as names (universally-quantified readings are
 * NOT assumed). Grounds quantifiers over the domain and runs a backtracking
 * (DPLL-style) search over ground atoms; must answer typical textbook
 * problems (≤ 4 predicates, arity ≤ 2) in well under 500 ms.
 */
export function findModel(_trueFormulas: Formula[], _falseFormulas: Formula[], _opts?: { maxDomain?: number; timeBudgetMs?: number }): ModelSearchResult {
  throw new Error('not implemented');
}

export interface PredicateValidityResult {
  /** 'invalid' = countermodel found; 'no-countermodel-found' = none up to the limit (predicate validity is undecidable in general, so we never claim 'valid' unless the argument is sentential). */
  status: 'invalid' | 'no-countermodel-found' | 'valid';
  countermodel?: Interpretation;
  searchedUpTo: number;
  explanation: string;
}

/** Validity for arguments that may use quantifiers. For purely sentential input delegates to checkValidity and can answer 'valid'. */
export function checkPredicateValidity(_premises: Formula[], _conclusion: Formula, _opts?: { maxDomain?: number }): PredicateValidityResult {
  throw new Error('not implemented');
}

/** Human description of a model for feedback/UI, e.g. ["Domain: {1, 2}", "a = 1", "F: {1}", "R: {⟨1,2⟩}"]. */
export function describeInterpretation(_m: Interpretation): string[] {
  throw new Error('not implemented');
}
