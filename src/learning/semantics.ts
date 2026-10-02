/**
 * Truth-table, validity and countermodel exercises: generators, checkers,
 * hints and solutions. Labels (classification, valid/invalid) always come
 * from the logic engine, never from the templates.
 *
 * OWNER: Learning System.
 */
import type { Classification, Formula, Valuation } from '../logic';
import { CONNECTIVE_NAME, SYMBOL, atomsOf, buildTruthTable, checkValidity, classify, evaluate, format } from '../logic';
import type { CountermodelExercise, Difficulty, Feedback, Solution, TruthTableExercise, ValidityExercise } from './types';
import { explainValue, f, formatValuation, hash, joinList, makeRng, missingAtoms, niceRandomFormula, pick, sample, substitute, tf, type Rng } from './util';

// ---------------------------------------------------------------------------
// Substitution material
// ---------------------------------------------------------------------------

const LETTERS = ['P', 'Q', 'R', 'S'];

/** A random "fill" for a schematic letter, harder with difficulty. */
function filler(rng: Rng, difficulty: Difficulty, letters: string[]): Formula {
  const atom = (): Formula => ({ kind: 'atom', name: pick(rng, letters) });
  const r = rng();
  if (difficulty <= 1) return atom();
  if (difficulty === 2) return r < 0.25 ? { kind: 'not', operand: atom() } : atom();
  if (difficulty === 3) {
    if (r < 0.55) return atom();
    if (r < 0.75) return { kind: 'not', operand: atom() };
    return { kind: pick(rng, ['and', 'or', 'implies'] as const), left: atom(), right: atom() };
  }
  if (r < 0.35) return atom();
  if (r < 0.5) return { kind: 'not', operand: atom() };
  return niceRandomFormula({ atoms: letters, maxDepth: 2, random: rng });
}

/** Substitute distinct fillers for the schematic letters W X Y Z. */
function instantiate(schemas: string[], rng: Rng, difficulty: Difficulty): Formula[] {
  const parsed = schemas.map(f);
  const schematic = atomsOf(...parsed);
  const letters = sample(rng, LETTERS, Math.min(LETTERS.length, Math.max(schematic.length, difficulty >= 4 ? 4 : 3)));
  const sub: Record<string, Formula> = {};
  if (difficulty <= 2) {
    const distinct = sample(rng, letters, schematic.length);
    schematic.forEach((s, i) => {
      const a: Formula = { kind: 'atom', name: distinct[i] };
      sub[s] = difficulty === 2 && rng() < 0.2 ? { kind: 'not', operand: a } : a;
    });
  } else {
    const used = new Set<string>();
    for (const s of schematic) {
      let g = filler(rng, difficulty, letters);
      for (let k = 0; k < 10 && used.has(format(g)); k++) g = filler(rng, difficulty, letters);
      used.add(format(g));
      sub[s] = g;
    }
  }
  return parsed.map((p) => substitute(p, sub));
}

// ---------------------------------------------------------------------------
// Truth tables
// ---------------------------------------------------------------------------

const TAUTOLOGY_SCHEMAS = ['X ∨ ¬X', 'X → X', 'X → (Y → X)', '(X ∧ Y) → X', '¬(X ∧ ¬X)', '((X → Y) ∧ X) → Y', '((X → Y) ∧ ¬Y) → ¬X', '(X → Y) ↔ (¬Y → ¬X)', '¬(X ∨ Y) ↔ (¬X ∧ ¬Y)', 'X → (X ∨ Y)', '((X → Y) ∧ (Y → Z)) → (X → Z)'];
const CONTRADICTION_SCHEMAS = ['X ∧ ¬X', '¬(X → X)', 'X ↔ ¬X', '¬(X ∨ ¬X)', '(X → Y) ∧ (X ∧ ¬Y)', '(X ∨ Y) ∧ (¬X ∧ ¬Y)', '¬(X → (Y → X))'];

function truthTableFormula(rng: Rng, difficulty: Difficulty, target: Classification): Formula {
  const atoms = LETTERS.slice(0, difficulty <= 2 ? 2 : difficulty <= 4 ? 3 : 4);
  const maxDepth = difficulty <= 1 ? 2 : difficulty <= 3 ? 3 : 4;
  if (target === 'contingent' || rng() < 0.3) {
    for (let i = 0; i < 200; i++) {
      const g = niceRandomFormula({ atoms, maxDepth, random: rng });
      if (g.kind === 'atom') continue;
      if (classify(g) === target) return g;
    }
  }
  const schemas = target === 'tautology' ? TAUTOLOGY_SCHEMAS : target === 'contradiction' ? CONTRADICTION_SCHEMAS : ['X ∧ Y', 'X → Y', 'X ∨ ¬Y'];
  const pool = difficulty <= 2 ? schemas.slice(0, 5) : schemas;
  return instantiate([pick(rng, pool)], rng, difficulty)[0];
}

export function generateTruthTable(difficulty: Difficulty, seed: number, mode?: 'classify' | 'fill'): TruthTableExercise {
  const rng = makeRng(seed);
  const m = mode ?? (rng() < 0.5 ? 'classify' : 'fill');
  const r = rng();
  const target: Classification = m === 'fill' ? (r < 0.8 ? 'contingent' : r < 0.9 ? 'tautology' : 'contradiction') : r < 0.35 ? 'tautology' : r < 0.6 ? 'contradiction' : 'contingent';
  const g = truthTableFormula(rng, difficulty, target);
  const text = format(g);
  return {
    id: `tt-gen-${m}-${hash(text)}`,
    kind: 'truth-table',
    topic: 'truth-table',
    difficulty,
    title: m === 'classify' ? 'Classify the sentence' : 'Complete the truth table',
    prompt:
      m === 'classify'
        ? 'Is this sentence a tautology, a contradiction, or contingent? Use a truth table if it helps.'
        : 'Fill in the truth value of the whole sentence in every row.',
    tags: [m],
    source: 'generated',
    formula: text,
    atoms: atomsOf(g),
    mode: m,
    classification: classify(g),
  };
}

const CLASS_DEF: Record<Classification, string> = {
  tautology: 'A tautology is true in every row of its truth table.',
  contradiction: 'A contradiction is false in every row of its truth table.',
  contingent: 'A contingent sentence is true in at least one row and false in at least one row.',
};

function rowLabel(atoms: string[], v: Valuation, index: number): string {
  return `row ${index + 1} (${formatValuation(v, atoms)})`;
}

export function checkTruthTable(
  ex: TruthTableExercise,
  answer: { classification?: Classification; values?: (boolean | null)[]; cells?: (boolean | null)[][] },
): Feedback {
  const g = f(ex.formula);
  const table = buildTruthTable([g]);
  const main = table.mainColumns[0];
  const truths = table.rows.map((row) => row[main]);

  if (ex.mode === 'classify' || (answer.classification && !answer.values && !answer.cells)) {
    const said = answer.classification;
    if (!said) return { correct: false, severity: 'error', code: 'empty', headline: 'Choose tautology, contradiction or contingent.', explanation: CLASS_DEF.contingent };
    if (said === ex.classification) {
      return { correct: true, severity: 'success', code: 'correct', headline: `Correct — it is ${said === 'contingent' ? 'contingent' : `a ${said}`}.`, explanation: CLASS_DEF[said] };
    }
    const falseRow = truths.indexOf(false);
    const trueRow = truths.indexOf(true);
    const details: string[] = [];
    let explanation = CLASS_DEF[said] + ' ';
    let witness: number;
    if (said === 'tautology') witness = falseRow;
    else if (said === 'contradiction') witness = trueRow;
    else witness = -1;
    if (witness >= 0) {
      const v = table.valuations[witness];
      explanation += `But in ${rowLabel(table.atoms, v, witness)} the sentence is ${tf(truths[witness])}.`;
      details.push(explainValue(g, v));
      return { correct: false, severity: 'error', code: 'wrong-classification', headline: `Not a ${said}: there is a row where it is ${tf(truths[witness])}.`, explanation, details, valuation: v };
    }
    // said contingent, but it's a tautology or contradiction
    const all = ex.classification === 'tautology' ? 'T' : 'F';
    explanation += `But this sentence comes out ${all} in every one of its ${truths.length} rows, so it is a ${ex.classification}.`;
    details.push(`Try the row you think makes it ${all === 'T' ? 'false' : 'true'} and compute carefully: ${explainValue(g, table.valuations[0])}`);
    return { correct: false, severity: 'error', code: 'wrong-classification', headline: `It is not contingent — it has the same value in every row.`, explanation, details };
  }

  // fill mode
  if (answer.cells) {
    for (let c = 0; c < table.columns.length; c++) {
      const col = table.columns[c];
      if (col.isAtom) continue;
      for (let r = 0; r < table.rows.length; r++) {
        const given = answer.cells[r]?.[c];
        if (given === null || given === undefined) continue;
        if (given !== table.rows[r][c]) {
          const v = table.valuations[r];
          return {
            correct: false,
            severity: 'error',
            code: 'wrong-cell',
            headline: `Check the column for ${col.label}, ${rowLabel(table.atoms, v, r)}.`,
            explanation: explainValue(col.formula, v),
            details: ['Work column by column from the smallest parts outward; each column depends only on the columns of its immediate parts.'],
            valuation: v,
          };
        }
      }
    }
  }
  const values = answer.values ?? (answer.cells ? answer.cells.map((row) => row?.[main] ?? null) : []);
  const blanks: number[] = [];
  const wrong: number[] = [];
  truths.forEach((t, r) => {
    const given = values[r];
    if (given === null || given === undefined) blanks.push(r);
    else if (given !== t) wrong.push(r);
  });
  if (!wrong.length && !blanks.length) {
    return {
      correct: true,
      severity: 'success',
      code: 'correct',
      headline: 'Correct — every row is right.',
      explanation: `So the sentence is ${ex.classification === 'contingent' ? 'contingent' : `a ${ex.classification}`}. ${CLASS_DEF[ex.classification]}`,
    };
  }
  if (!wrong.length) {
    return { correct: false, partial: true, severity: 'warning', code: 'incomplete', headline: `So far so good — ${blanks.length} row${blanks.length === 1 ? '' : 's'} still blank.`, explanation: 'Fill in every row of the main column.' };
  }
  const first = wrong[0];
  const v = table.valuations[first];
  return {
    correct: false,
    partial: wrong.length < truths.length / 2,
    severity: wrong.length < truths.length / 2 ? 'warning' : 'error',
    code: 'wrong-rows',
    headline: `${wrong.length} row${wrong.length === 1 ? ' is' : 's are'} wrong: ${joinList(wrong.map((r) => String(r + 1)))}.`,
    explanation: `Look at ${rowLabel(table.atoms, v, first)}: ${explainValue(g, v)}`,
    details: ['Compute the values of the smaller parts first, then apply the main connective.'],
    valuation: v,
  };
}

export function truthTableHints(ex: TruthTableExercise): string[] {
  const g = f(ex.formula);
  const n = ex.atoms.length;
  const hints = [
    `There ${n === 1 ? 'is 1 sentence letter' : `are ${n} sentence letters`}, so the table has ${2 ** n} rows. Standard order: the first letter is T in the top half, the last letter alternates T, F every row.`,
    `Work from the inside out: compute the columns for the smallest parts first. The main connective here is the ${g.kind === 'atom' ? 'sentence letter itself' : SYMBOL[g.kind as keyof typeof SYMBOL] ?? CONNECTIVE_NAME[g.kind]}.`,
  ];
  if (g.kind === 'implies') hints.push('A conditional is false in exactly one kind of row: antecedent T and consequent F. Look for such rows.');
  if (g.kind === 'and') hints.push('A conjunction is true only when both conjuncts are true.');
  if (g.kind === 'or') hints.push('A disjunction is false only when both disjuncts are false.');
  if (g.kind === 'iff') hints.push('A biconditional is true exactly when both sides have the same value.');
  if (g.kind === 'not') hints.push('Compute the negated part first, then flip every value.');
  if (ex.mode === 'classify') hints.push('Shortcut: to show it is not a tautology you need just one F row; to show it is not a contradiction, one T row.');
  return hints;
}

export function truthTableSolution(ex: TruthTableExercise): Solution {
  const g = f(ex.formula);
  const table = buildTruthTable([g]);
  const main = table.mainColumns[0];
  const steps = table.rows.map((row, r) => `${formatValuation(table.valuations[r], table.atoms)}  ⇒  ${tf(row[main])}`);
  return {
    answer: ex.mode === 'classify' ? ex.classification : table.rows.map((row) => tf(row[main])).join(''),
    summary: `${ex.formula} is ${ex.classification === 'contingent' ? 'contingent' : `a ${ex.classification}`}. ${CLASS_DEF[ex.classification]}`,
    steps,
  };
}

// ---------------------------------------------------------------------------
// Arguments (validity & countermodels)
// ---------------------------------------------------------------------------

export interface ArgumentForm {
  name: string;
  premises: string[];
  conclusion: string;
  valid: boolean;
  /** Why it is (in)valid, in words. */
  note: string;
  minDifficulty: Difficulty;
}

export const ARGUMENT_FORMS: ArgumentForm[] = [
  { name: 'Modus Ponens', premises: ['X → Y', 'X'], conclusion: 'Y', valid: true, minDifficulty: 1, note: 'From a conditional and its antecedent, the consequent follows.' },
  { name: 'Modus Tollens', premises: ['X → Y', '¬Y'], conclusion: '¬X', valid: true, minDifficulty: 1, note: 'If the consequent is false, the antecedent must be false too.' },
  { name: 'Hypothetical Syllogism', premises: ['X → Y', 'Y → Z'], conclusion: 'X → Z', valid: true, minDifficulty: 1, note: 'Conditionals chain: X leads to Y, and Y leads to Z.' },
  { name: 'Disjunctive Syllogism', premises: ['X ∨ Y', '¬X'], conclusion: 'Y', valid: true, minDifficulty: 1, note: 'If one disjunct is false, the other must be true.' },
  { name: 'Constructive Dilemma', premises: ['X ∨ Y', 'X → Z', 'Y → W'], conclusion: 'Z ∨ W', valid: true, minDifficulty: 2, note: 'Whichever disjunct holds, its conditional delivers one of the conclusion\'s disjuncts.' },
  { name: 'Destructive Dilemma', premises: ['X → Z', 'Y → W', '¬Z ∨ ¬W'], conclusion: '¬X ∨ ¬Y', valid: true, minDifficulty: 3, note: 'Whichever consequent fails, Modus Tollens removes its antecedent.' },
  { name: 'Simplification', premises: ['X ∧ Y'], conclusion: 'Y', valid: true, minDifficulty: 1, note: 'A true conjunction has true conjuncts.' },
  { name: 'Contraposition', premises: ['X → Y'], conclusion: '¬Y → ¬X', valid: true, minDifficulty: 2, note: 'A conditional is equivalent to its contrapositive.' },
  { name: 'Exportation', premises: ['(X ∧ Y) → Z'], conclusion: 'X → (Y → Z)', valid: true, minDifficulty: 3, note: '(X ∧ Y) → Z and X → (Y → Z) are equivalent.' },
  { name: "De Morgan's Law", premises: ['¬(X ∨ Y)'], conclusion: '¬X ∧ ¬Y', valid: true, minDifficulty: 2, note: '"Not either" means "neither".' },
  { name: 'Biconditional Modus Ponens', premises: ['X ↔ Y', 'Y'], conclusion: 'X', valid: true, minDifficulty: 2, note: 'A biconditional runs in both directions.' },
  { name: 'Affirming the Consequent', premises: ['X → Y', 'Y'], conclusion: 'X', valid: false, minDifficulty: 1, note: 'The consequent can be true for some other reason while the antecedent is false.' },
  { name: 'Denying the Antecedent', premises: ['X → Y', '¬X'], conclusion: '¬Y', valid: false, minDifficulty: 1, note: 'A false antecedent tells you nothing about the consequent.' },
  { name: 'Affirming a Disjunct', premises: ['X ∨ Y', 'X'], conclusion: '¬Y', valid: false, minDifficulty: 1, note: '∨ is inclusive: both disjuncts can be true.' },
  { name: 'Converting a Conditional', premises: ['X → Y'], conclusion: 'Y → X', valid: false, minDifficulty: 2, note: 'A conditional does not imply its converse.' },
  { name: "Bad De Morgan", premises: ['¬(X ∧ Y)'], conclusion: '¬X ∧ ¬Y', valid: false, minDifficulty: 2, note: '"Not both" does not mean "neither": one of them may still be true.' },
  { name: 'Invalid Chain', premises: ['X → Y', 'X → Z'], conclusion: 'Y → Z', valid: false, minDifficulty: 2, note: 'Two consequents of the same antecedent need not be connected to each other.' },
  { name: 'Or to And', premises: ['X ∨ Y'], conclusion: 'X ∧ Y', valid: false, minDifficulty: 1, note: 'A disjunction only guarantees one disjunct.' },
  { name: 'Backwards Chain', premises: ['X → Y', 'Y → Z', 'Z'], conclusion: 'X', valid: false, minDifficulty: 3, note: 'Affirming the consequent, twice over.' },
  { name: 'Misplaced Parentheses', premises: ['X → (Y → Z)'], conclusion: '(X → Y) → Z', valid: false, minDifficulty: 3, note: 'Grouping matters for →: it is not associative.' },
];

interface Arg {
  premises: Formula[];
  conclusion: Formula;
  form?: ArgumentForm;
}

function randomArgument(rng: Rng, difficulty: Difficulty, wantValid: boolean): Arg | null {
  const atoms = LETTERS.slice(0, difficulty >= 5 ? 4 : 3);
  for (let i = 0; i < 300; i++) {
    const n = 1 + Math.floor(rng() * (difficulty >= 5 ? 3 : 2));
    const premises = Array.from({ length: n }, () => niceRandomFormula({ atoms, maxDepth: difficulty >= 5 ? 3 : 2, random: rng }));
    const conclusion = niceRandomFormula({ atoms, maxDepth: 2, random: rng });
    if (conclusion.kind === 'atom' && rng() < 0.5) continue;
    const r = checkValidity(premises, conclusion);
    if (r.premisesInconsistent) continue;
    if (classify(conclusion) === 'tautology') continue;
    if (premises.some((p) => format(p) === format(conclusion))) continue;
    if (r.valid === wantValid) return { premises, conclusion };
  }
  return null;
}

function makeArgument(rng: Rng, difficulty: Difficulty, wantValid: boolean): Arg {
  const useRandom = difficulty >= 4 ? rng() < 0.5 : difficulty === 3 ? rng() < 0.25 : false;
  if (useRandom) {
    const a = randomArgument(rng, difficulty, wantValid);
    if (a) return a;
  }
  const forms = ARGUMENT_FORMS.filter((fm) => fm.valid === wantValid && fm.minDifficulty <= difficulty);
  for (let i = 0; i < 30; i++) {
    const form = pick(rng, forms);
    const fs = instantiate([...form.premises, form.conclusion], rng, difficulty);
    const premises = fs.slice(0, -1);
    const conclusion = fs[fs.length - 1];
    const r = checkValidity(premises, conclusion);
    // substitutions can accidentally validate a fallacy or trivialise the argument
    if (r.valid !== wantValid || r.premisesInconsistent) continue;
    return { premises, conclusion, form };
  }
  const form = forms[0];
  const fs = [...form.premises, form.conclusion].map((s) => substitute(f(s), { X: f('P'), Y: f('Q'), Z: f('R'), W: f('S') }));
  return { premises: fs.slice(0, -1), conclusion: fs[fs.length - 1], form };
}

export function generateValidity(difficulty: Difficulty, seed: number): ValidityExercise {
  const rng = makeRng(seed);
  const wantValid = rng() < 0.5;
  const arg = makeArgument(rng, difficulty, wantValid);
  const premises = arg.premises.map((p) => format(p));
  const conclusion = format(arg.conclusion);
  const valid = checkValidity(arg.premises, arg.conclusion).valid;
  const requireCountermodel = difficulty >= 2;
  return {
    id: `val-gen-${hash(`${premises.join(';')}⊢${conclusion}`)}`,
    kind: 'validity',
    topic: 'validity',
    difficulty,
    title: 'Valid or invalid?',
    prompt: requireCountermodel
      ? 'Is this argument valid? If it is invalid, give a countermodel: truth values that make every premise true and the conclusion false.'
      : 'Is this argument valid?',
    tags: arg.form ? ['named-form'] : ['random'],
    source: 'generated',
    premises,
    conclusion,
    valid,
    form: arg.form?.name,
    requireCountermodel,
    atoms: atomsOf(...arg.premises, arg.conclusion),
  };
}

export function generateCountermodel(difficulty: Difficulty, seed: number): CountermodelExercise {
  const rng = makeRng(seed);
  const arg = makeArgument(rng, difficulty, false);
  const premises = arg.premises.map((p) => format(p));
  const conclusion = format(arg.conclusion);
  return {
    id: `cm-gen-${hash(`${premises.join(';')}⊢${conclusion}`)}`,
    kind: 'countermodel',
    topic: 'countermodel',
    difficulty,
    title: 'Find a countermodel',
    prompt: 'This argument is invalid. Assign truth values to the sentence letters so that every premise is true and the conclusion is false.',
    tags: arg.form ? ['fallacy'] : ['random'],
    source: 'generated',
    premises,
    conclusion,
    atoms: atomsOf(...arg.premises, arg.conclusion),
    form: arg.form?.name,
  };
}

const formOf = (name?: string) => ARGUMENT_FORMS.find((fm) => fm.name === name);

/** Evaluate a proposed countermodel; null means it works. */
function countermodelProblems(premises: Formula[], conclusion: Formula, v: Valuation): { missing: string[]; problems: string[]; falsePremises: number[]; conclusionTrue: boolean } {
  const missing = missingAtoms(v, [...premises, conclusion]);
  if (missing.length) return { missing, problems: [], falsePremises: [], conclusionTrue: false };
  const problems: string[] = [];
  const falsePremises: number[] = [];
  premises.forEach((p, i) => {
    if (!evaluate(p, v)) {
      falsePremises.push(i);
      problems.push(`Premise ${i + 1}: ${explainValue(p, v)}`);
    }
  });
  const conclusionTrue = evaluate(conclusion, v);
  if (conclusionTrue) problems.push(`Conclusion: ${explainValue(conclusion, v)}`);
  return { missing, problems, falsePremises, conclusionTrue };
}

function checkCountermodelCore(premises: Formula[], conclusion: Formula, v: Valuation): Feedback {
  const { missing, problems, falsePremises, conclusionTrue } = countermodelProblems(premises, conclusion, v);
  if (missing.length) {
    return { correct: false, partial: true, severity: 'warning', code: 'incomplete-valuation', headline: `Give a truth value to every sentence letter (${joinList(missing)} ${missing.length === 1 ? 'is' : 'are'} missing).`, explanation: 'A countermodel is a complete row of the truth table.' };
  }
  if (!problems.length) {
    return { correct: true, severity: 'success', code: 'correct', headline: 'That is a countermodel.', explanation: 'Every premise is true and the conclusion is false in this row, so the argument is invalid.', valuation: v };
  }
  const what = [falsePremises.length ? `premise${falsePremises.length > 1 ? 's' : ''} ${joinList(falsePremises.map((i) => String(i + 1)))} ${falsePremises.length > 1 ? 'are' : 'is'} false` : '', conclusionTrue ? 'the conclusion is true' : ''].filter(Boolean);
  return {
    correct: false,
    severity: 'error',
    code: conclusionTrue && !falsePremises.length ? 'conclusion-true' : 'premise-false',
    headline: `Not a countermodel: ${joinList(what)}.`,
    explanation: 'A countermodel must make ALL the premises true and the conclusion false at the same time.',
    details: [...problems, conclusionTrue ? 'Start from the conclusion: which values make it false? Then check the premises with those values fixed.' : 'Keep the values that make the conclusion false, and adjust the remaining letters to make the false premise true.'],
    valuation: v,
  };
}

export function checkValidityAnswer(ex: ValidityExercise, said: boolean, countermodel?: Valuation): Feedback {
  const premises = ex.premises.map(f);
  const conclusion = f(ex.conclusion);
  const form = formOf(ex.form);
  if (said === ex.valid) {
    if (ex.valid) {
      return {
        correct: true,
        severity: 'success',
        code: 'correct',
        headline: `Correct — the argument is valid${form ? ` (${form.name})` : ''}.`,
        explanation: `No row makes every premise true and the conclusion false.${form ? ` ${form.note}` : ''}`,
      };
    }
    if (!countermodel || !Object.keys(countermodel).length) {
      if (!ex.requireCountermodel) return { correct: true, severity: 'success', code: 'correct', headline: `Correct — it is invalid${form ? ` (${form.name})` : ''}.`, explanation: form?.note ?? 'Some row makes every premise true and the conclusion false.' };
      return { correct: false, partial: true, severity: 'warning', code: 'needs-countermodel', headline: 'Right, it is invalid — now back it up with a countermodel.', explanation: 'Give truth values that make every premise true and the conclusion false.' };
    }
    const fb = checkCountermodelCore(premises, conclusion, countermodel);
    if (fb.correct) return { ...fb, headline: `Correct — invalid${form ? ` (${form.name})` : ''}, and your countermodel works.`, explanation: `${fb.explanation}${form ? ` ${form.note}` : ''}` };
    return { ...fb, correct: false, partial: true, severity: 'warning', headline: `Right, it is invalid — but that valuation is not a countermodel: ${fb.headline.replace(/^Not a countermodel: /, '')}` };
  }
  if (ex.valid) {
    const details: string[] = [];
    if (countermodel && Object.keys(countermodel).length && !missingAtoms(countermodel, [...premises, conclusion]).length) {
      details.push(...countermodelProblems(premises, conclusion, countermodel).problems);
    }
    details.push('To be invalid, some row must make every premise true and the conclusion false. Try to build one: make the conclusion false, then see whether the premises can all be true.');
    return {
      correct: false,
      severity: 'error',
      code: 'actually-valid',
      headline: `This argument is valid${form ? ` — it is ${form.name}` : ''}.`,
      explanation: form ? form.note : 'Every row that makes all the premises true also makes the conclusion true.',
      details,
    };
  }
  return {
    correct: false,
    severity: 'error',
    code: 'actually-invalid',
    headline: `This argument is invalid${form ? ` — it is ${form.name}` : ''}.`,
    explanation: `${form ? `${form.note} ` : ''}There is a row where every premise is true and the conclusion is false. Look for it: start by making the conclusion false.`,
  };
}

export function checkCountermodelAnswer(ex: CountermodelExercise, v: Valuation): Feedback {
  return checkCountermodelCore(ex.premises.map(f), f(ex.conclusion), v);
}

export function argumentHints(ex: ValidityExercise | CountermodelExercise): string[] {
  const conclusion = f(ex.conclusion);
  const hints = [
    'An argument is valid when no row makes every premise true and the conclusion false. Search for such a row: that is exactly a countermodel.',
    `Start with the conclusion ${ex.conclusion}: which truth values make it false?${conclusion.kind === 'atom' ? ` (Just ${ex.conclusion} = F.)` : conclusion.kind === 'implies' ? ' A conditional is false only when its antecedent is T and its consequent F.' : conclusion.kind === 'or' ? ' A disjunction is false only when both disjuncts are F.' : ''}`,
    'Keep those values fixed and try to make each premise true, one at a time. If you get stuck in every possible way, the argument is valid.',
  ];
  const form = formOf(ex.form);
  if (form) {
    const schematic = (t: string) => t.replace(/[WXYZ]/g, (c) => ({ X: 'φ', Y: 'ψ', Z: 'χ', W: 'θ' })[c]!);
    hints.push(`This argument has a well-known shape: ${form.premises.map(schematic).join(', ')} ∴ ${schematic(form.conclusion)} (φ, ψ, χ, θ stand for parts of the formulas).`);
  }
  return hints;
}

export function argumentSolution(ex: ValidityExercise | CountermodelExercise): Solution {
  const premises = ex.premises.map(f);
  const conclusion = f(ex.conclusion);
  const r = checkValidity(premises, conclusion);
  const form = formOf(ex.form);
  if (r.valid) {
    return {
      answer: 'valid',
      summary: `Valid${form ? ` (${form.name})` : ''}. ${form?.note ?? 'In every row where all premises are true, the conclusion is true.'}`,
      steps: r.premisesInconsistent ? ['The premises cannot all be true together, so the argument is (vacuously) valid.'] : undefined,
    };
  }
  const v = r.counterexample!;
  return {
    answer: 'invalid',
    summary: `Invalid${form ? ` (${form.name})` : ''}. Countermodel: ${formatValuation(v, ex.atoms)}. ${form?.note ?? ''}`.trim(),
    valuation: v,
    steps: [...premises.map((p, i) => `Premise ${i + 1}: ${explainValue(p, v)}`), `Conclusion: ${explainValue(conclusion, v)}`],
  };
}
