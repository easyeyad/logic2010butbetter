/**
 * Public API of the proof engine. CONTRACT — consumed by UI and learning.
 * OWNER: Proof Engine.
 */
export * from './types';
export { checkDerivation } from './checker';
export { RULES, RULE_LIST, getRule, ruleLabel, INFERENCE_RULE_IDS, DERIVED_RULE_IDS, QUANTIFIER_RULE_IDS, IDENTITY_RULE_IDS } from './rules';
export { suggestNextStep, suggestClose } from './hints';
export type { Hint, HintLine } from './hints';
export { solve } from './solver';
export type { SolveOptions } from './solver';
export { checkRuleApplication } from './ruleCheck';
export type { RuleCheckOptions, RuleCheckResult } from './ruleCheck';
