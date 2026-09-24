import type { AnswerOf, ExerciseOf, Feedback, HighlightSpan, Solution, Topic } from '../../../../learning';

/** Contract shared by every per-kind answer UI. */
export interface AnswerProps<K extends Topic> {
  exercise: ExerciseOf<K>;
  /** Restored work in progress. */
  initial?: AnswerOf<K>;
  /** Report the current answer; null while it is incomplete. */
  onChange: (a: AnswerOf<K> | null) => void;
  feedback?: Feedback | null;
  /** Revealed solution (derivations load it into the editor). */
  solution?: Solution | null;
}

export function formulaSpans(fb?: Feedback | null): HighlightSpan[] | undefined {
  return fb?.highlight?.filter((h) => h.target === 'formula');
}
