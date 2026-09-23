/** Starter exercises for the proof editor (phase 1; the learning system will supply more). */
export interface SampleProblem {
  id: string;
  title: string;
  premises: string[];
  goal: string;
  /** Short strategy tag shown in the list. */
  strategy: 'DD' | 'CD' | 'ID';
  blurb: string;
}

export const SAMPLE_PROBLEMS: SampleProblem[] = [
  { id: 'mp-chain', title: 'Modus ponens chain', premises: ['P → Q', 'Q → R', 'P'], goal: 'R', strategy: 'DD', blurb: 'Apply MP twice.' },
  { id: 'hyp-syl', title: 'Hypothetical syllogism', premises: ['P → Q', 'Q → R'], goal: 'P → R', strategy: 'CD', blurb: 'Assume the antecedent.' },
  { id: 'contrapos', title: 'Contraposition', premises: ['P → Q'], goal: '¬Q → ¬P', strategy: 'CD', blurb: 'Assume ¬Q, then use MT.' },
  { id: 'dn', title: 'Double negation', premises: ['¬¬P', 'P → Q'], goal: 'Q', strategy: 'DD', blurb: 'Strip the double negation first.' },
  { id: 'id-neg', title: 'Indirect proof', premises: ['P → Q', 'P → ¬Q'], goal: '¬P', strategy: 'ID', blurb: 'Assume P and derive a contradiction.' },
  { id: 'dm-ish', title: 'Neither-nor', premises: ['¬(P ∨ Q)'], goal: '¬P', strategy: 'ID', blurb: 'Assume P, then use ADD.' },
];
