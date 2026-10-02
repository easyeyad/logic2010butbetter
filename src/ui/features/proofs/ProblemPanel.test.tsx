import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/utils';
import { assess, ProblemPanel } from './ProblemPanel';

test('assess names premises by the labels it is given', () => {
  expect(assess(['P → Q', 'Q ∧'], 'P', ['Premise 1', 'Premise 3'])).toEqual({ kind: 'bad-input', text: "Premise 3 isn't well-formed yet." });
  expect(assess(['P → Q', 'Q ∧'], 'P')).toEqual({ kind: 'bad-input', text: "Premise 2 isn't well-formed yet." });
});

test('custom problem form: a blank row does not shift premise numbers in the warning', async () => {
  localStorage.clear();
  renderWithProviders(<ProblemPanel problem={{ id: 'x', title: 'X', premises: [], goal: 'P' }} onLoad={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /Enter your own problem/ }));
  await userEvent.type(screen.getByLabelText('Premise 1'), 'P -> Q');
  await userEvent.click(screen.getByRole('button', { name: 'Add premise' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add premise' }));
  await userEvent.type(screen.getByLabelText('Premise 3'), 'Q &');
  await userEvent.type(screen.getByLabelText('Conclusion to show'), 'P');
  await userEvent.click(screen.getByRole('button', { name: 'Start this proof' }));
  expect(await screen.findByRole('alert')).toHaveTextContent("Premise 3 isn't well-formed yet.");
});
