/**
 * Bounded automatic prover producing Logic 2010-style derivations using only
 * the primitive rules (MP MT DN R S ADJ ADD MTP BC CB) and DD/CD/ID.
 *
 * Strategy (Kalish–Montague heuristics + a complete fallback):
 *  - Show φ: first try DD (forward saturation, then build φ from available
 *    pieces with ADJ/ADD/CB/DN). Otherwise by the goal's shape:
 *    φ → ψ ⇒ CD;  φ ∧ ψ ⇒ show each conjunct + ADJ;  φ ↔ ψ ⇒ two
 *    conditionals + CB;  anything else ⇒ ID.
 *  - Inside an ID box we look for a contradiction: forward saturation
 *    (elimination rules plus small ID/CD "macros" for negated compounds), then
 *    tableau-style case splits ("Show ¬A" by ID) on undecided disjunctions,
 *    conditionals, negated conjunctions and negated biconditionals. That
 *    refutation procedure is complete for propositional logic, so every valid
 *    argument is provable given enough budget.
 *  - Unused lines are pruned at the end.
 *
 * OWNER: Proof Engine.
 */
import type { Formula } from '../logic/ast';
import { And, Iff, Implies, Not, Or } from '../logic/ast';
import type { CloseMethod, DraftLine, LineKind, RuleId } from './types';
import { entails, equals as eq, fmt } from './util';

class Budget extends Error {}

interface Avail {
  f: Formula;
  n: number;
  key: string;
}

type Pair = [number, number];

export interface ProverOptions {
  /** Max lines emitted (including ones later rolled back). */
  maxLines?: number;
  /** Never open a Show whose formula is any currently open Show's formula (hints). */
  strictNesting?: boolean;
}

export class Prover {
  out: DraftLine[] = [];
  avail: Avail[] = [];
  private map = new Map<string, number>();
  depth = 0;
  private emitted = 0;
  private maxLines: number;
  private idSeq = 0;
  /**
   * Formulas of the open Show lines we are currently inside, innermost last.
   * A Show line is never opened as a direct child of a Show line with the
   * same formula (always redundant, and it would make hints regress).
   */
  openStack: string[] = [];
  private strict: boolean;

  constructor(opts: ProverOptions = {}) {
    this.maxLines = opts.maxLines ?? 6000;
    this.strict = !!opts.strictNesting;
  }

  // ------------------------------------------------------------ bookkeeping

  has(f: Formula): number | undefined {
    return this.map.get(fmt(f));
  }

  private truthy(x: Formula): boolean {
    return this.has(x) !== undefined || (x.kind === 'not' && x.operand.kind === 'not' && this.has(x.operand.operand) !== undefined);
  }

  private falsy(x: Formula): boolean {
    return this.has(Not(x)) !== undefined || (x.kind === 'not' && this.has(x.operand) !== undefined);
  }

  addAvail(f: Formula, n: number): void {
    const key = fmt(f);
    this.avail.push({ f, n, key });
    if (!this.map.has(key)) this.map.set(key, n);
  }

  private rebuild(): void {
    this.map.clear();
    for (const a of this.avail) if (!this.map.has(a.key)) this.map.set(a.key, a.n);
  }

  snapshot(): [number, number, number] {
    return [this.out.length, this.avail.length, this.depth];
  }

  restore([o, a, d]: [number, number, number]): void {
    this.out.length = o;
    this.avail.length = a;
    this.depth = d;
    this.rebuild();
  }

  private emit(kind: LineKind, f: Formula, extra: Partial<DraftLine> = {}): number {
    if (++this.emitted > this.maxLines) throw new Budget();
    this.out.push({ id: `p${++this.idSeq}`, kind, text: fmt(f), depth: this.depth, ...extra });
    const n = this.out.length;
    if (kind !== 'show') this.addAvail(f, n);
    return n;
  }

  premise(f: Formula): number {
    return this.emit('premise', f);
  }

  /** Emit a step unconditionally. */
  step(f: Formula, rule: RuleId, refs: number[]): number {
    return this.emit('step', f, { rule, refs });
  }

  /** Emit a step only if the formula isn't already available. Returns true if new. */
  private add(f: Formula, rule: RuleId, refs: number[]): boolean {
    if (this.has(f) !== undefined) return false;
    this.step(f, rule, refs);
    return true;
  }

  /** Line with exactly f, deriving it by DN from its double-negation partner if needed. */
  private getOrDN(x: Formula): number | undefined {
    const n = this.has(x);
    if (n !== undefined) return n;
    if (x.kind === 'not' && x.operand.kind === 'not') {
      const m = this.has(x.operand.operand);
      if (m !== undefined) return this.step(x, 'DN', [m]);
    }
    return undefined;
  }

  /** Make sure line n is inside the box of Show line `show` (R it in otherwise). */
  ensureIn(n: number, show: number): number {
    if (n > show) return n;
    const f = this.formulaOf(n);
    const key = fmt(f);
    for (let i = this.avail.length - 1; i >= 0 && this.avail[i].n > show; i--) if (this.avail[i].key === key) return this.avail[i].n;
    return this.step(f, 'R', [n]);
  }

  formulaOf(n: number): Formula {
    const a = this.avail.find((x) => x.n === n);
    if (a) return a.f;
    throw new Error(`line ${n} not available`);
  }

  /** Open "Show G", run body inside the box, close with method + returned refs. */
  box(G: Formula, method: CloseMethod, body: (show: number) => number[] | null, allowNested = false): number | null {
    const key = fmt(G);
    if (!allowNested) {
      if (this.strict ? this.openStack.includes(key) : this.openStack[this.openStack.length - 1] === key) return null;
      const have = this.has(G);
      if (have !== undefined) return have;
    }
    const snap = this.snapshot();
    const availAtShow = this.avail.length;
    const show = this.emit('show', G);
    this.depth++;
    this.openStack.push(key);
    let refs: number[] | null;
    try {
      refs = body(show);
    } finally {
      this.openStack.pop();
    }
    if (!refs) {
      this.restore(snap);
      return null;
    }
    this.depth = snap[2];
    this.out[show - 1].close = { method, refs };
    this.avail.length = availAtShow;
    this.rebuild();
    this.addAvail(G, show);
    return show;
  }

  assume(f: Formula, kind: 'CD' | 'ID'): number {
    return this.emit('assumption', f, { assumption: kind });
  }

  static idAssumption(G: Formula): Formula {
    return G.kind === 'not' ? G.operand : Not(G);
  }

  showID(G: Formula, body: (show: number, asm: number) => Pair | null): number | null {
    return this.box(G, 'ID', (show) => {
      const asm = this.assume(Prover.idAssumption(G), 'ID');
      const pair = body(show, asm);
      if (!pair) return null;
      return [this.ensureIn(pair[0], show), this.ensureIn(pair[1], show)];
    });
  }

  showCD(G: Extract<Formula, { kind: 'implies' }>, body: (show: number, asm: number) => number | null | undefined): number | null {
    return this.box(G, 'CD', (show) => {
      const asm = this.assume(G.left, 'CD');
      const b = body(show, asm);
      if (b == null) return null;
      return [this.ensureIn(b, show)];
    });
  }

  /**
   * From contradictory lines x and y, derive `target` without a box:
   * χ ⊢ χ ∨ target (ADD), then χ ∨ target, ¬χ ⊢ target (MTP).
   */
  exFalso(x: number, y: number, target: Formula): number | null {
    const have = this.has(target);
    if (have !== undefined) return have;
    const fx = this.formulaOf(x);
    const fy = this.formulaOf(y);
    let pos: number, neg: number, fp: Formula;
    if (fy.kind === 'not' && eq(fy.operand, fx)) [pos, neg, fp] = [x, y, fx];
    else if (fx.kind === 'not' && eq(fx.operand, fy)) [pos, neg, fp] = [y, x, fy];
    else return null;
    const d = this.step(Or(fp, target), 'ADD', [pos]);
    return this.step(target, 'MTP', [d, neg]);
  }

  // ------------------------------------------------------------- saturation

  /**
   * Forward chaining with elimination rules; with `macros`, also the small
   * sub-derivations that decompose negated compounds.
   */
  saturate(macros = true): void {
    for (let round = 0; round < 60; round++) {
      let changed = false;
      for (let i = 0; i < this.avail.length; i++) {
        const { f, n } = this.avail[i];
        switch (f.kind) {
          case 'and':
            if (this.add(f.left, 'S', [n])) changed = true;
            if (this.add(f.right, 'S', [n])) changed = true;
            break;
          case 'iff':
            if (this.add(Implies(f.left, f.right), 'BC', [n])) changed = true;
            if (this.add(Implies(f.right, f.left), 'BC', [n])) changed = true;
            break;
          case 'implies': {
            if (this.has(f.right) === undefined) {
              const a = this.getOrDN(f.left) ?? (f.left.kind === 'and' || f.left.kind === 'or' || f.left.kind === 'iff' ? this.obtainInline(f.left, 2) ?? undefined : undefined);
              if (a !== undefined) {
                this.step(f.right, 'MP', [n, a]);
                changed = true;
              }
            }
            if (this.has(Not(f.left)) === undefined) {
              const b = this.getOrDN(Not(f.right));
              if (b !== undefined) {
                this.step(Not(f.left), 'MT', [n, b]);
                changed = true;
              }
            }
            break;
          }
          case 'or': {
            if (this.has(f.right) === undefined) {
              const a = this.getOrDN(Not(f.left));
              if (a !== undefined) {
                this.step(f.right, 'MTP', [n, a]);
                changed = true;
              }
            }
            if (this.has(f.left) === undefined) {
              const b = this.getOrDN(Not(f.right));
              if (b !== undefined) {
                this.step(f.left, 'MTP', [n, b]);
                changed = true;
              }
            }
            break;
          }
          case 'not': {
            const op = f.operand;
            if (op.kind === 'not') {
              if (this.add(op.operand, 'DN', [n])) changed = true;
            } else if (macros) {
              if (this.macroNeg(n, op)) changed = true;
            }
            break;
          }
          default:
            break;
        }
      }
      if (!changed) return;
    }
  }

  /** Decompose ¬op (on line nNeg). Returns true if something new was added. */
  private macroNeg(nNeg: number, op: Formula): boolean {
    let changed = false;
    const run = (target: Formula, fn: () => number | null) => {
      if (this.has(target) !== undefined) return;
      if (fn() !== null) changed = true;
    };
    if (op.kind === 'or') {
      for (const part of [op.left, op.right])
        run(Not(part), () =>
          this.showID(Not(part), (show, asm) => {
            const d = this.step(op, 'ADD', [asm]);
            return [d, this.ensureIn(nNeg, show)];
          }),
        );
    } else if (op.kind === 'implies') {
      const { left: A, right: B } = op;
      if (this.falsy(A) || this.truthy(B)) {
        // The conditional itself is derivable → contradiction with ¬(A → B).
        run(op, () =>
          this.showCD(op, (_s, a) => {
            const b = this.truthy(B) ? this.getOrDN(B) : undefined;
            if (b !== undefined) return b;
            const nA = this.getOrDN(Not(A)) ?? this.has(Not(A));
            const aNeg = nA ?? (A.kind === 'not' ? this.has(A.operand) : undefined);
            if (aNeg === undefined) return null;
            return this.exFalso(a, aNeg, B);
          }),
        );
        return changed;
      }
      run(A, () =>
        this.showID(A, (show, asm) => {
          const c = this.showCD(op, (_s2, a2) =>
            this.exFalso(a2, asm, B),
          );
          return c === null ? null : [c, this.ensureIn(nNeg, show)];
        }),
      );
      run(Not(B), () =>
        this.showID(Not(B), (show, asmB) => {
          const c = this.showCD(op, () => asmB);
          return c === null ? null : [c, this.ensureIn(nNeg, show)];
        }),
      );
    } else if (op.kind === 'and') {
      const { left: A, right: B } = op;
      if (this.truthy(A) && this.has(Not(B)) === undefined) {
        const nA = this.getOrDN(A)!;
        run(Not(B), () =>
          this.showID(Not(B), (show, asmB) => [this.step(op, 'ADJ', [nA, asmB]), this.ensureIn(nNeg, show)]),
        );
      }
      if (this.truthy(B) && this.has(Not(A)) === undefined) {
        const nB = this.getOrDN(B)!;
        run(Not(A), () =>
          this.showID(Not(A), (show, asmA) => [this.step(op, 'ADJ', [asmA, nB]), this.ensureIn(nNeg, show)]),
        );
      }
    } else if (op.kind === 'iff') {
      const { left: A, right: B } = op;
      const AB = Implies(A, B) as Extract<Formula, { kind: 'implies' }>;
      const BA = Implies(B, A) as Extract<Formula, { kind: 'implies' }>;
      const finish = (show: number, c1: number | null, c2: number | null): Pair | null => {
        if (c1 === null || c2 === null) return null;
        return [this.step(op, 'CB', [c1, c2]), this.ensureIn(nNeg, show)];
      };
      const sameA = (this.truthy(A) && this.truthy(B)) || (this.falsy(A) && this.falsy(B));
      if (sameA && this.has(op) === undefined) {
        // Both sides agree → A ↔ B is derivable → contradiction with ¬(A ↔ B).
        const negLine = (x: Formula) => this.getOrDN(Not(x)) ?? (x.kind === 'not' ? this.has(x.operand) : undefined);
        const side = (from: Formula, to: Formula) =>
          this.showCD(Implies(from, to) as Extract<Formula, { kind: 'implies' }>, (_s, a) => {
            if (this.truthy(to)) return this.getOrDN(to) ?? null;
            const nf = negLine(from);
            if (nf === undefined) return null;
            return this.exFalso(a, nf, to);
          });
        run(op, () => {
          const c1 = side(A, B);
          const c2 = c1 === null ? null : side(B, A);
          return c1 === null || c2 === null ? null : this.step(op, 'CB', [c1, c2]);
        });
        return changed;
      }
      if (this.truthy(A) && this.has(Not(B)) === undefined) {
        const nA = this.getOrDN(A)!;
        run(Not(B), () =>
          this.showID(Not(B), (show, asmB) => {
            const c1 = this.showCD(AB, () => asmB);
            const c2 = c1 === null ? null : this.showCD(BA, () => nA);
            return finish(show, c1, c2);
          }),
        );
      }
      if (this.truthy(B) && this.has(Not(A)) === undefined) {
        const nB = this.getOrDN(B)!;
        run(Not(A), () =>
          this.showID(Not(A), (show, asmA) => {
            const c1 = this.showCD(AB, () => nB);
            const c2 = c1 === null ? null : this.showCD(BA, () => asmA);
            return finish(show, c1, c2);
          }),
        );
      }
      if (this.falsy(A) && this.has(B) === undefined) {
        const nNA = this.getOrDN(Not(A))!;
        if (nNA !== undefined)
          run(B, () =>
            this.showID(B, (show, asm) => {
              const c1 = this.showCD(AB, (_s, a) => this.exFalso(a, nNA, B));
              const c2 = c1 === null ? null : this.showCD(BA, (_s, b) => this.exFalso(b, asm, A));
              return finish(show, c1, c2);
            }),
          );
      }
      if (this.falsy(B) && this.has(A) === undefined) {
        const nNB = this.getOrDN(Not(B));
        if (nNB !== undefined)
          run(A, () =>
            this.showID(A, (show, asm) => {
              const c1 = this.showCD(AB, (_s, a) => this.exFalso(a, asm, B));
              const c2 = c1 === null ? null : this.showCD(BA, (_s, b) => this.exFalso(b, nNB, A));
              return finish(show, c1, c2);
            }),
          );
      }
    }
    return changed;
  }

  contradiction(): Pair | null {
    for (const a of this.avail) {
      if (a.f.kind === 'not') {
        const m = this.has(a.f.operand);
        if (m !== undefined) return [m, a.n];
      }
    }
    return null;
  }

  /** Build G from available pieces with introduction rules only (no boxes). */
  obtainInline(G: Formula, depth = 3): number | null {
    const have = this.has(G);
    if (have !== undefined) return have;
    if (depth <= 0) return null;
    const snap = this.snapshot();
    let r: number | null = null;
    if (G.kind === 'not' && G.operand.kind === 'not') {
      const c = this.obtainInline(G.operand.operand, depth - 1);
      if (c !== null) r = this.step(G, 'DN', [c]);
    } else if (G.kind === 'and') {
      const a = this.obtainInline(G.left, depth - 1);
      const b = a === null ? null : this.obtainInline(G.right, depth - 1);
      if (a !== null && b !== null) r = this.step(G, 'ADJ', [a, b]);
    } else if (G.kind === 'or') {
      const a = this.obtainInline(G.left, depth - 1) ?? this.obtainInline(G.right, depth - 1);
      if (a !== null) r = this.step(G, 'ADD', [a]);
    } else if (G.kind === 'iff') {
      const a = this.obtainInline(Implies(G.left, G.right), depth - 1);
      const b = a === null ? null : this.obtainInline(Implies(G.right, G.left), depth - 1);
      if (a !== null && b !== null) r = this.step(G, 'CB', [a, b]);
    }
    if (r === null) this.restore(snap);
    return r;
  }

  /** G available at the current depth: inline if possible, else a nested Show. */
  obtain(G: Formula): number | null {
    return this.obtainInline(G) ?? this.proveGoal(G);
  }

  // --------------------------------------------------------------- strategy

  /** Closing strategies for Show G, in the order a good student would try them. */
  strategies(G: Formula): { method: CloseMethod; body: (show: number) => number[] | null }[] {
    const out: { method: CloseMethod; body: (show: number) => number[] | null }[] = [
      { method: 'DD', body: (show) => this.bodyDDQuick(G, show) },
    ];
    switch (G.kind) {
      case 'implies':
        out.push({ method: 'CD', body: (show) => this.bodyCD(G, show) });
        break;
      case 'and':
      case 'iff':
        out.push({ method: 'DD', body: (show) => this.bodyDD(G, show) });
        break;
      case 'or':
        out.push({ method: 'DD', body: (show) => this.bodyOrByAdd(G, show) });
        break;
      default:
        break;
    }
    // Anything can be shown indirectly — the complete last resort.
    out.push({ method: 'ID', body: (show) => this.bodyID(G, show) });
    return out;
  }

  proveGoal(G: Formula, allowNested = false): number | null {
    for (const s of this.strategies(G)) {
      const r = this.box(G, s.method, s.body, allowNested);
      if (r !== null) return r;
    }
    return null;
  }

  /** DD: saturate and see whether G can be assembled directly. */
  bodyDDQuick(G: Formula, show: number): number[] | null {
    this.saturate();
    const l = this.obtainInline(G);
    return l === null ? null : [this.ensureIn(l, show)];
  }

  /** Disjunction goal: if one disjunct follows (truth table), prove it and use ADD. */
  bodyOrByAdd(G: Extract<Formula, { kind: "or" }>, _show: number): number[] | null {
    const fs = this.avail.map((a) => a.f);
    for (const part of [G.left, G.right]) {
      if (entails(fs, part, 10) !== true) continue;
      const snap = this.snapshot();
      this.saturate();
      const l = this.obtain(part);
      if (l !== null) return [this.step(G, 'ADD', [l])];
      this.restore(snap);
    }
    return null;
  }

  /** DD for conjunctions / biconditionals (or anything, via a nested Show). */
  bodyDD(G: Formula, show: number, allowNestedSame = false): number[] | null {
    this.saturate();
    let l: number | null = null;
    if (G.kind === 'and') {
      const a = this.obtain(G.left);
      const b = a === null ? null : this.obtain(G.right);
      if (a !== null && b !== null) l = this.step(G, 'ADJ', [a, b]);
    } else if (G.kind === 'iff') {
      const a = this.obtain(Implies(G.left, G.right));
      const b = a === null ? null : this.obtain(Implies(G.right, G.left));
      if (a !== null && b !== null) l = this.step(G, 'CB', [a, b]);
    } else {
      l = this.obtainInline(G) ?? this.proveGoal(G, allowNestedSame);
    }
    return l === null ? null : [this.ensureIn(l, show)];
  }

  /** CD body; emits the assumption unless `asm` is given. */
  bodyCD(G: Extract<Formula, { kind: 'implies' }>, show: number, asm?: number): number[] | null {
    if (asm === undefined) this.assume(G.left, 'CD');
    this.saturate();
    const b = this.obtain(G.right);
    return b === null ? null : [this.ensureIn(b, show)];
  }

  /** ID body; emits the assumption unless `asm` is given. */
  bodyID(G: Formula, show: number, asm?: number): number[] | null {
    if (asm === undefined) this.assume(Prover.idAssumption(G), 'ID');
    const pair = this.refute();
    return pair === null ? null : [this.ensureIn(pair[0], show), this.ensureIn(pair[1], show)];
  }

  /** Cheap goal-directed attempt: build X for some available ¬X. */
  private cheapContradiction(): Pair | null {
    for (const a of [...this.avail]) {
      if (a.f.kind !== 'not') continue;
      const X = a.f.operand;
      if (X.kind === 'atom') continue;
      const l = this.obtainInline(X, 2);
      if (l !== null) return [l, a.n];
    }
    return null;
  }

  private candidates(): Formula[] {
    const out: Formula[] = [];
    const seen = new Set<string>();
    const push = (x: Formula) => {
      const k = fmt(x);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(x);
      }
    };
    for (const { f } of this.avail) {
      if (f.kind === 'or' && !this.truthy(f.left) && !this.truthy(f.right)) push(f.left);
      else if (f.kind === 'implies' && !this.falsy(f.left) && !this.truthy(f.right)) push(f.left);
      else if (f.kind === 'not' && f.operand.kind === 'and' && !this.falsy(f.operand.left) && !this.falsy(f.operand.right))
        push(f.operand.left);
      else if (
        f.kind === 'not' &&
        f.operand.kind === 'iff' &&
        ![f.operand.left, f.operand.right].some((x) => this.truthy(x) || this.falsy(x))
      )
        push(f.operand.left);
    }
    return out;
  }

  private refuteShallow(): Pair | null {
    this.saturate();
    return this.contradiction() ?? this.cheapContradiction();
  }

  /** Derive a contradiction from what's available (inside an ID box). */
  refute(level = 0): Pair | null {
    if (level > 40) return null;
    for (let iter = 0; iter < 200; iter++) {
      this.saturate();
      const c = this.contradiction() ?? this.cheapContradiction();
      if (c) return c;
      const cands = this.candidates();
      if (cands.length === 0) return null;
      let progressed = false;
      for (const A of cands) {
        const snap = this.snapshot();
        const r = this.showID(Not(A), () => this.refuteShallow());
        if (r !== null) {
          progressed = true;
          break;
        }
        this.restore(snap);
      }
      if (progressed) continue;
      let r: number | null = null;
      for (const A of cands) {
        r = this.showID(Not(A), () => this.refute(level + 1));
        if (r !== null) break;
      }
      if (r === null) return null;
    }
    return null;
  }

  // ---------------------------------------------------------------- output

  static isBudget(e: unknown): boolean {
    return e instanceof Budget;
  }
}

/**
 * Remove lines not needed by `roots` (0-based indices) and renumber. Lines
 * with index < keepPrefix are always kept.
 */
export function prune(lines: DraftLine[], roots: number[], keepPrefix = 0): { lines: DraftLine[]; map: number[] } {
  const needed = new Uint8Array(lines.length);
  const work: number[] = [];
  const mark = (i: number) => {
    if (i >= 0 && i < lines.length && !needed[i]) {
      needed[i] = 1;
      work.push(i);
    }
  };
  for (let i = 0; i < keepPrefix; i++) mark(i);
  roots.forEach(mark);
  while (work.length) {
    const i = work.pop()!;
    const l = lines[i];
    l.refs?.forEach((r) => mark(r - 1));
    if (l.kind === 'show' && l.close) {
      l.close.refs.forEach((r) => mark(r - 1));
      const next = lines[i + 1];
      if (next && next.kind === 'assumption' && next.depth === l.depth + 1) mark(i + 1);
    }
  }
  const map: number[] = new Array(lines.length).fill(-1);
  const out: DraftLine[] = [];
  lines.forEach((l, i) => {
    if (needed[i]) {
      map[i] = out.length + 1;
      out.push(l);
    }
  });
  const re = (r: number) => map[r - 1];
  return {
    lines: out.map((l) => ({
      ...l,
      ...(l.refs ? { refs: l.refs.map(re) } : {}),
      ...(l.close ? { close: { method: l.close.method, refs: l.close.refs.map(re) } } : {}),
    })),
    map,
  };
}

export { And, Iff, Or, eq };
