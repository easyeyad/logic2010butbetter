/** Round-7 N1 repros with the real answer UIs: checked feedback never passes as a verdict on an edited answer. */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryStorage, generateExercise, ProgressStore, SYMBOLIZATION_EXERCISES, type Exercise } from '../../../learning';
import { setProgressStore } from '../../learning/progress';
import { renderWithProviders } from '../../test/utils';
import { ExerciseRunner } from './ExerciseRunner';

beforeEach(() => {
  localStorage.clear();
  setProgressStore(new ProgressStore(createMemoryStorage()));
});
afterEach(() => setProgressStore(null));

const staleWrap = () => screen.getByTestId('feedback').closest('.is-stale');
const expectStale = () => {
  expect(screen.getByTestId('stale-banner')).toHaveTextContent(/Out of date/);
  const w = staleWrap();
  expect(w).not.toBeNull();
  expect(w).toHaveAttribute('aria-hidden', 'true');
  expect(w).toHaveAttribute('inert');
};
const expectCurrent = () => {
  expect(screen.queryByTestId('stale-banner')).toBeNull();
  expect(staleWrap()).toBeNull();
};

function find<K extends Exercise['kind']>(topic: Exercise['topic'], difficulty: 1 | 2, ok: (e: Exercise) => boolean): Exercise & { kind: K } {
  for (let seed = 1; seed < 200; seed++) {
    const e = generateExercise(topic, difficulty, seed);
    if (ok(e)) return e as Exercise & { kind: K };
  }
  throw new Error(`no ${topic} exercise found`);
}

test('validity: CORRECT is not shown as current after switching to the other option (both directions)', async () => {
  const ex = find<'validity'>('validity', 1, (e) => e.kind === 'validity' && e.valid);
  renderWithProviders(<ExerciseRunner exercise={ex} />);
  await userEvent.click(screen.getByRole('radio', { name: /^Valid/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect(screen.getByTestId('feedback')).toHaveTextContent(/Correct/);
  expectCurrent();

  await userEvent.click(screen.getByRole('radio', { name: /^Invalid/ }));
  expectStale();
  expect(screen.queryByRole('status', { name: 'Feedback' })).toBeNull();

  // Check the wrong answer, then switch to the right one: NOT QUITE goes out of date.
  await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
  expectCurrent();
  expect(screen.getByTestId('feedback')).toHaveTextContent(/Not quite/);
  await userEvent.click(screen.getByRole('radio', { name: /^Valid/ }));
  expectStale();
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
});

test('symbolization: the old verdict is never re-rendered against the new answer', async () => {
  const ex = SYMBOLIZATION_EXERCISES[0];
  renderWithProviders(<ExerciseRunner exercise={ex} />);
  const input = screen.getByRole('textbox', { name: 'Your symbolization' });
  await userEvent.type(input, 'Z{Enter}');
  const fb = screen.getByTestId('feedback');
  expect(fb).toHaveTextContent(/Not quite/);
  expect(fb).toHaveTextContent(/Your answer: .*Z/);

  await userEvent.clear(input);
  await userEvent.type(input, 'Q & R');
  expectStale();
  // Still quotes what was checked, not the edited text.
  expect(screen.getByTestId('feedback')).not.toHaveTextContent('Q ∧ R');
  expect(screen.getByTestId('feedback')).toHaveTextContent(/Your answer: .*Z/);

  // Enter checks the new answer; the feedback is current again.
  await userEvent.type(input, '{Enter}');
  expectCurrent();
});

test('wff: formula highlights from a check are removed once the judgment changes', async () => {
  const ex = find<'wff'>('wff', 1, (e) => e.kind === 'wff' && !e.wellFormed && !e.askLocation);
  const { container } = renderWithProviders(<ExerciseRunner exercise={ex} />);
  const display = () => container.querySelector('[aria-label="Formula to judge"]')!;
  await userEvent.click(screen.getByRole('radio', { name: /^Well-formed/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect(screen.getByTestId('feedback')).toHaveTextContent(/Not quite/);
  const marked = display().querySelectorAll('mark').length;

  await userEvent.click(screen.getByRole('radio', { name: /^Not well-formed/ }));
  expectStale();
  expect(display().querySelectorAll('mark')).toHaveLength(0);
  // The highlight was there while the feedback was current.
  expect(marked).toBeGreaterThan(0);
});

test('countermodel: per-sentence values stay live (they are computed from the current assignment) while the verdict goes out of date', async () => {
  const ex = generateExercise('countermodel', 1, 5);
  if (ex.kind !== 'countermodel') throw new Error('kind');
  renderWithProviders(<ExerciseRunner exercise={ex} />);
  // Assign every letter True.
  for (const r of screen.getAllByRole('radio', { name: 'True' })) await userEvent.click(r);
  await userEvent.click(screen.getByRole('button', { name: 'Check' }));
  expectCurrent();
  const pills = () => document.querySelectorAll('.argv .truth-pill').length;
  expect(pills()).toBeGreaterThan(0);
  // Flip the first letter to False.
  await userEvent.click(screen.getAllByRole('radio', { name: 'False' })[0]);
  expectStale();
  expect(pills()).toBeGreaterThan(0);
});
