import type { RuleInfo, RuleId } from './types';

/**
 * Reference data for every rule, closing method and structural line type.
 * Written for students: this text is shown verbatim in the reference panel
 * and reused in hints and feedback.
 *
 * OWNER: Proof Engine.
 */
const LIST: RuleInfo[] = [
  // ---------------------------------------------------------------- primitive
  {
    id: 'MP',
    name: 'Modus Ponens',
    abbreviation: 'MP',
    derived: false,
    category: 'primitive',
    premisesCount: 2,
    schema: { from: ['φ → ψ', 'φ'], to: 'ψ' },
    example: { from: ['P → Q', 'P'], to: 'Q' },
    explanation:
      'If you have a conditional and you also have its antecedent (the part before the arrow), you may write down its consequent (the part after the arrow). MP runs the arrow forwards: "if φ then ψ; φ; so ψ."',
    requirements: [
      'Cite exactly two lines: a conditional φ → ψ and a line that is exactly φ.',
      'The conclusion must be exactly ψ, the consequent of the cited conditional.',
      'The conditional must be the main connective of its line — MP does not work on a conditional buried inside a larger formula.',
    ],
    pitfalls: [
      'Affirming the consequent: from P → Q and Q you may NOT conclude P. MP only runs from the antecedent to the consequent.',
      'Using the negated consequent (¬Q) with MP — that is Modus Tollens (MT), and it gives ¬P.',
      'Citing a line that only looks like the antecedent: for (P ∧ R) → Q you need the line P ∧ R itself, not just P.',
      'Using a biconditional directly: from P ↔ Q, first use BC to get P → Q.',
    ],
  },
  {
    id: 'MT',
    name: 'Modus Tollens',
    abbreviation: 'MT',
    derived: false,
    category: 'primitive',
    premisesCount: 2,
    schema: { from: ['φ → ψ', '¬ψ'], to: '¬φ' },
    example: { from: ['P → Q', '¬Q'], to: '¬P' },
    explanation:
      'If a conditional holds and its consequent is false, its antecedent must be false too: "if φ then ψ; not ψ; so not φ." MT runs the arrow backwards, but only with negations.',
    requirements: [
      'Cite exactly two lines: a conditional φ → ψ and a line that is exactly ¬ψ, the negation of its consequent.',
      'The conclusion must be exactly ¬φ, the negation of the antecedent.',
    ],
    pitfalls: [
      'Denying the antecedent: from P → Q and ¬P you may NOT conclude ¬Q.',
      'Wrong negation: for P → ¬Q, the negation of the consequent is ¬¬Q, not Q. Use DN to get ¬¬Q first.',
      'Wrong conclusion form: for ¬P → Q and ¬Q, MT gives ¬¬P; getting P takes a further DN step.',
    ],
  },
  {
    id: 'DN',
    name: 'Double Negation',
    abbreviation: 'DN',
    derived: false,
    category: 'primitive',
    premisesCount: 1,
    schema: { from: ['φ'], to: '¬¬φ   (or from ¬¬φ to φ)' },
    example: { from: ['¬¬P'], to: 'P' },
    explanation:
      'Two negation signs cancel out. DN works in both directions: you may add two ¬ in front of a whole line, or remove two ¬ from the front of a whole line.',
    requirements: [
      'Cite exactly one line.',
      'The conclusion must be the cited line with exactly two ¬ added to the front, or exactly two ¬ removed from the front.',
      'DN applies to the whole line, not to a part of it.',
    ],
    pitfalls: [
      'Removing only one negation: from ¬P you cannot get P (that would change its meaning).',
      'Applying DN inside a formula: from P ∧ ¬¬Q you cannot get P ∧ Q in one step — use S first to extract ¬¬Q.',
      'Removing four negations at once — use DN twice.',
    ],
  },
  {
    id: 'R',
    name: 'Repetition',
    abbreviation: 'R',
    derived: false,
    category: 'primitive',
    premisesCount: 1,
    schema: { from: ['φ'], to: 'φ' },
    example: { from: ['P → Q'], to: 'P → Q' },
    explanation:
      'Copy an accessible line exactly. Useful for bringing a line from outside a box into it, so you can cite it when closing the box.',
    requirements: ['Cite exactly one accessible line.', 'The new line must be identical to it.'],
    pitfalls: [
      'Changing the formula while "repeating" it — R copies exactly, even the order of conjuncts.',
      'Repeating a line from inside a closed box — those lines are no longer available.',
    ],
  },
  {
    id: 'S',
    name: 'Simplification',
    abbreviation: 'S',
    derived: false,
    category: 'primitive',
    premisesCount: 1,
    schema: { from: ['φ ∧ ψ'], to: 'φ   (or ψ)' },
    example: { from: ['P ∧ Q'], to: 'Q' },
    explanation:
      'A conjunction is true only if both conjuncts are true, so from φ ∧ ψ you may write either conjunct on its own.',
    requirements: [
      'Cite exactly one line, whose main connective is ∧.',
      'The conclusion must be exactly its left or its right conjunct.',
    ],
    pitfalls: [
      'Using S on a disjunction: from P ∨ Q you do not know which one is true.',
      'Using S on a conditional or a negated conjunction: ¬(P ∧ Q) is not a conjunction.',
      'Reaching inside: from (P ∧ Q) ∧ R, S gives P ∧ Q or R — you need a second S to get P.',
    ],
  },
  {
    id: 'ADJ',
    name: 'Adjunction',
    abbreviation: 'ADJ',
    derived: false,
    category: 'primitive',
    premisesCount: 2,
    schema: { from: ['φ', 'ψ'], to: 'φ ∧ ψ' },
    example: { from: ['P', 'Q → R'], to: 'P ∧ (Q → R)' },
    explanation:
      'If you have two lines, you may join them with ∧. This is the only way to build a conjunction.',
    requirements: [
      'Cite exactly two lines, one for each conjunct (either order).',
      'The conclusion must be a conjunction whose two conjuncts are exactly the cited lines.',
    ],
    pitfalls: [
      'Citing only one line — each conjunct needs its own line.',
      'Forgetting parentheses: P and Q → R adjoin to P ∧ (Q → R).',
      'Using ADD to build a conjunction — ADD only builds disjunctions.',
    ],
  },
  {
    id: 'ADD',
    name: 'Addition',
    abbreviation: 'ADD',
    derived: false,
    category: 'primitive',
    premisesCount: 1,
    schema: { from: ['φ'], to: 'φ ∨ ψ   (or ψ ∨ φ)' },
    example: { from: ['P'], to: 'P ∨ (Q ∧ R)' },
    explanation:
      'If φ is true, then "φ or anything" is true. From one line you may write a disjunction with that line as one disjunct and any formula you like as the other.',
    requirements: [
      'Cite exactly one line.',
      'The conclusion must be a disjunction, and the cited line must be exactly its left or its right disjunct.',
    ],
    pitfalls: [
      'Using ADD to form a conjunction (∧) — that needs ADJ and a line for each conjunct.',
      'The cited line must appear unchanged as a whole disjunct.',
    ],
  },
  {
    id: 'MTP',
    name: 'Modus Tollendo Ponens',
    abbreviation: 'MTP',
    derived: false,
    category: 'primitive',
    premisesCount: 2,
    schema: { from: ['φ ∨ ψ', '¬φ'], to: 'ψ   (or from ¬ψ, φ)' },
    example: { from: ['P ∨ Q', '¬P'], to: 'Q' },
    explanation:
      'Also called disjunctive syllogism. If at least one of two things is true and one of them is false, the other one is true.',
    requirements: [
      'Cite exactly two lines: a disjunction and the negation of one of its disjuncts.',
      'The conclusion must be exactly the other disjunct.',
    ],
    pitfalls: [
      'Using a disjunct itself instead of its negation: from P ∨ Q and P nothing follows about Q.',
      'Wrong negation: for ¬P ∨ Q, the negation of the left disjunct is ¬¬P, not P. Use DN first.',
    ],
  },
  {
    id: 'BC',
    name: 'Biconditional to Conditional',
    abbreviation: 'BC',
    derived: false,
    category: 'primitive',
    premisesCount: 1,
    schema: { from: ['φ ↔ ψ'], to: 'φ → ψ   (or ψ → φ)' },
    example: { from: ['P ↔ Q'], to: 'Q → P' },
    explanation:
      'A biconditional says each side implies the other. BC lets you take out either of those two conditionals.',
    requirements: [
      'Cite exactly one line whose main connective is ↔.',
      'The conclusion must be one of the two conditionals, in either direction.',
    ],
    pitfalls: [
      'Using a biconditional directly with MP or MT — take out the conditional with BC first.',
      'Going the other way — to build a biconditional from two conditionals, use CB.',
    ],
  },
  {
    id: 'CB',
    name: 'Conditional to Biconditional',
    abbreviation: 'CB',
    derived: false,
    category: 'primitive',
    premisesCount: 2,
    schema: { from: ['φ → ψ', 'ψ → φ'], to: 'φ ↔ ψ' },
    example: { from: ['P → Q', 'Q → P'], to: 'P ↔ Q' },
    explanation:
      'If each side implies the other, they are equivalent. CB combines a conditional and its converse into a biconditional.',
    requirements: [
      'Cite exactly two conditional lines that are converses of each other (φ → ψ and ψ → φ).',
      'The conclusion is φ ↔ ψ (either order of sides).',
    ],
    pitfalls: [
      'The two conditionals must be exact converses; P → Q and Q → R do not give anything.',
      'To prove a biconditional, the usual plan is: Show φ → ψ (CD), Show ψ → φ (CD), then CB.',
    ],
  },
  // ------------------------------------------------------------------ derived
  {
    id: 'DM',
    name: "De Morgan's Laws",
    abbreviation: 'DM',
    derived: true,
    category: 'derived',
    premisesCount: 1,
    schema: { from: ['¬(φ ∧ ψ)'], to: '¬φ ∨ ¬ψ   (also ¬(φ ∨ ψ) ⊣⊢ ¬φ ∧ ¬ψ, both directions)' },
    example: { from: ['¬(P ∨ Q)'], to: '¬P ∧ ¬Q' },
    explanation:
      'Pushing a negation through a conjunction or disjunction flips the connective: "not both" means "at least one is not", and "not either" means "both are not". Works in all four directions: ¬(φ ∧ ψ) ⊣⊢ ¬φ ∨ ¬ψ and ¬(φ ∨ ψ) ⊣⊢ ¬φ ∧ ¬ψ. Also accepted: φ ∧ ψ ⊣⊢ ¬(¬φ ∨ ¬ψ) and φ ∨ ψ ⊣⊢ ¬(¬φ ∧ ¬ψ).',
    requirements: [
      'Cite exactly one line and apply the law to the whole line.',
      'The connective must flip (∧ becomes ∨ and vice versa) and each side must be negated.',
    ],
    pitfalls: [
      'Forgetting to flip the connective: ¬(P ∧ Q) is NOT ¬P ∧ ¬Q.',
      'Applying it to part of a line — work on the whole line.',
      'Derived rule: only available when derived rules are enabled.',
    ],
  },
  {
    id: 'NC',
    name: 'Negation of Conditional',
    abbreviation: 'NC',
    derived: true,
    category: 'derived',
    premisesCount: 1,
    schema: { from: ['¬(φ → ψ)'], to: 'φ ∧ ¬ψ   (and back)' },
    example: { from: ['¬(P → Q)'], to: 'P ∧ ¬Q' },
    explanation:
      'A conditional is false only when its antecedent is true and its consequent is false. So ¬(φ → ψ) and φ ∧ ¬ψ say the same thing; NC goes either way.',
    requirements: ['Cite exactly one line.', 'Convert ¬(φ → ψ) into φ ∧ ¬ψ, or φ ∧ ¬ψ into ¬(φ → ψ).'],
    pitfalls: [
      'Writing ¬φ → ¬ψ or ¬φ ∧ ψ — the antecedent stays un-negated, the consequent gets negated.',
      'Derived rule: only available when derived rules are enabled.',
    ],
  },
  {
    id: 'NB',
    name: 'Negation of Biconditional',
    abbreviation: 'NB',
    derived: true,
    category: 'derived',
    premisesCount: 1,
    schema: { from: ['¬(φ ↔ ψ)'], to: 'φ ↔ ¬ψ   (and back)' },
    example: { from: ['¬(P ↔ Q)'], to: 'P ↔ ¬Q' },
    explanation:
      'Saying two sentences are NOT equivalent is saying one is equivalent to the negation of the other. NB converts ¬(φ ↔ ψ) into φ ↔ ¬ψ and back (¬φ ↔ ψ is also accepted).',
    requirements: ['Cite exactly one line.', 'Convert between ¬(φ ↔ ψ) and φ ↔ ¬ψ.'],
    pitfalls: [
      'Negating both sides: ¬φ ↔ ¬ψ is equivalent to φ ↔ ψ, not to its negation.',
      'Derived rule: only available when derived rules are enabled.',
    ],
  },
  {
    id: 'CDJ',
    name: 'Conditional as Disjunction',
    abbreviation: 'CDJ',
    derived: true,
    category: 'derived',
    premisesCount: 1,
    schema: { from: ['φ → ψ'], to: '¬φ ∨ ψ   (and back; also φ ∨ ψ ⊣⊢ ¬φ → ψ)' },
    example: { from: ['P → Q'], to: '¬P ∨ Q' },
    explanation:
      '"If φ then ψ" is true exactly when φ is false or ψ is true. CDJ converts φ → ψ to ¬φ ∨ ψ and back, and likewise φ ∨ ψ to ¬φ → ψ and back.',
    requirements: ['Cite exactly one line.', 'Only the antecedent / left disjunct changes its negation.'],
    pitfalls: [
      'Negating the wrong side: P → Q is ¬P ∨ Q, not P ∨ ¬Q.',
      'Derived rule: only available when derived rules are enabled.',
    ],
  },
  {
    id: 'SC',
    name: 'Separation of Cases',
    abbreviation: 'SC',
    derived: true,
    category: 'derived',
    premisesCount: 3,
    schema: { from: ['φ ∨ ψ', 'φ → χ', 'ψ → χ'], to: 'χ' },
    example: { from: ['P ∨ Q', 'P → R', 'Q → R'], to: 'R' },
    explanation:
      'Proof by cases: if at least one of φ, ψ holds, and each of them leads to χ, then χ holds either way. The two-case form φ → χ, ¬φ → χ ⊢ χ is also accepted.',
    requirements: [
      'Cite a disjunction and one conditional from each disjunct, all with the same consequent χ (or two conditionals φ → χ and ¬φ → χ).',
      'The conclusion must be exactly χ.',
    ],
    pitfalls: [
      'The two conditionals must lead to the same consequent.',
      'Each conditional’s antecedent must be exactly one of the disjuncts.',
      'Derived rule: only available when derived rules are enabled.',
    ],
  },
  // --------------------------------------------------------------- quantifier
  {
    id: 'UI',
    name: 'Universal Instantiation',
    abbreviation: 'UI',
    derived: false,
    category: 'primitive',
    premisesCount: 1,
    schema: { from: ['∀x φ'], to: 'φ[t/x]   (t any name or variable)' },
    example: { from: ['∀x(Fx → Gx)'], to: 'Fa → Ga' },
    explanation:
      'What holds for everything holds for any particular thing. From ∀x φ you may write φ with EVERY free occurrence of x replaced by one and the same term — a name (a, b, …) or a variable (x, y, …).',
    requirements: [
      'Cite exactly one line whose main connective is ∀ (the quantifier must govern the whole line).',
      'Replace every free occurrence of the quantified variable by the same term, and drop the quantifier.',
      'The term must be free for the variable: a variable may not get captured by another quantifier inside φ.',
    ],
    pitfalls: [
      'Applying UI to a line like ∀xFx → P: its main connective is →, not ∀, so UI does not apply.',
      'Replacing only some occurrences: from ∀x(Fx → Gx) you may not write Fa → Gx.',
      'Confusing UI with EI: an existential ∃xφ needs EI (with a new variable), not UI.',
    ],
  },
  {
    id: 'EG',
    name: 'Existential Generalization',
    abbreviation: 'EG',
    derived: false,
    category: 'primitive',
    premisesCount: 1,
    schema: { from: ['φ[t/x]'], to: '∃x φ' },
    example: { from: ['Fa ∧ Ga'], to: '∃x(Fx ∧ Ga)' },
    explanation:
      'If a particular thing has a property, then something has it. From a line about a term t you may write ∃x φ, where φ has x in place of some (not necessarily all) occurrences of t.',
    requirements: [
      'Cite exactly one line.',
      'The conclusion must be ∃x φ such that replacing x in φ by one term t gives back exactly the cited line.',
      'Occurrences of t you do not generalize stay as they are.',
    ],
    pitfalls: [
      'Generalizing to ∀ instead of ∃ — a universal needs UD (a Show ∀x… box).',
      'Generalizing on two different terms at once: Fa ∧ Gb does not give ∃x(Fx ∧ Gx).',
      'Capturing a variable that should stay free.',
    ],
  },
  {
    id: 'EI',
    name: 'Existential Instantiation',
    abbreviation: 'EI',
    derived: false,
    category: 'primitive',
    premisesCount: 1,
    schema: { from: ['∃x φ'], to: 'φ[y/x]   (y a variable new to the derivation)' },
    example: { from: ['∃x(Fx ∧ Gx)'], to: 'Fy ∧ Gy' },
    explanation:
      'If something has a property, give that thing a temporary label and reason about it. The label must be a VARIABLE that does not occur on any earlier line, so you assume nothing else about it.',
    requirements: [
      'Cite exactly one line whose main connective is ∃.',
      'Replace every free occurrence of the quantified variable by the same variable.',
      'That variable must be new: it may not occur anywhere on an earlier line of the derivation (including premises and Show lines).',
    ],
    pitfalls: [
      'Instantiating to a name: from ∃xFx you may NOT conclude Fa — you do not know the thing is a.',
      'Reusing a variable that already occurs above (the new-variable restriction).',
      'Using UI on an existential, or EI on a universal.',
    ],
  },
  {
    id: 'QN',
    name: 'Quantifier Negation',
    abbreviation: 'QN',
    derived: true,
    category: 'derived',
    premisesCount: 1,
    schema: { from: ['¬∀x φ'], to: '∃x ¬φ   (and ¬∃x φ ⊣⊢ ∀x ¬φ, both directions)' },
    example: { from: ['¬∃x Fx'], to: '∀x ¬Fx' },
    explanation:
      '"Not everything is φ" says the same as "something is not φ", and "nothing is φ" says the same as "everything is not φ". QN moves a negation across a quantifier, flipping ∀ and ∃. Also accepted: ∀x φ ⊣⊢ ¬∃x ¬φ and ∃x φ ⊣⊢ ¬∀x ¬φ.',
    requirements: ['Cite exactly one line and apply QN to the whole line.', 'The quantifier flips (∀ ↔ ∃) as the negation moves across it.'],
    pitfalls: [
      'Forgetting to flip the quantifier: ¬∀x Fx is NOT ∀x ¬Fx.',
      'Derived rule: only available when derived rules are enabled.',
    ],
  },
  {
    id: 'AV',
    name: 'Alphabetic Variance',
    abbreviation: 'AV',
    derived: true,
    category: 'derived',
    premisesCount: 1,
    schema: { from: ['∀x φ'], to: '∀y φ[y/x]   (rename a bound variable)' },
    example: { from: ['∀x(Fx → Gx)'], to: '∀y(Fy → Gy)' },
    explanation: 'Renaming a bound variable consistently does not change what a formula says. AV lets you rewrite a line into an alphabetic variant.',
    requirements: ['Cite exactly one line.', 'Only bound variables may be renamed, consistently, without capturing anything.'],
    pitfalls: ['Renaming a free variable (that changes the meaning).', 'Derived rule: only available when derived rules are enabled.'],
  },
  // ---------------------------------------------------------- closing methods
  {
    id: 'DD',
    name: 'Direct Derivation',
    abbreviation: 'DD',
    derived: false,
    category: 'structural',
    premisesCount: 1,
    schema: { from: ['Show φ', '  …', '  φ'], to: 'close the box: φ is shown' },
    example: { from: ['Show Q', '  …', '  Q   MP 1,2'], to: 'close with DD citing the Q line' },
    explanation:
      'The simplest way to close a Show line: derive its formula directly on a line inside its box, then close the box citing that line.',
    requirements: [
      'Cite one line inside the box (not inside a smaller closed box) whose formula is exactly the Show formula.',
      'Every Show line inside the box must already be closed.',
    ],
    pitfalls: [
      'The cited line must be inside the box; if the formula is on a line above the Show, copy it into the box with R.',
      'Close the innermost open Show line first.',
    ],
  },
  {
    id: 'CD',
    name: 'Conditional Derivation',
    abbreviation: 'CD',
    derived: false,
    category: 'structural',
    premisesCount: 1,
    schema: { from: ['Show φ → ψ', '  φ   ASS CD', '  …', '  ψ'], to: 'close the box: φ → ψ is shown' },
    example: { from: ['Show P → R', '  P   ASS CD', '  …', '  R'], to: 'close with CD citing the R line' },
    explanation:
      'To prove a conditional, assume its antecedent and derive its consequent. The assumption is discharged when the box closes, so the conditional no longer depends on it.',
    requirements: [
      'The Show formula must be a conditional φ → ψ.',
      'The first line of the box must be φ, marked ASS CD.',
      'Cite a line inside the box that is exactly ψ.',
    ],
    pitfalls: [
      'Assuming the consequent instead of the antecedent.',
      'Using CD on a Show line that is not a conditional — e.g. ¬(P ∧ Q) is a negation, so use ID.',
      'Lines inside the box (including the assumption) cannot be used after the box is closed.',
    ],
  },
  {
    id: 'ID',
    name: 'Indirect Derivation',
    abbreviation: 'ID',
    derived: false,
    category: 'structural',
    premisesCount: 2,
    schema: { from: ['Show φ', '  ¬φ   ASS ID', '  …', '  χ', '  ¬χ'], to: 'close the box: φ is shown' },
    example: { from: ['Show P', '  ¬P   ASS ID', '  …', '  Q', '  ¬Q'], to: 'close with ID citing the Q and ¬Q lines' },
    explanation:
      'Proof by contradiction: assume the opposite of what you want to show and derive a contradiction — some formula χ together with its negation ¬χ. If the Show formula is already a negation ¬ψ, you may assume ψ instead of ¬¬ψ.',
    requirements: [
      'The first line of the box must be ¬φ (or ψ when φ is ¬ψ), marked ASS ID.',
      'Cite two lines inside the box: some χ and exactly ¬χ.',
    ],
    pitfalls: [
      'The two cited lines must be a formula and its exact negation: P and ¬¬P are not contradictory.',
      'Both lines must be inside the box — repeat outside lines in with R.',
      'χ can be anything, not just the Show formula.',
    ],
  },
  {
    id: 'UD',
    name: 'Universal Derivation',
    abbreviation: 'UD',
    derived: false,
    category: 'structural',
    premisesCount: 1,
    schema: { from: ['Show ∀x φ', '  …', '  φ'], to: 'close the box: ∀x φ is shown' },
    example: { from: ['Show ∀x(Fx → Hx)', '  …', '  Fx → Hx'], to: 'close with UD citing the Fx → Hx line' },
    explanation:
      'To prove that everything is φ, prove φ about an arbitrary x: derive φ (with x free) inside the box. It only works if nothing above the Show line says anything special about x.',
    requirements: [
      'The Show formula must be a universal ∀x φ, and the box has no assumption.',
      'Cite a line directly inside the box that is exactly φ (same variable x).',
      'Restriction: x must not occur free in any line that is available above the Show line (premises, open assumptions, earlier derived lines).',
    ],
    pitfalls: [
      'Generalizing on a variable introduced by EI or occurring free in a premise — that is what the restriction forbids.',
      'Using the Show formula ∀x φ itself inside its own box.',
    ],
  },
  // --------------------------------------------------------------- structural
  {
    id: 'PR',
    name: 'Premise',
    abbreviation: 'PR',
    derived: false,
    category: 'structural',
    premisesCount: 0,
    schema: { from: [], to: 'φ   PR' },
    example: { from: [], to: 'P → Q   PR' },
    explanation: 'The given premises of the argument. They come first, at the top level, before anything else.',
    requirements: ['Premises go at the very top, before any Show line, at the outermost level.'],
    pitfalls: ['You cannot add premises of your own — only the ones the argument gives you.'],
  },
  {
    id: 'ASS',
    name: 'Assumption',
    abbreviation: 'ASS',
    derived: false,
    category: 'structural',
    premisesCount: 0,
    schema: { from: ['Show φ → ψ'], to: 'φ   ASS CD     |     Show φ:  ¬φ   ASS ID' },
    example: { from: ['Show P → Q'], to: 'P   ASS CD' },
    explanation:
      'An assumption is allowed only as the first line inside a Show box, and only of the kind the closing method needs: the antecedent for CD, the negation of the Show formula for ID.',
    requirements: [
      'Must be the first line in a Show box, right after the Show line.',
      'ASS CD: exactly the antecedent of the Show conditional.',
      'ASS ID: exactly ¬φ for Show φ (or ψ when the Show formula is ¬ψ).',
    ],
    pitfalls: [
      'Assuming whatever would be convenient — only the two forms above are allowed.',
      'Using the assumption after its box has been closed.',
    ],
  },
];

/** Keyed by RuleInfo.id. Includes rules, closing methods (DD/CD/ID) and PR/ASS. */
export const RULES: Record<string, RuleInfo> = Object.fromEntries(LIST.map((r) => [r.id, r]));
export const RULE_LIST: RuleInfo[] = LIST;
export function getRule(id: string): RuleInfo | undefined {
  return RULES[id];
}

/** Inference rules (things a 'step' line can use), in reference order. */
export const INFERENCE_RULE_IDS: RuleId[] = [
  'MP', 'MT', 'DN', 'R', 'S', 'ADJ', 'ADD', 'MTP', 'BC', 'CB', 'UI', 'EG', 'EI',
  'DM', 'NC', 'NB', 'CDJ', 'SC', 'QN', 'AV',
];
export const DERIVED_RULE_IDS: RuleId[] = ['DM', 'NC', 'NB', 'CDJ', 'SC', 'QN', 'AV'];
export const QUANTIFIER_RULE_IDS: RuleId[] = ['UI', 'EG', 'EI', 'QN', 'AV'];

export function isRuleId(id: string): id is RuleId {
  return (INFERENCE_RULE_IDS as string[]).includes(id);
}

/** "S (Simplification)". */
export function ruleLabel(id: string): string {
  const r = RULES[id];
  return r ? `${r.abbreviation} (${r.name})` : id;
}
