import type { ExerciseResult, PracticeSession } from '../../../learning';
import { scoreSession, TOPIC_INFO, type Topic } from '../../../learning';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { attempt } from '../../engine/safe';

function fmtTime(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** End-of-session score, per-topic results and the review list. */
export function SessionSummary({
  session,
  results,
  onReview,
  onNew,
}: {
  session: PracticeSession;
  results: ExerciseResult[];
  onReview: (ids: string[]) => void;
  onNew: () => void;
}) {
  const r = attempt(() => scoreSession(session, results));
  if (!r.ok) return <p>Couldn't score this session.</p>;
  const s = r.value;
  const review = s.review;
  const REASON: Record<string, string> = {
    wrong: 'Not solved',
    'correct-after-retry': 'Solved after a retry',
    'solution-viewed': 'Solution viewed',
    partial: 'Partly right',
  };
  return (
    <section className="stack stack--lg" aria-labelledby="summary-h">
      <div className="card summary">
        <h2 id="summary-h">Session complete</h2>
        <div className="stat-row">
          <div className="stat"><span className="stat__value">{s.score}</span><span className="stat__label">Score / 100</span></div>
          <div className="stat"><span className="stat__value">{s.firstTryCorrect}/{s.total}</span><span className="stat__label">Right first try</span></div>
          <div className="stat"><span className="stat__value">{s.correctAfterRetry}</span><span className="stat__label">Right after a retry</span></div>
          <div className="stat"><span className="stat__value">{s.partial}</span><span className="stat__label">Partly right</span></div>
          <div className="stat"><span className="stat__value">{s.skipped}</span><span className="stat__label">Skipped</span></div>
          <div className="stat"><span className="stat__value">{s.hintsUsed}</span><span className="stat__label">Hints used</span></div>
          <div className="stat"><span className="stat__value">{fmtTime(s.totalTimeMs)}</span><span className="stat__label">Time</span></div>
        </div>
        {Object.keys(s.byTopic).length > 1 && (
          <ul className="bars" aria-label="Results by topic">
            {(Object.entries(s.byTopic) as [Topic, { total: number; correct: number; firstTryCorrect: number }][]).map(([t, v]) => (
              <li key={t} className="bar">
                <span className="bar__label">{TOPIC_INFO[t].title}</span>
                <span className="bar__track" aria-hidden="true"><span className="bar__fill" style={{ width: `${(100 * v.firstTryCorrect) / v.total}%` }} /></span>
                <span className="bar__value">{v.firstTryCorrect} of {v.total} first try</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {review.length > 0 ? (
        <div className="card stack">
          <h3>Worth reviewing</h3>
          <ul className="review-list">
            {review.map((e) => (
              <li key={e.exerciseId}>
                <Icon name="refresh" size={16} />
                <span className="review-list__text">
                  <span className="badge">{REASON[e.reason] ?? e.reason}</span> <strong>{e.title}</strong> · {TOPIC_INFO[e.topic].title}
                  <span className="review-list__label math">{e.label}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="row">
            <Button variant="primary" icon="refresh" onClick={() => onReview(review.map((e) => e.exerciseId))}>Practice these again</Button>
            <Button onClick={onNew}>New session</Button>
          </div>
        </div>
      ) : (
        <div className="row">
          <Button variant="primary" icon="play" onClick={onNew}>New session</Button>
        </div>
      )}
    </section>
  );
}
