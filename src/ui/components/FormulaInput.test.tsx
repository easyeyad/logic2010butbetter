import { useState } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormulaInput } from './FormulaInput';
import { renderWithProviders } from '../test/utils';

function Harness({ initial = '' }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return <FormulaInput label="Formula" value={v} onChange={setV} debounceMs={0} />;
}

beforeEach(() => localStorage.clear());

test('converts ASCII connectives to symbols while typing', async () => {
  renderWithProviders(<Harness />);
  const input = screen.getByLabelText('Formula') as HTMLInputElement;
  await userEvent.type(input, '(P & Q) -> ~R');
  expect(input.value).toBe('(P ∧ Q) → ¬R');
});

test('shows the parse error with message, highlight and aria-invalid', async () => {
  renderWithProviders(<Harness initial="P ∧" />);
  const input = screen.getByLabelText('Formula');
  await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
  expect(screen.getByText(/Not well-formed/)).toBeInTheDocument();
  expect(document.querySelector('mark.fx-err')).not.toBeNull();
  const describedBy = input.getAttribute('aria-describedby')!;
  expect(document.getElementById(describedBy)).toHaveTextContent(/requires a formula on both sides/);
});

test('valid formula is not marked invalid', async () => {
  renderWithProviders(<Harness initial="(P ∧ Q) → R" />);
  const input = screen.getByLabelText('Formula');
  await waitFor(() => expect(screen.getByText('Well-formed formula')).toBeInTheDocument());
  expect(input).not.toHaveAttribute('aria-invalid');
});

test('symbol toolbar inserts at the caret', async () => {
  renderWithProviders(<Harness initial="PQ" />);
  const input = screen.getByLabelText('Formula') as HTMLInputElement;
  input.focus();
  input.setSelectionRange(1, 1);
  await userEvent.click(screen.getByRole('button', { name: /Insert and \(conjunction\)/ }));
  expect(input.value).toBe('P ∧ Q');
  expect(input.selectionStart).toBe(4);
});
