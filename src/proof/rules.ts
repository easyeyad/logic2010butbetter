import type { RuleInfo } from './types';

/** Keyed by RuleInfo.id. Includes rules, closing methods (DD/CD/ID) and PR/ASS. */
export const RULES: Record<string, RuleInfo> = {};
export const RULE_LIST: RuleInfo[] = [];
export function getRule(id: string): RuleInfo | undefined {
  return RULES[id];
}
