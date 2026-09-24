// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkDerivation } from './checker';
import { draft } from './testUtil';
import type { DerivationCheck } from './types';

function issuesOf(c: DerivationCheck, line: number) {
  return c.lines[line - 1].issues;
}
function codesOf(c: DerivationCheck, line: number) {
  return issuesOf(c, line).map((i) => i.code);
}
function expectComplete(c: DerivationCheck) {
  const errs = c.lines.flatMap((l) => l.issues.filter((i) => i.severity === 'error').map((i) => i.message));
  expect(errs).toEqual([]);
  expect(c.valid).toBe(true);
  expect(c.complete).toBe(true);
}

describe('valid derivations', () => {
  it('MP chain', () => {
    const c = checkDerivation(
      draft(
        `
P → Q   | PR
Q → R   | PR
P       | PR
Show R  | DD 6
  Q     | MP 1,3
  R     | MP 2,5
`,
        { goal: 'R' },
      ),
    );
    expectComplete(c);
    expect(c.lines[4].justification).toBe('MP 1,3');
    expect(c.lines[3].justification).toBe('DD 6');
    expect(c.lines[3].showStatus).toBe('closed');
    expect(c.lines[4].boxed).toBe(true);
    expect(c.lines[3].boxed).toBe(false);
    expect(c.lines[5].dependsOn).toEqual([1, 2, 3]);
    expect(c.lines[3].dependsOn).toEqual([1, 2, 3]);
    expect(c.summary).toMatch(/complete/i);
  });

  it('refs in any order', () => {
    const c = checkDerivation(draft(`
P → Q  | PR
P      | PR
Show Q | DD 4
  Q    | MP 2,1
`));
    expectComplete(c);
  });

  it('hypothetical syllogism via CD', () => {
    const c = checkDerivation(
      draft(
        `
P → Q       | PR
Q → R       | PR
Show P → R  | CD 6
  P         | ASS CD
  Q         | MP 1,4
  R         | MP 2,5
`,
        { goal: 'P → R' },
      ),
    );
    expectComplete(c);
    expect(c.lines[3].justification).toBe('ASS CD');
    expect(c.lines[5].dependsOn).toEqual([1, 2, 4]);
    // CD discharges the assumption.
    expect(c.lines[2].dependsOn).toEqual([1, 2]);
  });

  it('¬¬P ⊢ P', () => {
    const c = checkDerivation(draft(`
¬¬P    | PR
Show P | DD 3
  P    | DN 1
`, { goal: 'P' }));
    expectComplete(c);
  });

  it('DN in the other direction', () => {
    const c = checkDerivation(draft(`
P       | PR
Show ¬¬P | DD 3
  ¬¬P   | DN 1
`, { goal: '¬¬P' }));
    expectComplete(c);
  });

  it('contraposition P → Q ⊢ ¬Q → ¬P via CD + MT', () => {
    const c = checkDerivation(draft(`
P → Q        | PR
Show ¬Q → ¬P | CD 4
  ¬Q         | ASS CD
  ¬P         | MT 1,3
`, { goal: '¬Q → ¬P' }));
    expectComplete(c);
  });

  it('proof by ID (P → Q, P → ¬Q ⊢ ¬P) with ψ-form assumption', () => {
    const c = checkDerivation(draft(`
P → Q     | PR
P → ¬Q    | PR
Show ¬P   | ID 5,6
  P       | ASS ID
  Q       | MP 1,4
  ¬Q      | MP 2,4
`, { goal: '¬P' }));
    expectComplete(c);
    expect(c.lines[2].dependsOn).toEqual([1, 2]);
  });

  it('ID with the ¬φ form of assumption (¬¬¬P for Show ¬P)', () => {
    const c = checkDerivation(draft(`
¬P       | PR
Show ¬P  | ID 1,3
  ¬¬P    | ASS ID
`));
    // cites line 1 which is outside the box → error
    expect(codesOf(c, 2)).toContain('close-ref-outside-box');
    const c2 = checkDerivation(draft(`
¬P        | PR
Show ¬P   | ID 4,5
  ¬¬P     | ASS ID
  P       | DN 3
  ¬P      | R 1
`));
    expectComplete(c2);
  });

  it('nested CD inside CD (exportation)', () => {
    const c = checkDerivation(draft(`
(P ∧ Q) → R        | PR
Show P → (Q → R)   | CD 4
  P                | ASS CD
  Show Q → R       | CD 7
    Q              | ASS CD
    P ∧ Q          | ADJ 3,5
    R              | MP 1,6
`, { goal: 'P → (Q → R)' }));
    expectComplete(c);
    expect(c.lines[4].boxed).toBe(true);
    expect(c.lines[3].boxed).toBe(true); // inside the closed outer box
    expect(c.lines[6].dependsOn).toEqual([1, 3, 5]);
    expect(c.lines[3].dependsOn).toEqual([1, 3]);
    expect(c.lines[1].dependsOn).toEqual([1]);
  });

  it('biconditional via two CDs and CB', () => {
    const c = checkDerivation(draft(`
P ∧ Q         | PR
Show P ↔ Q    | DD 9
  Show P → Q  | CD 5
    P         | ASS CD
    Q         | S 1
  Show Q → P  | CD 8
    Q         | ASS CD
    P         | S 1
  P ↔ Q       | CB 3,6
`, { goal: 'P ↔ Q' }));
    expectComplete(c);
  });

  it('a 20+ line proof with every primitive rule', () => {
    const c = checkDerivation(draft(`
(A ∧ B) ∨ C          | PR
¬C                   | PR
A ↔ D                | PR
D → (E ∨ F)          | PR
¬F                   | PR
Show (E ∧ B) ∧ (D ∨ G) | DD 22
  A ∧ B              | MTP 1,2
  A                  | S 7
  B                  | S 7
  A → D              | BC 3
  D                  | MP 10,8
  E ∨ F              | MP 4,11
  E                  | MTP 12,5
  E ∧ B              | ADJ 13,9
  D ∨ G              | ADD 11
  ¬¬A                | DN 8
  A                  | DN 16
  Show ¬¬D           | ID 19,20
    ¬D               | ASS ID
    D                | R 11
    ¬D               | R 19
  (E ∧ B) ∧ (D ∨ G)  | ADJ 14,15
Show D ↔ A           | DD 28
  D → A              | BC 3
  A → D              | BC 3
  Show ¬C → ¬C       | CD 27
    ¬C               | ASS CD
  D ↔ A              | CB 24,25
`));
    expectComplete(c);
    expect(c.lines.length).toBeGreaterThanOrEqual(20);
    // Line 20 (R 11) depends on premises only; line 19 is the ID assumption.
    expect(c.lines[19].dependsOn).toEqual([1, 2, 3]);
    expect(c.lines[17].dependsOn).toEqual([1, 2, 3]);
  });

  it('MT with negated antecedent concludes ¬¬A', () => {
    const c = checkDerivation(draft(`
¬A → B   | PR
¬B       | PR
Show A   | DD 5
  ¬¬A    | MT 1,2
  A      | DN 4
`));
    expectComplete(c);
  });

  it('derived rules when enabled', () => {
    const c = checkDerivation(
      draft(`
¬(P ∧ Q)         | PR
¬(R ∨ S)         | PR
¬(T → U)         | PR
¬(V ↔ W)         | PR
X → Y            | PR
Z ∨ Y2           | PR
Show ¬P ∨ ¬Q     | DD 8
  ¬P ∨ ¬Q        | DM 1
Show ¬R ∧ ¬S     | DD 10
  ¬R ∧ ¬S        | DM 2
Show T ∧ ¬U      | DD 12
  T ∧ ¬U         | NC 3
Show V ↔ ¬W      | DD 14
  V ↔ ¬W         | NB 4
Show ¬X ∨ Y      | DD 16
  ¬X ∨ Y         | CDJ 5
`,
        { allowDerivedRules: true },
      ),
    );
    expectComplete(c);
  });

  it('separation of cases (SC)', () => {
    const c = checkDerivation(
      draft(`
P ∨ Q   | PR
P → R   | PR
Q → R   | PR
Show R  | DD 5
  R     | SC 3,1,2
`),
      );
    expect(codesOf(c, 5)).toContain('rule-not-allowed');
    const c2 = checkDerivation({ ...draft(`
P ∨ Q   | PR
P → R   | PR
Q → R   | PR
Show R  | DD 5
  R     | SC 3,1,2
`), allowDerivedRules: true });
    expectComplete(c2);
  });

  it('Show prefix in text is tolerated', () => {
    const d = draft(`
P      | PR
Show P | DD 3
  P    | R 1
`);
    d.lines[1].text = 'Show P';
    expectComplete(checkDerivation(d));
  });
});

describe('rule errors — feedback content', () => {
  it('S on a conditional', () => {
    const c = checkDerivation(draft(`
P → Q  | PR
Show P | DD 3
  P    | S 1
`));
    const [iss] = issuesOf(c, 3);
    expect(iss.code).toBe('rule-mismatch');
    expect(iss.message).toContain('Line 3');
    expect(iss.message).toContain('S (Simplification)');
    expect(iss.message).toContain('line 1 (P → Q)');
    expect(iss.message).toContain('conditional, not a conjunction');
    expect(iss.badRefs).toEqual([1]);
    expect(iss.suggestion).toMatch(/MP|MT/);
    expect(c.valid).toBe(false);
    expect(c.complete).toBe(false);
  });

  it('S gives the wrong conjunct', () => {
    const c = checkDerivation(draft(`
P ∧ Q  | PR
Show R | DD 3
  R    | S 1
`));
    expect(issuesOf(c, 3)[0].message).toBe('Line 3: S (Simplification) from line 1 (P ∧ Q) can give P or Q, but you wrote R.');
  });

  it('S used on a disjunction', () => {
    const c = checkDerivation(draft(`
P ∨ Q  | PR
Show P | DD 3
  P    | S 1
`));
    const iss = issuesOf(c, 3)[0];
    expect(iss.message).toContain('disjunction');
    expect(iss.suggestion).toContain('MTP');
  });

  it('S reaching two levels deep', () => {
    const c = checkDerivation(draft(`
(P ∧ Q) ∧ R  | PR
Show P       | DD 3
  P          | S 1
`));
    expect(issuesOf(c, 3)[0].suggestion).toMatch(/S twice/);
  });

  it('MP with a non-antecedent', () => {
    const c = checkDerivation(draft(`
P       | PR
Q → R   | PR
¬Q      | PR
Show R  | DD 5
  R     | MP 2,1
`));
    const iss = issuesOf(c, 5)[0];
    expect(iss.message).toBe('Line 5: MP (Modus Ponens) needs a conditional and its antecedent. Line 2 is Q → R, so the other line must be Q — line 1 is P.');
    expect(iss.badRefs).toEqual([1]);
    expect(iss.suggestion).toMatch(/cite the line that contains Q/i);
  });

  it('MP affirming the consequent', () => {
    const c = checkDerivation(draft(`
P → Q  | PR
Q      | PR
Show P | DD 4
  P    | MP 1,2
`));
    const iss = issuesOf(c, 4)[0];
    expect(iss.message).toContain('MP (Modus Ponens) runs forwards from the antecedent; from P → Q and Q you cannot conclude P');
    expect(iss.message).toContain('affirming the consequent');
  });

  it('MP used where MT applies suggests MT', () => {
    const c = checkDerivation(draft(`
P → Q   | PR
¬Q      | PR
Show ¬P | DD 4
  ¬P    | MP 1,2
`));
    const iss = issuesOf(c, 4)[0];
    expect(iss.code).toBe('rule-mismatch');
    expect(iss.suggestion).toBe('This step is valid by MT (Modus Tollens), not MP.');
  });

  it('MP used where MTP applies suggests MTP', () => {
    const c = checkDerivation(draft(`
P ∨ Q   | PR
¬P      | PR
Show Q  | DD 4
  Q     | MP 1,2
`));
    const iss = issuesOf(c, 4)[0];
    expect(iss.message).toContain('neither line 1 (P ∨ Q) nor line 2 (¬P) is a conditional');
    expect(iss.suggestion).toBe('This step is valid by MTP (Modus Tollendo Ponens), not MP.');
  });

  it('MP right lines, wrong conclusion', () => {
    const c = checkDerivation(draft(`
P → Q  | PR
P      | PR
Show R | DD 4
  R    | MP 1,2
`));
    expect(issuesOf(c, 4)[0].message).toBe('Line 4: MP (Modus Ponens) from line 1 (P → Q) and line 2 (P) gives Q, but you wrote R.');
  });

  it('MT with the wrong negation', () => {
    const c = checkDerivation(draft(`
P → ¬Q  | PR
Q       | PR
Show ¬P | DD 4
  ¬P    | MT 1,2
`));
    const iss = issuesOf(c, 4)[0];
    expect(iss.message).toContain('negation is ¬¬Q — not Q');
    expect(iss.suggestion).toContain('DN');
  });

  it('MT denying the antecedent', () => {
    const c = checkDerivation(draft(`
P → Q   | PR
¬P      | PR
Show ¬Q | DD 4
  ¬Q    | MT 1,2
`));
    expect(issuesOf(c, 4)[0].message).toContain('denying the antecedent');
  });

  it('MT conclusion drops a negation too early', () => {
    const c = checkDerivation(draft(`
¬A → B | PR
¬B     | PR
Show A | DD 4
  A    | MT 1,2
`));
    const iss = issuesOf(c, 4)[0];
    expect(iss.message).toContain('gives ¬¬A');
    expect(iss.suggestion).toContain('DN');
  });

  it('DN removing only one negation', () => {
    const c = checkDerivation(draft(`
¬P     | PR
Show P | DD 3
  P    | DN 1
`));
    expect(issuesOf(c, 3)[0].message).toContain('exactly TWO negation signs');
  });

  it('DN inside a formula', () => {
    const c = checkDerivation(draft(`
P ∧ ¬¬Q    | PR
Show P ∧ Q | DD 3
  P ∧ Q    | DN 1
`));
    expect(issuesOf(c, 3)[0].message).toContain('whole line');
  });

  it('ADD used for a conjunction', () => {
    const c = checkDerivation(draft(`
P          | PR
Q          | PR
Show P ∧ Q | DD 4
  P ∧ Q    | ADD 1
`));
    const iss = issuesOf(c, 4)[0];
    expect(iss.message).toContain('ADD (Addition) builds a disjunction (∨), not a conjunction');
    expect(iss.suggestion).toContain('ADJ');
  });

  it('ADD citing two lines for a conjunction → ref-count with ADJ suggestion', () => {
    const c = checkDerivation(draft(`
P          | PR
Q          | PR
Show P ∧ Q | DD 4
  P ∧ Q    | ADD 1,2
`));
    const iss = issuesOf(c, 4)[0];
    expect(iss.code).toBe('ref-count');
    expect(iss.message).toContain('cites exactly 1 line');
    expect(iss.message).toContain('never a conjunction');
    expect(iss.suggestion).toBe('This step is valid by ADJ (Adjunction), not ADD.');
  });

  it('wrong number of refs: extra line → cite only', () => {
    const c = checkDerivation(draft(`
P → Q  | PR
P      | PR
R      | PR
Show Q | DD 5
  Q    | MP 1,2,3
`));
    const iss = issuesOf(c, 5)[0];
    expect(iss.code).toBe('ref-count');
    expect(iss.message).toBe('Line 5: MP (Modus Ponens) cites exactly 2 lines (a conditional and its antecedent), but you cited 3.');
    expect(iss.suggestion).toBe('Cite only lines 1 and 2.');
  });

  it('missing refs / rule', () => {
    const c = checkDerivation(draft(`
P      | PR
Show P | DD 3
  P    | R
  P    |
`));
    expect(codesOf(c, 3)).toEqual(['missing-refs']);
    expect(codesOf(c, 4)).toEqual(['missing-rule']);
  });

  it('MTP with a disjunct instead of its negation', () => {
    const c = checkDerivation(draft(`
P ∨ Q  | PR
P      | PR
Show Q | DD 4
  Q    | MTP 1,2
`));
    expect(issuesOf(c, 4)[0].message).toContain('NEGATION of one disjunct');
  });

  it('ADJ with a conjunct not cited', () => {
    const c = checkDerivation(draft(`
P          | PR
Q          | PR
Show P ∧ R | DD 4
  P ∧ R    | ADJ 1,2
`));
    const iss = issuesOf(c, 4)[0];
    expect(iss.message).toContain('The conjunct R is not one of the cited lines');
    expect(iss.badRefs).toEqual([2]);
  });

  it('BC used backwards suggests CB', () => {
    const c = checkDerivation(draft(`
P → Q      | PR
Show P ↔ Q | DD 3
  P ↔ Q    | BC 1
`));
    expect(issuesOf(c, 3)[0].suggestion).toContain('CB');
  });

  it('BC on a conditional to get its converse', () => {
    const c = checkDerivation(draft(`
P → Q      | PR
Show Q → P | DD 3
  Q → P    | BC 1
`));
    expect(issuesOf(c, 3)[0].suggestion).toContain('does not give you its converse');
  });

  it('CB with non-converses', () => {
    const c = checkDerivation(draft(`
P → Q      | PR
Q → R      | PR
Show P ↔ Q | DD 4
  P ↔ Q    | CB 1,2
`));
    expect(issuesOf(c, 4)[0].message).toContain('not converses');
  });

  it('DM without flipping the connective', () => {
    const c = checkDerivation(
      draft(`
¬(P ∧ Q)       | PR
Show ¬P ∧ ¬Q   | DD 3
  ¬P ∧ ¬Q      | DM 1
`),
    );
    const d = { ...draft(`
¬(P ∧ Q)       | PR
Show ¬P ∧ ¬Q   | DD 3
  ¬P ∧ ¬Q      | DM 1
`), allowDerivedRules: true };
    expect(codesOf(c, 3)).toContain('rule-not-allowed');
    const iss = issuesOf(checkDerivation(d), 3)[0];
    expect(iss.message).toContain('flips the connective');
    expect(iss.message).toContain('¬P ∨ ¬Q');
  });

  it('unknown rule', () => {
    const d = draft(`
P      | PR
Show P | DD 3
  P    | R 1
`);
    (d.lines[2] as { rule: string }).rule = 'XYZ';
    expect(codesOf(checkDerivation(d), 3)).toEqual(['unknown-rule']);
  });

  it('parse errors reuse the parser message and span', () => {
    const c = checkDerivation(draft(`
P      | PR
Show P | DD 3
  P ∧  | S 1
`));
    const iss = issuesOf(c, 3)[0];
    expect(iss.code).toBe('parse-error');
    expect(iss.message.startsWith('Line 3: ')).toBe(true);
    expect(iss.span).toBeDefined();
    expect(c.lines[2].formula).toBeUndefined();
  });

  it('citing a line with a parse error', () => {
    const c = checkDerivation(draft(`
P ∧    | PR
Show P | DD 3
  P    | S 1
`));
    expect(codesOf(c, 3)).toContain('ref-unparsed');
  });
});

describe('accessibility', () => {
  it('citing an unclosed show line', () => {
    const c = checkDerivation(draft(`
P → Q        | PR
Show P → Q   |
  P          | ASS CD
  Q          | MP 2,3
`));
    const iss = issuesOf(c, 4).find((i) => i.code === 'ref-open-show')!;
    expect(iss.message).toBe("Line 2 is a Show line that hasn't been closed yet, so it can't be used — its formula is what you're trying to prove.");
    expect(iss.badRefs).toEqual([2]);
    expect(c.lines[1].showStatus).toBe('open');
  });

  it('citing a line in a closed box', () => {
    const c = checkDerivation(draft(`
P → Q        | PR
Show P → Q   | CD 4
  P          | ASS CD
  Q          | MP 1,3
Show Q       | DD 6
  Q          | R 4
`));
    const iss = issuesOf(c, 6)[0];
    expect(iss.code).toBe('ref-boxed');
    expect(iss.message).toContain('inside the box of line 2 (Show P → Q), which has been closed');
    expect(c.lines[3].boxed).toBe(true);
    expect(c.lines[2].boxed).toBe(true);
    expect(c.lines[1].boxed).toBe(false);
  });

  it('citing inside a closed box from within the same box is fine', () => {
    const c = checkDerivation(draft(`
P             | PR
Show P ∧ P    | DD 5
  P           | R 1
  P           | R 3
  P ∧ P       | ADJ 3,4
`));
    expectComplete(c);
  });

  it('citing a later line / self / nonexistent', () => {
    const c = checkDerivation(draft(`
P      | PR
Show P | DD 3
  P    | R 4
  P    | R 4
  P    | R 9
`));
    expect(codesOf(c, 3)).toContain('ref-later');
    expect(codesOf(c, 4)).toContain('ref-self');
    expect(codesOf(c, 5)).toContain('ref-out-of-range');
  });

  it('citing a closed show from inside its own box', () => {
    const c = checkDerivation(draft(`
P      | PR
Show P | DD 3
  P    | R 2
`));
    expect(codesOf(c, 3)).toContain('ref-own-show');
  });

  it('citing a line in a box that was exited while open', () => {
    const c = checkDerivation(draft(`
P            | PR
Show Q → P   |
  Q          | ASS CD
Show P       | DD 5
  Q          | R 3
`));
    expect(codesOf(c, 4)).toContain('box-exited-open');
    expect(codesOf(c, 5)).toContain('ref-exited-box');
  });

  it('closed show line is citable after its box', () => {
    const c = checkDerivation(draft(`
P → Q         | PR
Q → R         | PR
Show P → R    | CD 6
  P           | ASS CD
  Q           | MP 1,4
  R           | MP 2,5
Show ¬R → ¬P  | CD 9
  ¬R          | ASS CD
  ¬P          | MT 3,8
`));
    expectComplete(c);
  });
});

describe('structure', () => {
  it('premise after a show', () => {
    const c = checkDerivation(draft(`
Show P |
P      | PR
`));
    expect(codesOf(c, 2)).toContain('premise-misplaced');
  });

  it('premise not among given premises', () => {
    const c = checkDerivation(draft(`
P      | PR
Q      | PR
`, { premises: ['P'] }));
    expect(codesOf(c, 1)).toEqual([]);
    expect(codesOf(c, 2)).toContain('premise-not-given');
  });

  it('depth jump without a show', () => {
    const c = checkDerivation(draft(`
P       | PR
  P     | R 1
`));
    expect(codesOf(c, 2)).toContain('depth-jump');
  });

  it('assumption not first in box', () => {
    const c = checkDerivation(draft(`
P            | PR
Show P → P   |
  P          | R 1
  P          | ASS CD
`));
    expect(codesOf(c, 4)).toContain('assumption-misplaced');
  });

  it('ASS CD must be the antecedent', () => {
    const c = checkDerivation(draft(`
Show P → Q |
  Q        | ASS CD
`));
    const iss = issuesOf(c, 2)[0];
    expect(iss.code).toBe('assumption-wrong-formula');
    expect(iss.message).toContain('assumed the consequent');
  });

  it('ASS CD for a non-conditional', () => {
    const c = checkDerivation(draft(`
Show P ∨ Q |
  P        | ASS CD
`));
    expect(codesOf(c, 2)).toContain('assumption-cd-not-conditional');
  });

  it('ASS ID must be the negation', () => {
    const c = checkDerivation(draft(`
Show P |
  P    | ASS ID
`));
    const iss = issuesOf(c, 2)[0];
    expect(iss.code).toBe('assumption-wrong-formula');
    expect(iss.message).toContain('OPPOSITE');
  });

  it('closing with an open inner show', () => {
    const c = checkDerivation(draft(`
P            | PR
Show P       | DD 4
  Show Q     |
  P          | R 1
`));
    expect(codesOf(c, 2)).toContain('close-open-inner');
  });

  it('closing an empty box', () => {
    const c = checkDerivation(draft(`
Show P       | DD 1
`));
    expect(codesOf(c, 1)).toContain('close-empty-box');
  });

  it('DD closing with the wrong line', () => {
    const c = checkDerivation(draft(`
P ∧ Q   | PR
Show Q  | DD 3
  P     | S 1
  Q     | S 1
`));
    const iss = issuesOf(c, 2)[0];
    expect(iss.code).toBe('close-mismatch');
    expect(iss.suggestion).toContain('Line 4');
  });

  it('CD on a non-conditional', () => {
    const c = checkDerivation(draft(`
P       | PR
Show P  | CD 3
  P     | R 1
`));
    expect(codesOf(c, 2)).toContain('close-cd-not-conditional');
  });

  it('CD without assumption', () => {
    const c = checkDerivation(draft(`
Q          | PR
Show P → Q | CD 3
  Q        | R 1
`));
    expect(codesOf(c, 2)).toContain('close-missing-assumption');
  });

  it('CD citing the wrong line', () => {
    const c = checkDerivation(draft(`
Q          | PR
Show P → Q | CD 3
  P        | ASS CD
  Q        | R 1
`));
    const iss = issuesOf(c, 2)[0];
    expect(iss.code).toBe('close-mismatch');
    expect(iss.suggestion).toContain('Line 4');
  });

  it('close citing a line outside the box', () => {
    const c = checkDerivation(draft(`
P       | PR
Show P  | DD 1
  P     | R 1
`));
    const iss = issuesOf(c, 2)[0];
    expect(iss.code).toBe('close-ref-outside-box');
    expect(iss.suggestion).toContain('R (Repetition)');
  });

  it('close citing a line in a nested box', () => {
    const c = checkDerivation(draft(`
P            | PR
Show P       | DD 4
  Show P     | DD 4
    P        | R 1
`));
    expect(codesOf(c, 2)).toContain('close-ref-inaccessible');
    expect(codesOf(c, 3)).toEqual([]);
  });

  it('ID without contradiction', () => {
    const c = checkDerivation(draft(`
P        | PR
Show P   | ID 3,4
  ¬P     | ASS ID
  ¬¬P    | DN 5
  P      | R 1
`));
    // line 4 cites later line → error, also contradiction check
    expect(codesOf(c, 4)).toContain('ref-later');
    const c2 = checkDerivation(draft(`
P        | PR
Show P   | ID 4,5
  ¬P     | ASS ID
  P      | R 1
  ¬¬P    | DN 4
`));
    const iss = issuesOf(c2, 2)[0];
    expect(iss.code).toBe('close-no-contradiction');
    expect(iss.message).toContain("don't contradict");
  });

  it('ID with a CD assumption', () => {
    const c = checkDerivation(draft(`
Q            | PR
¬Q           | PR
Show P → R   | ID 4,5
  P          | ASS CD
  Q          | R 1
  ¬Q         | R 2
`));
    expect(codesOf(c, 3)).toContain('close-wrong-assumption');
  });

  it('leaving an open box', () => {
    const c = checkDerivation(draft(`
P          | PR
Show P     |
Show P     | DD 4
  P        | R 1
`));
    expect(codesOf(c, 3)).toContain('box-exited-open');
  });

  it('never throws on garbage', () => {
    expect(() => checkDerivation({ lines: [{ id: 'x', kind: 'step', text: 'P', depth: -3, rule: 'MP', refs: [NaN as unknown as number] }] })).not.toThrow();
    expect(() => checkDerivation({} as never)).not.toThrow();
    expect(() => checkDerivation({ lines: [null as never] })).not.toThrow();
  });
});

describe('goal and summary', () => {
  it('incomplete: open show', () => {
    const c = checkDerivation(draft(`
P → Q        | PR
Show P → Q   |
  P          | ASS CD
`, { goal: 'P → Q' }));
    expect(c.valid).toBe(true);
    expect(c.complete).toBe(false);
    expect(c.summary).toMatch(/still open/);
    expect(c.globalIssues.map((i) => i.code)).toEqual(['open-shows', 'goal-not-shown']);
  });

  it('wrong goal shown', () => {
    const c = checkDerivation(draft(`
P       | PR
Show P  | DD 3
  P     | R 1
`, { goal: 'Q' }));
    expect(c.valid).toBe(true);
    expect(c.complete).toBe(false);
    expect(c.globalIssues.some((i) => i.code === 'goal-not-shown')).toBe(true);
  });

  it('goal satisfied by a depth-0 step', () => {
    const c = checkDerivation(draft(`
P ∧ Q  | PR
Q      | S 1
`, { goal: 'Q' }));
    expect(c.complete).toBe(true);
  });

  it('goal parse error', () => {
    const c = checkDerivation({ goal: 'P ∧', lines: [] });
    expect(c.globalIssues[0].code).toBe('goal-parse-error');
    expect(c.valid).toBe(false);
  });

  it('empty derivation', () => {
    const c = checkDerivation({ goal: 'P', lines: [] });
    expect(c.complete).toBe(false);
    expect(c.summary).toContain('Show P');
  });

  it('error summary names lines', () => {
    const c = checkDerivation(draft(`
P → Q  | PR
Show P | DD 3
  P    | S 1
  P    | S 1
`));
    expect(c.summary).toBe('2 lines need attention: lines 3 and 4.');
  });
});

describe('empty lines', () => {
  it('a trailing empty line is info only and does not block completion', () => {
    const d = draft(`
P → Q   | PR
P       | PR
Show Q  | DD 4
  Q     | MP 1,2
`, { goal: 'Q' });
    d.lines.push({ id: 'b', kind: 'step', text: '', depth: 0 });
    const c = checkDerivation(d);
    expect(c.lines[4].issues).toEqual([
      { severity: 'info', code: 'empty-formula', message: 'Line 5 is empty — type a formula or delete it.', target: 'formula' },
    ]);
    expect(c.lines[4].ok).toBe(true);
    expect(c.valid).toBe(true);
    expect(c.complete).toBe(true);
  });

  it('an empty step with no rule/refs is not an error, but blocks completion when not trailing', () => {
    const d2 = draft(`
P → Q   | PR
P       | PR
Show Q  | DD 5
        |
  Q     | MP 1,2
`, { goal: 'Q' });
    d2.lines[3] = { id: 'b', kind: 'step', text: '', depth: 1 };
    const c = checkDerivation(d2);
    expect(c.lines[3].issues.map((i) => i.code)).toEqual(['empty-formula']);
    expect(c.lines[3].issues[0].severity).toBe('info');
    expect(c.valid).toBe(true);
    expect(c.complete).toBe(false);
    expect(c.summary).toBe('Line 4 is empty — type a formula or delete it.');
  });

  it('an empty Show line is info, not an error', () => {
    const c = checkDerivation({ lines: [{ id: 's', kind: 'show', text: '', depth: 0 }] });
    expect(c.valid).toBe(true);
    expect(c.lines[0].issues[0]).toMatchObject({ severity: 'info', code: 'empty-formula' });
  });

  it('citing an empty line is still an error', () => {
    const d = draft(`
P      | PR
Show P |
  P    | R 3
`);
    d.lines.splice(2, 0, { id: 'b', kind: 'step', text: '', depth: 1 });
    d.lines[3].refs = [3];
    expect(checkDerivation(d).lines[3].issues.map((i) => i.code)).toContain('ref-unparsed');
  });
});

describe('message audit', () => {
  it('every error names its line and comes with a suggestion', () => {
    const drafts = [
      `P → Q | PR\nShow P |\n  P | S 1\n  P | MP 1,1\n  Q | MT 1\n  P | FOO 1`,
      `Show P | DD 1`,
      `P | PR\nShow P |\n  P | R 4\n  P | R 3\n  P | R 9\n  P | R 2`,
      `Show P → Q |\n  Q | ASS CD\nShow P | ID 3\n  P | ASS ID\nP | PR`,
      `P | PR\n    P | R 1\nShow Q | CD 4\n  Q | ID 1`,
      `P ∧ | PR\nShow P |\n  P | S 1`,
      `P → Q | PR\nShow P → Q | CD 3,1\n  P | ASS CD`,
      `P | PR\nShow P | ID 3,4\n  ¬P | ASS ID\n  ¬¬P | DN 3`,
      `P | PR\nShow P | DD 4\n  Show P |\n    P | R 1`,
      `P | PR\nShow ¬¬P | DD 3\n  ¬¬P | DM 1`,
    ];
    let count = 0;
    for (const src of drafts) {
      const c = checkDerivation(draft(src, { goal: 'P' }));
      for (const l of c.lines)
        for (const i of l.issues.filter((x) => x.severity === 'error')) {
          count++;
          expect(i.message, i.code).toMatch(/^Line \d+/);
          expect(i.suggestion, `${i.code}: ${i.message}`).toBeTruthy();
          if (i.code === 'rule-mismatch' || i.code === 'ref-count') expect(i.message).toMatch(/[A-Z]+ \([A-Z][a-z]/);
        }
    }
    expect(count).toBeGreaterThan(15);
  });
});

describe('performance', () => {
  it('checks a 150-line derivation in < 20ms', () => {
    const rows = ['P → Q | PR', 'P | PR', 'Show Q ∧ Q | DD 150'];
    for (let i = 4; i <= 149; i++) rows.push(i % 2 === 0 ? '  Q | MP 1,2' : `  Q ∧ Q | ADJ ${i - 1},${i - 1}`);
    rows.push('  Q ∧ Q | ADJ 4,4');
    const d = draft(rows.join('\n'));
    expect(d.lines.length).toBe(150);
    checkDerivation(d); // warm-up
    const t0 = performance.now();
    const c = checkDerivation(d);
    const dt = performance.now() - t0;
    expectComplete(c);
    expect(dt).toBeLessThan(20);
  });
});
