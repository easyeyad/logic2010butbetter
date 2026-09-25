import { useCallback, useEffect, useRef, useState } from 'react';
import type { Answer, Exercise, ExerciseResult, Feedback, Solution } from '../../../learning';
import { describeValuation, TOPIC_INFO } from '../../../learning';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/Dialog';
import { FormulaText } from '../../components/FormulaText';
import { Icon } from '../../components/Icon';
import { EngineError } from '../../components/Notice';
import { attempt } from '../../engine/safe';
import { progressStore } from '../../learning/progress';
import { safeCheckAnswer, safeHints, safeSolution } from '../../learning/safeLearning';
import { AnswerArea, answerText } from './answers/AnswerArea';
import { FeedbackView } from './FeedbackView';

export interface RunnerProps {
  exercise: Exercise;
  /** Restored answer / hint count (continue last exercise). */
  initialAnswer?: Answer;
  initialHints?: number;
  sessionId?: string;
  /** Called after every check or solution reveal with the latest result. */
  onResult?: (r: ExerciseResult) => void;
  /** Shows a Next button (and enables the N key). */
  onNext?: () => void;
  nextLabel?: string;
  /** Header slot, e.g. "3 of 10". */
  position?: string;
}

const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['radio', 'checkbox', 'button'].includes((el as HTMLInputElement).type)) || el.isContentEditable);

/**
 * One exercise: prompt, the kind-specific answer UI, Check (Enter), Hint (H,
 * progressive), Show solution (confirmed), Retry, Next (N). Every check is
 * recorded to the progress store.
 */
export function ExerciseRunner({ exercise, initialAnswer, initialHints = 0, sessionId, onResult, onNext, nextLabel = 'Next', position }: RunnerProps) {
  const [answer, setAnswer] = useState<Answer | null>(initialAnswer ?? null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hintsShown, setHintsShown] = useState(initialHints);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [confirmSolution, setConfirmSolution] = useState(false);
  const [solved, setSolved] = useState(false);
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  const started = useRef(Date.now());
  const hints = useRef<string[] | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const store = progressStore();

  const allHints = () => (hints.current ??= safeHints(exercise));
  const onChange = useCallback((a: Answer | null) => setAnswer(a), []);

  // Remember the work in progress for "Continue last exercise".
  useEffect(() => {
    if (solved) return;
    const t = setTimeout(() => {
      attempt(() => store.setLastExercise(exercise, { answerDraft: answer ?? undefined, hintsShown, sessionId }));
    }, 600);
    return () => clearTimeout(t);
  }, [answer, hintsShown, exercise, sessionId, solved, store]);

  const report = (fb: Feedback | null, solutionViewed: boolean) =>
    onResult?.({
      // A check counts as an attempt; revealing the solution does not.
      attempts: solutionViewed ? 0 : 1,
      exerciseId: exercise.id,
      feedback: fb ? { correct: fb.correct, partial: fb.partial } : undefined,
      correct: fb?.correct ?? false,
      hintsUsed: hintsShown,
      solutionViewed: solutionViewed || Boolean(solution),
      timeMs: Date.now() - started.current,
    });

  const check = () => {
    if (!answer || !canCheck) return;
    setCheckedKey(JSON.stringify(answer));
    const r = safeCheckAnswer(exercise, answer);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setFeedback(r.value);
    const fb = r.value;
    attempt(() =>
      store.recordAttempt({
        exerciseId: exercise.id,
        topic: exercise.topic,
        difficulty: exercise.difficulty,
        correct: fb.correct,
        partial: fb.partial,
        hintsUsed: hintsShown,
        timeMs: Date.now() - started.current,
        solutionViewed: Boolean(solution),
      }),
    );
    if (fb.correct) {
      setSolved(true);
      attempt(() => store.clearLastExercise());
    }
    report(fb, false);
    requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>('[data-testid="feedback"]')?.scrollIntoView?.({ block: 'nearest' }));
  };

  const hint = () => {
    const list = allHints();
    if (hintsShown < list.length) setHintsShown((n) => n + 1);
  };

  const revealSolution = () => {
    setConfirmSolution(false);
    const r = safeSolution(exercise);
    if (!r.ok) return setError(r.error);
    setSolution(r.value);
    attempt(() => store.clearLastExercise());
    report(feedback, true);
  };

  const retry = () => {
    setFeedback(null);
    requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>('.exercise__answer input, .exercise__answer textarea, .exercise__answer button')?.focus());
  };

  // Keyboard: Enter checks (not inside the proof editor), H hint, N next.
  const keyState = useRef({ check, hint, onNext, answer, feedback });
  keyState.current = { check, hint, onNext, answer, feedback };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const t = e.target as HTMLElement;
      if (!rootRef.current || (t !== document.body && !rootRef.current.contains(t))) return;
      const s = keyState.current;
      if (e.key === 'Enter' && exercise.kind !== 'derivation') {
        if (t.tagName === 'BUTTON' || t.getAttribute('role') === 'gridcell' || t.tagName === 'A') return;
        if (s.answer) {
          e.preventDefault();
          s.check();
        }
        return;
      }
      if (isTextField(t)) return;
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        s.hint();
      } else if ((e.key === 'n' || e.key === 'N') && s.onNext && (s.feedback || solution)) {
        e.preventDefault();
        s.onNext();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [exercise.kind, solution]);

  const hintList = hints.current ?? (hintsShown > 0 ? allHints() : []);
  const totalHints = allHints().length;
  const info = TOPIC_INFO[exercise.topic];
  // Check is available whenever the current answer hasn't been checked yet —
  // including after a correct answer, if the student edits it.
  const canCheck = Boolean(answer) && JSON.stringify(answer) !== checkedKey;

  return (
    <article ref={rootRef} className="exercise" aria-labelledby={`ex-title-${exercise.id}`} data-kind={exercise.kind}>
      <header className="exercise__head">
        <div className="row">
          <span className="badge badge--accent">{info.title}</span>
          <span className="badge" aria-label={`Difficulty ${exercise.difficulty} of 5`}>Level {exercise.difficulty}</span>
          {position && <span className="subtle">{position}</span>}
        </div>
        <h2 id={`ex-title-${exercise.id}`} className="exercise__title">{exercise.title}</h2>
        <p className="exercise__prompt">{exercise.prompt}</p>
      </header>

      <div className="exercise__answer">
        <AnswerArea exercise={exercise} initial={initialAnswer} onChange={onChange} feedback={feedback} solution={solution} />
      </div>

      <div className="exercise__actions">
        <Button variant="primary" icon="check" onClick={check} disabled={!canCheck} title="Check (Enter)">
          {feedback && canCheck ? 'Check again' : 'Check'}
        </Button>
        <Button icon="lightbulb" onClick={hint} disabled={hintsShown >= totalHints} title="Hint (H)">
          {totalHints === 0 ? 'No hints' : hintsShown >= totalHints ? 'No more hints' : hintsShown === 0 ? 'Hint' : `Hint ${hintsShown + 1} of ${totalHints}`}
        </Button>
        {feedback && !feedback.correct && (
          <Button variant="ghost" icon="refresh" onClick={retry}>
            Retry
          </Button>
        )}
        <Button variant="ghost" icon="eye" onClick={() => setConfirmSolution(true)} disabled={Boolean(solution)}>
          Show solution
        </Button>
        {onNext && (
          <Button className="exercise__next" variant={feedback?.correct || solution ? 'primary' : 'default'} iconRight="arrowRight" onClick={onNext} title="Next (N)">
            {nextLabel}
          </Button>
        )}
      </div>
      <p className="exercise__keys subtle hide-touch">
        <kbd>Enter</kbd> check · <kbd>H</kbd> hint{onNext ? <> · <kbd>N</kbd> next</> : null}
      </p>

      {error && <EngineError error={error} />}

      {hintsShown > 0 && (
        <ol className="hints" aria-label="Hints">
          {hintList.slice(0, hintsShown).map((h, i) => (
            <li key={i} className="hint">
              <div className="hint__level">
                <Icon name="lightbulb" size={14} /> Hint {i + 1}
              </div>
              <p>{h}</p>
            </li>
          ))}
        </ol>
      )}

      {feedback && <FeedbackView feedback={feedback} exercise={exercise} answerText={answerText(answer)} />}

      {solution && <SolutionView solution={solution} exercise={exercise} />}

      <ConfirmDialog
        open={confirmSolution}
        title="Show the solution?"
        message="Try a hint first if you haven't — you'll remember it better. Viewing the solution means this exercise won't count toward your score."
        confirmLabel="Show solution"
        onCancel={() => setConfirmSolution(false)}
        onConfirm={revealSolution}
      />
    </article>
  );
}

function SolutionView({ solution, exercise }: { solution: Solution; exercise: Exercise }) {
  const key = exercise.kind === 'symbolization' ? exercise.key : [];
  const english = solution.valuation ? attempt(() => describeValuation(solution.valuation!, key)) : null;
  return (
    <section className="solution" aria-label="Solution">
      <div className="solution__head">
        <Icon name="eye" size={18} /> Solution
      </div>
      {exercise.kind !== 'derivation' && (
        <p className="solution__answer">
          <FormulaText text={solution.answer} />
        </p>
      )}
      <p>{solution.summary}</p>
      {solution.steps && solution.steps.length > 0 && (
        <ol className="solution__steps">
          {solution.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
      {english && english.ok && english.value && <p className="subtle">Countermodel: {english.value}.</p>}
      {exercise.kind === 'derivation' && solution.derivation && <p className="subtle">The model derivation has been loaded into the editor above (Undo restores yours).</p>}
    </section>
  );
}
