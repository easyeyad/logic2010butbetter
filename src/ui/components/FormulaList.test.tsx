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

function Harness2({ initial }: { initial: string[] }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <FormulaList values={v} onChange={setV} labelFor={(i) => `Premise ${i + 1}`} />
      <output data-testid="values">{JSON.stringify(v)}</output>
    </>
  );
}
const valuesNow = () => JSON.parse(screen.getByTestId('values').textContent ?? '[]') as string[];
const barButton = (name: RegExp) => within(screen.getByRole('toolbar')).getByRole('button', { name });

test('deleting the focused row: the bar retargets to a surviving row and never resurrects it', async () => {
  renderWithProviders(<Harness2 initial={['P → Q', 'P', 'R']} />);
  await userEvent.click(screen.getByLabelText('Premise 3'));
  await userEvent.click(screen.getByRole('button', { name: 'Remove premise 3' }));
  expect(valuesNow()).toEqual(['P → Q', 'P']);
  await userEvent.click(barButton(/Insert or/));
  await userEvent.click(barButton(/Insert not/));
  await userEvent.click(barButton(/Insert not/));
  const v = valuesNow();
  expect(v).toHaveLength(2);
  expect(v[1]).toBe('P ∨ ¬¬');
  expect(v[0]).toBe('P → Q');
  expect(screen.getByRole('toolbar', { name: 'Insert symbol into Premise 2' })).toBeInTheDocument();
});

test('deleting a non-focused row keeps the bar on the focused row (renumbered)', async () => {
  renderWithProviders(<Harness2 initial={['A', 'B', 'C']} />);
  await userEvent.click(screen.getByLabelText('Premise 3'));
  await userEvent.click(screen.getByRole('button', { name: 'Remove premise 1' }));
  expect(valuesNow()).toEqual(['B', 'C']);
  await userEvent.click(screen.getByLabelText('Premise 2'));
  await userEvent.click(barButton(/Insert and/));
  await userEvent.click(barButton(/Insert and/));
  expect(valuesNow()).toEqual(['B', 'C ∧ ∧ ']);
  expect(screen.getByRole('toolbar', { name: 'Insert symbol into Premise 2' })).toBeInTheDocument();
});

test('pasting an argument with ∴ routes the conclusion', async () => {
  let concl = '';
  function H() {
    const [v, setV] = useState(['']);
    return <FormulaList values={v} onChange={setV} labelFor={(i) => `Premise ${i + 1}`} onConclusion={(t) => (concl = t)} />;
  }
  renderWithProviders(<H />);
  await userEvent.click(screen.getByLabelText('Premise 1'));
  await userEvent.paste('P → Q, P ∴ Q');
  expect((screen.getByLabelText('Premise 1') as HTMLInputElement).value).toBe('P → Q');
  expect((screen.getByLabelText('Premise 2') as HTMLInputElement).value).toBe('P');
  expect(concl).toBe('Q');
});
