import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TOPIC_INFO } from '../../../learning';
import { PageHeader } from '../../app/PageHeader';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { Notice } from '../../components/Notice';
import { useToast } from '../../components/Toast';
import { useProgress } from '../../learning/progress';
import { ActivityChart } from './ActivityChart';

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(100 * x)}%`);

export default function ProgressPage() {
  const [store, snap] = useProgress();
  const toast = useToast();
  const navigate = useNavigate();
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const o = useMemo(() => store.overview(12), [store, snap]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => store.activityByDay(14), [store, snap]); // eslint-disable-line react-hooks/exhaustive-deps
  const proofs = useMemo(() => store.listProofs(20), [store, snap]); // eslint-disable-line react-hooks/exhaustive-deps
  const rec = o.recommendation;

  const exportData = () => {
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logic-studio-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importFile = async (f: File) => {
    const ok = store.importData(await f.text());
    toast.show(ok ? 'Progress imported.' : "That file isn't a Logic Studio progress export.");
  };

  return (
    <div className="page">
      <PageHeader title="Progress" description="Everything here is stored on this device. Export it to move to another browser." />
      {store.loadIssue && (
        <Notice tone="warn" title="Your saved progress couldn't be read">
          It was backed up and a fresh record was started.
        </Notice>
      )}
      <div className="stack stack--lg">
        <section aria-labelledby="ov-h">
          <h2 id="ov-h" className="section-h">Overview</h2>
          <div className="stat-row stat-row--cards">
            <div className="stat card"><span className="stat__value">{pct(o.accuracy)}</span><span className="stat__label">Accuracy</span></div>
            <div className="stat card"><span className="stat__value">{o.totalAttempts}</span><span className="stat__label">Attempts ({o.correct} correct)</span></div>
            <div className="stat card">
              <span className="stat__value">{o.streak.current} day{o.streak.current === 1 ? '' : 's'}</span>
              <span className="stat__label">Streak · best {o.streak.longest}{o.streak.practicedToday ? ' · practiced today' : ''}</span>
            </div>
            <div className="stat card"><span className="stat__value">{o.topics.filter((t) => t.attempts > 0).length} / {o.topics.length}</span><span className="stat__label">Topics practiced</span></div>
          </div>
        </section>

        <section className="card rec" aria-labelledby="rec-h2">
          <div className="rec__text">
            <div className="problem__label">Recommended next</div>
            <h2 id="rec-h2" className="rec__title">{TOPIC_INFO[rec.topic].title} · Level {rec.difficulty}</h2>
            <p className="subtle">{rec.reason}</p>
          </div>
          <Button variant="primary" icon="play" onClick={() => navigate(`/practice?topic=${rec.topic}&difficulty=${rec.difficulty}`)}>
            Start this practice
          </Button>
        </section>

        <div className="progress-grid">
          <section className="card stack" aria-labelledby="topics-h">
            <h2 id="topics-h" className="card__title">Accuracy by topic</h2>
            <ul className="bars">
              {o.topics.map((t) => (
                <li key={t.topic} className="bar" title={`${t.title}: ${t.attempts} attempts, ${pct(t.accuracy)} accuracy, level ${t.level}`}>
                  <span className="bar__label">{t.title}</span>
                  <span className="bar__track" aria-hidden="true">
                    <span className="bar__fill" style={{ width: `${t.accuracy === null ? 0 : 100 * t.accuracy}%` }} />
                  </span>
                  <span className="bar__value">
                    {t.attempts === 0 ? 'Not started' : `${pct(t.accuracy)} of ${t.attempts}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card stack" aria-labelledby="weak-h">
            <h2 id="weak-h" className="card__title">Areas to strengthen</h2>
            {o.weakAreas.length === 0 ? (
              <p className="subtle">No weak areas yet — they appear after a few attempts in a topic.</p>
            ) : (
              <ul className="weak-list">
                {o.weakAreas.map((w) => (
                  <li key={w.topic}>
                    <Icon name="alert" size={18} />
                    <div className="grow">
                      <strong>{TOPIC_INFO[w.topic].title}</strong>
                      <div className="subtle">{w.reason}</div>
                    </div>
                    <Link className="btn btn--sm" to={`/practice?topic=${w.topic}`}>Practice</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="card stack" aria-labelledby="act-h">
          <h2 id="act-h" className="card__title">Activity, last 14 days</h2>
          <ActivityChart days={days} />
        </section>

        <section className="card stack" aria-labelledby="proofs-h">
          <h2 id="proofs-h" className="card__title">Saved proofs</h2>
          {proofs.length === 0 ? (
            <EmptyState icon="proof" title="No saved proofs yet" actions={<Link to="/proofs" className="btn btn--primary">Open the proof editor</Link>}>
              Proofs you work on are saved here automatically.
            </EmptyState>
          ) : (
            <ul className="saved-proofs">
              {proofs.map((p) => (
                <li key={p.id}>
                  <span className={`badge ${p.status === 'complete' ? 'badge--ok' : ''}`}>
                    <Icon name={p.status === 'complete' ? 'checkCircle' : 'circleDashed'} />
                    {p.status === 'complete' ? 'Complete' : 'In progress'}
                  </span>
                  <span className="grow saved-proofs__title">
                    <strong>{p.title}</strong>
                    <span className="subtle"> · updated {new Date(p.updatedAt).toLocaleDateString()}</span>
                  </span>
                  <Link className="btn btn--sm" to={`/proofs?open=${encodeURIComponent(p.id)}`}>Open</Link>
                  <Button size="sm" variant="ghost" iconOnly icon="trash" label={`Delete saved proof ${p.title}`} onClick={() => store.deleteProof(p.id)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card stack" aria-labelledby="data-h">
          <h2 id="data-h" className="card__title">Your data</h2>
          <div className="row">
            <Button icon="download" onClick={exportData}>Export progress</Button>
            <Button icon="refresh" onClick={() => fileRef.current?.click()}>Import progress…</Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="visually-hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = '';
              }}
            />
            <Button variant="danger" icon="trash" onClick={() => setConfirmReset(true)}>Reset progress</Button>
          </div>
        </section>
      </div>
      <ConfirmDialog
        open={confirmReset}
        title="Reset all progress?"
        message="Attempts, streaks, saved proofs and your last exercise will be deleted from this browser. Export first if you want a backup."
        confirmLabel="Reset progress"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          store.reset();
          setConfirmReset(false);
          toast.show('Progress reset.');
        }}
      />
    </div>
  );
}
