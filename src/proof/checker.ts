import type { DerivationDraft, DerivationCheck } from './types';

/** Pure, synchronous; must handle 100+ lines in well under 10ms. Never throws. */
export function checkDerivation(_draft: DerivationDraft): DerivationCheck {
  throw new Error('not implemented');
}
