// @vitest-environment node
import { parseOrThrow } from '../logic/index';
import { checkRuleApplication } from './ruleCheck';
import { ruleLabel } from './rules';
const cases: [string, string[], string][] = [
  ['MP', ['P → Q', 'Q'], 'P'], ['MP', ['P → Q', 'P'], 'R'], ['MP', ['P → Q', '¬Q'], '¬P'], ['MP', ['P → Q', '¬P'], '¬Q'], ['MP', ['P → Q', 'R'], 'Q'], ['MP', ['P ∨ Q', '¬P'], 'Q'], ['MP', ['P ↔ Q', 'P'], 'Q'],
  ['MT', ['P → Q', '¬P'], '¬Q'], ['MT', ['P → Q', '¬Q'], 'P'], ['MT', ['¬P → Q', '¬Q'], 'P'], ['MT', ['P → Q', '¬Q'], 'R'], ['MT', ['P → Q', 'P'], 'Q'], ['MT', ['P → ¬Q', 'Q'], '¬P'], ['MT', ['P → Q', 'Q'], '¬P'], ['MT', ['P → Q', 'R'], '¬P'], ['MT', ['P ∧ Q', 'R'], '¬P'],
  ['DN', ['¬P'], 'P'], ['DN', ['P'], 'P'], ['DN', ['¬¬¬¬P'], 'P'], ['DN', ['P ∧ ¬¬Q'], 'P ∧ Q'], ['DN', ['P'], 'Q'],
  ['R', ['P'], '¬¬P'], ['R', ['P'], 'Q'],
  ['S', ['P ∨ Q'], 'P'], ['S', ['P → Q'], 'P'], ['S', ['P ↔ Q'], 'P'], ['S', ['¬(P ∧ Q)'], '¬P'], ['S', ['(P ∧ Q) ∧ R'], 'P'], ['S', ['P ∧ Q'], 'Q ∧ P'], ['S', ['P ∧ Q'], 'R'],
  ['ADJ', ['P', 'Q'], 'P ∨ Q'], ['ADJ', ['P', 'Q'], 'P ∧ R'],
  ['ADD', ['P'], 'P ∧ Q'], ['ADD', ['P'], 'P → Q'], ['ADD', ['P'], 'Q ∨ R'],
  ['MTP', ['P → Q', '¬Q'], 'P'], ['MTP', ['P ∨ Q', '¬P'], 'R'], ['MTP', ['P ∨ Q', 'P'], 'Q'], ['MTP', ['¬P ∨ Q', 'P'], 'Q'], ['MTP', ['P ∨ Q', 'R'], 'Q'],
  ['BC', ['P → Q'], 'P ↔ Q'], ['BC', ['P → Q'], 'Q → P'], ['BC', ['P ↔ Q'], 'P'],
  ['CB', ['P', 'Q → P'], 'P ↔ Q'], ['CB', ['P → Q', 'Q → R'], 'P ↔ R'], ['CB', ['P → Q', 'Q → P'], 'P ↔ R'],
  ['DM', ['P → Q'], 'P'], ['DM', ['¬(P ∧ Q)'], '¬P ∧ ¬Q'], ['NC', ['¬(P → Q)'], '¬P ∧ Q'], ['NB', ['¬(P ↔ Q)'], '¬P ↔ ¬Q'], ['CDJ', ['P → Q'], 'P ∨ ¬Q'],
  ['SC', ['P', 'Q', 'R'], 'R'], ['SC', ['P ∨ Q', 'P → R', 'S'], 'R'], ['SC', ['P ∨ Q', 'P → R', 'Q → S'], 'R'], ['SC', ['P ∨ Q', 'R → S', 'T → S'], 'S'], ['SC', ['P → R', 'Q → R'], 'R'],
  ['MP', ['P → Q', 'P', 'R'], 'Q'], ['S', ['P', 'Q'], 'P ∧ Q'],
];
test('audit', () => {
  for (const [r, c, x] of cases) {
    const res = checkRuleApplication(r as any, c.map(parseOrThrow), parseOrThrow(x), { allowDerivedRules: true });
    console.log("MSG", res.message); const bad = res.ok || !res.message!.includes(ruleLabel(r)) || !res.suggestion || !/^Line \d/.test(res.message!);
    if (bad) console.log(`AUDIT ${r} ${c.join(' ; ')} ⊢ ${x}\n   ${res.ok ? 'OK?!' : res.message}\n   -> ${res.suggestion}`);
  }
});
