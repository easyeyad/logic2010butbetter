import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/utils';
import ProofsPage from './ProofsPage';

const doc = {
  problem: { id: 'hyp-syl', title: 'Hypothetical syllogism', premises: ['P → Q', 'Q → R'], goal: 'P → R' },
  lines: [
    { id: 'a', kind: 'premise', text: 'P → Q', depth: 0 },
    { id: 'b', kind: 'premise', text: 'Q → R', depth: 0 },
    { id: 'c', kind: 'show', text: 'P → R', depth: 0 },
    { id: 'd', kind: 'assumption', text: 'P', depth: 1, assumption: 'CD' },
  ],
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('logic-studio:proof-session', JSON.stringify(doc));
});

const lineInputs = () => screen.getAllByLabelText(/^Line \d+ formula$/) as HTMLInputElement[];

test('Enter inserts a line below (inside the open box) and focuses it', async () => {
  renderWithProviders(<ProofsPage />);
  const inputs = lineInputs();
  expect(inputs).toHaveLength(4);
  inputs[3].focus();
  await userEvent.keyboard('{Enter}');
  const after = lineInputs();
  expect(after).toHaveLength(5);
  await waitFor(() => expect(document.activeElement).toBe(after[4]));
});

test('undo/redo restores the draft', async () => {
  renderWithProviders(<ProofsPage />);
  lineInputs()[3].focus();
  await userEvent.keyboard('{Enter}');
  expect(lineInputs()).toHaveLength(5);
  await userEvent.keyboard('{Control>}z{/Control}');
  expect(lineInputs()).toHaveLength(4);
  await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
  expect(lineInputs()).toHaveLength(5);
});

test('typing a rule abbreviation selects it and a full CD proof completes', async () => {
  renderWithProviders(<ProofsPage />);
  const add = async (text: string, rule: string, refs: string) => {
    const inputs = lineInputs();
    inputs[inputs.length - 1].focus();
    await userEvent.keyboard('{Enter}');
    const fresh = lineInputs();
    const i = fresh.length;
    await userEvent.type(fresh[i - 1], text);
    await userEvent.type(screen.getByLabelText(`Line ${i} justification`), rule);
    await userEvent.type(screen.getByLabelText(`Line ${i} cited lines`), refs);
  };
  await add('Q', 'mp', '1 4');
  await add('R', 'mp', '2,5');
  expect(screen.getByLabelText('Line 5 justification')).toHaveValue('MP');

  await userEvent.click(within(screen.getByRole('listitem', { name: /Line 3/ })).getByRole('button', { name: /Close box/ }));
  const dialog = await screen.findByRole('dialog', { name: /Close the box for line 3/ });
  await userEvent.click(within(dialog).getByLabelText(/CD/));
  const refs = within(dialog).getByLabelText('Cited lines');
  await userEvent.clear(refs);
  await userEvent.type(refs, '6');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Close box' }));
  await waitFor(() => expect(screen.getByText('Proof complete')).toBeInTheDocument(), { timeout: 2000 });
});

test('delete from the line menu shows an undo toast', async () => {
  renderWithProviders(<ProofsPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Actions for line 4' }));
  await userEvent.click(screen.getByRole('menuitem', { name: /Delete line/ }));
  expect(lineInputs()).toHaveLength(3);
  const undo = screen.getByRole('button', { name: 'Undo' });
  act(() => fireEvent.click(undo));
  expect(lineInputs()).toHaveLength(4);
});
