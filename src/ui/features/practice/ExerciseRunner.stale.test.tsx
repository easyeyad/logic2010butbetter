/**
 * Round-7 N1: feedback belongs to the answer it was computed for. For EVERY
 * exercise kind (8 sentential + 5 predicate topics), after a check and an edit:
 *  - the feedback is marked out of date (banner; dimmed, inert, aria-hidden),
 *  - the answer UI no longer receives the feedback (no highlights on the new answer),
 *  - "Your answer" quotes the checked answer, never the edited one,
 *  - reverting to the checked answer, or checking again, makes it current.
 *
 * The per-kind answer UI is replaced by a probe so every kind can be driven with
 * exact Answer values; real-UI repros live in ExerciseRunner.staleUi.test.tsx.
 */
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createDerivationDraft,
  createMemoryStorage,
  generateExercise,
  ProgressStore,
  type Answer,
  type Exercise,
  type Feedback,
  type Topic,
} from '../../../learning';
import { setProgressStore } from '../../learning/progress';
import { renderWithProviders } from '../../test/utils';

const probe: { onChange: ((a: Answer | null) => void) | null; feedbackProps: (Feedback | null | undefined)[] } = { onChange: null, feedbackProps: [] };

vi.mock('./answers/AnswerArea', async (orig) => {
  const real = await orig<typeof import('./answers/AnswerArea')>();
  return {
    ...real,
    AnswerArea: (p: { onChange: (a: Answer | null) => void; feedback?: Feedback | null }) => {
      probe.onChange = p.onChange;
      probe.feedbackProps.push(p.feedback);
      return <div data-testid="answer-probe" />;
    },
  };
});

// Imported after the mock is declared (vi.mock is hoisted anyway).
import { ExerciseRunner } from './ExerciseRunner';

beforeEach(() => {
  localStorage.clear();
  setProgressStore(new ProgressStore(createMemoryStorage()));
  probe.onChange = null;
  probe.feedbackProps = [];
});
afterEach(() => setProgressStore(null));

/** Two different, well-formed answers for an exercise. */
function twoAnswers(ex: Exercise): [Answer, Answer] {
  switch (ex.kind) {
    case 'wff':
      return [{ kind: 'wff', wellFormed: true }, { kind: 'wff', wellFormed: false, errorAt: 0 }];
    case 'symbolization':
      return [{ kind: 'symbolization', formula: 'P' }, { kind: 'symbolization', formula: 'Q ∧ R' }];
    case 'truth-table':
      return ex.mode === 'classify'
        ? [{ kind: 'truth-table', classification: 'tautology' }, { kind: 'truth-table', classification: 'contingent' }]
        : [{ kind: 'truth-table', values: [true, true] }, { kind: 'truth-table', values: [false, true] }];
    case 'validity':
      return [{ kind: 'validity', valid: true }, { kind: 'validity', valid: false }];
    case 'countermodel': {
      const all = (b: boolean) => Object.fromEntries(ex.atoms.map((a) => [a, b]));
      return [{ kind: 'countermodel', valuation: all(true) }, { kind: 'countermodel', valuation: all(false) }];
    }
    case 'derivation': {
      const d = createDerivationDraft(ex);
      return [
        { kind: 'derivation', draft: d },
        { kind: 'derivation', draft: { ...d, lines: [...d.lines, { ...d.lines[d.lines.length - 1], id: 'extra', text: 'P' }] } },
      ];
    }
    case 'inference-rule':
      return ex.mode === 'identify'
        ? [{ kind: 'inference-rule', rule: ex.choices[0] }, { kind: 'inference-rule', rule: ex.choices[1] ?? (ex.choices[0] === 'MP' ? 'MT' : 'MP') }]
        : [{ kind: 'inference-rule', formula: 'P' }, { kind: 'inference-rule', formula: 'Q ∧ R' }];
    case 'terminology':
      switch (ex.format) {
        case 'click-connective':
          return [{ kind: 'terminology', position: 0 }, { kind: 'terminology', position: 1 }];
        case 'true-false':
          return [{ kind: 'terminology', value: true, choice: 0 }, { kind: 'terminology', value: false, choice: 0 }];
        case 'multiple-choice':
          return [{ kind: 'terminology', choice: 0 }, { kind: 'terminology', choice: 1 }];
        default:
          return [{ kind: 'terminology', text: 'P' }, { kind: 'terminology', text: 'Q ∧ R' }];
      }
    case 'predicate-symbolization':
      return [{ kind: 'predicate-symbolization', formula: 'Fa' }, { kind: 'predicate-symbolization', formula: '∀x(Fx → Gx)' }];
    case 'model':
      return [{ kind: 'model', value: true }, { kind: 'model', value: false }];
    case 'predicate-countermodel': {
      const m = (ext: number[][]) => ({
        domainSize: 2,
        names: Object.fromEntries(ex.names.map((n) => [n, 0])),
        predicates: Object.fromEntries(ex.predicates.map((p) => [p.name, p.arity === 0 ? { arity: 0 as const, value: ext.length > 0 } : { arity: p.arity, extension: p.arity === 1 ? ext : [] }])),
      });
      return [{ kind: 'predicate-countermodel', model: m([[0]]) }, { kind: 'predicate-countermodel', model: m([[1]]) }];
    }
  }
  throw new Error(`no answers for ${(ex as Exercise).kind}`);
}

const TOPICS: Topic[] = [
  'wff',
  'symbolization',
  'truth-table',
  'validity',
  'countermodel',
  'inference-rule',
  'derivation',
  'terminology',
  'predicate-symbolization',
  'model',
  'predicate-countermodel',
  'quantifier-derivation',
  'predicate-terminology',
];

const feedbackCard = () => screen.getByTestId('feedback');
const isHiddenStale = (el: HTMLElement) => {
  const wrap = el.closest('.is-stale');
  return Boolean(wrap && wrap.getAttribute('aria-hidden') === 'true' && wrap.hasAttribute('inert'));
};

describe.each(TOPICS)('stale feedback: %s', (topic) => {
  test('edit after check → out of date, no feedback passed to the answer UI; revert/recheck → current', async () => {
    const ex = generateExercise(topic, 1, 7);
    const [a, b] = twoAnswers(ex);
    renderWithProviders(<ExerciseRunner exercise={ex} />);

    act(() => probe.onChange!(a));
    await userEvent.click(screen.getByRole('button', { name: /^Check/ }));
    expect(feedbackCard()).toBeInTheDocument();
    expect(screen.queryByTestId('stale-banner')).toBeNull();
    expect(isHiddenStale(feedbackCard())).toBe(false);
    expect(probe.feedbackProps.at(-1)).toBeTruthy();

    // Change the answer: the verdict is for the old one.
    act(() => probe.onChange!(b));
    expect(screen.getByTestId('stale-banner')).toHaveTextContent(/Out of date/);
    expect(isHiddenStale(feedbackCard())).toBe(true);
    expect(probe.feedbackProps.at(-1)).toBeNull();
    // Accessible tree: no "Feedback" status for the old answer is exposed.
    expect(screen.queryByRole('status', { name: 'Feedback' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();

    // Incomplete answer: still out of date; no re-check possible from the banner.
    act(() => probe.onChange!(null));
    expect(screen.getByTestId('stale-banner')).toHaveTextContent(/Finish your answer/);
    expect(probe.feedbackProps.at(-1)).toBeNull();

    // Back to the checked answer: current again.
    act(() => probe.onChange!(a));
    expect(screen.queryByTestId('stale-banner')).toBeNull();
    expect(isHiddenStale(feedbackCard())).toBe(false);
    expect(probe.feedbackProps.at(-1)).toBeTruthy();

    // Edit, then use the banner's Check again: feedback is for the new answer.
    act(() => probe.onChange!(b));
    expect(screen.getByTestId('stale-banner')).toHaveTextContent(/Press Check again/);
    // Exactly one re-check control: the runner's own button.
    expect(screen.getAllByRole('button', { name: 'Check again' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(screen.queryByTestId('stale-banner')).toBeNull();
    expect(probe.feedbackProps.at(-1)).toBeTruthy();
  });
});

test('"Your answer" quotes the checked answer, not the edited one', async () => {
  const ex = generateExercise('symbolization', 1, 3);
  renderWithProviders(<ExerciseRunner exercise={ex} />);
  act(() => probe.onChange!({ kind: 'symbolization', formula: 'Z' }));
  await userEvent.click(screen.getByRole('button', { name: 'Check' }));
  const before = feedbackCard().textContent ?? '';
  act(() => probe.onChange!({ kind: 'symbolization', formula: 'Q ∧ R' }));
  expect(feedbackCard().textContent).toBe(before);
  expect(feedbackCard().textContent).not.toMatch(/Q ∧ R/);
});
