import type { Formula } from './ast';

/** Half-open character range [start, end) into the ORIGINAL input string. */
export interface Span { start: number; end: number }

export type ParseErrorCode =
  | 'empty'
  | 'unexpected-char'        // e.g. '#', lowercase letter used as atom
  | 'invalid-atom'           // e.g. 'p' or 'PQ' run together
  | 'missing-operand'        // '→ Q', 'P ∧', '¬'
  | 'missing-connective'     // 'P Q', '(P)(Q)'
  | 'unbalanced-open'        // '(P ∧ Q'
  | 'unbalanced-close'       // 'P ∧ Q)'
  | 'mismatched-bracket'     // '(P ∧ Q]'
  | 'empty-parens'           // '()'
  | 'ambiguous'              // 'P ∧ Q ∨ R' — needs parentheses
  | 'misplaced-connective';  // 'P ¬ Q', '∧ P'

export interface ParseError {
  code: ParseErrorCode;
  /** Student-facing explanation, e.g. "→ requires a formula on both sides." */
  message: string;
  /** Exact offending region of the ORIGINAL input (for highlighting). */
  span: Span;
  /** Optional actionable suggestion, e.g. "Add parentheses: (P ∧ Q) ∨ R". */
  hint?: string;
}

export type ParseResult =
  | { ok: true; formula: Formula; normalized: string }
  | { ok: false; error: ParseError; normalized: string };

/**
 * Rewrite ASCII shortcuts into canonical symbols (~ → ¬, & → ∧, | → ∨,
 * -> → →, <-> → ↔ ...). Used live by formula inputs while typing.
 * Must be idempotent. Returns the new string and a mapping so a caret
 * position in the old string can be moved to the new one.
 */
export function normalizeInput(_input: string, _caret?: number): { text: string; caret: number } {
  throw new Error('not implemented');
}

/** Parse a formula. Never throws. Spans refer to the input as given. */
export function parse(_input: string): ParseResult {
  throw new Error('not implemented');
}

/** Parse or throw (for tests / trusted internal data). */
export function parseOrThrow(_input: string): Formula {
  throw new Error('not implemented');
}
