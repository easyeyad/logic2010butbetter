import type { BinaryKind, Formula, Term } from './ast';
import { SYMBOL, VARIABLE_LETTERS } from './ast';
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
  | 'misplaced-connective'   // 'P ¬ Q'
  | 'too-deep'               // more than MAX_NESTING_DEPTH nested brackets/negations
  | 'bad-quantifier';        // '∀Fx' (no variable), '∀a' (quantifying a name)

/**
 * Maximum nesting of brackets and negations `parse` accepts. Deeper input gets a
 * 'too-deep' error, so every formula parse returns is safe for the recursive
 * engines (format, evaluate, proofs...).
 */
export const MAX_NESTING_DEPTH = 500;

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

/** Quantifier symbols and their ASCII aliases (@ = ∀, $ = ∃). */
const QUANT_CHARS: Record<string, 'forall' | 'exists'> = { '∀': 'forall', '@': 'forall', '∃': 'exists', '$': 'exists' };

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
 *  - ~ ! ∼ − → ¬;  & ^ * · → ∧;  | → ∨;  > ⊃ ⇒ → →;  ≡ ⇔ → ↔;  @ → ∀;  $ → ∃.
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
      else if (c in QUANT_CHARS) rep = SYMBOL[QUANT_CHARS[c]];
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
  /** Sentence letter (args empty) or predication (Fa, Rxy). */
  | { t: 'atom'; name: string; args: Term[]; start: number; end: number }
  /** A lowercase term not attached to a predicate letter (only valid right after a quantifier). */
  | { t: 'term'; term: Term; start: number; end: number }
  /** Quantifier; `variable` is filled in by the parser once the variable is read. */
  | { t: 'quant'; kind: 'forall' | 'exists'; variable?: string; start: number; end: number }
  | { t: 'not'; start: number; end: number }
  | { t: 'bin'; kind: BinaryKind; start: number; end: number }
  | { t: 'open'; ch: string; start: number; end: number }
  | { t: 'close'; ch: string; start: number; end: number }
  | { t: 'error'; error: ParseError; start: number; end: number }
  | { t: 'end'; start: number; end: number };

const makeTerm = (name: string): Term => ({ kind: VARIABLE_LETTERS.includes(name[0]) ? 'var' : 'name', name });

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
      // Capital letter, optional digits, then any directly attached terms (Rab, Fx1y).
      let j = i + 1;
      while (isDigit(s[j])) j++;
      const name = s.slice(i, j);
      const args: Term[] = [];
      while (isLower(s[j]) && s[j] !== 'v') {
        let k = j + 1;
        while (isDigit(s[k])) k++;
        args.push(makeTerm(s.slice(j, k)));
        j = k;
      }
      toks.push({ t: 'atom', name, args, start: i, end: j });
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
      } else if (word === 'v') {
        err(
          'invalid-atom',
          `“v” can't be a sentence letter, name or variable — it is reserved for “or”. For “or”, use ∨, or put spaces around the v. (Did you mean the sentence letter V?)`,
          i,
          k,
        );
      } else if (word.length === 1) {
        toks.push({ t: 'term', term: makeTerm(word + digits), start: i, end: k });
      } else {
        err(
          'invalid-atom',
          `“${s.slice(i, k)}” is not a sentence letter. Sentence letters are single capital letters, optionally followed by digits (like P or Q1); lowercase names and variables go right after a predicate letter (Fa, Rxy).`,
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
    if (c in QUANT_CHARS) {
      toks.push({ t: 'quant', kind: QUANT_CHARS[c], start: i, end: i + 1 });
      i++;
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
  if (tok.t === 'quant') return SYMBOL[tok.kind] + (tok.variable ?? '');
  return '';
}

const termList = (ts: Term[]) => ts.map((t) => t.name).join('');

/** Student-facing complaint about a lowercase term that isn't attached to a predicate letter. */
function strayTermMessage(term: Term): string {
  const upper = term.name.toUpperCase();
  return term.kind === 'var'
    ? `A variable like ${term.name} must follow a predicate letter, e.g. F${term.name} (or a quantifier, as in ∀${term.name}). Sentence letters are capitals: did you mean ${upper}?`
    : `Sentence letters must be capital letters: did you mean ${upper}? (Lowercase names like ${term.name} go right after a predicate letter, as in F${term.name}.)`;
}

/** Display form of an operand as it appears inside a larger formula. */
const show = (f: Formula) => format(f, { dropOuter: false });

class Parser {
  private pos = 0;
  constructor(private toks: Token[], private src: string) {}

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
        return {
          f: t.args.length ? { kind: 'pred', name: t.name, args: t.args } : { kind: 'atom', name: t.name },
          start: t.start,
          end: t.end,
        };
      case 'term':
        this.fail('invalid-atom', strayTermMessage(t.term), { start: t.start, end: t.end });
      case 'quant': {
        this.next();
        const sym = SYMBOL[t.kind];
        const v = this.peek();
        if (v.t === 'error') throw new ParseFailure(v.error);
        if (v.t !== 'term') {
          this.fail('bad-quantifier', `${sym} must be followed by a variable such as x.`, { start: t.start, end: t.end }, `For example: ${sym}x Fx`);
        }
        if (v.term.kind === 'name') {
          this.fail(
            'bad-quantifier',
            `${v.term.name} is a name; quantify a variable: x, y, z, w or u.`,
            { start: t.start, end: v.end },
            `For example: ${sym}x`,
          );
        }
        this.next();
        const q: Token = { t: 'quant', kind: t.kind, variable: v.term.name, start: t.start, end: v.end };
        const body = this.parseUnary(q);
        return { f: { kind: t.kind, variable: v.term.name, body: body.f }, start: t.start, end: body.end };
      }
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
    if (prev.t === 'quant') {
      const q = symOf(prev);
      const after = t.t === 'end' ? '' : `, but “${t.ch}” comes right after it`;
      this.fail('missing-operand', `${q} must be followed by a formula${after}.`, span, `For example: ${q} F${prev.variable}`);
    }
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
    if (prev?.t === 'quant') {
      this.fail(
        'missing-operand',
        `${symOf(prev)} must be followed by a formula, but ${sym} comes right after it.`,
        { start: prev.start, end: t.end },
        `A quantifier applies to the formula immediately after it, e.g. ${symOf(prev)}(F${prev.variable} ${sym} G${prev.variable}).`,
      );
    }
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
      case 'term': {
        if (prevTok.t === 'atom' && prev.end === prevTok.end) {
          // "F a" or "Fa b": terms separated from their predicate letter by spaces.
          let j = this.pos;
          const extra: Term[] = [];
          while (this.toks[j].t === 'term') extra.push((this.toks[j] as Token & { t: 'term' }).term), j++;
          const fixed = prevTok.name + termList(prevTok.args) + termList(extra);
          this.fail(
            'invalid-atom',
            `Write the terms right after the predicate letter, with no spaces: ${fixed}.`,
            { start: prevTok.start, end: this.toks[j - 1].end },
            `Write ${fixed}`,
          );
        }
        this.fail('invalid-atom', strayTermMessage(t.term), { start: t.start, end: t.end });
      }
      case 'atom':
      case 'open':
      case 'quant': {
        if (t.t === 'atom' && prevTok.t === 'atom' && prevTok.end === t.start) {
          const a = this.src.slice(prevTok.start, prevTok.end);
          const b = this.src.slice(t.start, t.end);
          const plain = !prevTok.args.length && !t.args.length;
          this.fail(
            'invalid-atom',
            plain
              ? `Sentence letters are single capital letters, so “${a + b}” is two sentence letters (${a} and ${b}) with no connective between them.`
              : `“${a + b}” is two atomic formulas (${a} and ${b}) with no connective between them.`,
            { start: prevTok.start, end: t.end },
            `Put a connective between them, e.g. ${a} ∧ ${b}.`,
          );
        }
        const right = this.attempt(() => this.parseUnary(null));
        const end = right ? right.end : t.end;
        const r = right ? show(right.f) : this.src.slice(t.start, t.end);
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
      // A dangling connective (nothing usable after it) is the more useful
      // diagnosis: report its own error (e.g. missing-operand) instead.
      if (this.attempt(() => this.parseUnary(o)) === null) this.parseUnary(o);
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

const tooDeepMessage = `This formula is nested too deeply: at most ${MAX_NESTING_DEPTH} levels of brackets and ¬ are allowed.`;

/**
 * Reject input nested deeper than MAX_NESTING_DEPTH before the recursive parser
 * runs. Depth counts open brackets plus the ¬s stacked in front of each one and
 * the current run of ¬s (each is a level of the resulting formula).
 */
function checkDepth(toks: Token[]): void {
  const stack: number[] = [];
  let open = 0;
  let notRun = 0;
  for (const t of toks) {
    if (t.t === 'not' || t.t === 'quant') notRun++;
    else if (t.t === 'term') continue;
    else if (t.t === 'open') {
      stack.push(1 + notRun);
      open += 1 + notRun;
      notRun = 0;
    } else {
      if (t.t === 'close' && stack.length) open -= stack.pop()!;
      notRun = 0;
    }
    if (open + notRun > MAX_NESTING_DEPTH) {
      throw new ParseFailure({
        code: 'too-deep',
        message: tooDeepMessage,
        span: { start: t.start, end: t.end },
        hint: 'Simplify the formula, e.g. ¬¬P is equivalent to P.',
      });
    }
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
    const toks = lex(input);
    checkDepth(toks);
    const formula = new Parser(toks, input).parseTop();
    return { ok: true, formula, normalized };
  } catch (e) {
    if (e instanceof ParseFailure) return { ok: false, error: e.error, normalized };
    // Last resort: parse must never throw.
    return {
      ok: false,
      normalized,
      error: {
        code: e instanceof RangeError ? 'too-deep' : 'unexpected-char',
        message: e instanceof RangeError ? tooDeepMessage : 'This formula could not be read.',
        span: { start: 0, end: input.length },
      },
    };
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
