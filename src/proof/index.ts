/**
 * Public API of the proof engine. CONTRACT — consumed by UI and learning.
 * OWNER: Proof Engine.
 */
export * from './types';
export { checkDerivation } from './checker';
export { RULES, RULE_LIST, getRule } from './rules';
export { suggestNextStep, suggestClose } from './hints';
