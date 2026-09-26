import { useState } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormulaList } from './FormulaList';
import { renderWithProviders } from '../test/utils';

function Harness() {
  const [v, setV] = useState(['P', 'Q', 'R']);
  return <FormulaList values={v} onChange={setV} labelFor={(i) => `Premise ${i + 1}`} />;
}

beforeEach(() => localStorage.clear());

test('the shared symbol bar inserts into the most recently focused row, not the last one', async () => {
  renderWithProviders(<Harness />);
  const p1 = screen.getByLabelText('Premise 1') as HTMLInputElement;
  const p3 = screen.getByLabelText('Premise 3') as HTMLInputElement;
  await userEvent.click(p1);
  p1.setSelectionRange(1, 1);
  const bar = screen.getByRole('toolbar', { name: 'Insert symbol into Premise 1' });
  await userEvent.click(within(bar).getByRole('button', { name: /Insert and \(conjunction\)/ }));
  expect(p1.value).toBe('P ∧ ');
  expect(p3.value).toBe('R');
  expect(p1).toHaveFocus();

  // Focus moves: the bar follows and names the new row.
  await userEvent.click(p3);
  expect(screen.getByRole('toolbar', { name: 'Insert symbol into Premise 3' })).toBeInTheDocument();
  expect(screen.queryByRole('toolbar', { name: 'Insert symbol into Premise 1' })).toBeNull();
});

test('typing a comma splits into a new row and keeps typing there', async () => {
  renderWithProviders(<Harness />);
  const p1 = screen.getByLabelText('Premise 1') as HTMLInputElement;
  await userEvent.click(p1);
  await userEvent.keyboard('{End}, S');
  expect((screen.getByLabelText('Premise 2') as HTMLInputElement).value).toBe('S');
  expect(screen.getByLabelText('Premise 2')).toHaveFocus();
});
