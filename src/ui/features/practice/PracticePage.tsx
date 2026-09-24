import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Difficulty, ExerciseResult, PracticeSession, Topic } from '../../../learning';
import { createPracticeSession, mergeResult, TOPICS } from '../../../learning';
import { PageHeader } from '../../app/PageHeader';
import { Button } from '../../components/Button';
import { EngineError } from '../../components/Notice';
import { attempt } from '../../engine/safe';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { progressStore } from '../../learning/progress';
import { ExerciseRunner } from './ExerciseRunner';
import { PracticeSetup, topicTitle, type SetupChoice } from './PracticeSetup';
import { SessionSummary } from './SessionSummary';
import type { PracticeTopic } from './topics';

interface Run {
  session: PracticeSession;
  index: number;
  results: ExerciseResult[];
  finished: boolean;
  label: string;
}

function buildSession(c: SetupChoice): PracticeSession {
  const store = progressStore();
  const seed = Math.floor(Math.random() * 0x7fffffff);
  if (c.topic === 'mixed') {
    const byTopic: Partial<Record<Topic, Difficulty>> = {};
    if (c.difficulty === null) TOPICS.forEach((t) => (byTopic[t] = store.recommendedDifficulty(t)));
    return createPracticeSession({ topic: 'mixed', difficulty: c.difficulty ?? 2, count: c.count, seed, difficultyByTopic: c.difficulty === null ? byTopic : undefined });
  }
  const difficulty = c.difficulty ?? store.recommendedDifficulty(c.topic);
  return createPracticeSession({ topic: c.topic, difficulty, count: c.count, seed });
}

export default function PracticePage() {
  const [run, setRun] = useLocalStorage<Run | null>('practice-run', null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();

  const start = (c: SetupChoice) => {
    const r = attempt(() => buildSession(c));
    if (!r.ok) return setError(r.error);
    setError(null);
    const lvl = c.difficulty === null ? 'adaptive' : `level ${c.difficulty}`;
    setRun({ session: r.value, index: 0, results: [], finished: false, label: `${topicTitle(c.topic)} · ${lvl}` });
  };

  // Deep links: ?topic=wff&difficulty=2 starts a session; ?resume=1 continues the last exercise.
  useEffect(() => {
    const topic = params.get('topic') as PracticeTopic | null;
    const resume = params.get('resume');
    if (resume) {
      const last = attempt(() => progressStore().getLastExercise());
      if (last.ok && last.value) {
        const ex = last.value.exercise;
        setRun({
          session: { id: `resume-${ex.id}`, config: { topic: ex.topic, difficulty: ex.difficulty, count: 1, seed: 0 }, exercises: [ex] },
          index: 0,
          results: [],
          finished: false,
          label: 'Continuing your last exercise',
        });
      }
      setParams({}, { replace: true });
    } else if (topic && (topic === 'mixed' || (TOPICS as readonly string[]).includes(topic))) {
      const d = Number(params.get('difficulty'));
      start({ topic, difficulty: d >= 1 && d <= 5 ? (d as Difficulty) : null, count: Number(params.get('count')) || 5 });
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resumeState = useMemo(() => {
    if (!run || !run.session.id.startsWith('resume-')) return null;
    const last = attempt(() => progressStore().getLastExercise());
    return last.ok && last.value && last.value.exercise.id === run.session.exercises[0].id ? last.value : null;
    // Only when the run is (re)created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.session.id]);

  const onResult = (r: ExerciseResult) =>
    setRun((cur) => (cur ? { ...cur, results: mergeResult(cur.results, r) } : cur));
  const next = () =>
    setRun((cur) => {
      if (!cur) return cur;
      const i = cur.index + 1;
      return i >= cur.session.exercises.length ? { ...cur, finished: true } : { ...cur, index: i };
    });

  const total = run?.session.exercises.length ?? 0;
  const current = run && !run.finished ? run.session.exercises[run.index] : null;

  return (
    <div className="page">
      <PageHeader
        title="Practice"
        description={run ? run.label : 'Pick a topic and a level. Every answer gets specific feedback, and hints come before solutions.'}
        actions={
          run && !run.finished ? (
            <Button variant="ghost" icon="x" onClick={() => setRun((cur) => (cur ? { ...cur, finished: true } : cur))}>
              End session
            </Button>
          ) : undefined
        }
      />
      {error && <EngineError error={error} />}
      {!run && <PracticeSetup onStart={start} />}
      {run && current && (
        <div className="stack">
          {total > 1 && (
            <div className="session-progress">
              <div className="session-progress__text">
                Exercise {run.index + 1} of {total}
                <span className="subtle"> · {run.results.filter((r) => r.firstTryCorrect).length} correct on the first try so far</span>
              </div>
              <div
                className="progressbar"
                role="progressbar"
                aria-label="Session progress"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={run.index}
                aria-valuetext={`Exercise ${run.index + 1} of ${total}`}
              >
                <span style={{ width: `${(100 * run.index) / total}%` }} />
              </div>
            </div>
          )}
          <ExerciseRunner
            key={`${run.session.id}-${current.id}`}
            exercise={current}
            sessionId={run.session.id}
            initialAnswer={resumeState?.answerDraft}
            initialHints={resumeState?.hintsShown}
            onResult={onResult}
            onNext={next}
            nextLabel={run.index + 1 >= total ? 'Finish' : run.results.some((r) => r.exerciseId === current.id) ? 'Next' : 'Skip'}
          />
        </div>
      )}
      {run && run.finished && (
        <SessionSummary
          session={run.session}
          results={run.results}
          onNew={() => setRun(null)}
          onReview={(ids) =>
            setRun({
              session: { ...run.session, id: `${run.session.id}-review-${Date.now()}`, exercises: run.session.exercises.filter((e) => ids.includes(e.id)) },
              index: 0,
              results: [],
              finished: false,
              label: 'Reviewing mistakes',
            })
          }
        />
      )}
    </div>
  );
}
