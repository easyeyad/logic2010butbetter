import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TOPIC_INFO } from '../../../learning';
import { attempt } from '../../engine/safe';
import { useProgress } from '../../learning/progress';
import { PageHeader } from '../../app/PageHeader';
import { FormulaText } from '../../components/FormulaText';
import { Icon, type IconName } from '../../components/Icon';
import { readStored } from '../../hooks/storage';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { PROOF_STORAGE_KEY, type ProofDoc } from '../proofs/useProofEditor';
import { Onboarding } from './Onboarding';

export const ONBOARDING_KEY = 'onboarding-done';

const ACTIONS: { to: string; title: string; body: string; icon: IconName }[] = [
  { to: '/proofs', title: 'Start a proof', body: 'Derive a conclusion step by step with live checking.', icon: 'proof' },
  { to: '/truth-tables', title: 'Build a truth table', body: 'Every row, every subformula — or fill it in yourself.', icon: 'table' },
  { to: '/countermodels', title: 'Check an argument', body: 'Find out if it’s valid, and see a countermodel if not.', icon: 'target' },
  { to: '/reference', title: 'Look up a rule', body: 'Forms, examples and common mistakes for every rule.', icon: 'book' },
];

function ContinueProof() {
  const doc = readStored<ProofDoc | null>(PROOF_STORAGE_KEY, null);
  if (!doc || !doc.problem || !Array.isArray(doc.lines)) return null;
  const filled = doc.lines.filter((l) => l.text.trim()).length;
  return (
    <section className="card continue" aria-labelledby="continue-h">
      <div className="continue__text">
        <div className="problem__label">Continue where you left off</div>
        <h2 id="continue-h" className="continue__title">{doc.problem.title}</h2>
        <p className="subtle">
          <FormulaText text={`${doc.problem.premises.join(', ')} ⊢ ${doc.problem.goal}`} /> · {filled} line{filled === 1 ? '' : 's'} written
        </p>
      </div>
      <Link to="/proofs" className="btn btn--primary">
        Continue proof <Icon name="arrowRight" />
      </Link>
    </section>
  );
}

export function DashboardPage() {
  const [done, setDone] = useLocalStorage<boolean>(ONBOARDING_KEY, false);
  return (
    <div className="page">
      <PageHeader title="Welcome to Logic Studio" description="Practice sentential logic the way your course teaches it — with instant, specific feedback." />
      <div className="stack stack--lg">
        {!done && <Onboarding onDone={() => setDone(true)} />}
        <ContinueExercise />
        <ContinueProof />
        <ProgressSnapshot />
        <section aria-labelledby="qa-h">
          <h2 id="qa-h" className="section-h">Quick actions</h2>
          <ul className="actions-grid">
            {ACTIONS.map((a) => (
              <li key={a.to}>
                <Link to={a.to} className="action-card">
                  <span className="action-card__icon"><Icon name={a.icon} size={22} /></span>
                  <span className="action-card__title">{a.title}</span>
                  <span className="action-card__body">{a.body}</span>
                  <Icon name="arrowRight" size={18} className="action-card__arrow" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function ContinueExercise() {
  const [store, snap] = useProgress();
  const last = useMemo(() => attempt(() => store.getLastExercise()), [store, snap]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!last.ok || !last.value) return null;
  const ex = last.value.exercise;
  return (
    <section className="card continue" aria-labelledby="continue-ex-h">
      <div className="continue__text">
        <div className="problem__label">Continue your last exercise</div>
        <h2 id="continue-ex-h" className="continue__title">{ex.title}</h2>
        <p className="subtle">
          {TOPIC_INFO[ex.topic].title} · Level {ex.difficulty} · {ex.prompt}
        </p>
      </div>
      <Link to="/practice?resume=1" className="btn btn--primary">
        Continue exercise <Icon name="arrowRight" />
      </Link>
    </section>
  );
}

function ProgressSnapshot() {
  const [store, snap] = useProgress();
  const o = useMemo(() => attempt(() => store.overview(5)), [store, snap]); // eslint-disable-line react-hooks/exhaustive-deps
  const proofs = useMemo(() => attempt(() => store.listProofs(4)), [store, snap]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!o.ok) return null;
  const v = o.value;
  const rec = v.recommendation;
  return (
    <>
      <section aria-labelledby="snap-h">
        <div className="row row--between">
          <h2 id="snap-h" className="section-h">Your progress</h2>
          <Link to="/progress" className="subtle text-link">See all progress →</Link>
        </div>
        <div className="stat-row stat-row--cards">
          <div className="stat card"><span className="stat__value">{v.streak.current}</span><span className="stat__label">Day streak{v.streak.practicedToday ? ' · practiced today' : ''}</span></div>
          <div className="stat card"><span className="stat__value">{v.accuracy === null ? '—' : `${Math.round(100 * v.accuracy)}%`}</span><span className="stat__label">Accuracy · {v.totalAttempts} attempts</span></div>
          <div className="stat card"><span className="stat__value">{v.topics.filter((t) => t.attempts > 0).length}/{v.topics.length}</span><span className="stat__label">Topics practiced</span></div>
        </div>
      </section>
      <div className="dash-grid">
        <section className="card stack" aria-labelledby="dash-rec-h">
          <div className="problem__label">Recommended practice</div>
          <h2 id="dash-rec-h" className="continue__title">{TOPIC_INFO[rec.topic].title} · Level {rec.difficulty}</h2>
          <p className="subtle">{rec.reason}</p>
          {v.weakAreas.length > 0 && (
            <p className="subtle">
              <Icon name="alert" size={14} className="inline-icon" /> Weak areas: {v.weakAreas.map((w) => TOPIC_INFO[w.topic].title).join(', ')}
            </p>
          )}
          <div>
            <Link to={`/practice?topic=${rec.topic}&difficulty=${rec.difficulty}`} className="btn btn--primary">
              Start practice <Icon name="arrowRight" />
            </Link>
          </div>
        </section>
        <section className="card stack" aria-labelledby="dash-proofs-h">
          <div className="row row--between">
            <h2 id="dash-proofs-h" className="continue__title">Recent proofs</h2>
            <Link to="/proofs" className="subtle text-link">Proof editor →</Link>
          </div>
          {proofs.ok && proofs.value.length > 0 ? (
            <ul className="saved-proofs saved-proofs--compact">
              {proofs.value.map((p) => (
                <li key={p.id}>
                  <Icon name={p.status === 'complete' ? 'checkCircle' : 'circleDashed'} size={18} className={p.status === 'complete' ? 'ok-icon' : 'muted-icon'} />
                  <span className="grow">
                    <Link to={`/proofs?open=${encodeURIComponent(p.id)}`}>{p.title}</Link>
                    <span className="subtle"> · {p.status === 'complete' ? 'complete' : 'in progress'}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="subtle">Proofs you work on will show up here.</p>
          )}
        </section>
      </div>
    </>
  );
}
