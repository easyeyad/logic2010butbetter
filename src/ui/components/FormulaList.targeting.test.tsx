import { useState } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormulaList } from './FormulaList';
import { FormulaInput } from './FormulaInput';
import { renderWithProviders } from '../test/utils';

/** Premise list + a separate conclusion field, like the Countermodels page. */
function Arg({ initial = ['A', 'B', 'C'] }: { initial?: string[] }) {
  const [v, setV] = useState(initial);
  const [c, setC] = useState('D');
  return (
    <>
      <FormulaList values={v} onChange={setV} labelFor={(i) => `Premise ${i + 1}`} addLabel="Add premise" onConclusion={setC} />
      <FormulaInput label="Conclusion" value={c} onChange={setC} toolbar={false} />
      <output data-testid="v">{JSON.stringify(v)}</output>
      <output data-testid="c">{c}</output>
    </>
  );
}
const vals = () => JSON.parse(screen.getByTestId('v').textContent ?? '[]') as string[];
const bar = () => screen.getByRole('toolbar', { name: /Insert symbol into/ });
/** Index of the row the bar is rendered under. */
const barRowIndex = () => {
  const item = bar().closest('.fl__item')!;
  return Array.from(document.querySelectorAll('.fl__item')).indexOf(item);
};
/** Click a bar button, and check the symbol went into the row the bar was drawn under. */
async function insertAndCheck(name: RegExp) {
  const before = vals();
  const at = barRowIndex();
  expect(bar()).toHaveAccessibleName(`Insert symbol into Premise ${at + 1}`);
  await userEvent.click(within(bar()).getByRole('button', { name }));
  const after = vals();
  after.forEach((v, i) => (i === at ? expect(v).not.toBe(before[i]) : expect(v).toBe(before[i])));
  return at;
}

beforeEach(() => localStorage.clear());

test('Shift+Tab onto a remove button, then Tab+Enter: the bar never drifts from its insert target', async () => {
  renderWithProviders(<Arg />);
  await userEvent.click(screen.getByLabelText('Premise 3'));
  await userEvent.tab({ shift: true }); // → "Remove premise 2"
  expect(screen.getByRole('button', { name: 'Remove premise 2' })).toHaveFocus();
  expect(barRowIndex()).toBe(2); // still under Premise 3
  await userEvent.tab(); // back into Premise 3's field
  await userEvent.tab(); // into the bar (one tab stop)
  const at = barRowIndex();
  await userEvent.keyboard('{Enter}');
  expect(at).toBe(2);
  expect(vals()[2]).not.toBe('C');
  expect(vals().slice(0, 2)).toEqual(['A', 'B']);
});

test('pressing a remove button and dragging off (no click) does not move the bar', async () => {
  renderWithProviders(<Arg />);
  await userEvent.click(screen.getByLabelText('Premise 3'));
  const trash = screen.getByRole('button', { name: 'Remove premise 1' });
  fireEvent.pointerDown(trash);
  fireEvent.mouseDown(trash);
  trash.focus(); // a press focuses the button…
  fireEvent.pointerUp(document.body); // …released elsewhere: no click
  expect(vals()).toEqual(['A', 'B', 'C']);
  expect(barRowIndex()).toBe(2);
  expect(await insertAndCheck(/Insert and/)).toBe(2);
});

test('from the conclusion, Shift+Tab back through Add premise and a remove button: bar stays with its target', async () => {
  renderWithProviders(<Arg />);
  await userEvent.click(screen.getByLabelText('Premise 1'));
  await userEvent.click(screen.getByLabelText('Conclusion'));
  await userEvent.tab({ shift: true }); // Add premise
  await userEvent.tab({ shift: true }); // Remove premise 3
  expect(screen.getByRole('button', { name: 'Remove premise 3' })).toHaveFocus();
  expect(barRowIndex()).toBe(0);
  expect(await insertAndCheck(/Insert not/)).toBe(0);
});

test('bar position, name and insert target agree after focusing each row in turn', async () => {
  renderWithProviders(<Arg />);
  for (const n of [2, 1, 3]) {
    await userEvent.click(screen.getByLabelText(`Premise ${n}`));
    expect(barRowIndex()).toBe(n - 1);
    expect(await insertAndCheck(/Insert or/)).toBe(n - 1);
  }
});

test('typing "therefore" into a premise never routes or clears the conclusion (only paste does)', async () => {
  renderWithProviders(<Arg />);
  await userEvent.click(screen.getByLabelText('Premise 2'));
  await userEvent.keyboard('{End} therefore P');
  expect(screen.getByTestId('c').textContent).toBe('D');
  expect(vals()).toHaveLength(3);
});

test('pasting "P -> Q, Q |- P" routes the conclusion before any ASCII conversion', async () => {
  renderWithProviders(<Arg initial={['']} />);
  await userEvent.click(screen.getByLabelText('Premise 1'));
  await userEvent.paste('P -> Q, Q |- P');
  expect(vals()).toEqual(['P → Q', 'Q']);
  expect(screen.getByTestId('c').textContent).toBe('P');
});

test('a newly added row receives symbols (ids are stable across renders)', async () => {
  renderWithProviders(<Arg initial={['A']} />);
  await userEvent.click(screen.getByRole('button', { name: 'Add premise' }));
  await userEvent.keyboard('F');
  expect(barRowIndex()).toBe(1);
  await insertAndCheck(/Insert and/);
  await insertAndCheck(/Insert not/);
  expect(vals()[1]).toBe('F ∧ ¬');
});

test('with rememberKey, a remounted list keeps its bar on the last targeted row', async () => {
  function L() {
    const [v, setV] = useState(['A', 'B', 'C']);
    return <FormulaList values={v} onChange={setV} labelFor={(i) => `Formula ${i + 1}`} rememberKey="remount-test" />;
  }
  const first = renderWithProviders(<L />);
  await userEvent.click(screen.getByLabelText('Formula 2'));
  expect(bar()).toHaveAccessibleName('Insert symbol into Formula 2');
  first.unmount();
  renderWithProviders(<L />);
  expect(bar()).toHaveAccessibleName('Insert symbol into Formula 2');
  expect(barRowIndex()).toBe(1);
});
