// @vitest-environment node
import { analyze, udViolation } from './checker';
import { draft } from './testUtil';
test('d', () => {
  const d = draft(`
Fx          | PR
Show ∀xFx   | UD 3
  Fx        | R 1
`);
  console.log('D', JSON.stringify(d.lines));
  const an = analyze(d);
  console.log('V', udViolation(an, 1, (s, i) => s < i && i <= an.boxEnd[s]), JSON.stringify(an.formulas));
});
