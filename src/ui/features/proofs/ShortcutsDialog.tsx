import { Dialog } from '../../components/Dialog';
import { SHORTCUT_HELP, SHORTCUT_LABEL } from './shortcuts';

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} title="Keyboard shortcuts" onClose={onClose}>
      <p className="subtle" style={{ marginBottom: 'var(--sp-3)' }}>
        Tab moves through formula → rule → cited lines. Type a rule abbreviation (e.g. <kbd>mp</kbd>) to pick it.
        ASCII like <kbd>-&gt;</kbd>, <kbd>&amp;</kbd>, <kbd>~</kbd> turns into symbols as you type.
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
