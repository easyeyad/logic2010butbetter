import type { DerivationDraft } from './types';

/**
 * A graded hint for the next move, NOT a full solution. level 1 = strategic
 * nudge ("Your goal is a conditional — try Conditional Derivation"), level 2 =
 * more specific ("Assume P as ASS CD and aim for Q"), level 3 = the concrete
 * next line. Returns null if nothing sensible to suggest.
 */
export function suggestNextStep(_draft: DerivationDraft, _level: 1 | 2 | 3): { message: string; line?: { text: string; rule?: string; refs?: number[] } } | null {
  throw new Error('not implemented');
}

/** If the innermost open show can be closed now, which method and refs. */
export function suggestClose(_draft: DerivationDraft): { showLine: number; method: 'DD' | 'CD' | 'ID'; refs: number[] } | null {
  throw new Error('not implemented');
}
