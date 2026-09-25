/**
 * Predicate-logic exercises:
 *  - 'predicate-symbolization': English → quantified formula, checked by
 *    alpha-equivalence or bounded model search, with diagnoses of the classic
 *    mistakes and a distinguishing small world described in English;
 *  - 'model': is this sentence true in this small world?
 *  - 'predicate-countermodel': build a world with true premises and a false
 *    conclusion.
 *
 * Predicate validity is undecidable in general, so "equivalent" here means
 * "no world with up to N objects tells them apart" (N = 3–4); feedback says so.
 *
 * OWNER: Learning System.
 */
import type { Formula, Interpretation, Term } from '../logic';
import {
  CONNECTIVE_NAME,
  SYMBOL,
  alphaEquals,
  arityConflicts,
  evaluateIn,
  findModel,
  format,
  freeVariables,
  isBinary,
  isQuantified,
  namesOf,
  parse,
  predicatesOf,
} from '../logic';
import type {
  Difficulty,
  Feedback,
  ModelExercise,
  PredicateCountermodelExercise,
  PredicateKeyEntry,
  PredicateSymbolizationExercise,
  Solution,
} from './types';
import { f, hash, joinList, makeRng, pick, shuffle, type Rng } from './util';

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

const P = (symbol: string, arity: number, meaning: string): PredicateKeyEntry => ({ kind: 'predicate', symbol, arity, meaning });
const Nm = (symbol: string, meaning: string): PredicateKeyEntry => ({ kind: 'name', symbol, meaning });

const alice = Nm('a', 'Alice');
const bob = Nm('b', 'Bob');
const loves = P('L', 2, 'x loves y');
const admires = P('A', 2, 'x admires y');
const student = P('S', 1, 'x is a student');
const teacher = P('T', 1, 'x is a teacher');

export function keyLabel(k: PredicateKeyEntry): string {
  return k.kind === 'name' ? `${k.symbol}: ${k.meaning}` : `${k.symbol}${'xyz'.slice(0, k.arity)}: ${k.meaning}`;
}

// ---------------------------------------------------------------------------
// Bank
// ---------------------------------------------------------------------------

interface Item {
  id: string;
  difficulty: Difficulty;
  sentence: string;
  key: PredicateKeyEntry[];
  answer: string;
  alternatives?: string[];
  tags: string[];
  explanation: string;
}

const ITEMS: Item[] = [
  // ------------------------------------------------------------ difficulty 1
  { id: 'psym-01', difficulty: 1, sentence: 'All dogs are mammals.', key: [P('D', 1, 'x is a dog'), P('M', 1, 'x is a mammal')], answer: '∀x(Dx → Mx)', tags: ['all'], explanation: '"All F are G" says: take anything; if it is F, it is G. Universal quantifier + conditional.' },
  { id: 'psym-02', difficulty: 1, sentence: 'Some cats are black.', key: [P('C', 1, 'x is a cat'), P('B', 1, 'x is black')], answer: '∃x(Cx ∧ Bx)', tags: ['some'], explanation: '"Some F are G" says there is something that is both F and G. Existential quantifier + conjunction.' },
  { id: 'psym-03', difficulty: 1, sentence: 'No fish are mammals.', key: [P('F', 1, 'x is a fish'), P('M', 1, 'x is a mammal')], answer: '∀x(Fx → ¬Mx)', alternatives: ['¬∃x(Fx ∧ Mx)'], tags: ['no'], explanation: '"No F are G": everything that is F is not G — equivalently, there is nothing that is both F and G.' },
  { id: 'psym-04', difficulty: 1, sentence: 'Alice is a student.', key: [student, alice], answer: 'Sa', tags: ['names'], explanation: 'A name fills the argument place of the predicate: Sa.' },
  { id: 'psym-05', difficulty: 1, sentence: 'Everything is physical.', key: [P('P', 1, 'x is physical')], answer: '∀xPx', tags: ['all'], explanation: 'An unrestricted universal: ∀x Px.' },
  { id: 'psym-06', difficulty: 1, sentence: 'Something is broken.', key: [P('B', 1, 'x is broken')], answer: '∃xBx', tags: ['some'], explanation: 'An unrestricted existential: ∃x Bx.' },
  { id: 'psym-07', difficulty: 1, sentence: 'Nothing is perfect.', key: [P('P', 1, 'x is perfect')], answer: '¬∃xPx', alternatives: ['∀x¬Px'], tags: ['no'], explanation: '"Nothing is P": it is not the case that something is P — equivalently, everything is not P.' },
  { id: 'psym-08', difficulty: 1, sentence: 'Bob loves Alice.', key: [loves, alice, bob], answer: 'Lba', tags: ['names', 'relational'], explanation: 'Argument order follows the key: Lxy is "x loves y", so Bob loves Alice is Lba.' },
  // ------------------------------------------------------------ difficulty 2
  { id: 'psym-09', difficulty: 2, sentence: 'Some students are not athletes.', key: [student, P('A', 1, 'x is an athlete')], answer: '∃x(Sx ∧ ¬Ax)', tags: ['some', 'negation'], explanation: 'Something is a student and is not an athlete.' },
  { id: 'psym-10', difficulty: 2, sentence: 'Not every student passed.', key: [student, P('P', 1, 'x passed')], answer: '¬∀x(Sx → Px)', alternatives: ['∃x(Sx ∧ ¬Px)'], tags: ['not-every'], explanation: '"Not every S is P" denies the universal: ¬∀x(Sx → Px) — equivalently, some student did not pass.' },
  { id: 'psym-11', difficulty: 2, sentence: 'Only citizens vote.', key: [P('C', 1, 'x is a citizen'), P('V', 1, 'x votes')], answer: '∀x(Vx → Cx)', tags: ['only'], explanation: '"Only F are G" means every G is F: ∀x(Gx → Fx). It does NOT say all citizens vote.' },
  { id: 'psym-12', difficulty: 2, sentence: 'Every student who studies passes.', key: [student, P('T', 1, 'x studies'), P('P', 1, 'x passes')], answer: '∀x((Sx ∧ Tx) → Px)', alternatives: ['∀x(Sx → (Tx → Px))'], tags: ['all', 'restricted'], explanation: 'The relative clause "who studies" adds a conjunct to the antecedent.' },
  { id: 'psym-13', difficulty: 2, sentence: 'Alice admires every poet.', key: [admires, P('P', 1, 'x is a poet'), alice], answer: '∀x(Px → Aax)', tags: ['all', 'names', 'relational'], explanation: 'For anything: if it is a poet, Alice admires it.' },
  { id: 'psym-14', difficulty: 2, sentence: 'Some poet admires Alice.', key: [admires, P('P', 1, 'x is a poet'), alice], answer: '∃x(Px ∧ Axa)', tags: ['some', 'names', 'relational'], explanation: 'Something is a poet and admires Alice.' },
  { id: 'psym-15', difficulty: 2, sentence: 'Not all birds fly.', key: [P('B', 1, 'x is a bird'), P('F', 1, 'x flies')], answer: '¬∀x(Bx → Fx)', alternatives: ['∃x(Bx ∧ ¬Fx)'], tags: ['not-every'], explanation: 'Deny the universal "all birds fly".' },
  { id: 'psym-16', difficulty: 2, sentence: 'If Alice is a student, then some teacher admires her.', key: [student, teacher, admires, alice], answer: 'Sa → ∃x(Tx ∧ Axa)', tags: ['names', 'some', 'scope'], explanation: 'A conditional whose consequent is an existential; the quantifier covers only the consequent, and "her" is Alice.' },
  { id: 'psym-17', difficulty: 2, sentence: 'Only members may enter.', key: [P('M', 1, 'x is a member'), P('E', 1, 'x may enter')], answer: '∀x(Ex → Mx)', tags: ['only'], explanation: '"Only M may E": anyone who may enter is a member.' },
  { id: 'psym-18', difficulty: 2, sentence: 'Every dog is either brown or black.', key: [P('D', 1, 'x is a dog'), P('B', 1, 'x is brown'), P('K', 1, 'x is black')], answer: '∀x(Dx → (Bx ∨ Kx))', tags: ['all'], explanation: 'The consequent is a disjunction.' },
  // ------------------------------------------------------------ difficulty 3
  { id: 'psym-19', difficulty: 3, sentence: 'Everyone loves someone.', key: [loves], answer: '∀x∃yLxy', tags: ['multiple', 'relational'], explanation: 'For each person x there is some y (possibly different for each x) whom x loves. (The domain is people.)' },
  { id: 'psym-20', difficulty: 3, sentence: 'Someone is loved by everyone.', key: [loves], answer: '∃y∀xLxy', tags: ['multiple', 'relational', 'quantifier-order'], explanation: 'There is one person y such that every x loves y. The order ∃y∀x is what makes it one and the same person.' },
  { id: 'psym-21', difficulty: 3, sentence: 'Someone loves everyone.', key: [loves], answer: '∃x∀yLxy', tags: ['multiple', 'relational'], explanation: 'One person x loves every y.' },
  { id: 'psym-22', difficulty: 3, sentence: 'Everyone is loved by someone.', key: [loves], answer: '∀y∃xLxy', tags: ['multiple', 'relational'], explanation: 'For each y there is some x who loves y. The passive voice swaps the argument order, not the meaning of L.' },
  { id: 'psym-23', difficulty: 3, sentence: 'Nobody loves Bob.', key: [loves, bob], answer: '¬∃xLxb', alternatives: ['∀x¬Lxb'], tags: ['no', 'names', 'relational'], explanation: 'There is no x such that x loves Bob.' },
  { id: 'psym-24', difficulty: 3, sentence: 'Alice admires everyone who admires her.', key: [admires, alice], answer: '∀x(Axa → Aax)', tags: ['names', 'relational'], explanation: 'For anyone x: if x admires Alice, Alice admires x.' },
  { id: 'psym-25', difficulty: 3, sentence: 'If anyone cheats, everyone suffers.', key: [P('C', 1, 'x cheats'), P('S', 1, 'x suffers')], answer: '∃xCx → ∀ySy', alternatives: ['∀x(Cx → ∀ySy)'], tags: ['scope', 'any'], explanation: '"If anyone cheats" in an antecedent means "if someone cheats": ∃x Cx → ∀y Sy. (Equivalently ∀x(Cx → ∀y Sy).)' },
  { id: 'psym-26', difficulty: 3, sentence: 'If everyone cheats, someone suffers.', key: [P('C', 1, 'x cheats'), P('S', 1, 'x suffers')], answer: '∀xCx → ∃ySy', tags: ['scope'], explanation: 'Each quantifier has only its own clause as scope.' },
  { id: 'psym-27', difficulty: 3, sentence: 'Anyone who cheats suffers.', key: [P('C', 1, 'x cheats'), P('S', 1, 'x suffers')], answer: '∀x(Cx → Sx)', tags: ['any', 'all'], explanation: '"Anyone who …" works like "everyone who …".' },
  { id: 'psym-28', difficulty: 3, sentence: 'Only students who study pass.', key: [student, P('T', 1, 'x studies'), P('P', 1, 'x passes')], answer: '∀x(Px → (Sx ∧ Tx))', tags: ['only', 'restricted'], explanation: '"Only F pass" means whoever passes is F; here F = "student who studies".' },
  { id: 'psym-29', difficulty: 3, sentence: 'All and only students vote.', key: [student, P('V', 1, 'x votes')], answer: '∀x(Sx ↔ Vx)', alternatives: ['∀x(Sx → Vx) ∧ ∀x(Vx → Sx)'], tags: ['only', 'all'], explanation: '"All S vote" gives S → V; "only S vote" gives V → S; together ↔.' },
  { id: 'psym-30', difficulty: 3, sentence: 'No student admires every teacher.', key: [student, teacher, admires], answer: '¬∃x(Sx ∧ ∀y(Ty → Axy))', alternatives: ['∀x(Sx → ¬∀y(Ty → Axy))'], tags: ['no', 'multiple'], explanation: 'There is no student x such that x admires every teacher y.' },
  // ------------------------------------------------------------ difficulty 4
  { id: 'psym-31', difficulty: 4, sentence: 'Every student admires some teacher.', key: [student, teacher, admires], answer: '∀x(Sx → ∃y(Ty ∧ Axy))', tags: ['multiple', 'relational'], explanation: 'For each student there is a teacher (maybe different ones) whom that student admires.' },
  { id: 'psym-32', difficulty: 4, sentence: 'Some teacher is admired by every student.', key: [student, teacher, admires], answer: '∃y(Ty ∧ ∀x(Sx → Axy))', tags: ['multiple', 'relational', 'quantifier-order'], explanation: 'One teacher y such that every student x admires y.' },
  { id: 'psym-33', difficulty: 4, sentence: 'Every dog that chases a cat barks.', key: [P('D', 1, 'x is a dog'), P('C', 1, 'x is a cat'), P('H', 2, 'x chases y'), P('B', 1, 'x barks')], answer: '∀x((Dx ∧ ∃y(Cy ∧ Hxy)) → Bx)', alternatives: ['∀x∀y((Dx ∧ (Cy ∧ Hxy)) → Bx)'], tags: ['restricted', 'multiple', 'scope'], explanation: '"A cat" inside the relative clause is existential, with scope only over that clause.' },
  { id: 'psym-34', difficulty: 4, sentence: 'Alice loves everyone who loves Bob.', key: [loves, alice, bob], answer: '∀x(Lxb → Lax)', tags: ['names', 'relational'], explanation: 'For anyone x: if x loves Bob, Alice loves x.' },
  { id: 'psym-35', difficulty: 4, sentence: 'Nobody loves everybody.', key: [loves], answer: '¬∃x∀yLxy', alternatives: ['∀x∃y¬Lxy'], tags: ['no', 'multiple'], explanation: 'There is no x who loves every y — equivalently, everyone fails to love someone.' },
  { id: 'psym-36', difficulty: 4, sentence: 'Everybody loves somebody who loves them.', key: [loves], answer: '∀x∃y(Lxy ∧ Lyx)', tags: ['multiple', 'relational'], explanation: 'For each x there is a y whom x loves and who loves x.' },
  { id: 'psym-37', difficulty: 4, sentence: 'There is someone whom everyone who knows Alice admires.', key: [admires, P('K', 2, 'x knows y'), alice], answer: '∃y∀x(Kxa → Axy)', tags: ['multiple', 'names', 'quantifier-order'], explanation: 'One person y such that anyone x who knows Alice admires y.' },
  { id: 'psym-38', difficulty: 4, sentence: 'If Alice admires anyone, she admires Bob.', key: [admires, alice, bob], answer: '∃xAax → Aab', alternatives: ['∀x(Aax → Aab)'], tags: ['scope', 'any', 'names'], explanation: '"anyone" in an antecedent is existential (with narrow scope), or a universal with wide scope.' },
  // ------------------------------------------------------------ difficulty 5
  { id: 'psym-39', difficulty: 5, sentence: 'Every student who admires every teacher passes.', key: [student, teacher, admires, P('P', 1, 'x passes')], answer: '∀x((Sx ∧ ∀y(Ty → Axy)) → Px)', tags: ['multiple', 'restricted', 'scope'], explanation: 'The inner ∀y belongs inside the antecedent: "admires every teacher" describes the student.' },
  { id: 'psym-40', difficulty: 5, sentence: 'Only those who love someone are loved by someone.', key: [loves], answer: '∀x(∃yLyx → ∃zLxz)', tags: ['only', 'multiple'], explanation: '"Only F are G": whoever is G (loved by someone) is F (loves someone).' },
  { id: 'psym-41', difficulty: 5, sentence: 'Some students admire only teachers.', key: [student, teacher, admires], answer: '∃x(Sx ∧ ∀y(Axy → Ty))', tags: ['only', 'multiple'], explanation: 'A student x such that anyone x admires is a teacher.' },
  { id: 'psym-42', difficulty: 5, sentence: 'No one who loves no one is loved by anyone.', key: [loves], answer: '∀x(¬∃yLxy → ¬∃zLzx)', alternatives: ['¬∃x(¬∃yLxy ∧ ∃zLzx)'], tags: ['no', 'multiple'], explanation: 'For any x: if x loves no one, then no one loves x.' },
  { id: 'psym-43', difficulty: 5, sentence: 'Anyone who loves someone loves themselves.', key: [loves], answer: '∀x(∃yLxy → Lxx)', alternatives: ['∀x∀y(Lxy → Lxx)'], tags: ['any', 'multiple', 'scope'], explanation: 'For any x: if x loves some y, x loves x.' },
  { id: 'psym-44', difficulty: 5, sentence: 'Everyone who admires Alice admires someone Alice admires.', key: [admires, alice], answer: '∀x(Axa → ∃y(Aay ∧ Axy))', tags: ['multiple', 'names'], explanation: 'For any x who admires Alice there is a y that Alice admires and x admires.' },
];

const PROMPT = 'Symbolize the sentence in predicate logic using the given key.';

const TITLE_BY_TAG: [string, string][] = [
  ['quantifier-order', 'Quantifier order'],
  ['only', '"Only"'],
  ['not-every', '"Not every"'],
  ['no', '"No" and "nothing"'],
  ['scope', 'Quantifier scope'],
  ['multiple', 'Multiple quantifiers'],
  ['restricted', 'Relative clauses'],
  ['relational', 'Relations'],
  ['some', '"Some"'],
  ['all', '"All"'],
  ['names', 'Names'],
];
const titleFor = (tags: string[]) => TITLE_BY_TAG.find(([t]) => tags.includes(t))?.[1] ?? 'Predicate symbolization';

export const PREDICATE_SYMBOLIZATION_EXERCISES: PredicateSymbolizationExercise[] = ITEMS.map((it) => ({
  id: it.id,
  kind: 'predicate-symbolization',
  topic: 'predicate-symbolization',
  difficulty: it.difficulty,
  title: titleFor(it.tags),
  prompt: PROMPT,
  tags: [...it.tags],
  source: 'bank',
  sentence: it.sentence,
  key: it.key,
  // Canonical renderings, so what the solution shows matches the app's formatter.
  answer: format(f(it.answer)),
  alternatives: (it.alternatives ?? []).map((x) => format(f(x))),
  explanation: it.explanation,
}));

// ---------------------------------------------------------------------------
// Semantic comparison (bounded)
// ---------------------------------------------------------------------------

function maxDomainFor(fs: Formula[]): number {
  return predicatesOf(...fs).some((p) => p.arity >= 2) ? 3 : 4;
}

export interface BoundedEquivalence {
  /** No world with up to `searchedUpTo` objects distinguishes them. */
  equivalent: boolean;
  /** A world where they differ. */
  model?: Interpretation;
  /** In `model`: truth value of the first formula (the second has the opposite). */
  firstTrue?: boolean;
  searchedUpTo: number;
}

/** Are `a` and `b` equivalent — as far as worlds with up to `maxDomain` objects can tell? */
export function boundedEquivalent(a: Formula, b: Formula, maxDomain = maxDomainFor([a, b])): BoundedEquivalence {
  if (alphaEquals(a, b)) return { equivalent: true, searchedUpTo: maxDomain };
  const r1 = findModel([a], [b], { maxDomain });
  if (r1.status === 'found') return { equivalent: false, model: r1.model, firstTrue: true, searchedUpTo: r1.searchedUpTo };
  const r2 = findModel([b], [a], { maxDomain });
  if (r2.status === 'found') return { equivalent: false, model: r2.model, firstTrue: false, searchedUpTo: r2.searchedUpTo };
  return { equivalent: true, searchedUpTo: Math.min(r1.searchedUpTo, r2.searchedUpTo) };
}

// ---------------------------------------------------------------------------
// English descriptions of worlds
// ---------------------------------------------------------------------------

const objLabel = (i: number) => `#${i + 1}`;

function nameOfObject(m: Interpretation, i: number, key: PredicateKeyEntry[]): string {
  const named = Object.entries(m.names).find(([n, v]) => v === i && key.some((k) => k.kind === 'name' && k.symbol === n));
  if (!named) return objLabel(i);
  const e = key.find((k) => k.kind === 'name' && k.symbol === named[0]);
  return e ? e.meaning : objLabel(i);
}

function instantiateMeaning(meaning: string, args: string[]): string {
  const vars = ['x', 'y', 'z'];
  return meaning.replace(/\b[xyz]\b/g, (v) => args[vars.indexOf(v)] ?? v);
}

/** Plain-English description of a finite world, using the key's readings where available. */
export function describeWorld(m: Interpretation, key: PredicateKeyEntry[] = []): string {
  const objs = Array.from({ length: m.domainSize }, (_, i) => nameOfObject(m, i, key));
  const parts: string[] = [];
  for (const [n, v] of Object.entries(m.names)) {
    const e = key.find((k) => k.kind === 'name' && k.symbol === n);
    if (!e) parts.push(`${n} names ${objLabel(v)}`);
  }
  const facts: string[] = [];
  const empties: string[] = [];
  for (const [sym, ext] of Object.entries(m.predicates)) {
    const e = key.find((k) => k.kind === 'predicate' && k.symbol === sym);
    if (ext.arity === 0) {
      facts.push(`${sym} is ${(ext as { value: boolean }).value ? 'true' : 'false'}`);
      continue;
    }
    const tuples = (ext as { extension: number[][] }).extension;
    if (!tuples.length) {
      empties.push(e ? `nothing satisfies "${e.meaning}"` : `${sym} is true of nothing`);
      continue;
    }
    for (const t of tuples) {
      const args = t.map((i) => objs[i]);
      facts.push(e ? instantiateMeaning(e.meaning, args) : `${sym} holds of ${args.length === 1 ? args[0] : `⟨${args.join(', ')}⟩`}`);
    }
  }
  const size = m.domainSize === 1 ? '1 thing' : `${m.domainSize} things`;
  const intro = `a world with ${size} (${joinList(objs)})`;
  const all = [...parts, ...facts, ...empties];
  return all.length ? `${intro} where ${joinList(all)}${facts.length ? ' (and nothing else holds)' : ''}` : `${intro} where nothing holds`;
}

const tv = (b: boolean) => (b ? 'true' : 'false');

/** Why `g` has its truth value in `m`: one step down (witness / counterexample / parts). */
export function explainModelTruth(g: Formula, m: Interpretation, assignment: Record<string, number> = {}): string {
  const val = evaluateIn(g, m, assignment);
  const s = format(g);
  const ev = (h: Formula, a = assignment) => evaluateIn(h, m, a);
  switch (g.kind) {
    case 'forall':
    case 'exists': {
      const hits: number[] = [];
      for (let i = 0; i < m.domainSize; i++) if (ev(g.body, { ...assignment, [g.variable]: i }) === (g.kind === 'exists')) hits.push(i);
      const body = format(g.body);
      if (g.kind === 'forall') {
        return val
          ? `${s} is true: ${body} holds for every object (${g.variable} = ${Array.from({ length: m.domainSize }, (_, i) => objLabel(i)).join(', ')}).`
          : `${s} is false: for ${g.variable} = ${objLabel(firstFalse(g, m, assignment))}, ${body} is false.`;
      }
      return val ? `${s} is true: ${body} holds for ${g.variable} = ${objLabel(hits[0])}.` : `${s} is false: ${body} is false for every object.`;
    }
    case 'not':
      return `${s} is ${tv(val)} because ${format(g.operand)} is ${tv(!val)}.`;
    case 'pred':
    case 'atom':
      return `${s} is ${tv(val)} in this world.`;
    default:
      return `${s} is ${tv(val)}: ${format(g.left)} is ${tv(ev(g.left))} and ${format(g.right)} is ${tv(ev(g.right))}.`;
  }
}

function firstFalse(g: Extract<Formula, { variable: string }>, m: Interpretation, a: Record<string, number>): number {
  for (let i = 0; i < m.domainSize; i++) if (!evaluateIn(g.body, m, { ...a, [g.variable]: i })) return i;
  return 0;
}

// ---------------------------------------------------------------------------
// Diagnosis by mutation
// ---------------------------------------------------------------------------

type PMutationCode =
  | 'universal-with-and'
  | 'existential-with-conditional'
  | 'converse'
  | 'no-as-not-all'
  | 'not-every-as-none'
  | 'quantifier-order'
  | 'quantifier-scope'
  | 'argument-order'
  | 'wrong-quantifier'
  | 'conditional-as-biconditional'
  | 'and-as-or'
  | 'or-as-and'
  | 'missing-negation';

const PRIORITY: PMutationCode[] = [
  'universal-with-and', 'existential-with-conditional', 'converse', 'no-as-not-all', 'not-every-as-none', 'quantifier-order',
  'quantifier-scope', 'argument-order', 'wrong-quantifier', 'conditional-as-biconditional', 'and-as-or', 'or-as-and', 'missing-negation',
];

interface PMutation {
  code: PMutationCode;
  original: Formula;
  replaced: Formula;
  whole: Formula;
}

const N = (x: Formula): Formula => ({ kind: 'not', operand: x });
const B = (kind: 'and' | 'or' | 'implies' | 'iff', l: Formula, r: Formula): Formula => ({ kind, left: l, right: r });
const Q = (kind: 'forall' | 'exists', v: string, body: Formula): Formula => ({ kind, variable: v, body });
const freeIn = (v: string, g: Formula) => freeVariables(g).includes(v);

function local(g: Formula): { code: PMutationCode; to: Formula }[] {
  const out: { code: PMutationCode; to: Formula }[] = [];
  if (isQuantified(g)) {
    const { variable: v, body } = g;
    const other = g.kind === 'forall' ? 'exists' : 'forall';
    if (g.kind === 'forall' && body.kind === 'implies') {
      out.push({ code: 'universal-with-and', to: Q('forall', v, B('and', body.left, body.right)) });
      if (body.right.kind === 'not') out.push({ code: 'no-as-not-all', to: N(Q('forall', v, B('implies', body.left, body.right.operand))) });
    }
    if (g.kind === 'forall' && body.kind === 'not') out.push({ code: 'no-as-not-all', to: N(Q('forall', v, body.operand)) });
    if (g.kind === 'exists' && body.kind === 'and') {
      out.push({ code: 'existential-with-conditional', to: Q('exists', v, B('implies', body.left, body.right)) });
      if (body.right.kind === 'not') out.push({ code: 'not-every-as-none', to: Q('forall', v, B('implies', body.left, body.right)) });
    }
    if (isQuantified(body) && body.kind !== g.kind) out.push({ code: 'quantifier-order', to: Q(body.kind, body.variable, Q(g.kind, v, body.body)) });
    if (isBinary(body)) {
      if (!freeIn(v, body.right)) out.push({ code: 'quantifier-scope', to: B(body.kind, Q(g.kind, v, body.left), body.right) });
      if (!freeIn(v, body.left)) out.push({ code: 'quantifier-scope', to: B(body.kind, body.left, Q(g.kind, v, body.right)) });
    }
    out.push({ code: 'wrong-quantifier', to: Q(other, v, body) });
    return out;
  }
  switch (g.kind) {
    case 'not': {
      const x = g.operand;
      if (x.kind === 'exists' && x.body.kind === 'and') {
        out.push({ code: 'no-as-not-all', to: N(Q('forall', x.variable, B('implies', x.body.left, x.body.right))) });
      }
      if (x.kind === 'exists') out.push({ code: 'no-as-not-all', to: N(Q('forall', x.variable, x.body)) });
      if (x.kind === 'forall' && x.body.kind === 'implies') out.push({ code: 'not-every-as-none', to: Q('forall', x.variable, B('implies', x.body.left, N(x.body.right))) });
      out.push({ code: 'missing-negation', to: x });
      break;
    }
    case 'pred':
      if (g.args.length === 2 && (g.args[0].kind !== g.args[1].kind || g.args[0].name !== g.args[1].name)) {
        out.push({ code: 'argument-order', to: { kind: 'pred', name: g.name, args: [g.args[1], g.args[0]] as Term[] } });
      }
      break;
    case 'atom':
      break;
    default:
      if (!isBinary(g)) break;
      if (g.kind === 'implies') {
        out.push({ code: 'converse', to: B('implies', g.right, g.left) });
        out.push({ code: 'conditional-as-biconditional', to: B('iff', g.left, g.right) });
      }
      if (g.kind === 'and') out.push({ code: 'and-as-or', to: B('or', g.left, g.right) });
      if (g.kind === 'or') out.push({ code: 'or-as-and', to: B('and', g.left, g.right) });
      // (Qx φ) ∘ ψ  →  Qx(φ ∘ ψ) when x is not free in ψ
      if (isQuantified(g.left) && !freeIn(g.left.variable, g.right)) out.push({ code: 'quantifier-scope', to: Q(g.left.kind, g.left.variable, B(g.kind, g.left.body, g.right)) });
      if (isQuantified(g.right) && !freeIn(g.right.variable, g.left)) out.push({ code: 'quantifier-scope', to: Q(g.right.kind, g.right.variable, B(g.kind, g.left, g.right.body)) });
  }
  return out;
}

function allMutations(key: Formula): PMutation[] {
  const out: PMutation[] = [];
  const walk = (g: Formula, rebuild: (x: Formula) => Formula) => {
    for (const m of local(g)) out.push({ code: m.code, original: g, replaced: m.to, whole: rebuild(m.to) });
    if (g.kind === 'not') walk(g.operand, (x) => rebuild(N(x)));
    else if (isQuantified(g)) walk(g.body, (x) => rebuild(Q(g.kind, g.variable, x)));
    else if (isBinary(g)) {
      const { kind, left, right } = g;
      walk(left, (x) => rebuild(B(kind, x, right)));
      walk(right, (x) => rebuild(B(kind, left, x)));
    }
  };
  walk(key, (x) => x);
  // A whole-formula argument swap for binary predicates (Lxy ↔ Lyx everywhere).
  const swapAll = (g: Formula): Formula =>
    g.kind === 'pred' && g.args.length === 2 ? { ...g, args: [g.args[1], g.args[0]] } : g.kind === 'not' ? N(swapAll(g.operand)) : isQuantified(g) ? Q(g.kind, g.variable, swapAll(g.body)) : isBinary(g) ? B(g.kind, swapAll(g.left), swapAll(g.right)) : g;
  const swapped = swapAll(key);
  if (!alphaEquals(swapped, key)) out.push({ code: 'argument-order', original: key, replaced: swapped, whole: swapped });
  return out.sort((a, b) => PRIORITY.indexOf(a.code) - PRIORITY.indexOf(b.code));
}

function findMutation(key: Formula, ans: Formula): PMutation | null {
  const ms = allMutations(key);
  // Cheap pass: exact (up to bound-variable renaming) matches first.
  for (const m of ms) if (alphaEquals(m.whole, ans)) return m;
  const dom = Math.min(3, maxDomainFor([key, ans]));
  for (const m of ms) {
    // "You reversed the conditional" is only said when the answer IS the converse (checked above);
    // an answer that merely happens to be equivalent to it (e.g. moved negations) gets the generic explanation.
    if (m.code === 'converse') continue;
    if (boundedEquivalent(m.whole, key, dom).equivalent) continue;
    if (boundedEquivalent(m.whole, ans, dom).equivalent) return m;
  }
  return null;
}

function mutationMessage(m: PMutation, ex: PredicateSymbolizationExercise): { headline: string; explanation: string } {
  const o = format(m.original);
  const has = (t: string) => ex.tags.includes(t);
  switch (m.code) {
    case 'universal-with-and':
      return {
        headline: '"All F are G" needs →, not ∧, under ∀.',
        explanation: `∀x(φ ∧ ψ) says that EVERYTHING is both φ and ψ. "All F are G" only says that anything which is F is G: use ∀x(φ → ψ), as in ${o}.`,
      };
    case 'existential-with-conditional':
      return {
        headline: '"Some F are G" needs ∧, not →, under ∃.',
        explanation: `∃x(φ → ψ) is true as soon as something is not φ — far too weak. "Some F are G" says something is both: ∃x(φ ∧ ψ), as in ${o}.`,
      };
    case 'converse':
      return has('only')
        ? { headline: '"Only" reverses the direction.', explanation: `"Only F are G" means every G is F: ∀x(Gx → Fx). It does not say that every F is G. The sentence needs ${o}.` }
        : { headline: 'You reversed a conditional.', explanation: `The condition goes on the left of the arrow. The sentence needs ${o}.` };
    case 'no-as-not-all':
      return {
        headline: '"No" / "nothing" / "nobody" is not the same as "not all".',
        explanation: `"No F is G" says NOTHING is both: ∀x(Fx → ¬Gx), equivalently ¬∃x(Fx ∧ Gx). ¬∀x(…) only says that not everything is — which leaves room for some. The sentence needs ${o}.`,
      };
    case 'not-every-as-none':
      return {
        headline: '"Not every" is weaker than "none".',
        explanation: `"Not every F is G" is ¬∀x(Fx → Gx), equivalently ∃x(Fx ∧ ¬Gx): at least one exception. ∀x(Fx → ¬Gx) would say that no F is G at all. The sentence needs ${o}.`,
      };
    case 'quantifier-order':
      return {
        headline: 'The order of the quantifiers matters.',
        explanation: `∀x∃y says each x has its own y; ∃y∀x says there is one y that works for every x. The sentence needs ${o}.`,
      };
    case 'quantifier-scope':
      return {
        headline: 'A quantifier has the wrong scope.',
        explanation: `A quantifier binds only the formula right after it (like ¬), so parentheses decide how much it covers. ${has('any') ? '"Any(one)" in an if-clause usually means "some(one)" with narrow scope — or "every(one)" with the whole conditional as scope. ' : ''}The sentence needs ${o}.`,
      };
    case 'argument-order':
      return {
        headline: 'The arguments of a relation are in the wrong order.',
        explanation: `Check the key: ${ex.key.filter((k) => k.kind === 'predicate' && k.arity >= 2).map(keyLabel).join('; ')}. The first place is the one doing the ${ex.key.find((k) => k.kind === 'predicate' && k.arity >= 2)?.meaning.replace(/^x /, '').replace(/ y$/, '') ?? 'relating'}. The sentence needs ${o}.`,
      };
    case 'wrong-quantifier':
      return {
        headline: 'Wrong quantifier: ∀ where ∃ is needed, or vice versa.',
        explanation: `"all", "every", "each", "any(one) who" signal ∀; "some", "a", "there is", "someone" signal ∃. The sentence needs ${o}.`,
      };
    case 'conditional-as-biconditional':
      return { headline: 'The sentence only goes one way; ↔ claims both.', explanation: `Use → unless the sentence says "all and only" / "if and only if". The sentence needs ${o}.` };
    case 'and-as-or':
      return { headline: 'You used ∨ where ∧ is needed.', explanation: `The sentence needs ${o}.` };
    case 'or-as-and':
      return { headline: 'You used ∧ where ∨ is needed.', explanation: `The sentence needs ${o}.` };
    case 'missing-negation':
      return { headline: 'You left out a negation.', explanation: `Look for "not", "no", "nothing", "nobody", "never" — each needs a ¬ with the right scope. The sentence needs ${o}.` };
  }
}

// ---------------------------------------------------------------------------
// Checking predicate symbolizations
// ---------------------------------------------------------------------------

function occurrences(text: string, re: RegExp): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  const g = new RegExp(re.source, 'g');
  while ((m = g.exec(text))) out.push({ start: m.index, end: m.index + m[0].length });
  return out;
}

export function checkPredicateSymbolization(ex: PredicateSymbolizationExercise, text: string): Feedback {
  const preds = ex.key.filter((k): k is Extract<PredicateKeyEntry, { kind: 'predicate' }> => k.kind === 'predicate');
  const names = ex.key.filter((k) => k.kind === 'name').map((k) => k.symbol);
  if (!text.trim()) {
    return { correct: false, severity: 'error', code: 'empty', headline: 'Type a formula first.', explanation: `Use the key: ${ex.key.map(keyLabel).join('; ')}. Quantifiers: ∀x, ∃x (variables u, w, x, y, z).` };
  }
  const p = parse(text);
  if (!p.ok) {
    return {
      correct: false,
      severity: 'error',
      code: 'parse-error',
      headline: "That isn't a well-formed formula yet.",
      explanation: p.error.message,
      details: p.error.hint ? [p.error.hint] : undefined,
      highlight: [{ target: 'answer', start: p.error.span.start, end: p.error.span.end, tone: 'error' }],
    };
  }
  const ans = p.formula;
  // Symbols
  const conflicts = arityConflicts(ans);
  if (conflicts.length) {
    const c = conflicts[0];
    return { correct: false, severity: 'error', code: 'arity-conflict', headline: `${c.name} is used with different numbers of arguments.`, explanation: `Each predicate letter always takes the same number of terms. Key: ${ex.key.map(keyLabel).join('; ')}.` };
  }
  for (const used of predicatesOf(ans)) {
    const k = preds.find((q) => q.symbol === used.name);
    if (!k || (used.arity === 0 && k.arity > 0)) {
      return {
        correct: false,
        severity: 'error',
        code: used.arity === 0 ? 'sentence-letter' : 'unknown-predicate',
        headline: used.arity === 0 ? `${used.name} has no arguments — predicates need terms.` : `${used.name} is not in the symbol key.`,
        explanation: used.arity === 0 ? `A predicate letter must be followed by its arguments, e.g. ${k ? `${k.symbol}${'xyz'.slice(0, k.arity)}` : preds[0] ? `${preds[0].symbol}${'xyz'.slice(0, preds[0].arity)}` : 'Fx'}. Key: ${ex.key.map(keyLabel).join('; ')}.` : `Use only the key's predicates: ${ex.key.map(keyLabel).join('; ')}.`,
        highlight: occurrences(text, new RegExp(`${used.name}(?=[a-z])|${used.name}\\b`)).map((s) => ({ target: 'answer' as const, ...s, tone: 'error' as const })),
      };
    }
    if (k.arity !== used.arity) {
      return {
        correct: false,
        severity: 'error',
        code: 'wrong-arity',
        headline: `${used.name} takes ${k.arity} argument${k.arity === 1 ? '' : 's'}, not ${used.arity}.`,
        explanation: `${keyLabel(k)} — write ${used.name} followed by exactly ${k.arity} term${k.arity === 1 ? '' : 's'} (names or variables).`,
      };
    }
  }
  const unknownNames = namesOf(ans).filter((n) => !names.includes(n));
  if (unknownNames.length) {
    const n = unknownNames[0];
    return {
      correct: false,
      severity: 'error',
      code: 'unknown-name',
      headline: `${n} is not a name in the key.`,
      explanation: `Lowercase a–t are names of particular things; u, w, x, y, z are variables, which need a quantifier. ${names.length ? `The key's names: ${ex.key.filter((k) => k.kind === 'name').map(keyLabel).join('; ')}.` : 'This sentence mentions no particular individual — use variables bound by quantifiers.'}`,
    };
  }
  const free = freeVariables(ans);
  if (free.length) {
    return {
      correct: false,
      severity: 'error',
      code: 'free-variable',
      headline: `The variable ${free[0]} is not bound by any quantifier.`,
      explanation: `A symbolization must be a sentence: every variable needs a quantifier (∀${free[0]} or ∃${free[0]}) whose scope covers it. Remember a quantifier covers only the formula right after it — ∀x Fx → Gx leaves the second x free; write ∀x(Fx → Gx).`,
    };
  }

  const key = f(ex.answer);
  const accepted = [ex.answer, ...ex.alternatives].map(f);
  if (accepted.some((a) => alphaEquals(a, ans))) {
    return { correct: true, severity: 'success', code: 'correct', headline: 'Correct!', explanation: ex.explanation };
  }
  const cmp = boundedEquivalent(key, ans);
  if (cmp.equivalent) {
    return {
      correct: true,
      severity: 'info',
      code: 'equivalent-nonstandard',
      headline: 'Correct — equivalent to the standard symbolization.',
      explanation: ex.explanation,
      details: [`The standard symbolization is ${ex.answer}. No world with up to ${cmp.searchedUpTo} objects tells your formula and it apart, so it is accepted.`],
    };
  }
  const world = describeWorld(cmp.model!, ex.key);
  const row = `In ${world}, the sentence is ${tv(!!cmp.firstTrue)}, but your formula is ${tv(!cmp.firstTrue)}.`;
  const m = findMutation(key, ans);
  const msg = m
    ? mutationMessage(m, ex)
    : {
        headline: "That doesn't say the same thing as the sentence.",
        explanation: `Compare the structure: ${notesFor(ex.tags).join(' ') || 'find the main quantifier or connective first, then symbolize each part.'}`,
      };
  return { correct: false, severity: 'error', code: m?.code ?? 'not-equivalent', headline: msg.headline, explanation: msg.explanation, details: [row, ...describeLines(cmp.model!)] };
}

function describeLines(m: Interpretation): string[] {
  return [`The world in symbols: domain {${Array.from({ length: m.domainSize }, (_, i) => objLabel(i)).join(', ')}}; ${Object.entries(m.names).map(([n, v]) => `${n} = ${objLabel(v)}`).concat(Object.entries(m.predicates).map(([p, e]) => e.arity === 0 ? `${p} = ${(e as { value: boolean }).value ? 'T' : 'F'}` : `${p} = {${(e as { extension: number[][] }).extension.map((t) => (t.length === 1 ? objLabel(t[0]) : `⟨${t.map(objLabel).join(',')}⟩`)).join(', ')}}`)).join('; ')}.`];
}

// ---------------------------------------------------------------------------
// Hints & solutions
// ---------------------------------------------------------------------------

export const PREDICATE_PATTERN_NOTES: Record<string, string> = {
  all: '"All F are G" / "every F is G": ∀x(Fx → Gx) — a universal with a conditional.',
  some: '"Some F are G" / "an F is G": ∃x(Fx ∧ Gx) — an existential with a conjunction.',
  no: '"No F are G": ∀x(Fx → ¬Gx), equivalently ¬∃x(Fx ∧ Gx).',
  'not-every': '"Not every F is G": ¬∀x(Fx → Gx), equivalently ∃x(Fx ∧ ¬Gx).',
  only: '"Only F are G": ∀x(Gx → Fx) — the "only" group goes on the RIGHT of the arrow.',
  names: 'Names (a–t) stand for particular individuals and need no quantifier.',
  relational: 'Keep the argument order of the key: Lxy means "x loves y", so "y is loved by x" is still Lxy.',
  multiple: 'With several quantifiers, work from the outside in, and watch the order: ∀x∃y ≠ ∃y∀x.',
  'quantifier-order': '∀x∃y: each x has its own y. ∃y∀x: one y serves every x.',
  restricted: 'A relative clause ("who studies", "that chases a cat") adds a conjunct to the antecedent.',
  scope: 'A quantifier covers only the formula right after it, so use parentheses to set its scope.',
  any: '"Any" in an if-clause is usually existential with narrow scope: "if anyone cheats" = ∃x Cx → …',
};

const NOTE_ORDER = ['only', 'no', 'not-every', 'quantifier-order', 'scope', 'any', 'restricted', 'multiple', 'relational', 'all', 'some', 'names'];
function notesFor(tags: string[], max = 2): string[] {
  return NOTE_ORDER.filter((t) => tags.includes(t)).slice(0, max).map((t) => PREDICATE_PATTERN_NOTES[t]);
}

function mainOperatorName(g: Formula): string {
  return g.kind === 'pred' ? 'a single predication (no quantifier or connective)' : `the ${CONNECTIVE_NAME[g.kind]} (${SYMBOL[g.kind as keyof typeof SYMBOL] ?? ''})`;
}

function skeleton(g: Formula): string {
  const mask = (h: Formula): Formula =>
    h.kind === 'pred' ? { kind: 'atom', name: '□' } : h.kind === 'atom' ? h : h.kind === 'not' ? N(mask(h.operand)) : isQuantified(h) ? Q(h.kind, h.variable, mask(h.body)) : isBinary(h) ? B(h.kind, mask(h.left), mask(h.right)) : h;
  return format(mask(g));
}

export function predicateSymbolizationHints(ex: PredicateSymbolizationExercise): string[] {
  const key = f(ex.answer);
  const hints = ['Find the main operator first: is the whole sentence about everything (∀), about something (∃), or a connective joining smaller claims?'];
  const notes = notesFor(ex.tags);
  if (notes.length) hints.push(notes.join(' '));
  hints.push(`The main operator of the standard symbolization is ${mainOperatorName(key)}.`);
  hints.push(`Shape (each □ is a predication from the key): ${skeleton(key)}`);
  return hints;
}

export function predicateSymbolizationSolution(ex: PredicateSymbolizationExercise): Solution {
  const alts = ex.alternatives.length ? ` Also accepted: ${ex.alternatives.join(';  ')}.` : '';
  return { answer: ex.answer, summary: `${ex.answer}.${alts} ${ex.explanation}`, steps: [`Key: ${ex.key.map(keyLabel).join('; ')}.`, ...notesFor(ex.tags)] };
}

// ---------------------------------------------------------------------------
// 'model' exercises: truth in a small world
// ---------------------------------------------------------------------------

const MODEL_TEMPLATES: Record<Difficulty, string[]> = {
  1: ['∀xFx', '∃xFx', '¬∃xFx', 'Fa', '∃x¬Fx', '¬∀xFx'],
  2: ['∀x(Fx → Gx)', '∃x(Fx ∧ Gx)', '∀x(Fx → ¬Gx)', '∃x(Fx ∧ ¬Gx)', 'Fa → ∀xGx', 'Fa ∧ ¬Ga'],
  3: ['∀x(Fx ∨ Gx)', '∃xFx → ∃xGx', '∀x(Fx → Gx) ∧ Fa', '¬∀x(Fx → Gx)', 'Rab', '∃xRax', '∀xRxb'],
  4: ['∀x∃yRxy', '∃x∀yRxy', '∀xRxx', '∃x(Fx ∧ ∀yRxy)', '∀x(Fx → ∃yRxy)', '∃y∀xRxy'],
  5: ['∀x∀y(Rxy → Ryx)', '∃x∃y(Rxy ∧ ¬Ryx)', '∀x(Fx → ∃y(Gy ∧ Rxy))', '∃y∀x(Fx → Rxy)', '∀x∃y(Rxy ∧ Fy)', '∀x(∃yRxy → Fx)'],
};

const MODEL_KEY: PredicateKeyEntry[] = [P('F', 1, 'x is red'), P('G', 1, 'x is round'), P('R', 2, 'x points to y'), Nm('a', 'Ann'), Nm('b', 'Ben')];

function randomModel(rng: Rng, g: Formula, size: number): Interpretation {
  const m: Interpretation = { domainSize: size, names: {}, predicates: {} };
  for (const n of namesOf(g)) m.names[n] = Math.floor(rng() * size);
  for (const { name, arity } of predicatesOf(g)) {
    if (arity === 0) {
      m.predicates[name] = { arity: 0, value: rng() < 0.5 };
      continue;
    }
    const tuples: number[][] = [];
    const rec = (prefix: number[]) => {
      if (prefix.length === arity) {
        if (rng() < (arity === 1 ? 0.5 : 0.4)) tuples.push(prefix);
        return;
      }
      for (let i = 0; i < size; i++) rec([...prefix, i]);
    };
    rec([]);
    m.predicates[name] = { arity, extension: tuples };
  }
  return m;
}

export function generateModelExercise(difficulty: Difficulty, seed: number): ModelExercise {
  const rng = makeRng(seed);
  const text = pick(rng, MODEL_TEMPLATES[difficulty]);
  const g = f(text);
  const size = difficulty <= 2 ? 2 : difficulty === 3 ? 2 + Math.floor(rng() * 2) : 3;
  const want = rng() < 0.5;
  let m = randomModel(rng, g, size);
  for (let i = 0; i < 40 && evaluateIn(g, m) !== want; i++) m = randomModel(rng, g, size);
  const used = new Set([...predicatesOf(g).map((p) => p.name), ...namesOf(g)]);
  return {
    id: `model-gen-${hash(`${text}|${JSON.stringify(m)}`)}`,
    kind: 'model',
    topic: 'model',
    difficulty,
    title: 'True in this world?',
    prompt: 'Is the sentence true or false in the world described?',
    tags: [],
    source: 'generated',
    formula: format(g),
    model: m,
    key: MODEL_KEY.filter((k) => used.has(k.symbol)),
    truth: evaluateIn(g, m),
  };
}

export function checkModelAnswer(ex: ModelExercise, value: boolean): Feedback {
  const g = f(ex.formula);
  const why = explainModelTruth(g, ex.model);
  if (value === ex.truth) return { correct: true, severity: 'success', code: 'correct', headline: `Correct — it is ${tv(ex.truth)} in this world.`, explanation: why };
  return {
    correct: false,
    severity: 'error',
    code: 'wrong-value',
    headline: `It is ${tv(ex.truth)} in this world.`,
    explanation: why,
    details: [g.kind === 'forall' ? 'A universal is false as soon as ONE object fails; check each object in turn.' : g.kind === 'exists' ? 'An existential is true as soon as ONE object works; check each object in turn.' : 'Evaluate the parts first, then the main connective.'],
  };
}

export function modelHints(ex: ModelExercise): string[] {
  const g = f(ex.formula);
  return [
    `The main operator is ${mainOperatorName(g)}.`,
    '∀x φ is true when φ holds for EVERY object; ∃x φ is true when φ holds for AT LEAST ONE object.',
    `Go through the objects one at a time (${Array.from({ length: ex.model.domainSize }, (_, i) => objLabel(i)).join(', ')}), checking the part inside the quantifier.`,
  ];
}

export function modelSolution(ex: ModelExercise): Solution {
  return { answer: tv(ex.truth), summary: explainModelTruth(f(ex.formula), ex.model), steps: describeLines(ex.model) };
}

// ---------------------------------------------------------------------------
// 'predicate-countermodel' exercises
// ---------------------------------------------------------------------------

export interface PredicateArgumentForm {
  name: string;
  premises: string[];
  conclusion: string;
  difficulty: Difficulty;
  note: string;
}

export const INVALID_PREDICATE_FORMS: PredicateArgumentForm[] = [
  { name: 'Affirming the consequent (quantified)', premises: ['∀x(Fx → Gx)', 'Ga'], conclusion: 'Fa', difficulty: 1, note: '{a} can be {G} without being {F}.' },
  { name: 'Denying the antecedent (quantified)', premises: ['∀x(Fx → Gx)', '¬Fa'], conclusion: '¬Ga', difficulty: 1, note: '{a} can be {G} for some other reason.' },
  { name: 'Some to all', premises: ['∃xFx'], conclusion: '∀xFx', difficulty: 1, note: 'One {F} does not make everything {F}.' },
  { name: 'Not all to none', premises: ['¬∀xFx'], conclusion: '∀x¬Fx', difficulty: 2, note: 'Some things may still be {F}.' },
  { name: 'Two somes', premises: ['∃xFx', '∃xGx'], conclusion: '∃x(Fx ∧ Gx)', difficulty: 2, note: 'The {F} and the {G} may be different things.' },
  { name: 'Converting "all"', premises: ['∀x(Fx → Gx)'], conclusion: '∀x(Gx → Fx)', difficulty: 2, note: '"All {F} are {G}" does not make all {G} {F}.' },
  { name: 'Some G, so some F', premises: ['∀x(Fx → Gx)', '∃xGx'], conclusion: '∃xFx', difficulty: 2, note: 'The {G} might not be {F} — and there may be no {F} at all.' },
  { name: 'Distributing ∀ over ∨', premises: ['∀x(Fx ∨ Gx)'], conclusion: '∀xFx ∨ ∀xGx', difficulty: 3, note: 'Each thing is {F} or {G}, but not all need be the same one.' },
  { name: 'Existential antecedent', premises: ['∃xFx → ∃xGx'], conclusion: '∀x(Fx → Gx)', difficulty: 3, note: 'Something is {G}, but that does not mean everything that is {F} is {G}.' },
  { name: 'Undistributed middle', premises: ['∃x(Fx ∧ Gx)', '∃x(Gx ∧ Hx)'], conclusion: '∃x(Fx ∧ Hx)', difficulty: 3, note: 'Different things may be the witnesses.' },
  { name: 'Quantifier shift', premises: ['∀x∃yRxy'], conclusion: '∃y∀xRxy', difficulty: 4, note: 'Each thing relating to something does not mean one thing everything relates to.' },
  { name: 'Reflexive from serial', premises: ['∀x∃yRxy'], conclusion: '∃xRxx', difficulty: 4, note: 'Everything may relate only to something else.' },
  { name: 'Diagonal to all pairs', premises: ['∀xRxx'], conclusion: '∀x∀yRxy', difficulty: 4, note: 'Relating to oneself says nothing about relating to others.' },
  { name: 'Serial to named loop', premises: ['∀x(Fx → ∃yRxy)', 'Fa'], conclusion: 'Raa', difficulty: 4, note: '{a} relates to something — not necessarily to itself.' },
  { name: 'Symmetry to reflexivity', premises: ['∀x∀y(Rxy → Ryx)', 'Rab'], conclusion: 'Raa', difficulty: 5, note: 'Symmetry gives {R}{b}{a}, not {R}{a}{a}.' },
  { name: 'One universal relater', premises: ['∃x∀yRxy'], conclusion: '∀xRxx', difficulty: 5, note: 'Only the special object must relate to itself.' },
];

/** Rename predicate letters and names throughout a formula. */
export function renameSymbols(g: Formula, preds: Record<string, string>, names: Record<string, string>): Formula {
  const t = (x: Term): Term => (x.kind === 'name' && names[x.name] ? { kind: 'name', name: names[x.name] } : x);
  switch (g.kind) {
    case 'atom':
      return g;
    case 'pred':
      return { kind: 'pred', name: preds[g.name] ?? g.name, args: g.args.map(t) };
    case 'not':
      return N(renameSymbols(g.operand, preds, names));
    case 'forall':
    case 'exists':
      return Q(g.kind, g.variable, renameSymbols(g.body, preds, names));
    default:
      return B(g.kind, renameSymbols(g.left, preds, names), renameSymbols(g.right, preds, names));
  }
}

/** Fill {F}, {G}, {R}, {a}, {b} placeholders in a form note with the exercise's own symbols. */
function fillNote(note: string, preds: Record<string, string>, names: Record<string, string>): string {
  return note.replace(/\{([A-Za-z])\}/g, (_, c: string) => preds[c] ?? names[c] ?? c);
}

export function generatePredicateCountermodel(difficulty: Difficulty, seed: number, opts: { excludeForms?: ReadonlySet<string> } = {}): PredicateCountermodelExercise {
  const rng = makeRng(seed);
  let pool = INVALID_PREDICATE_FORMS.filter((x) => x.difficulty === difficulty);
  if (!pool.length) pool = INVALID_PREDICATE_FORMS;
  const fresh = pool.filter((x) => !opts.excludeForms?.has(x.name));
  if (fresh.length) pool = fresh;
  for (let attempt = 0; ; attempt++) {
    const form = pick(rng, pool);
    const src = [...form.premises, form.conclusion].map(f);
    // Rename symbols injectively (a bijection), so distinct symbols stay distinct.
    const mon = shuffle(rng, ['F', 'G', 'H', 'J', 'K']);
    const rels = shuffle(rng, ['R', 'L', 'S', 'T']);
    const nms = shuffle(rng, ['a', 'b', 'c', 'd', 'e']);
    const predMap: Record<string, string> = {};
    let mi = 0;
    let ri = 0;
    for (const p of predicatesOf(...src)) predMap[p.name] = p.arity === 1 ? mon[mi++] : rels[ri++];
    const nameMap: Record<string, string> = {};
    namesOf(...src).forEach((n, k) => (nameMap[n] = nms[k]));
    const premises = src.slice(0, -1).map((g) => format(renameSymbols(g, predMap, nameMap)));
    const conclusion = format(renameSymbols(src[src.length - 1], predMap, nameMap));
    const all = [...premises, conclusion].map(f);
    // Safety net: only ever present arguments that really have a small countermodel.
    const check = findModel(all.slice(0, -1), [all[all.length - 1]], { maxDomain: 3 });
    if (check.status !== 'found' && attempt < 30) continue;
    return {
      id: `pcm-gen-${hash(`${premises.join(';')}⊢${conclusion}`)}`,
      kind: 'predicate-countermodel',
      topic: 'predicate-countermodel',
      difficulty,
      title: 'Build a countermodel',
      prompt: 'This argument is invalid. Describe a small world (domain, what each name refers to, and which objects each predicate is true of) where every premise is true and the conclusion is false.',
      tags: [],
      source: 'generated',
      premises,
      conclusion,
      predicates: predicatesOf(...all),
      names: namesOf(...all),
      maxDomain: 3,
      form: form.name,
      formNote: fillNote(form.note, predMap, nameMap),
    };
  }
}

/** Problems with a proposed interpretation (missing symbols, wrong arities, objects outside the domain). */
export function interpretationProblems(m: Interpretation, predicates: { name: string; arity: number }[], names: string[]): string[] {
  const out: string[] = [];
  if (!Number.isInteger(m.domainSize) || m.domainSize < 1) return ['The domain must contain at least one object.'];
  const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < m.domainSize;
  for (const n of names) {
    if (!(n in (m.names ?? {}))) out.push(`Say which object ${n} names.`);
    else if (!inRange(m.names[n])) out.push(`${n} must name an object in the domain.`);
  }
  for (const p of predicates) {
    const e = m.predicates?.[p.name];
    if (!e) {
      out.push(`Give an extension for ${p.name} (it may be empty).`);
      continue;
    }
    if (e.arity !== p.arity) out.push(`${p.name} takes ${p.arity} argument${p.arity === 1 ? '' : 's'}.`);
    if (e.arity > 0 && !(e as { extension: number[][] }).extension.every((t) => t.length === p.arity && t.every(inRange))) out.push(`${p.name}'s extension mentions objects outside the domain.`);
  }
  return out;
}

export function checkPredicateCountermodel(ex: PredicateCountermodelExercise, m: Interpretation): Feedback {
  const problems = interpretationProblems(m, ex.predicates, ex.names);
  if (problems.length) {
    return { correct: false, partial: true, severity: 'warning', code: 'incomplete-model', headline: 'The world is not fully described yet.', explanation: problems[0], details: problems.slice(1) };
  }
  const premises = ex.premises.map(f);
  const conclusion = f(ex.conclusion);
  const falsePrem = premises.map((p, i) => ({ p, i })).filter(({ p }) => !evaluateIn(p, m));
  const conclTrue = evaluateIn(conclusion, m);
  if (!falsePrem.length && !conclTrue) {
    return { correct: true, severity: 'success', code: 'correct', headline: 'That is a countermodel.', explanation: 'Every premise is true and the conclusion is false in your world, so the argument is invalid.' };
  }
  const details = [...falsePrem.map(({ p, i }) => `Premise ${i + 1}: ${explainModelTruth(p, m)}`), ...(conclTrue ? [`Conclusion: ${explainModelTruth(conclusion, m)}`] : [])];
  const what = [falsePrem.length ? `premise${falsePrem.length > 1 ? 's' : ''} ${joinList(falsePrem.map(({ i }) => String(i + 1)))} ${falsePrem.length > 1 ? 'are' : 'is'} false` : '', conclTrue ? 'the conclusion is true' : ''].filter(Boolean);
  return {
    correct: false,
    severity: 'error',
    code: conclTrue && !falsePrem.length ? 'conclusion-true' : 'premise-false',
    headline: `Not a countermodel: ${joinList(what)}.`,
    explanation: 'In a countermodel ALL the premises are true and the conclusion is false in the same world.',
    details: [...details, 'Start from the conclusion: what must the world be like for it to be false? Then add just enough to make the premises true.'],
  };
}

export function predicateCountermodelHints(ex: PredicateCountermodelExercise): string[] {
  return [
    `Make the conclusion ${ex.conclusion} false first. ${f(ex.conclusion).kind === 'forall' ? 'A universal is false if ONE object fails it.' : f(ex.conclusion).kind === 'exists' ? 'An existential is false only if NO object satisfies it.' : ''}`.trim(),
    'Then make each premise true, adding objects if needed. Small worlds (2 or 3 objects) are enough here.',
    ...(ex.formNote ? [`Why it fails: ${ex.formNote}`] : []),
  ];
}

export function predicateCountermodelSolution(ex: PredicateCountermodelExercise): Solution {
  const r = findModel(ex.premises.map(f), [f(ex.conclusion)], { maxDomain: 4 });
  if (r.status !== 'found' || !r.model) return { answer: 'no countermodel found', summary: r.note };
  return { answer: 'countermodel', summary: `A countermodel: ${describeWorld(r.model)}.`, steps: describeLines(r.model) };
}

/** Exposed for tests. */
export const _internal = { allMutations };
