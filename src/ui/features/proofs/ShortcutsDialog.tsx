import { Dialog } from '../../components/Dialog';
import { QUANTIFIER_SYMBOLS } from '../../components/symbols';
import { SHORTCUT_HELP, SHORTCUT_LABEL } from './shortcuts';

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} title="Keyboard shortcuts" onClose={onClose}>
      <p className="subtle" style={{ marginBottom: 'var(--sp-3)' }}>
        Tab moves through formula → rule → cited lines. Type a rule abbreviation (e.g. <kbd>mp</kbd>) to pick it.
        ASCII like <kbd>-&gt;</kbd>, <kbd>&amp;</kbd>, <kbd>~</kbd> turns into symbols as you type; quantifiers are{' '}
        <kbd>{QUANTIFIER_SYMBOLS[0].typed}</kbd> for ∀ and <kbd>{QUANTIFIER_SYMBOLS[1].typed}</kbd> for ∃ (for example <kbd>{QUANTIFIER_SYMBOLS[0].typed}x(Fx -&gt; Gx)</kbd>). Identity is <kbd>=</kbd> and non-identity is{' '}
        <kbd>{QUANTIFIER_SYMBOLS.find((q) => q.key === 'neq')?.typed}</kbd> (≠). For ↔ type <kbd>&lt;-&gt;</kbd>.
      </p>
      <table className="kbd-table">
        <tbody>
          {SHORTCUT_HELP.map(([action, text]) => (
            <tr key={action}>
              <td>{text}</td>
              <td>
                <kbd>{SHORTCUT_LABEL[action]}</kbd>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}
