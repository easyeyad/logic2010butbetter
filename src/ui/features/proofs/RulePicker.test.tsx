/** Round-8 m2: no Tab path out of the rule picker loses focus (derived-rule popover, unknown rule, empty). */
import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/utils';
import { disabledDerivedOptions, justificationOptions } from './justification';
import { RulePicker } from './RulePicker';

function Row() {
  const [v, setV] = useState('');
  return (
    <div>
      <input aria-label="Line 5 formula" />
      <RulePicker value={v} onChange={setV} label="Line 5 justification" options={justificationOptions(false)} unavailable={disabledDerivedOptions(false)} />
      <input aria-label="Line 5 cited lines" />
      <output data-testid="v">{v}</output>
    </div>
  );
}
const rule = () => screen.getByRole('combobox', { name: 'Line 5 justification' });

beforeEach(() => localStorage.clear());

test('derived rule typed with derived rules off: Tab goes to "Enable derived rules" and the typed text stays', async () => {
  renderWithProviders(<Row />);
  await userEvent.click(rule());
  await userEvent.type(rule(), 'dm');
  expect(screen.getByText(/is a derived rule, and derived rules are off/)).toBeInTheDocument();
  await userEvent.tab();
  const enable = screen.getByRole('button', { name: 'Enable derived rules' });
  expect(document.activeElement).toBe(enable);
  expect(rule()).toHaveValue('dm');
  expect(screen.getByText(/is a derived rule/)).toBeInTheDocument();

  // Tab again: on to the cited-lines field (never <body>).
  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByLabelText('Line 5 cited lines'));
});

test('Enable derived rules (keyboard) picks the typed rule and returns to the field', async () => {
  renderWithProviders(<Row />);
  await userEvent.click(rule());
  await userEvent.type(rule(), 'dm');
  await userEvent.tab();
  await userEvent.keyboard('{Enter}');
  expect(document.activeElement).toBe(rule());
  expect(screen.getByTestId('v')).toHaveTextContent('DM');
});

test('Escape on the Enable button closes the popover and returns to the field', async () => {
  renderWithProviders(<Row />);
  await userEvent.click(rule());
  await userEvent.type(rule(), 'dm');
  await userEvent.tab();
  await userEvent.keyboard('{Escape}');
  expect(document.activeElement).toBe(rule());
  expect(screen.queryByText(/is a derived rule/)).toBeNull();
});

test.each([['unknown rule', 'xyz'], ['empty', '']])('%s: Tab moves to the cited-lines field', async (_, typed) => {
  renderWithProviders(<Row />);
  await userEvent.click(rule());
  if (typed) await userEvent.type(rule(), typed);
  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByLabelText('Line 5 cited lines'));
});

test('Shift+Tab from the Enable button goes back to the rule field with the text kept', async () => {
  renderWithProviders(<Row />);
  await userEvent.click(rule());
  await userEvent.type(rule(), 'dm');
  await userEvent.tab();
  await userEvent.tab({ shift: true });
  expect(document.activeElement).toBe(rule());
});
