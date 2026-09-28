/** Round-7 N2: messages and tables name premises by their visible label, even when a blank row is skipped. */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/utils';
import CountermodelsPage from './CountermodelsPage';

const setup = (premises: string[], conclusion: string) => {
  localStorage.clear();
  localStorage.setItem('logic-studio:cm-premises', JSON.stringify(premises));
  localStorage.setItem('logic-studio:cm-conclusion', JSON.stringify(conclusion));
  renderWithProviders(<CountermodelsPage />);
};
const verdict = () => screen.getByRole('region', { name: 'Verdict' });
const check = () => userEvent.click(screen.getByRole('button', { name: 'Check validity' }));

test('ill-formed Premise 3 after a blank Premise 2 is called Premise 3', async () => {
  setup(['P → Q', '', 'Q ∧'], 'P');
  await check();
  expect(verdict()).toHaveTextContent("Premise 3 isn't well-formed");
  expect(verdict()).not.toHaveTextContent('Premise 2');
});

test('arity message names the visible premise', async () => {
  setup(['Fa', '', 'Fab'], 'Ga');
  await check();
  expect(verdict()).toHaveTextContent(/premise 3/i);
  expect(verdict()).not.toHaveTextContent(/premise 2/i);
});

test('countermodel rows use the visible labels', async () => {
  setup(['P → Q', '', 'Q'], 'P');
  await check();
  const list = within(verdict()).getAllByText(/^Premise \d$/).map((e) => e.textContent);
  expect(list).toEqual(['Premise 1', 'Premise 3']);
});

test('predicate countermodel rows use the visible labels', async () => {
  setup(['', '∀x(Fx → Gx)', 'Ga'], 'Fa');
  await check();
  const list = within(verdict()).getAllByText(/^Premise \d$/).map((e) => e.textContent);
  expect(list).toEqual(['Premise 2', 'Premise 3']);
});
