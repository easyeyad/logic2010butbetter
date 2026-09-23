import { Link } from 'react-router-dom';
import { PageHeader } from '../../app/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import type { IconName } from '../../components/Icon';

type Kind = 'practice' | 'symbolization' | 'progress' | 'notFound';

const CONTENT: Record<Kind, { title: string; desc: string; icon: IconName; heading: string; body: string; bullets: string[]; cta?: { to: string; label: string } }> = {
  practice: {
    title: 'Practice',
    desc: 'Structured exercise sets that adapt to what you need to work on.',
    icon: 'practice',
    heading: 'No exercise sets assigned yet',
    body: 'This page will collect graded exercise sets across every skill in the course.',
    bullets: [
      'Exercise sets for derivations, truth tables, symbolization and countermodels',
      'Instant, specific feedback on every attempt',
      'Difficulty that grows with you',
    ],
    cta: { to: '/proofs', label: 'Practice a proof now' },
  },
  symbolization: {
    title: 'Symbolization',
    desc: 'Translate English sentences into sentential logic.',
    icon: 'symbol',
    heading: 'Nothing to translate yet',
    body: 'Here you will turn English sentences into formulas, with a scheme of abbreviation for each problem.',
    bullets: [
      'Sentences with an abbreviation scheme (P: “It is raining” …)',
      'Answers checked for equivalence, not exact wording',
      'Explanations of tricky words like “unless” and “only if”',
    ],
    cta: { to: '/truth-tables', label: 'Explore formulas in Truth Tables' },
  },
  progress: {
    title: 'Progress',
    desc: 'See what you have mastered and what to practice next.',
    icon: 'progress',
    heading: 'No progress recorded yet',
    body: 'As you complete exercises, this page will show your mastery of each rule and skill. Everything stays on this device.',
    bullets: ['Mastery per rule and skill', 'Recent activity and streaks', 'Suggestions for what to practice next'],
    cta: { to: '/proofs', label: 'Start a proof' },
  },
  notFound: {
    title: 'Page not found',
    desc: 'That address doesn’t match any page.',
    icon: 'search',
    heading: 'Nothing here',
    body: 'Use the navigation to find what you were looking for.',
    bullets: [],
    cta: { to: '/', label: 'Go to the dashboard' },
  },
};

export function PlaceholderPage({ kind }: { kind: Kind }) {
  const c = CONTENT[kind];
  return (
    <div className="page page--narrow">
      <PageHeader title={c.title} description={c.desc} />
      <EmptyState
        icon={c.icon}
        title={c.heading}
        bullets={c.bullets.length ? c.bullets : undefined}
        actions={c.cta && <Link to={c.cta.to} className="btn btn--primary">{c.cta.label}</Link>}
      >
        {c.body}
      </EmptyState>
    </div>
  );
}
