import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Icon, type IconName } from '../../components/Icon';

const STEPS: { title: string; body: string; icon: IconName; to: string; cta: string }[] = [
  {
    title: 'Enter a formula',
    body: 'Type formulas with your keyboard — ASCII like -> & v ~ becomes → ∧ ∨ ¬ as you type — or tap the symbol buttons. Mistakes are underlined with an explanation.',
    icon: 'symbol',
    to: '/truth-tables',
    cta: 'Try it in Truth Tables',
  },
  {
    title: 'Practice a proof',
    body: 'Derivations work like Logic 2010: “Show” lines open boxes, you justify each line with a rule and line numbers, then close the box with DD, CD or ID.',
    icon: 'proof',
    to: '/proofs',
    cta: 'Open the proof editor',
  },
  {
    title: 'Check your answer',
    body: 'Every line is checked as you type. A check icon means the line is correct; an ✗ explains exactly what is wrong and how to fix it.',
    icon: 'checkCircle',
    to: '/countermodels',
    cta: 'Test an argument',
  },
  {
    title: 'Use hints',
    body: 'Stuck? Hints start with a strategy and get more specific each time. The full solution is always a separate, deliberate choice.',
    icon: 'lightbulb',
    to: '/reference',
    cta: 'Browse the rules',
  },
];

/** Dismissible 4-step introduction (state lives in the parent / localStorage). */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const s = STEPS[i];
  const last = i === STEPS.length - 1;
  return (
    <section className="onboarding card" aria-labelledby="onb-title" aria-describedby="onb-body">
      <div className="onboarding__top">
        <span className="badge badge--accent">Getting started · Step {i + 1} of {STEPS.length}</span>
        <Button variant="ghost" size="sm" onClick={onDone}>Skip intro</Button>
      </div>
      <div className="onboarding__main">
        <span className="onboarding__icon"><Icon name={s.icon} size={28} /></span>
        <div className="stack stack--sm">
          <h2 id="onb-title">{s.title}</h2>
          <p id="onb-body" className="muted">{s.body}</p>
          <Link to={s.to} className="onboarding__link">{s.cta} <Icon name="arrowRight" size={16} /></Link>
        </div>
      </div>
      <div className="onboarding__foot">
        <ol className="dots" aria-label="Steps">
          {STEPS.map((st, j) => (
            <li key={st.title}>
              <button type="button" className={`dot ${j === i ? 'is-active' : ''}`} aria-label={`Step ${j + 1}: ${st.title}`} aria-current={j === i ? 'step' : undefined} onClick={() => setI(j)} />
            </li>
          ))}
        </ol>
        <div className="row">
          <Button size="sm" disabled={i === 0} onClick={() => setI(i - 1)}>Back</Button>
          <Button size="sm" variant="primary" onClick={() => (last ? onDone() : setI(i + 1))}>{last ? 'Get started' : 'Next'}</Button>
        </div>
      </div>
    </section>
  );
}
