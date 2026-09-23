import { Link } from 'react-router-dom';
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
        <ContinueProof />
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
