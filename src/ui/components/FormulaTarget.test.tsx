/** Round-7 N3: a page-level "insert into the focused line" bar only ever targets proof-line fields. */
import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormulaInput } from './FormulaInput';
import { FormulaList } from './FormulaList';
import { FormulaTargetBoundary, FormulaTargetProvider, useFormulaTarget } from './FormulaTarget';
import { SYMBOLS } from './symbols';
import { renderWithProviders } from '../test/utils';

const AND = SYMBOLS.find((s) => s.symbol === '∧')!;

function PageBar() {
  const t = useFormulaTarget();
  return (
    <button type="button" onClick={() => t?.insert(AND)}>
      page bar ∧ ({t?.activeLabel ?? 'none'})
    </button>
  );
}

function Page() {
  const [line, setLine] = useState('P');
  const [prem, setPrem] = useState(['Q']);
  const [goal, setGoal] = useState('R');
  return (
    <FormulaTargetProvider>
      <FormulaInput label="Line 1 formula" value={line} onChange={setLine} toolbar={false} />
      <FormulaTargetBoundary>
        <FormulaList values={prem} onChange={setPrem} labelFor={(i) => `Premise ${i + 1}`} />
        <FormulaInput label="Conclusion to show" value={goal} onChange={setGoal} toolbar={false} />
      </FormulaTargetBoundary>
      <PageBar />
      <output data-testid="state">{JSON.stringify({ line, prem, goal })}</output>
    </FormulaTargetProvider>
  );
}
const state = () => JSON.parse(screen.getByTestId('state').textContent!);

beforeEach(() => localStorage.clear());

test('focusing custom-form fields (list rows or a bounded field) never retargets the page bar', async () => {
  renderWithProviders(<Page />);
  await userEvent.click(screen.getByLabelText('Line 1 formula'));
  await userEvent.click(screen.getByLabelText('Premise 1'));
  await userEvent.type(screen.getByLabelText('Premise 1'), 'x');
  expect(screen.getByRole('button', { name: /page bar/ })).toHaveTextContent('Line 1 formula');
  await userEvent.click(screen.getByRole('button', { name: /page bar/ }));
  expect(state()).toEqual({ line: 'P ∧ ', prem: ['Qx'], goal: 'R' });

  await userEvent.click(screen.getByLabelText('Conclusion to show'));
  await userEvent.click(screen.getByRole('button', { name: /page bar/ }));
  expect(state().goal).toBe('R');
  expect(state().prem).toEqual(['Qx']);
});

test('with no proof line focused yet, the page bar inserts nowhere rather than into the form', async () => {
  renderWithProviders(<Page />);
  await userEvent.click(screen.getByLabelText('Premise 1'));
  await userEvent.click(screen.getByRole('button', { name: /page bar/ }));
  expect(state()).toEqual({ line: 'P', prem: ['Q'], goal: 'R' });
});
