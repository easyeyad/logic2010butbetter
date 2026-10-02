/** Proof-editor keyboard shortcuts (one table used by handlers, menus and the help dialog). */
export type ShortcutAction =
  | 'insertBelow'
  | 'insertShow'
  | 'insertAssumption'
  | 'closeBox'
  | 'indent'
  | 'outdent'
  | 'moveUp'
  | 'moveDown'
  | 'prevLine'
  | 'nextLine'
  | 'deleteLine'
  | 'undo'
  | 'redo';

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? '⌘' : 'Ctrl';
const ALT = IS_MAC ? '⌥' : 'Alt';

export const SHORTCUT_LABEL: Record<ShortcutAction, string> = {
  insertBelow: 'Enter',
  insertShow: `${MOD}+Shift+S`,
  insertAssumption: `${ALT}+Shift+A`,
  closeBox: `${MOD}+Shift+Enter`,
  indent: `${MOD}+]`,
  outdent: `${MOD}+[`,
  moveUp: `${ALT}+Shift+↑`,
  moveDown: `${ALT}+Shift+↓`,
  prevLine: `${ALT}+↑`,
  nextLine: `${ALT}+↓`,
  deleteLine: `${MOD}+Shift+⌫`,
  undo: `${MOD}+Z`,
  redo: `${MOD}+Shift+Z`,
};

export const SHORTCUT_HELP: [ShortcutAction, string][] = [
  ['insertBelow', 'Insert a line below'],
  ['insertShow', 'New “Show” line (opens a box)'],
  ['insertAssumption', 'Add an assumption'],
  ['closeBox', 'Close the current box'],
  ['indent', 'Indent line'],
  ['outdent', 'Outdent line'],
  ['prevLine', 'Previous line (also ↑ at the start of a formula)'],
  ['nextLine', 'Next line (also ↓ at the end of a formula)'],
  ['moveUp', 'Move line up'],
  ['moveDown', 'Move line down'],
  ['deleteLine', 'Delete line (undo available)'],
  ['undo', 'Undo'],
  ['redo', 'Redo'],
];

interface KeyLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export function matchShortcut(e: KeyLike): ShortcutAction | null {
  const mod = IS_MAC ? e.metaKey : e.ctrlKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod && !e.altKey) {
    if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
    if (key === 'y' && !e.shiftKey) return 'redo';
    if (e.shiftKey && (key === 's' || e.code === 'KeyS')) return 'insertShow';
    if (e.shiftKey && key === 'Enter') return 'closeBox';
    if (e.shiftKey && (key === 'Backspace' || key === 'Delete')) return 'deleteLine';
    if (key === ']' || e.code === 'BracketRight') return 'indent';
    if (key === '[' || e.code === 'BracketLeft') return 'outdent';
    return null;
  }
  if (e.altKey && !mod && !e.ctrlKey && !e.metaKey) {
    if (key === 'ArrowUp') return e.shiftKey ? 'moveUp' : 'prevLine';
    if (key === 'ArrowDown') return e.shiftKey ? 'moveDown' : 'nextLine';
    if (e.shiftKey && (key === 'a' || e.code === 'KeyA')) return 'insertAssumption';
    return null;
  }
  if (key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) return 'insertBelow';
  return null;
}
