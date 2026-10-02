import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryStorage, ProgressStore, SYMBOLIZATION_EXERCISES, TERMINOLOGY_EXERCISES } from '../../../learning';
import { setProgressStore } from '../../learning/progress';
import { renderWithProviders } from '../../test/utils';
import { ExerciseRunner } from './ExerciseRunner';

let store: ProgressStore;
beforeEach(() => {
  localStorage.clear();
  store = new ProgressStore(createMemoryStorage());
  setProgressStore(store);
});
afterEach(() => setProgressStore(null));

test('symbolization: Enter checks, feedback is shown and the attempt is recorded', async () => {
  const ex = SYMBOLIZATION_EXERCISES[0];
  renderWithProviders(<ExerciseRunner exercise={ex} />);
  const input = screen.getByRole('textbox', { name: 'Your symbolization' });
  await userEvent.type(input, ex.answer.replace(/¬/g, '~') + '{Enter}');
  const fb = await screen.findByTestId('feedback');
  expect(fb).toHaveTextContent(/Correct/i);
  expect(store.getAttempts()).toHaveLength(1);
  expect(store.getAttempts()[0]).toMatchObject({ exerciseId: ex.id, correct: true, hintsUsed: 0 });
});

test('hints are progressive and the solution needs confirmation', async () => {
  const ex = SYMBOLIZATION_EXERCISES[5];
  renderWithProviders(<ExerciseRunner exercise={ex} />);
  await userEvent.click(screen.getByRole('button', { name: /^Hint/ }));
  expect(screen.getAllByText(/^Hint 1$/)).toHaveLength(1);
  await userEvent.click(screen.getByRole('button', { name: /Hint 2 of/ }));
  expect(screen.getByText(/^Hint 2$/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Show solution' }));
  const dialog = await screen.findByRole('alertdialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Show solution' }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'Solution' })).toBeInTheDocument());
});

test('multiple-choice terminology: wrong choice gives an error verdict', async () => {
  const ex = TERMINOLOGY_EXERCISES.find((e) => e.format === 'multiple-choice')!;
  renderWithProviders(<ExerciseRunner exercise={ex} />);
  const wrong = (ex.correctOption! + 1) % ex.options!.length;
  await userEvent.click(screen.getByRole('radio', { name: ex.options![wrong] }));
  await userEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect(await screen.findByTestId('feedback')).toHaveTextContent(/Not quite/i);
  expect(store.getAttempts()[0].correct).toBe(false);
});
