/** Symbol toolbar definitions and caret-aware insertion (pure text editing). */
export interface SymbolDef {
  key: string;
  symbol: string;
  ascii: string;
  name: string;
  /** Shortcut hint shown in tooltips, e.g. "type ~". */
  typed: string;
  binary?: boolean;
}

export const SYMBOLS: SymbolDef[] = [
  { key: 'not', symbol: '¬', ascii: '~', name: 'not (negation)', typed: '~' },
  { key: 'and', symbol: '∧', ascii: '&', name: 'and (conjunction)', typed: '&', binary: true },
  { key: 'or', symbol: '∨', ascii: 'v', name: 'or (disjunction)', typed: 'v or |', binary: true },
  { key: 'implies', symbol: '→', ascii: '->', name: 'if … then (conditional)', typed: '->', binary: true },
  { key: 'iff', symbol: '↔', ascii: '<->', name: 'if and only if (biconditional)', typed: '<->', binary: true },
  { key: 'lparen', symbol: '(', ascii: '(', name: 'open parenthesis', typed: '(' },
  { key: 'rparen', symbol: ')', ascii: ')', name: 'close parenthesis', typed: ')' },
];

export function insertAt(
  text: string,
  start: number,
  end: number,
  def: SymbolDef,
  ascii: boolean,
): { text: string; caret: number } {
  const token = ascii ? def.ascii : def.symbol;
  const before = text.slice(0, start);
  const after = text.slice(end);
  let ins = token;
  if (def.binary) {
    if (before.length > 0 && !/\s$/.test(before)) ins = ' ' + ins;
    if (!/^\s/.test(after)) ins = ins + ' ';
  }
  return { text: before + ins + after, caret: before.length + ins.length };
}

/**
 * True when the text before the caret ends with the beginning of a
 * multi-character ASCII connective ("-" of "->", "<" / "<-" of "<->"), so
 * live normalization should wait for the next keystroke.
 */
export function endsWithPartialConnective(beforeCaret: string): boolean {
  return /(<-?|-)$/.test(beforeCaret);
}
