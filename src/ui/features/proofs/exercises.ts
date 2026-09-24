import { DERIVATION_EXERCISES, QUANTIFIER_DERIVATION_EXERCISES, type DerivationExercise } from '../../../learning';

/** Every curated derivation: sentential levels first, then quantifier problems. */
export const ALL_DERIVATIONS: DerivationExercise[] = [...DERIVATION_EXERCISES, ...(QUANTIFIER_DERIVATION_EXERCISES ?? [])];
