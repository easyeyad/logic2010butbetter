/**
 * Pure editing operations on the draft's line list (UI state only — no logic
 * checking here; that's the proof engine's job). Line references are 1-based
 * line numbers, so structural edits renumber refs to keep them pointing at
 * the same lines.
 */
import type { CloseMethod, DraftLine } from '../../../proof';

let seq = 0;
export function makeId(): string {
  seq += 1;
  return `l${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function blankLine(depth: number, patch: Partial<DraftLine> = {}): DraftLine {
  return { id: makeId(), kind: 'step', text: '', depth, ...patch };
}

/** Apply a renumbering to every ref in the draft; `map` returns null to drop a ref. */
export function renumber(lines: DraftLine[], map: (n: number) => number | null): DraftLine[] {
  const fix = (refs: number[] | undefined) => {
    if (!refs) return refs;
    const out: number[] = [];
    for (const r of refs) {
      const m = map(r);
      if (m != null) out.push(m);
    }
    return out;
  };
  return lines.map((l) => {
    const refs = fix(l.refs);
    const close = l.close ? { ...l.close, refs: fix(l.close.refs) ?? [] } : l.close;
    if (refs === l.refs && close === l.close) return l;
    return { ...l, refs, close };
  });
}

/**
 * The first line before `ref` whose depth is < d, if it's the show that owns a
 * depth-d box (i.e. a show at depth d-1). -1 otherwise.
 */
function ownerOf(lines: DraftLine[], ref: number, d: number): number {
  for (let j = ref - 1; j >= 0; j--) {
    if (lines[j].depth < d) return lines[j].kind === 'show' && lines[j].depth === d - 1 ? j : -1;
  }
  return -1;
}

/** Depth a new line inserted after index `i` should get. */
export function depthAfter(lines: DraftLine[], i: number): number {
  if (i < 0 || i >= lines.length) return 0;
  const line = lines[i];
  if (line.kind === 'show' && !line.close) return line.depth + 1;
  let d = line.depth;
  let ref = i;
  while (d > 0) {
    const j = ownerOf(lines, ref, d);
    if (j < 0 || !lines[j].close) break;
    d = lines[j].depth;
    ref = j;
  }
  return d;
}

/** Index of the innermost still-open show whose box contains line i, or -1. */
export function containingOpenShow(lines: DraftLine[], i: number): number {
  if (i < 0 || i >= lines.length) return -1;
  let d = lines[i].depth;
  let ref = i;
  while (d > 0) {
    const j = ownerOf(lines, ref, d);
    if (j < 0) return -1;
    if (!lines[j].close) return j;
    d = lines[j].depth;
    ref = j;
  }
  return -1;
}

/** Innermost open show anywhere (scanning from the end). */
export function lastOpenShow(lines: DraftLine[]): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].kind === 'show' && !lines[i].close) {
      // Only if it's not nested inside an already-closed box.
      return i;
    }
  }
  return -1;
}

/** Insert `line` after index `after` (-1 = at the top). Returns new lines and the new index. */
export function insertLine(lines: DraftLine[], after: number, line: DraftLine): { lines: DraftLine[]; index: number } {
  const index = after + 1;
  const newNumber = index + 1; // 1-based number of the inserted line
  const shifted = renumber(lines, (n) => (n >= newNumber ? n + 1 : n));
  const out = [...shifted.slice(0, index), line, ...shifted.slice(index)];
  return { lines: out, index };
}

export function deleteLine(lines: DraftLine[], index: number): DraftLine[] {
  const num = index + 1;
  const rest = [...lines.slice(0, index), ...lines.slice(index + 1)];
  return renumber(rest, (n) => (n === num ? null : n > num ? n - 1 : n));
}

/** Swap line `index` with its neighbour in direction `dir`. */
export function moveLine(lines: DraftLine[], index: number, dir: -1 | 1): { lines: DraftLine[]; index: number } {
  const other = index + dir;
  if (other < 0 || other >= lines.length) return { lines, index };
  const a = index + 1;
  const b = other + 1;
  const out = [...lines];
  [out[index], out[other]] = [out[other], out[index]];
  return { lines: renumber(out, (n) => (n === a ? b : n === b ? a : n)), index: other };
}

export function maxDepthAt(lines: DraftLine[], index: number): number {
  if (index <= 0) return 0;
  const prev = lines[index - 1];
  return prev.depth + (prev.kind === 'show' ? 1 : 0);
}

export function shiftDepth(lines: DraftLine[], index: number, delta: -1 | 1): DraftLine[] {
  const line = lines[index];
  if (!line) return lines;
  const next = Math.max(0, Math.min(maxDepthAt(lines, index), line.depth + delta));
  if (next === line.depth) return lines;
  return updateLine(lines, index, { depth: next });
}

export function updateLine(lines: DraftLine[], index: number, patch: Partial<DraftLine>): DraftLine[] {
  if (!lines[index]) return lines;
  const out = [...lines];
  out[index] = { ...out[index], ...patch };
  return out;
}

export function closeShow(lines: DraftLine[], index: number, method: CloseMethod, refs: number[]): DraftLine[] {
  return updateLine(lines, index, { close: { method, refs } });
}

export function reopenShow(lines: DraftLine[], index: number): DraftLine[] {
  return updateLine(lines, index, { close: undefined });
}

/** Parse "1,2" / "1 2" / "1.2" into numbers; null if anything else is present. */
export function parseRefs(text: string): number[] | null {
  const t = text.trim();
  if (t === '') return [];
  const parts = t.split(/[\s,.;]+/).filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    out.push(Number(p));
  }
  return out;
}

export function formatRefs(refs: number[] | undefined): string {
  return refs && refs.length ? refs.join(', ') : '';
}

export function sameRefs(a: number[] | undefined, b: number[] | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** Starting lines for a problem: premises, then "Show goal" with an empty line inside. */
export function linesForProblem(premises: string[], goal: string): DraftLine[] {
  const lines: DraftLine[] = premises
    .filter((p) => p.trim() !== '')
    .map((p) => ({ id: makeId(), kind: 'premise' as const, text: p, depth: 0 }));
  lines.push({ id: makeId(), kind: 'show', text: goal, depth: 0 });
  lines.push(blankLine(1));
  return lines;
}

export interface RailInfo {
  /** Index of the show line owning this box level (-1 if malformed). */
  owner: number;
  closed: boolean;
  start: boolean;
  end: boolean;
}

/** Per-line box rails (one per depth level) for drawing nested boxes. */
export function layoutRails(lines: DraftLine[]): RailInfo[][] {
  const stack: number[] = [];
  const owners: number[][] = [];
  lines.forEach((l, i) => {
    const own: number[] = [];
    for (let k = 0; k < l.depth; k++) own.push(stack[k] ?? -1);
    owners.push(own);
    stack.length = Math.min(stack.length, l.depth);
    if (l.kind === 'show') stack[l.depth] = i;
  });
  return owners.map((own, i) =>
    own.map((owner, k) => {
      const prevOwn = i > 0 ? owners[i - 1][k] : undefined;
      const nextOwn = i + 1 < owners.length ? owners[i + 1][k] : undefined;
      return {
        owner,
        closed: owner >= 0 ? Boolean(lines[owner].close) : false,
        start: prevOwn !== owner || i === 0,
        end: nextOwn !== owner,
      };
    }),
  );
}

/** Justification key used by the rule picker. */
export type JustKey = string; // RuleId | 'PR' | 'ASS CD' | 'ASS ID' | ''

export function justKeyOf(line: DraftLine): JustKey {
  if (line.kind === 'premise') return 'PR';
  if (line.kind === 'assumption') return `ASS ${line.assumption ?? 'CD'}`;
  if (line.kind === 'step') return line.rule ?? '';
  return '';
}

export function applyJustKey(line: DraftLine, key: JustKey): Partial<DraftLine> {
  if (key === 'PR') return { kind: 'premise', rule: undefined, refs: undefined, assumption: undefined };
  if (key === 'ASS CD' || key === 'ASS ID')
    return { kind: 'assumption', assumption: key === 'ASS CD' ? 'CD' : 'ID', rule: undefined, refs: undefined };
  if (key === '') return { kind: 'step', rule: undefined, assumption: undefined };
  return { kind: 'step', rule: key as DraftLine['rule'], assumption: undefined, refs: line.refs ?? [] };
}

/** Stable string signature of the draft content (for change detection). */
export function signature(lines: DraftLine[]): string {
  return JSON.stringify(lines.map((l) => [l.kind, l.text, l.depth, l.rule, l.refs, l.assumption, l.close]));
}

/** A line the student hasn't started: empty step with no rule or refs. */
export function isBlank(line: DraftLine): boolean {
  return line.kind === 'step' && line.text.trim() === '' && !line.rule && !(line.refs && line.refs.length);
}

/**
 * Drop trailing blank lines before sending the draft to the engine: the
 * editor keeps an empty "next line" ready, which isn't a mistake. Numbering of
 * the remaining lines is unaffected.
 */
export function trimTrailingBlank(lines: DraftLine[]): DraftLine[] {
  let end = lines.length;
  while (end > 0 && isBlank(lines[end - 1])) end--;
  return end === lines.length ? lines : lines.slice(0, end);
}

/**
 * Close show line `idx` and pick where to continue: the line after the box,
 * a blank line at the end of the box moved out to the outer level, or a new
 * blank line.
 */
export function closeAndContinue(
  lines: DraftLine[],
  idx: number,
  method: CloseMethod,
  refs: number[],
): { lines: DraftLine[]; focusId: string } {
  const show = lines[idx];
  let out = closeShow(lines, idx, method, refs);
  let end = idx + 1;
  while (end < out.length && out[end].depth > show.depth) end++;
  if (end < out.length) return { lines: out, focusId: out[end].id };
  const depth = depthAfter(out, idx);
  const last = out.length - 1;
  if (last > idx && isBlank(out[last])) {
    out = updateLine(out, last, { depth });
    return { lines: out, focusId: out[last].id };
  }
  const fresh = blankLine(depth);
  return { lines: [...out, fresh], focusId: fresh.id };
}
