import type { BinaryKind, Formula } from './ast';
import { SYMBOL } from './ast';
import { format } from './format';

/** Half-open character range [start, end) into the ORIGINAL input string. */
export interface Span { start: number; end: number }

export type ParseErrorCode =
  | 'empty'
  | 'unexpected-char'        // e.g. '#', lowercase letter used as atom
  | 'invalid-atom'           // e.g. 'p' or 'PQ' run together
  | 'missing-operand'        // '→ Q', 'P ∧', '¬'
  | 'missing-connective'     // 'P Q', '(P)(Q)'
  | 'unbalanced-open'        // '(P ∧ Q'
  | 'unbalanced-close'       // 'P ∧ Q)'
  | 'mismatched-bracket'     // '(P ∧ Q]'
  | 'empty-parens'           // '()'
  | 'ambiguous'              // 'P ∧ Q ∨ R' — needs parentheses
  | 'misplaced-connective';  // 'P ¬ Q', '∧ P'

export interface ParseError {
  code: ParseErrorCode;
  /** Student-facing explanation, e.g. "→ requires a formula on both sides." */
  message: string;
  /** Exact offending region of the ORIGINAL input (for highlighting). */
  span: Span;
  /** Optional actionable suggestion, e.g. "Add parentheses: (P ∧ Q) ∨ R". */
  hint?: string;
}

export type ParseResult =
  | { ok: true; formula: Formula; normalized: string }
  | { ok: false; error: ParseError; normalized: string };

// ---------------------------------------------------------------------------
// Aliases (shared by the lexer and normalizeInput so they always agree)
// ---------------------------------------------------------------------------

/** Multi-character aliases, longest first. */
const MULTI_ALIASES: readonly [string, BinaryKind][] = [
  ['<->', 'iff'],
  ['<=>', 'iff'],
  ['<>', 'iff'],
  ['->', 'implies'],
  ['=>', 'implies'],
];

/** Single-character connectives (canonical symbols and aliases). '-' and 'v' are handled specially. */
const NOT_CHARS = new Set(['¬', '~', '!', '∼', '−']);
const BINARY_CHARS: Record<string, BinaryKind> = {
  '∧': 'and', '&': 'and', '^': 'and', '*': 'and', '·': 'and',
  '∨': 'or', '|': 'or',
  '→': 'implies', '>': 'implies', '⊃': 'implies', '⇒': 'implies',
  '↔': 'iff', '=': 'iff', '≡': 'iff', '⇔': 'iff',
};

const OPEN_TO_CLOSE: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const CLOSE_TO_OPEN: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

const isUpper = (c: string | undefined) => c !== undefined && c >= 'A' && c <= 'Z';
const isLower = (c: string | undefined) => c !== undefined && c >= 'a' && c <= 'z';
const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';
const isAlnum = (c: string | undefined) => isUpper(c) || isLower(c) || isDigit(c);

/** Lowercase `v` at index i is "or" when neither neighbour is a letter or digit. */
function isStandaloneV(s: string, i: number): boolean {
  return s[i] === 'v' && !isAlnum(s[i - 1]) && !isAlnum(s[i + 1]);
}

// ---------------------------------------------------------------------------
// normalizeInput
// ---------------------------------------------------------------------------

/**
 * Rewrite ASCII shortcuts into canonical symbols (~ → ¬, & → ∧, | → ∨,
 * -> → →, <-> → ↔ ...). Used live by formula inputs while typing.
 * Must be idempotent. Returns the new string and a mapping so a caret
 * position in the old string can be moved to the new one.
 *
 * Rules:
 *  - Complete multi-char aliases convert: <-> <=> <> (↔), -> => (→).
 *  - ~ ! ∼ − → ¬;  & ^ * · → ∧;  | → ∨;  > ⊃ ⇒ → →;  ≡ ⇔ → ↔.
 *  - A lowercase `v` converts to ∨ only when standalone (neither neighbour is a
 *    letter or digit, e.g. "P v Q", "(P)v(Q)").
 *  - "Held" characters: a `-` or `=` that sits at the end of the text or
 *    immediately before the caret stays raw, because it may be the start of
 *    "->" / "=>" (or the middle of "<->" / "<=>"). It converts (to ¬ / ↔) once
 *    something other than ">" follows it and the caret has moved on.
 *    A lone `<` is never converted (it only ever begins <->, <=>, <>).
 *  - Everything else (letters, whitespace, brackets, unknown chars) is untouched,
 *    so the result may still be unparseable; `parse` reports that.
 *
 * The caret defaults to the end of the text. A caret inside a converted
 * multi-char alias moves to just after its symbol.
 */
export function normalizeInput(input: string, caret?: number): { text: string; caret: number } {
  const len = input.length;
  const held = (j: number) => j === len || j === caret;
  const map: number[] = new Array(len + 1);
  let out = '';
  let i = 0;
  while (i < len) {
    let rep: string | null = null;
    let n = 1;
    for (const [alias, kind] of MULTI_ALIASES) {
      if (input.startsWith(alias, i)) {
        rep = SYMBOL[kind];
        n = alias.length;
        break;
      }
    }
    if (rep === null) {
      const c = input[i];
      if (NOT_CHARS.has(c)) rep = SYMBOL.not;
      else if (c === '-') rep = held(i + 1) ? null : SYMBOL.not;
      else if (c === '=') rep = held(i + 1) ? null : SYMBOL.iff;
      else if (c in BINARY_CHARS) rep = SYMBOL[BINARY_CHARS[c]];
      else if (isStandaloneV(input, i)) rep = SYMBOL.or;
    }
    const piece = rep ?? input.slice(i, i + n);
    map[i] = out.length;
    for (let k = 1; k < n; k++) map[i + k] = out.length + piece.length;
    out += piece;
    i += n;
  }
  map[len] = out.length;
  const c = Math.max(0, Math.min(len, caret ?? len));
  return { text: out, caret: map[c] };
}

// ---------------------------------------------------------------------------
// Lexer (works on the original string so spans are exact)
// ---------------------------------------------------------------------------

type Token =
  | { t: 'atom'; name: string; start: number; end: number }
  | { t: 'not'; start: number; end: number }
  | { t: 'bin'; kind: BinaryKind; start: number; end: number }
  | { t: 'open'; ch: string; start: number; end: number }
  | { t: 'close'; ch: string; start: number; end: number }
  | { t: 'error'; error: ParseError; start: number; end: number }
  | { t: 'end'; start: number; end: number };

const WORD_CONNECTIVES: Record<string, string> = {
  and: '∧', but: '∧', or: '∨', not: '¬', implies: '→', then: '→', if: '→', only: '→', iff: '↔',
};

function lex(s: string): Token[] {
  const toks: Token[] = [];
  const err = (code: ParseErrorCode, message: string, start: number, end: number, hint?: string) =>
    toks.push({ t: 'error', error: { code, message, span: { start, end }, ...(hint ? { hint } : {}) }, start, end });
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (isUpper(c)) {
      let j = i + 1;
      while (isDigit(s[j])) j++;
      toks.push({ t: 'atom', name: s.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }
    if (isLower(c)) {
      if (isStandaloneV(s, i)) {
        toks.push({ t: 'bin', kind: 'or', start: i, end: i + 1 });
        i++;
        continue;
      }
      let j = i;
      while (isLower(s[j])) j++;
      const word = s.slice(i, j);
      let k = j;
      while (isDigit(s[k])) k++;
      const digits = s.slice(j, k);
      if (Object.hasOwn(WORD_CONNECTIVES, word) && !digits) {
        err('unexpected-char', `Write connectives as symbols, not words: use ${WORD_CONNECTIVES[word]} instead of “${word}”.`, i, j);
      } else if (word.length === 1) {
        const guess = word.toUpperCase() + digits;
        const extra = word === 'v' ? ' (For “or”, use ∨, or put spaces around the v.)' : '';
        err('invalid-atom', `Sentence letters must be capital letters: did you mean ${guess}?${extra}`, i, k, `Write ${guess}`);
      } else {
        err(
          'invalid-atom',
          `“${s.slice(i, k)}” is not a sentence letter. Sentence letters are single capital letters, optionally followed by digits (like P or Q1).`,
          i,
          k,
        );
      }
      i = k;
      continue;
    }
    if (isDigit(c)) {
      let j = i;
      while (isDigit(s[j])) j++;
      err('unexpected-char', `A number can only appear directly after a sentence letter, as in P1.`, i, j);
      i = j;
      continue;
    }
    const multi = MULTI_ALIASES.find(([a]) => s.startsWith(a, i));
    if (multi) {
      toks.push({ t: 'bin', kind: multi[1], start: i, end: i + multi[0].length });
      i += multi[0].length;
      continue;
    }
    if (NOT_CHARS.has(c) || c === '-') {
      toks.push({ t: 'not', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c in BINARY_CHARS) {
      toks.push({ t: 'bin', kind: BINARY_CHARS[c], start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c in OPEN_TO_CLOSE) {
      toks.push({ t: 'open', ch: c, start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c in CLOSE_TO_OPEN) {
      toks.push({ t: 'close', ch: c, start: i, end: i + 1 });
      i++;
      continue;
    }
    const cp = s.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    if (c === '<') {
      err('unexpected-char', `“<” on its own isn't a connective.`, i, i + 1, 'For the biconditional, write <-> (↔).');
    } else {
      err('unexpected-char', `“${ch}” isn't a symbol used in sentential logic.`, i, i + ch.length, 'Use sentence letters (P, Q, …), ¬ ∧ ∨ → ↔ and brackets.');
    }
    i += ch.length;
  }
  toks.push({ t: 'end', start: s.length, end: s.length });
  return toks;
}

// ---------------------------------------------------------------------------
// Recursive-descent parser
// ---------------------------------------------------------------------------

class ParseFailure {
  constructor(public error: ParseError) {}
}

interface Node { f: Formula; start: number; end: number }

function symOf(tok: Token): string {
  if (tok.t === 'bin') return SYMBOL[tok.kind];
  if (tok.t === 'not') return SYMBOL.not;
  return '';
}

/** Display form of an operand as it appears inside a larger formula. */
const show = (f: Formula) => format(f, { dropOuter: false });

class Parser {
  private pos = 0;
  constructor(private toks: Token[]) {}

  private peek(): Token {
    return this.toks[this.pos];
  }
  private next(): Token {
    return this.toks[this.pos++];
  }
  private fail(code: ParseErrorCode, message: string, span: Span, hint?: string): never {
    throw new ParseFailure({ code, message, span, ...(hint ? { hint } : {}) });
  }
  /** Run `fn` speculatively; restore the position afterwards and return null on failure. */
  private attempt<T>(fn: () => T): T | null {
    const saved = this.pos;
    try {
      return fn();
    } catch (e) {
      if (e instanceof ParseFailure) return null;
      throw e;
    } finally {
      this.pos = saved;
    }
  }

  parseTop(): Formula {
    const node = this.parseFormula(null);
    const t = this.peek();
    if (t.t === 'close') {
      this.fail('unbalanced-close', `This “${t.ch}” has no matching opening bracket.`, { start: t.start, end: t.end }, `Remove it, or add a matching “${CLOSE_TO_OPEN[t.ch]}”.`);
    }
    return node.f;
  }

  /** formula := unary (BINOP unary)? — a second BINOP at the same level is ambiguous. */
  private parseFormula(prev: Token | null): Node {
    const left = this.parseUnary(prev);
    this.checkAfterOperand(left);
    const op = this.peek();
    if (op.t !== 'bin') return left;
    this.next();
    const right = this.parseUnary(op);
    this.checkAfterOperand(right);
    if (this.peek().t === 'bin') this.ambiguous(left, op, right);
    return { f: { kind: op.kind, left: left.f, right: right.f } as Formula, start: left.start, end: right.end };
  }

  /** unary := NOT unary | ATOM | OPEN formula CLOSE. `prev` is the token before the expected operand. */
  private parseUnary(prev: Token | null): Node {
    const t = this.peek();
    switch (t.t) {
      case 'atom':
        this.next();
        return { f: { kind: 'atom', name: t.name }, start: t.start, end: t.end };
      case 'not': {
        this.next();
        const operand = this.parseUnary(t);
        return { f: { kind: 'not', operand: operand.f }, start: t.start, end: operand.end };
      }
      case 'open': {
        this.next();
        const inner = this.parseFormula(t);
        const c = this.peek();
        if (c.t === 'close') {
          if (c.ch !== OPEN_TO_CLOSE[t.ch]) {
            this.fail(
              'mismatched-bracket',
              `This “${c.ch}” doesn't match the “${t.ch}” it closes.`,
              { start: c.start, end: c.end },
              `Close “${t.ch}” with “${OPEN_TO_CLOSE[t.ch]}”.`,
            );
          }
          this.next();
          return { f: inner.f, start: t.start, end: c.end };
        }
        // After a formula only a connective, a closing bracket or the end can follow.
        this.fail('unbalanced-open', `This “${t.ch}” is never closed.`, { start: t.start, end: t.end }, `Add a matching “${OPEN_TO_CLOSE[t.ch]}”.`);
      }
      case 'error':
        throw new ParseFailure(t.error);
      case 'end':
      case 'close':
        return this.missingOperandBefore(t, prev);
      case 'bin':
        return this.binaryWithoutLeft(t, prev);
    }
  }

  /** Expected an operand but found the end of input or a closing bracket. */
  private missingOperandBefore(t: Token & { t: 'end' | 'close' }, prev: Token | null): never {
    if (prev === null) {
      // Only reachable for a close bracket at the very start (blank input is handled earlier).
      const ch = t.t === 'close' ? t.ch : ')';
      this.fail('unbalanced-close', `This “${ch}” has no matching opening bracket.`, { start: t.start, end: t.end });
    }
    if (prev.t === 'open') {
      if (t.t === 'end') {
        this.fail('unbalanced-open', `This “${prev.ch}” is never closed.`, { start: prev.start, end: prev.end }, `Add a matching “${OPEN_TO_CLOSE[prev.ch]}”.`);
      }
      if (t.ch !== OPEN_TO_CLOSE[prev.ch]) {
        this.fail('mismatched-bracket', `This “${t.ch}” doesn't match the “${prev.ch}” it closes.`, { start: t.start, end: t.end }, `Close “${prev.ch}” with “${OPEN_TO_CLOSE[prev.ch]}”.`);
      }
      this.fail('empty-parens', `There is nothing inside these brackets.`, { start: prev.start, end: t.end }, 'Put a formula inside, or remove the brackets.');
    }
    const span = { start: prev.start, end: prev.end };
    if (prev.t === 'not') {
      const after = t.t === 'end' ? '' : `, but “${t.ch}” comes right after it`;
      this.fail('missing-operand', `¬ must be followed by a formula${after}.`, span, 'For example: ¬P');
    }
    const sym = symOf(prev);
    const after = t.t === 'end' ? 'nothing follows it' : `nothing follows it before “${t.ch}”`;
    this.fail('missing-operand', `${sym} requires a formula on both sides — ${after}.`, span);
  }

  /** Expected an operand but found a binary connective. */
  private binaryWithoutLeft(t: Token & { t: 'bin' }, prev: Token | null): never {
    const sym = SYMBOL[t.kind];
    if (prev?.t === 'not') {
      this.fail(
        'missing-operand',
        `¬ must be followed by a formula, but ${sym} comes right after it.`,
        { start: prev.start, end: t.end },
        '¬ applies to the formula immediately after it, e.g. ¬P or ¬(P ∧ Q).',
      );
    }
    // Span the connective and (if it parses) the formula on its right: "→ Q".
    const rightEnd = this.attempt(() => {
      this.next();
      return this.parseUnary(t).end;
    });
    const span = { start: t.start, end: rightEnd ?? t.end };
    const where = prev?.t === 'bin' ? ` (it comes right after ${symOf(prev)})` : '';
    this.fail('missing-operand', `${sym} requires a formula on both sides — nothing comes before it${where}.`, span);
  }

  /** After an operand, reject tokens that cannot follow it (anything except a connective, a close, or the end). */
  private checkAfterOperand(prev: Node): void {
    const t = this.peek();
    const prevTok = this.toks[this.pos - 1];
    switch (t.t) {
      case 'error':
        throw new ParseFailure(t.error);
      case 'not': {
        const right = this.attempt(() => {
          this.next();
          return this.parseUnary(t);
        });
        const between = right ? `${show(prev.f)} and ${show(right.f)}` : 'two formulas';
        this.fail(
          'misplaced-connective',
          `¬ is not a binary connective, so it can't join ${between}.`,
          { start: t.start, end: t.end },
          right
            ? `Use ∧, ∨, → or ↔ to join them; ¬ can come right after one, as in ${show(prev.f)} ∧ ${show({ kind: 'not', operand: right.f })}.`
            : 'Use ∧, ∨, → or ↔ to join two formulas.',
        );
      }
      case 'atom':
      case 'open': {
        if (t.t === 'atom' && prevTok.t === 'atom' && prevTok.end === t.start) {
          const both = prevTok.name + t.name;
          this.fail(
            'invalid-atom',
            `Sentence letters are single capital letters, so “${both}” is two sentence letters (${prevTok.name} and ${t.name}) with no connective between them.`,
            { start: prevTok.start, end: t.end },
            `Put a connective between them, e.g. ${prevTok.name} ∧ ${t.name}.`,
          );
        }
        const right = this.attempt(() => this.parseUnary(null));
        const end = right ? right.end : t.end;
        const r = right ? show(right.f) : t.t === 'atom' ? t.name : t.ch;
        this.fail(
          'missing-connective',
          `Missing connective: ${show(prev.f)} and ${r} need a connective (∧, ∨, → or ↔) between them.`,
          { start: prev.start, end },
          `For example: ${show(prev.f)} ∧ ${r}`,
        );
      }
      default:
        return;
    }
  }

  /** Called with `left op right` parsed and another binary connective next. */
  private ambiguous(left: Node, op: Token & { t: 'bin' }, right: Node): never {
    const operands: Node[] = [left, right];
    const ops: BinaryKind[] = [op.kind];
    let end = right.end;
    // Collect the rest of the unparenthesized chain (best effort) for the hint.
    for (;;) {
      const o = this.peek();
      if (o.t !== 'bin') break;
      this.next();
      end = o.end;
      const nextOperand = this.attempt(() => {
        const n = this.parseUnary(o);
        this.checkAfterOperand(n);
        return { node: n, pos: this.pos };
      });
      ops.push(o.kind);
      if (!nextOperand) break;
      this.pos = nextOperand.pos;
      operands.push(nextOperand.node);
      end = nextOperand.node.end;
    }
    const complete = operands.length === ops.length + 1;
    const syms = ops.map((k) => SYMBOL[k]);
    let hint: string | undefined;
    if (complete) {
      const txt = operands.map((n) => show(n.f));
      let leftNested = txt[0];
      for (let k = 0; k < syms.length; k++) {
        leftNested = k === syms.length - 1 ? `${leftNested} ${syms[k]} ${txt[k + 1]}` : `(${leftNested} ${syms[k]} ${txt[k + 1]})`;
      }
      hint =
        txt.length === 3
          ? `Add parentheses: ${leftNested} or ${txt[0]} ${syms[0]} (${txt[1]} ${syms[1]} ${txt[2]})`
          : `Add parentheses, e.g. ${leftNested}`;
    }
    const allSame = ops.every((k) => k === ops[0]);
    const message = allSame
      ? `Each ${syms[0]} joins exactly two formulas, so a chain like this needs parentheses to show the grouping — even when the connectives are the same.`
      : `It's ambiguous whether ${syms[0]} or ${syms[1]} is the main connective. Add parentheses to show the grouping.`;
    this.fail('ambiguous', message, { start: left.start, end }, hint);
  }
}

/** Parse a formula. Never throws. Spans refer to the input as given. */
export function parse(input: string): ParseResult {
  const normalized = normalizeInput(input).text;
  if (input.trim() === '') {
    return {
      ok: false,
      normalized,
      error: { code: 'empty', message: 'Enter a formula.', span: { start: 0, end: input.length }, hint: 'For example: (P ∧ Q) → R' },
    };
  }
  try {
    const formula = new Parser(lex(input)).parseTop();
    return { ok: true, formula, normalized };
  } catch (e) {
    if (e instanceof ParseFailure) return { ok: false, error: e.error, normalized };
    throw e;
  }
}

/** Parse or throw (for tests / trusted internal data). */
export function parseOrThrow(input: string): Formula {
  const r = parse(input);
  if (!r.ok) {
    const err = new Error(`Cannot parse “${input}” (${r.error.code} at ${r.error.span.start}): ${r.error.message}`);
    (err as Error & { parseError?: ParseError }).parseError = r.error;
    throw err;
  }
  return r.formula;
}
