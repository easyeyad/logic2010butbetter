import type { Answer, Exercise, Feedback, Solution } from '../../../../learning';
import { CountermodelAnswer } from './CountermodelAnswer';
import { ModelAnswer } from './ModelAnswer';
import { PredicateCountermodelAnswer } from './PredicateCountermodelAnswer';
import { PredicateSymbolizationAnswer } from './PredicateSymbolizationAnswer';
import { DerivationAnswer } from './DerivationAnswer';
import { InferenceRuleAnswer } from './InferenceRuleAnswer';
import { SymbolizationAnswer } from './SymbolizationAnswer';
import { TerminologyAnswer } from './TerminologyAnswer';
import { TruthTableAnswer } from './TruthTableAnswer';
import { ValidityAnswer } from './ValidityAnswer';
import { WffAnswer } from './WffAnswer';

/** Dispatches to the purpose-built answer UI for the exercise kind. */
export function AnswerArea({
  exercise,
  initial,
  onChange,
  feedback,
  solution,
}: {
  exercise: Exercise;
  initial?: Answer;
  onChange: (a: Answer | null) => void;
  feedback?: Feedback | null;
  solution?: Solution | null;
}) {
  const common = { onChange, feedback, solution } as const;
  switch (exercise.kind) {
    case 'wff':
      return <WffAnswer exercise={exercise} initial={initial?.kind === 'wff' ? initial : undefined} {...common} />;
    case 'symbolization':
      return <SymbolizationAnswer exercise={exercise} initial={initial?.kind === 'symbolization' ? initial : undefined} {...common} />;
    case 'truth-table':
      return <TruthTableAnswer exercise={exercise} initial={initial?.kind === 'truth-table' ? initial : undefined} {...common} />;
    case 'validity':
      return <ValidityAnswer exercise={exercise} initial={initial?.kind === 'validity' ? initial : undefined} {...common} />;
    case 'countermodel':
      return <CountermodelAnswer exercise={exercise} initial={initial?.kind === 'countermodel' ? initial : undefined} {...common} />;
    case 'derivation':
      return <DerivationAnswer exercise={exercise} initial={initial?.kind === 'derivation' ? initial : undefined} {...common} />;
    case 'inference-rule':
      return <InferenceRuleAnswer exercise={exercise} initial={initial?.kind === 'inference-rule' ? initial : undefined} {...common} />;
    case 'terminology':
      return <TerminologyAnswer exercise={exercise} initial={initial?.kind === 'terminology' ? initial : undefined} {...common} />;
    case 'predicate-symbolization':
      return <PredicateSymbolizationAnswer exercise={exercise} initial={initial?.kind === 'predicate-symbolization' ? initial : undefined} {...common} />;
    case 'model':
      return <ModelAnswer exercise={exercise} initial={initial?.kind === 'model' ? initial : undefined} {...common} />;
    case 'predicate-countermodel':
      return <PredicateCountermodelAnswer exercise={exercise} initial={initial?.kind === 'predicate-countermodel' ? initial : undefined} {...common} />;
    default:
      return <p className="subtle">This kind of exercise can't be shown yet.</p>;
  }
}

/** The typed text of an answer (for "your answer" highlights). */
export function answerText(a: Answer | null): string | undefined {
  if (!a) return undefined;
  if (a.kind === 'symbolization' || a.kind === 'predicate-symbolization') return a.formula;
  if (a.kind === 'inference-rule') return a.formula;
  if (a.kind === 'terminology') return a.text;
  return undefined;
}
