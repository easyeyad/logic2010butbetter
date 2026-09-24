/**
 * Derivation model — Logic 2010 (Kalish–Montague) style.
 *
 * A derivation is a flat, ordered list of lines. Each line has a `depth`
 * (0 = top level). Subproofs are opened by a SHOW line: "Show φ". The lines
 * after it at depth+1 form its box. The box is closed with a method:
 *
 *   DD (direct):      φ itself is derived on an accessible line inside the box.
 *   CD (conditional): φ = A → B; first box line is "A  ASS CD"; B is derived inside.
 *   ID (indirect):    first box line is "¬φ ASS ID" (or "ψ ASS ID" when φ = ¬ψ);
 *                     some χ and ¬χ are both derived inside.
 *
 * Once closed, the show line becomes an ordinary usable line and every line
 * in its box becomes inaccessible ("boxed"). An unclosed show line is never
 * usable as a premise for a rule.
 *
 * The UI edits `DerivationDraft`; the engine checks it and returns
 * `DerivationCheck`. Line numbers shown to students are 1-based indices
 * into `lines`.
 *
 * OWNER: Proof Engine. UI/learning may import but must not edit.
 */

export type RuleId =
  // Primitive sentential rules (Logic 2010)
  | 'MP' | 'MT' | 'DN' | 'R' | 'S' | 'ADJ' | 'ADD' | 'MTP' | 'BC' | 'CB'
  // Derived sentential rules (Logic 2010 "derived rules"), enabled by settings
  | 'DM' | 'NC' | 'NB' | 'CDJ' | 'SC'
  // Quantifier rules (primitive): universal instantiation, existential
  // generalization, existential instantiation (new variable).
  | 'UI' | 'EG' | 'EI'
  // Derived quantifier rules: quantifier negation, alphabetic variance.
  | 'QN' | 'AV';

/** DD/CD/ID, plus UD (universal derivation) for "Show ∀xφ" boxes. */
export type CloseMethod = 'DD' | 'CD' | 'ID' | 'UD';

export type LineKind =
  | 'premise'     // "PR": only at depth 0 before any other line kind
  | 'show'        // "Show φ": opens a box at depth+1
  | 'assumption'  // "ASS CD" / "ASS ID": must be first line of a show's box
  | 'step';       // derived by a rule from earlier accessible lines

export interface DraftLine {
  /** Stable id (survives inserts/deletes); UI generates it. */
  id: string;
  kind: LineKind;
  /** Raw formula text as typed (will be parsed with logic/parse). */
  text: string;
  depth: number;
  /** For 'step': the rule. */
  rule?: RuleId;
  /** For 'step': referenced 1-based line numbers, as typed. Order matters only for display. */
  refs?: number[];
  /** For 'assumption': which kind. */
  assumption?: 'CD' | 'ID';
  /** For 'show': set when the student closes the box. */
  close?: { method: CloseMethod; refs: number[] };
}

export interface DerivationDraft {
  /** Goal the student must show (text). Optional in free-form mode. */
  goal?: string;
  lines: DraftLine[];
  /** Allow derived rules (DM, NC, NB, CDJ, SC, QN, AV). Default false. */
  allowDerivedRules?: boolean;
  /**
   * Optional: the exercise's given premises (text). When present, every PR
   * line must be one of them ('premise-not-given' otherwise).
   */
  premises?: string[];
}

export type Severity = 'error' | 'warning' | 'info';

/** One piece of student-facing feedback about a line. */
export interface LineIssue {
  severity: Severity;
  /** Stable machine code, e.g. 'rule-mismatch', 'ref-inaccessible', 'parse-error'. */
  code: string;
  /**
   * Full explanation, e.g. "Line 7 is invalid because S (Simplification) can
   * only extract one conjunct from a conjunction, but line 3 is a conditional."
   */
  message: string;
  /** Which part is wrong, for highlighting. */
  target?: 'formula' | 'rule' | 'refs' | 'close' | 'structure';
  /** Offending referenced line numbers, if any. */
  badRefs?: number[];
  /** What would make it valid — must not give away the whole proof. */
  suggestion?: string;
  /** For 'parse-error': the offending character range of the line's text. */
  span?: { start: number; end: number };
}

export interface LineCheck {
  id: string;
  /** 1-based. */
  number: number;
  ok: boolean;
  issues: LineIssue[];
  /** Parsed formula, if parseable. */
  formula?: import('../logic/ast').Formula;
  /**
   * For show lines: 'open' | 'closed'. A closed show line can be cited;
   * an open one cannot.
   */
  showStatus?: 'open' | 'closed';
  /** True if this line sits inside a closed box (no longer citable below it). */
  boxed: boolean;
  /**
   * Dependencies: 1-based numbers of the premises and (still open or
   * discharged) assumptions this line ultimately rests on.
   */
  dependsOn: number[];
  /** Human label for the justification column, e.g. "MP 1,2", "PR", "ASS CD", "CD 4". */
  justification: string;
}

export interface DerivationCheck {
  lines: LineCheck[];
  /** Every line ok, every show closed, and the goal (if any) is the first show line / derived at depth 0. */
  complete: boolean;
  /** No errors so far (may still be incomplete). */
  valid: boolean;
  /** Overall student-facing status sentence. */
  summary: string;
  /** Issues not tied to one line, e.g. "The goal has not been shown yet." */
  globalIssues: LineIssue[];
}

/** Static description of a rule, for the reference panel and rule pickers. */
export interface RuleInfo {
  id: RuleId | CloseMethod | 'PR' | 'ASS';
  name: string;             // "Modus Ponens"
  abbreviation: string;     // "MP"
  derived: boolean;
  category: 'primitive' | 'derived' | 'structural';
  premisesCount: number;    // number of line refs required (0 for structural)
  /** Schematic form, lines of premises and conclusion, e.g. ["φ → ψ", "φ"], "ψ". */
  schema: { from: string[]; to: string };
  /** Worked example with concrete letters. */
  example: { from: string[]; to: string };
  explanation: string;
  requirements: string[];
  /** Common mistakes, used for hints. */
  pitfalls: string[];
}
